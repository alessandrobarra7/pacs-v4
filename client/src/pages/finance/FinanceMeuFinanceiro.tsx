import { useState } from "react";
import { FinanceShell } from "@/components/FinanceShell";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, CheckCircle, FileText, Building2, ChevronDown, ChevronUp } from "lucide-react";

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
  cycle: { id: number; unit_id: number; status: string; starts_at?: Date | string; ends_at?: Date | string; total_reports?: number; total_amount?: string };
  price_per_report?: string | null;
  unit_name: string;
  summary: { reports_count: number; amount_due: string; amount_received: string; received_at: Date | string | null } | null;
};
type CycleEvent = { id: number; report_id: number; patient_name: string | null; study_date: Date | string | null; amount: string; pricing_status: string; payment_status: string };

function UnitCycleCard({ cycle }: { cycle: DoctorCycle }) {
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
  const isPaid = summary?.received_at != null;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-700/30 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <p className="font-semibold text-sm text-white">{cycle.unit_name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {cycle.price_per_report
                  ? `${fmtBRL(parseFloat(cycle.price_per_report))} por laudo`
                  : cycle.cycle.total_reports && cycle.cycle.total_reports > 0
                    ? `${fmtBRL(parseFloat(String(cycle.cycle.total_amount ?? "0")) / cycle.cycle.total_reports)} por laudo (média)`
                    : "Preço não configurado"
                }
              </p>
            </div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isPaid ? "bg-emerald-400/10 text-emerald-400" : "bg-amber-400/10 text-amber-400"
          }`}>
            {isPaid ? "Recebido" : "Pendente"}
          </span>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-lg bg-slate-700/30 px-3 py-2.5">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Laudos</p>
            <p className="text-xl font-bold text-white mt-0.5">{summary?.reports_count ?? 0}</p>
          </div>
          <div className="rounded-lg bg-slate-700/30 px-3 py-2.5">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Saldo</p>
            <p className="text-xl font-bold text-emerald-400 mt-0.5">{fmtBRL(amountDue)}</p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2 mt-3">
          {!isPaid && amountDue > 0 && (
            <button
              disabled={markReceived.isPending}
              onClick={() => markReceived.mutate({ doctor_cycle_id: cycle.cycle.id, unit_id: cycle.cycle.unit_id })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Confirmar Recebimento
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "Ocultar laudos" : "Ver laudos"}
          </button>
        </div>
      </div>

      {/* Lista de laudos */}
      {expanded && (
        <div className="border-t border-slate-700/30 px-4 py-3">
          {loadingEvents ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-8 bg-slate-700/30 rounded animate-pulse" />)}
            </div>
          ) : events.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-3">Nenhum laudo neste ciclo.</p>
          ) : (
            <div className="space-y-1">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-700/20 text-xs">
                  <div>
                    <p className="text-slate-200 font-medium">{ev.patient_name ?? "Paciente não informado"}</p>
                    <p className="text-slate-500">{fmtDate(ev.study_date)}</p>
                  </div>
                  <p className="font-semibold text-emerald-400">{fmtBRL(ev.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
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

  // getDoctorProduction retorna { currentCycles, history, totalOpen, totalUnits }
  type ClosedCycle = {
    summary: { reports_count: number | null; amount_due: string | null; amount_received: string | null; received_at: Date | string | null };
    cycle: { id: number; unit_id: number; starts_at?: Date | string | null; ends_at?: Date | string | null };
    unit_name: string;
  };
  const prodObj = productionData as { currentCycles?: unknown[]; history?: unknown[]; totalOpen?: string; totalUnits?: number } | undefined;
  const cycles = (prodObj?.currentCycles ?? []) as DoctorCycle[];
  const closedCycles = (prodObj?.history ?? []) as ClosedCycle[];
  const items = ((summaryData as { items?: unknown[] })?.items ?? []) as Array<{
    id: number; unit_name: string; patient_name: string | null;
    study_date: Date | string | null; doctor_amount: string; payment_status: string;
  }>;

  const totalSaldo = Array.isArray(cycles) ? cycles.reduce((s, c) => s + parseFloat(String(c.summary?.amount_due ?? "0")), 0) : 0;
  const totalConfirmado = Array.isArray(cycles) ? cycles.reduce((s, c) => s + parseFloat(String(c.summary?.amount_received ?? "0")), 0) : 0;
  const totalLaudos = Array.isArray(cycles) ? cycles.reduce((s, c) => s + (c.summary?.reports_count ?? 0), 0) : 0;
  const activeUnits = Array.isArray(cycles) ? new Set(cycles.map((c) => c.cycle.unit_id)).size : 0;

  const isLoading = loadingProd || loadingSummary;

  const tabs = [
    { id: "por_unidade" as Tab, label: "Por Unidade", icon: Building2 },
    { id: "extrato" as Tab, label: "Extrato", icon: FileText },
    { id: "fechamentos" as Tab, label: "Fechamentos", icon: CheckCircle },
  ];

  return (
    <FinanceShell activeSection="meu-financeiro">
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Título */}
        <div>
          <h1 className="text-2xl font-bold text-white">Meu Financeiro</h1>
          <p className="text-slate-400 text-sm mt-0.5">Visão financeira de {user?.name ?? "médico"}</p>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Saldo Aberto", hint: "Ciclo atual em aberto", value: fmtBRL(totalSaldo), icon: DollarSign, color: "text-emerald-400", border: "border-emerald-400/20" },
            { label: "Recebido", hint: "Ciclos já fechados", value: fmtBRL(totalConfirmado), icon: CheckCircle, color: "text-cyan-400", border: "border-cyan-400/20" },
            { label: "Laudos no Ciclo", hint: "Ciclo corrente", value: String(totalLaudos), icon: FileText, color: "text-amber-400", border: "border-amber-400/20" },
            { label: "Unidades Ativas", hint: "Com ciclo aberto", value: String(activeUnits), icon: Building2, color: "text-violet-400", border: "border-violet-400/20" },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border ${card.border} bg-slate-800/50 p-4`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-400 text-xs uppercase tracking-wide">{card.label}</span>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
              {'hint' in card && <p className="text-xs text-slate-500 mb-1">{(card as { hint: string }).hint}</p>}
              {isLoading ? (
                <div className="h-7 w-20 bg-slate-700 rounded animate-pulse" />
              ) : (
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              )}
            </div>
          ))}
        </div>

        {/* Abas */}
        <div className="flex gap-1 border-b border-slate-700/50">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? "border-cyan-400 text-cyan-400"
                  : "border-transparent text-slate-400 hover:text-white"
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
                {[1, 2].map((i) => <div key={i} className="h-40 bg-slate-800/50 rounded-xl animate-pulse" />)}
              </div>
            ) : cycles.length === 0 ? (
              <div className="py-12 text-center">
                <Building2 className="h-10 w-10 mx-auto text-slate-600 mb-3" />
                <p className="text-slate-500 text-sm">Nenhum ciclo financeiro ativo.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {cycles.map((cycle) => (
                  <UnitCycleCard key={`${cycle.cycle.id}-${cycle.cycle.unit_id}`} cycle={cycle} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "extrato" && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
            {loadingSummary ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-slate-700/30 rounded animate-pulse" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="h-10 w-10 mx-auto text-slate-600 mb-3" />
                <p className="text-slate-500 text-sm">Nenhum laudo no período.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 bg-slate-900/30">
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Paciente</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 hidden sm:table-cell">Unidade</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 hidden md:table-cell">Data</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Valor</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{item.patient_name ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-400 hidden sm:table-cell">{item.unit_name}</td>
                        <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{fmtDate(item.study_date)}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{fmtBRL(item.doctor_amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            item.payment_status === "received"
                              ? "bg-emerald-400/10 text-emerald-400"
                              : "bg-amber-400/10 text-amber-400"
                          }`}>
                            {item.payment_status === "received" ? "Recebido" : "Pendente"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "fechamentos" && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
            {loadingProd ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-slate-700/30 rounded animate-pulse" />)}
              </div>
            ) : closedCycles.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle className="h-10 w-10 mx-auto text-slate-600 mb-3" />
                <p className="text-slate-500 text-sm">Nenhum ciclo fechado ainda.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 bg-slate-900/30">
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Unidade</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 hidden sm:table-cell">Período</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Laudos</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Total</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedCycles.map((c) => {
                      const isPaid = c.summary?.received_at != null;
                      const total = parseFloat(String(c.summary?.amount_due ?? '0'));
                      return (
                        <tr key={`${c.cycle.id}-${c.cycle.unit_id}`} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                          <td className="px-4 py-3 text-white font-medium">{c.unit_name}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">
                            {fmtDate(c.cycle.starts_at)} — {fmtDate(c.cycle.ends_at)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-300">{c.summary?.reports_count ?? 0}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-400">{fmtBRL(total)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              isPaid ? 'bg-emerald-400/10 text-emerald-400' : 'bg-amber-400/10 text-amber-400'
                            }`}>
                              {isPaid ? 'Recebido' : 'Pendente'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </FinanceShell>
  );
}
