import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT_PREFERENCES } from "../shared/types";
import {
  createPhysicalReportSheetRenderer,
  physicalReportPaperWidth,
  REPORT_PHYSICAL_BODY_SELECTOR,
} from "../client/src/lib/reportPhysicalSheetRenderer";
import type { EffectiveReportLayout } from "../shared/reportLayout";

function buildLayout(): EffectiveReportLayout {
  return {
    preferences: {
      ...DEFAULT_LAYOUT_PREFERENCES,
      pageSize: "Letter",
      marginTop: 11,
      marginRight: 12,
      marginBottom: 13,
      marginLeft: 14,
      fontFamily: "Georgia",
      fontSize: 12,
      lineHeight: 1.8,
    },
    header_html: null,
    footer_html: null,
    background_image_url: "https://assets.invalid/background.png",
    background_opacity: "0.4",
    background_size: "contain",
    footer_image_url: "https://assets.invalid/footer.png",
    logos: [{ url: "https://assets.invalid/logo.png", width: 120, height: 45, label: "Unidade" }],
    block_positions: {
      patientInfo: { x: 4, y: 16, w: 91, h: 8, visible: true },
      patientName: { x: 4, y: 25, w: 91, h: 5, visible: true },
      title: { x: 4, y: 31, w: 91, h: 6, visible: true },
      body: { x: 4, y: 38, w: 91, h: 45, visible: true },
      footer: { x: 4, y: 86, w: 91, h: 10, visible: true },
    },
    source: "snapshot",
  };
}

