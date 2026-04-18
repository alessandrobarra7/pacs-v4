import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, RefreshCw, UserPlus, ChevronsUpDown } from "lucide-react";
import UnitUsersCard, { type UnitAccessNode } from "./UnitUsersCard";
import { type UnitUser } from "./UnitUserRow";

interface UnitUsersTreeProps {
  nodes: UnitAccessNode[];
  isLoading: boolean;
  currentUserId: number;
  currentUserRole: string;
  onRefresh: () => void;
  onEdit: (user: UnitUser) => void;
  onToggleActive: (userId: number, isActive: boolean) => void;
  onDelete: (userId: number) => void;
  onRemoveLink: (userId: number, unitId: number) => void;
  onNewUser: () => void;
  onNewUserForUnit: (unitId: number, unitName: string) => void;
}

export default function UnitUsersTree({
  nodes,
  isLoading,
  currentUserId,
  currentUserRole,
  onRefresh,
  onEdit,
  onToggleActive,
  onDelete,
  onRemoveLink,
  onNewUser,
  onNewUserForUnit,
}: UnitUsersTreeProps) {
  const [search, setSearch] = useState("");
  const [expandAll, setExpandAll] = useState<boolean | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return nodes;
    const q = search.toLowerCase();
    return nodes
      .map(node => {
        const unitMatch = node.unit.name.toLowerCase().includes(q);
        if (unitMatch) return node;

        // Filtrar usuários dentro dos grupos
        const filterUsers = (users: UnitUser[]) =>
          users.filter(
            u =>
              u.name.toLowerCase().includes(q) ||
              u.username.toLowerCase().includes(q) ||
              (u.email ?? "").toLowerCase().includes(q)
          );

        const filteredGroups = {
          responsaveisFinanceiros: filterUsers(node.groups.responsaveisFinanceiros),
          medicos: filterUsers(node.groups.medicos),
          operadores: filterUsers(node.groups.operadores),
          visualizadores: filterUsers(node.groups.visualizadores),
          administradoresUnidade: filterUsers(node.groups.administradoresUnidade),
          adminsMaster: filterUsers(node.groups.adminsMaster),
          outros: filterUsers(node.groups.outros),
        };

        const totalFiltered = Object.values(filteredGroups).reduce(
          (acc, arr) => acc + arr.length,
          0
        );
        if (totalFiltered === 0) return null;

        return {
          ...node,
          groups: filteredGroups,
          totals: {
            totalUsers: totalFiltered,
            responsibleCount: filteredGroups.responsaveisFinanceiros.length,
            doctorCount: filteredGroups.medicos.length,
            operatorCount: filteredGroups.operadores.length,
            viewerCount: filteredGroups.visualizadores.length,
            unitAdminCount: filteredGroups.administradoresUnidade.length,
          },
        };
      })
      .filter(Boolean) as UnitAccessNode[];
  }, [nodes, search]);

  const totalUsers = useMemo(
    () => nodes.reduce((acc, n) => acc + n.totals.totalUsers, 0),
    [nodes]
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por unidade, usuário ou e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} className="h-9 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpandAll(v => (v === true ? false : true))}
          className="h-9 gap-1.5"
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
          {expandAll === true ? "Recolher todos" : "Expandir todos"}
        </Button>
        <Button size="sm" onClick={onNewUser} className="h-9 gap-1.5">
          <UserPlus className="h-3.5 w-3.5" />
          Novo usuário
        </Button>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{nodes.length} unidade{nodes.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{totalUsers} usuário{totalUsers !== 1 ? "s" : ""} no total</span>
        {search && (
          <>
            <span>·</span>
            <span className="text-primary">
              {filtered.length} unidade{filtered.length !== 1 ? "s" : ""} encontrada{filtered.length !== 1 ? "s" : ""}
            </span>
          </>
        )}
      </div>

      {/* Tree */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Nenhum resultado encontrado para "{search}"</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((node, idx) => (
            <UnitUsersCard
              key={node.unit.id}
              node={node}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              defaultOpen={expandAll !== null ? expandAll : idx === 0}
              onEdit={onEdit}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
              onRemoveLink={onRemoveLink}
              onNewUserForUnit={onNewUserForUnit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
