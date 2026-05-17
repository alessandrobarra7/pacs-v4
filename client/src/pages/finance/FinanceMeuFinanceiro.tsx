/**
 * FinanceMeuFinanceiro2 — Extrato financeiro do médico logado
 * Cards por unidade + modal de extrato + impressão
 * Desenvolvimento StudioBarra7
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { CheckCircle2, Clock, FileText, Printer } from "lucide-react";
import { FinanceShell } from "./FinanceShell";

type SummaryItem = {
  unit_id: number;
  unit_name: string;
  cycle_start_day: number;
  cycle_end_day: number;
  total_laudos: number;
  doctor_total: number;
  doctor_paid: number;
  doctor_pending: number;
  last_received_at: Date | null;
  price_per_report: number | null;
};

type EventItem = {
  id: number;
  unit_id: number | null;
  unit_name: string | null;
  patient_name: string | null;
  study_date: Date | null;
  modality_snapshot: string | null;
  exam_name_snapshot: string | null;
  doctor_amount_due: string | null;
  doctor_received_at: Date | null;
  pricing_status: string | null;  // FIN-C4: aviso de preço não configurado
  signed_at: Date | null;
};

interface ExtractModalProps {
  unit: SummaryItem;
  referenceDate: string;
  events: EventItem[];
  onClose: () => void;
}

function ExtractModal({ unit, referenceDate, events, onClose }: ExtractModalProps) {
  const unitEvents = events.filter(e => e.unit_id === unit.unit_id);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-semibold">{unit.unit_name}</h2>
            <p className="text-slate-400 text-xs">Ciclo atual · {unitEvents.length} laudos</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="overflow-y-auto flex-1">
          {unitEvents.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-10">Nenhum laudo nesta unidade.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-700">
                  <th className="px-4 py-2 text-left">Paciente</th>
                  <th className="px-4 py-2 text-left hidden md:table-cell">Data</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {unitEvents.map(ev => (
                  <tr key={ev.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 text-white">
                      <span className="truncate block max-w-[180px]">{ev.patient_name ?? "—"}</span>
                      {ev.exam_name_snapshot && (
                        <span className="text-xs text-slate-500">{ev.exam_name_snapshot}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 hidden md:table-cell text-xs">
                      {fmtDate(ev.study_date ?? ev.signed_at)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {ev.pricing_status && ev.pricing_status !== 'ok' ? (
                        <span className="text-orange-400 text-xs" title={`Sem preço (${ev.pricing_status})`}>⚠ R$ 0,00</span>
                      ) : (
                        <span className="text-amber-400">{ev.doctor_amount_due ? fmtBRL(Number(ev.doctor_amount_due)) : "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {ev.doctor_received_at ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Pago
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400 text-xs">
                          <Clock className="h-3.5 w-3.5" /> Pendente
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedUnit, setSelectedUnit] = useState<SummaryItem | null>(null);

  const referenceDate = new Date(year, month - 1, 1).toISOString();
  const { data, isLoading } = trpc.financeSimple.myFinanceiro.useQuery({ reference_date: referenceDate });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function handlePrint(u: SummaryItem) {
    const unitEvents = (data?.events ?? []).filter(e => e.unit_id === u.unit_id);
    const totalBruto = unitEvents.reduce((s, e) => s + Number(e.doctor_amount_due ?? 0), 0);
    const totalPago = unitEvents.filter(e => e.doctor_received_at).reduce((s, e) => s + Number(e.doctor_amount_due ?? 0), 0);
    const totalPend = unitEvents.filter(e => !e.doctor_received_at).reduce((s, e) => s + Number(e.doctor_amount_due ?? 0), 0);
    const priceStr = u.price_per_report != null ? ` · R$ ${Number(u.price_per_report).toFixed(2).replace(".", ",")} / laudo` : "";
    const rows = unitEvents.map(e => {
      const dt = e.study_date ? new Date(e.study_date).toLocaleDateString("pt-BR") : "—";
      const val = Number(e.doctor_amount_due ?? 0).toFixed(2).replace(".", ",");
      const st = e.doctor_received_at ? "Pago" : "Pendente";
      const cls = e.doctor_received_at ? "pago" : "pendente";
      return `<tr><td>${e.patient_name ?? "—"}</td><td>${dt}</td><td>${e.exam_name_snapshot ?? e.modality_snapshot ?? "—"}</td><td>R$ ${val}</td><td class="${cls}">${st}</td></tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Extrato — ${u.unit_name}</title><style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:20mm}h1{font-size:16px;margin-bottom:4px}h2{font-size:13px;color:#444;font-weight:normal;margin-bottom:2px}.sub{color:#666;font-size:11px;margin-bottom:16px}table{width:100%;border-collapse:collapse;margin-top:12px}th{text-align:left;padding:6px 8px;border-bottom:2px solid #333;font-size:11px;text-transform:uppercase;letter-spacing:.05em}td{padding:5px 8px;border-bottom:1px solid #eee}.pago{color:#166534;font-weight:500}.pendente{color:#991b1b}.totais{margin-top:16px;border-top:2px solid #333;padding-top:10px}.tr{display:flex;justify-content:space-between;padding:3px 0}@media print{@page{margin:20mm}}</style></head><body><h1>Extrato Financeiro</h1><h2>Médico: ${user?.name ?? user?.username ?? "—"}</h2><div class="sub">Unidade: ${u.unit_name} · Período: ${MONTHS[month-1]} ${year}${priceStr}</div><table><thead><tr><th>Paciente</th><th>Data</th><th>Exame</th><th>Valor</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><div class="totais"><div class="tr"><span>Total de laudos:</span><span>${unitEvents.length}</span></div><div class="tr"><span>Total bruto:</span><span>R$ ${totalBruto.toFixed(2).replace(".", ",")}</span></div><div class="tr"><span>Pago:</span><span>R$ ${totalPago.toFixed(2).replace(".", ",")}</span></div><div class="tr"><span><strong>Pendente:</strong></span><span><strong>R$ ${totalPend.toFixed(2).replace(".", ",")}</strong></span></div></div></body></html>`;
    const win = window.open("", "_blank", "width=900,height=700");
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => { win.print(); win.close(); }, 400); }
  }

  return (
    <FinanceShell>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Meu Financeiro</h1>
            <p className="text-slate-400 text-sm mt-0.5">Seus laudos e pagamentos por unidade</p>
          </div>
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
            <button onClick={prevMonth} className="text-slate-400 hover:text-white transition-colors px-1">‹</button>
            <span className="text-white text-sm font-medium w-32 text-center">{MONTHS[month-1]} {year}</span>
            <button onClick={nextMonth} className="text-slate-400 hover:text-white transition-colors px-1">›</button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1,2].map(i => <div key={i} className="h-48 bg-slate-800/40 rounded-xl animate-pulse" />)}
          </div>
        ) : !data?.summary.length ? (
          <div className="text-center py-16">
            <FileText className="h-12 w-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-400">Nenhum laudo finalizado em {MONTHS[month-1]} {year}</p>
            <p className="text-slate-600 text-xs mt-1">Os laudos assinados aparecerão aqui automaticamente</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.summary.map((u) => (
              <div key={u.unit_id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-white font-semibold text-base">{u.unit_name}</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {(() => {
                        const pad = (n: number) => String(n).padStart(2, '0');
                        const sd = u.cycle_start_day ?? 1;
                        const ed = u.cycle_end_day ?? 31;
                        const d = new Date(year, month - 1, 1);
                        let label: string;
                        if (sd <= ed) {
                          label = `${pad(sd)}/${pad(month)} – ${pad(ed)}/${pad(month)}`;
                        } else {
                          const nextM = month === 12 ? 1 : month + 1;
                          label = `${pad(sd)}/${pad(month)} – ${pad(ed)}/${pad(nextM)}`;
                        }
                        return <span>Ciclo: {label}</span>;
                      })()}
                      {u.price_per_report != null ? (
                        <span className="ml-2 text-cyan-400">· R$ {Number(u.price_per_report).toFixed(2).replace(".", ",")} / laudo</span>
                      ) : (
                        <span className="ml-2 text-amber-500">· Preço não configurado</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">{u.total_laudos}</p>
                    <p className="text-xs text-slate-400">laudos</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-900/60 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Total a receber</p>
                    <p className="text-base font-bold text-amber-400">{fmtBRL(u.doctor_total)}</p>
                  </div>
                  <div className="bg-slate-900/60 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Pago ✓</p>
                    <p className="text-base font-bold text-emerald-400">{fmtBRL(u.doctor_paid)}</p>
                  </div>
                  <div className="bg-slate-900/60 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Pendente ⏳</p>
                    <p className="text-base font-bold text-rose-400">{fmtBRL(u.doctor_pending)}</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setSelectedUnit(u)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-sm transition-colors">
                    <FileText className="h-4 w-4" /> Ver Extrato
                  </button>
                  <button
                    onClick={() => handlePrint(u)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm text-slate-300 transition-colors">
                    <Printer className="h-4 w-4" /> Imprimir Extrato
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedUnit !== null && (
        <ExtractModal
          unit={selectedUnit}
          referenceDate={referenceDate}
          events={data?.events ?? []}
          onClose={() => setSelectedUnit(null)}
        />
      )}
    </FinanceShell>
  );
}
