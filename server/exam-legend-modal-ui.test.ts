import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");

describe("modal visual de legenda canônica", () => {
  it("abre a composição pelo próprio item do exame, sem seletor suspenso na listagem", () => {
    expect(pageSource).toContain('title="Clique para compor um ou mais exames cadastrados"');
    expect(pageSource).toContain("Compor exames do estudo");
    expect(pageSource).not.toContain('<option value="">Selecionar legenda cadastrada</option>');
  });

  it("abre primeiro as modalidades e depois permite marcar e confirmar vários exames do administrador", () => {
    expect(pageSource).toContain('const LEGEND_MODAL_MODALITIES = ["CT", "RM", "CR", "US"] as const');
    expect(pageSource).toContain("const legendsForModality = selectedModality");
    expect(pageSource).toContain("Buscar exame ${selectedModality}...");
    expect(pageSource).toContain("legendsForModality.map((legend)");
    expect(pageSource).toContain("confirmSelections.mutate({ studyInstanceUid: study.studyInstanceUid, examLegendIds: draftLegendIds })");
    expect(pageSource).toContain("Confirmar seleção");
  });

  it("mantém o catálogo completo por modalidade no modal, sem restringir as opções à modalidade recebida do PACS", () => {
    const routerSource = readFileSync(resolve(process.cwd(), "server/routers/studyExamLegend.ts"), "utf8");
    expect(routerSource).toContain("eq(exam_legends.is_active, true)");
    expect(routerSource).toContain(".orderBy(asc(exam_legends.modality), asc(exam_legends.sort_order), asc(exam_legends.exam_name))");
    expect(routerSource).not.toContain("eq(exam_legends.modality, input.modality.trim().toUpperCase())");
  });

  it("refaz a consulta de legendas ao retornar para a listagem após um novo cadastro administrativo", () => {
    const catalogPage = readFileSync(resolve(process.cwd(), "client/src/pages/ExamCatalogPage.tsx"), "utf8");
    expect(catalogPage).toContain("await utils.studyExamLegend.listForStudy.invalidate()");
    expect(pageSource).toContain('refetchOnMount: "always"');
    expect(pageSource).toContain("refetchOnWindowFocus: true");
  });

  it("prioriza a composição canônica selecionada na listagem e mantém o PACS como alternativa", () => {
    expect(pageSource).toContain("legendSelectionsByStudyUid.get(study.studyInstanceUid) ?? []");
    expect(pageSource).toContain(".map((selection) => selection.exam_name_snapshot).join(' + ')");
  });

  it("permite retirar uma legenda desbloqueada diretamente da composição antes de confirmar", () => {
    expect(pageSource).toContain("const selectedLegendItems = draftLegendIds.map");
    expect(pageSource).toContain("const removeFromDraft = (legendId: number)");
    expect(pageSource).toContain("Remover legenda ${legend.name}");
    expect(pageSource).toContain("Remova e inclua legendas antes de confirmar.");
  });

  it("mantém a proteção visual e de servidor para legendas bloqueadas após a primeira assinatura", () => {
    const routerSource = readFileSync(resolve(process.cwd(), "server/routers/studyExamLegend.ts"), "utf8");
    expect(pageSource).toContain("!legend.locked && <button");
    expect(pageSource).toContain("Legendas bloqueadas não podem ser removidas após a primeira assinatura.");
    expect(routerSource).toContain("não pode ser removida após a primeira assinatura");
  });
});
