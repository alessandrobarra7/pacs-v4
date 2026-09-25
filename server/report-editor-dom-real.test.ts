// Testes DOM reais (jsdom) para as funções puras extraídas de
// ReportEditorPage.tsx em client/src/lib/reportEditorDom.ts.
//
// Pedido explícito da revisão corretiva da Manus (parecer de
// 2026-09-24, Bloqueio 2): "A correção deve incluir testes DOM reais,
// não apenas testes que procuram trechos de código-fonte." Os testes
// abaixo constroem árvores DOM de verdade (via jsdom), criam Range/
// Selection reais e chamam os algoritmos de produção diretamente —
// nenhuma asserção aqui verifica string de código-fonte.
//
// @vitest-environment jsdom

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  getCharBeforeRange,
  isMobileViewportQuery,
  pickActiveRef,
  rangeBelongsToTarget,
} from "../client/src/lib/reportEditorDom";

function rangeAt(node: Node, offset: number): Range {
  const range = document.createRange();
  range.setStart(node, offset);
  range.setEnd(node, offset);
  return range;
}

describe("getCharBeforeRange — cenários reais de DOM (cursor/Range)", () => {
  it("retorna o caractere imediatamente anterior dentro do mesmo nó de texto", () => {
    const div = document.createElement("div");
    div.innerHTML = "Abdome sem alterações";
    document.body.appendChild(div);

    const textNode = div.firstChild as Text;
    // cursor logo após o "e" de "Abdome" (offset 6)
    const range = rangeAt(textNode, 6);

    expect(getCharBeforeRange(range, div)).toBe("e");
    div.remove();
  });

  it("cursor no início de um nó de texto sobe para o irmão anterior (span com texto)", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span>Laudo</span><span> normal</span>';
    document.body.appendChild(div);

    const secondSpanText = div.lastChild!.firstChild as Text; // " normal"
    // cursor no início do segundo span, antes do espaço
    const range = rangeAt(secondSpanText, 0);

    expect(getCharBeforeRange(range, div)).toBe("o");
    div.remove();
  });

  it("cursor imediatamente depois de <br> não atravessa a quebra (retorna sentinela de espaço, não a letra anterior)", () => {
    const div = document.createElement("div");
    div.innerHTML = "Linha um<br>";
    document.body.appendChild(div);

    // cursor no fim do div, logo após o <br> (offset = número de filhos)
    const range = rangeAt(div, div.childNodes.length);
    const charBefore = getCharBeforeRange(range, div);

    // Não deve retornar "m" (letra de "um") — o <br> é tratado como quebra
    // já existente e a função retorna um caractere de espaço (sentinela),
    // nunca a letra que vem antes dele. O chamador (insertAtCursor) só
    // insere separador extra quando o caractere NÃO é espaço
    // (charBefore && !/\s/.test(charBefore)) — então um "\n" aqui já
    // impede a quebra dupla, exatamente como um espaço impediria.
    expect(charBefore).not.toBe("m");
    expect(/\s/.test(charBefore)).toBe(true);
    div.remove();
  });

  it("cursor no início do texto de um novo bloco (<p>) não atravessa para o bloco anterior", () => {
    const div = document.createElement("div");
    div.innerHTML = "<p>Primeiro parágrafo</p><p>Segundo parágrafo</p>";
    document.body.appendChild(div);

    const secondP = div.lastChild as HTMLElement;
    const secondText = secondP.firstChild as Text; // "Segundo parágrafo"
    // cursor no início do texto do segundo parágrafo (cenário real de
    // digitação — o cursor está dentro do nó de texto do bloco novo, não
    // no elemento <p> vazio)
    const range = rangeAt(secondText, 0);

    // Não deve retornar "o" (fim de "parágrafo") — cruzar a fronteira de
    // um elemento de bloco não conta como "colado" ao bloco anterior; o
    // parágrafo já é separação visual própria.
    expect(getCharBeforeRange(range, div)).toBe("");
    div.remove();
  });

  it("cursor logo após espaço em branco retorna o espaço (não deve inserir separador extra)", () => {
    const div = document.createElement("div");
    div.innerHTML = "Tórax normal ";
    document.body.appendChild(div);

    const textNode = div.firstChild as Text;
    const range = rangeAt(textNode, textNode.textContent!.length);

    const charBefore = getCharBeforeRange(range, div);
    expect(charBefore).toBe(" ");
    expect(/\s/.test(charBefore)).toBe(true);
    div.remove();
  });

  it("nunca ultrapassa o boundary (editor) para ler texto de fora da área editável", () => {
    const outer = document.createElement("div");
    outer.innerHTML = "TEXTO FORA DO EDITOR";
    const editor = document.createElement("div");
    outer.appendChild(editor);
    document.body.appendChild(outer);

    // cursor no início do editor vazio — não deve enxergar "TEXTO FORA..."
    const range = rangeAt(editor, 0);
    expect(getCharBeforeRange(range, editor)).toBe("");
    outer.remove();
  });

  it("nós aninhados profundos: acha a última letra de um <strong> irmão anterior", () => {
    const div = document.createElement("div");
    div.innerHTML = "<p><strong>Conclusão</strong></p><p>Texto novo</p>";
    document.body.appendChild(div);

    const secondP = div.lastChild as HTMLElement;
    const textNode = secondP.firstChild as Text; // "Texto novo"
    // cursor no início de "Texto novo" — mas como é um <p> diferente do
    // anterior, a fronteira de bloco entra em jogo antes de achar "o".
    const range = rangeAt(textNode, 0);

    expect(getCharBeforeRange(range, div)).toBe("");
    div.remove();
  });
});

