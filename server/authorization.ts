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

  // Fallback temporário para compatibilidade com usuários legados
  if (user.unit_id === unitId) {
    // Para fallback legado, apenas view_studies e view_anamnesis são permitidos por padrão
    // Operações destrutivas (edit_reports, edit_anamnesis, etc.) exigem permissão explícita
    const safePermissions: PermissionFlag[] = ["view_studies", "view_anamnesis", "print_reports"];
    return safePermissions.includes(permission);
  }

  return false;
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
  const safePermissions: PermissionFlag[] = ["view_studies", "view_anamnesis", "print_reports"];
  if (user.unit_id && safePermissions.includes(permission) && !fromGranular.includes(user.unit_id)) {
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
