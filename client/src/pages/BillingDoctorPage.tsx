/**
 * BillingDoctorPage V5 — Meu Financeiro
 *
 * Visual reformulado: cards por unidade com destaque individual,
 * extrato expansível, histórico de fechamentos, sinalização de recebimento.
 *
 * Roles com acesso: medico, admin_master
 * Roles SEM acesso: operador, viewer
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  DollarSign,
  Building2,
  FileText,
  CheckCircle2,
  Clock,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Calendar,
  Wallet,
  BarChart3,
} from "lucide-react";

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

function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtPeriod(starts: Date | string | null | undefined, ends: Date | string | null | undefined) {
  if (!starts || !ends) return "—";
  return `${fmtDate(starts)} – ${fmtDate(ends)}`;
}

// ─── Tipos locais ──────────────────────────────────────────────────────────────
type CycleRow = {
  cycle: { id: number; starts_at: Date | string; ends_at: Date | string; status: string };
  summary: {
    doctor_cycle_id: number;
    unit_id: number;
    reports_count: number | null;
    amount_due: string | null;
    received_at: Date | string | null;
  };
  unit_name: string | null;
};

// ─── Card de unidade com extrato expansível ───────────────────────────────────
function UnitCycleCard({
  row,
  onMarkReceived,
}: {
  row: CycleRow;
  onMarkReceived: (cycleId: number, unitId: number, unitName: string, amount: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: events, isLoading: loadingEvents } = trpc.billing.getDoctorCycleEvents.useQuery(
    { doctor_cycle_id: row.summary.doctor_cycle_id },
    { enabled: expanded }
  );

  const isReceived = !!row.summary.received_at;
  const unitName = row.unit_name ?? `Unidade #${row.summary.unit_id}`;
  const amount = parseFloat(row.summary.amount_due ?? "0");
  const reportsCount = row.summary.reports_count ?? 0;

  return (
    <Card className="overflow-hidden border border-border/60 hover:border-primary/30 transition-all hover:shadow-sm">
      {/* Barra colorida no topo */}
      <div className={`h-1 ${isReceived ? "bg-green-500" : "bg-amber-500"}`} />

      <CardContent className="p-4">
        {/* Cabeçalho do card */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">{unitName}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Calendar className="h-3 w-3" />
                {fmtPeriod(row.cycle.starts_at, row.cycle.ends_at)}
              </p>
            </div>
          </div>
          {isReceived ? (
            <Badge variant="outline" className="text-green-600 border-green-600 bg-green-50 dark:bg-green-950 text-xs shrink-0">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Recebido
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-600 bg-amber-50 dark:bg-amber-950 text-xs shrink-0">
              <Clock className="h-3 w-3 mr-1" />
              Pendente
            </Badge>
          )}
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="p-2.5 rounded-lg bg-muted/50">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Laudos</p>
            <p className="text-xl font-bold mt-0.5">{reportsCount}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-primary/5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Saldo</p>
            <p className="text-xl font-bold text-primary mt-0.5">{fmtBRL(amount)}</p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2">
          {!isReceived && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950 h-8 text-xs"
              onClick={() => onMarkReceived(row.summary.doctor_cycle_id, row.summary.unit_id, unitName, amount)}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Marcar Recebido
            </Button>
          )}
          {isReceived && (
            <p className="text-xs text-muted-foreground flex-1">
              Recebido em {fmtDate(row.summary.received_at)}
            </p>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
            Extrato
          </Button>
        </div>

        {/* Extrato expansível */}
        {expanded && (
          <div className="mt-4 border-t pt-4">
            {loadingEvents ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            ) : !events || events.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum evento registrado neste ciclo.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left pb-2 font-medium text-xs">Paciente</th>
                      <th className="text-left pb-2 font-medium text-xs">Data do Exame</th>
                      <th className="text-left pb-2 font-medium text-xs hidden sm:table-cell">Assinado em</th>
                      <th className="text-right pb-2 font-medium text-xs">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(events as unknown as Array<{
                      id: number;
                      patient_name: string | null;
                      study_date: string | null;
                      createdAt: Date | string | null;
                      amount: string | null;
                    }>).map((ev) => (
                      <tr key={ev.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 font-medium text-xs">{ev.patient_name ?? "—"}</td>
                        <td className="py-2 text-muted-foreground text-xs">{fmtDate(ev.study_date)}</td>
                        <td className="py-2 text-muted-foreground text-xs hidden sm:table-cell">{fmtDateTime(ev.createdAt)}</td>
                        <td className="py-2 text-right font-semibold text-primary text-xs">{fmtBRL(ev.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function BillingDoctorPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [confirmReceive, setConfirmReceive] = useState<{
    doctorCycleId: number;
    unitId: number;
    unitName: string;
    amount: number;
  } | null>(null);

  const { data, isLoading } = trpc.billing.getDoctorProduction.useQuery(undefined, {
    enabled: !!user && (user.role === "medico" || user.role === "admin_master"),
  });

  const markReceived = trpc.billing.markReceived.useMutation({
    onSuccess: () => {
      toast.success("Recebimento confirmado!");
      setConfirmReceive(null);
      utils.billing.getDoctorProduction.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao confirmar recebimento"),
  });

  if (!user || (user.role !== "medico" && user.role !== "admin_master")) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Acesso restrito a médicos.</p>
      </div>
    );
  }

  const currentCycles = ((data?.currentCycles ?? []) as unknown) as CycleRow[];
  const history = ((data?.history ?? []) as unknown) as CycleRow[];
  const totalOpen = data?.totalOpen ?? "0.00";
  const totalUnits = data?.totalUnits ?? 0;

  const totalPending = currentCycles
    .filter((r) => !r.summary.received_at)
    .reduce((s, r) => s + parseFloat(r.summary.amount_due ?? "0"), 0);

  const totalReceived = [...currentCycles, ...history]
    .filter((r) => !!r.summary.received_at)
    .reduce((s, r) => s + parseFloat(r.summary.amount_due ?? "0"), 0);

  const pendingRows = [...currentCycles, ...history].filter((r) => !r.summary.received_at);

  const totalLaudosCiclo = currentCycles.reduce((s, r) => s + (r.summary.reports_count ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Cabeçalho da página */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          Meu Financeiro
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {user.name || user.username} · Visão financeira do ciclo atual
        </p>
      </div>

      {/* Cards de resumo */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Ciclo Atual</p>
                  <p className="text-xl font-bold text-primary mt-1">{fmtBRL(totalOpen)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{totalUnits} unidade{totalUnits !== 1 ? "s" : ""}</p>
                </div>
                <TrendingUp className="h-7 w-7 text-primary/30" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Pendente</p>
                  <p className="text-xl font-bold text-amber-600 mt-1">{fmtBRL(totalPending)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Aguardando pagamento</p>
                </div>
                <Clock className="h-7 w-7 text-amber-500/30" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-500/20 bg-gradient-to-br from-green-500/10 to-green-500/5">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Já Recebido</p>
                  <p className="text-xl font-bold text-green-600 mt-1">{fmtBRL(totalReceived)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Confirmados</p>
                </div>
                <CheckCircle2 className="h-7 w-7 text-green-500/30" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Laudos no Ciclo</p>
                  <p className="text-xl font-bold text-blue-600 mt-1">{totalLaudosCiclo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Assinados</p>
                </div>
                <BarChart3 className="h-7 w-7 text-blue-500/30" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Abas */}
      <Tabs defaultValue="current">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="current" className="gap-1.5 text-xs sm:text-sm">
            <Building2 className="h-3.5 w-3.5" />
            Por Unidade
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
            <FileText className="h-3.5 w-3.5" />
            Fechamentos
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5 text-xs sm:text-sm">
            <Clock className="h-3.5 w-3.5" />
            Pendentes {pendingRows.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] h-4 px-1">{pendingRows.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Aba: Por Unidade (Ciclo Atual) */}
        <TabsContent value="current" className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-44 w-full" />
            </div>
          ) : currentCycles.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">Nenhum ciclo ativo no momento.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Os ciclos são criados automaticamente ao assinar laudos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {currentCycles.map((row) => (
                <UnitCycleCard
                  key={`${row.summary.doctor_cycle_id}-${row.summary.unit_id}`}
                  row={row}
                  onMarkReceived={(cid, uid, uname, amt) =>
                    setConfirmReceive({ doctorCycleId: cid, unitId: uid, unitName: uname, amount: amt })
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Aba: Fechamentos */}
        <TabsContent value="history" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : history.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">Nenhum ciclo fechado ainda.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Unidade</th>
                        <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Período</th>
                        <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">Laudos</th>
                        <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">Valor</th>
                        <th className="text-center px-4 py-3 font-medium text-xs text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium text-sm">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              {row.unit_name ?? `Unidade #${row.summary.unit_id}`}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {fmtPeriod(row.cycle.starts_at, row.cycle.ends_at)}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{row.summary.reports_count ?? 0}</td>
                          <td className="px-4 py-3 text-right font-semibold">{fmtBRL(row.summary.amount_due)}</td>
                          <td className="px-4 py-3 text-center">
                            {row.summary.received_at ? (
                              <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                {fmtDate(row.summary.received_at)}
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950 h-7 text-xs"
                                onClick={() =>
                                  setConfirmReceive({
                                    doctorCycleId: row.summary.doctor_cycle_id,
                                    unitId: row.summary.unit_id,
                                    unitName: row.unit_name ?? `Unidade #${row.summary.unit_id}`,
                                    amount: parseFloat(row.summary.amount_due ?? "0"),
                                  })
                                }
                              >
                                Marcar Recebido
                              </Button>
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
        </TabsContent>

        {/* Aba: Pendentes */}
        <TabsContent value="pending" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : pendingRows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto text-green-500/40 mb-3" />
                <p className="text-muted-foreground text-sm">Nenhum valor pendente.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Todos os valores foram confirmados como recebidos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pendingRows.map((row) => (
                <UnitCycleCard
                  key={`pending-${row.summary.doctor_cycle_id}-${row.summary.unit_id}`}
                  row={row}
                  onMarkReceived={(cid, uid, uname, amt) =>
                    setConfirmReceive({ doctorCycleId: cid, unitId: uid, unitName: uname, amount: amt })
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal de confirmação de recebimento */}
      <Dialog open={!!confirmReceive} onOpenChange={() => setConfirmReceive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Recebimento</DialogTitle>
          </DialogHeader>
          {confirmReceive && (
            <div className="py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Você está sinalizando que recebeu o pagamento referente a:
              </p>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Unidade</span>
                  <span className="font-medium">{confirmReceive.unitName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor</span>
                  <span className="font-bold text-green-600">{fmtBRL(confirmReceive.amount)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Esta ação não pode ser desfeita. Confirme apenas se o pagamento foi efetivamente recebido.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReceive(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={markReceived.isPending}
              onClick={() => {
                if (confirmReceive) {
                  markReceived.mutate({
                    doctor_cycle_id: confirmReceive.doctorCycleId,
                    unit_id: confirmReceive.unitId,
                  });
                }
              }}
            >
              {markReceived.isPending ? "Confirmando..." : "Confirmar Recebimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
