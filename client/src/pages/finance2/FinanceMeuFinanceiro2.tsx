/**
 * FinanceMeuFinanceiro2 — Extrato financeiro do médico logado
 * Resumo por unidade + lista de laudos individuais
 * Desenvolvimento StudioBarra7
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Clock, Building2, FileText, DollarSign } from "lucide-react";
import { FinanceShell2 } from "./FinanceShell2";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

export default function FinanceMeuFinanceiro2() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);

  const { data, isLoading } = trpc.financeSimple.myFinanceiro.useQuery({ year, month });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const totalLaudos = data?.summary.reduce((a, s) => a + s.total_laudos, 0) ?? 0;
  const totalGanho = data?.summary.reduce((a, s) => a + s.doctor_total, 0) ?? 0;
  const totalPago = data?.summary.reduce((a, s) => a + s.doctor_paid, 0) ?? 0;
  const totalPendente = totalGanho - totalPago;

  const filteredEvents = selectedUnit
    ? (data?.events ?? []).filter((e) => e.unit_id === selectedUnit)
    : (data?.events ?? []);

  return (
    <FinanceShell2>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Meu Financeiro</h1>
            <p className="text-slate-400 text-sm mt-0.5">Seu extrato de laudos e pagamentos</p>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Laudos", value: isLoading ? "..." : String(totalLaudos), color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", icon: FileText },
            { label: "Total a receber", value: isLoading ? "..." : fmtBRL(totalGanho), color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: DollarSign },
            { label: "Já recebido", value: isLoading ? "..." : fmtBRL(totalPago), color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
            { label: "Pendente", value: isLoading ? "..." : fmtBRL(totalPendente), color: totalPendente > 0 ? "text-rose-400" : "text-slate-400", bg: "bg-rose-500/10 border-rose-500/20", icon: Clock },
          ].map((c) => (
            <div key={c.label} className={`rounded-xl border ${c.bg} p-4`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-slate-400 text-xs uppercase tracking-wide">{c.label}</p>
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </div>
              <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Resumo por unidade */}
        {!isLoading && (data?.summary.length ?? 0) > 0 && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700/50 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              <h2 className="text-white font-semibold text-sm">Por Unidade</h2>
            </div>
            <div className="divide-y divide-slate-700/30">
              {data?.summary.map((s) => (
                <button
                  key={s.unit_id}
                  onClick={() => setSelectedUnit(selectedUnit === s.unit_id ? null : s.unit_id)}
                  className={`w-full flex items-center justify-between px-5 py-3 hover:bg-slate-700/20 transition-colors text-left ${
                    selectedUnit === s.unit_id ? "bg-slate-700/30" : ""
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-white">{s.unit_name}</p>
                    <p className="text-xs text-slate-400">{s.total_laudos} laudo{s.total_laudos !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-amber-400">{fmtBRL(s.doctor_total)}</p>
                    {s.doctor_pending > 0 ? (
                      <p className="text-xs text-rose-400 flex items-center gap-1 justify-end">
                        <Clock className="h-3 w-3" /> {fmtBRL(s.doctor_pending)} pend.
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-400 flex items-center gap-1 justify-end">
                        <CheckCircle2 className="h-3 w-3" /> Pago
                      </p>
                    )}
                    {s.last_received_at && (
                      <p className="text-xs text-slate-500">em {fmtDate(s.last_received_at)}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lista de laudos */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <h2 className="text-white font-semibold text-sm">
                Laudos {selectedUnit ? `— ${data?.summary.find(s => s.unit_id === selectedUnit)?.unit_name}` : ""}
              </h2>
            </div>
            {selectedUnit && (
              <button
                onClick={() => setSelectedUnit(null)}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Ver todos
              </button>
            )}
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-slate-700/30 rounded animate-pulse" />)}
            </div>
          ) : !filteredEvents.length ? (
            <p className="text-slate-500 text-sm text-center py-8">
              Nenhum laudo em {MONTHS[month-1]} {year}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-700/50">
                    <th className="px-4 py-2 text-left">Paciente</th>
                    <th className="px-4 py-2 text-left hidden sm:table-cell">Unidade</th>
                    <th className="px-4 py-2 text-left hidden md:table-cell">Data</th>
                    <th className="px-4 py-2 text-right">Valor</th>
                    <th className="px-4 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/20">
                  {filteredEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 text-white">
                        <span className="truncate block max-w-[160px]">{ev.patient_name ?? "—"}</span>
                        {ev.modality_snapshot && (
                          <span className="text-xs text-slate-500">{ev.modality_snapshot}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 hidden sm:table-cell text-xs">
                        {ev.unit_name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 hidden md:table-cell text-xs whitespace-nowrap">
                        {fmtDate(ev.study_date ?? ev.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-amber-400 text-right font-medium">
                        {ev.doctor_amount_due ? fmtBRL(Number(ev.doctor_amount_due)) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {ev.doctor_received_at ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{fmtDate(ev.doctor_received_at)}</span>
                            <span className="sm:hidden">Pago</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-400 text-xs">
                            <Clock className="h-3.5 w-3.5" />
                            Pendente
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </FinanceShell2>
  );
}
