// Fonte única de verdade para como uma folha capturada via html2canvas é
// convertida em imagem para inserção no PDF (jsPDF `addImage`).
//
// Achado (relatório de homologação real Manus, 2026-10-17 — "RELATÓRIO —
// REVISÃO DA BRANCH HISTÓRICA E HOMOLOGAÇÃO REAL DE PDF/PAGINAÇÃO"): os
// três produtores de PDF (Editor, Lista PACS, Financeiro) usavam
// `canvas.toDataURL("image/png")` + `pdf.addImage(..., "PNG", ...)`. Num
// teste real em Chromium, o PDF financeiro de um laudo sintético de 72
// parágrafos (11 páginas, scale:2) pesou ~110 MiB — PNG é compressão sem
// perdas, então uma folha inteira capturada em alta resolução (scale:2)
// gera um arquivo de imagem gigantesco por página.
//
// Correção: trocar para JPEG com qualidade alta (perda visualmente
// imperceptível na grande maioria dos casos, mas MUITO menor em bytes,
// pois é compressão com perdas otimizada para fotos/rasterizações
// complexas). O relatório da Manus é explícito que essa troca NÃO deve
// ser automática sem homologação clínica (texto pequeno, carimbo e
// assinatura podem perder nitidez) — por isso o fator de qualidade abaixo
// fica centralizado aqui, documentado, e o handoff desta branch pede
// explicitamente a homologação visual real antes de considerar esta
// correção definitiva.
export const PDF_RASTER_IMAGE_FORMAT = "JPEG" as const;

/**
 * 0.92 foi escolhido como ponto de partida conservador: qualidade alta o
 * bastante para não introduzir artefatos visíveis em texto/assinatura/
 * carimbo em testes informais, mas já reduz drasticamente o tamanho do
 * arquivo frente a PNG sem perdas. Deve ser ajustado conforme o resultado
 * da homologação visual real pedida à Manus (comparação lado a lado,
 * zoom em assinatura/carimbo/texto pequeno, A4 e Letter).
 */
export const PDF_RASTER_IMAGE_QUALITY = 0.92;

/**
 * Converte um canvas capturado via html2canvas no par (dataURL, formato)
 * que deve ser passado a `pdf.addImage`. Usar esta função em vez de
 * chamar `canvas.toDataURL(...)` diretamente garante que os três
 * produtores de PDF (Editor, Lista PACS, Financeiro) nunca divirjam de
 * novo nesse ponto específico.
 */
export function canvasToPdfRasterImage(canvas: HTMLCanvasElement): {
  dataUrl: string;
  format: typeof PDF_RASTER_IMAGE_FORMAT;
} {
  return {
    dataUrl: canvas.toDataURL("image/jpeg", PDF_RASTER_IMAGE_QUALITY),
    format: PDF_RASTER_IMAGE_FORMAT,
  };
}