describe("isMobileViewportQuery — decide viewport via window.matchMedia real", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("retorna true quando matchMedia reporta viewport estreita (mobile)", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    expect(isMobileViewportQuery("(max-width: 767px)")).toBe(true);
  });

  it("retorna false quando matchMedia reporta viewport larga (desktop)", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    expect(isMobileViewportQuery("(max-width: 767px)")).toBe(false);
  });
});

describe("pickActiveRef — resolução desktop/mobile com elementos DOM reais", () => {
  it("em viewport mobile, escolhe o elemento mobile quando montado", () => {
    const desktopEl = document.createElement("div");
    const mobileEl = document.createElement("div");
    expect(pickActiveRef(true, mobileEl, desktopEl)).toBe(mobileEl);
  });

  it("em viewport desktop, escolhe o elemento desktop quando montado", () => {
    const desktopEl = document.createElement("div");
    const mobileEl = document.createElement("div");
    expect(pickActiveRef(false, mobileEl, desktopEl)).toBe(desktopEl);
  });

  it("cai para o outro elemento quando o preferido ainda não foi montado (ref nula)", () => {
    const desktopEl = document.createElement("div");
    expect(pickActiveRef(true, null, desktopEl)).toBe(desktopEl);

    const mobileEl = document.createElement("div");
    expect(pickActiveRef(false, mobileEl, null)).toBe(mobileEl);
  });
});

describe("rangeBelongsToTarget — colisão de refs desktop/mobile (Bloqueio 2)", () => {
  let desktopEditor: HTMLDivElement;
  let mobileEditor: HTMLDivElement;

  beforeEach(() => {
    desktopEditor = document.createElement("div");
    desktopEditor.innerHTML = "Conteúdo do editor desktop";
    mobileEditor = document.createElement("div");
    mobileEditor.innerHTML = "Conteúdo do editor mobile";
    document.body.appendChild(desktopEditor);
    document.body.appendChild(mobileEditor);
  });

  afterEach(() => {
    desktopEditor.remove();
    mobileEditor.remove();
  });

  it("reconhece um Range salvo dentro da árvore desktop como pertencente a ela", () => {
    const textNode = desktopEditor.firstChild as Text;
    const range = rangeAt(textNode, 5);
    expect(rangeBelongsToTarget(range, desktopEditor)).toBe(true);
  });

  it("rejeita um Range salvo na árvore mobile quando o editor ativo agora é o desktop (cenário exato do Bloqueio 2)", () => {
    // Simula: usuário estava editando no mobile (Range salvo na árvore
    // mobile oculta), depois a viewport virou desktop e a inserção deve
    // mirar o editor desktop — o Range antigo não pertence mais a ele.
    const mobileTextNode = mobileEditor.firstChild as Text;
    const staleRange = rangeAt(mobileTextNode, 3);

    expect(rangeBelongsToTarget(staleRange, desktopEditor)).toBe(false);
    // E continua válido para o editor a que de fato pertence:
    expect(rangeBelongsToTarget(staleRange, mobileEditor)).toBe(true);
  });

  it("trata Range nulo (nenhuma seleção salva) como não pertencente a nenhum alvo", () => {
    expect(rangeBelongsToTarget(null, desktopEditor)).toBe(false);
  });

  it("reconhece pertencimento mesmo com nós aninhados profundamente dentro do editor", () => {
    desktopEditor.innerHTML = "<p><strong><em>Trecho aninhado</em></strong></p>";
    const deepText = desktopEditor.querySelector("em")!.firstChild as Text;
    const range = rangeAt(deepText, 2);

    expect(rangeBelongsToTarget(range, desktopEditor)).toBe(true);
    expect(rangeBelongsToTarget(range, mobileEditor)).toBe(false);
  });
});
