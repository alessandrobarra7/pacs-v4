/**
 * RBAC - Role-Based Access Control
 * Sistema de 5 perfis conforme guia LAUDS
 */

export type UserRole = 'admin_master' | 'unit_admin' | 'medico' | 'viewer' | 'operador' | 'responsavel_financeiro';

export interface PermissionCheck {
  role: UserRole;
  unitId?: number;
  targetUnitId?: number;
}

/**
 * ERRO 2.3 FIX: Verifica se o usuário pode criar/editar/assinar laudos
 * Agora considera permissões granulares (edit_reports)
 * Nota: Esta função é apenas para lógica de role global.
 * Para decisões de UI, use trpc.units.myPermissions({ unitId }) no frontend.
 */
export function canReport(role: UserRole): boolean {
  // Apenas médicos e admin_master podem ter permissão de criar laudos
  return role === 'admin_master' || role === 'medico';
}

/**
 * Verifica se o usuário pode acessar área administrativa
 */
export function canAccessAdmin(role: UserRole): boolean {
  return role === 'admin_master' || role === 'unit_admin';
}

/**
 * Verifica se o usuário pode gerenciar unidades
 */
export function canManageUnits(role: UserRole): boolean {
  return role === 'admin_master';
}

/**
 * Verifica se o usuário pode gerenciar templates
 */
export function canManageTemplates(role: UserRole): boolean {
  return role === 'admin_master';
}

/**
 * Verifica se o usuário pode gerenciar usuários
 * unit_admin pode gerenciar apenas usuários da sua unidade
 */
export function canManageUsers(role: UserRole): boolean {
  return role === 'admin_master' || role === 'unit_admin';
}

/**
 * Verifica se o usuário pode ver auditoria
 * unit_admin vê apenas da sua unidade
 */
export function canViewAudit(role: UserRole): boolean {
  return role === 'admin_master' || role === 'unit_admin';
}

/**
 * Verifica se o usuário pode acessar PACS remoto
 */
export function canAccessPACS(role: UserRole): boolean {
  return role === 'admin_master';
}

/**
 * ERRO 2.3 FIX: Verifica se o usuário pode preencher anamnese
 * Agora considera permissões granulares (edit_anamnesis)
 * Nota: Esta função é apenas para lógica de role global.
 * Para decisões de UI, use trpc.units.myPermissions({ unitId }) no frontend.
 */
export function canFillAnamnesis(role: UserRole): boolean {
  // Operadores também podem preencher anamnese se tiverem permissão granular
  return role === 'admin_master' || role === 'medico' || role === 'operador';
}

/**
 * Verifica se o usuário pode gerenciar frases predefinidas
 */
export function canManagePresets(role: UserRole): boolean {
  return role === 'admin_master' || role === 'medico';
}

/**
 * Verifica se o usuário pode imprimir laudos assinados
 */
export function canPrintReports(role: UserRole): boolean {
  return true; // Todos os perfis podem imprimir laudos assinados
}

/**
 * Verifica se o usuário pode acessar módulo financeiro
 * LOG-06: unit_admin tem acesso financeiro da sua própria unidade
 * admin_master tem acesso financeiro de todas as unidades
 * responsavel_financeiro tem acesso financeiro das unidades vinculadas
 */
export function canAccessFinancial(role: UserRole): boolean {
  return role === 'admin_master' || role === 'unit_admin' || role === 'responsavel_financeiro' || role === 'medico';
}

/**
 * ERRO 2.3 FIX: Verifica se o usuário pode ver o viewer DICOM
 * Agora considera permissões granulares (view_studies)
 * Nota: Esta função é apenas para lógica de role global.
 * Para decisões de UI, use trpc.units.myPermissions({ unitId }) no frontend.
 */
export function canViewDICOM(role: UserRole): boolean {
  // Apenas roles que podem visualizar estudos
  return role !== 'responsavel_financeiro';
}

/**
 * Verifica se o usuário pode ver dados de outra unidade
 * Apenas admin_master pode ver dados de todas as unidades
 */
export function canAccessUnit(check: PermissionCheck): boolean {
  if (check.role === 'admin_master') {
    return true; // Admin master vê todas as unidades
  }
  
  // Outros perfis só veem sua própria unidade
  return check.unitId === check.targetUnitId;
}

/**
 * Matriz de permissões completa
 */
export const PERMISSIONS_MATRIX = {
  admin_master: {
    viewStudies: true,
    openViewer: true,
    createReport: true,
    signReport: true,
    printReport: true,
    fillAnamnesis: true,
    managePresets: true,
    manageUnits: true,
    manageUsers: true,
    manageTemplates: true,
    viewAudit: true,
    configurePACS: true,
    queryPACS: true,
    accessAllUnits: true,
  },
  unit_admin: {
    viewStudies: true,
    openViewer: true,
    createReport: false,
    signReport: false,
    printReport: true,
    fillAnamnesis: false,
    managePresets: false,
    manageUnits: false,
    manageUsers: true, // Apenas da sua unidade
    manageTemplates: false,
    viewAudit: true, // Apenas da sua unidade
    configurePACS: false,
    queryPACS: false,
    accessAllUnits: false,
    // LOG-06: unit_admin tem acesso financeiro da sua própria unidade
    viewFinancial: true,
    manageFinancial: false, // Apenas visualização; gestão de ciclos é exclusiva do admin_master
  },
  medico: {
    viewStudies: true,
    openViewer: true,
    createReport: true,
    signReport: true,
    printReport: true,
    fillAnamnesis: true,
    managePresets: true,
    manageUnits: false,
    manageUsers: false,
    manageTemplates: false,
    viewAudit: false,
    configurePACS: false,
    queryPACS: false,
    accessAllUnits: false,
  },
  viewer: {
    viewStudies: true,
    openViewer: true,
    createReport: false,
    signReport: false,
    printReport: true, // Apenas laudos assinados
    fillAnamnesis: false,
    managePresets: false,
    manageUnits: false,
    manageUsers: false,
    manageTemplates: false,
    viewAudit: false,
    configurePACS: false,
    queryPACS: false,
    accessAllUnits: false,
  },
  operador: {
    viewStudies: true,
    openViewer: true,
    createReport: false,
    signReport: false,
    printReport: true,
    fillAnamnesis: false,
    managePresets: false,
    manageUnits: false,
    manageUsers: false,
    manageTemplates: false,
    viewAudit: false,
    configurePACS: false,
    queryPACS: false,
    accessAllUnits: false,
  },
  responsavel_financeiro: {
    viewStudies: false,
    openViewer: false,
    createReport: false,
    signReport: false,
    printReport: false,
    fillAnamnesis: false,
    managePresets: false,
    manageUnits: false,
    manageUsers: false,
    manageTemplates: false,
    viewAudit: false,
    configurePACS: false,
    queryPACS: false,
    accessAllUnits: false,
  },
} as const;
