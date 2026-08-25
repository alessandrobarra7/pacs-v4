import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import commonjs from "@rollup/plugin-commonjs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

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

const plugins = [react(), tailwindcss(), vitePluginCjsDefaultExport()];

export default defineConfig({
  plugins,
  define: {
    global: "globalThis",
  },
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
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
