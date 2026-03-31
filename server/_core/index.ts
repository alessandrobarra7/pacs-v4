import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
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

  // Limpeza automática de caches com mais de 2 horas (evita acúmulo em disco)
  async function cleanOldDicomCaches() {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const entries = await fs.readdir(DICOM_CACHE_ROOT, { withFileTypes: true }).catch(() => []);
      const now = Date.now();
      const TWO_HOURS = 2 * 60 * 60 * 1000;
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirPath = path.join(DICOM_CACHE_ROOT, entry.name);
        const stat = await fs.stat(dirPath).catch(() => null);
        if (stat && now - stat.mtimeMs > TWO_HOURS) {
          await fs.rm(dirPath, { recursive: true, force: true });
          console.log(`[DICOM Cache] Limpeza automática: ${entry.name} (>2h)`);
        }
      }
    } catch {}
  }
  setInterval(cleanOldDicomCaches, 30 * 60 * 1000); // a cada 30 minutos

  // Serve DICOM files from cache
  app.get('/api/dicom-files/:studyUid/:filename', (req, res) => {
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
  app.get('/api/dicom-files/:studyUid', async (req, res) => {
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
  app.delete('/api/dicom-files/:studyUid', async (req, res) => {
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

  // DICOMweb Proxy - faz proxy das requisições para o Orthanc
  // Rota: /api/dicomweb/* → Orthanc /dicom-web/*
  // Usa o pacs_ip da unidade + porta 8042 (porta padrão HTTP do Orthanc)
  // O viewer passa o studyUid na URL; o proxy descobre a unidade pelo studyUid
  // ou usa a primeira unidade ativa como fallback.
  
  // Cache da URL do Orthanc para evitar query ao banco em cada requisição
  let cachedOrthancUrl: string | null = null;
  let cacheTimestamp = 0;
  const CACHE_TTL_MS = 60_000; // 1 minuto
  
  async function getOrthancUrl(studyUid?: string): Promise<string> {
    const now = Date.now();
    if (cachedOrthancUrl && (now - cacheTimestamp) < CACHE_TTL_MS) {
      return cachedOrthancUrl;
    }
    try {
      const { getDb } = await import('../db');
      const { units } = await import('../../drizzle/schema');
      const db = await getDb();
      if (db) {
        // Busca a primeira unidade ativa com IP configurado
        const [unit] = await db
          .select()
          .from(units)
          .where(require('drizzle-orm').eq(units.isActive, true))
          .limit(1);
        if (unit?.pacs_ip) {
          // Porta Orthanc HTTP padrão é 8042; pode ser sobrescrita por ORTHANC_HTTP_PORT
          const orthancPort = process.env.ORTHANC_HTTP_PORT || '8042';
          const url = `http://${unit.pacs_ip}:${orthancPort}`;
          cachedOrthancUrl = url;
          cacheTimestamp = now;
          console.log(`[DICOMweb Proxy] Orthanc URL resolvida do banco: ${url}`);
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
  
  // OPTIONS preflight para CORS
  app.options('/api/dicomweb/*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, multipart/related');
    res.status(204).send();
  });
  
  app.use('/api/dicomweb', async (req, res) => {
    try {
      const orthancBaseUrl = await getOrthancUrl();
      
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
      
      // Copia todos os headers relevantes da resposta do Orthanc
      res.setHeader('Access-Control-Allow-Origin', '*');
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
        res.status(502).json({ 
          error: 'DICOMweb Proxy Error', 
          message: error.message,
          orthanc: 'http://172.16.3.241:8042'
        });
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

      const unitId = user.unit_id;
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
          sendEvent('status', { phase: 'cached', message: `Cache encontrado: ${dcmFiles.length} imagens`, total: dcmFiles.length });
          for (const f of dcmFiles) {
            sendEvent('file', { filename: f, index: dcmFiles.indexOf(f) + 1, total: dcmFiles.length });
          }
          sendEvent('complete', { total: dcmFiles.length, fromCache: true });
          return res.end();
        }
      } catch {}

      // Inicia C-GET via Python com modo streaming (linha por linha)
      sendEvent('status', { phase: 'downloading', message: 'Iniciando C-GET...' });

      const { spawn } = await import('child_process');
      // dicom_move.py é copiado para dist/ pelo build (cp server/*.py dist/)
      // Usar new URL() igual ao startViewer para garantir compatibilidade em produção
      const scriptPath = new URL('./dicom_move.py', import.meta.url).pathname;
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
              // final JSON com resultado
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
              if (msg.success) {
                sendEvent('complete', { total: msg.file_count || receivedFiles, fromCache: false });
              } else {
                sendEvent('error', { message: msg.error || 'Erro no C-GET' });
              }
            }
          } catch {}
        }
        if (!res.writableEnded) {
          // Garante que enviamos o complete mesmo se não veio no stdout
          try {
            const files = await fs.readdir(studyCacheDir);
            const count = files.filter((f: string) => f.endsWith('.dcm')).length;
            if (count > 0) sendEvent('complete', { total: count, fromCache: false });
            else sendEvent('error', { message: 'Nenhuma imagem recebida do PACS' });
          } catch {
            sendEvent('error', { message: 'Erro ao verificar cache após C-GET' });
          }
          res.end();
        }
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
  app.get('/api/dicom-export/:studyUid', async (req, res) => {
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
        res.status(500).json({ error: 'Erro ao gerar ZIP: ' + err.message });
      }
    }
  });

  // CRÍTICO 3: Rate limiting aplicado especificamente na rota de login
  app.use('/api/trpc/auth.login', loginRateLimiter);

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
