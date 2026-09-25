// Paginação real de conteúdo longo para geração de PDF (correção do
// bloqueio reportado pela Manus em 2026-09-25, "laudo único longo é
// cortado no PDF financeiro"): uma seção de laudo (JSON ou HTML simples)
// pode ter mais conteúdo do que cabe em uma única folha física. Antes
// desta correção, cada seção virava exatamente UMA `.print-page` com
// altura fixa e `overflow:hidden` — texto que excedia a altura disponível
// era simplesmente cortado, e a assinatura/rodapé podiam ficar sobrepostos
// ao texto cortado.
//
// Este módulo NÃO reduz a imagem capturada (isso é o que `clampImageToPage`
// fazia, e a Manus foi explícita: reduzir a captura evita estourar a
// página, mas não restaura o texto já escondido por overflow:hidden).
// Em vez disso, mede a altura real de cada bloco de conteúdo (parágrafo,
// título, tabela etc.) e decide ANTES da captura em qual folha física cada
// bloco entra — cada folha resultante já cabe inteira na página de
// destino, então a captura de cada folha individual nunca precisa cortar
// nada.

/** Um bloco de conteúdo (elemento de nível superior do corpo do laudo) já medido. */
export interface MeasuredBlock {
  /** HTML do próprio bloco (outerHTML), reinserido tal qual na página que o recebe. */
  html: string;
  /** Altura renderizada do bloco em pixels, na mesma largura/fonte usada na captura final. */
  height: number;
}

/**
 * Extrai os blocos de nível superior de um container já montado no DOM
 * (dentro do documento/iframe onde a captura final vai acontecer, para que
 * fontes, largura e quebra de linha sejam idênticas às da captura real) e
 * mede a altura renderizada de cada um.
 *
 * Só pode rodar em um ambiente com motor de layout real (browser) —
 * `getBoundingClientRect`/`offsetHeight` não refletem layout real em
 * jsdom, então esta função não é exercitada por teste automatizado; a
 * função pura `splitBlocksIntoPages` abaixo, que recebe as alturas já
 * medidas, é o que os testes de regressão cobrem diretamente.
 */
export function measureTopLevelBlocks(container: HTMLElement): MeasuredBlock[] {
  return Array.from(container.children).map((el) => ({
    html: (el as HTMLElement).outerHTML,
    height: (el as HTMLElement).getBoundingClientRect().height || (el as HTMLElement).offsetHeight,
  }));
}

/**
 * Decide, a partir de uma lista de blocos já medidos, quantas folhas
 * físicas são necessárias e o que entra em cada uma — sem cortar nenhum
 * bloco no meio. Um bloco nunca é dividido internamente: se ele sozinho já
 * ultrapassa `maxHeightPx` (ex.: uma tabela muito alta), ele ainda assim
 * recebe sua própria folha (limitação documentada — evita cortar conteúdo
 * no meio de um elemento que não pode ser partido, ao custo de uma folha
 * com overflow nesse caso raro).
 *
 * Função pura, sem DOM — testável diretamente com alturas sintéticas.
 */
export function splitBlocksIntoPages(blocks: MeasuredBlock[], maxHeightPx: number): string[][] {
  if (blocks.length === 0) return [[]];

  const pages: string[][] = [];
  let currentPage: string[] = [];
  let currentHeight = 0;

  for (const block of blocks) {
    const wouldOverflow = currentPage.length > 0 && currentHeight + block.height > maxHeightPx;
    if (wouldOverflow) {
      pages.push(currentPage);
      currentPage = [];
      currentHeight = 0;
    }
    currentPage.push(block.html);
    currentHeight += block.height;
  }
  if (currentPage.length > 0) pages.push(currentPage);
  return pages;
}

/**
 * Combina medição + divisão: dado um container já montado (DOM real) com
 * o conteúdo completo de uma seção, retorna um array de strings HTML — uma
 * por folha física necessária para conter todo o conteúdo sem cortes.
 */
export function paginateContainer(container: HTMLElement, maxHeightPx: number): string[] {
  const blocks = measureTopLevelBlocks(container);
  const pages = splitBlocksIntoPages(blocks, maxHeightPx);
  return pages.map((page) => page.join(""));
}
