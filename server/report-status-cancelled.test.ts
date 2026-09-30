import { describe, expect, it } from "vitest";
import { getStudyReportStatusPresentation } from "./db";

describe("estado clínico de laudo cancelado na worklist", () => {
  it("não apresenta laudo cancelado como Em Andamento", () => {
    // Antes: label "Laudo cancelado" / detail explicando o cancelamento
    // (bf67d37). Alteração de 2026-09-30 (pedido explícito do
    // Alessandro): um estudo com ÚNICO documento cancelado volta a
    // aparecer como "Pendente" na worklist, igual a um estudo nunca
    // laudado — sem perder o estado "cancelled" no banco/auditoria,
    // só deixando de destacar isso na lista.
    expect(getStudyReportStatusPresentation(["cancelled"])).toEqual({
      label: "Pendente",
      detail: null,
    });
  });

  it("não confunde um único documento cancelado com Em Andamento mesmo após a mudança de rótulo", () => {
    // Regressão: garante que o resultado "Pendente" para cancelamento
    // total vem do ramo `cancelled === total`, e não do fallback
    // genérico "Em Andamento" (que teria o mesmo label mas por um
    // caminho de código diferente, mascarando uma regressão futura caso
    // alguém remova o ramo de cancelamento total sem querer).
    expect(getStudyReportStatusPresentation(["cancelled", "cancelled"])).toEqual({
      label: "Pendente",
      detail: null,
    });
  });

  it("distingue cancelamento parcial de uma laudagem ativa", () => {
    expect(getStudyReportStatusPresentation(["signed", "cancelled"])).toEqual({
      label: "Cancelamento parcial",
      detail: "1 de 2 documentos cancelado",
    });
  });

  it("mantém Em Andamento apenas para documento ainda não finalizado nem cancelado", () => {
    expect(getStudyReportStatusPresentation(["draft"])).toEqual({
      label: "Em Andamento",
      detail: null,
    });
  });
});
