// Funções puras de geometria de página usadas no editor de laudos para o
// PDF Letter/A4 (Bloqueio 1, revisão corretiva Manus 2026-09-24).
//
// Extraídas para permitir testes de regressão diretos, sem precisar
// simular jsPDF/html2canvas: a largura física de página deriva de
// `pageSize`, e o clamp evita que uma imagem capturada mais alta que a
// página de destino seja cortada, reduzindo proporcionalmente e
// centralizando.

export type PageSize = "A4" | "Letter";

/** Largura física da página em mm, mesma convenção usada em toda a folha compartilhada. */
export const pageWidthMm = (pageSize: PageSize): number => (pageSize === "Letter" ? 216 : 210);

/** Altura física da página em mm, mesma convenção usada em toda a folha compartilhada. */
export const pageHeightMm = (pageSize: PageSize): number => (pageSize === "Letter" ? 279 : 297);

export interface ClampedImagePlacement {
  width: number;
  height: number;
  xOffset: number;
}

/**
 * Ajusta as dimensões de uma imagem capturada (largura já igual à largura
 * da página de destino) para nunca ultrapassar a altura física da página.
 * Se a altura calculada por proporção ultrapassar a altura da página,
 * reduz width/height proporcionalmente e centraliza horizontalmente —
 * salvaguarda contra corte de conteúdo no rodapé quando a origem
 * capturada não bate exatamente com a geometria da página de destino.
 */
export const clampImageToPage = (
  width: number,
  height: number,
  pdfPageWidth: number,
  pdfPageHeight: number,
): ClampedImagePlacement => {
  if (height <= pdfPageHeight) {
    return { width, height, xOffset: 0 };
  }
  const scale = pdfPageHeight / height;
  const clampedHeight = pdfPageHeight;
  const clampedWidth = width * scale;
  const xOffset = (pdfPageWidth - clampedWidth) / 2;
  return { width: clampedWidth, height: clampedHeight, xOffset };
};

export const MM_TO_PX_96DPI = 3.7795275591;

/** Largura física da página em pixels a 96dpi, para dimensionar o iframe/janela de captura do html2canvas. */
export const pageWidthPx = (pageSize: PageSize): number => Math.round(pageWidthMm(pageSize) * MM_TO_PX_96DPI);

/** Altura física da página em pixels a 96dpi, para dimensionar o iframe/janela de captura do html2canvas. */
export const pageHeightPx = (pageSize: PageSize): number => Math.round(pageHeightMm(pageSize) * MM_TO_PX_96DPI);

/**
 * Localiza as folhas reais de um documento de impressão/PDF gerado pelo
 * editor de laudos: `.print-page` (uma por seção, modo multisseção) ou
 * `.print-shared-sheet` (folha única). Cai em `[doc.body]` apenas quando
 * nenhuma das duas classes existir (documento fora do padrão esperado).
 *
 * Extraída para corrigir e prevenir a regressão do Achado 1 (auditoria
 * independente 2026-09-25, confirmada pela Manus): o seletor `.sheet`
 * usado antes em PacsQueryPage.tsx nunca casava com nenhum elemento real
 * do HTML gerado, então SEMPRE caía no fallback `doc.body` — para um
 * laudo multisseção, isso capturava todas as folhas empilhadas como uma
 * única imagem, inserida numa única página de PDF.
 */
export const resolvePdfPageElements = (doc: Document): HTMLElement[] => {
  const pages = Array.from(doc.querySelectorAll<HTMLElement>(".print-page, .print-shared-sheet"));
  return pages.length > 0 ? pages : [doc.body];
};

export interface PdfPageBatchEntry extends ClampedImagePlacement {
  /** true para toda folha exceto a primeira — indica que o chamador deve inserir `pdf.addPage()` antes desta entrada. */
  addPageBefore: boolean;
}

/**
 * Calcula, para uma lista de canvases já capturados (um por folha), a
 * posição/dimensão final de cada imagem no PDF de destino — width da
 * página, altura por proporção, com `clampImageToPage` aplicado
 * individualmente a cada folha, e `addPageBefore` marcando toda entrada
 * após a primeira.
 *
 * Extraída para permitir provar, sem precisar de um motor de renderização
 * real (jsPDF/html2canvas), que N folhas capturadas resultam em N entradas
 * — ou seja, N páginas no PDF final, uma por folha, nunca uma única imagem
 * com todas as folhas espremidas juntas (o defeito do Achado 1).
 */
export const buildPdfPageBatch = (
  canvases: Array<{ width: number; height: number }>,
  pdfPageWidth: number,
  pdfPageHeight: number,
): PdfPageBatchEntry[] => {
  return canvases.map((canvas, index) => {
    const rawHeight = (canvas.height * pdfPageWidth) / canvas.width;
    const clamped = clampImageToPage(pdfPageWidth, rawHeight, pdfPageWidth, pdfPageHeight);
    return { ...clamped, addPageBefore: index > 0 };
  });
};
