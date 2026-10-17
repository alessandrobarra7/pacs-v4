import { describe, expect, it, vi } from "vitest";
import {
  PDF_RASTER_IMAGE_FORMAT,
  PDF_RASTER_IMAGE_QUALITY,
  canvasToPdfRasterImage,
} from "../client/src/lib/pdfRasterExport";

/**
 * Regressão (achado do relatório de homologação real da Manus,
 * 2026-10-17 — "RELATÓRIO — REVISÃO DA BRANCH HISTÓRICA E HOMOLOGAÇÃO
 * REAL DE PDF/PAGINAÇÃO"): um PDF financeiro sintético de 72 parágrafos,
 * 11 páginas, scale:2, gerado com `canvas.toDataURL("image/png")`,
 * pesou ~110 MiB no teste real em Chromium — PNG é sem perdas, logo cada
 * folha capturada em alta resolução vira uma imagem enorme.
 *
 * Este teste prova, de forma real (não só grep de texto), que a função
 * compartilhada:
 *  1. chama `toDataURL` com "image/jpeg" (não mais "image/png");
 *  2. passa o fator de qualidade constante (0.92 — não é um valor
 *     silenciosamente diferente por chamada);
 *  3. devolve "JPEG" como formato, que é literalmente o que os três
 *     produtores (Editor, Lista PACS, Financeiro) passam a
 *     `pdf.addImage(...)` em vez de "PNG" hardcoded.
 */
describe("canvasToPdfRasterImage — correção do tamanho excessivo de PDF (PNG -> JPEG)", () => {
  it("usa JPEG com o fator de qualidade compartilhado, não PNG sem perdas", () => {
    const toDataURL = vi.fn((_mime: string, _quality?: number) => "data:image/jpeg;base64,FAKE");
    const fakeCanvas = { toDataURL } as unknown as HTMLCanvasElement;

    const result = canvasToPdfRasterImage(fakeCanvas);

    expect(toDataURL).toHaveBeenCalledTimes(1);
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", PDF_RASTER_IMAGE_QUALITY);
    expect(toDataURL).not.toHaveBeenCalledWith("image/png");
    expect(result.format).toBe("JPEG");
    expect(result.format).toBe(PDF_RASTER_IMAGE_FORMAT);
    expect(result.dataUrl).toBe("data:image/jpeg;base64,FAKE");
  });

  it("o fator de qualidade é um número alto (conservador), não um valor degradante", () => {
    // Guarda contra alguém reduzir a qualidade silenciosamente para um
    // valor que comprometa legibilidade de texto/assinatura/carimbo sem
    // passar por nova homologação visual.
    expect(PDF_RASTER_IMAGE_QUALITY).toBeGreaterThanOrEqual(0.85);
    expect(PDF_RASTER_IMAGE_QUALITY).toBeLessThanOrEqual(1);
  });
});
