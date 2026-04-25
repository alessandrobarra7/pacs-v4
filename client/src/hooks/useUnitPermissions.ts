/**
 * ERRO CRÍTICO 5 FIX: Centralized hook for consuming granular unit permissions
 * This hook fetches myPermissions from the backend and provides typed access to all permission flags
 * All UI components should use this hook instead of checking only the role
 */

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

export interface UnitPermissions {
  view_studies: boolean;
  edit_reports: boolean;
  view_anamnesis: boolean;
  edit_anamnesis: boolean;
  edit_exam_legend: boolean;
  print_reports: boolean;
  manage_templates: boolean;
}

export function useUnitPermissions(unitId: number | null | undefined) {
  const { user } = useAuth();
  
  // Query permissions from backend
  const { data: permissions, isLoading, error } = trpc.units.myPermissions.useQuery(
    { unitId: unitId || 0 },
    { enabled: !!unitId && !!user }
  );

  // Helper functions for common permission checks
  const canViewStudies = () => permissions?.view_studies ?? false;
  const canEditReports = () => permissions?.edit_reports ?? false;
  const canViewAnamnesis = () => permissions?.view_anamnesis ?? false;
  const canEditAnamnesis = () => permissions?.edit_anamnesis ?? false;
  const canEditExamLegend = () => permissions?.edit_exam_legend ?? false;
  const canPrintReports = () => permissions?.print_reports ?? false;
  const canManageTemplates = () => permissions?.manage_templates ?? false;

  return {
    permissions,
    isLoading,
    error,
    // Helper functions
    canViewStudies,
    canEditReports,
    canViewAnamnesis,
    canEditAnamnesis,
    canEditExamLegend,
    canPrintReports,
    canManageTemplates,
    // Raw permission check
    hasPermission: (permission: keyof UnitPermissions) => permissions?.[permission] ?? false,
  };
}
