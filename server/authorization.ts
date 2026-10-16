/**
 * CAMADA CENTRAL DE AUTORIZAÇÃO — PACS V4
 *
 * Esta é a ÚNICA fonte de verdade para validação de acesso por unidade.
 * Todas as rotas sensíveis devem usar estas funções em vez de validar manualmente.
 *
 * Regras:
 * - admin_master: acesso total, nunca depende de users.unit_id
 * - usuário comum: acesso via user_unit_permissions; fallback temporário para users.unit_id legado
 */

import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { user_unit_permissions } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export type PermissionFlag =
  | "view_studies"
  | "edit_reports"
  | "view_anamnesis"
  | "edit_anamnesis"
  | "edit_exam_legend"
  | "print_reports"
  | "manage_templates";

export interface AuthUser {
  id: number;
  role: string;
  unit_id: number | null;
}

const LEGACY_SAFE_PERMISSIONS: PermissionFlag[] = ["view_studies", "view_anamnesis", "print_reports"];

export function legacyFallbackAllows(userUnitId: number | null, unitId: number, permission: PermissionFlag): boolean {
  return userUnitId === unitId && LEGACY_SAFE_PERMISSIONS.includes(permission);
}

/**
 * Verifica se um usuário pode acessar uma unidade com uma permissão específica.
 * - admin_master: sempre true
 * - Busca em user_unit_permissions; se não existir, usa fallback legado users.unit_id
 */
export async function canAccessUnit(
  user: AuthUser,
  unitId: number,
  permission: PermissionFlag
): Promise<boolean> {
  if (user.role === "admin_master") return true;

  const dbInstance = await getDb();
  if (!dbInstance) return false;
  const rows = await dbInstance
    .select()
    .from(user_unit_permissions)
    .where(
      and(
        eq(user_unit_permissions.user_id, user.id),
        eq(user_unit_permissions.unit_id, unitId)
      )
    )
    .limit(1);
  const perm = rows[0] ?? null;

  if (perm) {
    return (perm as Record<string, unknown>)[permission] === true || (perm as Record<string, unknown>)[permission] === 1;
  }

  // Fallback legado: contas sem concessão granular jamais recebem escrita/gestão.
  return legacyFallbackAllows(user.unit_id, unitId, permission);
}

/**
 * Valida se o usuário tem permissão para acessar os arquivos DICOM em cache de um dado studyInstanceUid.
 * Consulta studies_cache e study_metadata para descobrir a unit_id, negando acesso se o exame for órfão.
 */
export async function assertDicomFileAccess(
  user: AuthUser,
  studyInstanceUid: string,
  permission: PermissionFlag = "view_studies"
): Promise<number> {
  const dbInstance = await getDb();
  if (!dbInstance) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  }

  const { studies_cache, study_metadata } = await import("../drizzle/schema");
  const { eq: eqOp } = await import("drizzle-orm");

  // 1. Tentar buscar unit_id em studies_cache
  const cached = await dbInstance
    .select({ unit_id: studies_cache.unit_id })
    .from(studies_cache)
    .where(eqOp(studies_cache.study_instance_uid, studyInstanceUid))
    .limit(1);

  let unitId = cached[0]?.unit_id ?? null;

  // 2. Se não achou em studies_cache, tentar study_metadata
  if (!unitId) {
    const meta = await dbInstance
      .select({ unit_id: study_metadata.unit_id })
      .from(study_metadata)
      .where(eqOp(study_metadata.study_instance_uid, studyInstanceUid))
      .limit(1);
    unitId = meta[0]?.unit_id ?? null;
  }

  if (!unitId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Exame não vinculado a nenhuma unidade conhecida (acesso negado por segurança).",
    });
  }

  const allowed = await canAccessUnit(user, unitId, permission);
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar exames desta unidade.",
    });
  }

  return unitId;
}

type DicomAccessResolver = (
  user: AuthUser,
  studyInstanceUid: string,
  permission: PermissionFlag,
) => Promise<number>;

type CachedDicomAccess = {
  unitId: number;
  expiresAt: number;
};

/**
 * Mantém por pouco tempo uma autorização de leitura que já foi verificada.
 * O cache é propositalmente específico para o usuário, o snapshot de acesso,
 * o estudo e a permissão solicitada. Falhas nunca são mantidas em cache.
 */
