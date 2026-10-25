/**
 * AVISO VISUAL (pedido do Alessandro, 2026-10-13): até esta correção, o único
 * sinal de que um exame ainda não tinha nenhuma legenda selecionada era o
 * toast de bloqueio em handleReport, disparado só quando o usuário já tinha
 * tentado laudar/abrir o exame. Esta correção adiciona um aviso visual
 * acinzentado (estilo "não selecionável/desabilitado") na própria listagem,
 * para que o usuário perceba a pendência antes mesmo de tentar laudar.
 *
 * Escopo confirmado com o Alessandro via pergunta direta (AskUserQuestion):
 * aviso aplicado SOMENTE na célula/texto do nome do exame da coluna "Exame"
 * no desktop, em cinza — ele não pediu destaque na linha inteira da tabela
 * nem pediu o mesmo tratamento no card mobile. Uma primeira versão desta
 * correção também alterou o card mobile, mas isso quebrou 2 testes
 * pré-existentes (server/pacs.mobile-ui.test.ts) que já fixavam as classes
 * estáticas exatas daquele bloco; como o mobile estava fora do escopo
 * pedido, a mudança lá foi revertida e o card mobile permanece exatamente
 * como estava antes desta correção.
 *
 * CORREÇÃO (parecer de bloqueio da Manus, 2026-10-13): a primeira versão
 * desta correção afirmava "sem legenda" só com `selections.length === 0`,
 * o que é um falso positivo enquanto a consulta de legendas ainda está
 * carregando, desabilitada ou após erro (a query tem fallback `data = []`
 * nesses casos). Agora a decisão é delegada à função pura
 * resolveExamHasNoLegendSelected (client/src/lib/examLegendVisualState.ts),
 * que só afirma a ausência depois de isSuccess da consulta. O
 * comportamento dos 4 estados (carregando/sucesso vazio/sucesso com
 * legenda/erro) é coberto por testes dedicados em
 * server/exam-legend-visual-state.test.ts, que chamam a função
 * diretamente — este arquivo aqui continua só confirmando, por leitura de
 * código-fonte, que a integração dentro de PacsQueryPage.tsx está correta.
 *
 * Este teste prova, via leitura do código-fonte, que:
 * 1. ExamName aceita `unselected` e aplica estilos cinza quando true.
 * 2. A célula "Exame" (desktop) calcula `hasNoLegendSelected` delegando a
 *    resolveExamHasNoLegendSelected (hasLoadedLegendSelections +
 *    selectionsCount), e repassa para ExamName, além de acinzentar o
 *    badge de modalidade e exibir um title explicativo.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pacsQueryPageTsx = readFileSync(
  new URL("../client/src/pages/PacsQueryPage.tsx", import.meta.url),
  "utf-8",
);

describe("Aviso visual (cinza) para exame sem legenda selecionada", () => {
  it("ExamName aceita a prop `unselected` e aplica estilo cinza (não selecionável) quando true", () => {
    expect(pacsQueryPageTsx).toContain(
      "function ExamName({ value, unselected }: { value: string; unselected?: boolean }) {",
    );
    expect(pacsQueryPageTsx).toContain(
      "unselected ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-blue-50 text-blue-500 border-blue-100'",
    );
    expect(pacsQueryPageTsx).toContain(
      "unselected ? 'text-gray-400' : 'text-gray-800'",
    );
  });

  it("coluna 'Exame' (desktop) delega a decisão a resolveExamHasNoLegendSelected e repassa unselected para ExamName", () => {
    expect(pacsQueryPageTsx).toContain(
      'import { resolveExamHasNoLegendSelected } from "@/lib/examLegendVisualState";',
    );
    expect(pacsQueryPageTsx).toContain(
      "const studyLegendSelections = legendSelectionsByStudyUid.get(study.studyInstanceUid) ?? [];",
    );
    expect(pacsQueryPageTsx).toContain(
      "const hasNoLegendSelected = resolveExamHasNoLegendSelected({",
    );
    expect(pacsQueryPageTsx).toContain("hasLoadedLegendSelections,");
    expect(pacsQueryPageTsx).toContain(
      "selectionsCount: studyLegendSelections.length,",
    );
    expect(pacsQueryPageTsx).toContain("unselected={hasNoLegendSelected}");
  });

  it("a consulta de legendas expõe isSuccess (hasLoadedLegendSelections) para o cálculo não afirmar ausência antes da hora", () => {
    expect(pacsQueryPageTsx).toContain(
      "const { data: studyLegendSelections = [], isSuccess: hasLoadedLegendSelections } = trpc.studyExamLegend.getBatch.useQuery(",
    );
  });

  it("badge de modalidade e tooltip explicativo também acompanham o estado sem legenda (desktop)", () => {
    expect(pacsQueryPageTsx).toContain(
      "hasNoLegendSelected ? 'bg-gray-100 text-gray-400' : modalityCls",
    );
    expect(pacsQueryPageTsx).toContain(
      'title={hasNoLegendSelected ? "Selecione uma legenda para este exame" : undefined}',
    );
  });

  // ATUALIZADO (auditoria claude/ajustes-mobile, 2026-10-25): o card mobile ganhou altura mínima
  // de toque (min-h-9 flex items-center). A intenção original continua protegida: a classe é
  // estática — o aviso cinza condicional NÃO foi aplicado ao card mobile.
  it("card mobile permanece fora do aviso cinza: classe estática (sem condicional de legenda)", () => {
    expect(pacsQueryPageTsx).toContain(
      'className="mt-1 flex min-h-9 items-center truncate rounded pr-1 text-xs uppercase leading-tight text-gray-500 group-hover:text-cyan-800"',
    );
  });
});
