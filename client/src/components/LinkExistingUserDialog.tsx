import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, UserCheck, Loader2, Link2 } from "lucide-react";

const GROUP_LABELS: Record<string, string> = {
  responsaveisFinanceiros: "Responsáveis Financeiros",
  medicos: "Médicos",
  operadores: "Operadores",
  visualizadores: "Visualizadores",
  administradoresUnidade: "Administradores de Unidade",
  adminsMaster: "Administradores Master",
};

const ROLE_LABELS: Record<string, string> = {
  admin_master: "Admin Master",
  unit_admin: "Admin Unidade",
  medico: "Médico",
  viewer: "Visualizador",
  operador: "Operador",
  responsavel_financeiro: "Resp. Financeiro",
};

interface LinkExistingUserDialogProps {
  open: boolean;
  onClose: () => void;
  unitId: number;
  unitName: string;
  groupKey: string;
  groupLabel?: string;
  onSuccess: () => void;
}

export function LinkExistingUserDialog({
  open,
  onClose,
  unitId,
  unitName,
  groupKey,
  groupLabel,
  onSuccess,
}: LinkExistingUserDialogProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
      setSelectedUser(null);
    }
  }, [open]);

  const { data: users = [], isFetching } = trpc.admin.searchAssignableUsers.useQuery(
    { query: debouncedQuery, excludeUnitId: unitId },
    { enabled: open }
  );

  const linkMutation = trpc.admin.linkExistingUserToUnitGroup.useMutation({
    onSuccess: (result) => {
      toast({
        title: "Usuário vinculado",
        description: result.wasExisting
          ? `Permissões de ${selectedUser?.name ?? "usuário"} atualizadas para o grupo ${groupLabel ?? GROUP_LABELS[groupKey] ?? groupKey}.`
          : `${selectedUser?.name ?? "Usuário"} vinculado ao grupo ${groupLabel ?? GROUP_LABELS[groupKey] ?? groupKey} com sucesso.`,
      });
      onSuccess();
      onClose();
    },
    onError: (e: { message: string }) => {
      toast({ title: "Erro ao vincular", description: e.message, variant: "destructive" });
    },
  });

  const handleLink = () => {
    if (!selectedUser) return;
    linkMutation.mutate({
      userId: selectedUser.id,
      unitId,
      groupKey: groupKey as any,
    });
  };

  const label = groupLabel ?? GROUP_LABELS[groupKey] ?? groupKey;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-600" />
            Vincular usuário existente
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            Grupo: <span className="font-medium text-gray-700">{label}</span>
            {" · "}
            Unidade: <span className="font-medium text-gray-700">{unitName}</span>
          </p>
        </DialogHeader>

        {/* Campo de busca */}
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome, username ou e-mail..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
          )}
        </div>

        {/* Lista de resultados */}
        <div className="mt-2 max-h-64 overflow-y-auto flex flex-col gap-1.5">
          {users.length === 0 && !isFetching && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-sm">
              <UserCheck className="h-8 w-8 mb-2 opacity-30" />
              {debouncedQuery.length > 0
                ? "Nenhum usuário encontrado para este termo"
                : "Digite para buscar usuários disponíveis"}
            </div>
          )}
          {users.map((user: any) => {
            const isSelected = selectedUser?.id === user.id;
            return (
              <button
                key={user.id}
                onClick={() => setSelectedUser(isSelected ? null : user)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  isSelected
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold ${
                    isSelected ? "bg-blue-200 text-blue-800" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {(user.name || user.username || "?")[0].toUpperCase()}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user.name || user.username}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {user.username}
                    {user.email ? ` · ${user.email}` : ""}
                  </p>
                  {user.linkedUnits && user.linkedUnits.length > 0 && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      Unidades: {user.linkedUnits.map((u: any) => u.name).join(", ")}
                    </p>
                  )}
                </div>
                {/* Role badge */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <Badge variant="outline" className="text-xs">
                    {ROLE_LABELS[user.role] ?? user.role}
                  </Badge>
                  <Badge
                    variant={user.isActive ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {user.isActive ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </button>
            );
          })}
        </div>

        {/* Confirmação de seleção */}
        {selectedUser && (
          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <span className="font-medium">{selectedUser.name || selectedUser.username}</span>
            {" será vinculado ao grupo "}
            <span className="font-medium">{label}</span>
            {" da unidade "}
            <span className="font-medium">{unitName}</span>
            {"."}
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={linkMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleLink}
            disabled={!selectedUser || linkMutation.isPending}
            className="gap-1.5"
          >
            {linkMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
