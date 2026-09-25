// Paginação real de conteúdo longo para geração de PDF.
//
// HISTÓRICO: a primeira versão deste módulo (2026-09-25, resposta ao
// bloqueio "laudo único longo é cortado no PDF financeiro") somava
// alturas pré-medidas (getBoundingClientRect) de cada filho-elemento de
// nível superior do corpo. A Manus revisou essa versão e encontrou 4
// bloqueios confirmados com medição real em Chromium ("Parecer de revisão
// — Paginação real dos PDFs", 2026-09-25):
//
//   B1 — a soma de alturas não incluía margem dos blocos (ex.:
//        margin-bottom:3pt de cada parágrafo), então o particionador
//        aceitava mais conteúdo do que realmente cabia (23px de excesso
//        medido em um caso real de 9 parágrafos).
//   B2 — só filhos-ELEMENTO eram considerados (Array.from(container.
//        children)); texto solto diretamente dentro do corpo (sem estar
//        dentro de uma tag) era silenciosamente perdido na reconstrução.
//   B3 — um bloco isolado mais alto que a página inteira era colocado
//        sozinho numa folha e ainda assim cortado por overflow:hidden —
//        a "limitação documentada" da v1 não tinha nenhum tratamento
//        real, e o handoff prometia "sem perda de conteúdo" mesmo nesse
//        caso.
//   B4 — o download rápido só aplicava a paginação nova para laudo
//        multisseção (JSON com 2+ seções); laudo de seção única
//        continuava usando .print-shared-sheet sem paginação real.
//
// Este módulo (v2) resolve B1, B2 e B3. B4 é resolvido no arquivo que
// consome este módulo (PacsQueryPage.tsx), tratando também a seção única
// como uma "seção" de 1 item processada pela mesma pipeline — não é uma
// mudança neste módulo.
//
// MECANISMO (B1 + B2): em vez de somar alturas pré-medidas, o algoritmo
// insere incrementalmente CLONES REAIS dos nós filhos (elementos E nós de
// texto soltos — Array.from(container.childNodes), não .children) dentro
// da mesma folha física que será capturada, e verifica
// `scrollHeight <= clientHeight` do corpo após cada inserção. Isso conta
// automaticamente margens, colapso de margem entre irmãos e qualquer
// outra regra de CSS real — não é mais uma soma aproximada.
//
// MECANISMO (B3): quando um único nó não cabe nem sozinho numa página
// vazia, duas saídas são possíveis: (a) se o nó é "fragmentável" — um nó
// de texto solto, ou um elemento sem filhos-elemento (só texto) — o texto
// é dividido por palavra via busca binária, a maior parte que couber fica
// nesta página e o restante volta para a fila como um novo nó a tentar na
// próxima página (podendo se espalhar por 3+ páginas se necessário);
// (b) se o nó não é fragmentável (tabela, imagem, bloco com filhos
// aninhados etc.), a geração é interrompida com um erro explícito — em
// vez de produzir silenciosamente um PDF com conteúdo cortado, o chamador
// recebe uma exceção e pode cair no fallback já existente (abrir a
// impressão nativa do navegador, que não sofre desse corte).
//
// TESTABILIDADE: a decisão de paginação (`paginateNodes`) é uma função
// que depende apenas da interface `PageBuilder` — ela não faz nenhuma
// chamada de layout diretamente. Isso permite testá-la exaustivamente em
// jsdom com um `PageBuilder` falso, orçamentado por números em vez de
// layout real (jsdom não computa `scrollHeight`/`clientHeight` reais). A
// implementação real de `PageBuilder` (`createRealDomPageBuilder`, usada
// em produção) É a parte que depende de layout real e não é exercitada
// por teste automatizado — mesma limitação documentada na v1, e mesma
// divisão de responsabilidade já estabelecida com a Manus: Claude
// implementa e testa a lógica de decisão no sandbox; a confirmação visual
// em navegador real fica com a validação da Manus.

