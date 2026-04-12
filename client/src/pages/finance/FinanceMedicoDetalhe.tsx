import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { FinanceShell } from "@/components/FinanceShell";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, User, Building2, DollarSign, FileText,
  TrendingUp, Calendar, CheckCircle, Clock, ChevronDown, ChevronUp,
  AlertTriangle, Search, Filter, RotateCcw
} from "lucide-react";

const fmt = (v: string | number | null | undefined) =>
  parseFloat(String(v ?? "0")).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
};

type Tab = "ciclo-atual" | "precos" | "unidades" | "historico" | "auditoria";

function CycleEventRow({ doctorUserId, cycleId, unitName }: { doctorUserId: number; cycleId: number; unitName: string }) {
  const [open, setOpen] = useState(false);
  const { data: events, isLoading } = trpc.billing.getDoctorCycleEventsForAdmin.useQuery(
    { doctorUserId, doctorCycleId: cycleId },
    { enabled: open }
  );

  return (
    <div className="rounded-lg border border-slate-700/40 overflow-hidden mt-3">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900/40 hover:bg-slate-900/60 text-sm font-medium text-slate-300 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-cyan-400" />
          Ver laudos
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="p-3">
          {isLoading ? (
            <p className="text-sm text-slate-500 text-center py-2">Carregando...</p>
          ) : !events?.length ? (
            <p className="text-sm text-slate-500 text-center py-2">Nenhum laudo neste ciclo</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-700/30">
                  <th className="pb-2 font-medium text-slate-400 text-xs">Paciente</th>
                  <th className="pb-2 font-medium text-slate-400 text-xs">Data</th>
                  <th className="pb-2 font-medium text-slate-400 text-xs text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} className="border-b border-slate-700/20 last:border-0">
                    <td className="py-2 text-slate-300">{ev.patient_name ?? "—"}</td>
                    <td className="py-2 text-slate-500 text-xs">{fmtDate(ev.createdAt)}</td>
                    <td className="py-2 text-right font-medium text-emerald-400">{fmt(ev.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function FinanceMedicoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("ciclo-atual");
  const doctorUserId = parseInt(id ?? "0");

  const { data: detail, isLoading: loadingDetail } = trpc.billing.getDoctorDetail.useQuery(
    { doctorUserId }, { enabled: !!doctorUserId }
  );
  const { data: financial, isLoading: loadingFinancial } = trpc.billing.getDoctorFinancialDetail.useQuery(
    { doctorUserId }, { enabled: !!doctorUserId }
  );

  const { toast } = useToast();
  const [auditFromDate, setAuditFromDate] = useState("");
  const [auditToDate, setAuditToDate] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { data: auditData, isLoading: loadingAudit, refetch: refetchAudit } = trpc.billing.getDoctorAuditReport.useQuery(
    { doctorUserId, from_date: auditFromDate || undefined, to_date: auditToDate || undefined },
    { enabled: tab === "auditoria" && !!doctorUserId }
  );

  const resetMutation = trpc.billing.resetDoctorBilling.useMutation({
    onSuccess: (result) => {
      toast({
        title: "Dados resetados com sucesso",
        description: `${result.events_deleted} eventos, ${result.summaries_deleted} sumários e ${result.report_items_deleted} itens removidos.`,
      });
      setShowResetConfirm(false);
      refetchAudit();
    },
    onError: (err) => {
      toast({ title: "Erro ao resetar", description: err.message, variant: "destructive" });
    },
  });

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "ciclo-atual", label: "Ciclo Atual", icon: TrendingUp },
    { id: "precos", label: "Preços", icon: DollarSign },
    { id: "unidades", label: "Unidades", icon: Building2 },
    { id: "historico", label: "Histórico", icon: Calendar },
    { id: "auditoria", label: "Auditoria", icon: Search },
  ];

  if (loadingDetail || loadingFinancial) {
    return (
      <FinanceShell activeSection="medicos">
        <div className="p-8 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
      </FinanceShell>
    );
  }

  if (!detail) {
    return (
      <FinanceShell activeSection="medicos">
        <div className="p-8 text-center text-slate-500">
          Médico não encontrado.
          <button onClick={() => navigate("/financeiro/medicos")} className="ml-2 text-cyan-400 hover:underline">Voltar</button>
        </div>
      </FinanceShell>
    );
  }

  const { doctor, unitLinks, prices } = detail;
  const totalAberto = parseFloat(financial?.totalOpen ?? "0");
  const totalLaudos = (financial?.currentCycles ?? []).reduce((s, r) => s + (r.summary.reports_count ?? 0), 0);
  const totalConfirmado = (financial?.currentCycles ?? [])
    .filter(r => r.summary.received_at)
    .reduce((s, r) => s + parseFloat(r.summary.amount_due ?? "0"), 0);

  const openByUnit = (financial?.currentCycles ?? []).reduce<
    Record<number, { cycleId: number; unitName: string; amount: string; reports: number; received: boolean }>
  >((acc, r) => {
    const uid = r.summary.unit_id;
    if (!acc[uid]) {
      acc[uid] = {
        cycleId: r.summary.doctor_cycle_id,
        unitName: r.unit_name,
        amount: r.summary.amount_due ?? "0",
        reports: r.summary.reports_count ?? 0,
        received: !!r.summary.received_at,
      };
    }
    return acc;
  }, {});

  return (
    <FinanceShell activeSection="medicos">
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Cabeçalho com botão voltar */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/financeiro/medicos")}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <div className="h-5 w-px bg-slate-700" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm">
              {(doctor.name ?? "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{doctor.name}</h1>
              <p className="text-slate-400 text-sm">{doctor.email ?? "Sem e-mail"}</p>
            </div>
          </div>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-400 border border-cyan-400/20">
            {doctor.role}
          </span>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Saldo Aberto", value: fmt(totalAberto), icon: DollarSign, color: "text-emerald-400", border: "border-emerald-400/20" },
            { label: "Confirmado", value: fmt(totalConfirmado), icon: CheckCircle, color: "text-cyan-400", border: "border-cyan-400/20" },
            { label: "Laudos (ciclo)", value: String(totalLaudos), icon: FileText, color: "text-amber-400", border: "border-amber-400/20" },
            { label: "Unidades Ativas", value: String(unitLinks.length), icon: Building2, color: "text-purple-400", border: "border-purple-400/20" },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border ${card.border} bg-slate-800/50 p-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-xs uppercase tracking-wide">{card.label}</span>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div className="flex gap-1 border-b border-slate-700/50 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
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

        {/* Aba: Ciclo Atual */}
        {tab === "ciclo-atual" && (
          <div className="space-y-4">
            {Object.keys(openByUnit).length === 0 ? (
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 py-12 text-center">
                <Clock className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p className="text-slate-500">Nenhum ciclo aberto no momento</p>
              </div>
            ) : (
              Object.values(openByUnit).map((u) => (
                <div key={u.cycleId} className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-cyan-400" />
                      <span className="font-semibold text-white">{u.unitName}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.received ? "bg-emerald-400/10 text-emerald-400" : "bg-amber-400/10 text-amber-400"}`}>
                      {u.received ? "Recebido" : "Pendente"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-400 text-xs">Laudos</p>
                      <p className="font-semibold text-white text-lg">{u.reports}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs">Saldo</p>
                      <p className="font-semibold text-emerald-400 text-lg">{fmt(u.amount)}</p>
                    </div>
                  </div>
                  <CycleEventRow doctorUserId={doctorUserId} cycleId={u.cycleId} unitName={u.unitName} />
                </div>
              ))
            )}
          </div>
        )}

        {/* Aba: Preços */}
        {tab === "precos" && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/30">
              <h3 className="text-sm font-semibold text-white">Preços por Unidade</h3>
            </div>
            {prices.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">Nenhum preço configurado</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/30 bg-slate-900/30">
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Unidade</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">Valor/Laudo</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">Vigência</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((p) => (
                    <tr key={p.id} className="border-b border-slate-700/20 hover:bg-slate-700/20">
                      <td className="px-4 py-3 text-white font-medium">{p.unit_name ?? `Unidade ${p.unit_id}`}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-400">{fmt(p.price_per_report)}</td>
                      <td className="px-4 py-3 text-right text-slate-400 text-xs">
                        {fmtDate(p.starts_at)} — {p.ends_at ? fmtDate(p.ends_at) : "Atual"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Aba: Unidades */}
        {tab === "unidades" && (
          <div className="space-y-3">
            {unitLinks.length === 0 ? (
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 py-8 text-center text-slate-500 text-sm">
                Nenhuma unidade vinculada
              </div>
            ) : (
              unitLinks.map((u) => {
                const p = prices.find(pr => pr.unit_id === u.unit_id);
                return (
                  <div key={u.unit_id} className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-cyan-400/10 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">{u.unit_name ?? `Unidade ${u.unit_id}`}</p>
                      <p className="text-xs text-slate-500">ID: {u.unit_id}</p>
                    </div>
                    {p ? (
                      <span className="ml-auto text-sm font-semibold text-emerald-400">{fmt(p.price_per_report)}/laudo</span>
                    ) : (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400">Sem preço</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Aba: Auditoria */}
        {tab === "auditoria" && (
          <div className="space-y-4">
            {/* Filtros e botão de reset */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">De</label>
                  <input type="date" value={auditFromDate} onChange={e => setAuditFromDate(e.target.value)}
                    className="bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-white" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Até</label>
                  <input type="date" value={auditToDate} onChange={e => setAuditToDate(e.target.value)}
                    className="bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-white" />
                </div>
                <button onClick={() => refetchAudit()}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 text-sm transition-colors">
                  <Filter className="w-3.5 h-3.5" /> Filtrar
                </button>
                <div className="ml-auto">
                  {!showResetConfirm ? (
                    <button onClick={() => setShowResetConfirm(true)}
                      className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 text-sm transition-colors">
                      <RotateCcw className="w-3.5 h-3.5" /> Resetar dados financeiros
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <span className="text-xs text-red-300">Isso apagará TODOS os eventos, ciclos e apurações deste médico. Confirma?</span>
                      <button onClick={() => resetMutation.mutate({ doctorUserId })}
                        disabled={resetMutation.isPending}
                        className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50">
                        {resetMutation.isPending ? "Aguarde..." : "Confirmar"}
                      </button>
                      <button onClick={() => setShowResetConfirm(false)}
                        className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs">
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tabela de laudos */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/30 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Laudos Realizados</h3>
                {auditData && <span className="text-xs text-slate-400">{auditData.events.length} registros</span>}
              </div>
              {loadingAudit ? (
                <div className="py-8 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400" /></div>
              ) : !auditData?.events?.length ? (
                <div className="py-8 text-center text-slate-500 text-sm">Nenhum laudo encontrado</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/30 bg-slate-900/30">
                        <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Data</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Paciente</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Unidade</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">Valor</th>
                        <th className="text-center px-4 py-2 text-xs font-medium text-slate-400">Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditData.events.map((ev) => (
                        <tr key={ev.id} className="border-b border-slate-700/20 hover:bg-slate-700/20">
                          <td className="px-4 py-3 text-slate-400 text-xs">{ev.createdAt ? new Date(ev.createdAt).toLocaleString("pt-BR") : "—"}</td>
                          <td className="px-4 py-3 text-white">{ev.patient_name ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-300">{ev.unit_name ?? `Unidade ${ev.unit_id}`}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-400">{fmt(ev.doctor_amount_due)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              ev.pricing_status === 'ok' ? 'bg-emerald-400/10 text-emerald-400' :
                              ev.pricing_status === 'pending_doctor_price' ? 'bg-amber-400/10 text-amber-400' :
                              'bg-slate-600/40 text-slate-400'
                            }`}>{ev.pricing_status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Aba: Histórico */}
        {tab === "historico" && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/30">
              <h3 className="text-sm font-semibold text-white">Ciclos Fechados</h3>
            </div>
            {!financial?.history?.length ? (
              <div className="py-8 text-center text-slate-500 text-sm">Nenhum ciclo fechado</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/30 bg-slate-900/30">
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Unidade</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Período</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">Laudos</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">Valor</th>
                      <th className="text-center px-4 py-2 text-xs font-medium text-slate-400">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financial.history.map((r) => (
                      <tr key={`${r.summary.doctor_cycle_id}-${r.summary.unit_id}`} className="border-b border-slate-700/20 hover:bg-slate-700/20">
                        <td className="px-4 py-3 text-white font-medium">{r.unit_name}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {fmtDate(r.cycle.starts_at)} — {fmtDate(r.cycle.ends_at)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300">{r.summary.reports_count}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-400">{fmt(r.summary.amount_due)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${r.summary.received_at ? "bg-emerald-400/10 text-emerald-400" : "bg-slate-600/40 text-slate-400"}`}>
                            {r.summary.received_at ? "Recebido" : "Fechado"}
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
      </div>
    </FinanceShell>
  );
}
