import { describe, expect, it } from "vitest";
import { getStudyReportStatusPresentation } from "./db";

describe("estado clínico de laudo cancelado na worklist", () => {
  it("não apresenta laudo cancelado como Em Andamento", () => {
    expect(getStudyReportStatusPresentation(["cancelled"])).toEqual({
      label: "Laudo cancelado",
      detail: "Assinatura cancelada — nova laudagem necessária",
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
