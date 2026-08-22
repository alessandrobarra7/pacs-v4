import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers/financeSimple.ts"), "utf8");
const pageSource = readFileSync(resolve(process.cwd(), "client/src/pages/finance/FinanceMeuFinanceiro.tsx"), "utf8");

describe("financeiro do médico por unidade", () => {
  it("exige uma unidade explícita no extrato e bloqueia acesso não autorizado", () => {
    expect(routerSource).toContain("unit_id: z.number().int()");
    expect(routerSource).toContain("Sem acesso financeiro a esta unidade.");
    expect(routerSource).toContain("const scopedUnitRows = unitRows.filter((unit) => unit.id === input.unit_id);");
  });

  it("expõe somente preços vigentes do próprio médico na unidade selecionada", () => {
    expect(routerSource).toContain("myModalityPrices");
    expect(routerSource).toContain("eq(billing_doctor_modality_prices.doctor_user_id, ctx.user.id)");
    expect(routerSource).toContain("eq(billing_doctor_modality_prices.unit_id, input.unit_id)");
  });

  it("mostra no cliente um seletor unitário e não consolida valores de hospitais distintos", () => {
    expect(pageSource).toContain("Unidade:");
    expect(pageSource).toContain("unit_id: unitId ?? 0");
    expect(pageSource).toContain("Valor efetivo por modalidade");
  });
});
