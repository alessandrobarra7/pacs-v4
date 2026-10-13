/**
 * BLOQUEIO Manus (parecer 2026-10-13, revisão da branch
 * claude/aviso-visual-exame-sem-legenda): decide se um exame deve ser
 * exibido com o aviso visual de "sem legenda selecionada" (acinzentado) na
 * listagem PACS.
 *
 * Achado real: a consulta trpc.studyExamLegend.getBatch.useQuery tem
 * fallback `data = []` enquanto carrega, enquanto está desabilitada
 * (unidade/usuário ainda não resolvidos) ou se falhar. Comparar apenas
 * `selectionsCount === 0` nesses casos afirma, de forma falsa, que o exame
 * não tem legenda — quando na verdade o estado real ainda é desconhecido.
 * Isso podia deixar TODOS os exames cinza no primeiro render, mesmo os que
 * já tinham legenda confirmada no servidor.
 *
 * Esta função extrai a decisão em lógica pura, sem nenhuma dependência de
 * React/tRPC, especificamente para poder ser testada de forma
 * comportamental (não apenas por leitura de código-fonte) cobrindo os 4
 * estados exigidos pela revisão: carregando, sucesso sem legenda, sucesso
 * com legenda, e erro/desabilitada.
 */
export function resolveExamHasNoLegendSelected(params: {
  /** true somente depois de uma resposta de SUCESSO da consulta de legendas. */
  hasLoadedLegendSelections: boolean;
  /** quantidade de seleções de legenda já confirmadas para o estudo. */
  selectionsCount: number;
}): boolean {
  // Só afirma "sem legenda" depois que a consulta confirmou isso com
  // sucesso. Enquanto carregando, desabilitada ou após erro, o estado é
  // desconhecido — não deve ser apresentado como pendência confirmada.
  return params.hasLoadedLegendSelections && params.selectionsCount === 0;
}
