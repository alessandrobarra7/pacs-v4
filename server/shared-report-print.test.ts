import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderSharedReportSheetHtml } from "../client/src/components/SharedReportPrint";

describe("SharedReportSheet print contract", () => {
  it("preserves the saved block coordinates and content in static output", () => {
    const markup = renderSharedReportSheetHtml({
      positions: {
        logo1: { x: 71, y: 60, w: 24, h: 11, visible: true },
        patientName: { x: 33, y: 3, w: 56, h: 9, visible: true },
        patientInfo: { x: 3, y: 13, w: 52, h: 9, visible: true },
        title: { x: 0, y: 19, w: 98, h: 12, visible: true },
        body: { x: 1, y: 32, w: 96, h: 40, visible: true },
        footer: { x: 1, y: 73, w: 96, h: 23, visible: true },
      },
      logos: [{ url: "data:image/png;base64,logo", width: 265, height: 140, label: "Instituto Acqua" }],
      patientName: "ANTONIA DE SOUZA BATISTA",
      patientInfo: createElement("span", null, "Realizado em: 27/07/2026"),
      title: createElement("strong", null, "CRANIO"),
      body: createElement("div", null, "LAUDO RADIOLOGICO"),
      footer: createElement("span", null, "Médico radiologista"),
    });

    expect(markup).toContain('data-shared-report-sheet');
    expect(markup).toContain('data-layout-block="logo1"');
    expect(markup).toContain('left:71%;top:60%;width:24%;height:11%');
    expect(markup).toContain('left:33%;top:3%;width:56%;height:9%');
    expect(markup).toContain("ANTONIA DE SOUZA BATISTA");
    expect(markup).toContain("CRANIO");
    expect(markup).toContain("LAUDO RADIOLOGICO");
    expect(markup).toContain("Médico radiologista");
  });

  /**
   * Regressão (auditoria Manus 2026-09-24, Parecer de Auditoria — Setor de
   * Laudos, Bloqueio 1): a folha compartilhada sempre saía A4 (210x297mm)
   * sem margem, ignorando o pageSize e as margens configuradas na unidade —
   * as 4 vias de geração de PDF/impressão divergiam entre si e da
   * configuração real. Agora o componente aceita pageSize/marginTop/Right/
   * Bottom/Left e os aplica na dimensão física e no padding da folha.
   */
  it("aplica pageSize=Letter e as margens efetivas na dimensão física da folha (Bloqueio 1)", () => {
    const markup = renderSharedReportSheetHtml({
      positions: {},
      pageSize: "Letter",
      marginTop: 30,
      marginRight: 25,
      marginBottom: 30,
      marginLeft: 25,
      patientName: "TESTE",
      body: createElement("div", null, "corpo"),
    });

    // Dimensão física Letter (216x279mm), não a A4 fixa de antes.
    expect(markup).toContain("height:279mm");
    expect(markup).toContain("max-width:216mm");
    // Margens aplicadas como padding da folha.
    expect(markup).toContain("padding:30mm 25mm 30mm 25mm");
  });

  it("mantém A4 sem margem por padrão quando pageSize/margens não são informados (retrocompatibilidade)", () => {
    const markup = renderSharedReportSheetHtml({
      positions: {},
      patientName: "TESTE",
      body: createElement("div", null, "corpo"),
    });

    expect(markup).toContain("height:297mm");
    expect(markup).toContain("max-width:210mm");
    expect(markup).toContain("padding:0mm 0mm 0mm 0mm");
  });
});

describe("SharedReportSheet — logo px (auditoria claude/corrige-logo-px-editor-vs-pdf)", () => {
  /**
   * Regressão: o editor de layout salva Largura(px)/Altura(px) por logo, mas
   * o componente compartilhado (usado tanto no preview do editor quanto na
   * geração de PDF/impressão) nunca aplicava esses valores — a imagem sempre
   * esticava para 100%/100% da caixa de posição percentual, tornando o campo
   * numérico configurado sem nenhum efeito no resultado entregue.
   */
  it("aplica width/height em px configurados no logo, não apenas 100% da caixa", () => {
    const markup = renderSharedReportSheetHtml({
      positions: {
        logo1: { x: 2, y: 2, w: 26, h: 11, visible: true },
      },
      logos: [{ url: "data:image/png;base64,logo", width: 230, height: 60, label: "Logo 1" }],
      patientName: "TESTE",
      body: createElement("div", null, "corpo"),
    });

    expect(markup).toContain("width:230px");
    expect(markup).toContain("height:60px");
  });

  it("mantém retrocompatibilidade (100%/100%) quando o logo não tem width/height salvos", () => {
    const markup = renderSharedReportSheetHtml({
      positions: {
        logo1: { x: 2, y: 2, w: 26, h: 11, visible: true },
      },
      logos: [{ url: "data:image/png;base64,logo", width: 0, height: 0, label: "Logo antigo" }],
      patientName: "TESTE",
      body: createElement("div", null, "corpo"),
    });

    const logoBlockMatch = markup.match(/data-layout-block="logo1"[\s\S]*?<\/div>/);
    expect(logoBlockMatch).not.toBeNull();
    expect(logoBlockMatch![0]).toContain("width:100%");
    expect(logoBlockMatch![0]).toContain("height:100%");
  });
});
