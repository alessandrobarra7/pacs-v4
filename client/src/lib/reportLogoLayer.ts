// Camada de logos posicionados, compartilhada entre o editor de laudo
// (via SharedReportSheet) e a reconstrução paginada usada pelo download
// rápido e pela impressão oficial (PacsQueryPage.tsx).
//
// CONTEXTO (achado ao vivo em produção, 2026-09-25, pedido do Alessandro):
// depois da correção anterior (SharedReportSheet passou a aplicar
// logo.width/logo.height em vez de sempre esticar para 100% da caixa de
// posição), o Alessandro repetiu o teste em produção e trouxe um PDF real
// baixado pela lista mostrando que o cabeçalho entregue AINDA não batia
// com o que o editor mostra: o PDF tinha os logos concatenados numa única
// linha ao lado de um título "NOME DA UNIDADE" + "Laudo de Interpretação
// Radiológica" que não existe em lugar nenhum do editor.
//
// Causa raiz (mais profunda que a anterior): a reconstrução paginada
// (reconstructPaginatedPages, em PacsQueryPage.tsx) SEMPRE substitui, para
// download e impressão, qualquer conteúdo inicial (inclusive o gerado por
// SharedReportSheet) pelas páginas físicas de buildPageShellQ. Esse
// buildPageShellQ montava um cabeçalho totalmente diferente e hardcoded —
// uma div.header com os logos concatenados lado a lado (sem respeitar a
// posição x/y configurada por logo) e um título de unidade que não é
// nenhum bloco editável do layout. Ou seja: mesmo com o px do logo já
// correto, a ESTRUTURA do cabeçalho entregue nunca correspondeu ao que o
// editor mostra, porque nunca usou os blockPositions (logo1/logo2/logo3)
// salvos pelo editor de layout — usava um template próprio, mais antigo,
// que sobrevivia intacto porque a reconstrução paginada sempre o chamava.
//
// Este módulo extrai a MESMA lógica de posicionamento de logo que
// SharedReportSheet.tsx usa (posição x/y/w/h percentual da área útil +
// largura/altura em px do logo, com maxWidth/maxHeight:100% para não
// invadir blocos vizinhos) para uma função pura e testável, usada pela
// reconstrução paginada (via string HTML).

export type LogoLayerPosition = { x: number; y: number; w: number; h: number; visible: boolean };
export type LogoLayerPositions = Record<string, LogoLayerPosition>;
export type LogoLayerLogo = { url: string; width?: number; height?: number; label?: string };

const FALLBACK_LOGO_POSITIONS: LogoLayerPositions = {
  logo1: { x: 2, y: 2, w: 26, h: 11, visible: true },
  logo2: { x: 37, y: 2, w: 26, h: 11, visible: true },
  logo3: { x: 72, y: 2, w: 26, h: 11, visible: true },
};

/**
 * Gera o HTML absolutely-positioned dos até 3 logos (logo1/logo2/logo3),
 * usando exatamente as mesmas regras que SharedReportSheet.tsx aplica no
 * navegador: posição em % da área útil da página (x/y/w/h salvos pelo
 * editor de layout), tamanho do logo em px (largura/altura configuradas),
 * limitado por maxWidth/maxHeight:100% da caixa de posição para não
 * invadir os blocos vizinhos.
 *
 * O contêiner que recebe este HTML precisa ter position:relative e as
 * mesmas dimensões da área útil (folha menos as margens) — exatamente
 * como o wrapper .shared-report-sheet-content de SharedReportSheet.tsx.
 */
export function renderLogoLayerHtml(
  positions: LogoLayerPositions | null | undefined,
  logos: Array<LogoLayerLogo | null | undefined> | null | undefined,
): string {
  const merged: LogoLayerPositions = { ...FALLBACK_LOGO_POSITIONS, ...(positions ?? {}) };
  const logoList = logos ?? [];
  return ["logo1", "logo2", "logo3"]
    .map((id, index) => {
      const position = merged[id];
      const logo = logoList[index];
      if (!position?.visible || !logo?.url) return "";
      const widthPx = logo.width ? `${logo.width}px` : "100%";
      const heightPx = logo.height ? `${logo.height}px` : "100%";
      const label = (logo.label || `Logo ${index + 1}`).replace(/"/g, "&quot;");
      return `<div style="position:absolute;left:${position.x}%;top:${position.y}%;width:${position.w}%;height:${position.h}%;display:flex;align-items:center;justify-content:center;padding:4px;z-index:2;" data-logo-layer-block="${id}"><img src="${logo.url}" alt="${label}" style="width:${widthPx};height:${heightPx};max-width:100%;max-height:100%;object-fit:contain;display:block;" /></div>`;
    })
    .join("");
}
