// Testes de regressão para o módulo de paginação real de conteúdo longo
// (client/src/lib/reportPagination.ts), reescrito em resposta ao "Parecer
// de revisão — Paginação real dos PDFs" (Manus, 2026-09-25), que bloqueou
// a primeira versão (medição por soma de alturas pré-computadas) com 4
// achados confirmados por medição real em Chromium:
//
//   B1 — a soma de alturas não contava margens dos blocos, aceitando mais
//        conteúdo do que realmente cabia (23px de excesso medido).
//   B2 — só filhos-ELEMENTO eram considerados; texto solto fora de
//        qualquer tag era silenciosamente perdido na reconstrução.
//   B3 — um bloco isolado mais alto que a página inteira ainda era
//        cortado por overflow:hidden, sem nenhum tratamento real.
//   B4 — a paginação só era aplicada a laudo multisseção no download
//        rápido; laudo de seção única continuava sem paginação real
//        (corrigido em PacsQueryPage.tsx, fora deste módulo — ver
//        server/pacs-quick-print-single-section-pagination.test.ts).
//
// A nova versão (v2) substitui a soma de alturas por inserção
// incremental de nós REAIS numa folha física real, verificando
// `scrollHeight <= clientHeight` após cada inserção — isso conta
// margens/colapso corretamente (B1) e usa `childNodes` em vez de
// `children`, preservando texto solto (B2). Um nó que não caiba nem
// sozinho numa página vazia é fragmentado por palavra quando possível, ou
// lança `ContentTooLargeForPageError` (B3) em vez de produzir um PDF
// cortado silenciosamente.
//
// TESTABILIDADE: `paginateNodes` (o núcleo de decisão) não faz nenhuma
// chamada de layout diretamente — toda interação com o DOM passa pela
// interface `PageBuilder`, injetada por `createPage`. Isso permite testar
// a lógica de decisão inteira aqui com um `PageBuilder` falso, orçamentado
// por contagem de caracteres em vez de layout real (jsdom não computa
// scrollHeight/clientHeight reais — por isso `createRealDomPageBuilder`,
// que É a parte dependente de layout, não é exercitado aqui; a validação
// visual real fica com a Manus, como em todas as rodadas anteriores).
//
// @vitest-environment jsdom


import { describe, expect, it } from "vitest";
import {
  ContentTooLargeForPageError,
  paginateNodes,
  paginateSectionIntoPages,
  type PageBuilder,
} from "../client/src/lib/reportPagination";

/**
 * PageBuilder falso, orçamentado por número de caracteres — permite
 * simular "cabe"/"não cabe" sem depender de layout real, exercitando
 * exatamente a mesma lógica de decisão (paginateNodes) que a produção usa
 * com scrollHeight/clientHeight reais.
 */
function createFakeBuilder(budgetChars: number): PageBuilder {
  let usedChars = 0;
  const parts: string[] = [];

  const nodeText = (node: ChildNode): string => node.textContent ?? "";
  const serialize = (node: ChildNode): string =>
    node.nodeType === Node.TEXT_NODE ? nodeText(node) : (node as Element).outerHTML;

  return {
    tryAppend(node) {
      const cost = nodeText(node).length || 1; // custo mínimo de 1 para nó vazio
      if (usedChars + cost > budgetChars) return false;
      usedChars += cost;
      parts.push(serialize(node));
      return true;
    },
    tryAppendPartialText(node) {
      const words = nodeText(node).trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return null;
      let fitted = 0;
      let used = usedChars;
      for (const word of words) {
        const cost = word.length + 1;
        if (used + cost > budgetChars) break;
        used += cost;
        fitted += 1;
      }
      if (fitted === 0) return null;
      usedChars = used;
      parts.push(words.slice(0, fitted).join(" "));
      if (fitted >= words.length) return null;
      const remainderText = words.slice(fitted).join(" ");
      return document.createTextNode(remainderText);
    },
    html() {
      return parts.join("");
    },
  };
}

const el = (tag: string, text: string): HTMLElement => {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
};

const elWithChild = (tag: string, childTag: string, text: string): HTMLElement => {
  const node = document.createElement(tag);
  node.appendChild(el(childTag, text));
  return node;
};

