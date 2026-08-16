import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderSharedReportSheetHtml } from "../client/src/components/SharedReportPrint";

describe("ClinicalReportSheet — visualização médica e impressão", () => {
  it("aplica a apresentação clínica do ZIP mantendo a geometria persistida", () => {
    const markup = renderSharedReportSheetHtml({
      positions: {
        logo1: { x: 71, y: 60, w: 24, h: 11, visible: true },
        patientInfo: { x: 3, y: 13, w: 52, h: 9, visible: true },
        patientName: { x: 33, y: 3, w: 56, h: 9, visible: true },
        title: { x: 0, y: 19, w: 98, h: 12, visible: true },
        body: { x: 1, y: 32, w: 96, h: 40, visible: true },
        footer: { x: 1, y: 73, w: 96, h: 23, visible: true },
      },
      logos: [{ url: "data:image/png;base64,logo", width: 265, height: 140, label: "Instituto Acqua" }],
      patientName: "ANTONIA DE SOUZA BATISTA",
      patientInfo: createElement("span", null, "Realizado em: 15/08/2026"),
      title: createElement("strong", null, "CRANIO"),
      body: createElement("div", null, "Conteúdo clínico"),
      footer: createElement("span", null, "Médico radiologista"),
    });

    expect(markup).toContain("data-clinical-patient-panel");
    expect(markup).toContain("data-clinical-exam-title");
    expect(markup).toContain("data-clinical-report-body");
    expect(markup).toContain("data-clinical-report-footer");
    expect(markup).toContain('left:71%;top:60%;width:24%;height:11%');
    expect(markup).toContain('left:33%;top:3%;width:56%;height:9%');
    expect(markup).toContain("ANTONIA DE SOUZA BATISTA");
    expect(markup).toContain("CRANIO");
    expect(markup).toContain("Conteúdo clínico");
  });
});
