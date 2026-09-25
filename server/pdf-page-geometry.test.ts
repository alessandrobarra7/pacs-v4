// Testes de regressão para o Bloqueio 1 (revisão corretiva Manus
// 2026-09-24): PDF Letter multisseção cortado no download financeiro do
// editor. Causa raiz: o contêiner multisseção ficava preso a 794px (largura
// A4) independente do pageSize configurado, e o jsPDF não garantia que a
// imagem capturada coubesse na altura física da página de destino.
//
// client/src/lib/pdfPageGeometry.ts extrai a geometria (largura/altura de
// página por pageSize) e o clamp de imagem para permitir testar a correção
// diretamente, sem precisar simular html2canvas/jsPDF.

import { describe, expect, it } from "vitest";
import { clampImageToPage, pageHeightMm, pageWidthMm } from "../client/src/lib/pdfPageGeometry";

describe("pageWidthMm / pageHeightMm — geometria física por pageSize", () => {
  it("Letter: 216mm x 279mm", () => {
    expect(pageWidthMm("Letter")).toBe(216);
    expect(pageHeightMm("Letter")).toBe(279);
  });

  it("A4: 210mm x 297mm", () => {
    expect(pageWidthMm("A4")).toBe(210);
    expect(pageHeightMm("A4")).toBe(297);
  });
});

describe("clampImageToPage — Bloqueio 1: não corta o rodapé em Letter multisseção", () => {
  it("não altera nada quando a imagem já cabe na altura da página", () => {
    const result = clampImageToPage(216, 200, 216, 279);
    expect(result).toEqual({ width: 216, height: 200, xOffset: 0 });
  });

  it("cenário do bloqueio: container preso em 794px (~210mm/A4) capturado e esticado para Letter (216mm) gera altura estourada — clamp reduz e centraliza", () => {
    // Reprodução do cenário relatado pela Manus: contêiner tinha largura
    // fixa A4 (794px ~ 210mm de captura), jsPDF configurado para Letter
    // (216mm de página). width já normalizado para 216mm (largura da
    // página de destino), mas height segue a proporção da captura A4
    // estreita — maior que os 279mm físicos de altura Letter.
    const pdfPageWidth = 216; // mm, Letter
    const pdfPageHeight = 279; // mm, Letter
    const capturedWidth = 210; // "largura" percebida da captura (antes do fix, presa em A4)
    const capturedHeight = 320; // altura da captura, além da altura física de destino

    // width normalizado para a largura da página (como o código de produção faz: `let width = pdfPageWidth`)
    const width = pdfPageWidth;
    const height = (capturedHeight * width) / capturedWidth; // proporção original, sem width ainda ajustado

    expect(height).toBeGreaterThan(pdfPageHeight); // confirma que sem o clamp haveria corte

    const result = clampImageToPage(width, height, pdfPageWidth, pdfPageHeight);

    expect(result.height).toBe(pdfPageHeight); // nunca ultrapassa a altura física da página
    expect(result.width).toBeLessThan(width); // reduzida proporcionalmente
    expect(result.width).toBeGreaterThan(0);
    // Centralizada horizontalmente: espaço sobrando dividido igualmente dos dois lados
    expect(result.xOffset).toBeCloseTo((pdfPageWidth - result.width) / 2, 6);
    expect(result.xOffset).toBeGreaterThan(0);
  });

  it("mantém a proporção original da imagem ao reduzir (aspect ratio preservado)", () => {
    const width = 216;
    const height = 350;
    const result = clampImageToPage(width, height, 216, 279);

    const originalRatio = width / height;
    const clampedRatio = result.width / result.height;
    expect(clampedRatio).toBeCloseTo(originalRatio, 6);
  });

  it("caso limite: altura exatamente igual à altura da página não aciona o clamp", () => {
    const result = clampImageToPage(216, 279, 216, 279);
    expect(result).toEqual({ width: 216, height: 279, xOffset: 0 });
  });

  it("A4 sem estouro (fluxo normal, sem margens/rodapé extremos) permanece intocado", () => {
    const result = clampImageToPage(210, 290, 210, 297);
    expect(result).toEqual({ width: 210, height: 290, xOffset: 0 });
  });
});
