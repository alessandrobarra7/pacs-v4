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
 * Este teste prova, via leitura do código-fonte, que:
 * 1. ExamName aceita `unselected` e aplica estilos cinza quando true.
 * 2. A célula "Exame" (desktop) calcula `hasNoLegendSelected` a partir de
 *    `legendSelectionsByStudyUid` (sem nenhuma legenda confirmada) e repassa
 *    para ExamName, além de acinzentar o badge de modalidade e exibir um
 *    title explicativo.
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

  it("coluna 'Exame' (desktop) calcula hasNoLegendSelected e repassa unselected para ExamName", () => {
    expect(pacsQueryPageTsx).toContain(
      "const studyLegendSelections = legendSelectionsByStudyUid.get(study.studyInstanceUid) ?? [];",
    );
    expect(pacsQueryPageTsx).toContain(
      "const hasNoLegendSelected = studyLegendSelections.length === 0;",
    );
    expect(pacsQueryPageTsx).toContain("unselected={hasNoLegendSelected}");
  });

  it("badge de modalidade e tooltip explicativo também acompanham o estado sem legenda (desktop)", () => {
    expect(pacsQueryPageTsx).toContain(
      "hasNoLegendSelected ? 'bg-gray-100 text-gray-400' : modalityCls",
    );
    expect(pacsQueryPageTsx).toContain(
      'title={hasNoLegendSelected ? "Selecione uma legenda para este exame" : undefined}',
    );
  });

  it("card mobile permanece intocado (fora do escopo pedido): classe estática original preservada", () => {
    expect(pacsQueryPageTsx).toContain(
      'className="mt-1 truncate rounded pr-1 text-xs uppercase leading-tight text-gray-500 group-hover:text-cyan-800"',
    );
  });
});
