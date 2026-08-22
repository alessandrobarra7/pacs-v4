import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers/financeSimple.ts"), "utf8");
const pageSource = readFileSync(resolve(process.cwd(), "client/src/pages/finance/FinanceMeuFinanceiro.tsx"), "utf8");

describe("visão financeira individual do médico", () => {
  it("separa a lista clínica de laudos dos eventos que calculam os repasses", () => {
    expect(routerSource).toContain("const deliveredReports");
    expect(routerSource).toContain("delivered_reports: safeDeliveredReports");
    expect(routerSource).toContain("signed_report_count");
    expect(routerSource).toContain("cycle_end_display");
    expect(routerSource).toContain('inArray(reports.status, ["signed", "revised", "cancelled"])');
  });

  it("limita documentos e download ao médico logado e à unidade solicitada", () => {
    expect(routerSource).toContain("eq(reports.unit_id, u.id)");
    expect(routerSource).toContain("eq(reports.author_user_id, ctx.user.id)");
    expect(routerSource).toContain("eq(reports.signedBy, ctx.user.id)");
    expect(routerSource).toContain('canAccessUnit(ctx.user, input.unit_id, "view_studies")');
    expect(routerSource).toContain('canAccessUnit(ctx.user, input.unit_id, "print_reports")');
    expect(routerSource).toContain("download_url:");
  });

  it("apresenta paciente, período, valor aplicado e ação de baixar laudo", () => {
    expect(pageSource).toContain("Laudos entregues");
    expect(pageSource).toContain("Paciente");
    expect(pageSource).toContain("Baixar laudo");
    expect(pageSource).toContain("Repasses gerados no ciclo");
    expect(pageSource).toContain("Alterações futuras de configuração não recalculam");
  });
});
