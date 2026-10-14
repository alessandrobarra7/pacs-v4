/**
 * CORREÇÃO (pedido do Alessandro, 2026-10-13): isolamento de cache de busca
 * do PACS entre usuários diferentes no mesmo navegador/computador.
 *
 * Achado: localStorage/sessionStorage guardavam resultados de busca,
 * filtros e metadados de estudo escopados só por UNIDADE
 * (`pacs_query_results_unit_<id>`, `pacs_filter_unit_<id>`,
 * `pacs_selected_unit_id`, `exam_label_<uid>`, `study_<uid>`), nunca por
 * usuário, e o logout nunca limpava nada disso. Num computador
 * compartilhado, o próximo login via a busca de quem saiu antes, assim que
 * a tela montava.
 *
 * Este teste prova, via chamadas reais (não leitura de texto) contra um
 * Storage falso em memória, que:
 * 1. clearPacsLocalCache() remove todas as chaves com os prefixos
 *    conhecidos, de ambos os storages, e não toca chaves de outros módulos.
 * 2. purgeStaleCrossUserCacheIfNeeded() limpa tudo quando o usuário logado
 *    é diferente do "dono" registrado do cache, e grava o novo dono.
 * 3. purgeStaleCrossUserCacheIfNeeded() NÃO limpa nada quando o usuário
 *    logado é o mesmo dono já registrado (preserva a conveniência original
 *    do cache para o mesmo usuário).
 * 4. purgeStaleCrossUserCacheIfNeeded() é um no-op seguro quando não há
 *    usuário logado ainda (currentUserId null/undefined).
 */
import { describe, expect, it } from "vitest";
import {
  clearPacsLocalCache,
  purgeStaleCrossUserCacheIfNeeded,
  type StorageLike,
} from "../client/src/lib/pacsCacheIsolation";

class FakeStorage implements StorageLike {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  // helper só para os testes
  keys(): string[] {
    return Array.from(this.store.keys());
  }
}

function seedTypicalPacsCache(localStorageFake: FakeStorage, sessionStorageFake: FakeStorage) {
  localStorageFake.setItem("pacs_selected_unit_id", "20");
  localStorageFake.setItem(
    "pacs_query_results_unit_20",
    JSON.stringify([{ patientName: "MARIA EDUARDA SANTOS SILVA" }]),
  );
  localStorageFake.setItem("exam_label_1.2.3.4", "TC DE CRANIO");
  sessionStorageFake.setItem("pacs_filter_unit_20", JSON.stringify({ period: "today" }));
  sessionStorageFake.setItem("study_1.2.3.4", JSON.stringify({ patientName: "MARIA EDUARDA SANTOS SILVA" }));
  // chave de outro módulo, não deve ser tocada por nenhuma das funções
  localStorageFake.setItem("finance_theme_pref", "dark");
}

describe("pacsCacheIsolation — isolamento de cache de busca do PACS entre usuários", () => {
  it("clearPacsLocalCache remove todas as chaves pacs_/exam_label_/study_ de ambos os storages, sem tocar outras chaves", () => {
    const localStorageFake = new FakeStorage();
    const sessionStorageFake = new FakeStorage();
    seedTypicalPacsCache(localStorageFake, sessionStorageFake);

    clearPacsLocalCache(localStorageFake, sessionStorageFake);

    expect(localStorageFake.getItem("pacs_selected_unit_id")).toBeNull();
    expect(localStorageFake.getItem("pacs_query_results_unit_20")).toBeNull();
    expect(localStorageFake.getItem("exam_label_1.2.3.4")).toBeNull();
    expect(sessionStorageFake.getItem("pacs_filter_unit_20")).toBeNull();
    expect(sessionStorageFake.getItem("study_1.2.3.4")).toBeNull();
    // chave de outro módulo preservada
    expect(localStorageFake.getItem("finance_theme_pref")).toBe("dark");
  });

  it("purgeStaleCrossUserCacheIfNeeded limpa tudo quando o usuário logado é diferente do dono salvo do cache", () => {
    const localStorageFake = new FakeStorage();
    const sessionStorageFake = new FakeStorage();
    seedTypicalPacsCache(localStorageFake, sessionStorageFake);
    // cache pertence ao usuário 7 (ex.: operador que usou o computador antes)
    localStorageFake.setItem("pacs_cache_owner_user_id", "7");

    // usuário 42 loga agora no mesmo navegador
    purgeStaleCrossUserCacheIfNeeded(42, localStorageFake, sessionStorageFake);

    expect(localStorageFake.getItem("pacs_query_results_unit_20")).toBeNull();
    expect(sessionStorageFake.getItem("study_1.2.3.4")).toBeNull();
    // carimbo atualizado para o novo usuário
    expect(localStorageFake.getItem("pacs_cache_owner_user_id")).toBe("42");
  });

  it("purgeStaleCrossUserCacheIfNeeded NÃO limpa nada quando o usuário logado já é o dono salvo do cache", () => {
    const localStorageFake = new FakeStorage();
    const sessionStorageFake = new FakeStorage();
    seedTypicalPacsCache(localStorageFake, sessionStorageFake);
    localStorageFake.setItem("pacs_cache_owner_user_id", "42");

    // mesmo usuário 42 continua logado / recarregou a página
    purgeStaleCrossUserCacheIfNeeded(42, localStorageFake, sessionStorageFake);

    // nada foi apagado — preserva a busca/filtro do próprio usuário
    expect(localStorageFake.getItem("pacs_query_results_unit_20")).not.toBeNull();
    expect(sessionStorageFake.getItem("study_1.2.3.4")).not.toBeNull();
    expect(localStorageFake.getItem("pacs_cache_owner_user_id")).toBe("42");
  });

  it("purgeStaleCrossUserCacheIfNeeded é um no-op seguro quando ainda não há usuário logado", () => {
    const localStorageFake = new FakeStorage();
    const sessionStorageFake = new FakeStorage();
    seedTypicalPacsCache(localStorageFake, sessionStorageFake);

    purgeStaleCrossUserCacheIfNeeded(null, localStorageFake, sessionStorageFake);
    purgeStaleCrossUserCacheIfNeeded(undefined, localStorageFake, sessionStorageFake);

    // nada mudou — ainda não sabemos quem é o usuário, não há decisão segura a tomar
    expect(localStorageFake.getItem("pacs_query_results_unit_20")).not.toBeNull();
    expect(localStorageFake.getItem("pacs_cache_owner_user_id")).toBeNull();
  });
});
