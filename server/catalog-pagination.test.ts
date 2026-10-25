// ADENDO (revisão f0548a7, bloqueio 1): contagem do "Mostrar mais" do Catálogo de exames.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG_PAGE_SIZE, catalogPaginationState, nextCatalogVisibleCount } from "../client/src/lib/catalogPagination";

function clickUntil(total: number, clicks: number) {
  let visible = CATALOG_PAGE_SIZE;
  for (let i = 0; i < clicks; i += 1) visible = nextCatalogVisibleCount(visible, total);
  return catalogPaginationState(visible, total);
}

describe("Catálogo — paginação incremental", () => {
  it("60 resultados: sem botão Mostrar mais e sem status", () => {
    const state = clickUntil(60, 0);
    expect(state.hasMore).toBe(false);
    expect(state.showStatus).toBe(false);
    expect(state.displayed).toBe(60);
  });

  it("61 resultados: após um clique, 'Exibindo 61 de 61' (nunca 120 de 61)", () => {
    expect(clickUntil(61, 0)).toMatchObject({ hasMore: true, nextBatch: 1, statusLabel: "Exibindo 60 de 61" });
    expect(clickUntil(61, 1)).toMatchObject({ hasMore: false, displayed: 61, statusLabel: "Exibindo 61 de 61" });
  });

  it("120 resultados: após um clique, 'Exibindo 120 de 120'", () => {
    expect(clickUntil(120, 1)).toMatchObject({ hasMore: false, statusLabel: "Exibindo 120 de 120" });
  });

  it("121 resultados: 120 de 121 e depois 121 de 121", () => {
    expect(clickUntil(121, 1)).toMatchObject({ hasMore: true, nextBatch: 1, statusLabel: "Exibindo 120 de 121" });
    expect(clickUntil(121, 2)).toMatchObject({ hasMore: false, statusLabel: "Exibindo 121 de 121" });
  });

  it("incremento nunca ultrapassa o total, mesmo com cliques extras", () => {
    expect(nextCatalogVisibleCount(61, 61)).toBe(61);
    expect(nextCatalogVisibleCount(120, 61)).toBe(61);
    expect(catalogPaginationState(500, 3).displayed).toBe(3);
  });

  it("filtro reduzido depois de expandir: contagem acompanha o novo total", () => {
    // visibleCount ficou em 120 e o filtro passou a ter 5 resultados (antes do reset do effect).
    expect(catalogPaginationState(120, 5)).toMatchObject({ displayed: 5, hasMore: false, showStatus: false });
  });

  it("a página usa os helpers e reinicia o bloco ao mudar busca, modalidade ou status", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "../client/src/pages/ExamCatalogPage.tsx"), "utf8");
    expect(source).toContain("useEffect(() => { setVisibleCount(CATALOG_PAGE_SIZE); }, [search, modalityFilter, statusFilter]);");
    expect(source).toContain("filteredEntries.slice(0, pagination.displayed)");
    expect(source).toContain("nextCatalogVisibleCount(count, filteredEntries.length)");
    expect(source).toContain("{pagination.statusLabel}");
    expect(source).not.toContain("Exibindo {visibleCount}");
  });
});
