import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers/financeSimple.ts"), "utf8");
const pageSource = readFileSync(resolve(process.cwd(), "client/src/pages/finance/FinanceMeuFinanceiro.tsx"), "utf8");
const editorSource = readFileSync(resolve(process.cwd(), "client/src/pages/ReportEditorPage.tsx"), "utf8");

describe("visão financeira individual do médico", () => {
  it("separa a lista clínica de laudos dos eventos que calculam os repasses", () => {
    expect(routerSource).toContain("const deliveredReports");
    expect(routerSource).toContain("delivered_reports: safeDeliveredReports");
    expect(routerSource).toContain("signed_report_count");
    expect(routerSource).toContain("cycle_end_display");
    expect(routerSource).toContain('inArray(reports.status, ["signed", "revised", "cancelled"])');
  });

  it("limita documentos e impressão ao médico logado e à unidade solicitada", () => {
    expect(routerSource).toContain("eq(reports.unit_id, u.id)");
    expect(routerSource).toContain("eq(reports.author_user_id, ctx.user.id)");
    expect(routerSource).toContain("eq(reports.signedBy, ctx.user.id)");
    expect(routerSource).toContain('canAccessUnit(ctx.user, input.unit_id, "view_studies")');
    expect(routerSource).toContain('canAccessUnit(ctx.user, input.unit_id, "print_reports")');
    expect(routerSource).toContain("print_target:");
  });

  it("apresenta paciente, período, valor aplicado, busca e ação de impressão", () => {
    expect(pageSource).toContain("Laudos entregues");
    expect(pageSource).toContain("Paciente");
    expect(pageSource).toContain("Buscar paciente ou exame");
    expect(pageSource).toContain("Baixar PDF");
    expect(pageSource).toContain("Repasses gerados no ciclo");
    expect(pageSource).toContain("Alterações futuras não recalculam");
  });

  it("baixa o PDF financeiro diretamente sem abrir o editor clínico", () => {
    expect(pageSource).toContain("financeSimple.myReportDownload.fetch");
    expect(pageSource).toContain('document.createElement("div")');
    expect(pageSource).toContain('querySelectorAll<HTMLElement>("[data-shared-report-sheet]")');
    expect(pageSource).not.toContain('document.createElement("iframe")');
    expect(pageSource).not.toContain("window.open(");
    expect(routerSource).toContain("myReportDownload:");
    expect(routerSource).toContain("Sem permissão para baixar este documento.");
    expect(editorSource).toContain("financialDocumentView");
  });
});
