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
