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
    expect(dbSource).toContain('return decide("blocked_selection"');
    expect(dbSource).toContain('return decide("blocked_report"');
    expect(dbSource).toContain('return decide("blocked_no_documents"');
    expect(dbSource).toContain('selection_source: "pacs_auto"');
    expect(dbSource).toContain("applyPacsMappedExamLegendIfUnselected");
  });

  it("trata descrição vazia como uma regra explícita, separada do texto de tela", () => {
    expect(dbSource).toContain("matches_empty_description");
    expect(dbSource).toContain("emptyDescription: Map<string, ActivePacsExamMapping>");
    expect(pacsRouterSource).toContain("pacsExamMappings.emptyDescription.get(normalizedModality)");
    expect(pacsRouterSource).toContain("suggestedPacsMappingId");
  });

  it("aplica a sugestão mapeada sem permitir que uma falha isolada derrube a consulta", () => {
    expect(pacsRouterSource).toContain("getActivePacsExamMappings(unit.id)");
    expect(pacsRouterSource).toContain("applyPacsMappedExamLegendIfUnselected");
    expect(pacsRouterSource).toContain("examLegendId: study.suggestedExamLegendId");
    expect(pacsRouterSource).toContain("mappingId: study.suggestedPacsMappingId");
    expect(pacsRouterSource).toContain("Promise.allSettled");
    expect(pacsRouterSource).toContain("Falha isolada ao aplicar mapeamento de legenda");
  });
});
