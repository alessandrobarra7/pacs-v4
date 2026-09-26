import { describe, expect, it } from "vitest";
import { renderLogoLayerHtml } from "../client/src/lib/reportLogoLayer";

// Regressão (achado ao vivo em produção, 2026-09-25, reprodução do
// Alessandro após a correção anterior de logo.width/height em
// SharedReportSheet.tsx): a reconstrução paginada de PacsQueryPage.tsx
// (usada tanto no download rápido quanto na impressão oficial) sempre
// substituía o cabeçalho por um template antigo — logos concatenados numa
// linha + nome da unidade — completamente diferente do que o editor de
// laudo mostra (logos posicionados individualmente por x/y/w/h, sem nome
// de unidade). Este módulo (reportLogoLayer.ts) é a fonte de verdade
// compartilhada, usada agora pela reconstrução paginada para gerar o
// mesmo layout de logo que SharedReportSheet.tsx usa no navegador.
describe("renderLogoLayerHtml (achado ao vivo, 2026-09-25)", () => {
  it("posiciona cada logo com left/top/width/height em % conforme os block positions salvos", () => {
    const html = renderLogoLayerHtml(
      {
        logo1: { x: 2, y: 3, w: 22, h: 10, visible: true },
        logo2: { x: 41, y: 3, w: 22, h: 10, visible: true },
      },
      [
        { url: "data:image/png;base64,logo1", width: 230, height: 60, label: "Logo 1" },
        { url: "data:image/png;base64,logo2", width: 120, height: 60, label: "Logo 2" },
      ],
    );

    expect(html).toContain('data-logo-layer-block="logo1"');
    expect(html).toContain("left:2%;top:3%;width:22%;height:10%");
    expect(html).toContain("data-logo-layer-block=\"logo2\"");
    expect(html).toContain("left:41%;top:3%;width:22%;height:10%");
  });

  it("aplica o width/height em px do logo (a mesma correção de SharedReportSheet.tsx), não apenas 100% da caixa", () => {
    const html = renderLogoLayerHtml(
      { logo1: { x: 2, y: 2, w: 26, h: 11, visible: true } },
      [{ url: "data:image/png;base64,logo", width: 230, height: 60 }],
    );

    expect(html).toContain("width:230px;height:60px;max-width:100%;max-height:100%");
  });

  it("não inclui um título de unidade ou qualquer texto fixo — só os logos posicionados", () => {
    const html = renderLogoLayerHtml(
      { logo1: { x: 2, y: 2, w: 26, h: 11, visible: true } },
      [{ url: "data:image/png;base64,logo", width: 230, height: 60 }],
    );

    expect(html).not.toContain("clinic-name");
    expect(html).not.toContain("clinic-sub");
    expect(html).not.toContain('class="header"');
  });

  it("omite um logo sem url e um bloco de posição marcado como não visível", () => {
    const html = renderLogoLayerHtml(
      {
        logo1: { x: 2, y: 2, w: 26, h: 11, visible: true },
        logo2: { x: 40, y: 2, w: 26, h: 11, visible: false },
      },
      [
        { url: "", width: 230, height: 60 },
        { url: "data:image/png;base64,logo2", width: 120, height: 60 },
      ],
    );

    expect(html).toBe("");
  });

  it("usa as posições padrão de fábrica quando nenhum block position foi salvo (retrocompatibilidade)", () => {
    const html = renderLogoLayerHtml(null, [{ url: "data:image/png;base64,logo", width: 100, height: 50 }]);
    expect(html).toContain("left:2%;top:2%;width:26%;height:11%");
  });
});
