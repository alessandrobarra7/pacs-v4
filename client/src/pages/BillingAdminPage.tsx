/**
 * BillingAdminPage V3 — Governança Financeira (admin_master)
 * - Configurar dia de fechamento de ciclo por unidade
 * - Visão consolidada de todas as unidades
 * - Criar/gerenciar responsáveis financeiros
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Settings, Building2, DollarSign, Users, Calendar, TrendingUp, TrendingDown, Plus } from "lucide-react";
import { toast } from "sonner";

function fmtBRL(val: string | number | null | undefined) {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

// ─── Modal: Configurar Ciclo ──────────────────────────────────────────────────
function CycleConfigModal({ unit, onClose, onSaved }: {
  unit: { id: number; name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: config } = trpc.billing.getCycleConfig.useQuery({ unit_id: unit.id });
  const [doctorDay, setDoctorDay] = useState<string>("");
  const [systemDay, setSystemDay] = useState<string>("");

  if (config && doctorDay === "" && systemDay === "") {
    setDoctorDay(String(config.doctor_cycle_day ?? "20"));
    setSystemDay(String(config.system_cycle_day ?? "20"));
  }

  const setCycleConfig = trpc.billing.setCycleConfig.useMutation({
    onSuccess: () => { toast.success("Configuração salva!"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message || "Erro ao salvar"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar Ciclo — {unit.name}</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Dia de fechamento — Médicos</Label>
              <Input type="number" min={1} max={28} value={doctorDay} onChange={e => setDoctorDay(e.target.value)} placeholder="Ex: 20" />
              <p className="text-xs text-muted-foreground">Todo dia {doctorDay || "?"} os médicos recebem.</p>
            </div>
            <div className="space-y-2">
              <Label>Dia de fechamento — Sistema</Label>
              <Input type="number" min={1} max={28} value={systemDay} onChange={e => setSystemDay(e.target.value)} placeholder="Ex: 5" />
              <p className="text-xs text-muted-foreground">Todo dia {systemDay || "?"} a unidade paga o sistema.</p>
            </div>
          </div>
          <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p>• O ciclo do médico vai do dia {doctorDay || "?"} ao dia {doctorDay || "?"} do mês seguinte.</p>
            <p>• O ciclo do sistema vai do dia {systemDay || "?"} ao dia {systemDay || "?"} do mês seguinte.</p>
            <p>• Cada unidade pode ter dias diferentes.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => {
              const dd = parseInt(doctorDay), sd = parseInt(systemDay);
              if (isNaN(dd) || dd < 1 || dd > 28) { toast.error("Dia do médico deve ser entre 1 e 28"); return; }
              if (isNaN(sd) || sd < 1 || sd > 28) { toast.error("Dia do sistema deve ser entre 1 e 28"); return; }
              setCycleConfig.mutate({ unit_id: unit.id, doctor_cycle_day: dd, system_cycle_day: sd });
            }}
            disabled={setCycleConfig.isPending}
          >
            {setCycleConfig.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Criar Responsável ─────────────────────────────────────────────────
function CreateResponsibleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    legal_name: "", trade_name: "", cpf_cnpj: "", email: "", phone: "",
    person_type: "PJ" as "PF" | "PJ",
  });
  const createResp = trpc.billing.createResponsible.useMutation({
    onSuccess: () => { toast.success("Responsável criado!"); onCreated(); onClose(); },
    onError: (e) => toast.error(e.message || "Erro ao criar"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo Responsável Financeiro</DialogTitle></DialogHeader>
        <div className="py-4 space-y-3">
          <div className="flex gap-2">
            {(["PF", "PJ"] as const).map(t => (
              <Button key={t} size="sm" variant={form.person_type === t ? "default" : "outline"} onClick={() => setForm(f => ({ ...f, person_type: t }))}>{t}</Button>
            ))}
          </div>
          <div className="space-y-1">
            <Label>Razão Social / Nome *</Label>
            <Input value={form.legal_name} onChange={e => setForm(f => ({ ...f, legal_name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Nome Fantasia</Label>
            <Input value={form.trade_name} onChange={e => setForm(f => ({ ...f, trade_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>CPF/CNPJ</Label>
              <Input value={form.cpf_cnpj} onChange={e => setForm(f => ({ ...f, cpf_cnpj: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => { if (!form.legal_name.trim()) { toast.error("Razão social obrigatória"); return; } createResp.mutate(form); }}
            disabled={createResp.isPending}
          >
            {createResp.isPending ? "Criando..." : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-componente: Linha de unidade com ciclo ───────────────────────────────
function UnitCycleRow({ unit, onConfigure }: { unit: { id: number; name: string }; onConfigure: () => void }) {
  const { data: config } = trpc.billing.getCycleConfig.useQuery({ unit_id: unit.id });
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-3">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="font-medium text-sm">{unit.name}</p>
          {config ? (
            <p className="text-xs text-muted-foreground">Médicos: dia {config.doctor_cycle_day} · Sistema: dia {config.system_cycle_day}</p>
          ) : (
            <p className="text-xs text-amber-600">Ciclo não configurado</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={config ? "text-emerald-600 border-emerald-300 text-xs" : "text-amber-600 border-amber-300 text-xs"}>
          {config ? "Configurado" : "Pendente"}
        </Badge>
        <Button size="sm" variant="outline" onClick={onConfigure}>
          <Settings className="h-3 w-3 mr-1" />{config ? "Editar" : "Configurar"}
        </Button>
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function BillingAdminPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [tab, setTab] = useState("units");
  const [configUnit, setConfigUnit] = useState<{ id: number; name: string } | null>(null);
  const [showCreateResp, setShowCreateResp] = useState(false);

  const { data: units, isLoading: loadingUnits, refetch: refetchUnits } = trpc.units.list.useQuery(
    undefined, { enabled: !!user && user.role === "admin_master" }
  );
  const { data: responsibles, isLoading: loadingResp, refetch: refetchResp } = trpc.billing.listResponsibles.useQuery(
    undefined, { enabled: !!user && user.role === "admin_master" }
  );
  const { data: adminSummary, isLoading: loadingAdmin } = trpc.billing.getAdminSummary.useQuery(
    { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
    { enabled: !!user && user.role === "admin_master" }
  );

  if (!user || user.role !== "admin_master") {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-muted-foreground">Acesso restrito ao administrador master.</p>
      </div>
    );
  }

  type AdminRow = {
    id: number;
    legal_name: string;
    trade_name?: string | null;
    system_total: number;
    doctor_total: number;
    reports_count: number;
    pending_count: number;
  };

  const adminRows = (adminSummary?.responsibles ?? []) as AdminRow[];
  const totalSystem = adminRows.reduce((s, r) => s + (r.system_total ?? 0), 0);
  const totalDoctor = adminRows.reduce((s, r) => s + (r.doctor_total ?? 0), 0);
  const totalReports = adminRows.reduce((s, r) => s + (r.reports_count ?? 0), 0);

  const unitList = (units ?? []) as Array<{ id: number; name: string }>;
  const respList = ((responsibles ?? []) as unknown) as Array<{
    id: number; legal_name: string; trade_name?: string | null;
    person_type: string; cpf_cnpj?: string | null; email?: string | null; isActive: boolean;
  }>;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-lg font-semibold">Governança Financeira</h1>
            <p className="text-xs text-muted-foreground">Configuração de ciclos, responsáveis e visão consolidada</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><DollarSign className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Sistema (mês)</p>
                <p className="text-xl font-bold text-blue-600">{loadingAdmin ? "..." : fmtBRL(totalSystem)}</p>
              </div>
            </div>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Médicos (mês)</p>
                <p className="text-xl font-bold text-emerald-600">{loadingAdmin ? "..." : fmtBRL(totalDoctor)}</p>
              </div>
            </div>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30"><TrendingDown className="h-5 w-5 text-purple-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Laudos (mês)</p>
                <p className="text-xl font-bold text-purple-600">{loadingAdmin ? "..." : totalReports}</p>
              </div>
            </div>
          </CardContent></Card>
        </div>

        {/* Abas */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="units"><Calendar className="h-4 w-4 mr-1" />Ciclos por Unidade</TabsTrigger>
            <TabsTrigger value="responsibles"><Users className="h-4 w-4 mr-1" />Responsáveis</TabsTrigger>
            <TabsTrigger value="overview"><Building2 className="h-4 w-4 mr-1" />Consolidado</TabsTrigger>
          </TabsList>

          {/* Ciclos por Unidade */}
          <TabsContent value="units" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" />Configuração de Dias de Fechamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Defina o dia de fechamento do ciclo financeiro para cada unidade. Cada unidade pode ter dias diferentes para médicos e para o sistema.
                </p>
                {loadingUnits ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Carregando unidades...</p>
                ) : unitList.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhuma unidade cadastrada.</p>
                ) : (
                  <div className="space-y-2">
                    {unitList.map(unit => (
                      <UnitCycleRow key={unit.id} unit={unit} onConfigure={() => setConfigUnit(unit)} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Responsáveis */}
          <TabsContent value="responsibles" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Responsáveis Financeiros</CardTitle>
                <Button size="sm" onClick={() => setShowCreateResp(true)}><Plus className="h-4 w-4 mr-1" />Novo Responsável</Button>
              </CardHeader>
              <CardContent>
                {loadingResp ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
                ) : respList.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum responsável financeiro cadastrado.</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowCreateResp(true)}>
                      <Plus className="h-4 w-4 mr-1" />Criar o primeiro
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Nome</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">CPF/CNPJ</TableHead>
                        <TableHead className="text-xs">E-mail</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {respList.map(resp => (
                        <TableRow key={resp.id}>
                          <TableCell className="text-sm font-medium">
                            {resp.trade_name || resp.legal_name}
                            {resp.trade_name && <p className="text-xs text-muted-foreground">{resp.legal_name}</p>}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{resp.person_type}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{resp.cpf_cnpj || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{resp.email || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={resp.isActive ? "text-emerald-600 border-emerald-300 text-xs" : "text-xs"}>
                              {resp.isActive ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Consolidado */}
          <TabsContent value="overview" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Consolidado do Mês Atual</CardTitle></CardHeader>
              <CardContent>
                {loadingAdmin ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
                ) : adminRows.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum dado financeiro no mês atual.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Responsável</TableHead>
                        <TableHead className="text-xs text-right">Laudos</TableHead>
                        <TableHead className="text-xs text-right">Sistema</TableHead>
                        <TableHead className="text-xs text-right">Médicos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adminRows.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm font-medium">
                            {row.trade_name || row.legal_name}
                            {row.trade_name && <p className="text-xs text-muted-foreground">{row.legal_name}</p>}
                          </TableCell>
                          <TableCell className="text-sm text-right">{row.reports_count}</TableCell>
                          <TableCell className="text-sm text-right font-medium text-blue-600">{fmtBRL(row.system_total)}</TableCell>
                          <TableCell className="text-sm text-right font-medium text-emerald-600">{fmtBRL(row.doctor_total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {configUnit && <CycleConfigModal unit={configUnit} onClose={() => setConfigUnit(null)} onSaved={() => refetchUnits()} />}
      {showCreateResp && <CreateResponsibleModal onClose={() => setShowCreateResp(false)} onCreated={() => refetchResp()} />}
    </div>
  );
}
