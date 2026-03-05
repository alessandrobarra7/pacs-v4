import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  LogOut, Building2, Users, ClipboardList, Plus, Edit2, Trash2, Server, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

type Tab = "units" | "users" | "audit";

const ROLE_LABELS: Record<string, string> = {
  admin_master: "Admin Master",
  unit_admin: "Admin Unidade",
  medico: "Médico",
  viewer: "Visualizador",
};

const ROLE_COLORS: Record<string, string> = {
  admin_master: "border-red-200 text-red-700 bg-red-50",
  unit_admin: "border-orange-200 text-orange-700 bg-orange-50",
  medico: "border-blue-200 text-blue-700 bg-blue-50",
  viewer: "border-gray-200 text-gray-600 bg-gray-50",
};

export default function AdminPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("units");
  const [isCreateUnitOpen, setIsCreateUnitOpen] = useState(false);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any>(null);

  const { data: user } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => navigate("/login"),
  });

  // Units
  const { data: units = [], isLoading: unitsLoading, refetch: refetchUnits } = trpc.units.list.useQuery();
  const createUnit = trpc.units.create.useMutation({
    onSuccess: () => { toast.success("Unidade criada!"); setIsCreateUnitOpen(false); refetchUnits(); },
    onError: (e) => toast.error(e.message),
  });
  const updateUnit = trpc.units.update.useMutation({
    onSuccess: () => { toast.success("Unidade atualizada!"); setEditingUnit(null); refetchUnits(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteUnit = trpc.units.delete.useMutation({
    onSuccess: () => { toast.success("Unidade excluída!"); refetchUnits(); },
    onError: (e) => toast.error(e.message),
  });

  // Users
  const { data: usersList = [], isLoading: usersLoading, refetch: refetchUsers } = trpc.admin.listUsers.useQuery();
  const createUser = trpc.auth.createLocalUser.useMutation({
    onSuccess: () => { toast.success("Usuário criado!"); setIsCreateUserOpen(false); refetchUsers(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { toast.success("Usuário excluído!"); refetchUsers(); },
    onError: (e) => toast.error(e.message),
  });

  // Audit
  const { data: auditLogs = [], isLoading: auditLoading } = trpc.admin.listAuditLog.useQuery(
    { limit: 200 },
    { enabled: activeTab === "audit" }
  );

  const handleCreateUnit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createUnit.mutate({
      name: fd.get("name") as string,
      slug: fd.get("slug") as string,
      orthanc_base_url: fd.get("orthanc_base_url") as string || undefined,
      orthanc_public_url: fd.get("orthanc_public_url") as string || undefined,
      orthanc_basic_user: fd.get("orthanc_basic_user") as string || undefined,
      orthanc_basic_pass: fd.get("orthanc_basic_pass") as string || undefined,
    });
  };

  const handleUpdateUnit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingUnit) return;
    const fd = new FormData(e.currentTarget);
    updateUnit.mutate({
      id: editingUnit.id,
      name: fd.get("name") as string,
      slug: fd.get("slug") as string,
      orthanc_base_url: fd.get("orthanc_base_url") as string || undefined,
      orthanc_public_url: fd.get("orthanc_public_url") as string || undefined,
      isActive: fd.get("isActive") === "on",
    });
  };

  const handleCreateUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createUser.mutate({
      username: fd.get("username") as string,
      name: fd.get("name") as string,
      email: fd.get("email") as string || undefined,
      password: fd.get("password") as string,
      role: fd.get("role") as any,
      unit_id: fd.get("unit_id") ? Number(fd.get("unit_id")) : undefined,
    });
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "units", label: "Unidades", icon: <Building2 className="h-4 w-4" /> },
    { key: "users", label: "Usuários", icon: <Users className="h-4 w-4" /> },
    { key: "audit", label: "Auditoria", icon: <ClipboardList className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* ── HEADER ── */}
      <header className="bg-white border-b border-gray-200 px-6 h-14 flex items-center justify-between">
        <span className="text-xl font-bold text-gray-900 tracking-tight">LAUDS</span>
        <nav className="flex items-center gap-1">
          <button
            onClick={() => navigate("/pacs-query")}
            className="px-4 py-1.5 rounded text-sm font-medium text-gray-600 hover:bg-gray-100 flex items-center gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Estudos
          </button>
          <button className="px-4 py-1.5 rounded text-sm font-medium bg-blue-600 text-white">
            Administração
          </button>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700">{user?.name || "Usuário"}</span>
          <button
            onClick={() => logoutMutation.mutate()}
            className="p-1.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── ABAS ── */}
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

      {/* ── CONTEÚDO ── */}
      <div className="px-6 py-5">

        {/* ── ABA UNIDADES ── */}
        {activeTab === "units" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Unidades</h2>
                <p className="text-sm text-gray-500">Clínicas e hospitais cadastrados no sistema</p>
              </div>
              <button
                onClick={() => setIsCreateUnitOpen(true)}
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
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Slug</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Orthanc Interno</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">URL Pública</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Status</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unitsLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
                  ) : units.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400 text-sm">Nenhuma unidade cadastrada</TableCell></TableRow>
                  ) : units.map((unit) => (
                    <TableRow key={unit.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <TableCell className="py-3 text-sm font-medium text-gray-900">{unit.name}</TableCell>
                      <TableCell className="py-3"><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{unit.slug}</code></TableCell>
                      <TableCell className="py-3 text-xs text-gray-500">{(unit as any).orthanc_base_url || "-"}</TableCell>
                      <TableCell className="py-3 text-xs text-gray-500">{(unit as any).orthanc_public_url || "-"}</TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className={`text-xs ${unit.isActive ? "border-green-200 text-green-700 bg-green-50" : "border-gray-200 text-gray-500"}`}>
                          {unit.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditingUnit(unit)}
                            className="p-1.5 rounded text-gray-500 hover:bg-gray-100"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Excluir "${unit.name}"?`)) deleteUnit.mutate({ id: unit.id }); }}
                            className="p-1.5 rounded text-red-500 hover:bg-red-50"
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
        {activeTab === "users" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Usuários</h2>
                <p className="text-sm text-gray-500">Usuários cadastrados no sistema</p>
              </div>
              <button
                onClick={() => setIsCreateUserOpen(true)}
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
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">E-mail</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Perfil</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Status</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Último Acesso</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
                  ) : usersList.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">Nenhum usuário encontrado</TableCell></TableRow>
                  ) : usersList.map((u: any) => (
                    <TableRow key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <TableCell className="py-3 text-sm font-medium text-gray-900">{u.name || "-"}</TableCell>
                      <TableCell className="py-3 text-sm text-gray-600">{u.username || "-"}</TableCell>
                      <TableCell className="py-3 text-sm text-gray-500">{u.email || "-"}</TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className={`text-xs ${ROLE_COLORS[u.role] || ""}`}>
                          {ROLE_LABELS[u.role] || u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className={`text-xs ${u.isActive ? "border-green-200 text-green-700 bg-green-50" : "border-gray-200 text-gray-500"}`}>
                          {u.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-gray-500">
                        {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleString('pt-BR') : "-"}
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        {u.id !== user?.id && (
                          <button
                            onClick={() => { if (confirm(`Excluir usuário "${u.name || u.username}"?`)) deleteUser.mutate({ id: u.id }); }}
                            className="p-1.5 rounded text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ── ABA AUDITORIA ── */}
        {activeTab === "audit" && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Auditoria</h2>
              <p className="text-sm text-gray-500">Log de atividades do portal</p>
            </div>

            <div className="bg-white rounded border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 border-b border-gray-200">
                    <TableHead className="py-3 text-xs font-semibold text-gray-600 w-[160px]">Data/Hora</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Usuário</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Ação</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Tipo</TableHead>
                    <TableHead className="py-3 text-xs font-semibold text-gray-600">Alvo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
                  ) : auditLogs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400 text-sm">Nenhum registro de auditoria</TableCell></TableRow>
                  ) : auditLogs.map((log: any) => (
                    <TableRow key={log.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <TableCell className="py-3 text-xs text-gray-500">
                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="py-3 text-sm text-gray-700">
                        {log.userName || log.userUsername || `ID ${log.user_id}` || "Sistema"}
                      </TableCell>
                      <TableCell className="py-3">
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{log.action}</code>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-gray-500">{log.target_type || "-"}</TableCell>
                      <TableCell className="py-3 text-xs text-gray-500">{log.target_id || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* ── DIALOG CRIAR UNIDADE ── */}
      <Dialog open={isCreateUnitOpen} onOpenChange={setIsCreateUnitOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Unidade</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUnit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cu-name" className="text-sm">Nome *</Label>
                <Input id="cu-name" name="name" placeholder="Ex: Studio Barra7" required className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-slug" className="text-sm">Slug *</Label>
                <Input id="cu-slug" name="slug" placeholder="studio-barra7" required pattern="[a-z0-9-]+" className="h-9" />
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1.5"><Server className="h-3.5 w-3.5" />Orthanc</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cu-base" className="text-sm">URL Interna</Label>
                  <Input id="cu-base" name="orthanc_base_url" placeholder="http://172.16.3.241:8042" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cu-pub" className="text-sm">URL Pública (Mikrotik NAT)</Label>
                  <Input id="cu-pub" name="orthanc_public_url" placeholder="http://45.189.160.17:8042" className="h-9" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateUnitOpen(false)}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={createUnit.isPending}>
                {createUnit.isPending ? "Criando..." : "Criar Unidade"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG EDITAR UNIDADE ── */}
      <Dialog open={!!editingUnit} onOpenChange={(o) => !o && setEditingUnit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Unidade</DialogTitle>
          </DialogHeader>
          {editingUnit && (
            <form onSubmit={handleUpdateUnit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Nome *</Label>
                  <Input name="name" defaultValue={editingUnit.name} required className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Slug *</Label>
                  <Input name="slug" defaultValue={editingUnit.slug} required className="h-9" />
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1.5"><Server className="h-3.5 w-3.5" />Orthanc</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">URL Interna</Label>
                    <Input name="orthanc_base_url" defaultValue={(editingUnit as any).orthanc_base_url || ""} placeholder="http://172.16.3.241:8042" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">URL Pública (Mikrotik NAT)</Label>
                    <Input name="orthanc_public_url" defaultValue={(editingUnit as any).orthanc_public_url || ""} placeholder="http://45.189.160.17:8042" className="h-9" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch name="isActive" defaultChecked={editingUnit.isActive} />
                <Label className="text-sm">Unidade ativa</Label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingUnit(null)}>Cancelar</Button>
                <Button type="submit" size="sm" disabled={updateUnit.isPending}>
                  {updateUnit.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── DIALOG CRIAR USUÁRIO ── */}
      <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Nome completo *</Label>
                <Input name="name" placeholder="Dr. João Silva" required className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Usuário *</Label>
                <Input name="username" placeholder="joaosilva" required className="h-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">E-mail</Label>
              <Input name="email" type="email" placeholder="joao@clinica.com" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Senha *</Label>
              <Input name="password" type="password" placeholder="Mínimo 6 caracteres" required minLength={6} className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Perfil *</Label>
                <select name="role" required className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="viewer">Visualizador</option>
                  <option value="medico">Médico</option>
                  <option value="unit_admin">Admin Unidade</option>
                  <option value="admin_master">Admin Master</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Unidade</Label>
                <select name="unit_id" className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Sem unidade</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateUserOpen(false)}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={createUser.isPending}>
                {createUser.isPending ? "Criando..." : "Criar Usuário"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