export function createDicomAccessCache(
  resolver: DicomAccessResolver = assertDicomFileAccess,
  options: { ttlMs?: number; now?: () => number; maxEntries?: number } = {},
) {
  const ttlMs = options.ttlMs ?? 60_000;
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? 10_000;
  const entries = new Map<string, CachedDicomAccess>();

  const makeKey = (user: AuthUser, studyInstanceUid: string, permission: PermissionFlag) =>
    [user.id, user.role, user.unit_id ?? "none", permission, studyInstanceUid].join(":");

  const pruneExpiredEntries = (timestamp: number) => {
    entries.forEach((value, key) => {
      if (value.expiresAt <= timestamp) entries.delete(key);
    });
  };

  return {
    async assert(user: AuthUser, studyInstanceUid: string, permission: PermissionFlag = "view_studies"): Promise<number> {
      const timestamp = now();
      const key = makeKey(user, studyInstanceUid, permission);
      const cached = entries.get(key);
      if (cached && cached.expiresAt > timestamp) return cached.unitId;

      if (entries.size >= maxEntries) pruneExpiredEntries(timestamp);
      if (entries.size >= maxEntries) entries.clear();

      const unitId = await resolver(user, studyInstanceUid, permission);
      entries.set(key, { unitId, expiresAt: timestamp + ttlMs });
      return unitId;
    },
    clear() {
      entries.clear();
    },
    size() {
      return entries.size;
    },
  };
}

// Um minuto reduz milhares de consultas por visualização sem prolongar a janela
// de uma alteração de permissão ou revogação de acesso.
const dicomAccessCache = createDicomAccessCache();

export async function assertCachedDicomFileAccess(
  user: AuthUser,
  studyInstanceUid: string,
  permission: PermissionFlag = "view_studies",
): Promise<number> {
  return dicomAccessCache.assert(user, studyInstanceUid, permission);
}

/**
 * Lança FORBIDDEN se o usuário não tiver permissão na unidade.
 */
export async function requireUnitPermission(
  user: AuthUser,
  unitId: number,
  permission: PermissionFlag
): Promise<void> {
  const allowed = await canAccessUnit(user, unitId, permission);
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Você não tem permissão '${permission}' na unidade ${unitId}.`,
    });
  }
}

/**
 * Retorna todos os unit_ids onde o usuário tem a permissão especificada.
 * - admin_master: retorna null (sem filtro — acesso a todas as unidades)
 * - usuário comum: retorna lista de unit_ids com a permissão
 */
export async function getAllowedUnitIds(
  user: AuthUser,
  permission: PermissionFlag
): Promise<number[] | null> {
  if (user.role === "admin_master") return null;

  const dbInstance = await getDb();
  if (!dbInstance) return [];
  const perms = await dbInstance
    .select()
    .from(user_unit_permissions)
    .where(eq(user_unit_permissions.user_id, user.id));

  const fromGranular = perms
    .filter((p: typeof user_unit_permissions.$inferSelect) => (p as Record<string, unknown>)[permission] === true || (p as Record<string, unknown>)[permission] === 1)
    .map((p: typeof user_unit_permissions.$inferSelect) => p.unit_id);

  // Incluir fallback legado se não estiver já na lista
  if (user.unit_id && LEGACY_SAFE_PERMISSIONS.includes(permission) && !fromGranular.includes(user.unit_id)) {
    fromGranular.push(user.unit_id);
  }

  return fromGranular;
}

/**
 * Resolve a unidade efetiva para uma operação.
 * - admin_master: usa input.unit_id se fornecido, senão null (sem filtro)
 * - usuário comum: valida que tem permissão na unidade solicitada
 *   - se input.unit_id fornecido: valida e usa
 *   - se não fornecido: usa primeira unidade com permissão
 */
export async function resolveRequestedUnit(
  user: AuthUser,
  requestedUnitId: number | undefined | null,
  permission: PermissionFlag
): Promise<number | null> {
  if (user.role === "admin_master") {
    return requestedUnitId ?? null;
  }

  if (requestedUnitId) {
    await requireUnitPermission(user, requestedUnitId, permission);
    return requestedUnitId;
  }

  // Sem unidade solicitada: usar primeira unidade com permissão
  const allowedIds = await getAllowedUnitIds(user, permission);
  if (!allowedIds || allowedIds.length === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Você não tem permissão '${permission}' em nenhuma unidade.`,
    });
  }
  return allowedIds[0];
}

/**
 * Retorna o unit_id real de um estudo a partir do study_instance_uid.
 * Busca em study_metadata (tabela de metadados de estudos).
 */
export async function getStudyUnitId(studyInstanceUid: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const { study_metadata } = await import('../drizzle/schema');
  const { eq } = await import('drizzle-orm');
  const rows = await db.select({ unit_id: study_metadata.unit_id })
    .from(study_metadata)
    .where(eq(study_metadata.study_instance_uid, studyInstanceUid))
    .limit(1);
  if (rows[0]?.unit_id) return rows[0].unit_id;
  return null;
}

/**
 * Retorna os unit_ids que um unit_admin pode gerenciar.
 * Para admin_master, retorna null (sem restrição).
 */
