import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Pencil, Trash2, Power, Unlink } from "lucide-react";

export const ROLE_LABELS: Record<string, string> = {
  admin_master: "Admin Master",
  unit_admin: "Admin Unidade",
  medico: "Médico",
  responsavel_financeiro: "Resp. Financeiro",
  viewer: "Visualizador",
  operador: "Operador",
};

export const ROLE_COLORS: Record<string, string> = {
  admin_master: "border-red-200 text-red-700 bg-red-50",
  unit_admin: "border-orange-200 text-orange-700 bg-orange-50",
  medico: "border-blue-200 text-blue-700 bg-blue-50",
  responsavel_financeiro: "border-emerald-200 text-emerald-700 bg-emerald-50",
  viewer: "border-gray-200 text-gray-600 bg-gray-50",
  operador: "border-purple-200 text-purple-700 bg-purple-50",
};

export interface UnitUser {
  id: number;
  name: string;
  username: string;
  email: string | null;
  role: string;
  unit_id: number | null;
  isActive: boolean;
  lastSignedIn: Date | null;
  expiration_date: number | null;
  createdAt: Date;
}

interface UnitUserRowProps {
  user: UnitUser;
  unitId: number;
  currentUserId: number;
  currentUserRole: string;
  onEdit: (user: UnitUser) => void;
  onToggleActive: (userId: number, isActive: boolean) => void;
  onDelete: (userId: number) => void;
  onRemoveLink: (userId: number, unitId: number) => void;
}

export default function UnitUserRow({
  user,
  unitId,
  currentUserId,
  currentUserRole,
  onEdit,
  onToggleActive,
  onDelete,
  onRemoveLink,
}: UnitUserRowProps) {
  const isExpired = user.expiration_date
    ? user.expiration_date < Date.now()
    : false;
  const isCurrentUser = user.id === currentUserId;
  const isAdminMaster = currentUserRole === "admin_master";

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors group">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">{user.name}</span>
            <span className="text-xs text-muted-foreground font-mono">{user.username}</span>
            <Badge
              variant="outline"
              className={`text-xs ${ROLE_COLORS[user.role] || "border-gray-200 text-gray-600 bg-gray-50"}`}
            >
              {ROLE_LABELS[user.role] || user.role}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {!user.isActive ? (
              <span className="text-xs text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded">Inativo</span>
            ) : isExpired ? (
              <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Expirado</span>
            ) : (
              <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Ativo</span>
            )}
            {user.expiration_date && isExpired && (
              <span className="text-xs text-red-500">
                {new Date(user.expiration_date).toLocaleDateString("pt-BR")}
              </span>
            )}
            {user.lastSignedIn && (
              <span className="text-xs text-muted-foreground">
                Último acesso: {new Date(user.lastSignedIn).toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(user)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Editar usuário</TooltipContent>
        </Tooltip>

        {!isCurrentUser && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onToggleActive(user.id, !user.isActive)}
              >
                <Power className={`h-3.5 w-3.5 ${user.isActive ? "text-emerald-600" : "text-gray-400"}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{user.isActive ? "Desativar" : "Ativar"}</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-orange-500 hover:text-orange-700 hover:bg-orange-50"
              onClick={() => onRemoveLink(user.id, unitId)}
              disabled={isCurrentUser}
            >
              <Unlink className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remover vínculo desta unidade</TooltipContent>
        </Tooltip>

        {isAdminMaster && !isCurrentUser && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(user.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Excluir usuário</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
