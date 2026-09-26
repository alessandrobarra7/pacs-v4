// Testes de regressão para o "Relato técnico — Bloqueio de fallback e
// impressão oficial dos PDFs" (Manus, 2026-09-25), que revisou o commit
// 67f634f (handoff do ADENDO 4) e bloqueou merge/VM1 por um problema não
// coberto pelas rodadas anteriores: o fallback de captura do download
// rápido e a ação "Imprimir" (client/src/pages/PacsQueryPage.tsx) ainda
// usavam `fullHtml` — o HTML ORIGINAL, escrito antes de qualquer
// reconstrução paginada — em vez do documento já reconstruído em páginas
// físicas (`.print-page`) que o caminho normal de download usa. Um laudo
// de seção única longa, ou com uma seção não fragmentável, podia sair
// cortado por `overflow:hidden` tanto no fallback de falha de captura
// quanto na impressão oficial, mesmo já corrigido no download normal.
//
// A correção extraiu a reconstrução (antes só inline no bloco de
// download) para uma função compartilhada `reconstructPaginatedPages`,
// chamada pelos dois caminhos, e:
//   - o fallback de PdfCaptureError agora abre `paginatedHtmlForFallback`
//     (o HTML capturado LOGO APÓS a reconstrução ter sucesso), nunca mais
//     `fullHtml` original;
//   - a ação "Imprimir" agora executa a mesma reconstrução sobre o
//     próprio documento que será impresso, e só chama `print()`
//     explicitamente depois que ela tiver sucesso — o script de
//     auto-print embutido em `fullHtml` é removido antes de escrever o
//     documento, para não competir com esse fluxo controlado.
//
// LIMITAÇÃO DE TESTABILIDADE: `executePrintAction` é um handler inline
// gigante dentro de um componente React com muitas dependências de tRPC,
// sessionStorage e DOM/layout reais — não há (ainda) uma extração para
// funções puras testáveis com um DOM real. Como as rodadas anteriores já
// estabeleceram (Bloqueios 1 e 3 do parecer v3), esses testes são de
// WIRING (leitura de fonte), confirmando que a estrutura do código
// implementa a correção descrita — não substituem a validação visual real
// em Chromium (forçar falha de html2canvas, capturar o HTML aberto pelo
// fallback e confirmar as folhas físicas, e observar a impressão real),
// que a Manus pediu explicitamente na seção 6 do relato e que só um
// navegador real pode confirmar.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pacsQuerySource = readFileSync(
  resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"),
  "utf8",
);