/** Lançado quando um nó de conteúdo não pode ser paginado com segurança
 * (não cabe nem sozinho numa página vazia, e não é fragmentável). O
 * chamador deve tratar isso como falha de geração — nunca produzir um PDF
 * com conteúdo cortado silenciosamente. */
export class ContentTooLargeForPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentTooLargeForPageError";
  }
}

/**
 * Abstração de "uma página física em construção". `paginateNodes` só
 * conhece esta interface — a implementação real (DOM + scrollHeight) e a
 * implementação de teste (orçamento numérico) ficam fora desta função.
 */
export interface PageBuilder {
  /** Tenta inserir um clone de `node` no final da página. Se não couber,
   * a inserção é revertida (a página fica exatamente como estava antes
   * da chamada) e a função retorna false. */
  tryAppend(node: ChildNode): boolean;
  /** Só é chamado para um nó "fragmentável" (texto solto, ou elemento sem
   * filhos-elemento) que não coube inteiro. Insere a maior quantidade de
   * palavras que couber (pode ser nenhuma, se a página já não tiver mais
   * espaço algum) e retorna um novo nó do mesmo tipo com as palavras
   * restantes (para tentar nas próximas páginas), ou `null` se o nó
   * inteiro coube (sem restante) ou se nem uma palavra coube. */
  tryAppendPartialText(node: ChildNode): ChildNode | null;
  /** HTML final do conteúdo acumulado nesta página, para reinserção na
   * folha física real antes da captura. */
  html(): string;
}

const isEmptyWhitespaceText = (node: ChildNode): boolean =>
  node.nodeType === Node.TEXT_NODE && !(node.textContent ?? "").trim();

/** Um nó é "fragmentável" por palavra se for um nó de texto solto, ou um
 * elemento cujo único conteúdo é texto (sem filhos-elemento aninhados) —
 * fragmentar um elemento com filhos aninhados por palavra quebraria a
 * marcação interna, então esses são tratados como não-fragmentáveis. */
const isWordFragmentable = (node: ChildNode): boolean => {
  if (node.nodeType === Node.TEXT_NODE) return !!(node.textContent ?? "").trim();
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    return el.children.length === 0 && !!(el.textContent ?? "").trim();
  }
  return false;
};

/**
 * Núcleo puro da decisão de paginação: para cada nó de `nodes` (na ordem),
 * tenta inseri-lo na página atual; se não couber, abre uma nova página; se
 * não couber nem sozinho numa página vazia, tenta fragmentar por palavra
 * (nós fragmentáveis) ou lança `ContentTooLargeForPageError` (nós não
 * fragmentáveis) — nunca descarta conteúdo silenciosamente.
 *
 * Função pura quanto ao DOM real: toda a interação com layout passa pela
 * interface `PageBuilder` fornecida por `createPage`, o que permite testar
 * esta função inteira em jsdom com um builder falso.
 */
export function paginateNodes(nodes: ChildNode[], createPage: () => PageBuilder): PageBuilder[] {
  const meaningfulNodes = nodes.filter((n) => !isEmptyWhitespaceText(n));
  const pages: PageBuilder[] = [];
  let page = createPage();
  pages.push(page);

  if (meaningfulNodes.length === 0) return pages;

  const queue = [...meaningfulNodes];
  while (queue.length > 0) {
    const node = queue.shift()!;

    if (page.tryAppend(node)) continue;

    // Não coube na página atual (que pode já ter conteúdo prévio) — abrir
    // uma nova página vazia e tentar de novo.
    page = createPage();
    pages.push(page);
    if (page.tryAppend(node)) continue;

    // Não coube nem sozinho numa página vazia.
    if (!isWordFragmentable(node)) {
      throw new ContentTooLargeForPageError(
        "Um bloco de conteúdo do laudo (tabela, imagem ou elemento com marcação aninhada) é maior do que uma página inteira e não pode ser dividido com segurança. Revise o conteúdo do laudo ou aumente a área útil da página.",
      );
    }

    const remainder = page.tryAppendPartialText(node);
    if (remainder === null) {
      // tryAppendPartialText só retorna null quando o nó inteiro coube
      // (sem restante) OU quando nem uma palavra coube. Como já sabemos
      // que o nó inteiro NÃO coube (tryAppend acima falhou), null aqui só
      // pode significar "nem uma palavra coube".
      throw new ContentTooLargeForPageError(
        "Não foi possível encaixar nenhuma palavra de um bloco de texto do laudo em uma página vazia — a área útil configurada para o laudo é menor do que o necessário.",
      );
    }
    queue.unshift(remainder);
  }

  return pages;
}