describe("paginateNodes — núcleo de decisão da paginação real", () => {
  it("lista vazia retorna uma única página vazia (nunca 0 páginas)", () => {
    const pages = paginateNodes([], () => createFakeBuilder(1000));
    expect(pages).toHaveLength(1);
    expect(pages[0].html()).toBe("");
  });

  it("blocos curtos que cabem juntos geram exatamente 1 página", () => {
    const nodes = [el("p", "a"), el("p", "b"), el("p", "c")];
    const pages = paginateNodes(nodes, () => createFakeBuilder(1000));
    expect(pages).toHaveLength(1);
  });

  it("conteúdo que excede o orçamento de uma página é dividido em 2+ páginas, sem perder blocos", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => el("p", `bloco-${i}-xxxxxxxxxx`));
    const pages = paginateNodes(nodes, () => createFakeBuilder(60));
    expect(pages.length).toBeGreaterThan(1);
    const combinedHtml = pages.map((p) => p.html()).join("");
    for (let i = 0; i < 10; i += 1) {
      expect(combinedHtml).toContain(`bloco-${i}-xxxxxxxxxx`);
    }
  });

  it("B2 (regressão): texto solto fora de qualquer tag nunca é perdido na reconstrução", () => {
    const nodes: ChildNode[] = [
      document.createTextNode("Texto introdutório "),
      el("p", "Parágrafo interno"),
      document.createTextNode(" Texto final"),
    ];
    const pages = paginateNodes(nodes, () => createFakeBuilder(1000));
    const combinedHtml = pages.map((p) => p.html()).join("");
    expect(combinedHtml).toContain("Texto introdutório");
    expect(combinedHtml).toContain("Parágrafo interno");
    expect(combinedHtml).toContain("Texto final");
  });

  it("nós de texto só-espaço em branco entre blocos são ignorados (não geram páginas vazias)", () => {
    const nodes: ChildNode[] = [el("p", "a"), document.createTextNode("   \n  "), el("p", "b")];
    const pages = paginateNodes(nodes, () => createFakeBuilder(1000));
    expect(pages).toHaveLength(1);
  });

  it("B1 (regressão conceitual): o custo de cada bloco é decidido inteiramente pelo PageBuilder — nenhuma soma pré-calculada é feita por paginateNodes, então qualquer fator (incluindo margens reais) que o builder real leve em conta é respeitado", () => {
    // Simula dois blocos que, medidos "sem margem", pareceriam caber juntos
    // (5 + 5 = 10 <= orçamento 10), mas que o builder real (que soma um
    // custo extra por causa de uma margem simulada) rejeita.
    let calls = 0;
    const marginAwareBuilder = (): PageBuilder => {
      let used = 0;
      const parts: string[] = [];
      return {
        tryAppend(node) {
          calls += 1;
          const MARGIN_COST = 3; // simula margin-bottom não contabilizado na v1
          const cost = (node.textContent ?? "").length + MARGIN_COST;
          if (used + cost > 10) return false;
          used += cost;
          parts.push(node.textContent ?? "");
          return true;
        },
        tryAppendPartialText: () => null,
        html: () => parts.join(""),
      };
    };
    const nodes = [el("p", "aaaaa"), el("p", "bbbbb")]; // 5 + 5 = 10 sem margem, mas 8+8=16 com margem simulada
    const pages = paginateNodes(nodes, marginAwareBuilder);
    expect(pages.length).toBeGreaterThan(1); // a v1 (soma sem margem) diria "cabe em 1 página" — errado
    expect(calls).toBeGreaterThan(0);
  });

  it("B3: elemento com filhos aninhados que não cabe nem sozinho numa página vazia lança ContentTooLargeForPageError (nunca corta silenciosamente)", () => {
    const nodes = [elWithChild("div", "span", "conteúdo-gigante-nao-fragmentavel")];
    expect(() => paginateNodes(nodes, () => createFakeBuilder(5))).toThrow(ContentTooLargeForPageError);
  });

  it("B3: texto simples que não cabe nem sozinho é fragmentado por palavra em 2+ páginas, sem perder nenhuma palavra", () => {
    const longText = Array.from({ length: 20 }, (_, i) => `palavra${i}`).join(" ");
    const nodes = [el("p", longText)];
    const pages = paginateNodes(nodes, () => createFakeBuilder(40));
    expect(pages.length).toBeGreaterThan(1);

    const combinedWords = pages
      .map((p) => p.html())
      .join(" ")
      .split(/\s+/)
      .filter(Boolean);
    const originalWords = longText.split(/\s+/);
    expect(combinedWords).toEqual(originalWords);
  });

  it("B3: se nem uma palavra do texto cabe numa página vazia, lança ContentTooLargeForPageError", () => {
    const nodes = [el("p", "palavra-unica-enorme-que-nao-cabe-em-lugar-nenhum")];
    expect(() => paginateNodes(nodes, () => createFakeBuilder(3))).toThrow(ContentTooLargeForPageError);
  });

  it("um bloco com várias palavras que não cabe nem sozinho é fragmentado por palavra em página(s) própria(s), sem perder nenhuma palavra", () => {
    // Diferente do teste anterior (uma única "palavra" de 20 caracteres
    // sem espaço, que é genuinamente infragmentável e deve lançar erro —
    // ver o teste seguinte), um bloco com VÁRIAS palavras pode ser
    // fragmentado normalmente mesmo sem caber com o conteúdo anterior.
    const nodes = [el("p", "curto"), el("p", "palavra1 palavra2 palavra3 palavra4 palavra5"), el("p", "curto2")];
    const pages = paginateNodes(nodes, () => createFakeBuilder(12));
    const combinedText = pages.map((p) => p.html()).join(" ");
    expect(combinedText).toContain("curto");
    expect(combinedText).toContain("curto2");
    for (let i = 1; i <= 5; i += 1) {
      expect(combinedText).toContain(`palavra${i}`);
    }
  });

  it("uma única 'palavra' longa sem espaços (infragmentável) que não cabe nem sozinha lança ContentTooLargeForPageError, em vez de ser silenciosamente aceita numa página que a corta (comportamento da v1)", () => {
    const nodes = [el("p", "curto"), el("p", "xxxxxxxxxxxxxxxxxxxx"), el("p", "curto2")];
    expect(() => paginateNodes(nodes, () => createFakeBuilder(12))).toThrow(ContentTooLargeForPageError);
  });
});

