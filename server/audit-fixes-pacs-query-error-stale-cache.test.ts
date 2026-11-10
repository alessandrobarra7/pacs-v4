/**
 * CORREÇÃO (achado do Alessandro, 2026-11-01): quando a consulta DICOM ao
 * vivo falha (ex.: PACS inalcançável — EHOSTUNREACH), a tela de busca do
 * PACS (client/src/pages/PacsQueryPage.tsx) só exibia um toast de erro — a
 * lista `queryResults`, inicializada a partir do cache em localStorage
 * (`pacs_query_results_unit_<unitId>`, escopado só por unidade, nunca pelo
 * filtro de data ativo), permanecia na tela como se fosse o resultado do
 * filtro atualmente selecionado. Reproduzido ao vivo: filtro "Hoje"
 * (01/11/2026) continuando a mostrar um estudo de 15/10/2026 ao lado do
 * toast "Falha na consulta DICOM... EHOSTUNREACH 172.16.3.250:3004".
 *
 * Este arquivo prova duas coisas:
 *
 * 1. Comportamentalmente, via Storage falso em memória (não leitura de
 *    texto), que `clearStalePacsQueryResultsCache()` remove exatamente a
 *    chave de cache da unidade informada e preserva qualquer outra chave
 *    (de outra unidade ou de outro módulo).
 * 2. Que o `onError` da mutação `pacs.query` em PacsQueryPage.tsx
 *    efetivamente chama `setQueryResults([])` (zera a lista em memória) e
 *    `clearStalePacsQueryResultsCache(cacheKey)` (zera o cache em disco) —
 *    checagem de wiring no código-fonte real, no mesmo padrão já usado
 *    neste repositório (ex.: pacs-print-document-key-wiring.test.ts) para
 *    comportamento de UI que depende de hooks do React/tRPC e não compensa
 *    montar a árvore inteira do componente só para este achado.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clearStalePacsQueryResultsCache,
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
}

describe("clearStalePacsQueryResultsCache", () => {
  it("remove exatamente a chave de cache da unidade informada", () => {
    const storage = new FakeStorage();
    storage.setItem("pacs_query_results_unit_7", JSON.stringify([{ patientName: "FULANO" }]));

    clearStalePacsQueryResultsCache("pacs_query_results_unit_7", storage);

    expect(storage.getItem("pacs_query_results_unit_7")).toBeNull();
  });

  it("preserva o cache de OUTRAS unidades e de outros módulos", () => {
    const storage = new FakeStorage();
    storage.setItem("pacs_query_results_unit_7", JSON.stringify([{ patientName: "FULANO" }]));
    storage.setItem("pacs_query_results_unit_9", JSON.stringify([{ patientName: "CICLANO" }]));
    storage.setItem("pacs_auto_download_unit_7", "true");
    storage.setItem("theme", "dark");

    clearStalePacsQueryResultsCache("pacs_query_results_unit_7", storage);

    expect(storage.getItem("pacs_query_results_unit_7")).toBeNull();
    expect(storage.getItem("pacs_query_results_unit_9")).toBe(JSON.stringify([{ patientName: "CICLANO" }]));
    expect(storage.getItem("pacs_auto_download_unit_7")).toBe("true");
    expect(storage.getItem("theme")).toBe("dark");
  });

  it("é no-op seguro se a chave não existir", () => {
    const storage = new FakeStorage();
    expect(() => clearStalePacsQueryResultsCache("pacs_query_results_unit_7", storage)).not.toThrow();
    expect(storage.getItem("pacs_query_results_unit_7")).toBeNull();
  });

  it("é no-op seguro se o storage lançar (ex.: modo privado restrito)", () => {
    const throwingStorage: StorageLike = {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: () => { throw new Error("QuotaExceededError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    };
    expect(() => clearStalePacsQueryResultsCache("pacs_query_results_unit_7", throwingStorage)).not.toThrow();
  });
});

describe("wiring: onError de pacs.query em PacsQueryPage.tsx", () => {
  const source = readFileSync(
    new URL("../client/src/pages/PacsQueryPage.tsx", import.meta.url),
    "utf-8",
  );

  // Isola o corpo do onError da mutação queryPacs (entre "onError: (error: any) => {" e o "},\n  });" que fecha a mutação).
  const onErrorMatch = source.match(
    /const queryPacs = trpc\.pacs\.query\.useMutation\(\{[\s\S]*?onError: \(error: any\) => \{([\s\S]*?)\n\s*\},\n\s*\}\);/,
  );

  it("o bloco onError da mutação pacs.query existe e foi localizado", () => {
    expect(onErrorMatch).not.toBeNull();
  });

  const onErrorBody = onErrorMatch?.[1] ?? "";

  it("zera a lista em memória (setQueryResults([]))", () => {
    expect(onErrorBody).toMatch(/setQueryResults\(\s*\[\]\s*\)/);
  });

  it("limpa o cache em disco da unidade atual (clearStalePacsQueryResultsCache(cacheKey))", () => {
    expect(onErrorBody).toMatch(/clearStalePacsQueryResultsCache\(\s*cacheKey\s*\)/);
  });

  it("PacsQueryPage.tsx importa clearStalePacsQueryResultsCache de @/lib/pacsCacheIsolation", () => {
    expect(source).toMatch(
      /import \{ clearStalePacsQueryResultsCache \} from "@\/lib\/pacsCacheIsolation";/,
    );
  });
});
