import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Building2, Users, ClipboardList, Plus, Edit2, Trash2, Server, HardDrive,
  Trash, RefreshCw, Power, PowerOff,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { toast } from "sonner";
import UnitFormDialog, { type UnitFormData } from "@/components/UnitFormDialog";
import UserFormDialog, { type UserFormData } from "@/components/UserFormDialog";

type Tab = "units" | "users" | "audit" | "cache";

const ROLE_LABELS: Record<string, string> = {
  admin_master: "Admin Master",
  unit_admin: "Admin Unidade",
  medico: "Médico",
  viewer: "Visualizador",
  operador: "Operador",
};

const ROLE_COLORS: Record<string, string> = {
  admin_master: "border-red-200 text-red-700 bg-red-50",
  unit_admin: "border-orange-200 text-orange-700 bg-orange-50",
  medico: "border-blue-200 text-blue-700 bg-blue-50",
  viewer: "border-gray-200 text-gray-600 bg-gray-50",
  operador: "border-purple-200 text-purple-700 bg-purple-50",
};

// ─── Painel de Cache DICOM ────────────────────────────────────────────────────
function CachePanel() {
  const [cacheInfo, setCacheInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchCacheInfo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dicom-cache-info");
      if (res.ok) setCacheInfo(await res.json());
    } catch { toast.error("Erro ao buscar info do cache"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCacheInfo(); }, [fetchCacheInfo]);

  const handleClearAll = async () => {
    if (!confirm("Tem certeza que deseja limpar todo o cache DICOM? Os estudos precisarão ser baixados novamente.")) return;
    setClearing(true);
    try {
      const res = await fetch("/api/dicom-cache-clear", { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Cache limpo: ${data.removed} estudo(s) removido(s)`);
        await fetchCacheInfo();
      } else {
        toast.error("Erro ao limpar cache");
      }
    } catch { toast.error("Erro ao limpar cache"); }
    finally { setClearing(false); }
  };

  const usedMB = cacheInfo?.totalSizeMB || 0;
  const studyCount = cacheInfo?.studyCount || 0;
  const limitMB = 2048;
  const pct = Math.min(100, Math.round((usedMB / limitMB) * 100));
  const barColor = pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-green-500";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Cache DICOM</h2>
          <p className="text-sm text-gray-500">Imagens temporárias armazenadas no servidor (expiram após 30 min de inatividade)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCacheInfo}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button
            onClick={handleClearAll}
            disabled={clearing || studyCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Trash className="h-3.5 w-3.5" />
            {clearing ? "Limpando..." : "Limpar Cache"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Espaço Usado</div>
          <div className="text-2xl font-bold text-gray-900">
            {usedMB < 1024 ? `${usedMB} MB` : `${(usedMB / 1024).toFixed(1)} GB`}
          </div>
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{pct}% de 2 GB</span>
              <span>{limitMB - usedMB > 0 ? `${(limitMB - usedMB) < 1024 ? `${limitMB - usedMB} MB livres` : `${((limitMB - usedMB) / 1024).toFixed(1)} GB livres`}` : "Limite atingido"}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Estudos em Cache</div>
          <div className="text-2xl font-bold text-gray-900">{studyCount}</div>
          <div className="text-xs text-gray-400 mt-1">estudos com imagens baixadas</div>
        </div>
        <div className="bg-white rounded border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Expiração</div>
          <div className="text-2xl font-bold text-gray-900">30 min</div>
          <div className="text-xs text-gray-400 mt-1">após inatividade por estudo</div>
        </div>
      </div>

      {studyCount > 0 && (
        <div className="bg-white rounded border border-gray-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 border-b border-gray-200">
                <TableHead className="py-3 text-xs font-semibold text-gray-600">Study UID</TableHead>
                <TableHead className="py-3 text-xs font-semibold text-gray-600">Imagens</TableHead>
                <TableHead className="py-3 text-xs font-semibold text-gray-600">Tamanho</TableHead>
                <TableHead className="py-3 text-xs font-semibold text-gray-600">Último Acesso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(cacheInfo?.studies || []).map((s: any) => (
                <TableRow key={s.uid} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <TableCell className="py-2.5">
                    <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{s.uid.slice(0, 40)}...</code>
                  </TableCell>
                  <TableCell className="py-2.5 text-sm text-gray-700">{s.fileCount}</TableCell>
                  <TableCell className="py-2.5 text-sm text-gray-700">{s.sizeMB} MB</TableCell>
                  <TableCell className="py-2.5 text-sm text-gray-500">
                    {s.lastAccess ? new Date(s.lastAccess).toLocaleString("pt-BR") : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {studyCount === 0 && !loading && (
        <div className="bg-white rounded border border-gray-200 flex flex-col items-center justify-center py-16 text-gray-400">
          <HardDrive className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Nenhum estudo em cache no momento</p>
          <p className="text-xs mt-1">Os estudos aparecem aqui após serem baixados pelo visualizador</p>
        </div>
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function AdminPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("units");

  // Diálogos de unidade
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitFormData | null>(null);

  // Diálogos de usuário
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserFormData | null>(null);

  const { data: currentUser } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => navigate("/login"),
  });

  // ── Units ──
  const { data: units = [], isLoading: unitsLoading, refetch: refetchUnits } = trpc.units.list.useQuery();

  const createUnit = trpc.units.create.useMutation({
    onSuccess: () => { toast.success("Unidade criada!"); setUnitDialogOpen(false); refetchUnits(); },
    onError: (e) => toast.error(e.message),
  });
  const updateUnit = trpc.units.update.useMutation({
    onSuccess: () => { toast.success("Unidade atualizada!"); setUnitDialogOpen(false); setEditingUnit(null); refetchUnits(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteUnit = trpc.units.delete.useMutation({
    onSuccess: () => { toast.success("Unidade excluída!"); refetchUnits(); },
    onError: (e) => toast.error(e.message),
  });

  // ── Users ──
  const { data: usersList = [], isLoading: usersLoading, refetch: refetchUsers } = trpc.admin.listUsers.useQuery();

  const createUser = trpc.auth.createLocalUser.useMutation({
    onSuccess: () => { toast.success("Usuário criado!"); setUserDialogOpen(false); refetchUsers(); },
    onError: (e) => toast.error(e.message),
  });
  const updateUserMutation = trpc.admin.updateUser.useMutation({
    onSuccess: () => { toast.success("Usuário atualizado!"); setUserDialogOpen(false); setEditingUser(null); refetchUsers(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { toast.success("Usuário excluído!"); refetchUsers(); },
    onError: (e) => toast.error(e.message),
  });
  const toggleUserActive = trpc.admin.toggleUserActive.useMutation({
    onSuccess: (_, vars) => { toast.success(vars.isActive ? "Usuário ativado" : "Usuário desativado"); refetchUsers(); },
    onError: (e) => toast.error(e.message),
  });

  // ── Audit ──
  const { data: auditLogs = [], isLoading: auditLoading } = trpc.admin.listAuditLog.useQuery(
    { limit: 200 },
    { enabled: activeTab === "audit" }
  );

  // ── Handlers ──
  const handleSaveUnit = (data: UnitFormData) => {
    if (data.id) {
      updateUnit.mutate({
        id: data.id,
        name: data.name,
        slug: data.slug,
        pacs_ip: data.pacs_ip,
        pacs_port: data.pacs_port,
        pacs_ae_title: data.pacs_ae_title,
        pacs_local_ae_title: data.pacs_local_ae_title,
        address: data.address,
        equipment_info: data.equipment_info,
        isActive: data.isActive,
      });
    } else {
      createUnit.mutate({
        name: data.name,
        slug: data.slug,
        pacs_ip: data.pacs_ip,
        pacs_port: data.pacs_port,
        pacs_ae_title: data.pacs_ae_title,
        pacs_local_ae_title: data.pacs_local_ae_title,
        address: data.address,
        equipment_info: data.equipment_info,
        isActive: data.isActive,
      });
    }
  };

  const setPermissions = trpc.admin.setUserPermissions.useMutation({
    onError: (e) => toast.error(`Erro ao salvar permissões: ${e.message}`),
  });

  const handleSaveUser = (data: UserFormData) => {
    if (data.id) {
      updateUserMutation.mutate({
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
        unit_id: data.unit_id ?? undefined,
        isActive: data.isActive,
        expiration_date: data.expiration_date || undefined,
        password: data.password || undefined,
      }, {
        onSuccess: () => {
          if (data.permissions && data.permissions.length >= 0) {
            setPermissions.mutate({ userId: data.id!, permissions: data.permissions });
          }
        },
      });
    } else {
      createUser.mutate({
        username: data.username,
        name: data.name,
        email: data.email || undefined,
        password: data.password!,
        role: data.role,
        unit_id: data.unit_id ?? undefined,
      }, {
        onSuccess: (result: any) => {
          const newUserId = result?.userId;
          if (newUserId && data.permissions && data.permissions.length > 0) {
            setPermissions.mutate({ userId: newUserId, permissions: data.permissions });
          }
        },
      });
    }
  };

  const handleOpenEditUnit = (unit: any) => {
    setEditingUnit({
      id: unit.id,
      name: unit.name,
      slug: unit.slug,
      address: (unit as any).address || "",
      equipment_info: (unit as any).equipment_info || "",
      pacs_ip: (unit as any).pacs_ip || "",
      pacs_port: (unit as any).pacs_port || 11112,
      pacs_ae_title: (unit as any).pacs_ae_title || "",
      pacs_local_ae_title: (unit as any).pacs_local_ae_title || "LAUDS",
      isActive: unit.isActive,
    });
    setUnitDialogOpen(true);
  };

  const handleOpenEditUser = (u: any) => {
    setEditingUser({
      id: u.id,
      name: u.name || "",
      email: u.email || "",
      username: u.username || "",
      role: u.role,
      unit_id: u.unit_id ?? null,
      isActive: u.isActive,
      expiration_date: u.expiration_date || "",
      permissions: [],
    });
    setUserDialogOpen(true);
  };

  const handleNewUnit = () => {
    setEditingUnit(null);
    setUnitDialogOpen(true);
  };

  const handleNewUser = () => {
    setEditingUser(null);
    setUserDialogOpen(true);
  };

  const isAdminMaster = currentUser?.role === "admin_master";
  const isUnitAdmin = currentUser?.role === "unit_admin";
  const canManageUsers = isAdminMaster || isUnitAdmin;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    ...(isAdminMaster ? [{ key: "units" as Tab, label: "Unidades", icon: <Building2 className="h-4 w-4" /> }] : []),
    ...(canManageUsers ? [{ key: "users" as Tab, label: "Usuários", icon: <Users className="h-4 w-4" /> }] : []),
    { key: "audit", label: "Auditoria", icon: <ClipboardList className="h-4 w-4" /> },
    { key: "cache", label: "Cache DICOM", icon: <HardDrive className="h-4 w-4" /> },
  ];

  const effectiveTab = (!isAdminMaster && activeTab === "units") ? "users" : activeTab;

  const unitMap = Object.fromEntries(units.map((u: any) => [u.id, u.name]));

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <AppHeader
        nav={
          <>
            <button
              onClick={() => navigate("/pacs-query")}
              className="px-4 py-1.5 rounded text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              Estudos
            </button>
            <button className="px-4 py-1.5 rounded text-sm font-semibold bg-amber-700 text-white">
              Administração
            </button>
          </>
        }
      />

      {/* Abas */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex items-center gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-5">

        {/* ── ABA UNIDADES ── */}
        {effectiveTab === "units" && isAdminMaster && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Unidades</h2>
                <p className="text-sm text-gray-500">Clínicas e hospitais cadastrados no sistema</p>
              </div>
              <button
                onClick={handleNewUnit}
                className="px-4 py-2 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Nova Unidade
              </button>
            </div>

            <div className="bg-white rounded border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 border-b border-gray-200">
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Nome</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Endereço</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">IP PACS</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Porta</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">AE Title</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Status</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unitsLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
                  ) : units.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">Nenhuma unidade cadastrada</TableCell></TableRow>
                  ) : units.map((unit: any) => (
                    <TableRow key={unit.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <TableCell className="py-3">
                        <div className="text-sm font-medium text-gray-900">{unit.name}</div>
                        {unit.equipment_info && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{unit.equipment_info}</div>
                        )}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-gray-500 max-w-[160px] truncate">
                        {unit.address || <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-gray-500">{unit.pacs_ip || "—"}</TableCell>
                      <TableCell className="py-3 text-xs text-gray-500">{unit.pacs_port || "—"}</TableCell>
                      <TableCell className="py-3">
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{unit.pacs_ae_title || "—"}</code>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className={`text-xs ${unit.isActive ? "border-green-200 text-green-700 bg-green-50" : "border-gray-200 text-gray-500"}`}>
                          {unit.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Toggle ativo/inativo direto */}
                          <button
                            title={unit.isActive ? "Desativar unidade" : "Ativar unidade"}
                            onClick={() => updateUnit.mutate({ id: unit.id, isActive: !unit.isActive })}
                            className={`p-1.5 rounded ${unit.isActive ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100"}`}
                          >
                            {unit.isActive ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => handleOpenEditUnit(unit)}
                            className="p-1.5 rounded text-gray-500 hover:bg-gray-100"
                            title="Editar"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Excluir "${unit.name}"?`)) deleteUnit.mutate({ id: unit.id }); }}
                            className="p-1.5 rounded text-red-500 hover:bg-red-50"
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ── ABA USUÁRIOS ── */}
        {effectiveTab === "users" && canManageUsers && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Usuários</h2>
                <p className="text-sm text-gray-500">Usuários cadastrados no sistema</p>
              </div>
              <button
                onClick={handleNewUser}
                className="px-4 py-2 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Novo Usuário
              </button>
            </div>

            <div className="bg-white rounded border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 border-b border-gray-200">
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Nome</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Usuário</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Unidade</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Perfil</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Status</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Expiração</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Último Acesso</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
                  ) : usersList.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-400 text-sm">Nenhum usuário encontrado</TableCell></TableRow>
                  ) : usersList.map((u: any) => {
                    const isExpired = u.expiration_date && new Date(u.expiration_date) < new Date();
                    return (
                      <TableRow key={u.id} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${isExpired ? "opacity-60" : ""}`}>
                        <TableCell className="py-3 text-sm font-medium text-gray-900">{u.name || "—"}</TableCell>
                        <TableCell className="py-3 text-sm text-gray-600 font-mono">{u.username || "—"}</TableCell>
                        <TableCell className="py-3 text-xs text-gray-500">
                          {u.unit_id ? (unitMap[u.unit_id] || `#${u.unit_id}`) : <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant="outline" className={`text-xs ${ROLE_COLORS[u.role] || ""}`}>
                            {ROLE_LABELS[u.role] || u.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant="outline" className={`text-xs ${u.isActive && !isExpired ? "border-green-200 text-green-700 bg-green-50" : "border-gray-200 text-gray-500"}`}>
                            {isExpired ? "Expirado" : u.isActive ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 text-xs text-gray-500">
                          {u.expiration_date
                            ? <span className={isExpired ? "text-red-500 font-medium" : ""}>{new Date(u.expiration_date).toLocaleDateString("pt-BR")}</span>
                            : <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className="py-3 text-xs text-gray-500">
                          {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Toggle ativo/inativo direto */}
                            {u.id !== currentUser?.id && (
                              <button
                                title={u.isActive ? "Desativar usuário" : "Ativar usuário"}
                                onClick={() => toggleUserActive.mutate({ id: u.id, isActive: !u.isActive })}
                                className={`p-1.5 rounded ${u.isActive ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100"}`}
                              >
                                {u.isActive ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEditUser(u)}
                              className="p-1.5 rounded text-gray-500 hover:bg-gray-100"
                              title="Editar"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            {u.id !== currentUser?.id && isAdminMaster && (
                              <button
                                onClick={() => { if (confirm(`Excluir usuário "${u.name || u.username}"?`)) deleteUser.mutate({ id: u.id }); }}
                                className="p-1.5 rounded text-red-500 hover:bg-red-50"
                                title="Excluir"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ── ABA AUDITORIA ── */}
        {effectiveTab === "audit" && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Auditoria</h2>
              <p className="text-sm text-gray-500">Registro de ações realizadas no sistema</p>
            </div>
            <div className="bg-white rounded border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 border-b border-gray-200">
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Data/Hora</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Usuário</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Ação</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Alvo</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
                  ) : auditLogs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400 text-sm">Nenhum registro de auditoria</TableCell></TableRow>
                  ) : auditLogs.map((log: any) => (
                    <TableRow key={log.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <TableCell className="py-2.5 text-xs text-gray-500">
                        {new Date(log.timestamp).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="py-2.5 text-sm text-gray-700">
                        {log.userName || log.userUsername || `#${log.user_id}`}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{log.action}</code>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-gray-500">
                        {log.target_type ? `${log.target_type} #${log.target_id}` : "—"}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-gray-400">{log.ip_address || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ── ABA CACHE ── */}
        {effectiveTab === "cache" && <CachePanel />}
      </div>

      {/* Diálogos */}
      <UnitFormDialog
        open={unitDialogOpen}
        onOpenChange={(open) => { setUnitDialogOpen(open); if (!open) setEditingUnit(null); }}
        unit={editingUnit}
        onSave={handleSaveUnit}
        loading={createUnit.isPending || updateUnit.isPending}
      />

      <UserFormDialog
        open={userDialogOpen}
        onOpenChange={(open) => { setUserDialogOpen(open); if (!open) setEditingUser(null); }}
        user={editingUser}
        units={units.map((u: any) => ({ id: u.id, name: u.name, isActive: u.isActive }))}
        onSave={handleSaveUser}
        loading={createUser.isPending || updateUserMutation.isPending}
        currentUserRole={currentUser?.role}
      />
    </div>
  );
}
