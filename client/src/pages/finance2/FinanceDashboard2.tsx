/**
 * FinanceDashboard2 — Dashboard financeiro simplificado
 * Cards: laudos do mês, pendente sistema, pendente médicos
 * Desenvolvimento StudioBarra7
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { DollarSign, FileText, TrendingUp, TrendingDown, Building2, ChevronRight, Calendar } from "lucide-react";
import { FinanceShell2 } from "./FinanceShell2";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FinanceDashboard2() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [, navigate] = useLocation();

  const { data, isLoading } = trpc.financeSimple.dashboard.useQuery({ year, month });
  const { data: units, isLoading: loadingUnits } = trpc.financeSimple.unitSummary.useQuery({ year, month });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  return (
    <FinanceShell2>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header com seletor de mês */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Financeiro</h1>
            <p className="text-slate-400 text-sm mt-0.5">Visão geral dos laudos e pagamentos</p>
          </div>
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
            <button onClick={prevMonth} className="text-slate-400 hover:text-white transition-colors px-1">‹</button>
            <span className="text-white font-medium text-sm min-w-[130px] text-center">
              {MONTHS[month - 1]} {year}
            </span>
            <button onClick={nextMonth} className="text-slate-400 hover:text-white transition-colors px-1">›</button>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Laudos no mês",
              value: isLoading ? "..." : String(data?.total_laudos ?? 0),
              icon: FileText,
              color: "text-blue-400",
              bg: "bg-blue-500/10 border-blue-500/20",
              isMoney: false,
            },
            {
              label: "Total Sistema",
              value: isLoading ? "..." : fmtBRL(data?.system_total ?? 0),
              sub: isLoading ? "" : `Pendente: ${fmtBRL(data?.system_pending ?? 0)}`,
              icon: TrendingUp,
              color: "text-cyan-400",
              bg: "bg-cyan-500/10 border-cyan-500/20",
              isMoney: true,
            },
            {
              label: "Total Médicos",
              value: isLoading ? "..." : fmtBRL(data?.doctor_total ?? 0),
              sub: isLoading ? "" : `Pendente: ${fmtBRL(data?.doctor_pending ?? 0)}`,
              icon: DollarSign,
              color: "text-amber-400",
              bg: "bg-amber-500/10 border-amber-500/20",
              isMoney: true,
            },
            {
              label: "Pendências",
              value: isLoading ? "..." : String((data?.system_pending_count ?? 0) + (data?.doctor_pending_count ?? 0)),
              sub: isLoading ? "" : `${data?.system_pending_count ?? 0} sistema · ${data?.doctor_pending_count ?? 0} médicos`,
              icon: TrendingDown,
              color: "text-rose-400",
              bg: "bg-rose-500/10 border-rose-500/20",
              isMoney: false,
            },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border ${card.bg} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400 text-xs uppercase tracking-wide">{card.label}</p>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.bg}`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              {card.sub && <p className="text-slate-500 text-xs mt-1">{card.sub}</p>}
            </div>
          ))}
        </div>

        {/* Tabela de unidades */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-400" />
            <h2 className="text-white font-semibold">Por Unidade</h2>
          </div>
          {loadingUnits ? (
            <div className="p-5 space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-700/40 rounded animate-pulse" />)}
            </div>
          ) : !units?.length ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              Nenhum laudo registrado em {MONTHS[month-1]} {year}.
            </div>
          ) : (
            <div className="divide-y divide-slate-700/30">
              {units.map((u) => (
                <button
                  key={u.unit_id}
                  onClick={() => navigate(`/financeiro2/pagamentos?unit=${u.unit_id}&year=${year}&month=${month}`)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-700/30 transition-colors text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{u.unit_name}</p>
                      <p className="text-xs text-slate-400">{u.total_laudos} laudo{u.total_laudos !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0 ml-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-slate-500">Sistema</p>
                      <p className="text-sm font-semibold text-cyan-400">{fmtBRL(u.system_total)}</p>
                      {u.system_pending > 0 && (
                        <p className="text-xs text-rose-400">{fmtBRL(u.system_pending)} pend.</p>
                      )}
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-slate-500">Médicos</p>
                      <p className="text-sm font-semibold text-amber-400">{fmtBRL(u.doctor_total)}</p>
                      {u.doctor_pending > 0 && (
                        <p className="text-xs text-rose-400">{fmtBRL(u.doctor_pending)} pend.</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </FinanceShell2>
  );
}
