import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, UserPlus, Edit2, Trash2, Power, PowerOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface Permission {
  unit_id: number;
  view_studies: boolean;
  edit_reports: boolean;
  edit_anamnesis: boolean;
  view_financial: boolean;
  print_reports: boolean;
  manage_templates: boolean;
  view_anamnesis: boolean;
  edit_exam_legend: boolean;
}

interface UserRow {
  id: number;
  name: string | null;
  username: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  permissions: Permission[];
}

const PERM_COLS: { key: keyof Permission; label: string }[] = [
  { key: "edit_reports",   label: "Laudar" },
  { key: "edit_anamnesis", label: "Ed. Anamnese" },
  { key: "view_studies",   label: "Ver Exames" },
  { key: "view_financial", label: "Ver Financeiro" },
  { key: "print_reports",  label: "Imprimir" },
];

const ROLE_LABELS: Record<string, string> = {
  admin_master: "Admin Master",
  unit_admin: "Admin Unidade",
  medico: "Médico",
  responsavel_financeiro: "Resp. Financeiro",
  viewer: "Visualizador",
  operador: "Operador",
};

const ROLE_COLORS: Record<string, string> = {
  admin_master: "border-red-200 text-red-700 bg-red-50",
  unit_admin: "border-orange-200 text-orange-700 bg-orange-50",
  medico: "border-blue-200 text-blue-700 bg-blue-50",
  responsavel_financeiro: "border-emerald-200 text-emerald-700 bg-emerald-50",
  viewer: "border-gray-200 text-gray-600 bg-gray-50",
  operador: "border-purple-200 text-purple-700 bg-purple-50",
};

interface Props {
  onNewUser: (unitId?: number) => void;
  onEditUser: (user: any) => void;
  onDeleteUser: (userId: number) => void;
  onToggleActive: (userId: number, isActive: boolean) => void;
}

