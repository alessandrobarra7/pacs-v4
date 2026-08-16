import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { describe, expect, it } from "vitest";
import { ClinicalPatientDetails, ClinicalPatientName } from "../client/src/components/ClinicalPatientDetails";

describe("ClinicalPatientDetails — cabeçalho organizado", () => {
  it("renderiza nome, nascimento, sexo e realização do exame em linhas legíveis", () => {
    const markup = renderToStaticMarkup(
      createElement(
        "section",
        null,
        createElement(ClinicalPatientName, { patientName: "KYARA SOPHIA MAGALHAES ARAUJO" }),
        createElement(ClinicalPatientDetails, {
          unitName: "Hospital da Criança",
          birthDate: "16/05/2026",
          sex: "Feminino",
          studyDate: "08/07/2026",
        }),
      ),
    );

    expect(markup).toContain("Nome do paciente:");
    expect(markup).toContain("KYARA SOPHIA MAGALHAES ARAUJO");
    expect(markup).toContain("Data de nascimento:");
    expect(markup).toContain("16/05/2026");
    expect(markup).toContain("Sexo:");
    expect(markup).toContain("Feminino");
    expect(markup).toContain("Data de realização do exame:");
    expect(markup).toContain("08/07/2026");
    expect(markup).not.toContain("Hospital da Criança");
  });
});
