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

// Regressão (parecer de bloqueio da Manus, 2026-09-25) — Bloqueio 3:
// SharedReportSheet.tsx expande a chave legada `positions.logo` (layouts
// antigos, sem logo1/logo2/logo3) para os 3 slots; reportLogoLayer.ts não
// reproduzia essa regra, então um layout com essa chave legada divergia
// de novo entre o editor e o PDF entregue.
describe("renderLogoLayerHtml — compatibilidade com positions.logo legado (Bloqueio 3, Manus 2026-09-25)", () => {
  it("expande positions.logo para logo1 quando logo1/logo2/logo3 não existem", () => {
    const html = renderLogoLayerHtml(
      { logo: { x: 55, y: 6, w: 30, h: 15, visible: true } },
      [{ url: "data:image/png;base64,logo", width: 100, height: 50 }],
    );

    expect(html).toContain("left:55%;top:6%;width:30%;height:15%");
  });

  it("não usa a chave legada quando logo1 já existe explicitamente (a posição nova tem prioridade)", () => {
    const html = renderLogoLayerHtml(
      {
        logo: { x: 55, y: 6, w: 30, h: 15, visible: true },
        logo1: { x: 10, y: 10, w: 20, h: 8, visible: true },
      },
      [{ url: "data:image/png;base64,logo", width: 100, height: 50 }],
    );

    expect(html).toContain("left:10%;top:10%;width:20%;height:8%");
    expect(html).not.toContain("left:55%;top:6%;width:30%;height:15%");
  });
});

// Regressão (parecer de bloqueio da Manus, 2026-09-25) — Bloqueio 4: a
// função gerava `<img src="${logo.url}">` por interpolação direta, sem
// escapar aspas nem validar o esquema da URL. Uma URL com um atributo de
// evento embutido produzia HTML executável.
describe("renderLogoLayerHtml — sanitização de URL e atributos (Bloqueio 4, Manus 2026-09-25)", () => {
  it("nunca produz um atributo onerror/event-handler REAL a partir de uma URL maliciosa (só texto escapado dentro do valor do atributo src)", () => {
    const html = renderLogoLayerHtml(
      { logo1: { x: 2, y: 2, w: 26, h: 11, visible: true } },
      [{ url: 'https://example.invalid/x" onerror="window.__logoInjection=1', width: 100, height: 50 }],
    );

    // O `"` que fecharia o atributo src e abriria um onerror= real precisa
    // estar escapado como &quot; — não pode sobrar um `"` cru seguido de
    // onerror=, que é o que tornaria o atributo executável de verdade.
    expect(html).not.toMatch(/"\s*onerror\s*=\s*"/);
    expect(html).toContain("&quot; onerror=&quot;");
  });

  it("rejeita esquemas de URL que não sejam data:image/... ou http(s)://", () => {
    const html = renderLogoLayerHtml(
      { logo1: { x: 2, y: 2, w: 26, h: 11, visible: true } },
      [{ url: "javascript:alert(1)", width: 100, height: 50 }],
    );

    expect(html).toBe("");
  });

  it("escapa aspas e caracteres de marcação no label do logo", () => {
    const html = renderLogoLayerHtml(
      { logo1: { x: 2, y: 2, w: 26, h: 11, visible: true } },
      [{ url: "data:image/png;base64,logo", width: 100, height: 50, label: '"><script>alert(1)</script>' }],
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain('alt="">');
  });

  it("posição inválida (NaN, Infinity ou fora de 0-100) não escapa para o style — cai no valor de fábrica", () => {
    const html = renderLogoLayerHtml(
      { logo1: { x: Number.NaN, y: Infinity, w: 999, h: -50, visible: true } },
      [{ url: "data:image/png;base64,logo", width: 100, height: 50 }],
    );

    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
    expect(html).not.toContain("width:999%");
    expect(html).not.toContain("height:-50%");
  });
});