describe("paginateSectionIntoPages — integração mínima (sem layout real)", () => {
  it("seção vazia produz uma única página com corpo vazio, sem lançar exceção", () => {
    const container = document.createElement("div");
    // Corpo vazio -> paginateNodes recebe lista vazia -> 1 página vazia,
    // mesmo sem layout real disponível em jsdom (nenhuma chamada de
    // scrollHeight/clientHeight chega a acontecer, porque não há nós para
    // inserir).
    const pages = paginateSectionIntoPages(container, () => document.createElement("div"));
    expect(pages).toEqual([""]);
  });
});

// Confirmação estrutural (não substitui os testes de lógica pura acima,
// mas garante que as duas vias de download — financeiro e impressão
// rápida — de fato usam o mesmo módulo de paginação real, e que o
// pré-requisito de CSS (overflow:hidden em .report-body, necessário para
// que scrollHeight divirja de clientHeight quando há overflow) está
// presente nas duas).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("wiring — as duas vias de download usam o mesmo módulo de paginação real (v2)", () => {
  const financialSource = readFileSync(
    resolve(process.cwd(), "client/src/lib/financialReportPdfDownload.ts"),
    "utf8",
  );
  const pacsQuerySource = readFileSync(
    resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"),
    "utf8",
  );

  it("financialReportPdfDownload.ts importa e usa paginateSectionIntoPages", () => {
    expect(financialSource).toContain('from "./reportPagination"');
    expect(financialSource).toContain("paginateSectionIntoPages(");
    expect(financialSource).not.toContain("measureTopLevelBlocks");
    expect(financialSource).not.toContain("splitBlocksIntoPages");
  });

  it("PacsQueryPage.tsx (download da impressão rápida) importa e usa o mesmo módulo", () => {
    expect(pacsQuerySource).toContain('from "@/lib/reportPagination"');
    expect(pacsQuerySource).toContain("paginateSectionIntoPages(");
    expect(pacsQuerySource).not.toContain("measureTopLevelBlocks");
    expect(pacsQuerySource).not.toContain("splitBlocksIntoPages");
  });

  it("B1: .report-body tem overflow:hidden nas duas vias (pré-requisito para scrollHeight refletir overflow real)", () => {
    // NOTA: o CSS real é gerado por template literal e contém `${lSize}`/
    // `${lLine}` — chaves LITERAIS dentro da própria regra, antes de
    // "overflow: hidden". Uma regex "balanceada por chaves" (tipo
    // /\.report-body\s*\{[^}]*overflow:hidden/) pararia no primeiro `}`
    // (o de `${lSize}`) e nunca chegaria a "overflow". Por isso localizamos
    // a regra pela substring inicial e conferimos que "overflow: hidden"
    // aparece logo depois, na mesma regra, sem depender de contagem de
    // chaves.
    const assertReportBodyHasOverflowHidden = (source: string, label: string) => {
      const ruleStart = source.indexOf(".report-body {");
      expect(ruleStart, `${label}: regra .report-body { ... } não encontrada`).toBeGreaterThanOrEqual(0);
      const ruleSnippet = source.slice(ruleStart, ruleStart + 200);
      expect(ruleSnippet).toMatch(/overflow:\s*hidden/);
    };
    assertReportBodyHasOverflowHidden(financialSource, "financialReportPdfDownload.ts");
    assertReportBodyHasOverflowHidden(pacsQuerySource, "PacsQueryPage.tsx");
  });

  it("B4: PacsQueryPage.tsx não restringe mais a reconstrução em .print-page a laudo multisseção — laudo de seção única também é reconstruído antes da captura", () => {
    // Regressão específica do Bloqueio B4: a versão anterior tinha um
    // `if (multiSectionParsed)` que pulava inteiramente a reconstrução
    // para seção única. Agora sectionsForPdfQ é sempre construído (com 1
    // ou mais seções) e a reconstrução roda incondicionalmente.
    expect(pacsQuerySource).toContain("sectionsForPdfQ");
    expect(pacsQuerySource).not.toContain("if (multiSectionParsed)");
    // A remoção de folhas antigas do DOM antes de reinserir as páginas
    // agora cobre .print-shared-sheet também (a folha de seção única),
    // não só .print-page.
    expect(pacsQuerySource).toContain("'.print-page, .print-shared-sheet'");
  });
});
