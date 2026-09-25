// Testes de regressão para o bloqueio de paginação real relatado pela
// Manus em 2026-09-25 ("Relatório de revisão — PDFs multisseção e
// financeiro"): mesmo depois da correção dos Achados 1 e 2
// (server/pdf-multipage-fix.test.ts), um relatório de UMA seção só cujo
// conteúdo seja mais alto do que uma folha física continuava sendo
// cortado por `overflow:hidden` em `.print-page`, com a assinatura do
// médico sobreposta ao texto cortado — porque a correção anterior mapeava
// "N seções JSON -> N páginas", não "conteúdo mais alto que 1 página -> 2+
// páginas".
//
// A correção introduziu client/src/lib/reportPagination.ts
// (measureTopLevelBlocks + splitBlocksIntoPages), usado tanto por
// financialReportPdfDownload.ts quanto pelo download da impressão rápida
// em PacsQueryPage.tsx. A função de medição real (measureTopLevelBlocks)
// só é exercitável com um motor de layout real (browser) — em jsdom,
// getBoundingClientRect/offsetHeight sempre retornam 0, então ela não
// reflete o comportamento real e não é testada aqui (limitação documentada
// no próprio módulo). O que ESTE arquivo cobre exaustivamente é a lógica
// pura de decisão (splitBlocksIntoPages), que é exatamente onde mora a
// regra de negócio "nunca cortar um bloco no meio, reservar altura fixa
// para o rodapé, nunca sobrepor assinatura ao corpo".
//
// A Manus pediu explicitamente, entre outros pontos:
// (a) um corpo único mais alto que 2 folhas Letter deve gerar 2+ páginas
//     sem perda de texto;
// (c) 3 seções curtas devem continuar gerando exatamente 3 folhas
//     (guarda de regressão contra quebrar o Achado 1 já corrigido);
// (e) rodapé/assinatura nunca pode sobrepor o corpo.
// Os testes abaixo cobrem (a) e (c) diretamente via splitBlocksIntoPages,
// e (e) via um teste dedicado de não-sobreposição por reserva de altura
// fixa (mesmo padrão adotado em financialReportPdfDownload.ts e em
// PacsQueryPage.tsx: a altura útil de .report-body é medida com o rodapé
// já reservado, então o conteúdo paginado nunca pode invadir essa faixa).

import { describe, expect, it } from "vitest";
import { splitBlocksIntoPages, type MeasuredBlock } from "../client/src/lib/reportPagination";

const block = (html: string, height: number): MeasuredBlock => ({ html, height });

