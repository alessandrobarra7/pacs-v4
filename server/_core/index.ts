import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

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
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // Serve DICOM files from cache
  app.get('/api/dicom-files/:studyUid/:filename', (req, res) => {
    const { studyUid, filename } = req.params;
    const filePath = `/tmp/dicom-cache/${studyUid}/${filename}`;
    
    // Security: validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).send('Invalid filename');
    }
    
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Error sending DICOM file:', err);
        res.status(404).send('File not found');
      }
    });
  });
  
  // List DICOM files for a study
  app.get('/api/dicom-files/:studyUid', async (req, res) => {
    const { studyUid } = req.params;
    const studyDir = `/tmp/dicom-cache/${studyUid}`;
    
    try {
      const fs = await import('fs/promises');
      const files = await fs.readdir(studyDir);
      const dicomFiles = files.filter(f => f.endsWith('.dcm'));
      
      res.json({
        success: true,
        studyUid,
        files: dicomFiles,
        count: dicomFiles.length,
      });
    } catch (error) {
      console.error('Error listing DICOM files:', error);
      res.status(404).json({
        success: false,
        error: 'Study not found in cache',
      });
    }
  });
  
  // DICOMweb Proxy - faz proxy das requisições para o Orthanc
  // Rota: /api/dicomweb/* → Orthanc /dicom-web/*
  // O Orthanc em 172.16.3.241:8042 tem o plugin DICOMweb habilitado em /dicom-web/
  
  // Cache da URL do Orthanc para evitar query ao banco em cada requisição
  let cachedOrthancUrl: string | null = null;
  let cacheTimestamp = 0;
  const CACHE_TTL_MS = 60_000; // 1 minuto
  
  async function getOrthancUrl(): Promise<string> {
    const now = Date.now();
    if (cachedOrthancUrl && (now - cacheTimestamp) < CACHE_TTL_MS) {
      return cachedOrthancUrl;
    }
    try {
      const { getDb } = await import('../db');
      const { units } = await import('../../drizzle/schema');
      const db = await getDb();
      if (db) {
        const [unit] = await db.select().from(units).limit(1);
        if (unit?.orthanc_base_url) {
          cachedOrthancUrl = unit.orthanc_base_url;
          cacheTimestamp = now;
          return cachedOrthancUrl;
        }
      }
    } catch (e) {
      console.error('[DICOMweb Proxy] Erro ao buscar URL do Orthanc:', e);
    }
    // Fallback: IP interno do Orthanc em produção
    return process.env.ORTHANC_BASE_URL || 'http://172.16.3.241:8042';
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
