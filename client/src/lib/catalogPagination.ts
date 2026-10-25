// Paginação incremental do Catálogo de exames (auditoria claude/ajustes-mobile).
// Funções puras para que a contagem exibida e o incremento do botão "Mostrar mais"
// possam ser testados sem renderizar a página inteira.

export const CATALOG_PAGE_SIZE = 60;

/** Quantos cartões estão de fato na tela: nunca mais que o total filtrado. */
export function catalogDisplayedCount(visibleCount: number, total: number): number {
  return Math.max(0, Math.min(visibleCount, total));
}

/** Próximo valor de visibleCount ao tocar "Mostrar mais", limitado ao total filtrado. */
export function nextCatalogVisibleCount(visibleCount: number, total: number, pageSize: number = CATALOG_PAGE_SIZE): number {
  return Math.min(visibleCount + pageSize, Math.max(total, 0));
}

/** Rótulo e visibilidade do rodapé da lista. */
export function catalogPaginationState(visibleCount: number, total: number, pageSize: number = CATALOG_PAGE_SIZE) {
  const displayed = catalogDisplayedCount(visibleCount, total);
  const remaining = Math.max(total - displayed, 0);
  return {
    displayed,
    hasMore: remaining > 0,
    nextBatch: Math.min(pageSize, remaining),
    // O status só faz sentido quando o catálogo filtrado é maior que um bloco.
    showStatus: total > pageSize,
    statusLabel: `Exibindo ${displayed} de ${total}`,
  };
}
