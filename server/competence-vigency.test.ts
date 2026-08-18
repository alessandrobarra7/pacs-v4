import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { selectActiveByVigency } from "./db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "db.ts");

describe("seleção de vigência da apuração de competência", () => {
  const rows = [
    {
      id: 1,
      starts_at: new Date("2026-08-01T00:00:00.000Z"),
      ends_at: null,
      price_per_report: "10.00",
    },
    {
      id: 2,
      starts_at: new Date("2026-08-15T12:00:00.000Z"),
      ends_at: null,
      price_per_report: "12.50",
    },
  ];

  it("preserva a regra de escolher a vigência mais recente para cada instante", () => {
    expect(selectActiveByVigency(rows, new Date("2026-08-15T11:59:59.000Z"))?.id).toBe(1);
    expect(selectActiveByVigency(rows, new Date("2026-08-15T12:00:00.000Z"))?.id).toBe(2);
  });

  it("não aplica configuração fora do intervalo de vigência", () => {
    const closedRow = [{
      id: 3,
      starts_at: new Date("2026-08-01T00:00:00.000Z"),
      ends_at: new Date("2026-08-10T23:59:59.000Z"),
      price_per_report: "8.00",
    }];

    expect(selectActiveByVigency(closedRow, new Date("2026-08-11T00:00:00.000Z"))).toBeUndefined();
  });

  it("pré-carrega regras de competência em vez de consultar responsável e preços por laudo", async () => {
    const source = await fs.readFile(dbPath, "utf8");
    const functionStart = source.indexOf("export async function calculateCompetence");
    const functionEnd = source.indexOf("async function recalculateMonthlyConsolidates", functionStart);
    const competenceFunction = source.slice(functionStart, functionEnd);

    expect(competenceFunction).toContain("const responsibilityRows");
    expect(competenceFunction).toContain("const systemPriceRows");
    expect(competenceFunction).toContain("const doctorPriceRows");
    expect(competenceFunction).toContain("selectActiveByVigency(");
    expect(competenceFunction).not.toContain("await getActiveResponsibleForUnit(");
    expect(competenceFunction).not.toContain("await getActiveSystemPrice(");
    expect(competenceFunction).not.toContain("await getActiveDoctorPrice(");
  });
});