/**
 * Implementação real (DOM + layout) de `PageBuilder`, usada em produção.
 * `makeEmptyBody` deve retornar um elemento JÁ ANEXADO ao documento de
 * captura, com a MESMA largura/fonte/CSS que a folha final vai usar, e
 * altura fixa (ou min-height coerente com a área útil real) — é o que
 * torna `scrollHeight`/`clientHeight` significativos.
 *
 * Não exercitado por teste automatizado (depende de layout real de
 * navegador; jsdom retorna 0 para scrollHeight/clientHeight) — ver nota
 * de testabilidade no topo do arquivo.
 */
export function createRealDomPageBuilder(body: HTMLElement): PageBuilder {
  const fits = () => body.scrollHeight <= body.clientHeight + 1; // +1px de tolerância a arredondamento subpixel

  const cloneShallowElement = (el: Element): Element => el.cloneNode(false) as Element;

  return {
    tryAppend(node) {
      const clone = node.cloneNode(true);
      body.appendChild(clone);
      if (fits()) return true;
      body.removeChild(clone);
      return false;
    },

    tryAppendPartialText(node) {
      const fullText = (node.textContent ?? "").trim();
      const words = fullText.split(/\s+/).filter(Boolean);
      if (words.length === 0) return null;

      const makeCandidate = (wordCount: number): ChildNode => {
        if (node.nodeType === Node.TEXT_NODE) {
          return document.createTextNode(words.slice(0, wordCount).join(" "));
        }
        const el = cloneShallowElement(node as Element);
        el.textContent = words.slice(0, wordCount).join(" ");
        return el;
      };

      // Busca binária pela maior quantidade de palavras que ainda cabe.
      let lo = 1;
      let hi = words.length;
      let bestFitted = 0;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const candidate = makeCandidate(mid);
        body.appendChild(candidate);
        const ok = fits();
        body.removeChild(candidate);
        if (ok) {
          bestFitted = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      if (bestFitted === 0) return null; // nem uma palavra coube
      body.appendChild(makeCandidate(bestFitted));
      if (bestFitted >= words.length) return null; // coube inteiro, sem restante
      return makeCandidateRemainder(node, words, bestFitted);
    },

    html() {
      return body.innerHTML;
    },
  };

  function makeCandidateRemainder(node: ChildNode, words: string[], fittedCount: number): ChildNode {
    const remainderText = words.slice(fittedCount).join(" ");
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(remainderText);
    }
    const el = cloneShallowElement(node as Element);
    el.textContent = remainderText;
    return el;
  }
}

/**
 * Combina `paginateNodes` + `createRealDomPageBuilder`: dado o container
 * de origem (com o conteúdo completo de uma seção, já no DOM real do
 * documento de captura) e uma fábrica de folhas físicas vazias, retorna o
 * HTML de cada página necessária. Lança `ContentTooLargeForPageError` se
 * algum bloco não puder ser paginado com segurança (ver documentação de
 * `paginateNodes`).
 *
 * `makeEmptyBody()` deve criar e anexar ao documento uma nova folha física
 * vazia (mesmo cabeçalho/dados/reserva de rodapé usados na folha real) e
 * retornar o elemento `.report-body` correspondente, pronto para receber
 * conteúdo.
 */
export function paginateSectionIntoPages(sourceContainer: HTMLElement, makeEmptyBody: () => HTMLElement): string[] {
  const nodes = Array.from(sourceContainer.childNodes);
  const pages = paginateNodes(nodes, () => createRealDomPageBuilder(makeEmptyBody()));
  return pages.map((p) => p.html());
}