describe("renderer visual físico canônico de laudos", () => {
  it("fixa a largura física de A4 e Letter também durante a medição oculta", () => {
    expect(physicalReportPaperWidth("A4")).toBe("210mm");
    expect(physicalReportPaperWidth("Letter")).toBe("216mm");
  });

  it("usa SharedReportSheet, todas as posições configuradas e o seletor corporal único", () => {
    const renderPage = createPhysicalReportSheetRenderer({
      layout: buildLayout(),
      patient: {
        name: "Paciente Sintético",
        birthDate: "01/02/1980",
        sex: "Feminino",
        studyDate: "03/04/2026",
        modality: "MR",
      },
    });
    const html = renderPage({
      title: "RM DE CRÂNIO",
      bodyHtml: "<p>Conteúdo clínico sintético.</p>",
      footerHtml: "<strong>Médico sintético</strong>",
      isLast: true,
    });

    expect(REPORT_PHYSICAL_BODY_SELECTOR).toBe("[data-report-body-content]");
    expect(html).toContain('data-shared-report-sheet="true"');
    expect(html).toContain('class="shared-report-sheet print-page"');
    expect(html).toContain('width:216mm');
    expect(html).toContain('height:279mm');
    expect(html).toContain('padding:11mm 12mm 13mm 14mm');
    expect(html).toContain('font-family:Georgia, &quot;Times New Roman&quot;, serif');
    expect(html).toContain('data-layout-block="patientInfo"');
    expect(html).toContain('data-layout-block="patientName"');
    expect(html).toContain('data-layout-block="title"');
    expect(html).toContain('data-layout-block="body"');
    expect(html).toContain('data-layout-block="footer"');
    expect(html).toContain('data-report-body-content="true"');
    expect(html).toContain('flex:1;min-height:0;overflow:hidden');
    expect(html).toContain('https://assets.invalid/background.png');
    expect(html).toContain('position:absolute;inset:0;width:100%;height:100%;pointer-events:none');
    expect(html).toContain('z-index:0;opacity:0.4;object-fit:contain');
    const contentLayerMatch = html.match(/class="shared-report-sheet-content" style="([^"]+)"/);
    expect(contentLayerMatch).not.toBeNull();
    expect(contentLayerMatch![1]).toContain('z-index:1');
    expect(html).toContain('left:4%');
    expect(html).toContain('top:38%');
    expect(html).toContain('Paciente Sintético');
    expect(html).toContain('RM DE CRÂNIO');
    expect(html).toContain('Conteúdo clínico sintético.');
    expect(html).toContain('Médico sintético');
    expect(html).toContain('https://assets.invalid/footer.png');
  });

  it("mantém o corpo físico vazio sem guia de edição e aplica rodapé em todas as páginas por padrão", () => {
    const renderPage = createPhysicalReportSheetRenderer({
      layout: buildLayout(),
      patient: { name: "Paciente Sintético" },
    });
    const html = renderPage({ title: "Seção vazia", bodyHtml: "", footerHtml: "", isLast: false });

    expect(html).toContain('class="report-body"');
    expect(html).not.toContain('data-report-body-guide');
    expect(html).not.toContain('Digite a técnica do exame');
    expect(html).not.toContain('Descreva os achados radiológicos');
    expect(html).toContain('https://assets.invalid/footer.png');
  });

  it("renderiza conteúdo clínico quando snapshot legado não tem visible nas posições", () => {
    const layout = buildLayout();
    layout.block_positions = {
      patientInfo: { x: 4, y: 16, w: 91, h: 8 },
      patientName: { x: 4, y: 25, w: 91, h: 5 },
      title: { x: 4, y: 31, w: 91, h: 6 },
      body: { x: 4, y: 38, w: 91, h: 45 },
      footer: { x: 4, y: 86, w: 91, h: 10 },
    } as never;

    const html = createPhysicalReportSheetRenderer({
      layout,
      patient: { name: "Paciente de Snapshot Legado" },
    })({
      title: "Laudo Histórico",
      bodyHtml: "<p>Conteúdo clínico preservado.</p>",
      footerHtml: "<strong>Assinatura histórica</strong>",
      isLast: true,
    });

    expect(html).toContain('data-layout-block="patientInfo"');
    expect(html).toContain('data-layout-block="patientName"');
    expect(html).toContain('data-layout-block="title"');
    expect(html).toContain('data-layout-block="body"');
    expect(html).toContain('data-layout-block="footer"');
    expect(html).toContain("Paciente de Snapshot Legado");
    expect(html).toContain("Conteúdo clínico preservado.");
    expect(html).toContain("Assinatura histórica");
  });

  it("permite somente na migração legada restringir a arte de rodapé à última página", () => {
    const renderPage = createPhysicalReportSheetRenderer({
      layout: buildLayout(),
      patient: { name: "Paciente Sintético" },
      footerImagePageScope: "last",
    });

    expect(renderPage({ title: "P1", bodyHtml: "<p>1</p>", footerHtml: "", isLast: false }))
      .not.toContain('https://assets.invalid/footer.png');
    expect(renderPage({ title: "P2", bodyHtml: "<p>2</p>", footerHtml: "", isLast: true }))
      .toContain('https://assets.invalid/footer.png');
  });

  it("aceita assets preparados pelo consumidor sem cair novamente no URL do layout", () => {
    const renderPage = createPhysicalReportSheetRenderer({
      layout: buildLayout(),
      patient: { name: "Paciente Sintético" },
      assets: {
        backgroundUrl: "data:image/png;base64,FAKE",
        footerImageUrl: null,
        logos: [{ url: "data:image/png;base64,LOGO", width: 80, height: 30, label: "Preparado" }],
      },
    });
    const html = renderPage({ title: "Laudo", bodyHtml: "<p>ok</p>", footerHtml: "", isLast: true });

    expect(html).toContain('data:image/png;base64,FAKE');
    expect(html).toContain('data:image/png;base64,LOGO');
    expect(html).not.toContain('https://assets.invalid/footer.png');
  });
  it("não converte escala de fundo salva no layout para cover antes de chegar ao SharedReportSheet", () => {
    const layout = buildLayout();
    layout.background_size = "100% 100%";
    layout.footer_image_url = null;

    const html = createPhysicalReportSheetRenderer({
      layout,
      patient: { name: "Paciente Sintético" },
    })({
      title: "Laudo",
      bodyHtml: "<p>ok</p>",
      footerHtml: "",
      isLast: true,
    });

    expect(html).toContain("object-fit:fill");
    expect(html).not.toContain("object-fit:cover");
  });

  /**
   * Regressão (auditoria externa Codex + Claude, 2026-09-29, homologação
   * Chromium): confirma que o renderer físico usado por Editor, Lista PACS
   * e PDF financeiro herda a geometria inline do fundo (não só o
   * object-fit) — sem isso, a folha estática ficava sem fundo posicionado
   * nas 3 vias, mesmo com backgroundSize/opacity corretos.
   */
  it("herda a geometria inline do fundo (position/inset/width/height/pointer-events), não só o object-fit", () => {
    const layout = buildLayout();

    const html = createPhysicalReportSheetRenderer({
      layout,
      patient: { name: "Paciente Sintético" },
    })({
      title: "Laudo",
      bodyHtml: "<p>ok</p>",
      footerHtml: "",
      isLast: true,
    });

    expect(html).toContain("position:absolute;inset:0;width:100%;height:100%;pointer-events:none");
    expect(html).toContain("https://assets.invalid/background.png");
  });

  /**
   * Regressão (auditoria Manus 2026-09-29, "Parecer técnico — cadeia de
   * dados DICOM, rodapé e teste"): o bloco de rodapé centralizava
   * (`align-items:center`) um conteúdo de altura natural dentro de uma
   * caixa de altura fixa com `overflow:hidden` — quando carimbo +
   * assinatura + nome + CRM + data somados excediam a altura do bloco,
   * o conteúdo era cortado igualmente acima/abaixo (a Manus mediu ~171px
   * de conteúdo contra ~115px de bloco em Chromium). O bloco agora estica
   * (`align-items:stretch`) para que a altura do bloco vire uma altura
   * DEFINIDA para os filhos, e o wrapper interno declara `height:100%`
   * explicitamente — pré-requisito para que o `.doctor-footer` de cada
   * consumidor (flex-column com `min-height:0` nas imagens) consiga
   * encolher carimbo/assinatura proporcionalmente em vez de cortá-los.
   */
  it("estica o wrapper do bloco de rodapé em vez de centralizar conteúdo de altura livre (contrato de capacidade)", () => {
    const html = createPhysicalReportSheetRenderer({
      layout: buildLayout(),
      patient: { name: "Paciente Sintético" },
    })({
      title: "Laudo",
      bodyHtml: "<p>ok</p>",
      footerHtml: "<div class=\"doctor-footer\">Assinatura sintética</div>",
      isLast: true,
    });

    const footerBlockMatch = html.match(/data-layout-block="footer" style="([^"]+)"/);
    expect(footerBlockMatch).not.toBeNull();
    expect(footerBlockMatch![1]).toContain("align-items:stretch");
    expect(footerBlockMatch![1]).not.toContain("align-items:center");
    expect(footerBlockMatch![1]).toContain("overflow:hidden");

    // Wrapper interno (relative, z-index:1, width:100%) precisa também de
    // height:100% — sem isso, mesmo com o bloco externo esticado, o filho
    // shrink-wrap voltaria a ter altura de conteúdo, e os percentuais do
    // `.doctor-footer` (height:100%) dentro dele ficariam sem referência
    // definida (percentual de altura "auto" é ignorado pelo CSS).
    expect(html).toContain('style="position:relative;z-index:1;width:100%;height:100%"');

    // O renderer físico comum adiciona ainda outro wrapper para injetar o
    // HTML clínico do rodapé via dangerouslySetInnerHTML. Esse wrapper
    // também precisa participar da cadeia de altura definida; caso tenha
    // apenas width:100%, o .doctor-footer volta a resolver height:100%
    // contra altura auto e passa a ser cortado pelo bloco externo.
    expect(html).toContain('style="position:relative;z-index:1;width:100%;height:100%"><div style="width:100%;height:100%"><div class="doctor-footer"');
    expect(html).not.toContain('style="position:relative;z-index:1;width:100%;height:100%"><div style="width:100%"><div class="doctor-footer"');
  });
});