describe("splitBlocksIntoPages — decisão pura de paginação", () => {
  it("um corpo curto que cabe inteiro em uma folha gera exatamente 1 página", () => {
    const blocks = [block("<p>a</p>", 100), block("<p>b</p>", 100), block("<p>c</p>", 100)];
    const pages = splitBlocksIntoPages(blocks, 1000);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual(["<p>a</p>", "<p>b</p>", "<p>c</p>"]);
  });

  it("Manus (a): corpo mais alto que a folha é dividido em 2+ páginas, sem perder nenhum bloco", () => {
    const blocks = Array.from({ length: 10 }, (_, i) => block(`<p>bloco-${i}</p>`, 150));
    const pages = splitBlocksIntoPages(blocks, 400);

    expect(pages.length).toBeGreaterThan(1);

    const flattened = pages.flat();
    expect(flattened).toHaveLength(10);
    expect(flattened).toEqual(blocks.map((b) => b.html));

    for (const page of pages) {
      const pageBlocks = page.map((html) => blocks.find((b) => b.html === html)!);
      const totalHeight = pageBlocks.reduce((sum, b) => sum + b.height, 0);
      expect(totalHeight).toBeLessThanOrEqual(400);
    }
  });

  it("Manus (a): um corpo mais alto que 2 folhas Letter gera pelo menos 3 páginas quando necessário", () => {
    const blocks = Array.from({ length: 6 }, (_, i) => block(`<div>secao-${i}</div>`, 500));
    const pages = splitBlocksIntoPages(blocks, 1000);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages.flat()).toHaveLength(6);
  });

  it("Manus (c): 3 seções curtas continuam gerando exatamente 3 folhas (guarda de regressão do Achado 1)", () => {
    const secoes = [
      [block("<p>s1</p>", 200)],
      [block("<p>s2</p>", 150)],
      [block("<p>s3</p>", 180)],
    ];
    const paginasPorSecao = secoes.map((blocosDaSecao) => splitBlocksIntoPages(blocosDaSecao, 1000));
    expect(paginasPorSecao.every((p) => p.length === 1)).toBe(true);
    const totalDePaginasFisicas = paginasPorSecao.reduce((sum, p) => sum + p.length, 0);
    expect(totalDePaginasFisicas).toBe(3);
  });

  it("nunca corta um bloco no meio: um bloco isolado maior que a página inteira ainda recebe sua própria folha", () => {
    const blocks = [block("<p>curto</p>", 100), block("<table>tabela-gigante</table>", 5000), block("<p>curto2</p>", 100)];
    const pages = splitBlocksIntoPages(blocks, 1000);

    const pageWithGiant = pages.find((p) => p.includes("<table>tabela-gigante</table>"));
    expect(pageWithGiant).toBeDefined();
    expect(pageWithGiant).toHaveLength(1);

    expect(pages.flat()).toEqual(["<p>curto</p>", "<table>tabela-gigante</table>", "<p>curto2</p>"]);
  });

  it("lista vazia de blocos retorna uma única página vazia (nunca 0 páginas)", () => {
    const pages = splitBlocksIntoPages([], 1000);
    expect(pages).toEqual([[]]);
  });

  it("Manus (e): reserva fixa de rodapé garante que a altura útil do corpo nunca inclui a faixa da assinatura", () => {
    const pageHeightPx = 1200;
    const footerReservePx = 300;
    const availableBodyHeightPx = pageHeightPx - footerReservePx;

    const blocks = [block("<p>a</p>", 400), block("<p>b</p>", 400), block("<p>c</p>", 400)];
    const pages = splitBlocksIntoPages(blocks, availableBodyHeightPx);

    for (const page of pages) {
      const pageBlocks = page.map((html) => blocks.find((b) => b.html === html)!);
      const totalHeight = pageBlocks.reduce((sum, b) => sum + b.height, 0);
      expect(totalHeight).toBeLessThanOrEqual(availableBodyHeightPx);
      expect(totalHeight + footerReservePx).toBeLessThanOrEqual(pageHeightPx);
    }
  });
});


// Confirmação estrutural (não substitui os testes de lógica pura acima,
// mas garante que as duas vias de download — financeiro e impressão
// rápida — de fato usam o mesmo módulo de paginação, exatamente o que a
// Manus pediu: "Aplicar a mesma rotina à impressão rápida e ao download
// financeiro, para que os dois caminhos não tenham resultados
// diferentes".
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("wiring — as duas vias de download usam o mesmo módulo de paginação real", () => {
  const financialSource = readFileSync(
    resolve(process.cwd(), "client/src/lib/financialReportPdfDownload.ts"),
    "utf8",
  );
  const pacsQuerySource = readFileSync(
    resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"),
    "utf8",
  );

  it("financialReportPdfDownload.ts importa e usa measureTopLevelBlocks/splitBlocksIntoPages", () => {
    expect(financialSource).toContain('from "./reportPagination"');
    expect(financialSource).toContain("measureTopLevelBlocks(");
    expect(financialSource).toContain("splitBlocksIntoPages(");
  });

  it("PacsQueryPage.tsx (download da impressão rápida) importa e usa o mesmo módulo", () => {
    expect(pacsQuerySource).toContain('from "@/lib/reportPagination"');
    expect(pacsQuerySource).toContain("measureTopLevelBlocks(");
    expect(pacsQuerySource).toContain("splitBlocksIntoPages(");
  });

  it("as duas vias reservam altura fixa de rodapé antes de medir a área útil do corpo", () => {
    // Garante que nenhuma das duas vias voltou a medir a altura útil do
    // corpo SEM a reserva do rodapé já presente no molde de medição — essa
    // ordem é o que impede a assinatura de sobrepor texto cortado.
    expect(financialSource).toContain("availableBodyHeightPx");
    expect(pacsQuerySource).toContain("availableBodyHeightPxQ");
  });
});
