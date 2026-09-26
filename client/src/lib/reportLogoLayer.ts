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
// nenhum bloco editável do layout.
//
// Este módulo extrai a MESMA lógica de posicionamento de logo que
// SharedReportSheet.tsx usa (posição x/y/w/h percentual da área útil +
// largura/altura em px do logo, com maxWidth/maxHeight:100% para não
// invadir blocos vizinhos) para uma função pura e testável, usada pela
// reconstrução paginada (via string HTML).
//
// REVISÃO (parecer de bloqueio da Manus, 2026-09-25, 4 bloqueios
// confirmados e corrigidos aqui):
//   B1 — sistema de coordenadas: não é responsabilidade deste módulo (o
//        x/y/w/h em % já é relativo à área útil, por definição); o bug
//        estava no wrapper `inset:0` em PacsQueryPage.tsx, que usava a
//        borda externa da folha em vez das margens efetivas — corrigido
//        lá (top/right/bottom/left = margens), não aqui.
//   B2 — fallback de logo legado (units.logo_url quando não há
//        model_layouts.logos): corrigido em PacsQueryPage.tsx
//        (printLogosWithFallbackQ), não neste módulo.
//   B3 — a expansão de compatibilidade de `positions.logo` (chave legada
//        de layouts antigos, sem logo1/logo2/logo3) existia em
//        SharedReportSheet.tsx mas não tinha equivalente aqui — um layout
//        com essa chave legada divergia de novo entre editor e PDF.
//        Reproduzida abaixo em expandLegacyLogoPosition, com o mesmo
//        algoritmo (deve ser mantida em sincronia manual com
//        SharedReportSheet.tsx; ambas têm um comentário cruzado).
//   B4 — injeção de HTML/atributo via url/label do logo: a função gerava
//        `<img src="${logo.url}">` por interpolação direta, sem escapar
//        aspas nem validar o esquema da URL — uma URL como
//        `https://x" onerror="..."` produzia um atributo de evento
//        executável no HTML gerado. Corrigido com escapeHtmlAttribute,
//        isSafeImageUrl (só data:image/... ou http(s)://) e normalização
//        numérica (clampFinite) antes de serializar em CSS.

export type LogoLayerPosition = { x: number; y: number; w: number; h: number; visible: boolean };
export type LogoLayerPositions = Record<string, LogoLayerPosition>;
export type LogoLayerLogo = { url: string; width?: number; height?: number; label?: string };

const FALLBACK_LOGO_POSITIONS: LogoLayerPositions = {
  logo1: { x: 2, y: 2, w: 26, h: 11, visible: true },
  logo2: { x: 37, y: 2, w: 26, h: 11, visible: true },
  logo3: { x: 72, y: 2, w: 26, h: 11, visible: true },
};

// B4 — escapa um valor para uso seguro dentro de um atributo HTML
// delimitado por aspas duplas. Cobre os 5 caracteres que importam nesse
// contexto (o `"` é o que fecha o atributo; os demais evitam que o valor
// seja interpretado como marcação).
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// B4 — só permite os esquemas de imagem realmente usados pelo app: uma
// data URL de imagem (logo já convertido para base64 por fetchToBase64)
// ou uma URL http(s) absoluta (fallback quando a conversão para base64
// falha silenciosamente em PacsQueryPage.tsx e a URL original é mantida).
// Qualquer outro esquema (javascript:, vbscript:, um valor com aspas ou
// atributo embutido etc.) é rejeitado — o logo é omitido em vez de gerar
// HTML com uma fonte não confiável.
function isSafeImageUrl(url: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(url) || /^https?:\/\//i.test(url);
}

