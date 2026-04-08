/**
 * BillingDoctorPage V3 — Minha Produção Financeira
 *
 * Visão do médico: ciclo atual por unidade, histórico de ciclos fechados,
 * extrato de visitas, sinalizar recebimento.
 *
 * Roles com acesso: medico, admin_master
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, TrendingUp, Clock, CheckCircle2, Building2, DollarSign,
  ChevronDown, ChevronRight, Eye,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(val: string | number | null | undefined) {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d + "T00:00:00") : d;
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

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function BillingDoctorPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [expandedCycleId, setExpandedCycleId] = useState<number | null>(null);
  const [confirmReceive, setConfirmReceive] = useState<{
    doctorCycleId: number;
    unitId: number;
    unitName: string;
    amount: number;
  } | null>(null);

  // Produção financeira do médico logado
  const { data: production, isLoading, refetch } = trpc.billing.getDoctorProduction.useQuery(undefined, {
    enabled: !!user && (user.role === "medico" || user.role === "admin_master"),
  });

  // Eventos de visita do ciclo selecionado
  const { data: cycleEvents, isLoading: loadingEvents } = trpc.billing.getDoctorCycleEvents.useQuery(
    { doctor_cycle_id: expandedCycleId! },
    { enabled: expandedCycleId !== null }
  );

  const markReceived = trpc.billing.markReceived.useMutation({
    onSuccess: () => {
      toast.success("Recebimento sinalizado com sucesso!");
      setConfirmReceive(null);
      refetch();
    },
    onError: (e) => toast.error(e.message || "Erro ao sinalizar recebimento"),
  });

  if (!user || (user.role !== "medico" && user.role !== "admin_master")) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-muted-foreground">Acesso restrito a médicos.</p>
      </div>
    );
  }

  type CycleRow = {
    cycle: { id: number; starts_at: Date | string; ends_at: Date | string };
    summary: { unit_id: number; visits_count: number; amount_due: string; received_at: Date | string | null };
  };

  const currentCycles = ((production?.currentCycles ?? []) as unknown) as CycleRow[];
  const history = ((production?.history ?? []) as unknown) as CycleRow[];

  const totalCurrentAmount = currentCycles.reduce(
    (s, r) => s + parseFloat(r.summary.amount_due ?? "0"), 0
  );
  const totalCurrentVisits = currentCycles.reduce((s, r) => s + (r.summary.visits_count ?? 0), 0);
  const totalHistoryAmount = history.reduce(
    (s, r) => s + parseFloat(r.summary.amount_due ?? "0"), 0
  );

  const eventsTyped = (cycleEvents ?? []) as Array<{
    id: number;
    patient_name: string | null;
    study_date: string | null;
    createdAt: Date | string | null;
    doctor_amount_due: string | null;
    pricing_status: string;
  }>;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Minha Produção Financeira</h1>
            <p className="text-xs text-muted-foreground">{user.name || user.username}</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">A receber (ciclo atual)</p>
                  <p className="text-xl font-bold text-blue-600">{fmtBRL(totalCurrentAmount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Laudos no ciclo atual</p>
                  <p className="text-xl font-bold text-emerald-600">{totalCurrentVisits}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <DollarSign className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total histórico</p>
                  <p className="text-xl font-bold text-purple-600">{fmtBRL(totalHistoryAmount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ciclo atual por unidade */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Ciclo Atual — Por Unidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
            ) : currentCycles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum laudo assinado no ciclo atual.</p>
                <p className="text-xs mt-1">Os laudos aparecem aqui automaticamente após a assinatura.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {currentCycles.map((row) => {
                  const cycleId = row.cycle.id;
                  const isExpanded = expandedCycleId === cycleId;
                  const isReceived = !!row.summary.received_at;
                  const amt = parseFloat(row.summary.amount_due ?? "0");

                  return (
                    <div key={cycleId} className="border rounded-lg overflow-hidden">
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setExpandedCycleId(isExpanded ? null : cycleId)}
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">Unidade #{row.summary.unit_id}</p>
                            <p className="text-xs text-muted-foreground">
                              Ciclo: {fmtDate(row.cycle.starts_at)} → {fmtDate(row.cycle.ends_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-semibold text-emerald-600">{fmtBRL(amt)}</p>
                            <p className="text-xs text-muted-foreground">{row.summary.visits_count} laudo(s)</p>
                          </div>
                          {isReceived ? (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Recebido
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmReceive({
                                  doctorCycleId: cycleId,
                                  unitId: row.summary.unit_id,
                                  unitName: `Unidade #${row.summary.unit_id}`,
                                  amount: amt,
                                });
                              }}
                            >
                              Sinalizar Recebido
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Extrato de visitas */}
                      {isExpanded && (
                        <div className="border-t bg-muted/20 p-4">
                          {loadingEvents ? (
                            <p className="text-sm text-muted-foreground text-center py-2">Carregando extrato...</p>
                          ) : eventsTyped.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-2">Nenhum laudo neste ciclo.</p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Paciente</TableHead>
                                  <TableHead className="text-xs">Data do Exame</TableHead>
                                  <TableHead className="text-xs">Assinado em</TableHead>
                                  <TableHead className="text-xs text-right">Valor</TableHead>
                                  <TableHead className="text-xs">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {eventsTyped.map((ev) => (
                                  <TableRow key={ev.id}>
                                    <TableCell className="text-sm font-medium">{ev.patient_name || "—"}</TableCell>
                                    <TableCell className="text-sm">{fmtDate(ev.study_date)}</TableCell>
                                    <TableCell className="text-sm">{fmtDateTime(ev.createdAt)}</TableCell>
                                    <TableCell className="text-sm text-right font-medium text-emerald-600">
                                      {ev.doctor_amount_due ? fmtBRL(ev.doctor_amount_due) : "—"}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className={
                                          ev.pricing_status === "ok"
                                            ? "text-emerald-600 border-emerald-300 text-xs"
                                            : "text-amber-600 border-amber-300 text-xs"
                                        }
                                      >
                                        {ev.pricing_status === "ok" ? "Precificado" : "Pendente"}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Histórico de ciclos fechados */}
        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                Histórico de Ciclos Fechados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Unidade</TableHead>
                    <TableHead className="text-xs">Período</TableHead>
                    <TableHead className="text-xs text-right">Laudos</TableHead>
                    <TableHead className="text-xs text-right">Valor</TableHead>
                    <TableHead className="text-xs">Recebimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">Unidade #{row.summary.unit_id}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(row.cycle.starts_at)} → {fmtDate(row.cycle.ends_at)}
                      </TableCell>
                      <TableCell className="text-sm text-right">{row.summary.visits_count}</TableCell>
                      <TableCell className="text-sm text-right font-medium">
                        {fmtBRL(row.summary.amount_due)}
                      </TableCell>
                      <TableCell>
                        {row.summary.received_at ? (
                          <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {fmtDate(row.summary.received_at)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de confirmação de recebimento */}
      <Dialog open={!!confirmReceive} onOpenChange={() => setConfirmReceive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Recebimento</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              Você está sinalizando que recebeu o pagamento referente a:
            </p>
            <div className="bg-muted rounded-lg p-3 space-y-1">
              <p className="text-sm font-medium">{confirmReceive?.unitName}</p>
              <p className="text-lg font-bold text-emerald-600">{fmtBRL(confirmReceive?.amount)}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Esta ação não pode ser desfeita. Confirme apenas após receber o valor.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReceive(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!confirmReceive) return;
                markReceived.mutate({
                  doctor_cycle_id: confirmReceive.doctorCycleId,
                  unit_id: confirmReceive.unitId,
                });
              }}
              disabled={markReceived.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {markReceived.isPending ? "Salvando..." : "Confirmar Recebimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
