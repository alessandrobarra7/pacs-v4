import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers/financeSimple.ts"), "utf8");
const pageSource = readFileSync(resolve(process.cwd(), "client/src/pages/finance/FinanceMeuFinanceiro.tsx"), "utf8");
const editorSource = readFileSync(resolve(process.cwd(), "client/src/pages/ReportEditorPage.tsx"), "utf8");

describe("configuração efetiva e impressão no financeiro médico", () => {
  it("prioriza preço individual e expõe o fallback de modalidade da unidade", () => {
    expect(routerSource).toContain('source: "individual"');
    expect(routerSource).toContain('source: "unit_modality_fallback"');
    expect(routerSource).toContain("billing_unit_modality_prices");
    expect(routerSource).toContain('normalized === "RM" ? "MR" : normalized');
    expect(pageSource).toContain("Valor efetivo por modalidade");
    expect(pageSource).toContain("Preço padrão da unidade");
  });

  it("gera o download configurado do próprio documento diretamente na página financeira", () => {
    expect(routerSource).toContain("print_target:");
    expect(routerSource).not.toContain("download_url:");
    expect(routerSource).toContain("export_file_url: _exportFileUrl");
    expect(routerSource).toContain("myReportDownload:");
    expect(routerSource).toContain("Somente documentos finalizados podem ser baixados.");
    expect(pageSource).toContain("financeSimple.myReportDownload.fetch");
    expect(pageSource).toContain("downloadFinancialPdf");
    expect(pageSource).not.toContain('financialView: "1"');
    expect(pageSource).toContain("Baixar PDF");
    expect(pageSource).not.toContain("window.open(");
    expect(editorSource).toContain("financialDocumentView");
  });
});
