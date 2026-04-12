/**
 * BillingAdminPage V5 — Retaguarda Financeira
 *
 * Visual reformulado: cards individuais por responsável com expansão,
 * melhor hierarquia visual, abas mais claras.
 *
 * Roles com acesso: admin_master
 * Roles SEM acesso: operador, viewer, medico, responsavel_financeiro, unit_admin
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Settings,
  Users,
  Building2,
  DollarSign,
  Link as LinkIcon,
  Calendar,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  UserCheck,
  Wallet,
} from "lucide-react";
import { DoctorPriceManager } from "@/components/DoctorPriceManager";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d + (d.includes("T") ? "" : "T00:00:00")) : d;
  return dt.toLocaleDateString("pt-BR");
}

// ─── Tipos locais ──────────────────────────────────────────────────────────────
type Responsible = {
  id: number;
  legal_name: string;
  trade_name: string | null;
  cpf_cnpj: string | null;
  email: string | null;
  phone: string | null;
  person_type: "PF" | "PJ";
  isActive: boolean;
};

type Unit = { id: number; name: string };

// ─── Formulário de criação de responsável ─────────────────────────────────────
function CreateResponsibleDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    person_type: "PJ" as "PF" | "PJ",
    legal_name: "",
    trade_name: "",
    cpf_cnpj: "",
    email: "",
    phone: "",
    notes: "",
  });

  const create = trpc.billing.createResponsible.useMutation({
    onSuccess: () => {
      toast.success("Responsável criado com sucesso!");
      onCreated();
      onClose();
      setForm({ person_type: "PJ", legal_name: "", trade_name: "", cpf_cnpj: "", email: "", phone: "", notes: "" });
    },
    onError: (e) => toast.error(e.message || "Erro ao criar responsável"),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Responsável Financeiro</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={form.person_type}
                onValueChange={(v) => setForm({ ...form, person_type: v as "PF" | "PJ" })}
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                  <SelectItem value="PF">Pessoa Física</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">CPF / CNPJ</Label>
              <Input
                className="h-9 mt-1"
                placeholder={form.person_type === "PJ" ? "00.000.000/0001-00" : "000.000.000-00"}
                value={form.cpf_cnpj}
                onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Razão Social / Nome</Label>
            <Input
              className="h-9 mt-1"
              placeholder="Nome completo ou razão social"
              value={form.legal_name}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Nome Fantasia</Label>
            <Input
              className="h-9 mt-1"
              placeholder="Opcional"
              value={form.trade_name}
              onChange={(e) => setForm({ ...form, trade_name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input
                className="h-9 mt-1"
                type="email"
                placeholder="email@exemplo.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input
                className="h-9 mt-1"
                placeholder="(00) 00000-0000"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!form.legal_name || create.isPending}
            onClick={() => create.mutate(form)}
          >
            {create.isPending ? "Criando..." : "Criar Responsável"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card individual de responsável ──────────────────────────────────────────
function ResponsibleCard({
  responsible,
  units,
  onRefresh,
}: {
  responsible: Responsible;
  units: Unit[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showLinkUnit, setShowLinkUnit] = useState(false);
  const [showSetPrice, setShowSetPrice] = useState(false);
  const [showSetCycle, setShowSetCycle] = useState(false);

  const [linkForm, setLinkForm] = useState({ unitId: "", startsAt: new Date().toISOString().slice(0, 10) });
  const [priceForm, setPriceForm] = useState({ unitId: "", pricePerReport: "", startsAt: new Date().toISOString().slice(0, 10) });
  const [cycleForm, setCycleForm] = useState({ unitId: "", doctor_cycle_day: "20", system_cycle_day: "5" });

  const { data: linkedUnits, refetch: refetchUnits } = trpc.billing.listUnitsForResponsible.useQuery(
    { financialResponsibleId: responsible.id },
    { enabled: expanded }
  );

  const linkUnit = trpc.billing.linkUnit.useMutation({
    onSuccess: () => {
      toast.success("Unidade vinculada!");
      setShowLinkUnit(false);
      refetchUnits();
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const setSystemPrice = trpc.billing.setSystemPrice.useMutation({
    onSuccess: () => {
      toast.success("Preço do sistema configurado!");
      setShowSetPrice(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const setCycleConfig = trpc.billing.setCycleConfig.useMutation({
    onSuccess: () => {
      toast.success("Ciclo configurado!");
      setShowSetCycle(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const initials = responsible.legal_name.slice(0, 2).toUpperCase();

  return (
    <Card className="overflow-hidden border border-border/60 hover:border-primary/30 transition-all hover:shadow-sm">
      <div className={`h-1 ${responsible.isActive ? "bg-green-500" : "bg-muted"}`} />
      <CardContent className="p-4">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">
                {responsible.trade_name || responsible.legal_name}
              </p>
              {responsible.trade_name && (
                <p className="text-xs text-muted-foreground truncate">{responsible.legal_name}</p>
              )}
              {(responsible.email || responsible.cpf_cnpj) && (
                <p className="text-xs text-muted-foreground truncate">
                  {responsible.cpf_cnpj && <span>{responsible.cpf_cnpj}</span>}
                  {responsible.cpf_cnpj && responsible.email && <span className="mx-1">·</span>}
                  {responsible.email && <span>{responsible.email}</span>}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-xs hidden sm:inline-flex">
              {responsible.person_type}
            </Badge>
            <Badge
              variant="outline"
              className={responsible.isActive
                ? "text-green-600 border-green-600 text-xs"
                : "text-muted-foreground text-xs"}
            >
              {responsible.isActive ? "Ativo" : "Inativo"}
            </Badge>
          </div>
        </div>

        {/* Ações rápidas */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setShowLinkUnit(true)}
          >
            <LinkIcon className="h-3 w-3 mr-1" />
            Vincular Unidade
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setShowSetPrice(true)}
          >
            <DollarSign className="h-3 w-3 mr-1" />
            Preço Sistema
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setShowSetCycle(true)}
          >
            <Calendar className="h-3 w-3 mr-1" />
            Configurar Ciclo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs ml-auto"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
            {expanded ? "Ocultar" : "Ver Unidades"}
          </Button>
        </div>

        {/* Unidades vinculadas (expansível) */}
        {expanded && (
          <div className="border-t pt-3">
            {!linkedUnits ? (
              <Skeleton className="h-12 w-full" />
            ) : linkedUnits.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                Nenhuma unidade vinculada ainda.
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground mb-2">Unidades Vinculadas</p>
                {(linkedUnits as Array<{
                  unit_id: number;
                  starts_at: Date | string;
                  ends_at: Date | string | null;
                }>).map((lu) => {
                  const unit = units.find((u) => u.id === lu.unit_id);
                  return (
                    <div
                      key={lu.unit_id}
                      className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{unit?.name ?? `Unidade #${lu.unit_id}`}</span>
                      </div>
                      <span className="text-muted-foreground">
                        desde {fmtDate(lu.starts_at)}
                        {lu.ends_at ? ` até ${fmtDate(lu.ends_at)}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Modal: Vincular Unidade */}
      <Dialog open={showLinkUnit} onOpenChange={setShowLinkUnit}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Vincular Unidade</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Unidade</Label>
              <Select value={linkForm.unitId} onValueChange={(v) => setLinkForm({ ...linkForm, unitId: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Vigência a partir de</Label>
              <Input type="date" className="h-9 mt-1" value={linkForm.startsAt}
                onChange={(e) => setLinkForm({ ...linkForm, startsAt: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkUnit(false)}>Cancelar</Button>
            <Button
              disabled={!linkForm.unitId || linkUnit.isPending}
              onClick={() => linkUnit.mutate({
                financialResponsibleId: responsible.id,
                unitId: parseInt(linkForm.unitId),
                startsAt: linkForm.startsAt,
              })}
            >
              {linkUnit.isPending ? "Vinculando..." : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Preço Sistema */}
      <Dialog open={showSetPrice} onOpenChange={setShowSetPrice}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Preço do Sistema por Laudo</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Unidade</Label>
              <Select value={priceForm.unitId} onValueChange={(v) => setPriceForm({ ...priceForm, unitId: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor por Laudo (R$)</Label>
              <Input className="h-9 mt-1" type="number" step="0.01" min="0" placeholder="Ex: 25.00"
                value={priceForm.pricePerReport}
                onChange={(e) => setPriceForm({ ...priceForm, pricePerReport: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Vigência a partir de</Label>
              <Input type="date" className="h-9 mt-1" value={priceForm.startsAt}
                onChange={(e) => setPriceForm({ ...priceForm, startsAt: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetPrice(false)}>Cancelar</Button>
            <Button
              disabled={!priceForm.unitId || !priceForm.pricePerReport || setSystemPrice.isPending}
              onClick={() => setSystemPrice.mutate({
                financialResponsibleId: responsible.id,
                unitId: parseInt(priceForm.unitId),
                pricePerReport: priceForm.pricePerReport,
                startsAt: priceForm.startsAt,
              })}
            >
              {setSystemPrice.isPending ? "Salvando..." : "Salvar Preço"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Configurar Ciclo */}
      <Dialog open={showSetCycle} onOpenChange={setShowSetCycle}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Configurar Ciclo Financeiro</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Unidade</Label>
              <Select value={cycleForm.unitId} onValueChange={(v) => setCycleForm({ ...cycleForm, unitId: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Fechamento Médico (dia)</Label>
                <Input className="h-9 mt-1" type="number" min="1" max="28"
                  value={cycleForm.doctor_cycle_day}
                  onChange={(e) => setCycleForm({ ...cycleForm, doctor_cycle_day: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">Dia do mês</p>
              </div>
              <div>
                <Label className="text-xs">Fechamento Sistema (dia)</Label>
                <Input className="h-9 mt-1" type="number" min="1" max="28"
                  value={cycleForm.system_cycle_day}
                  onChange={(e) => setCycleForm({ ...cycleForm, system_cycle_day: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">Dia do mês</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetCycle(false)}>Cancelar</Button>
            <Button
              disabled={!cycleForm.unitId || setCycleConfig.isPending}
              onClick={() => setCycleConfig.mutate({
                unit_id: parseInt(cycleForm.unitId),
                doctor_cycle_day: parseInt(cycleForm.doctor_cycle_day),
                system_cycle_day: parseInt(cycleForm.system_cycle_day),
              })}
            >
              {setCycleConfig.isPending ? "Salvando..." : "Salvar Ciclo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Painel de ciclos ─────────────────────────────────────────────────────────
function CyclesPanel({ units }: { units: Unit[] }) {
  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: cycles, isLoading } = trpc.billing.listUnitCycles.useQuery(
    { unit_id: selectedUnit!, cycle_type: undefined },
    { enabled: selectedUnit !== null }
  );

  const closeCycle = trpc.billing.closeCycle.useMutation({
    onSuccess: () => {
      toast.success("Ciclo fechado com sucesso!");
      utils.billing.listUnitCycles.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-sm whitespace-nowrap">Unidade:</Label>
        <Select
          value={selectedUnit ? String(selectedUnit) : ""}
          onValueChange={(v) => setSelectedUnit(parseInt(v))}
        >
          <SelectTrigger className="h-9 max-w-xs">
            <SelectValue placeholder="Selecione uma unidade..." />
          </SelectTrigger>
          <SelectContent>
            {units.map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedUnit === null ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">Selecione uma unidade para ver os ciclos.</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !cycles || cycles.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <ShieldCheck className="h-10 w-10 mx-auto text-green-500/40 mb-3" />
            <p className="text-muted-foreground text-sm">Nenhum ciclo encontrado para esta unidade.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Tipo</th>
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Período</th>
                    <th className="text-center px-4 py-3 font-medium text-xs text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {(cycles as unknown as Array<{
                    id: number;
                    cycle_type: string;
                    starts_at: Date | string;
                    ends_at: Date | string;
                    status: string;
                    closed_at: Date | string | null;
                  }>).map((cycle) => (
                    <tr key={cycle.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">
                          {cycle.cycle_type === "doctor" ? "Médico" : "Sistema"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {fmtDate(cycle.starts_at)} – {fmtDate(cycle.ends_at)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant="outline"
                          className={cycle.status === "open"
                            ? "text-amber-600 border-amber-600 text-xs"
                            : "text-green-600 border-green-600 text-xs"}
                        >
                          {cycle.status === "open" ? "Aberto" : "Fechado"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cycle.status === "open" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                            disabled={closeCycle.isPending}
                            onClick={() => closeCycle.mutate({ cycle_id: cycle.id })}
                          >
                            Fechar Ciclo
                          </Button>
                        )}
                        {cycle.status === "closed" && cycle.closed_at && (
                          <span className="text-xs text-muted-foreground">
                            Fechado em {fmtDate(cycle.closed_at)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function BillingAdminPage() {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();

  const { data: responsibles, isLoading: loadingResp } = trpc.billing.listResponsibles.useQuery(undefined, {
    enabled: !!user && user.role === "admin_master",
  });

  const { data: unitsData } = trpc.units.list.useQuery(undefined, {
    enabled: !!user && user.role === "admin_master",
  });

  if (!user || user.role !== "admin_master") {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Acesso restrito ao administrador.</p>
      </div>
    );
  }

  const units: Unit[] = (unitsData ?? []) as Unit[];
  const resp = ((responsibles ?? []) as unknown) as Responsible[];
  const activeCount = resp.filter((r) => r.isActive).length;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Retaguarda Financeira
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão de responsáveis, preços e ciclos financeiros
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">Admin Master</Badge>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Responsáveis Ativos</p>
                <p className="text-xl font-bold text-primary mt-1">{activeCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">de {resp.length} cadastrados</p>
              </div>
              <Users className="h-7 w-7 text-primary/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Unidades</p>
                <p className="text-xl font-bold text-blue-600 mt-1">{units.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">cadastradas</p>
              </div>
              <Building2 className="h-7 w-7 text-blue-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-gradient-to-br from-green-500/10 to-green-500/5 col-span-2">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Módulo Financeiro</p>
                <p className="text-lg font-bold text-green-600 mt-1">Operacional</p>
                <p className="text-xs text-muted-foreground mt-0.5">Ciclos por Unidade · V5</p>
              </div>
              <ShieldCheck className="h-7 w-7 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Abas */}
      <Tabs defaultValue="responsibles">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="responsibles" className="gap-1.5 text-xs sm:text-sm">
            <Users className="h-3.5 w-3.5" />
            Responsáveis
          </TabsTrigger>
          <TabsTrigger value="doctor-prices" className="gap-1.5 text-xs sm:text-sm">
            <UserCheck className="h-3.5 w-3.5" />
            Preços Médicos
          </TabsTrigger>
          <TabsTrigger value="cycles" className="gap-1.5 text-xs sm:text-sm">
            <Calendar className="h-3.5 w-3.5" />
            Ciclos
          </TabsTrigger>
        </TabsList>

        {/* Aba: Responsáveis */}
        <TabsContent value="responsibles" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Novo Responsável
            </Button>
          </div>

          {loadingResp ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : resp.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">Nenhum responsável financeiro cadastrado.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Clique em "Novo Responsável" para começar.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {resp.map((r) => (
                <ResponsibleCard
                  key={r.id}
                  responsible={r}
                  units={units}
                  onRefresh={() => utils.billing.listResponsibles.invalidate()}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Aba: Preços por Médico */}
        <TabsContent value="doctor-prices" className="mt-4">
          {!loadingResp && resp.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Wallet className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">Cadastre um responsável financeiro primeiro.</p>
              </CardContent>
            </Card>
          ) : (
            <DoctorPriceManager
              financialResponsibleId={resp[0]?.id ?? 0}
              units={units}
            />
          )}
        </TabsContent>

        {/* Aba: Ciclos */}
        <TabsContent value="cycles" className="mt-4">
          <CyclesPanel units={units} />
        </TabsContent>
      </Tabs>

      {/* Modal de criação */}
      <CreateResponsibleDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => utils.billing.listResponsibles.invalidate()}
      />
    </div>
  );
}
