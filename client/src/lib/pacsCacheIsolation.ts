/**
 * ISOLAMENTO DE CACHE CLÍNICO ENTRE USUÁRIOS (pedido do Alessandro, 2026-10-13;
 * corrigido em 2026-10-13 após revisão do próprio Alessandro sobre o escopo):
 *
 * Achado original: a tela de busca do PACS (PacsQueryPage.tsx) e as telas que a
 * acompanham (ReportEditorPage.tsx, DicomViewerPage.tsx) guardam resultados de
 * busca, filtros e metadados de estudo em localStorage/sessionStorage usando
 * chaves escopadas só por UNIDADE, nunca pelo usuário logado. Em um computador
 * compartilhado, isso faz com que o próximo usuário a logar veja, por um
 * instante (ou indefinidamente, se não rodar nova busca), dados de paciente
 * buscados por quem usou o computador antes dele.
 *
 * CORREÇÃO DE ESCOPO (nesta revisão): a primeira versão deste módulo usava uma
 * regra ampla demais — qualquer chave começando com o prefixo genérico
 * "pacs_" era apagada. Isso é errado: existem chaves com esse mesmo prefixo
 * que NÃO são dado clínico, e apagá-las no logout/troca de usuário destrói
 * preferência legítima do usuário sem motivo. Confirmado em código (grep em
 * PacsQueryPage.tsx, ReportEditorPage.tsx, DicomViewerPage.tsx) o conjunto
 * completo de chaves em uso:
 *
 *   CLÍNICAS (removidas por este módulo):
 *   - `pacs_selected_unit_id` (chave exata) — contexto de qual unidade/paciente
 *     estava sendo consultado.
 *   - `pacs_query_results_unit_<unitId>` (prefixo) — resultados de busca
 *     (nomes de paciente, exames) cacheados por unidade.
 *   - `pacs_filter_unit_<unitId>` (prefixo) — filtros de busca aplicados
 *     (podem conter nome de paciente digitado, período, modalidade).
 *   - `exam_label_<studyUid>` (prefixo) — legenda/rótulo de exame vinculada a
 *     um estudo (UID) específico.
 *   - `study_<studyUid>` (prefixo) — metadados do estudo (nome do paciente,
 *     idade, sexo, data de nascimento) usados no editor de laudo e no viewer.
 *
 *   NÃO CLÍNICAS (preservadas — nunca tocadas por este módulo):
 *   - `pacs_auto_download_unit_<unitId>` — preferência operacional do usuário
 *     (se o PDF deve baixar automaticamente ao abrir o estudo), não é dado de
 *     paciente. Usa o prefixo "pacs_" mas não é dado clínico.
 *   - `pacs-layout-updated` — sinal de sincronização de layout de laudo entre
 *     abas (usa hífen, não underscore; não contém paciente, laudo ou UID).
 *   - `theme`, `sidebar-width` — preferências de interface.
 *   - chaves de outros módulos (ex.: financeiro) — fora do escopo deste PACS.
 *
 * Por isso este módulo usa uma lista EXPLÍCITA de padrões clínicos (exata ou
 * por prefixo específico), nunca um prefixo genérico — e nunca
 * `localStorage.clear()`/`sessionStorage.clear()`, que apagaria tudo
 * indiscriminadamente.
 *
 * O servidor sempre autorizou corretamente por unidade a cada requisição
 * (server/routers/pacs.ts) — este não é um problema de autorização no banco,
 * é um problema de higiene de cache no navegador.
 *
 * Duas funções:
 *
 * 1. `clearPacsClinicalCache()` — limpa incondicionalmente todas as chaves
 *    clínicas (ver lista acima) e, só nesta função (logout explícito), também
 *    remove o carimbo de dono `pacs_cache_owner_user_id` — já que ninguém
 *    está logado depois de um logout, não há "dono" a manter. Chamada tanto
 *    em client/src/_core/hooks/useAuth.ts (fluxo usado por DashboardLayout)
 *    quanto em client/src/components/AppHeader.tsx (fluxo usado pela
 *    worklist do PACS — tinha um handleLogout próprio que só limpava
 *    "pacs_query_results", nunca os filtros, rótulos ou metadados de estudo;
 *    corrigido para usar esta mesma função central).
 *
 * 2. `purgeStaleCrossUserCacheIfNeeded(currentUserId)` — grava um "carimbo de
 *    dono" (`pacs_cache_owner_user_id`) com o id do usuário logado. Se o
 *    carimbo salvo não bate com o usuário atual, limpa as chaves clínicas
 *    antes de atualizar o carimbo para o novo usuário (o carimbo em si NÃO é
 *    removido aqui, só reescrito — ele continua existindo para registrar quem
 *    é o dono atual). Se já for o mesmo usuário, não faz nada — preserva o
 *    cache clínico (e as preferências) do próprio usuário entre recargas de
 *    página. Chamada em App.tsx (ProtectedRoute), antes de montar qualquer
 *    página protegida — cobre o caso mais comum na prática: alguém fecha o
 *    navegador ou a aba sem clicar em "Sair", e a próxima pessoa loga direto.
 *    Nesse caso nenhum logout roda, mas o carimbo de dono detecta a troca de
 *    usuário mesmo assim, e crucialmente roda ANTES do primeiro render da
 *    página protegida (ProtectedRoute decide se monta o filho ou não),
 *    evitando o "flash" de dado antigo que um useEffect dentro da própria
 *    PacsQueryPage chegaria tarde demais para evitar (queryResults é
 *    inicializado via useState(() => ...), que roda de forma síncrona durante
 *    o render, antes de qualquer useEffect).
 */

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Chaves clínicas que casam exatamente (sem prefixo). */
const CLINICAL_EXACT_KEYS = ["pacs_selected_unit_id"];

