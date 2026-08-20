import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("centralização da configuração financeira", () => {
  it("remove os fluxos administrativos de preço e mantém a precificação na tela financeira", async () => {
    const [userForm, adminPage, unitDoctors, financeConfiguration] = await Promise.all([
      readFile(new URL("../client/src/components/UserFormDialog.tsx", import.meta.url), "utf-8"),
      readFile(new URL("../client/src/pages/AdminPage.tsx", import.meta.url), "utf-8"),
      readFile(new URL("../client/src/components/UnitDoctorsTab.tsx", import.meta.url), "utf-8"),
      readFile(new URL("../client/src/pages/finance/FinanceConfiguracao.tsx", import.meta.url), "utf-8"),
    ]);

    expect(userForm).not.toContain("_pendingPrices:");
    expect(adminPage).not.toContain("setDoctorPriceDirect");
    expect(unitDoctors).not.toContain("setDoctorPriceDirect");
    expect(unitDoctors).toContain("Preços e vigências são configurados exclusivamente no módulo Financeiro.");
    expect(financeConfiguration).toContain("nextCycleStartDate");
    expect(financeConfiguration).toContain("type=\"date\"");
  });

  it("protege preço padrão e por modalidade com a mesma regra de início de ciclo", async () => {
    const source = await readFile(new URL("./routers/financeSimple.ts", import.meta.url), "utf-8");

    expect(source).toContain("async function assertDoctorUnitPriceStart");
    expect(source).toContain("await assertDoctorUnitPriceStart(db, input.unitId, input.doctorUserId, startsAt);");
    expect(source).toContain("await assertCycleAlignedPriceStart(db, input.unitId, startsAt, activeRows.length > 0);");
  });
});
