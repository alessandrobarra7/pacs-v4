import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("limite operacional do cadastro de unidade", () => {
  it("mantém a unidade sem abas, consultas ou comandos financeiros", async () => {
    const source = await readFile(
      new URL("../client/src/components/UnitFormDialog.tsx", import.meta.url),
      "utf-8",
    );

    expect(source).toContain('type DialogTab = "dados" | "medicos" | "equipe" | "sla"');
    expect(source).not.toContain('id: "custo"');
    expect(source).not.toContain('id: "responsavel"');
    expect(source).not.toContain('id: "resumo"');
    expect(source).not.toContain("setSystemPriceDirect");
    expect(source).not.toContain("linkResponsibleToUnitDirect");
    expect(source).not.toContain("getUnitFullContext");
    expect(source).toContain("esta tela não contém preços, custos, cobranças ou pagamentos");
  });

  it("mantém médicos como vínculo clínico e preços por evento no financeiro", async () => {
    const [unitDialog, doctorsTab, financeConfiguration] = await Promise.all([
      readFile(new URL("../client/src/components/UnitFormDialog.tsx", import.meta.url), "utf-8"),
      readFile(new URL("../client/src/components/UnitDoctorsTab.tsx", import.meta.url), "utf-8"),
      readFile(new URL("../client/src/pages/finance/FinanceConfiguracao.tsx", import.meta.url), "utf-8"),
    ]);

    expect(unitDialog).toContain("vínculo e a autorização clínica");
    expect(doctorsTab).toContain("Preços e vigências são configurados exclusivamente no módulo Financeiro.");
    expect(financeConfiguration).toContain("Preços por Legenda Canônica");
    expect(financeConfiguration).toContain("valor é aplicado por evento financeiro da legenda");
  });
});
