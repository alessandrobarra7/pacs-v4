import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
const __dirname_env = path.dirname(fileURLToPath(import.meta.url));
// Carrega .env com override:true para garantir que variáveis sejam lidas mesmo
// quando o PM2 já injetou valores vazios de sessões anteriores.
// Tenta múltiplos caminhos para cobrir execução via dist/ e via cwd.
const envPaths = [
  path.resolve(__dirname_env, ".env"),       // dist/.env
  path.resolve(__dirname_env, "../.env"),    // raiz do projeto (dist/../.env)
  path.resolve(process.cwd(), ".env"),       // cwd/.env
  "/opt/pacs-portal/.env",                   // caminho absoluto na VM1
];
for (const envPath of envPaths) {
  const result = config({ path: envPath, override: true });
  if (!result.error) {
    console.log(`[dotenv] Loaded ${Object.keys(result.parsed ?? {}).length} vars from ${envPath}`);
    break;
  }
}
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

// CRÍTICO 3: Rate limiting para prevenir brute force no login
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máximo de 10 tentativas por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  skipSuccessfulRequests: true, // não conta tentativas bem-sucedidas
});

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Configurar trust proxy para funcionar corretamente com Nginx como reverse proxy
  // Isso permite que req.ip retorne o IP real do cliente via X-Forwarded-For
  app.set('trust proxy', 1);

  // MELHORIA: Headers de segurança HTTP com helmet.js
  app.use(helmet({
    contentSecurityPolicy: false, // desativado para compatibilidade com OHIF/Cornerstone
    crossOriginEmbedderPolicy: false,
  }));

  // MELHORIA: CORS explícito para origens permitidas
  const allowedOrigins = [
    'https://lauds.com.br',
    'http://localhost:3000',
    'http://localhost:5173',
  ];
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  const DICOM_CACHE_ROOT = '/tmp/dicom-cache';

  // Limpeza automática de caches com mais de 30 minutos de inatividade
  async function cleanOldDicomCaches() {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const entries = await fs.readdir(DICOM_CACHE_ROOT, { withFileTypes: true }).catch(() => []);
      const now = Date.now();
      const THIRTY_MINUTES = 30 * 60 * 1000;
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirPath = path.join(DICOM_CACHE_ROOT, entry.name);
        const stat = await fs.stat(dirPath).catch(() => null);
        // Usa atime (último acesso) para medir inatividade real
        const lastAccess = stat ? Math.max(stat.mtimeMs, stat.atimeMs) : 0;
        if (stat && now - lastAccess > THIRTY_MINUTES) {
          await fs.rm(dirPath, { recursive: true, force: true });
          console.log(`[DICOM Cache] Limpeza automática: ${entry.name} (>30min inativo)`);
        }
      }
    } catch {}
  }
  setInterval(cleanOldDicomCaches, 5 * 60 * 1000); // verifica a cada 5 minutos

  // F1-1: Middleware de autenticação para rotas DICOM
  // Verifica o cookie de sessão e retorna 401 se não autenticado
  async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: 'Não autenticado' });
      (req as any).dicomUser = ctx.user;
      next();
    } catch {
      return res.status(401).json({ error: 'Não autenticado' });
    }
  }

  // F1-2: Middleware de autenticação admin_master para rotas administrativas DICOM
  async function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: 'Não autenticado' });
      if (ctx.user.role !== 'admin_master') return res.status(403).json({ error: 'Acesso restrito a administradores' });
      (req as any).dicomUser = ctx.user;
      next();
    } catch {
      return res.status(401).json({ error: 'Não autenticado' });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // STATUS DO CACHE— verifica se um estudo já está baixado no servidor
  // Usado pela listagem para manter o botão verde ao voltar do viewer
  // ─────────────────────────────────────────────────────────────────────────────
  app.get('/api/dicom-cache-status/:studyUid', requireAuth, async (req, res) => {
    const { studyUid } = req.params;
    if (!studyUid || studyUid.includes('..') || studyUid.includes('/')) {
      return res.status(400).json({ cached: false, count: 0 });
    }
    const studyCacheDir = `${DICOM_CACHE_ROOT}/${studyUid}`;
    try {
      const fs = await import('fs/promises');
      const files = await fs.readdir(studyCacheDir);
      const dcmFiles = files.filter((f: string) => f.endsWith('.dcm'));
      // Atualiza o atime do diretório para resetar o timer de inatividade
      await fs.utimes(studyCacheDir, new Date(), new Date()).catch(() => {});
      return res.json({ cached: dcmFiles.length > 0, count: dcmFiles.length });
    } catch {
      return res.json({ cached: false, count: 0 });
    }
  });

  // Serve DICOM files from cache
  app.get('/api/dicom-files/:studyUid/:filename', requireAuth, (req, res) => {
    const { studyUid, filename } = req.params;
    if (filename.includes('..') || filename.includes('/') || studyUid.includes('..') || studyUid.includes('/')) {
      return res.status(400).send('Invalid path');
    }
    const filePath = `${DICOM_CACHE_ROOT}/${studyUid}/${filename}`;
    res.sendFile(filePath, (err) => {
      if (err) {
        res.status(404).send('File not found');
      }
    });
  });

  // Lista arquivos DICOM de um estudo no cache + extrai metadados do primeiro arquivo
  app.get('/api/dicom-files/:studyUid', requireAuth, async (req, res) => {
    const { studyUid } = req.params;
    if (studyUid.includes('..') || studyUid.includes('/')) {
      return res.status(400).json({ success: false, error: 'Invalid studyUid' });
    }
    const studyDir = `${DICOM_CACHE_ROOT}/${studyUid}`;
    try {
      const fs = await import('fs/promises');
      const files = await fs.readdir(studyDir);
      const dicomFiles = files.filter(f => f.endsWith('.dcm')).sort();
      console.log(`[DICOM Cache] Listagem: ${studyUid} → ${dicomFiles.length} arquivos`);

      // Extrai metadados DICOM do primeiro arquivo (sem dependência externa)
      let metadata: Record<string, string> = {};
      if (dicomFiles.length > 0) {
        try {
          const buf = await fs.readFile(`${studyDir}/${dicomFiles[0]}`);
          // Leitura de tags DICOM little-endian (pula 132 bytes de preamble)
          const readTag = (group: number, element: number): string => {
            let offset = 132;
            while (offset < buf.length - 8) {
              const g = buf.readUInt16LE(offset);
              const e = buf.readUInt16LE(offset + 2);
              const vr = buf.slice(offset + 4, offset + 6).toString('ascii');
              let len: number, dataOffset: number;
              if (['OB','OW','OF','SQ','UC','UN','UR','UT'].includes(vr)) {
                len = buf.readUInt32LE(offset + 8); dataOffset = offset + 12;
              } else if (vr.charCodeAt(0) >= 65 && vr.charCodeAt(0) <= 90) {
                len = buf.readUInt16LE(offset + 6); dataOffset = offset + 8;
              } else {
                len = buf.readUInt32LE(offset + 4); dataOffset = offset + 8;
              }
              if (len === 0xFFFFFFFF || len < 0) { offset += 8; continue; }
              if (g === group && e === element && dataOffset + len <= buf.length) {
                return buf.slice(dataOffset, dataOffset + len).toString('utf8').replace(/\x00/g, '').trim();
              }
              offset = dataOffset + (len > 0 ? len : 0);
              if (offset <= 0) break;
            }
            return '';
          };
          metadata = {
            patientName:      readTag(0x0010, 0x0010).replace(/\^+/g, ' ').replace(/\s+/g, ' ').trim(),
            patientID:        readTag(0x0010, 0x0020),
            studyDate:        readTag(0x0008, 0x0020),
            modality:         readTag(0x0008, 0x0060),
            studyDescription: readTag(0x0008, 0x1030),
            patientBirthDate: readTag(0x0010, 0x0030),
            patientSex:       readTag(0x0010, 0x0040),
            accessionNumber:  readTag(0x0008, 0x0050),
          };
          console.log(`[DICOM Cache] Metadados: ${metadata.patientName} | ${metadata.studyDate} | ${metadata.modality}`);
        } catch (metaErr) {
          console.warn('[DICOM Cache] Falha ao ler metadados DICOM:', metaErr);
        }
      }
      res.json({ success: true, studyUid, files: dicomFiles, count: dicomFiles.length, metadata });
    } catch {
      res.status(404).json({ success: false, error: 'Estudo não encontrado no cache. Execute o C-MOVE novamente.' });
    }
  });

  // Remove cache DICOM ao fechar o viewer
  app.delete('/api/dicom-files/:studyUid', requireAuth, async (req, res) => {
    const { studyUid } = req.params;
    if (studyUid.includes('..') || studyUid.includes('/')) {
      return res.status(400).json({ success: false, error: 'Invalid studyUid' });
    }
    const studyDir = `${DICOM_CACHE_ROOT}/${studyUid}`;
    try {
      const fs = await import('fs/promises');
      await fs.rm(studyDir, { recursive: true, force: true });
      console.log(`[DICOM Cache] Removido ao fechar viewer: ${studyUid}`);
      res.json({ success: true });
    } catch {
      res.json({ success: true });
    }
  });

  // Lista séries DICOM de um estudo agrupadas por SeriesInstanceUID
  // Retorna: { series: [{ seriesUid, description, modality, files: string[], thumbnail: string }] }
  app.get('/api/dicom-series/:studyUid', requireAuth, async (req, res) => {
    const { studyUid } = req.params;
    if (studyUid.includes('..') || studyUid.includes('/')) {
      return res.status(400).json({ success: false, error: 'Invalid studyUid' });
    }
    const studyDir = `${DICOM_CACHE_ROOT}/${studyUid}`;
    try {
      const fs = await import('fs/promises');
      const allFiles = await fs.readdir(studyDir);
      const dicomFiles = allFiles.filter(f => f.endsWith('.dcm')).sort();
      if (dicomFiles.length === 0) {
        return res.json({ success: true, series: [] });
      }

      // Agrupa arquivos por SeriesInstanceUID lendo tag DICOM (0020,000E)
      const readTag = (buf: Buffer, group: number, element: number): string => {
        let offset = 132;
        while (offset < buf.length - 8) {
          const g = buf.readUInt16LE(offset);
          const e = buf.readUInt16LE(offset + 2);
          const vr = buf.slice(offset + 4, offset + 6).toString('ascii');
          let len: number, dataOffset: number;
          if (['OB','OW','OF','SQ','UC','UN','UR','UT'].includes(vr)) {
            len = buf.readUInt32LE(offset + 8); dataOffset = offset + 12;
          } else if (vr.charCodeAt(0) >= 65 && vr.charCodeAt(0) <= 90) {
            len = buf.readUInt16LE(offset + 6); dataOffset = offset + 8;
          } else {
            len = buf.readUInt32LE(offset + 4); dataOffset = offset + 8;
          }
          if (len === 0xFFFFFFFF || len < 0) { offset += 8; continue; }
          if (g === group && e === element && dataOffset + len <= buf.length) {
            return buf.slice(dataOffset, dataOffset + len).toString('utf8').replace(/\x00/g, '').trim();
          }
          offset = dataOffset + (len > 0 ? len : 0);
          if (offset <= 0) break;
        }
        return '';
      };

      // Mapeia seriesUid → { files, description, modality, instanceNumber }
      const seriesMap = new Map<string, { files: string[]; description: string; modality: string; seriesNumber: string }>();

      for (const file of dicomFiles) {
        try {
          const buf = await fs.readFile(`${studyDir}/${file}`);
          const seriesUid = readTag(buf, 0x0020, 0x000E) || 'unknown';
          const seriesDesc = readTag(buf, 0x0008, 0x103E) || readTag(buf, 0x0008, 0x1030) || '';
          const modality = readTag(buf, 0x0008, 0x0060) || '';
          const seriesNumber = readTag(buf, 0x0020, 0x0011) || '0';
          if (!seriesMap.has(seriesUid)) {
            seriesMap.set(seriesUid, { files: [], description: seriesDesc, modality, seriesNumber });
          }
          seriesMap.get(seriesUid)!.files.push(file);
        } catch { /* skip unreadable files */ }
      }

      const series = Array.from(seriesMap.entries())
        .sort((a, b) => parseInt(a[1].seriesNumber) - parseInt(b[1].seriesNumber))
        .map(([seriesUid, info]) => ({
          seriesUid,
          description: info.description,
          modality: info.modality,
          seriesNumber: info.seriesNumber,
          fileCount: info.files.length,
          files: info.files,
          // Primeiro arquivo da série como thumbnail
          thumbnail: info.files[0] ?? null,
        }));

      console.log(`[DICOM Series] ${studyUid} → ${series.length} série(s)`);
      res.json({ success: true, series });
    } catch {
      res.status(404).json({ success: false, error: 'Estudo não encontrado no cache.' });
    }
  });

  // ── Thumbnail DICOM ────────────────────────────────────────────────────────
  // Gera miniatura PNG 64x64 via script Python (pydicom) para leitura correta
  // de todos os formatos DICOM (MONOCHROME1/2, Window Center/Width como string, etc.)
  app.get('/api/dicom-thumbnail/:studyUid/:filename', requireAuth, async (req, res) => {
    const { studyUid, filename } = req.params;
    if (studyUid.includes('..') || studyUid.includes('/') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    const filePath = `${DICOM_CACHE_ROOT}/${studyUid}/${filename}`;
    try {
      const { spawn } = await import('child_process');
      // Em dev: import.meta.url aponta para server/_core/index.ts → sobe um nível
      // Em prod: dist/_core/index.js → dicom_thumbnail.py está em dist/ (copiado pelo build)
      const scriptPathDev = new URL('../dicom_thumbnail.py', import.meta.url).pathname;
      const scriptPathProd = new URL('./dicom_thumbnail.py', import.meta.url).pathname;
      const { existsSync: pyExists } = await import('fs');
      const scriptPath = pyExists(scriptPathDev) ? scriptPathDev : scriptPathProd;

      // Limpar PYTHONHOME/PYTHONPATH para evitar conflito com venv do sandbox
      const pyEnv = { ...process.env };
      delete pyEnv.PYTHONHOME;
      delete pyEnv.PYTHONPATH;

      // Usar python3.11 se disponível (tem pydicom instalado), senão python3
      const pythonBin = pyExists('/usr/bin/python3.11') ? '/usr/bin/python3.11' : '/usr/bin/python3';

      const pngBuf = await new Promise<Buffer>((resolve, reject) => {
        const py = spawn(pythonBin, [scriptPath, filePath], { env: pyEnv });
        const chunks: Buffer[] = [];
        py.stdout.on('data', (d: Buffer) => chunks.push(d));
        py.stderr.on('data', (d: Buffer) => {
          const msg = d.toString();
          if (!msg.includes('DeprecationWarning')) console.error('[DICOM Thumbnail]', msg);
        });
        py.on('close', (code: number) => {
          if (code === 0 && chunks.length > 0) {
            resolve(Buffer.concat(chunks));
          } else {
            reject(new Error(`Python exit ${code}`));
          }
        });
        py.on('error', reject);
        // timeout de 15s
        setTimeout(() => { py.kill(); reject(new Error('timeout')); }, 15000);
      });

      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(pngBuf);
    } catch (err) {
      console.error('[DICOM Thumbnail] Error:', err);
      return res.status(500).json({ error: 'Failed to generate thumbnail' });
    }
  });

  // DICOMweb Proxy - faz proxy das requisições para o Orthanc
  // Rota: /api/dicomweb/* → Orthanc /dicom-web/*
  // Usa o pacs_ip da unidade + porta 8042 (porta padrão HTTP do Orthanc)
  // O viewer passa o studyUid na URL; o proxy descobre a unidade pelo studyUid
  // ou usa a primeira unidade ativa como fallback.
  
  // F2-1: Cache por unidade para evitar query ao banco em cada requisição
  // Chave: unit_id (number) | 'fallback'; Valor: { url, timestamp }
  const orthancUrlCache = new Map<string, { url: string; ts: number }>();
  const CACHE_TTL_MS = 60_000; // 1 minuto

  async function getOrthancUrl(unitId?: number | null): Promise<string> {
    const cacheKey = unitId ? String(unitId) : 'fallback';
    const now = Date.now();
    const cached = orthancUrlCache.get(cacheKey);
    if (cached && (now - cached.ts) < CACHE_TTL_MS) {
      return cached.url;
    }
    try {
      const { getDb } = await import('../db');
      const { units } = await import('../../drizzle/schema');
      const { eq: eqDrizzle, and: andDrizzle } = await import('drizzle-orm');
      const db = await getDb();
      if (db) {
        // F2-1: Prioriza a unidade do usuário autenticado; fallback para qualquer unidade ativa
        const conditions = unitId
          ? andDrizzle(eqDrizzle(units.id, unitId), eqDrizzle(units.isActive, true))
          : eqDrizzle(units.isActive, true);
        const [unit] = await db.select().from(units).where(conditions).limit(1);
        if (unit?.pacs_ip) {
          const orthancPort = process.env.ORTHANC_HTTP_PORT || '8042';
          const url = `http://${unit.pacs_ip}:${orthancPort}`;
          orthancUrlCache.set(cacheKey, { url, ts: now });
          console.log(`[DICOMweb Proxy] Orthanc URL resolvida do banco (unit=${unitId ?? 'any'}): ${url}`);
          return url;
        }
      }
    } catch (e) {
      console.error('[DICOMweb Proxy] Erro ao buscar URL do Orthanc:', e);
    }
    // Fallback: variável de ambiente ou IP padrão
    const fallback = process.env.ORTHANC_BASE_URL || 'http://172.16.3.250:8042';
    console.log(`[DICOMweb Proxy] Usando fallback: ${fallback}`);
    return fallback;
  }
  
  // OPTIONS preflight para CORS — F1-7: restringir às origens permitidas (sem wildcard)
  app.options('/api/dicomweb/*', (req, res) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, multipart/related');
    res.status(204).send();
  });
  
  app.use('/api/dicomweb', requireAuth, async (req, res) => {
    try {
      // F2-1: Resolver Orthanc pela unidade do usuário autenticado
      const dicomUser = (req as any).dicomUser;
      const userUnitId: number | null = dicomUser?.unit_id ?? null;
      const orthancBaseUrl = await getOrthancUrl(userUnitId);
      
      // Constrói a URL de destino: /api/dicomweb/studies/... → http://172.16.3.241:8042/dicom-web/studies/...
      const targetPath = req.path;
      const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
      const targetUrl = `${orthancBaseUrl.replace(/\/$/, '')}/dicom-web${targetPath}${queryString}`;
      
      console.log(`[DICOMweb Proxy] ${req.method} ${targetUrl}`);
      
      // Monta headers para o Orthanc
      const forwardHeaders: Record<string, string> = {};
      const acceptHeader = req.headers['accept'];
      if (acceptHeader) forwardHeaders['Accept'] = acceptHeader;
      const contentTypeHeader = req.headers['content-type'];
      if (contentTypeHeader) forwardHeaders['Content-Type'] = contentTypeHeader;
      
      const fetchOptions: RequestInit = {
        method: req.method,
        headers: forwardHeaders,
        signal: AbortSignal.timeout(60_000), // 60s timeout para imagens grandes
      };
      
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        (fetchOptions as any).body = req.body ? JSON.stringify(req.body) : undefined;
      }
      
      const response = await fetch(targetUrl, fetchOptions);
      
      // Copia todos os headers relevantes da resposta do Orthanc — F1-7: sem wildcard
      const reqOrigin = req.headers.origin;
      if (reqOrigin && allowedOrigins.includes(reqOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', reqOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
      
      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      
      const contentLength = response.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      
      // Copia headers multipart se presentes (WADO-RS retorna multipart/related)
      const transferEncoding = response.headers.get('transfer-encoding');
      if (transferEncoding) res.setHeader('Transfer-Encoding', transferEncoding);
      
      res.status(response.status);
      
      // Stream a resposta diretamente para o cliente (eficiente para imagens grandes)
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
      
    } catch (error: any) {
      console.error('[DICOMweb Proxy] Erro:', error.message);
      if (!res.headersSent) {
        // F1-8: Não expor IP interno nem detalhes do erro ao cliente
        res.status(502).json({ error: 'DICOMweb Proxy Error' });
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // STREAMING PROGRESSIVO — SSE: envia evento a cada arquivo DICOM recebido
  // O browser pode renderizar a 1ª imagem assim que o 1º arquivo chegar
  // ─────────────────────────────────────────────────────────────────────────────
  app.get('/api/dicom-stream/:studyUid', async (req, res) => {
    const { studyUid } = req.params;
    if (!studyUid || studyUid.includes('..') || studyUid.includes('/')) {
      return res.status(400).json({ error: 'Invalid studyUid' });
    }

    // Autenticação: verifica cookie de sessão
    let user: any = null;
    try {
      const { createContext } = await import('./context');
      const ctx = await createContext({ req, res } as any);
      user = ctx.user;
    } catch {}
    if (!user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Configura SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // desativa buffer do nginx
    res.flushHeaders();

    const sendEvent = (event: string, data: object) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('status', { phase: 'connecting', message: 'Conectando ao PACS...' });

    try {
      // Busca configuração PACS da unidade do usuário
      const { getDb } = await import('../db');
      const { units } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) {
        sendEvent('error', { message: 'Database não disponível' });
        return res.end();
      }

      // admin_master pode passar unitId via query param; demais usuários usam sua própria unit_id
      const queryUnitId = req.query.unitId ? parseInt(req.query.unitId as string, 10) : null;
      const isAdminMaster = user.role === 'admin_master';
      const unitId = (isAdminMaster && queryUnitId) ? queryUnitId : user.unit_id;
      if (!unitId) {
        sendEvent('error', { message: 'Usuário sem unidade associada' });
        return res.end();
      }

      const [unit] = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
      if (!unit || !unit.pacs_ip || !unit.pacs_port || !unit.pacs_ae_title) {
        sendEvent('error', { message: 'PACS não configurado para esta unidade' });
        return res.end();
      }

      const studyCacheDir = `${DICOM_CACHE_ROOT}/${studyUid}`;

      // Verifica cache existente
      const fs = await import('fs/promises');
      const fsSync = await import('fs');
      try {
        const existing = await fs.readdir(studyCacheDir);
        const dcmFiles = existing.filter((f: string) => f.endsWith('.dcm')).sort();
        if (dcmFiles.length > 0) {
          sendEvent('status', { phase: 'cached', message: `Cache encontrado: ${dcmFiles.length} imagens`, total: dcmFiles.length, pacsAeTitle: unit.pacs_ae_title });
          for (const f of dcmFiles) {
            sendEvent('file', { filename: f, index: dcmFiles.indexOf(f) + 1, total: dcmFiles.length });
          }
          sendEvent('complete', { total: dcmFiles.length, fromCache: true });
          return res.end();
        }
      } catch {}

      // Inicia C-GET via Python com modo streaming (linha por linha)
      sendEvent('status', { phase: 'downloading', message: 'Iniciando C-GET...', pacsAeTitle: unit.pacs_ae_title });

      const { spawn } = await import('child_process');
      // dicom_move.py é copiado para dist/ pelo build (cp server/*.py dist/)
      // Usar new URL() igual ao startViewer para garantir compatibilidade em produção
      // Em dev: import.meta.url aponta para server/_core/index.ts → sobe um nível
      // Em prod: dist/_core/index.js → dicom_move.py está em dist/ (copiado pelo build)
      const scriptPathDev = new URL('../dicom_move.py', import.meta.url).pathname;
      const scriptPathProd = new URL('./dicom_move.py', import.meta.url).pathname;
      const { existsSync } = await import('fs');
      const scriptPath = existsSync(scriptPathDev) ? scriptPathDev : scriptPathProd;
      const cleanEnv = { ...process.env };
      delete cleanEnv.PYTHONHOME;
      delete cleanEnv.PYTHONPATH;

      const moveParams = JSON.stringify({
        pacs_ip: unit.pacs_ip,
        pacs_port: unit.pacs_port,
        pacs_ae_title: unit.pacs_ae_title,
        local_ae_title: unit.pacs_local_ae_title || 'LAUDS',
        study_instance_uid: studyUid,
        cache_dir: DICOM_CACHE_ROOT,
        streaming: true,  // modo streaming: emite JSON por linha a cada arquivo
      });

      const child = spawn('/usr/bin/python3.11', [scriptPath, moveParams], {
        env: cleanEnv,
        timeout: 600000,
      });

      let totalFiles = 0;
      let receivedFiles = 0;
      let stdoutBuffer = '';
      let completeSent = false;

      const sendComplete = (total: number) => {
        if (completeSent) return;
        completeSent = true;
        sendEvent('complete', { total, fromCache: false });
        if (!res.writableEnded) res.end();
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed);
            if (msg.type === 'file') {
              receivedFiles++;
              sendEvent('file', { filename: msg.filename, index: receivedFiles, total: msg.total || 0 });
            } else if (msg.type === 'total') {
              totalFiles = msg.total;
              sendEvent('status', { phase: 'downloading', message: `Baixando ${totalFiles} imagens...`, total: totalFiles });
            } else if (msg.type === 'complete') {
              // Trata o resultado final do Python imediatamente
              if (msg.success === false) {
                sendEvent('error', { message: msg.error || 'Erro no C-GET' });
                if (!res.writableEnded) res.end();
                completeSent = true; // evita enviar complete no close
              }
              // Se success=true, deixa o close verificar o cache e enviar sendComplete
            }
          } catch {
            // linha não é JSON (log de texto) — ignora
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        // logs do script — não enviamos ao cliente por segurança
        console.log(`[DICOM Stream] ${chunk.toString().trim()}`);
      });

      child.on('close', async (code: number) => {
        // Processa buffer restante
        if (stdoutBuffer.trim()) {
          try {
            const msg = JSON.parse(stdoutBuffer.trim());
            if (msg.success !== undefined) {
              if (!msg.success) {
                sendEvent('error', { message: msg.error || 'Erro no C-GET' });
                if (!res.writableEnded) res.end();
                return;
              }
            }
          } catch {}
        }
        // Verifica o cache para enviar o complete com contagem real
        try {
          const files = await fs.readdir(studyCacheDir);
          const count = files.filter((f: string) => f.endsWith('.dcm')).length;
          if (count > 0) sendComplete(count);
          else sendEvent('error', { message: 'Nenhuma imagem recebida do PACS' });
        } catch {
          // Se não conseguiu ler o cache mas recebeu arquivos, usa o contador local
          if (receivedFiles > 0) sendComplete(receivedFiles);
          else sendEvent('error', { message: 'Erro ao verificar cache após C-GET' });
        }
        if (!res.writableEnded) res.end();
      });

      child.on('error', (err: Error) => {
        sendEvent('error', { message: `Erro ao executar C-GET: ${err.message}` });
        res.end();
      });

      // Quando o cliente desconecta, mata o processo Python
      req.on('close', () => {
        try { child.kill('SIGTERM'); } catch {}
      });

    } catch (err: any) {
      sendEvent('error', { message: err.message || 'Erro interno' });
      res.end();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EXPORTAÇÃO ZIP — baixa todos os arquivos DICOM do cache como .zip
  // Para abrir em RadiAnt, OsiriX, Horos, etc.
  // ─────────────────────────────────────────────────────────────────────────────
  app.get('/api/dicom-export/:studyUid', requireAuth, async (req, res) => {
    const { studyUid } = req.params;
    if (!studyUid || studyUid.includes('..') || studyUid.includes('/')) {
      return res.status(400).json({ error: 'Invalid studyUid' });
    }

    const studyCacheDir = `${DICOM_CACHE_ROOT}/${studyUid}`;
    try {
      const fs = await import('fs/promises');
      const fsSync = await import('fs');
      const path = await import('path');
      const { createGzip } = await import('zlib');
      const { Readable, PassThrough } = await import('stream');

      const files = await fs.readdir(studyCacheDir);
      const dicomFiles = files.filter((f: string) => f.endsWith('.dcm')).sort();

      if (dicomFiles.length === 0) {
        return res.status(404).json({ error: 'Nenhuma imagem no cache. Abra o visualizador primeiro.' });
      }

      // Usa archiver para criar ZIP em streaming
      const archiver = (await import('archiver')).default;
      const archive = archiver('zip', { zlib: { level: 1 } }); // level 1 = rápido (DICOM já é comprimido)

      const patientName = studyUid.slice(0, 20);
      const filename = `DICOM_${patientName}_${Date.now()}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Accel-Buffering', 'no');

      archive.pipe(res);

      for (const f of dicomFiles) {
        const filePath = path.join(studyCacheDir, f);
        archive.file(filePath, { name: f });
      }

      await archive.finalize();
      console.log(`[DICOM Export] ZIP gerado: ${dicomFiles.length} arquivos para ${studyUid}`);

    } catch (err: any) {
      console.error('[DICOM Export] Erro:', err);
      if (!res.headersSent) {
        // F3-4: Sem detalhes internos na resposta
        res.status(500).json({ error: 'Erro ao gerar arquivo ZIP' });
      }
    }
  });

  // Endpoint: informações gerais do cache DICOM (tamanho total, estudos, etc.) — restrito a admin_master
  app.get('/api/dicom-cache-info', requireAdminAuth, async (_req, res) => {
    try {
      if (!fs.existsSync(DICOM_CACHE_ROOT)) {
        return res.json({ totalSizeBytes: 0, totalSizeMB: 0, studyCount: 0, studies: [] });
      }
      const studies = fs.readdirSync(DICOM_CACHE_ROOT).filter(d => {
        try { return fs.statSync(path.join(DICOM_CACHE_ROOT, d)).isDirectory(); } catch { return false; }
      });
      let totalSizeBytes = 0;
      const studyInfos: { uid: string; sizeBytes: number; sizeMB: number; fileCount: number; lastAccess: number }[] = [];
      for (const uid of studies) {
        const studyDir = path.join(DICOM_CACHE_ROOT, uid);
        try {
          const files = fs.readdirSync(studyDir).filter(f => f.endsWith('.dcm'));
          let studySize = 0;
          let lastAccess = 0;
          for (const f of files) {
            const stat = fs.statSync(path.join(studyDir, f));
            studySize += stat.size;
            if (stat.atimeMs > lastAccess) lastAccess = stat.atimeMs;
          }
          totalSizeBytes += studySize;
          studyInfos.push({ uid, sizeBytes: studySize, sizeMB: Math.round(studySize / 1024 / 1024 * 10) / 10, fileCount: files.length, lastAccess });
        } catch {}
      }
      res.json({
        totalSizeBytes,
        totalSizeMB: Math.round(totalSizeBytes / 1024 / 1024 * 10) / 10,
        studyCount: studyInfos.length,
        studies: studyInfos.sort((a, b) => b.lastAccess - a.lastAccess),
      });
    } catch (err: any) {
      console.error('[DICOM Cache Info] Erro:', err);
      // F3-4: Sem detalhes internos na resposta
      res.status(500).json({ error: 'Erro ao consultar cache DICOM' });
    }
  });
  // Endpoint: limpar todo o cache DICOM manualmentee — restrito a admin_master
  app.delete('/api/dicom-cache-clear', requireAdminAuth, async (_req, res) => {
    try {
      if (!fs.existsSync(DICOM_CACHE_ROOT)) {
        return res.json({ success: true, removed: 0 });
      }
      const studies = fs.readdirSync(DICOM_CACHE_ROOT).filter(d => {
        try { return fs.statSync(path.join(DICOM_CACHE_ROOT, d)).isDirectory(); } catch { return false; }
      });
      let removed = 0;
      for (const uid of studies) {
        try {
          fs.rmSync(path.join(DICOM_CACHE_ROOT, uid), { recursive: true, force: true });
          removed++;
          console.log(`[DICOM Cache] Limpo manualmente: ${uid}`);
        } catch {}
      }
      res.json({ success: true, removed });
     } catch (err: any) {
      console.error('[DICOM Cache Clear] Erro:', err);
      // F3-4: Sem detalhes internos na resposta
      res.status(500).json({ error: 'Erro ao limpar cache DICOM' });
    }
  });
  // CRÍTICO 3: Rate limiting aplicado especificamente na rota de login
  app.use('/api/trpc/auth.login', loginRateLimiter);

  // ── Arquivos estáticos de upload (logos, carimbos, assinaturas) ─────────
  // Servidos diretamente da pasta local /uploads na VM1.
  // Simples, rápido e sem dependência de serviços externos.
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir, {
    maxAge: '1d',
    etag: true,
  }));

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
