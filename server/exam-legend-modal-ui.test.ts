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
    expect(pageSource).toContain('{ value: "MR", label: "RM" }');
    expect(pageSource).toContain('setSelectedModality(modality.value)');
    expect(pageSource).toContain('legend.modality === modality.value');
    expect(pageSource).toContain('const selectedModalityLabel = selectedModality');
    expect(pageSource).toContain("const legendsForModality = selectedModality");
    expect(pageSource).toContain("Buscar exame ${selectedModalityLabel}...");
    expect(pageSource).toContain("Nenhum exame {selectedModalityLabel} está disponível para esta unidade.");
    expect(pageSource).toContain("legendsForModality.map((legend)");
    expect(pageSource).toContain("confirmSelections.mutate({ studyInstanceUid: study.studyInstanceUid, examLegendIds: draftLegendIds })");
    expect(pageSource).toContain("Confirmar seleção");
  });

  it("restringe a composição à modalidade única do estudo no cliente e no servidor", () => {
    const routerSource = readFileSync(resolve(process.cwd(), "server/routers/studyExamLegend.ts"), "utf8");
    expect(pageSource).toContain('const allowedModalities = LEGEND_MODAL_MODALITIES.filter((modality) => modality.value === studyModality)');
    expect(pageSource).toContain('{allowedModalities.map((modality) => {');
    expect(pageSource).toContain('normalizeDicomModality(study.modality)');
    expect(routerSource).toContain('async function resolveStudyModality');
    expect(routerSource).toContain('eq(exam_legends.modality, studyModality)');
    expect(routerSource).toContain('normalizeDicomModality(legend.modality) !== input.studyModality');
    expect(routerSource).toContain("eq(exam_legends.is_active, true)");
    expect(routerSource).toContain(".orderBy(asc(exam_legends.modality), asc(exam_legends.sort_order), asc(exam_legends.exam_name))");
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

describe("modal visual de legenda canônica — pular tela de modalidade única (claude/modal-compor-exames-estudo-20261010)", () => {
  it("resolve a modalidade permitida ANTES do openModal e pula direto para a lista quando há exatamente uma opção", () => {
    expect(pageSource).toContain("setSelectedModality(allowedModalities.length === 1 ? allowedModalities[0].value : null)");
    // A resolução de studyModality/allowedModalities precisa vir antes da definição de openModal,
    // para que openModal já enxergue o valor calculado (e não dependa de nova renderização).
    const openModalIndex = pageSource.indexOf("const openModal = (event: React.MouseEvent) => {");
    const allowedModalitiesIndex = pageSource.indexOf(
      'const allowedModalities = LEGEND_MODAL_MODALITIES.filter((modality) => modality.value === studyModality);',
    );
    expect(openModalIndex).toBeGreaterThan(-1);
    expect(allowedModalitiesIndex).toBeGreaterThan(-1);
    expect(allowedModalitiesIndex).toBeLessThan(openModalIndex);
  });

  it("esconde os dois botões 'Voltar' quando só existe uma modalidade permitida, já que não há para onde voltar", () => {
    expect(pageSource).toContain('{selectedModality && allowedModalities.length > 1 && <button type="button" onClick={() => { setSelectedModality(null); setSearch(""); }}');
    expect(pageSource).toContain('{allowedModalities.length > 1 && <button type="button" onClick={() => { setSelectedModality(null); setSearch(""); }} disabled={!selectedModality}');
  });

  it("mantém a tela de escolha de modalidade e sua mensagem de indisponibilidade para o caso de zero modalidades permitidas", () => {
    // Regra de negócio atual (shared/modality.ts, getSingleStudyModality): um estudo nunca
    // tem mais de uma modalidade válida, então este branch só é alcançável com 0 opções —
    // a mensagem de "modalidade não disponível" precisa continuar existindo para esse caso.
    expect(pageSource).toContain("A modalidade deste estudo não está disponível para composição clínica.");
    expect(pageSource).toContain("{!allowedModalities.length && <div className=\"col-span-full py-8 text-center text-sm text-slate-500\">");
  });
});
