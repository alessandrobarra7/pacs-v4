import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "client/src/pages/finance/FinanceConfiguracao.tsx"),
  "utf8",
);

describe("matriz financeira por legenda canônica", () => {
  it("exibe a configuração por médico, unidade, legenda e vigência", () => {
    expect(source).toContain("Preços por Legenda Canônica");
    expect(source).toContain("listDoctorLegendPrices.useQuery");
    expect(source).toContain("setDoctorLegendPrice.useMutation");
    expect(source).toContain("examLegendId: legend.id");
    expect(source).toContain("nextCycleStartDate(cycleStartDay)");
  });

  it("distingue valores pendentes de valores vigentes por evento", () => {
    expect(source).toContain('"Pendente"');
    expect(source).toContain("}/evento`");
    expect(source).toContain("legend.financial_event_count");
    expect(source).toContain("Sem valor definido");
  });
});
