import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");

describe("modal visual de legenda canônica", () => {
  it("abre a seleção pelo próprio item do exame, sem seletor suspenso na listagem", () => {
    expect(pageSource).toContain('title={isLocked ? "Legenda bloqueada após a primeira assinatura" : "Clique para selecionar uma modalidade e um exame cadastrado"}');
    expect(pageSource).toContain("Selecionar modalidade");
    expect(pageSource).not.toContain('<option value="">Selecionar legenda cadastrada</option>');
  });

  it("abre primeiro as modalidades e depois mostra botões pesquisáveis dos exames do administrador", () => {
    expect(pageSource).toContain('const LEGEND_MODAL_MODALITIES = ["CT", "RM", "CR", "US"] as const');
    expect(pageSource).toContain("Selecionar modalidade");
    expect(pageSource).toContain("const legendsForModality = selectedModality");
    expect(pageSource).toContain("Buscar exame ${selectedModality}...");
    expect(pageSource).toContain("legendsForModality.map((legend)");
    expect(pageSource).toContain("selectLegend.mutate({ studyInstanceUid: study.studyInstanceUid, examLegendId: legend.id })");
  });

  it("mantém o catálogo completo por modalidade no modal, sem restringir as opções à modalidade recebida do PACS", () => {
    const routerSource = readFileSync(resolve(process.cwd(), "server/routers/studyExamLegend.ts"), "utf8");
    expect(routerSource).toContain(".where(eq(exam_legends.is_active, true))");
    expect(routerSource).toContain(".orderBy(asc(exam_legends.modality), asc(exam_legends.sort_order), asc(exam_legends.exam_name))");
    expect(routerSource).not.toContain("eq(exam_legends.modality, input.modality.trim().toUpperCase())");
  });

  it("prioriza a legenda canônica selecionada na listagem e mantém o PACS como alternativa", () => {
    expect(pageSource).toContain("legendSelectionByStudyUid.get(study.studyInstanceUid)?.exam_name_snapshot || study.studyDescription || ''");
    expect(pageSource).toContain("legendSelectionByStudyUid.get(study.studyInstanceUid)?.exam_name_snapshot || meta?.description_override || study.studyDescription || 'Sem descrição'");
  });
});
