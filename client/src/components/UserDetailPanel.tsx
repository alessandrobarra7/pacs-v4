import { Power, Pencil, Trash2, Link2Off, User, Calendar, Clock, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ROLE_LABELS: Record<string, string> = {
  admin_master: "Admin Master",
  unit_admin: "Adm. de Unidade",
  medico: "Médico",
  responsavel_financeiro: "Resp. Financeiro",
  operador: "Operador",
  viewer: "Visualizador",
};

const ROLE_COLORS: Record<string, string> = {
  admin_master: "bg-red-100 text-red-700",
  unit_admin: "bg-orange-100 text-orange-700",
  medico: "bg-blue-100 text-blue-700",
  responsavel_financeiro: "bg-amber-100 text-amber-700",
  operador: "bg-gray-100 text-gray-700",
  viewer: "bg-purple-100 text-purple-700",
};

interface UserDetailPanelProps {
  user: any;
  unitId: number;
  unitName: string;
  onEdit?: (user: any) => void;
  onToggle?: (userId: number) => void;
  onDelete?: (userId: number) => void;
  onRemoveLink?: (userId: number, unitId: number) => void;
}

export function UserDetailPanel({ user, unitId, unitName, onEdit, onToggle, onDelete, onRemoveLink }: UserDetailPanelProps) {
  const isExpired = user.expiration_date && new Date(user.expiration_date) < new Date();
  const isActive = user.isActive && !isExpired;

  return (
    <div className="flex flex-col gap-5 p-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <span className="text-xl font-bold text-blue-700">
            {(user.name || user.username || "?")[0].toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">{user.name || user.username}</h2>
          <p className="text-sm text-gray-500 font-mono">{user.username}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge className={`text-xs ${ROLE_COLORS[user.role] ?? "bg-gray-100 text-gray-700"}`}>
              {ROLE_LABELS[user.role] ?? user.role}
            </Badge>
            <Badge variant={isExpired ? "destructive" : isActive ? "default" : "secondary"} className="text-xs">
              {isExpired ? "Expirado" : isActive ? "Ativo" : "Inativo"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Informações */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Informações</p>

        {user.email && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span>{user.email}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span>Unidade: <span className="font-medium">{unitName}</span></span>
        </div>

        {user.lastSignedIn && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span>Último acesso: {new Date(user.lastSignedIn).toLocaleString("pt-BR")}</span>
          </div>
        )}

        {user.createdAt && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span>Cadastrado em: {new Date(user.createdAt).toLocaleDateString("pt-BR")}</span>
          </div>
        )}

        {user.expiration_date && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className={`h-4 w-4 flex-shrink-0 ${isExpired ? "text-red-400" : "text-gray-400"}`} />
            <span className={isExpired ? "text-red-600 font-medium" : "text-gray-600"}>
              Expiração: {new Date(user.expiration_date).toLocaleDateString("pt-BR")}
              {isExpired && " (expirado)"}
            </span>
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="mt-auto pt-4 border-t border-gray-100 flex flex-wrap gap-2">
        {onEdit && (
          <Button size="sm" variant="outline" onClick={() => onEdit(user)} className="gap-1.5">
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
        )}
        {onToggle && (
          <Button size="sm" variant="outline" onClick={() => onToggle(user.id)} className="gap-1.5">
            <Power className="h-4 w-4" />
            {isActive ? "Desativar" : "Ativar"}
          </Button>
        )}
        {onRemoveLink && (
          <Button size="sm" variant="outline" onClick={() => onRemoveLink(user.id, unitId)} className="gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50">
            <Link2Off className="h-4 w-4" />
            Remover vínculo
          </Button>
        )}
        {onDelete && (
          <Button size="sm" variant="outline" onClick={() => onDelete(user.id)} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        )}
      </div>
    </div>
  );
}
