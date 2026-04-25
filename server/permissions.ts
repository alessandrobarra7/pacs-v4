/**
 * Módulo centralizado de autorização e permissões
 * Consolida toda a lógica de validação de acesso em um único lugar
 * Resolve inconsistências entre users.unit_id (legado) e user_unit_permissions (novo)
 */

import { TRPCError } from "@trpc/server";
import type { User } from "../drizzle/schema";
import { getUserUnitPermission, getUserUnitPermissions } from "./db";

export type PermissionFlag = 
  | 'view_studies'
  | 'edit_reports'
  | 'view_anamnesis'
  | 'edit_anamnesis'
  | 'edit_exam_legend'
  | 'print_reports'
  | 'manage_templates';

/**
 * Retorna todas as unidades às quais o usuário tem acesso
 * Considera admin_master (acesso a todas), user_unit_permissions e unit_id legado
 */
export async function getUserAllowedUnitIds(user: User): Promise<number[]> {
  if (user.role === 'admin_master') {
    // admin_master tem acesso a todas as unidades
    // Retorna array vazio para indicar "sem filtro"
    return [];
  }

  // Buscar permissões granulares
  const perms = await getUserUnitPermissions(user.id);
  const unitIds = perms.map(p => p.unit_id);

  // Fallback: adicionar unit_id legado se não estiver na lista
  if (user.unit_id && !unitIds.includes(user.unit_id)) {
    unitIds.push(user.unit_id);
  }

  return unitIds;
}

/**
 * Verifica se o usuário tem acesso básico a uma unidade
 * Não valida permissão específica, apenas se tem vínculo com a unidade
 */
export async function hasUnitAccess(user: User, unitId: number): Promise<boolean> {
  if (user.role === 'admin_master') {
    return true;
  }

  // Verificar permissões granulares
  const perm = await getUserUnitPermission(user.id, unitId);
  if (perm) {
    return true;
  }

  // Fallback: verificar unit_id legado
  if (user.unit_id === unitId) {
    return true;
  }

  return false;
}

/**
 * Verifica se o usuário tem uma permissão específica em uma unidade
 * Retorna boolean sem lançar erro
 */
export async function hasUnitPermission(
  user: User,
  unitId: number,
  permission: PermissionFlag
): Promise<boolean> {
  if (user.role === 'admin_master') {
    return true;
  }

  // Verificar permissões granulares
  const perm = await getUserUnitPermission(user.id, unitId);
  if (perm && perm[permission]) {
    return true;
  }

  // Fallback: se usuário tem unit_id legado igual, conceder acesso básico
  // (compatibilidade com usuários antigos)
  if (user.unit_id === unitId) {
    // Usuários legados com unit_id têm acesso padrão
    // Retornar true para permissões comuns, false para restritas
    switch (permission) {
      case 'view_studies':
      case 'view_anamnesis':
      case 'print_reports':
        return true;
      case 'edit_reports':
      case 'edit_anamnesis':
      case 'edit_exam_legend':
      case 'manage_templates':
        // Apenas médico pode editar
        return (user.role as string) === 'medico';
      default:
        return false;
    }
  }

  return false;
}

/**
 * Verifica permissão e lança FORBIDDEN se não tiver acesso
 * Use esta função na maioria das rotas
 */
export async function assertUnitPermission(
  user: User,
  unitId: number,
  permission: PermissionFlag,
  message?: string
): Promise<boolean> {
  const allowed = await hasUnitPermission(user, unitId, permission);
  if (!allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: message || `Você não tem permissão para ${permission} nesta unidade`,
    });
  }
  return true;
}

/**
 * Verifica acesso básico e lança FORBIDDEN se não tiver
 */
export async function assertUnitAccess(
  user: User,
  unitId: number,
  message?: string
): Promise<boolean> {
  const allowed = await hasUnitAccess(user, unitId);
  if (!allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: message || 'Você não tem acesso a esta unidade',
    });
  }
  return true;
}

/**
 * Para unit_admin: verifica se ele administra a unidade alvo
 * Retorna true se unit_admin tem acesso ou se é admin_master
 */
export async function isUnitAdminOf(
  actor: User,
  targetUnitId: number
): Promise<boolean> {
  if (actor.role === 'admin_master') {
    return true;
  }

  if (actor.role !== 'unit_admin') {
    return false;
  }

  // unit_admin só pode gerenciar unidades onde tem acesso
  return await hasUnitAccess(actor, targetUnitId);
}

/**
 * Para unit_admin: verifica se pode gerenciar um usuário alvo
 * Um unit_admin pode gerenciar outro usuário se ambos compartilham pelo menos uma unidade
 */
export async function canManageTargetUser(
  actor: User,
  targetUser: User
): Promise<boolean> {
  if ((actor.role as string) === 'admin_master') {
    // admin_master pode gerenciar qualquer um, exceto outro admin_master
    return (targetUser.role as string) !== 'admin_master';
  }

  if (actor.role !== 'unit_admin') {
    return false;
  }

  // unit_admin pode gerenciar usuários das suas unidades
  const actorUnits = await getUserAllowedUnitIds(actor);
  const targetUnits = await getUserAllowedUnitIds(targetUser);

  // Verificar interseção
  const intersection = actorUnits.filter(u => targetUnits.includes(u));
  return intersection.length > 0;
}

/**
 * Retorna permissões do usuário para uma unidade específica
 * Usado pelo frontend para renderizar UI baseado em permissões
 */
export async function getUserPermissionsForUnit(
  user: User,
  unitId: number
) {
  if ((user.role as string) === 'admin_master') {
    return {
      view_studies: true,
      edit_reports: true,
      view_anamnesis: true,
      edit_anamnesis: true,
      edit_exam_legend: true,
      print_reports: true,
      manage_templates: true,
    };
  }
  const perm = await getUserUnitPermission(user.id, unitId);
  if (perm) {
    return {
      view_studies: perm.view_studies,
      edit_reports: perm.edit_reports,
      view_anamnesis: perm.view_anamnesis,
      edit_anamnesis: perm.edit_anamnesis,
      edit_exam_legend: perm.edit_exam_legend,
      print_reports: perm.print_reports,
      manage_templates: perm.manage_templates,
    };
  }

  // Fallback legado
  if (user.unit_id === unitId) {
    const isEditor = user.role === 'medico' || user.role === 'admin_master';
    return {
      view_studies: true,
      edit_reports: isEditor,
      view_anamnesis: true,
      edit_anamnesis: isEditor,
      edit_exam_legend: isEditor,
      print_reports: true,
      manage_templates: isEditor,
    };
  }

  return {
    view_studies: false,
    edit_reports: false,
    view_anamnesis: false,
    edit_anamnesis: false,
    edit_exam_legend: false,
    print_reports: false,
    manage_templates: false,
  };
}
