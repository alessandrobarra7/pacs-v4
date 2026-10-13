/**
 * CORREÇÃO (parecer de bloqueio da Manus, 2026-10-13, branch
 * claude/aviso-visual-exame-sem-legenda):
 *
 * O aviso visual (cinza) de "exame sem legenda selecionada" tinha um falso
 * positivo: a consulta trpc.studyExamLegend.getBatch.useQuery tem fallback
 * `data = []` enquanto carrega, enquanto está desabilitada (unidade/usuário
 * ainda não resolvidos) ou se falhar. A versão original da correção
 * comparava apenas `selections.length === 0`, então TODOS os exames
 * ficavam cinza no primeiro render — mesmo os que já tinham legenda
 * confirmada no servidor — e continuavam cinza se a consulta falhasse.
 *
 * A Manus apontou corretamente que os 4 testes de regressão anteriores (só
 * leitura de código-fonte) não cobriam esse cenário, porque não simulam os
 * estados temporais da query (carregando / sucesso vazio / sucesso com
 * dado / erro), e pediu, se não for viável renderizar a página inteira,
 * extrair uma função pura para a decisão visual e testá-la de forma
 * comportamental.
 *
 * Esta suíte testa diretamente resolveExamHasNoLegendSelected
 * (client/src/lib/examLegendVisualState.ts) — uma chamada de função real,
 * não comparação de texto — cobrindo exatamente os 4 estados exigidos.
 */
import { describe, expect, it } from "vitest";
import { resolveExamHasNoLegendSelected } from "../client/src/lib/examLegendVisualState";

describe("resolveExamHasNoLegendSelected — aviso visual de legenda ausente", () => {
  it("A. carregando (consulta ainda não respondeu): NÃO afirma ausência de legenda", () => {
    expect(
      resolveExamHasNoLegendSelected({
        hasLoadedLegendSelections: false,
        selectionsCount: 0,
      }),
    ).toBe(false);
  });

  it("B. sucesso sem legenda: confirma a ausência e deve mostrar o aviso cinza", () => {
    expect(
      resolveExamHasNoLegendSelected({
        hasLoadedLegendSelections: true,
        selectionsCount: 0,
      }),
    ).toBe(true);
  });

  it("C. sucesso com legenda já confirmada: nunca mostra o aviso", () => {
    expect(
      resolveExamHasNoLegendSelected({
        hasLoadedLegendSelections: true,
        selectionsCount: 2,
      }),
    ).toBe(false);
  });

  it("D. erro ou consulta desabilitada (isSuccess permanece false): NÃO afirma ausência de legenda", () => {
    // Em caso de erro de rede ou de a query estar desabilitada (unidade ou
    // usuário ainda não resolvidos), isSuccess do tRPC/react-query nunca
    // chega a true — o mesmo estado de "carregando" do ponto de vista
    // desta função pura, propositalmente, para não transformar uma falha
    // em uma afirmação de pendência clínica confirmada.
    expect(
      resolveExamHasNoLegendSelected({
        hasLoadedLegendSelections: false,
        selectionsCount: 0,
      }),
    ).toBe(false);
  });
});