export function UsersPermissionsTab({ onNewUser, onEditUser, onDeleteUser, onToggleActive }: Props) {
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);

  const { data: units = [] } = trpc.units.list.useQuery();
  const { data: usersWithPerms = [], isLoading, refetch } = trpc.admin.listUsersWithPermissions.useQuery();

  const setPermsMutation = trpc.admin.setUserPermissions.useMutation({
    onSuccess: () => { toast.success("Permissão salva"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Filtra usuários pela unidade selecionada
  const filteredUsers = selectedUnitId
    ? (usersWithPerms as UserRow[]).filter(u =>
        u.permissions.some(p => p.unit_id === selectedUnitId)
      )
    : (usersWithPerms as UserRow[]);

  const getPermForUnit = (user: UserRow, unitId: number): Permission | undefined =>
    user.permissions.find(p => p.unit_id === unitId);

  const handleTogglePerm = useCallback((
    user: UserRow,
    unitId: number,
    permKey: keyof Permission,
    currentValue: boolean
  ) => {
    const existingPerm = getPermForUnit(user, unitId);
    const basePerm: Permission = existingPerm ?? {
      unit_id: unitId,
      view_studies: false,
      edit_reports: false,
      edit_anamnesis: false,
      view_financial: false,
      print_reports: false,
      manage_templates: false,
      view_anamnesis: false,
      edit_exam_legend: false,
    };

    const updatedPerm = { ...basePerm, [permKey]: !currentValue };
    const otherPerms = user.permissions.filter(p => p.unit_id !== unitId);

    setPermsMutation.mutate({
      userId: user.id,
      permissions: [...otherPerms, updatedPerm],
    });
  }, [setPermsMutation]);

  const activeUnitId = selectedUnitId ?? (units.length > 0 ? (units[0] as any).id : null);

  return (
    <div className="flex flex-col md:flex-row gap-0 min-h-[calc(100vh-220px)] md:h-[calc(100vh-160px)] bg-white rounded border border-gray-200 overflow-hidden">
      {/* ── Coluna lateral de unidades ── */}
      <div className="hidden md:block w-56 flex-shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto">
        <div className="p-3 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Unidades</p>
        </div>
        <div className="py-1">
          <button
            onClick={() => setSelectedUnitId(null)}
            className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
              selectedUnitId === null
                ? "bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Todas as unidades
          </button>
          {(units as any[]).map((unit) => (
            <button
              key={unit.id}
              onClick={() => setSelectedUnitId(unit.id)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                selectedUnitId === unit.id
                  ? "bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {unit.name}
            </button>
          ))}
        </div>
      </div>

      <div className="md:hidden border-b border-gray-200 bg-gray-50 p-3">
        <label htmlFor="mobile-unit-filter" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Unidade para permissões</label>
        <select
          id="mobile-unit-filter"
          value={selectedUnitId === null ? "all" : String(selectedUnitId)}
          onChange={(event) => setSelectedUnitId(event.target.value === "all" ? null : Number(event.target.value))}
          className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">Todas as unidades</option>
          {(units as any[]).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select>
      </div>

      {/* ── Área principal ── */}
      <div className="flex-1 min-w-0 overflow-auto">
        {/* Cabeçalho */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {selectedUnitId
                ? `Usuários — ${(units as any[]).find(u => u.id === selectedUnitId)?.name ?? ""}`
                : "Todos os usuários"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{filteredUsers.length} usuário(s)</p>
          </div>
          <Button
            size="sm"
            onClick={() => onNewUser(selectedUnitId ?? undefined)}
            className="flex items-center gap-1.5 text-xs"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Novo usuário
          </Button>
        </div>

        {/* Conteúdo responsivo */}
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-sm text-gray-400">Carregando...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-sm text-gray-400 gap-2">
            <UserPlus className="h-8 w-8 text-gray-300" />
            <p>Nenhum usuário nesta unidade</p>
            <Button variant="outline" size="sm" onClick={() => onNewUser(selectedUnitId ?? undefined)}>
              Adicionar usuário
            </Button>
          </div>
        ) : (
          <>
          <div className="hidden md:block">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-48">Usuário</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-28">Perfil</th>
                {PERM_COLS.map(col => (
                  <th key={col.key} className="text-center px-2 py-3 text-xs font-semibold text-gray-600 w-24">
                    {col.label}
                  </th>
                ))}
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 w-24">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user: UserRow) => {
                const displayUnitId = selectedUnitId ?? user.permissions[0]?.unit_id;
                const perm = displayUnitId ? getPermForUnit(user, displayUnitId) : undefined;

                return (
                  <tr key={user.id} className={`border-b border-gray-100 hover:bg-gray-50 ${!user.isActive ? "opacity-50" : ""}`}>
                    {/* Usuário */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 truncate max-w-[180px]">
                        {user.name || user.username || `#${user.id}`}
                      </div>
                      <div className="text-xs text-gray-400 truncate">{user.email || user.username}</div>
                    </td>

                    {/* Perfil */}
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-xs ${ROLE_COLORS[user.role] ?? ""}`}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </td>

                    {/* Permissões — uma coluna por permissão */}
                    {PERM_COLS.map(col => {
                      const val = perm ? !!(perm[col.key]) : false;
                      const isDisabled = !displayUnitId || user.role === "admin_master";
                      return (
                        <td key={col.key} className="px-2 py-3 text-center">
                          <div className="flex justify-center">
                            <Switch
                              checked={val}
                              disabled={isDisabled}
                              onCheckedChange={() => {
                                if (displayUnitId) {
                                  handleTogglePerm(user, displayUnitId, col.key, val);
                                }
                              }}
                              className="scale-90"
                            />
                          </div>
                        </td>
                      );
                    })}

                    {/* Ações */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEditUser(user)}
                          title="Editar"
                          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onToggleActive(user.id, !user.isActive)}
                          title={user.isActive ? "Desativar" : "Ativar"}
                          className={`p-1.5 rounded transition-colors ${
                            user.isActive
                              ? "text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                              : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                          }`}
                        >
                          {user.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Excluir usuário "${user.name || user.username}"?`)) {
                              onDeleteUser(user.id);
                            }
                          }}
                          title="Excluir"
                          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          <div className="md:hidden space-y-3 p-3">
            {filteredUsers.map((user: UserRow) => {
              const displayUnitId = activeUnitId ?? user.permissions[0]?.unit_id;
              const perm = displayUnitId ? getPermForUnit(user, displayUnitId) : undefined;
              return (
                <div key={user.id} className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${!user.isActive ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-gray-900">{user.name || user.username || `#${user.id}`}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">{user.email || user.username || "Sem e-mail"}</p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-[10px] ${ROLE_COLORS[user.role] ?? ""}`}>{ROLE_LABELS[user.role] ?? user.role}</Badge>
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                    <span className="text-gray-500">{displayUnitId ? (units as any[]).find((unit) => unit.id === displayUnitId)?.name || "Unidade" : "Sem unidade"}</span>
                    <span className={user.isActive ? "font-medium text-emerald-600" : "font-medium text-gray-500"}>{user.isActive ? "Ativo" : "Inativo"}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {PERM_COLS.map((col) => {
                      const value = perm ? !!perm[col.key] : false;
                      const disabled = !displayUnitId || user.role === "admin_master";
                      return (
                        <label key={col.key} className={`flex min-h-10 items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-[11px] ${value ? "border-blue-100 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-500"}`}>
                          <span className="leading-tight">{col.label}</span>
                          <Switch checked={value} disabled={disabled} onCheckedChange={() => displayUnitId && handleTogglePerm(user, displayUnitId, col.key, value)} className="scale-75" />
                        </label>
                      );
                    })}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
                    <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" onClick={() => onEditUser(user)}><Edit2 className="h-3.5 w-3.5" />Editar</Button>
                    <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" onClick={() => onToggleActive(user.id, !user.isActive)}>{user.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}{user.isActive ? "Desativar" : "Ativar"}</Button>
                    <Button variant="outline" size="sm" className="h-9 gap-1 text-xs text-red-600 hover:text-red-700" onClick={() => onDeleteUser(user.id)}><Trash2 className="h-3.5 w-3.5" />Excluir</Button>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