/**
 * Prefixos clínicos específicos. Deliberadamente NÃO inclui o prefixo
 * genérico "pacs_" — ver comentário de topo do arquivo sobre por que isso
 * apagaria preferências não clínicas como pacs_auto_download_unit_*.
 */
const CLINICAL_PREFIXES = [
  "pacs_query_results_unit_",
  "pacs_filter_unit_",
  "exam_label_",
  "study_",
];

const PACS_CACHE_OWNER_KEY = "pacs_cache_owner_user_id";

function isClinicalKey(key: string): boolean {
  if (CLINICAL_EXACT_KEYS.includes(key)) return true;
  return CLINICAL_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function clearClinicalKeysFrom(storage: StorageLike): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key) continue;
    if (isClinicalKey(key)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
}

/**
 * Limpa incondicionalmente todo o cache CLÍNICO do PACS (resultados de busca,
 * filtros, unidade selecionada, rótulos de exame, metadados de estudo) em
 * localStorage e sessionStorage, além do carimbo de dono. Usada no logout
 * explícito (useAuth.ts e AppHeader.tsx). Preferências não clínicas
 * (pacs_auto_download_unit_*, pacs-layout-updated, theme, sidebar-width,
 * chaves de outros módulos) nunca são tocadas.
 */
export function clearPacsClinicalCache(
  localStorageImpl: StorageLike = globalThis.localStorage,
  sessionStorageImpl: StorageLike = globalThis.sessionStorage,
): void {
  try {
    clearClinicalKeysFrom(localStorageImpl);
    clearClinicalKeysFrom(sessionStorageImpl);
    localStorageImpl.removeItem(PACS_CACHE_OWNER_KEY);
  } catch {
    // Storage indisponível (ex.: modo privado restrito do navegador) — nada a fazer.
  }
}

/**
 * Compara o usuário logado contra o "dono" registrado do cache clínico
 * atual. Se forem diferentes (ou não houver carimbo ainda), limpa as chaves
 * clínicas e grava o novo dono. Se já forem o mesmo usuário, não faz nada —
 * preserva filtros, resultados e preferências entre sessões do MESMO
 * usuário, que é o comportamento original pretendido pelo cache.
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
    clearClinicalKeysFrom(localStorageImpl);
    clearClinicalKeysFrom(sessionStorageImpl);
    localStorageImpl.setItem(PACS_CACHE_OWNER_KEY, currentOwner);
  } catch {
    // Storage indisponível — nada a fazer.
  }
}
