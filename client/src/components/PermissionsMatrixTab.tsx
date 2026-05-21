import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Shield, Search, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Tipos e constantes ───────────────────────────────────────────────────────

type PermissionKey =
  | "view_studies"
  | "edit_reports"
  | "view_anamnesis"
  | "edit_anamnesis"
  | "edit_exam_legend"
  | "print_reports"
  | "manage_templates"
  | "view_financial";   // FIX: campo adicionado em v62 (migration 0046)

type GroupKey =
  | "medicos"
  | "operadores"
  | "visualizadores"
  | "responsaveisFinanceiros"
  | "administradoresUnidade"
  | "adminsMaster";

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  view_studies:     "Visualizar Estudos",
  edit_reports:     "Laudar / Editar Laudos",
  view_anamnesis:   "Visualizar Anamnese",
  edit_anamnesis:   "Preencher Anamnese",
  edit_exam_legend: "Editar Legenda de Exames",
  print_reports:    "Imprimir Laudos",
  manage_templates: "Gerenciar Modelos de Laudo",
  view_financial:   "Ver Financeiro",  // FIX
};

const GROUP_LABELS: Record<GroupKey, string> = {
  medicos:                 "Médicos",
  operadores:              "Operadores",
  visualizadores:          "Visualizadores",
  responsaveisFinanceiros: "Resp. Financeiro",
  administradoresUnidade:  "Admin Unidade",
  adminsMaster:            "Admin Master",
};

// Fallback — usado enquanto o banco não responde ou antes do carregamento
const DEFAULT_GROUP_PERMISSIONS: Record<GroupKey, Record<PermissionKey, boolean>> = {
  medicos: {
    view_studies: true, edit_reports: true, view_anamnesis: true,
    edit_anamnesis: true, edit_exam_legend: true, print_reports: true,
    manage_templates: true,
    view_financial: false,
  },
  operadores: {
    view_studies: true, edit_reports: false, view_anamnesis: true,
    edit_anamnesis: true, edit_exam_legend: true, print_reports: false,
    manage_templates: false,
    view_financial: false,
  },
  visualizadores: {
    view_studies: true, edit_reports: false, view_anamnesis: false,
    edit_anamnesis: false, edit_exam_legend: false, print_reports: true,
    manage_templates: false,
    view_financial: false,
  },
  responsaveisFinanceiros: {
    view_studies: false, edit_reports: false, view_anamnesis: false,
    edit_anamnesis: false, edit_exam_legend: false, print_reports: false,
    manage_templates: false,
    view_financial: true,
  },
  administradoresUnidade: {
    view_studies: true, edit_reports: false, view_anamnesis: false,
    edit_anamnesis: false, edit_exam_legend: false, print_reports: true,
    manage_templates: false,
    view_financial: false,
  },
  adminsMaster: {
    view_studies: true, edit_reports: true, view_anamnesis: true,
    edit_anamnesis: true, edit_exam_legend: true, print_reports: true,
    manage_templates: true,
    view_financial: true,
  },
};

const PERMISSIONS = Object.keys(PERMISSION_LABELS) as PermissionKey[];
const GROUPS = Object.keys(GROUP_LABELS) as GroupKey[];

// ─── Componente Toggle ────────────────────────────────────────────────────────

function Toggle({
  checked, onChange, disabled = false,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
        ${checked ? "bg-blue-500" : "bg-gray-300"}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
          ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PermissionsMatrixTab() {
  const [permissions, setPermissions] = useState(DEFAULT_GROUP_PERMISSIONS);
  const [search, setSearch] = useState("");
  const [dirtyGroups, setDirtyGroups] = useState<Set<GroupKey>>(new Set());

  // Carregar valores do banco
  const { data: dbPerms, isLoading } = trpc.admin.getGroupPermissions.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Sincronizar estado local com banco ao carregar
  useEffect(() => {
    if (!dbPerms || dbPerms.length === 0) return;
    const merged = { ...DEFAULT_GROUP_PERMISSIONS };
    for (const row of dbPerms) {
      const key = row.group_key as GroupKey;
      if (key in merged) {
        merged[key] = {
          view_studies:     row.view_studies,
          edit_reports:     row.edit_reports,
          view_anamnesis:   row.view_anamnesis,
          edit_anamnesis:   row.edit_anamnesis,
          edit_exam_legend: row.edit_exam_legend,
          print_reports:    row.print_reports,
          manage_templates: row.manage_templates,
          view_financial:   (row as any).view_financial ?? false,  // FIX migration 0046
        };
      }
    }
    setPermissions(merged);
    setDirtyGroups(new Set());
  }, [dbPerms]);

  const saveGroupPermissions = trpc.admin.setGroupPermissions.useMutation({
    onSuccess: () => {
      setDirtyGroups(new Set());
      toast.success("Permissões de grupo atualizadas com sucesso.");
    },
    onError: (err) => toast.error("Erro ao salvar: " + err.message),
  });

  const filteredPermissions = useMemo(() =>
    PERMISSIONS.filter(p =>
      PERMISSION_LABELS[p].toLowerCase().includes(search.toLowerCase())
    ),
    [search]
  );

  const handleToggle = (group: GroupKey, perm: PermissionKey, value: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [group]: { ...prev[group], [perm]: value },
    }));
    setDirtyGroups(prev => new Set(prev).add(group));
  };

  const handleSave = () => {
    // adminsMaster é imutável — excluir do payload
    const { adminsMaster: _ignored, ...editablePerms } = permissions;
    saveGroupPermissions.mutate({ permissions: editablePerms as Parameters<typeof saveGroupPermissions.mutate>[0]["permissions"] });
  };

  const hasDirty = dirtyGroups.size > 0;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-800">
            Permissões de Acesso por Grupo
          </h2>
          {hasDirty && (
            <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-full font-medium">
              Alterações pendentes
            </span>
          )}
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasDirty || saveGroupPermissions.isPending}
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm"
        >
          {saveGroupPermissions.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save className="h-4 w-4" />}
          {saveGroupPermissions.isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>

      {/* Busca */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filtrar permissões..."
          className="pl-9 h-9 text-sm border-gray-200"
        />
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando permissões...</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-72 sticky left-0 bg-gray-50">
                  Permissão
                </th>
                {GROUPS.map(g => (
                  <th
                    key={g}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-center w-36
                      ${dirtyGroups.has(g) ? "text-blue-600" : "text-gray-500"}`}
                  >
                    {GROUP_LABELS[g]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPermissions.map((perm, i) => (
                <tr
                  key={perm}
                  className={`border-b border-gray-100 last:border-0 transition-colors
                    ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/30`}
                >
                  <td className="px-5 py-3.5 text-sm text-gray-700 font-medium sticky left-0 bg-inherit">
                    {PERMISSION_LABELS[perm]}
                  </td>
                  {GROUPS.map(g => (
                    <td key={g} className="px-4 py-3.5 text-center">
                      <div className="flex justify-center">
                        <Toggle
                          checked={permissions[g][perm]}
                          onChange={v => handleToggle(g, perm, v)}
                          disabled={g === "adminsMaster"}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
              {filteredPermissions.length === 0 && (
                <tr>
                  <td
                    colSpan={GROUPS.length + 1}
                    className="px-5 py-8 text-center text-sm text-gray-400"
                  >
                    Nenhuma permissão encontrada para "{search}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        * Admin Master tem todas as permissões fixas e não pode ser alterado.
        As alterações afetam novos usuários criados neste grupo. Usuários
        existentes mantêm suas permissões individuais.
      </p>
    </div>
  );
}
