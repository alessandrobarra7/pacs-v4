import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers/financeSimple.ts"), "utf8");
const pageSource = readFileSync(resolve(process.cwd(), "client/src/pages/finance/FinanceMeuFinanceiro.tsx"), "utf8");
const editorSource = readFileSync(resolve(process.cwd(), "client/src/pages/ReportEditorPage.tsx"), "utf8");
const downloadSource = readFileSync(resolve(process.cwd(), "client/src/lib/financialReportPdfDownload.ts"), "utf8");

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

  it("usa a mesma estratégia de download oculto da página principal sem abrir o editor clínico", () => {
    expect(pageSource).toContain("financeSimple.myReportDownload.fetch");
    expect(pageSource).toContain("downloadFinancialReportPdf(documentData)");
    expect(pageSource).not.toContain("window.open(");
    expect(downloadSource).toContain('document.createElement("iframe")');
    expect(downloadSource).toContain("pdf.save(");
    expect(downloadSource).not.toContain("window.open(");
    // FASE 3 DA UNIFICAÇÃO (26/09/2026): este arquivo deixou de montar seu
    // próprio shell HTML (CSS de página fixo, .footer-reserve com altura
    // estimada) e passou a delegar inteiramente para a fábrica canônica
    // (reportDocumentRenderer.tsx, Fase 2) — a mesma usada pelo editor do
    // médico e (quando migrada) pela lista de Estudos. Isso resolve a
    // divergência visual original reportada por Alessandro (2026-09-26):
    // o mesmo laudo saía diferente aqui, no editor e na lista.
    expect(downloadSource).toContain('from "./reportDocumentRenderer"');
    expect(downloadSource).toContain("renderAllPhysicalPagesHtml(");
    expect(downloadSource).toContain("resolveEffectiveReportLayout(");
    expect(downloadSource).not.toContain("FOOTER_RESERVE_MM");
    expect(downloadSource).not.toContain("footer-reserve");
    expect(downloadSource).not.toContain("paginateSectionIntoPages");
    expect(downloadSource).not.toContain("measureTopLevelBlocks");
    expect(downloadSource).not.toContain("splitBlocksIntoPages");
    // Regra de repetição (decisão de Alessandro, Fase 1): o rodapé do
    // médico não pode mais estar condicionado a "última página" — este
    // arquivo nunca decide isso sozinho; ele delega a
    // shouldRepeatOnPhysicalPage() via a fábrica canônica.
    expect(downloadSource).not.toMatch(/index === physicalPages\.length - 1 \? doctorFooter/);
    expect(routerSource).toContain("myReportDownload:");
    expect(routerSource).toContain("Sem permissão para baixar este documento.");
    expect(editorSource).toContain("financialDocumentView");
  });
});
