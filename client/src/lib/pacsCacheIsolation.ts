/**
 * ISOLAMENTO DE CACHE ENTRE USUÁRIOS (pedido do Alessandro, 2026-10-13):
 *
 * Achado: a tela de busca do PACS (PacsQueryPage.tsx) e as telas que a
 * acompanham (ReportEditorPage.tsx, DicomViewerPage.tsx) guardam resultados
 * de busca, filtros e metadados de estudo em localStorage/sessionStorage
 * usando chaves como `pacs_query_results_unit_<unitId>`,
 * `pacs_selected_unit_id`, `pacs_filter_unit_<unitId>`, `exam_label_<uid>` e
 * `study_<uid>` — todas escopadas só por UNIDADE, nunca pelo usuário logado.
 * O logout também nunca limpava esses dados.
 *
 * Em um computador compartilhado (comum em postos de trabalho de hospital),
 * isso faz com que, assim que a tela monta, o PRIMEIRO RENDER já pinte os
 * resultados de busca (nomes de pacientes, exames) que ficaram salvos da
 * última vez que QUALQUER usuário buscou naquela mesma unidade — antes
 * mesmo de qualquer busca nova rodar no servidor. Dois usuários diferentes
 * com acesso à mesma unidade, usando o mesmo navegador em sequência, viam a
 * busca um do outro.
 *
 * O servidor sempre autorizou corretamente por unidade a cada requisição
 * (server/routers/pacs.ts) — este não é um problema de autorização no
 * banco, é um problema de higiene de cache no navegador.
 *
 * Esta correção não muda o formato das chaves existentes (risco menor,
 * menos arquivos tocados). Em vez disso, adiciona uma segunda camada,
 * independente, que:
 *
 * 1. `clearPacsLocalCache()` — limpa tudo que casa com os prefixos
 *    conhecidos. Chamada no logout (client/src/_core/hooks/useAuth.ts),
 *    antes do reload para /login.
 *
 * 2. `purgeStaleCrossUserCacheIfNeeded(currentUserId)` — grava um "carimbo
 *    de dono" (`pacs_cache_owner_user_id`) com o id do usuário logado. Se o
 *    carimbo salvo não bate com o usuário atual, limpa tudo antes de
 *    atualizar o carimbo. Chamada em App.tsx (ProtectedRoute), antes de
 *    montar qualquer página protegida — cobre o caso mais comum na
 *    prática: alguém fecha o navegador ou a aba sem clicar em "Sair", e a
 *    próxima pessoa loga direto. Nesse caso o logout() nunca roda, mas o
 *    carimbo de dono detecta a troca de usuário mesmo assim.
 */

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PACS_CACHE_PREFIXES = ["pacs_", "exam_label_", "study_"];
const PACS_CACHE_OWNER_KEY = "pacs_cache_owner_user_id";

function clearPrefixedKeys(storage: StorageLike): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || key === PACS_CACHE_OWNER_KEY) continue;
    if (PACS_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
}

/**
 * Limpa incondicionalmente todo o cache de busca/estudo do PACS em
 * localStorage e sessionStorage, além do carimbo de dono. Usada no logout.
 */
export function clearPacsLocalCache(
  localStorageImpl: StorageLike = globalThis.localStorage,
  sessionStorageImpl: StorageLike = globalThis.sessionStorage,
): void {
  try {
    clearPrefixedKeys(localStorageImpl);
    clearPrefixedKeys(sessionStorageImpl);
    localStorageImpl.removeItem(PACS_CACHE_OWNER_KEY);
  } catch {
    // Storage indisponível (ex.: modo privado restrito do navegador) — nada a fazer.
  }
}

/**
 * Compara o usuário logado contra o "dono" registrado do cache atual.
 * Se forem diferentes (ou não houver carimbo ainda), limpa tudo e grava o
 * novo dono. Se já forem o mesmo usuário, não faz nada — preserva filtros e
 * resultados entre sessões do MESMO usuário, que é o comportamento original
 * pretendido pelo cache.
 */
export function purgeStaleCrossUserCacheIfNeeded(
  currentUserId: number | string | null | undefined,
  localStorageImpl: StorageLike = globalThis.localStorage,
  sessionStorageImpl: StorageLike = globalThis.sessionStorage,
): void {
  if (currentUserId === null || currentUserId === undefined) return;
  try {
    const currentOwner = String(currentUserId);
    const storedOwner = localStorageImpl.getItem(PACS_CACHE_OWNER_KEY);
    if (storedOwner === currentOwner) return;
    clearPrefixedKeys(localStorageImpl);
    clearPrefixedKeys(sessionStorageImpl);
    localStorageImpl.setItem(PACS_CACHE_OWNER_KEY, currentOwner);
  } catch {
    // Storage indisponível — nada a fazer.
  }
}
