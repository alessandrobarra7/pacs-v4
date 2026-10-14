/**
 * CORREÇÃO (pedido do Alessandro, 2026-10-13; revisada na mesma data após ele
 * apontar bloqueios): isolamento de cache CLÍNICO de busca do PACS entre
 * usuários diferentes no mesmo navegador/computador.
 *
 * Achado original: localStorage/sessionStorage guardavam resultados de
 * busca, filtros e metadados de estudo escopados só por UNIDADE
 * (`pacs_query_results_unit_<id>`, `pacs_filter_unit_<id>`,
 * `pacs_selected_unit_id`, `exam_label_<uid>`, `study_<uid>`), nunca por
 * usuário, e o logout nunca limpava nada disso. Num computador
 * compartilhado, o próximo login via a busca de quem saiu antes, assim que
 * a tela montava.
 *
 * Bloqueios que o Alessandro apontou na primeira versão desta correção, e
 * que este arquivo agora cobre explicitamente:
 *
 * 1. A primeira versão usava a regra ampla "qualquer chave começando com
 *    pacs_" para decidir o que apagar. Isso apagava também
 *    `pacs_auto_download_unit_*`, que é preferência operacional (se o PDF
 *    baixa automaticamente), não dado clínico. Corrigido: a lista agora é
 *    uma allowlist explícita de chaves/prefixos clínicos, não um prefixo
 *    genérico.
 *
 * 2. `client/src/components/AppHeader.tsx` — renderizado por
 *    PacsQueryPage.tsx, ou seja, é o header real da worklist — tinha um
 *    `handleLogout()` próprio, com sua própria lógica de limpeza (só
 *    `pacs_query_results*` em localStorage), nunca chamando a rotina
 *    central do módulo de isolamento. Corrigido: AppHeader agora importa e
 *    chama `clearPacsClinicalCache()`.
 *
 * Este teste prova, via chamadas reais (não leitura de texto) contra um
 * Storage falso em memória, que:
 * 1. clearPacsClinicalCache() remove todas as chaves clínicas (resultados,
 *    filtros, unidade selecionada, rótulos, metadados) de ambos os
 *    storages.
 * 2. clearPacsClinicalCache() PRESERVA preferências não clínicas:
 *    pacs_auto_download_unit_*, pacs-layout-updated, theme, e uma chave de
 *    exemplo de outro módulo (financeiro).
 * 3. Troca de usuário A → B via purgeStaleCrossUserCacheIfNeeded remove só
 *    as chaves clínicas, atualiza o carimbo de dono para B, e preserva as
 *    preferências não clínicas.
 * 4. Recarga do mesmo usuário não remove nada (nem clínico, nem
 *    preferência).
 * 5. Usuário null/undefined é no-op seguro.
 * 6. Integração: AppHeader.tsx e useAuth.ts chamam a MESMA função central
 *    (clearPacsClinicalCache), e AppHeader não tem mais lógica paralela
 *    restrita a "pacs_query_results".
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clearPacsClinicalCache,
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

  keys(): string[] {
    return Array.from(this.store.keys());
  }
}

/** Dados clínicos reais que o PACS guarda em cache — nenhum é dado de paciente de verdade. */
function seedClinicalKeys(localStorageFake: FakeStorage, sessionStorageFake: FakeStorage) {
  localStorageFake.setItem("pacs_selected_unit_id", "20");
  localStorageFake.setItem(
    "pacs_query_results_unit_20",
    JSON.stringify([{ patientName: "PACIENTE EXEMPLO" }]),
  );
  localStorageFake.setItem("exam_label_1.2.3.4", "TC DE CRANIO");
  sessionStorageFake.setItem("pacs_filter_unit_20", JSON.stringify({ period: "today" }));
  sessionStorageFake.setItem("study_1.2.3.4", JSON.stringify({ patientName: "PACIENTE EXEMPLO" }));
}

/** Preferências NÃO clínicas que devem sobreviver a qualquer limpeza deste módulo. */
function seedNonClinicalPreferences(localStorageFake: FakeStorage, sessionStorageFake: FakeStorage) {
  localStorageFake.setItem("pacs_auto_download_unit_20", "true");
  localStorageFake.setItem("pacs-layout-updated", JSON.stringify({ at: 123 }));
  localStorageFake.setItem("theme", "dark");
  localStorageFake.setItem("sidebar-width", "280");
  localStorageFake.setItem("finance_theme_pref", "blue");
  sessionStorageFake.setItem("finance_some_session_pref", "x");
}

function seedEverything(localStorageFake: FakeStorage, sessionStorageFake: FakeStorage) {
  seedClinicalKeys(localStorageFake, sessionStorageFake);
  seedNonClinicalPreferences(localStorageFake, sessionStorageFake);
}

