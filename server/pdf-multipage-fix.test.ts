// Testes de regressão para os Achados 1 e 2 da auditoria independente de
// 2026-09-25 (confirmados pela Manus em
// PARECER_CONFERENCIA_AUDITORIA_SETOR_LAUDOS_2026-09-25.txt).
//
// Achado 1: PacsQueryPage.tsx (download pela "impressão rápida" da lista
// de exames) usava o seletor `.sheet`, que nunca existia no HTML gerado —
// sempre caía no fallback `doc.body`, capturando TODAS as folhas de um
// laudo multisseção como uma única imagem, inserida numa única página de
// PDF, sem `pdf.addPage()` nem proteção de altura.
//
// Achado 2: financialReportPdfDownload.ts (PDF do módulo Financeiro, tela
// "Meu Financeiro" do médico) usava um iframe de captura fixo em
// 794x1123px (proporção A4) e `windowWidth: 794` fixo, independente do
// pageSize efetivo da unidade, sem usar o módulo compartilhado
// pdfPageGeometry.ts — divergente das outras 3 vias já corrigidas.
//
// A Manus pediu explicitamente testes que "simulem ou extraiam a
// resolução de alvos e confirmem que duas folhas resultam em duas
// capturas e duas páginas de PDF", cobrindo A4, Letter, folha única e
// multisseção — não apenas busca textual de que pageSize aparece no
// arquivo. Os testes abaixo exercitam diretamente as funções de produção
// extraídas para client/src/lib/pdfPageGeometry.ts:
// resolvePdfPageElements (com um DOM jsdom real) e buildPdfPageBatch (com
// dimensões de canvas simuladas, sem precisar de html2canvas/jsPDF reais).
//
// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  buildPdfPageBatch,
  pageHeightMm,
  pageHeightPx,
  pageWidthMm,
  pageWidthPx,
  resolvePdfPageElements,
} from "../client/src/lib/pdfPageGeometry";

describe("resolvePdfPageElements — Achado 1: seletor real de folhas (DOM jsdom real)", () => {
  it("localiza as duas folhas de um laudo multisseção (.print-page), nunca doc.body", () => {
    document.body.innerHTML = `
      <div class="page-number-fixed"></div>
      <div class="print-page" data-page="1">Seção 1</div>
      <div class="print-page" data-page="2">Seção 2</div>
    `;
    const elements = resolvePdfPageElements(document);
    expect(elements).toHaveLength(2);
    expect(elements[0].getAttribute("data-page")).toBe("1");
    expect(elements[1].getAttribute("data-page")).toBe("2");
    // nenhuma das folhas resolvidas é o próprio body inteiro
    expect(elements[0]).not.toBe(document.body);
    expect(elements[1]).not.toBe(document.body);
  });

  it("localiza a folha única (.print-shared-sheet) de um laudo de seção única", () => {
    document.body.innerHTML = `
      <div class="page-number-fixed"></div>
      <div class="print-shared-sheet" data-page="unica">Conteúdo</div>
    `;
    const elements = resolvePdfPageElements(document);
    expect(elements).toHaveLength(1);
    expect(elements[0].getAttribute("data-page")).toBe("unica");
  });

  it("cai em [doc.body] apenas quando nenhuma folha real existe (documento fora do padrão)", () => {
    document.body.innerHTML = `<div class="conteudo-generico">Sem classe de folha</div>`;
    const elements = resolvePdfPageElements(document);
    expect(elements).toHaveLength(1);
    expect(elements[0]).toBe(document.body);
  });

  it("nunca casa com o seletor antigo e quebrado '.sheet' (regressão direta do Achado 1)", () => {
    document.body.innerHTML = `
      <div class="print-page">Seção 1</div>
      <div class="print-page">Seção 2</div>
      <div class="print-page">Seção 3</div>
    `;
    // O bug original era `doc.querySelector('.sheet') || doc.body` — como
    // nenhum elemento tem classe "sheet", isso sempre resolvia para
    // doc.body (as 3 folhas juntas). Confirma que a nova resolução nunca
    // colapsa múltiplas folhas em uma única.
    expect(document.querySelector(".sheet")).toBeNull();
    const elements = resolvePdfPageElements(document);
    expect(elements).toHaveLength(3);
  });
});