describe("Relato técnico — fallback de captura e impressão oficial usam a mesma reconstrução paginada do download", () => {
  it("FASE 3 (26/09/2026): a reconstrução paginada (antes uma função local reconstructPaginatedPages) foi substituída pela fábrica canônica renderAllPhysicalPagesHtml, chamada pelos dois caminhos (download e impressão)", () => {
    // A extração compartilhada `reconstructPaginatedPages` (que existia só
    // dentro de PacsQueryPage.tsx) deixou de existir: a reconstrução real
    // agora é `renderAllPhysicalPagesHtml` (client/src/lib/
    // reportDocumentRenderer.tsx, Fase 2), a MESMA função usada por
    // financialReportPdfDownload.ts — não uma cópia local.
    expect(pacsQuerySource).not.toContain("const reconstructPaginatedPages = async");
    expect(pacsQuerySource).toContain('from "@/lib/reportDocumentRenderer"');

    const branchIndex = pacsQuerySource.indexOf("if (actionType === 'download')");
    expect(branchIndex).toBeGreaterThan(0);

    // Duas chamadas: uma no download (renderAllPhysicalPagesHtml(doc, ...)),
    // outra na impressão oficial (renderAllPhysicalPagesHtml(pDoc, ...),
    // dentro do callback `reconstruct` passado a runControlledPrint — ver
    // server/print-orchestration.test.ts para a cobertura comportamental
    // completa desse caminho).
    expect(pacsQuerySource).toContain("renderAllPhysicalPagesHtml(doc, modelQ)");
    expect(pacsQuerySource).toContain("renderAllPhysicalPagesHtml(pDoc, modelQ)");
  });

  it("o fallback de PdfCaptureError abre o HTML JÁ paginado (paginatedHtmlForFallback), nunca o shell mínimo original", () => {
    expect(pacsQuerySource).toContain("let paginatedHtmlForFallback: string | null = null;");
    // A captura acontece logo após renderAllPhysicalPagesHtml(doc, ...) ter
    // sido escrito no DOM (equivalente, na nova arquitetura, ao antigo
    // "reconstructPaginatedPages ter sucesso").
    expect(pacsQuerySource).toMatch(
      /doc\.body\.innerHTML = `\$\{draftWatermarkHtmlQ\}[\s\S]{0,900}paginatedHtmlForFallback = `<!DOCTYPE html>\\n\$\{doc\.documentElement\.outerHTML\}`;/,
    );
    // O ramo de PdfCaptureError agora exige paginatedHtmlForFallback e usa
    // exatamente essa variável no Blob — não o shell mínimo original.
    expect(pacsQuerySource).toContain("err instanceof PdfCaptureError && paginatedHtmlForFallback");
    expect(pacsQuerySource).toContain("new Blob([paginatedHtmlForFallback]");
    // Não deve sobrar nenhum caminho que abra minimalShellHtmlQ cru num
    // Blob de fallback (o único uso em Blob deve ser o já paginado).
    expect(pacsQuerySource).not.toContain("new Blob([minimalShellHtmlQ]");
  });

  it("a ação 'Imprimir' não remove mais nada por regex — o shell mínimo nunca contém script de auto-print, e print() é disparado via runControlledPrint depois da reconstrução (renderAllPhysicalPagesHtml)", () => {
    // A correção original eliminou o script de auto-print na origem; ver
    // server/print-orchestration.test.ts para a cobertura comportamental
    // completa (runControlledPrint) e a confirmação de que o shell mínimo
    // não contém window.onload/print(). Nesta migração (Fase 3), o passo
    // de "reconstrução" deixou de ser uma função nomeada
    // (reconstructPaginatedPages) e passou a ser um closure inline que
    // chama renderAllPhysicalPagesHtml — a garantia de ordem (reconstruir
    // antes de print()) é a mesma.
    const elseBranchIndex = pacsQuerySource.indexOf("    } else {", pacsQuerySource.indexOf("if (actionType === 'download')"));
    expect(elseBranchIndex).toBeGreaterThan(0);
    const elseBranchSlice = pacsQuerySource.slice(elseBranchIndex, elseBranchIndex + 4000);

    expect(elseBranchSlice).not.toContain("printHtmlWithoutAutoPrint");
    expect(elseBranchSlice).toContain("pDoc.write(minimalShellHtmlQ);");
    expect(elseBranchSlice).toContain("runControlledPrint({");
    expect(elseBranchSlice).toContain("reconstruct: async () => {");
    expect(elseBranchSlice).toContain("renderAllPhysicalPagesHtml(pDoc, modelQ)");
    expect(elseBranchSlice).toContain("printIframe.contentWindow?.print();");

    // A chamada de print() (dentro do callback `print`) deve vir DEPOIS
    // da chamada a runControlledPrint que recebe o closure `reconstruct`.
    const runCallIdx = elseBranchSlice.indexOf("runControlledPrint({");
    const printCallIdx = elseBranchSlice.indexOf("printIframe.contentWindow?.print();");
    expect(runCallIdx).toBeGreaterThan(0);
    expect(printCallIdx).toBeGreaterThan(runCallIdx);
  });

  it("a ação 'Imprimir' não abre mais o diálogo de impressão automaticamente a partir do fullHtml original sem reconstrução (erro de preparo não chama print())", () => {
    const elseBranchIndex = pacsQuerySource.indexOf("    } else {", pacsQuerySource.indexOf("if (actionType === 'download')"));
    const elseBranchSlice = pacsQuerySource.slice(elseBranchIndex, elseBranchIndex + 4000);
    // A chamada de print() está dentro do try, então uma falha em
    // reconstructPaginatedPages (lançada antes de print()) impede
    // qualquer print() de ser chamado — confirmado pela ordem sequencial
    // acima. Aqui confirmamos que existe tratamento de erro dedicado que
    // não chama print() no catch.
    expect(elseBranchSlice).toMatch(/\} catch \(err\) \{[\s\S]*?toast\.error\('Não foi possível preparar a impressão/);
    const catchIdx = elseBranchSlice.indexOf("} catch (err) {");
    const catchSlice = elseBranchSlice.slice(catchIdx, catchIdx + 800);
    expect(catchSlice).not.toContain(".print()");
  });

  it("download e impressão compartilham as mesmas dimensões de página (pageWidthPxQ/pageHeightPxQ), calculadas uma única vez", () => {
    const widthDeclCount = (pacsQuerySource.match(/const pageWidthPxQ = pageWidthPx\(pageSizeQ\);/g) ?? []).length;
    const heightDeclCount = (pacsQuerySource.match(/const pageHeightPxQ = pageHeightPx\(pageSizeQ\);/g) ?? []).length;
    expect(widthDeclCount).toBe(1);
    expect(heightDeclCount).toBe(1);
    // O iframe de impressão oficial agora também é dimensionado com as
    // mesmas dimensões físicas da página, assim como o iframe de download.
    expect(pacsQuerySource).toContain("printIframe.style.width = `${pageWidthPxQ}px`;");
    expect(pacsQuerySource).toContain("printIframe.style.height = `${pageHeightPxQ}px`;");
  });
});