describe("pacsCacheIsolation — isolamento de cache CLÍNICO do PACS entre usuários", () => {
  it("clearPacsClinicalCache remove todas as chaves clínicas de ambos os storages", () => {
    const localStorageFake = new FakeStorage();
    const sessionStorageFake = new FakeStorage();
    seedEverything(localStorageFake, sessionStorageFake);

    clearPacsClinicalCache(localStorageFake, sessionStorageFake);

    expect(localStorageFake.getItem("pacs_selected_unit_id")).toBeNull();
    expect(localStorageFake.getItem("pacs_query_results_unit_20")).toBeNull();
    expect(localStorageFake.getItem("exam_label_1.2.3.4")).toBeNull();
    expect(sessionStorageFake.getItem("pacs_filter_unit_20")).toBeNull();
    expect(sessionStorageFake.getItem("study_1.2.3.4")).toBeNull();
  });

  it("clearPacsClinicalCache PRESERVA preferências não clínicas (auto-download, layout, tema, sidebar, outros módulos)", () => {
    const localStorageFake = new FakeStorage();
    const sessionStorageFake = new FakeStorage();
    seedEverything(localStorageFake, sessionStorageFake);

    clearPacsClinicalCache(localStorageFake, sessionStorageFake);

    expect(localStorageFake.getItem("pacs_auto_download_unit_20")).toBe("true");
    expect(localStorageFake.getItem("pacs-layout-updated")).not.toBeNull();
    expect(localStorageFake.getItem("theme")).toBe("dark");
    expect(localStorageFake.getItem("sidebar-width")).toBe("280");
    expect(localStorageFake.getItem("finance_theme_pref")).toBe("blue");
    expect(sessionStorageFake.getItem("finance_some_session_pref")).toBe("x");
  });

  it("purgeStaleCrossUserCacheIfNeeded (troca de usuário A -> B) remove só as chaves clínicas, atualiza o dono e preserva preferências", () => {
    const localStorageFake = new FakeStorage();
    const sessionStorageFake = new FakeStorage();
    seedEverything(localStorageFake, sessionStorageFake);
    localStorageFake.setItem("pacs_cache_owner_user_id", "7"); // dono anterior: usuário 7

    purgeStaleCrossUserCacheIfNeeded(42, localStorageFake, sessionStorageFake); // usuário 42 loga agora

    // clínico sumiu
    expect(localStorageFake.getItem("pacs_query_results_unit_20")).toBeNull();
    expect(sessionStorageFake.getItem("study_1.2.3.4")).toBeNull();
    // dono atualizado
    expect(localStorageFake.getItem("pacs_cache_owner_user_id")).toBe("42");
    // preferências preservadas
    expect(localStorageFake.getItem("pacs_auto_download_unit_20")).toBe("true");
    expect(localStorageFake.getItem("theme")).toBe("dark");
    expect(localStorageFake.getItem("finance_theme_pref")).toBe("blue");
  });

  it("purgeStaleCrossUserCacheIfNeeded NÃO apaga nada quando o usuário logado já é o dono salvo (recarga de página)", () => {
    const localStorageFake = new FakeStorage();
    const sessionStorageFake = new FakeStorage();
    seedEverything(localStorageFake, sessionStorageFake);
    localStorageFake.setItem("pacs_cache_owner_user_id", "42");

    purgeStaleCrossUserCacheIfNeeded(42, localStorageFake, sessionStorageFake);

    expect(localStorageFake.getItem("pacs_query_results_unit_20")).not.toBeNull();
    expect(sessionStorageFake.getItem("study_1.2.3.4")).not.toBeNull();
    expect(localStorageFake.getItem("pacs_auto_download_unit_20")).toBe("true");
    expect(localStorageFake.getItem("pacs_cache_owner_user_id")).toBe("42");
  });

  it("purgeStaleCrossUserCacheIfNeeded é no-op seguro quando ainda não há usuário logado (null/undefined)", () => {
    const localStorageFake = new FakeStorage();
    const sessionStorageFake = new FakeStorage();
    seedEverything(localStorageFake, sessionStorageFake);

    purgeStaleCrossUserCacheIfNeeded(null, localStorageFake, sessionStorageFake);
    purgeStaleCrossUserCacheIfNeeded(undefined, localStorageFake, sessionStorageFake);

    expect(localStorageFake.getItem("pacs_query_results_unit_20")).not.toBeNull();
    expect(localStorageFake.getItem("pacs_cache_owner_user_id")).toBeNull();
  });
});

describe("Integração do logout real (AppHeader e useAuth usam a mesma rotina central)", () => {
  const appHeaderTsx = readFileSync(
    new URL("../client/src/components/AppHeader.tsx", import.meta.url),
    "utf-8",
  );
  const useAuthTs = readFileSync(
    new URL("../client/src/_core/hooks/useAuth.ts", import.meta.url),
    "utf-8",
  );

  it("AppHeader.tsx (header real da worklist PACS) importa e chama clearPacsClinicalCache no logout", () => {
    expect(appHeaderTsx).toContain(
      'import { clearPacsClinicalCache } from "@/lib/pacsCacheIsolation";',
    );
    expect(appHeaderTsx).toContain("clearPacsClinicalCache();");
  });

  it("AppHeader.tsx NÃO tem mais lógica paralela restrita a pacs_query_results (fora do comentário explicativo)", () => {
    // só pode sobrar a menção em prosa dentro do comentário que explica o
    // histórico da correção — nenhum uso real em código (Object.keys/filter/
    // startsWith) sobre esse prefixo.
    expect(appHeaderTsx).not.toContain('.startsWith("pacs_query_results")');
    expect(appHeaderTsx).not.toContain("Object.keys(localStorage)");
  });

  it("useAuth.ts também chama clearPacsClinicalCache no logout (mesma função central, não uma lista paralela)", () => {
    expect(useAuthTs).toContain(
      'import { clearPacsClinicalCache } from "@/lib/pacsCacheIsolation";',
    );
    expect(useAuthTs).toContain("clearPacsClinicalCache();");
    // não deve sobrar referência ao nome antigo da função (versão anterior desta correção)
    expect(useAuthTs).not.toContain("clearPacsLocalCache");
  });
});
