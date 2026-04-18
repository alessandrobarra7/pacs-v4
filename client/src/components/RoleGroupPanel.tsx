import { UserPlus, Power, Pencil, Trash2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const GROUP_LABELS: Record<string, string> = {
  responsaveisFinanceiros: "Responsáveis Financeiros",
  medicos: "Médicos",
  operadores: "Operadores",
  visualizadores: "Visualizadores",
  administradoresUnidade: "Administradores de Unidade",
  adminsMaster: "Administradores Master",
  outros: "Outros",
};

interface RoleGroupPanelProps {
  groupKey: string;
  users: any[];
  unit: { id: number; name: string };
  onEditUser?: (user: any) => void;
  onToggleUser?: (userId: number) => void;
  onDeleteUser?: (userId: number) => void;
  onRemoveLink?: (userId: number, unitId: number) => void;
  onNewUser?: (unitId: number) => void;
}

export function RoleGroupPanel({
  groupKey,
  users,
  unit,
  onEditUser,
  onToggleUser,
  onDeleteUser,
  onRemoveLink,
  onNewUser,
}: RoleGroupPanelProps) {
  const label = GROUP_LABELS[groupKey] ?? groupKey;

  return (
    <div className="flex flex-col gap-4 p-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{label}</h2>
          <p className="text-sm text-gray-500">{unit.name}</p>
        </div>
        <Badge variant="secondary" className="text-sm px-2.5 py-1">
          {users.length} {users.length === 1 ? "usuário" : "usuários"}
        </Badge>
      </div>

      {/* Lista de usuários */}
      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
          <UserPlus className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Nenhum usuário neste grupo</p>
          <p className="text-xs mt-1">Clique em "Vincular usuário" para adicionar</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map(user => {
            const isExpired = user.expiration_date && new Date(user.expiration_date) < new Date();
            const isActive = user.isActive && !isExpired;
            return (
              <div
                key={user.id}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-blue-700">
                    {(user.name || user.username || "?")[0].toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user.name || user.username}</p>
                  <p className="text-xs text-gray-500 truncate">{user.username}{user.email ? ` · ${user.email}` : ""}</p>
                </div>

                {/* Status */}
                <Badge
                  variant={isExpired ? "destructive" : isActive ? "default" : "secondary"}
                  className="text-xs flex-shrink-0"
                >
                  {isExpired ? "Expirado" : isActive ? "Ativo" : "Inativo"}
                </Badge>

                {/* Último acesso */}
                {user.lastSignedIn && (
                  <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                    {new Date(user.lastSignedIn).toLocaleDateString("pt-BR")}
                  </span>
                )}

                {/* Ações */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {onToggleUser && (
                    <button
                      onClick={() => onToggleUser(user.id)}
                      className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title={isActive ? "Desativar" : "Ativar"}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onEditUser && (
                    <button
                      onClick={() => onEditUser(user)}
                      className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onRemoveLink && (
                    <button
                      onClick={() => onRemoveLink(user.id, unit.id)}
                      className="p-1.5 rounded text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                      title="Remover vínculo da unidade"
                    >
                      <Link2Off className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onDeleteUser && (
                    <button
                      onClick={() => onDeleteUser(user.id)}
                      className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Excluir usuário"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ação de adicionar */}
      <div className="mt-auto pt-4 border-t border-gray-100">
        {onNewUser && (
          <Button size="sm" onClick={() => onNewUser(unit.id)} className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            Vincular usuário a este grupo
          </Button>
        )}
      </div>
    </div>
  );
}
