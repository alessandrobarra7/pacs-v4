import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regressão (achado do relatório de homologação real da Manus,
 * 2026-10-17): os três produtores de PDF (Editor, Lista PACS,
 * Financeiro) usavam `canvas.toDataURL("image/png")` +
 * `pdf.addImage(..., "PNG", ...)` cada um na sua própria chamada —
 * gerando PDFs de dezenas/centenas de MB (medido: ~110 MiB num laudo
 * sintético de 72 parágrafos/11 páginas). Este teste garante que os três
 * passam a usar a função compartilhada `canvasToPdfRasterImage`
 * (`client/src/lib/pdfRasterExport.ts`, JPEG com qualidade alta) em vez
 * de montar o par PNG/"PNG" manualmente — e que nenhum deles reintroduz
 * "image/png" ou o literal "PNG" como formato hardcoded nesse ponto.
 */
const PRODUCERS = [
  { label: "financialReportPdfDownload.ts", path: "client/src/lib/financialReportPdfDownload.ts" },
  { label: "ReportEditorPage.tsx", path: "client/src/pages/ReportEditorPage.tsx" },
  { label: "PacsQueryPage.tsx", path: "client/src/pages/PacsQueryPage.tsx" },
];

describe("Correção do tamanho excessivo de PDF — os 3 produtores usam a mesma exportação raster", () => {
  for (const producer of PRODUCERS) {
    const source = readFileSync(resolve(process.cwd(), producer.path), "utf8");

    it(`${producer.label} importa e usa canvasToPdfRasterImage`, () => {
      expect(source).toMatch(/import\s*\{\s*canvasToPdfRasterImage\s*\}\s*from\s*["'].*pdfRasterExport["']/);
      expect(source).toContain("canvasToPdfRasterImage(");
    });

    it(`${producer.label} não monta mais o par PNG/"PNG" manualmente para pdf.addImage`, () => {
      expect(source).not.toMatch(/toDataURL\(\s*["']image\/png["']\s*\)/);
      expect(source).not.toMatch(/pdf\.addImage\([^)]*,\s*["']PNG["']/s);
    });
  }
});
