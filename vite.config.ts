import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import commonjs from "@rollup/plugin-commonjs";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

// Plugin que corrige módulos CJS/IIFE sem default export.
// Cobre codecs WASM do Cornerstone (libjpeg-turbo, charls, openjpeg, openjph)
// gerados pelo Emscripten com padrão UMD: `if (typeof module === 'object') module.exports = X`
//
// Estratégia: SUBSTITUIR o bloco UMD inteiro por `export default X` limpo.
// Apenas adicionar ao final não resolve pois o Rollup inclui o bloco UMD original.
function vitePluginCjsDefaultExport(): Plugin {
  return {
    name: 'cjs-default-export',
    transform(code, id) {
      // Apenas codecs WASM do @cornerstonejs (arquivos .js no dist/ desses pacotes)
      const isCodecWasm = id.includes('@cornerstonejs/codec-') && id.includes('/dist/');
      if (!isCodecWasm) return null;

      // Se já tem export default ESM, não precisa de patch
      if (code.includes('export default') || code.includes('export { default }')) return null;

      // Padrão UMD Emscripten:
      // if (typeof exports === 'object' && typeof module === 'object')
      //   module.exports = VarName;
      // else if (typeof define === 'function' && define['amd'])
      //   define([], function() { return VarName; });
      // else if (typeof exports === 'object')
      //   exports["VarName"] = VarName;
      //
      // Substitui esse bloco por `export default VarName;`
      const umdPattern = /if\s*\(typeof\s+exports\s*===?\s*['"]object['"]\s*&&\s*typeof\s+module\s*===?\s*['"]object['"]\)[\s\S]*?(?:else\s+if\s*\(typeof\s+exports\s*===?\s*['"]object['"]\)[\s\S]*?\})?\s*$/;

      // Extrai o nome da variável exportada do bloco UMD
      const varMatch = code.match(/module\.exports\s*=\s*(\w+)/);
      const varName = varMatch ? varMatch[1] : null;

      if (varName) {
        // Remove o bloco UMD e adiciona export default ESM
        const cleaned = code.replace(umdPattern, '');
        return {
          code: cleaned.trimEnd() + `\nexport default ${varName};\n`,
          map: null,
        };
      }

      // Fallback: extrai o nome da variável principal do topo do arquivo
      const topVarMatch = code.match(/^var\s+(\w+)\s*=/m);
      if (topVarMatch) {
        const cleaned = code.replace(umdPattern, '');
        return {
          code: cleaned.trimEnd() + `\nexport default ${topVarMatch[1]};\n`,
          map: null,
        };
      }

      // Último recurso: apenas adiciona export default vazio
      return {
        code: code + '\nexport default {};',
        map: null,
      };
    },
  };
}

const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector(), vitePluginCjsDefaultExport()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      // Shims ESM para pacotes CJS-only que vtk.js importa como ESM default.
      // Esses shims substituem os pacotes CJS por implementações ESM nativas,
      // evitando o ReferenceError de 'module' no bundle de produção.
      "globalthis": path.resolve(import.meta.dirname, "client/src/shims/globalthis.js"),
      "fast-deep-equal": path.resolve(import.meta.dirname, "client/src/shims/fast-deep-equal.js"),
      "seedrandom": path.resolve(import.meta.dirname, "client/src/shims/seedrandom.js"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      // Exclui pacotes Cornerstone que usam Web Workers IIFE do bundle principal
      // Eles são carregados dinamicamente via import() no DicomViewerPage
      external: [],
    },
  },
  optimizeDeps: {
    // Inclui pacotes CJS-only que vtk.js/@cornerstonejs importam como ESM default.
    // O Vite pré-bundla esses pacotes criando wrappers ESM com default export automático.
    include: [
      'comlink',
      // dicom-parser usa require('zlib') (Node.js) mas tem browser:{zlib:false}.
      // O Vite precisa pré-bundlar para aplicar o mapeamento browser e substituir zlib por false.
      'dicom-parser',
    ],
    // Exclui @cornerstonejs/dicom-image-loader do pré-bundle porque ele usa
    // new Worker(new URL('./decodeImageFrameWorker.js', import.meta.url))
    // que o Vite não consegue resolver dentro do pré-bundle de deps.
    // O módulo é servido diretamente do /@fs/ path sem pré-bundle.
    exclude: [
      '@cornerstonejs/dicom-image-loader',
    ],
  },
  worker: {
    format: 'es',
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
