import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, UserPlus, Building2 } from "lucide-react";
import UnitUsersGroup from "./UnitUsersGroup";
import { type UnitUser } from "./UnitUserRow";

export interface UnitAccessNode {
  unit: {
    id: number;
    name: string;
    slug: string;
    isActive: boolean;
    address: string | null;
    logo_url: string | null;
  };
  totals: {
    totalUsers: number;
    responsibleCount: number;
    doctorCount: number;
    operatorCount: number;
    viewerCount: number;
    unitAdminCount: number;
  };
  groups: {
    responsaveisFinanceiros: UnitUser[];
    medicos: UnitUser[];
    operadores: UnitUser[];
    visualizadores: UnitUser[];
    administradoresUnidade: UnitUser[];
    adminsMaster: UnitUser[];
    outros: UnitUser[];
  };
}

interface UnitUsersCardProps {
  node: UnitAccessNode;
  currentUserId: number;
  currentUserRole: string;
  defaultOpen?: boolean;
  onEdit: (user: UnitUser) => void;
  onToggleActive: (userId: number, isActive: boolean) => void;
  onDelete: (userId: number) => void;
  onRemoveLink: (userId: number, unitId: number) => void;
  onNewUserForUnit: (unitId: number, unitName: string) => void;
}

export default function UnitUsersCard({
  node,
  currentUserId,
  currentUserRole,
  defaultOpen = false,
  onEdit,
  onToggleActive,
  onDelete,
  onRemoveLink,
  onNewUserForUnit,
}: UnitUsersCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { unit, totals, groups } = node;

  const summaryParts = [
    totals.responsibleCount > 0 && `${totals.responsibleCount} resp.`,
    totals.doctorCount > 0 && `${totals.doctorCount} médico${totals.doctorCount !== 1 ? "s" : ""}`,
    totals.operatorCount > 0 && `${totals.operatorCount} operador${totals.operatorCount !== 1 ? "es" : ""}`,
    totals.viewerCount > 0 && `${totals.viewerCount} visualizador${totals.viewerCount !== 1 ? "es" : ""}`,
    totals.unitAdminCount > 0 && `${totals.unitAdminCount} admin${totals.unitAdminCount !== 1 ? "s" : ""} unidade`,
  ].filter(Boolean).join(" · ");

  const warnings: string[] = [];
  if (totals.responsibleCount === 0) warnings.push("Sem responsável financeiro");
  if (totals.doctorCount === 0) warnings.push("Sem médicos vinculados");

  return (
    <Card className={`transition-all ${!unit.isActive ? "opacity-60" : ""}`}>
      <CardHeader className="pb-0 pt-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 flex-1 text-left min-w-0"
          >
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <Building2 className="h-4 w-4 text-primary shrink-0" />
            <span className="font-semibold text-sm truncate">{unit.name}</span>
            <Badge
              variant="outline"
              className={`text-xs shrink-0 ${unit.isActive ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-gray-200 text-gray-500 bg-gray-50"}`}
            >
              {unit.isActive ? "Ativo" : "Inativo"}
            </Badge>
            <span className="text-xs text-muted-foreground shrink-0">
              {totals.totalUsers} usuário{totals.totalUsers !== 1 ? "s" : ""}
            </span>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => onNewUserForUnit(unit.id, unit.name)}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Novo usuário
            </Button>
          </div>
        </div>

        {(summaryParts || warnings.length > 0) && (
          <div className="flex items-center gap-2 mt-1 pl-10 flex-wrap pb-2">
            {summaryParts && (
              <span className="text-xs text-muted-foreground">{summaryParts}</span>
            )}
            {warnings.map(w => (
              <span key={w} className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                {w}
              </span>
            ))}
          </div>
        )}
      </CardHeader>

      {open && (
        <CardContent className="pt-2 pb-3 px-4">
          <div className="border-t border-border/50 pt-3 space-y-0.5">
            <UnitUsersGroup
              label="Responsável Financeiro"
              users={groups.responsaveisFinanceiros}
              unitId={unit.id}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              emptyMessage="Esta unidade ainda não possui responsável financeiro"
              onEdit={onEdit}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
              onRemoveLink={onRemoveLink}
            />
            <UnitUsersGroup
              label="Médicos"
              users={groups.medicos}
              unitId={unit.id}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              emptyMessage="Nenhum médico vinculado"
              onEdit={onEdit}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
              onRemoveLink={onRemoveLink}
            />
            <UnitUsersGroup
              label="Operadores"
              users={groups.operadores}
              unitId={unit.id}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              emptyMessage="Nenhum operador vinculado"
              onEdit={onEdit}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
              onRemoveLink={onRemoveLink}
            />
            <UnitUsersGroup
              label="Visualizadores"
              users={groups.visualizadores}
              unitId={unit.id}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              emptyMessage="Nenhum visualizador vinculado"
              onEdit={onEdit}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
              onRemoveLink={onRemoveLink}
            />
            <UnitUsersGroup
              label="Administradores de Unidade"
              users={groups.administradoresUnidade}
              unitId={unit.id}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              emptyMessage="Nenhum administrador de unidade vinculado"
              onEdit={onEdit}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
              onRemoveLink={onRemoveLink}
            />
            {groups.adminsMaster.length > 0 && (
              <UnitUsersGroup
                label="Administradores Master"
                users={groups.adminsMaster}
                unitId={unit.id}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                onEdit={onEdit}
                onToggleActive={onToggleActive}
                onDelete={onDelete}
                onRemoveLink={onRemoveLink}
              />
            )}
            {groups.outros.length > 0 && (
              <UnitUsersGroup
                label="Outros"
                users={groups.outros}
                unitId={unit.id}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                onEdit={onEdit}
                onToggleActive={onToggleActive}
                onDelete={onDelete}
                onRemoveLink={onRemoveLink}
              />
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
