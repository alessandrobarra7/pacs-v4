/**
 * FinanceMeuFinanceiro — Visão financeira do médico logado
 * Cards de resumo: Saldo Total, Confirmado, Laudos no Ciclo, Unidades Ativas
 * Abas: Por Unidade | Extrato | Fechamentos
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign,
  CheckCircle,
  FileText,
  Building2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("pt-BR");
}

type Tab = "por_unidade" | "extrato" | "fechamentos";

type DoctorCycle = {
  cycle: {
    id: number;
    unit_id: number;
    status: string;
    period_start: Date | string;
    period_end: Date | string;
    total_reports: number;
    total_amount: string;
  };
  unit_name: string;
  summary: {
    reports_count: number;
    amount_due: string;
    amount_received: string;
    received_at: Date | string | null;
  } | null;
};

type CycleEvent = {
  id: number;
  report_id: number;
  patient_name: string | null;
  study_date: Date | string | null;
  amount: string;
  pricing_status: string;
  payment_status: string;
};

function UnitCycleCard({ cycle, doctorUserId }: { cycle: DoctorCycle; doctorUserId: number }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: eventsData, isLoading: loadingEvents } = trpc.billing.getDoctorCycleEvents.useQuery(
    { doctor_cycle_id: cycle.cycle.id },
    { enabled: expanded }
  );

  const markReceived = trpc.billing.markReceived.useMutation({
    onSuccess: () => {
      toast({ title: "Pagamento confirmado com sucesso." });
      utils.billing.getDoctorProduction.invalidate();
    },
    onError: (e) => toast({ title: "Erro ao confirmar", description: e.message, variant: "destructive" }),
  });

  const events = (eventsData ?? []) as unknown as CycleEvent[];
  const summary = cycle.summary;
  const amountDue = parseFloat(String(summary?.amount_due ?? "0"));
  const amountReceived = parseFloat(String(summary?.amount_received ?? "0"));
  const isPaid = summary?.received_at != null;

  return (
    <Card className="border border-border/60">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-sm">{cycle.unit_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fmtBRL(parseFloat(String(cycle.cycle.total_amount ?? "0")) / Math.max(cycle.cycle.total_reports, 1))} por laudo
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPaid ? (
              <Badge variant="outline" className="text-green-600 border-green-600 text-xs">Recebido</Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">Pendente</Badge>
            )}
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Laudos</p>
            <p className="text-xl font-bold text-foreground mt-0.5">{summary?.reports_count ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Saldo</p>
            <p className="text-xl font-bold text-green-600 mt-0.5">{fmtBRL(amountDue)}</p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2 mt-4">
          {!isPaid && amountDue > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7"
              disabled={markReceived.isPending}
              onClick={() => markReceived.mutate({ doctor_cycle_id: cycle.cycle.id, unit_id: cycle.cycle.unit_id })}
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Confirmar Recebimento
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 ml-auto"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
            {expanded ? "Ocultar" : "Ver laudos"}
          </Button>
        </div>

        {/* Lista de laudos */}
        {expanded && (
          <div className="mt-4 border-t border-border/60 pt-3">
            {loadingEvents ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : events.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Nenhum laudo neste ciclo.</p>
            ) : (
              <div className="space-y-1.5">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30 text-xs">
                    <div>
                      <p className="font-medium">{ev.patient_name ?? "Paciente não informado"}</p>
                      <p className="text-muted-foreground">{fmtDate(ev.study_date)}</p>
                    </div>
                    <p className="font-semibold text-green-600">{fmtBRL(ev.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FinanceMeuFinanceiro() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("por_unidade");
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth() + 1);

  const { data: productionData, isLoading: loadingProd } = trpc.billing.getDoctorProduction.useQuery();
  const { data: summaryData, isLoading: loadingSummary } = trpc.billing.getDoctorSummary.useQuery({ year, month });

  const cycles = (productionData ?? []) as DoctorCycle[];
  const items = ((summaryData as { items?: unknown[] })?.items ?? []) as Array<{
    id: number;
    unit_name: string;
    patient_name: string | null;
    study_date: Date | string | null;
    doctor_amount: string;
    payment_status: string;
  }>;

  // Métricas gerais
  const totalSaldo = cycles.reduce((s, c) => s + parseFloat(String(c.summary?.amount_due ?? "0")), 0);
  const totalConfirmado = cycles.reduce((s, c) => s + parseFloat(String(c.summary?.amount_received ?? "0")), 0);
  const totalLaudos = cycles.reduce((s, c) => s + (c.summary?.reports_count ?? 0), 0);
  const activeUnits = new Set(cycles.map((c) => c.cycle.unit_id)).size;

  const isLoading = loadingProd || loadingSummary;

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "por_unidade", label: "Por Unidade", icon: Building2 },
    { id: "extrato", label: "Extrato", icon: FileText },
    { id: "fechamentos", label: "Fechamentos", icon: CheckCircle },
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meu Financeiro</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Visão financeira de {user?.name ?? "médico"}
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "SALDO TOTAL",
            value: isLoading ? null : fmtBRL(totalSaldo),
            icon: DollarSign,
            color: "text-green-600",
            bg: "bg-green-50 dark:bg-green-950",
          },
          {
            label: "CONFIRMADO",
            value: isLoading ? null : fmtBRL(totalConfirmado),
            icon: CheckCircle,
            color: "text-blue-600",
            bg: "bg-blue-50 dark:bg-blue-950",
          },
          {
            label: "LAUDOS NO CICLO",
            value: isLoading ? null : totalLaudos,
            icon: FileText,
            color: "text-amber-600",
            bg: "bg-amber-50 dark:bg-amber-950",
          },
          {
            label: "UNIDADES ATIVAS",
            value: isLoading ? null : activeUnits,
            icon: Building2,
            color: "text-purple-600",
            bg: "bg-purple-50 dark:bg-purple-950",
          },
        ].map((card) => (
          <Card key={card.label} className="border border-border/60">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground tracking-wide">{card.label}</p>
                  {card.value === null ? (
                    <Skeleton className="h-7 w-20 mt-1" />
                  ) : (
                    <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                  )}
                </div>
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-border/60">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo das abas */}
      {tab === "por_unidade" && (
        <div>
          {loadingProd ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : cycles.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">Nenhum ciclo financeiro ativo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cycles.map((cycle) => (
                <UnitCycleCard
                  key={`${cycle.cycle.id}-${cycle.cycle.unit_id}`}
                  cycle={cycle}
                  doctorUserId={user?.id ?? 0}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "extrato" && (
        <Card className="border border-border/60">
          <CardContent className="p-0">
            {loadingSummary ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">Nenhum laudo no período.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/20">
                      <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Paciente</th>
                      <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground hidden sm:table-cell">Unidade</th>
                      <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground hidden md:table-cell">Data</th>
                      <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">Valor</th>
                      <th className="text-center px-4 py-3 font-medium text-xs text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium">{item.patient_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">{item.unit_name}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">{fmtDate(item.study_date)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-green-600">{fmtBRL(item.doctor_amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant="outline"
                            className={
                              item.payment_status === "paid"
                                ? "text-green-600 border-green-600 text-xs"
                                : "text-amber-600 border-amber-600 text-xs"
                            }
                          >
                            {item.payment_status === "paid" ? "Pago" : "Pendente"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "fechamentos" && (
        <Card className="border border-border/60">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground text-center py-8">
              Histórico de fechamentos em breve.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