describe("buildPdfPageBatch — Achado 1 e 2: N folhas capturadas geram N páginas de PDF", () => {
  it("duas folhas (canvases) resultam em exatamente duas entradas, a segunda com addPageBefore=true", () => {
    // Simula duas capturas html2canvas de folhas A4 corretamente
    // dimensionadas (794x1123px a escala 2 = 1588x2246), sem precisar
    // rodar html2canvas/jsPDF de verdade.
    const canvases = [
      { width: 1588, height: 2246 },
      { width: 1588, height: 2246 },
    ];
    const pdfPageWidth = pageWidthMm("A4");
    const pdfPageHeight = pageHeightMm("A4");
    const batch = buildPdfPageBatch(canvases, pdfPageWidth, pdfPageHeight);

    expect(batch).toHaveLength(2);
    expect(batch[0].addPageBefore).toBe(false);
    expect(batch[1].addPageBefore).toBe(true);
  });

  it("uma folha única resulta em exatamente uma entrada, sem addPage", () => {
    const canvases = [{ width: 1588, height: 2246 }];
    const batch = buildPdfPageBatch(canvases, pageWidthMm("A4"), pageHeightMm("A4"));
    expect(batch).toHaveLength(1);
    expect(batch[0].addPageBefore).toBe(false);
  });

  it("cinco folhas resultam em cinco entradas, com addPageBefore=true em todas exceto a primeira", () => {
    const canvases = Array.from({ length: 5 }, () => ({ width: 1588, height: 2246 }));
    const batch = buildPdfPageBatch(canvases, pageWidthMm("A4"), pageHeightMm("A4"));
    expect(batch).toHaveLength(5);
    expect(batch.map((entry) => entry.addPageBefore)).toEqual([false, true, true, true, true]);
  });

  it("aplica o clamp de altura por folha em Letter, preservando a proporção de cada folha individualmente", () => {
    // Uma folha com proporção ligeiramente maior que a página Letter física,
    // e outra com a proporção exata da página (216/279) — calculada
    // programaticamente para não depender de arredondamento manual.
    const pdfPageWidth = pageWidthMm("Letter");
    const pdfPageHeight = pageHeightMm("Letter");
    const canvasWidthPx = 1600;
    const exactHeightPx = (pdfPageHeight / pdfPageWidth) * canvasWidthPx; // proporção exata da página
    const canvases = [
      { width: canvasWidthPx, height: exactHeightPx * 1.15 }, // 15% mais alta que a proporção da página — estourada
      { width: canvasWidthPx, height: exactHeightPx },        // proporção exata — não deve precisar de clamp
    ];
    const batch = buildPdfPageBatch(canvases, pdfPageWidth, pdfPageHeight);

    // Primeira folha: altura calculada por proporção ultrapassa a página, deve ser clampada
    const rawHeightFirst = (canvases[0].height * pdfPageWidth) / canvases[0].width;
    expect(rawHeightFirst).toBeGreaterThan(pdfPageHeight);
    expect(batch[0].height).toBe(pdfPageHeight);
    expect(batch[0].width).toBeLessThan(pdfPageWidth);
    expect(batch[0].xOffset).toBeGreaterThan(0);

    // Segunda folha: proporção exata da página, não deve sofrer nenhum clamp
    expect(batch[1].height).toBeCloseTo(pdfPageHeight, 5);
    expect(batch[1].width).toBeCloseTo(pdfPageWidth, 5);
    expect(batch[1].xOffset).toBeCloseTo(0, 5);
  });

  it("A4: nenhuma folha bem proporcionada é indevidamente clampada", () => {
    const pdfPageWidth = pageWidthMm("A4");
    const pdfPageHeight = pageHeightMm("A4");
    // proporção exata de A4 (210/297)
    const canvases = [{ width: 2100, height: 2970 }];
    const batch = buildPdfPageBatch(canvases, pdfPageWidth, pdfPageHeight);
    expect(batch[0].width).toBeCloseTo(pdfPageWidth, 5);
    expect(batch[0].height).toBeCloseTo(pdfPageHeight, 5);
    expect(batch[0].xOffset).toBeCloseTo(0, 5);
  });
});

describe("pageWidthPx / pageHeightPx — dimensão de captura (iframe/windowWidth) por pageSize", () => {
  it("A4 e Letter derivam pixels físicos distintos (nunca 794 fixo para Letter)", () => {
    const a4Width = pageWidthPx("A4");
    const letterWidth = pageWidthPx("Letter");
    expect(a4Width).not.toBe(letterWidth);
    expect(letterWidth).toBeGreaterThan(a4Width);
    // 210mm a 96dpi ≈ 794px (a constante hardcoded que causava o Achado 2)
    expect(a4Width).toBe(794);
    // 216mm a 96dpi ≈ 816px — Letter NUNCA deveria usar 794 fixo
    expect(letterWidth).toBeGreaterThan(794);
  });

  it("A4 e Letter derivam alturas físicas distintas (nunca 1123 fixo para Letter)", () => {
    const a4Height = pageHeightPx("A4");
    const letterHeight = pageHeightPx("Letter");
    expect(a4Height).toBe(1123);
    expect(letterHeight).not.toBe(1123);
    expect(letterHeight).toBeLessThan(a4Height); // Letter é mais curto que A4 (279mm vs 297mm)
  });
});