export async function getAdminManagedUnitIds(
  user: AuthUser
): Promise<number[] | null> {
  if (user.role === "admin_master") return null;

  const dbInstance2 = await getDb();
  if (!dbInstance2) return [];
  const perms = await dbInstance2
    .select()
    .from(user_unit_permissions)
    .where(eq(user_unit_permissions.user_id, user.id));

  const unitIds = perms.map((p: typeof user_unit_permissions.$inferSelect) => p.unit_id);

  if (user.unit_id && !unitIds.includes(user.unit_id)) {
    unitIds.push(user.unit_id);
  }

  return unitIds;
}

/**
 * Verifica se um usuário já teve, em algum momento, vínculo com acesso de
 * responsável financeiro — seja um vínculo ATIVO em `financial_responsible_users`,
 * seja um vínculo HISTÓRICO registrado em `audit_log` (ação
 * GRANT_FINANCIAL_RESPONSIBLE_ACCESS), mesmo que o vínculo atual tenha sido
 * revogado (a tabela financial_responsible_users usa DELETE+INSERT, sem
 * soft-delete, então o histórico só sobrevive no audit_log).
 */
export async function userHasFinancialResponsibleHistory(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const { financial_responsible_users, audit_log } = await import("../drizzle/schema");

  const activeLinks = await db
    .select()
    .from(financial_responsible_users)
    .where(eq(financial_responsible_users.user_id, userId))
    .limit(1);
  if (activeLinks.length > 0) return true;

  // Parecer de revisão 2026-10-15 (2ª rodada): a versão anterior procurava
  // action='GRANT_FINANCIAL_RESPONSIBLE_ACCESS', target_type='USER',
  // target_id=String(userId) — um formato que NENHUMA gravação real do
  // sistema usa. Tanto createUserTransactional (server/db.ts) quanto
  // linkUserToResponsible gravam, de fato:
  //   target_type: 'FINANCIAL_RESPONSIBLE_USER'
  //   target_id:   `${financialResponsibleId}:${userId}` (dois IDs, não um)
  //   metadata:    { financial_responsible_id, user_id, ... }
  // Por isso, após a revogação do vínculo ativo (DELETE em
  // financial_responsible_users), a função antiga nunca encontrava o
  // histórico real — a conta voltava a parecer "comum" para o unit_admin.
  //
  // A busca correta filtra por target_type e por metadata.user_id (via
  // JSON_EXTRACT, compatível com MySQL/TiDB) — nunca por target_id inteiro
  // (que é um par "responsibleId:userId", não um ID isolado) e nunca com
  // LIKE '%:<id>' (menos explícito, risco de falso positivo). O resultado
  // do banco ainda é reconfirmado em TypeScript (defesa em profundidade:
  // nunca confiar só no filtro SQL, inclusive porque um fake de teste pode
  // devolver linhas sem respeitar o predicado).
  const { sql: sqlTag } = await import("drizzle-orm");
  const historicalGrants = await db
    .select()
    .from(audit_log)
    .where(
      and(
        eq(audit_log.action, "GRANT_FINANCIAL_RESPONSIBLE_ACCESS"),
        eq(audit_log.target_type, "FINANCIAL_RESPONSIBLE_USER"),
        sqlTag`JSON_EXTRACT(${audit_log.metadata}, '$.user_id') = ${userId}`
      )
    )
    .limit(5);

  return historicalGrants.some((row: any) => {
    const metadata = row?.metadata;
    if (!metadata || typeof metadata !== "object") return false;
    return Number((metadata as Record<string, unknown>).user_id) === userId;
  });
}

/**
 * Guarda central e reutilizável: impede que um `unit_admin` assuma ou restaure
 * acesso de uma conta de responsável financeiro, mesmo por rotas administrativas
 * já existentes (updateUser, toggleUserActive, setUserPermissions,
 * removeUserUnitLink, linkExistingUserToUnitGroup).
 *
 * Não substitui as verificações de escopo por unidade já existentes em cada rota —
 * é uma verificação ADICIONAL, específica para identidade financeira.
 *
 * Para admin_master, esta função nunca bloqueia (no-op).
 */
export async function assertUnitAdminCanManageTargetUser(
  actor: AuthUser,
  targetUser: { id: number; role: string },
  opts?: { newRole?: string }
): Promise<void> {
  if (actor.role !== "unit_admin") return;

  if (targetUser.role === "responsavel_financeiro") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Gestão de contas de responsável financeiro é exclusiva do admin_master.",
    });
  }

  if (opts?.newRole === "responsavel_financeiro") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "unit_admin não pode conceder o papel de responsável financeiro.",
    });
  }

  if (await userHasFinancialResponsibleHistory(targetUser.id)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Este usuário possui vínculo financeiro ativo ou histórico; gestão exclusiva do admin_master.",
    });
  }
}
