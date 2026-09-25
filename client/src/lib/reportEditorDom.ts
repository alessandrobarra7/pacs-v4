// Funções puras de manipulação de DOM usadas pelo editor de laudos
// (ReportEditorPage.tsx). Extraídas para um módulo próprio, sem estado
// de componente, para permitirem testes DOM reais (jsdom) — pedido
// explícito da revisão corretiva da Manus de 2026-09-24 (Bloqueio 2):
// "testes DOM reais, não apenas testes que procuram trechos de
// código-fonte".
//
// Nenhuma mudança de comportamento em relação ao código original que
// vivia inline em ReportEditorPage.tsx — apenas extração.

/**
 * Elementos de bloco: já representam separação visual própria entre si,
 * então cruzar a fronteira de um bloco nunca deve ser tratado como texto
 * "colado" ao bloco anterior.
 */
export const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'UL', 'OL', 'BLOCKQUOTE', 'TR', 'TABLE', 'HR',
]);

export const isBlockElement = (node: Node | null): boolean =>
  !!node && node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName);

/**
 * Encontra o caractere efetivamente "imediatamente antes do cursor" para
 * a lógica de smartSeparator. Sobe pela árvore DOM procurando irmãos
 * anteriores em cada nível até o `boundary` (o próprio editor), tratando
 * `<br>`/`<hr>` e o início de um elemento de bloco como já-separados —
 * nesses casos retorna string vazia em vez de continuar retrocedendo até
 * achar a letra anterior de verdade (o que geraria quebra dupla mesmo já
 * havendo separação visual).
 */
export const getCharBeforeRange = (range: Range, boundary?: Node | null): string => {
  const findLastCharInSubtree = (node: Node): string => {
    if (node.nodeType === Node.ELEMENT_NODE && ((node as Element).tagName === 'BR' || (node as Element).tagName === 'HR')) {
      return '\n';
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent || '';
      return t.length > 0 ? t[t.length - 1] : '';
    }
    const children = node.childNodes;
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const c = findLastCharInSubtree(children[i]);
      if (c) return c;
    }
    return '';
  };

  const { startContainer, startOffset } = range;

  if (startContainer.nodeType === Node.TEXT_NODE) {
    const text = startContainer.textContent || '';
    if (startOffset > 0) return text[startOffset - 1] || '';
  } else {
    const el = startContainer as Element;
    if (startOffset > 0) {
      const child = el.childNodes[startOffset - 1];
      const c = child ? findLastCharInSubtree(child) : '';
      if (c) return c;
    }
  }

  let current: Node | null = startContainer;
  while (current && current !== boundary) {
    let sib: Node | null = current.previousSibling;
    while (sib) {
      const c = findLastCharInSubtree(sib);
      if (c) return c;
      sib = sib.previousSibling;
    }
    const parent: Node | null = current.parentNode;
    if (parent && parent !== boundary && isBlockElement(parent)) return '';
    current = parent;
  }
  return '';
};

/**
 * Checa se o `matchMedia` do ambiente reporta viewport mobile agora. Ponto
 * único usado por getVisibleDoc()/getActiveSectionRefs() para decidir qual
 * das duas árvores sempre-montadas (desktop/mobile) está de fato
 * visível/tocável no momento.
 */
export const isMobileViewportQuery = (query = "(max-width: 767px)"): boolean => {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia(query).matches;
};

/**
 * Escolhe entre o valor "mobile" e o valor "desktop" conforme a viewport
 * ativa, com fallback para o outro quando o preferido for nulo (ex.: ref
 * ainda não montada). Mesma lógica usada por getVisibleDoc() e por
 * getActiveSectionRefs() para resolver qual árvore (desktop ou mobile) é a
 * fonte de verdade agora.
 */
export const pickActiveRef = <T>(isMobile: boolean, mobileVal: T, desktopVal: T): T => {
  if (isMobile) {
    return (mobileVal ?? desktopVal) as T;
  }
  return (desktopVal ?? mobileVal) as T;
};

/**
 * Verifica se um Range salvo ainda pertence ao editor ativo agora. Entre o
 * momento em que a seleção foi salva e o momento da inserção, o editor
 * ativo pode ter mudado (troca de seção multi-seção, ou troca de
 * viewport) — um Range de outra árvore não deve ser restaurado.
 */
export const rangeBelongsToTarget = (range: Range | null, targetEl: Node | null): boolean => {
  return !!range && !!targetEl && targetEl.contains(range.startContainer);
};
