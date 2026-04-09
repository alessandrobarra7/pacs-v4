/**
 * BillingDoctorPage V4 — Meu Financeiro
 *
 * Visão do médico: cards de resumo, ciclo atual por unidade com extrato
 * expansível, histórico de fechamentos, sinalização de recebimento.
 *
 * Roles com acesso: medico, admin_master
 */
import { useState } from "react";
import { useLocation } from "wouter";
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
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Calendar,
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

// ─── Card expansível de ciclo por unidade ─────────────────────────────────────
function CycleCard({
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

  return (
    <Card className="border border-border/60 hover:border-primary/30 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">{unitName}</CardTitle>
          </div>
          {isReceived ? (
            <Badge variant="outline" className="text-green-600 border-green-600 bg-green-50 dark:bg-green-950 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Recebido em {fmtDate(row.summary.received_at)}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-600 bg-amber-50 dark:bg-amber-950 text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Pendente
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
          <Calendar className="h-3 w-3" />
          {fmtPeriod(row.cycle.starts_at, row.cycle.ends_at)}
        </p>
      </CardHeader>

      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Visitas</p>
              <p className="text-xl font-bold">{row.summary.reports_count ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Valor</p>
              <p className="text-xl font-bold text-primary">{fmtBRL(amount)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isReceived && (
              <Button
                size="sm"
                variant="outline"
                className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950 h-8 text-xs"
                onClick={() => onMarkReceived(row.summary.doctor_cycle_id, row.summary.unit_id, unitName, amount)}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Marcar Recebido
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
              Extrato
            </Button>
          </div>
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
                      <th className="text-left pb-2 font-medium">Paciente</th>
                      <th className="text-left pb-2 font-medium">Data do Exame</th>
                      <th className="text-left pb-2 font-medium">Assinado em</th>
                      <th className="text-right pb-2 font-medium">Valor</th>
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
                        <td className="py-2 font-medium">{ev.patient_name ?? "—"}</td>
                        <td className="py-2 text-muted-foreground">{fmtDate(ev.study_date)}</td>
                        <td className="py-2 text-muted-foreground text-xs">{fmtDateTime(ev.createdAt)}</td>
                        <td className="py-2 text-right font-semibold text-primary">{fmtBRL(ev.amount)}</td>
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
  const [, navigate] = useLocation();
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
      <div className="flex items-center justify-center h-screen bg-background">
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Meu Financeiro</h1>
          </div>
          <Badge variant="secondary" className="ml-auto text-xs">
            {user.name || user.username}
          </Badge>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Cards de resumo */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Ciclo Atual</p>
                    <p className="text-2xl font-bold text-primary mt-1">{fmtBRL(totalOpen)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {totalUnits} unidade{totalUnits !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-primary/30" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Pendente de Recebimento</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">{fmtBRL(totalPending)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Aguardando confirmação</p>
                  </div>
                  <Clock className="h-8 w-8 text-amber-500/30" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Já Recebido</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">{fmtBRL(totalReceived)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Ciclos confirmados</p>
                  </div>
                  <CheckCircle2 className="h-8 w-8 text-green-500/30" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Abas */}
        <Tabs defaultValue="current">
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="current" className="text-xs">
              <Building2 className="h-3.5 w-3.5 mr-1.5" />
              Ciclo Atual
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Fechamentos
            </TabsTrigger>
            <TabsTrigger value="pending" className="text-xs">
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              Pendentes {pendingRows.length > 0 && `(${pendingRows.length})`}
            </TabsTrigger>
          </TabsList>

          {/* Aba: Ciclo Atual */}
          <TabsContent value="current" className="mt-4 space-y-3">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-36 w-full" />
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
              currentCycles.map((row) => (
                <CycleCard
                  key={`${row.summary.doctor_cycle_id}-${row.summary.unit_id}`}
                  row={row}
                  onMarkReceived={(cid, uid, uname, amt) =>
                    setConfirmReceive({ doctorCycleId: cid, unitId: uid, unitName: uname, amount: amt })
                  }
                />
              ))
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
                <CardContent className="pt-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left pb-3 font-medium">Unidade</th>
                          <th className="text-left pb-3 font-medium">Período</th>
                          <th className="text-right pb-3 font-medium">Visitas</th>
                          <th className="text-right pb-3 font-medium">Valor</th>
                          <th className="text-center pb-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((row, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-3 font-medium">
                              {row.unit_name ?? `Unidade #${row.summary.unit_id}`}
                            </td>
                            <td className="py-3 text-muted-foreground text-xs">
                              {fmtPeriod(row.cycle.starts_at, row.cycle.ends_at)}
                            </td>
                            <td className="py-3 text-right">{row.summary.reports_count ?? 0}</td>
                            <td className="py-3 text-right font-semibold">{fmtBRL(row.summary.amount_due)}</td>
                            <td className="py-3 text-center">
                              {row.summary.received_at ? (
                                <Badge
                                  variant="outline"
                                  className="text-green-600 border-green-600 text-xs"
                                >
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
          <TabsContent value="pending" className="mt-4 space-y-3">
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
              pendingRows.map((row) => (
                <CycleCard
                  key={`pending-${row.summary.doctor_cycle_id}-${row.summary.unit_id}`}
                  row={row}
                  onMarkReceived={(cid, uid, uname, amt) =>
                    setConfirmReceive({ doctorCycleId: cid, unitId: uid, unitName: uname, amount: amt })
                  }
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

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
