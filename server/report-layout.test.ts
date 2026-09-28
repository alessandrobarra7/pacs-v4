import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT_PREFERENCES } from "../shared/types";
import {
  buildLayoutSnapshot,
  resolveEffectiveReportLayout,
  type ReportLayoutSource,
} from "../shared/reportLayout";

function unitLayout(overrides: Partial<ReportLayoutSource> = {}): ReportLayoutSource {
  return {
    preferences: {
      ...DEFAULT_LAYOUT_PREFERENCES,
      pageSize: "Letter",
      marginTop: 31,
      blockOrder: ["header_unit", "patient_data", "report_body", "signature", "footer_custom"],
    },
    header_html: "<p>Cabeçalho A</p>",
    footer_html: "<p>Rodapé A</p>",
    background_image_url: "https://example.test/fundo-a.png",
    background_opacity: "0.80",
    background_size: "contain",
    footer_image_url: "https://example.test/rodape-a.png",
    logos: [{ url: "https://example.test/logo-a.png", width: 220, height: 80, label: "Unidade A" }],
    block_positions: {
      logo1: { x: 2, y: 3, w: 25, h: 10, visible: true },
    },
    ...overrides,
  };
}

describe("contrato canônico de layout de laudos", () => {
  it("constrói snapshot completo, normalizado e determinístico a partir do layout da unidade", () => {
    const source = unitLayout({ preferences: { fontSize: 13, pageSize: "Letter" } });
    const snapshot = buildLayoutSnapshot(source, "2026-09-28T10:00:00.000Z");

    expect(snapshot).toMatchObject({
      preferences: expect.objectContaining({
        fontSize: 13,
        pageSize: "Letter",
        marginLeft: DEFAULT_LAYOUT_PREFERENCES.marginLeft,
      }),
      header_html: "<p>Cabeçalho A</p>",
      footer_image_url: "https://example.test/rodape-a.png",
      capturedAt: "2026-09-28T10:00:00.000Z",
    });
  });

  it("retorna null para assinatura sem layout da unidade", () => {
    expect(buildLayoutSnapshot(null, "2026-09-28T10:00:00.000Z")).toBeNull();
  });

  it("não compartilha referências mutáveis com o layout capturado", () => {
    const source = unitLayout();
    const snapshot = buildLayoutSnapshot(source, "2026-09-28T10:00:00.000Z");
    if (!snapshot?.logos || !snapshot.block_positions || !snapshot.preferences.blockOrder) throw new Error("fixture inválido");

    snapshot.logos[0].width = 1;
    snapshot.block_positions.logo1.x = 99;
    snapshot.preferences.blockOrder.push("header_custom");

    expect(source.logos?.[0].width).toBe(220);
    expect(source.block_positions?.logo1.x).toBe(2);
    expect(source.preferences).toMatchObject({
      blockOrder: ["header_unit", "patient_data", "report_body", "signature", "footer_custom"],
    });
  });

  it("usa layout atual para rascunho, mesmo que exista snapshot", () => {
    const effective = resolveEffectiveReportLayout({
      status: "draft",
      unitLayout: unitLayout(),
      reportLayoutSnapshot: {
        preferences: { pageSize: "A4", marginTop: 5 },
        footer_image_url: "https://example.test/rodape-snapshot.png",
      },
    });

    expect(effective.source).toBe("unitLayout");
    expect(effective.preferences.pageSize).toBe("Letter");
    expect(effective.footer_image_url).toBe("https://example.test/rodape-a.png");
  });

  it.each(["signed", "revised"])("usa snapshot para laudo %s", (status) => {
    const effective = resolveEffectiveReportLayout({
      status,
      unitLayout: unitLayout(),
      reportLayoutSnapshot: {
        preferences: { pageSize: "A4", marginTop: 7 },
        header_html: "<p>Cabeçalho histórico</p>",
        footer_image_url: "https://example.test/rodape-historico.png",
      },
    });

    expect(effective.source).toBe("snapshot");
    expect(effective.preferences.pageSize).toBe("A4");
    expect(effective.preferences.marginTop).toBe(7);
    expect(effective.header_html).toBe("<p>Cabeçalho histórico</p>");
    expect(effective.footer_image_url).toBe("https://example.test/rodape-historico.png");
  });

  it("usa layout atual como fallback para laudo assinado sem snapshot", () => {
    const effective = resolveEffectiveReportLayout({
      status: "signed",
      unitLayout: unitLayout(),
      reportLayoutSnapshot: null,
    });

    expect(effective.source).toBe("unitLayout");
    expect(effective.preferences.pageSize).toBe("Letter");
    expect(effective.logos?.[0].url).toBe("https://example.test/logo-a.png");
  });

  it("usa fallback da unidade apenas para chaves atômicas ausentes em snapshot legado", () => {
    const effective = resolveEffectiveReportLayout({
      status: "signed",
      unitLayout: unitLayout(),
      reportLayoutSnapshot: {
        preferences: { fontSize: 14 },
        header_html: "<p>Histórico</p>",
      },
    });

    expect(effective.preferences).toMatchObject({
      fontSize: 14,
      pageSize: "Letter",
      marginTop: 31,
    });
    expect(effective.header_html).toBe("<p>Histórico</p>");
    expect(effective.footer_image_url).toBe("https://example.test/rodape-a.png");
    expect(effective.logos?.[0].url).toBe("https://example.test/logo-a.png");
  });

  it("não deixa properties undefined apagarem defaults de preferences", () => {
    const effective = resolveEffectiveReportLayout({
      status: "signed",
      unitLayout: unitLayout({ preferences: { marginLeft: undefined } }),
      reportLayoutSnapshot: { preferences: { fontSize: 12, pageSize: undefined } },
    });

    expect(effective.preferences.fontSize).toBe(12);
    expect(effective.preferences.marginLeft).toBe(DEFAULT_LAYOUT_PREFERENCES.marginLeft);
    expect(effective.preferences.pageSize).toBe(DEFAULT_LAYOUT_PREFERENCES.pageSize);
  });

  it("respeita null explícito de snapshot sem herdar ativos atuais", () => {
    const effective = resolveEffectiveReportLayout({
      status: "revised",
      unitLayout: unitLayout(),
      reportLayoutSnapshot: {
        header_html: null,
        footer_image_url: null,
        logos: null,
        block_positions: null,
      },
    });

    expect(effective.header_html).toBeNull();
    expect(effective.footer_image_url).toBeNull();
    expect(effective.logos).toBeNull();
    expect(effective.block_positions).toBeNull();
  });

  it("não compartilha referências mutáveis com unidade ou snapshot durante resolução", () => {
    const source = unitLayout();
    const snapshot: ReportLayoutSource = {
      preferences: { fontSize: 14, blockOrder: ["header_custom", "report_body"] },
      logos: [{ url: "https://example.test/logo-historico.png", width: 100, height: 50, label: "Histórico" }],
      block_positions: { logo1: { x: 14, y: 4, w: 20, h: 9, visible: true } },
    };
    const effective = resolveEffectiveReportLayout({
      status: "signed",
      unitLayout: source,
      reportLayoutSnapshot: snapshot,
    });

    if (!effective.logos || !effective.block_positions || !effective.preferences.blockOrder) throw new Error("fixture inválido");
    effective.logos[0].width = 1;
    effective.block_positions.logo1.x = 98;
    effective.preferences.blockOrder.push("signature");

    expect(snapshot.logos?.[0].width).toBe(100);
    expect(snapshot.block_positions?.logo1.x).toBe(14);
    expect(snapshot.preferences).toMatchObject({ blockOrder: ["header_custom", "report_body"] });
    expect(source.logos?.[0].width).toBe(220);
  });
});
