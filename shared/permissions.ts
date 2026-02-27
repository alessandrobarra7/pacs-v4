/**
 * RBAC - Role-Based Access Control
 * Sistema de 4 perfis conforme guia LAUDS
 */

export type UserRole = 'admin_master' | 'unit_admin' | 'medico' | 'viewer';

export interface PermissionCheck {
  role: UserRole;
  unitId?: number;
  targetUnitId?: number;
}

/**
 * Verifica se o usuário pode criar/editar/assinar laudos
 */
export function canReport(role: UserRole): boolean {
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
 * Verifica se o usuário pode preencher anamnese
 */
export function canFillAnamnesis(role: UserRole): boolean {
  return role === 'admin_master' || role === 'medico';
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
 * Verifica se o usuário pode ver o viewer DICOM
 */
export function canViewDICOM(role: UserRole): boolean {
  return true; // Todos os perfis podem ver o viewer
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
} as const;
