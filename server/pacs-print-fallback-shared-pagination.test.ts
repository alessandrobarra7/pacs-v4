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
  it("reconstructPaginatedPages é declarada uma única vez, ANTES da ramificação download/impressão, e usada pelos dois caminhos", () => {
    const declarationCount = (pacsQuerySource.match(/const reconstructPaginatedPages = async/g) ?? []).length;
    expect(declarationCount).toBe(1);

    const declarationIndex = pacsQuerySource.indexOf("const reconstructPaginatedPages = async");
    const branchIndex = pacsQuerySource.indexOf("if (actionType === 'download')");
    expect(declarationIndex).toBeGreaterThan(0);
    expect(branchIndex).toBeGreaterThan(declarationIndex);

    // Duas chamadas: uma no download, outra na impressão oficial.
    const callCount = (pacsQuerySource.match(/await reconstructPaginatedPages\(/g) ?? []).length;
    expect(callCount).toBe(2);
  });

  it("o fallback de PdfCaptureError abre o HTML JÁ paginado (paginatedHtmlForFallback), nunca mais o fullHtml original", () => {
    expect(pacsQuerySource).toContain("let paginatedHtmlForFallback: string | null = null;");
    // A captura acontece logo após reconstructPaginatedPages ter sucesso.
    expect(pacsQuerySource).toMatch(
      /await reconstructPaginatedPages\(doc\);[\s\S]{0,300}paginatedHtmlForFallback = `<!DOCTYPE html>\\n\$\{doc\.documentElement\.outerHTML\}`;/,
    );
    // O ramo de PdfCaptureError agora exige paginatedHtmlForFallback e usa
    // exatamente essa variável no Blob — não `fullHtml`.
    expect(pacsQuerySource).toContain("err instanceof PdfCaptureError && paginatedHtmlForFallback");
    expect(pacsQuerySource).toContain("new Blob([paginatedHtmlForFallback]");
    // Não deve sobrar nenhum caminho que abra `fullHtml` cru num Blob de
    // fallback (o único uso de fullHtml em Blob deve ser o paginado).
    expect(pacsQuerySource).not.toContain("new Blob([fullHtml], { type: 'text/html;charset=utf-8' })");
  });

  it("a ação 'Imprimir' remove o script de auto-print embutido em fullHtml e só chama print() explicitamente após reconstructPaginatedPages", () => {
    // O bloco else (ação 'print') deve conter a reconstrução e a chamada
    // explícita de print(), nessa ordem.
    const elseBranchIndex = pacsQuerySource.indexOf("    } else {", pacsQuerySource.indexOf("if (actionType === 'download')"));
    expect(elseBranchIndex).toBeGreaterThan(0);
    const elseBranchSlice = pacsQuerySource.slice(elseBranchIndex, elseBranchIndex + 4000);

    expect(elseBranchSlice).toContain("printHtmlWithoutAutoPrint");
    expect(elseBranchSlice).toContain("await reconstructPaginatedPages(pDoc);");
    expect(elseBranchSlice).toContain("printIframe.contentWindow?.print();");

    // A chamada de print() deve vir DEPOIS da reconstrução, não antes.
    const reconstructIdx = elseBranchSlice.indexOf("await reconstructPaginatedPages(pDoc);");
    const printCallIdx = elseBranchSlice.indexOf("printIframe.contentWindow?.print();");
    expect(reconstructIdx).toBeGreaterThan(0);
    expect(printCallIdx).toBeGreaterThan(reconstructIdx);
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