// B4 — normaliza um número vindo de configuração (banco de dados) para um
// valor finito dentro de limites, antes de ser interpolado em CSS. Um
// valor não numérico, Infinity/NaN ou fora da faixa nunca deve alcançar o
// HTML gerado.
function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// B3 — mesma regra de compatibilidade de SharedReportSheet.tsx: layouts
// antigos persistiam uma única chave `positions.logo` (sem logo1/logo2/
// logo3). Esta função expande esse bloco legado para os 3 slots que ainda
// não têm posição própria, com o mesmo cálculo de deslocamento em x
// (`step`) usado no componente React. MANTER EM SINCRONIA MANUAL com o
// bloco `legacyLogo` em SharedReportSheet.tsx — qualquer mudança lá deve
// ser replicada aqui (e vice-versa), porque não há um módulo comum entre
// o componente React (SharedReportSheet.tsx) e este gerador de string
// HTML puro.
function expandLegacyLogoPosition(
  positions: LogoLayerPositions,
): LogoLayerPositions {
  const legacyLogo = positions.logo;
  if (!legacyLogo) return positions;
  const expanded: LogoLayerPositions = { ...positions };
  ["logo1", "logo2", "logo3"].forEach((id, index) => {
    if (!positions[id]) {
      const step = Math.min(24, legacyLogo.w + 4);
      expanded[id] = {
        ...FALLBACK_LOGO_POSITIONS[id],
        ...legacyLogo,
        x: Math.max(0, Math.min(100 - legacyLogo.w, legacyLogo.x + index * step)),
        y: Math.max(0, Math.min(100 - legacyLogo.h, legacyLogo.y)),
      };
    }
  });
  return expanded;
}

/**
 * Gera o HTML absolutely-positioned dos até 3 logos (logo1/logo2/logo3),
 * usando exatamente as mesmas regras que SharedReportSheet.tsx aplica no
 * navegador: posição em % da área útil da página (x/y/w/h salvos pelo
 * editor de layout), tamanho do logo em px (largura/altura configuradas),
 * limitado por maxWidth/maxHeight:100% da caixa de posição para não
 * invadir os blocos vizinhos.
 *
 * O contêiner que recebe este HTML precisa ter position:relative (ou
 * position:absolute com offset a partir da área útil, ver comentário do
 * Bloqueio 1 em PacsQueryPage.tsx) e as mesmas dimensões da área útil
 * (folha menos as margens) — exatamente como o wrapper
 * .shared-report-sheet-content de SharedReportSheet.tsx.
 */
export function renderLogoLayerHtml(
  positions: LogoLayerPositions | null | undefined,
  logos: Array<LogoLayerLogo | null | undefined> | null | undefined,
): string {
  const withLegacyExpanded = expandLegacyLogoPosition(positions ?? {});
  const merged: LogoLayerPositions = { ...FALLBACK_LOGO_POSITIONS, ...withLegacyExpanded };
  const logoList = logos ?? [];
  return ["logo1", "logo2", "logo3"]
    .map((id, index) => {
      const position = merged[id];
      const logo = logoList[index];
      if (!position?.visible || !logo?.url) return "";
      if (!isSafeImageUrl(logo.url)) return "";

      const x = clampFinite(position.x, 0, 100, FALLBACK_LOGO_POSITIONS[id].x);
      const y = clampFinite(position.y, 0, 100, FALLBACK_LOGO_POSITIONS[id].y);
      const w = clampFinite(position.w, 0, 100, FALLBACK_LOGO_POSITIONS[id].w);
      const h = clampFinite(position.h, 0, 100, FALLBACK_LOGO_POSITIONS[id].h);
      const widthPx = logo.width ? `${clampFinite(logo.width, 1, 2000, 100)}px` : "100%";
      const heightPx = logo.height ? `${clampFinite(logo.height, 1, 2000, 100)}px` : "100%";

      const safeUrl = escapeHtmlAttribute(logo.url);
      const safeLabel = escapeHtmlAttribute(logo.label || `Logo ${index + 1}`);
      const safeId = escapeHtmlAttribute(id);

      return `<div style="position:absolute;left:${x}%;top:${y}%;width:${w}%;height:${h}%;display:flex;align-items:center;justify-content:center;padding:4px;z-index:2;" data-logo-layer-block="${safeId}"><img src="${safeUrl}" alt="${safeLabel}" style="width:${widthPx};height:${heightPx};max-width:100%;max-height:100%;object-fit:contain;display:block;" /></div>`;
    })
    .join("");
}
