import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const pacsRouterSource = readFileSync(new URL("./routers/pacs.ts", import.meta.url), "utf8");

describe("mapeamento automático de legenda PACS", () => {
  it("filtra os mapeamentos pela disponibilidade da unidade", () => {
    expect(dbSource).toContain("getActivePacsExamMappings(unitId: number)");
    expect(dbSource).toContain("eq(exam_legend_unit_availability.unit_id, unitId)");
    expect(dbSource).toContain("eq(exam_legend_unit_availability.is_available, true)");
  });

  it("preserva seleções existentes e só cria a seleção automática quando houver documentos ativos", () => {
    expect(dbSource).toContain("if (existingSelections.length) return false;");
    expect(dbSource).toContain("if (existingReports.length) return false;");
    expect(dbSource).toContain("if (!documents.length) return false;");
    expect(dbSource).toContain("applyPacsMappedExamLegendIfUnselected");
  });

  it("aplica a sugestão mapeada durante a consulta PACS", () => {
    expect(pacsRouterSource).toContain("getActivePacsExamMappings(unit.id)");
    expect(pacsRouterSource).toContain("applyPacsMappedExamLegendIfUnselected");
    expect(pacsRouterSource).toContain("examLegendId: study.suggestedExamLegendId");
  });
});
