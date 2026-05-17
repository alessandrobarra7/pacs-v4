/**
 * FinanceMeuResponsavel — Painel do Responsável Financeiro
 * Exibe as unidades vinculadas, resumo de laudos/valores e drill-down de médicos
 * Desenvolvimento StudioBarra7
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Building2, ChevronLeft, ChevronRight, DollarSign, FileText,
  CheckCircle2, Clock, AlertCircle, X, Users,
} from "lucide-react";
import { FinanceShell } from "./FinanceShell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Modal de médicos de uma unidade ─────────────────────────────────────────
function DoctorsModal({
  unitId, unitName, referenceDate, onClose,
}: {
  unitId: number; unitName: string; referenceDate: string; onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.financeSimple.doctorSummaryByUnit.useQuery({
    unit_id: unitId, reference_date: referenceDate,
  });
  const markPaid = trpc.financeSimple.markDoctorPaid.useMutation({
    onSuccess: () => {
      toast.success("Pagamento registrado!");
      utils.financeSimple.doctorSummaryByUnit.invalidate();
      utils.financeSimple.myResponsavelSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <p className="text-white font-semibold">{unitName}</p>
            <p className="text-slate-400 text-xs">Ciclo atual — médicos</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-slate-800 rounded animate-pulse" />)}
            </div>
          ) : !data?.length ? (
            <div className="p-8 text-center text-slate-500 text-sm">Nenhum médico com laudos neste período.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-6 py-3 text-slate-400 font-medium text-xs uppercase">Médico</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs uppercase">Laudos</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs uppercase">R$/Laudo</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs uppercase">Total</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs uppercase">Pago</th>
                  <th className="text-right px-6 py-3 text-slate-400 font-medium text-xs uppercase">Pendente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {data.map((doc) => (
                  <tr key={doc.doctor_user_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-3 text-white">{doc.doctor_name}</td>
                    <td className="px-4 py-3 text-slate-400 text-right">{doc.total_laudos}</td>
                    <td className="px-4 py-3 text-cyan-400 text-right text-xs">
                      {(doc as any).price_per_report ? fmtBRL(Number((doc as any).price_per_report)) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-amber-400 text-right font-medium">{fmtBRL(doc.doctor_total)}</td>
                    <td className="px-4 py-3 text-emerald-400 text-right">{fmtBRL(doc.doctor_paid)}</td>
                    <td className="px-6 py-3 text-right">
                      {doc.doctor_pending > 0 ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-orange-400 font-medium">{fmtBRL(doc.doctor_pending)}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs border-emerald-600 text-emerald-400 hover:bg-emerald-900/30"
                            disabled={markPaid.isPending}
                            onClick={() => markPaid.mutate({
                              unit_id: unitId,
                              doctor_user_id: doc.doctor_user_id,
                              reference_date: referenceDate,
                            })}
                          >
                            Marcar pago
                          </Button>
                        </div>
                      ) : (
                        <span className="inline-flex flex-col items-center gap-0.5 text-emerald-400 text-xs">
                          <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Quitado</span>
                          {doc.last_received_at && (
                            <span className="text-slate-500 text-[10px]">{new Date(doc.last_received_at).toLocaleDateString('pt-BR')}</span>
                          )}
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

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanceMeuResponsavel() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedUnit, setSelectedUnit] = useState<{ id: number; name: string } | null>(null);

  const referenceDate = new Date(year, month - 1, 15).toISOString();
  const { data, isLoading } = trpc.financeSimple.myResponsavelSummary.useQuery({ reference_date: referenceDate });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const units = data?.units ?? [];
  const totalLaudos = units.reduce((a, u) => a + u.total_laudos, 0);
  const totalSystem = units.reduce((a, u) => a + u.system_total, 0);
  const totalSystemPaid = units.reduce((a, u) => a + u.system_paid, 0);
  const totalSystemPending = totalSystem - totalSystemPaid;

  return (
    <FinanceShell>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Cabeçalho + navegação de mês */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Meu Painel Financeiro</h1>
            <p className="text-slate-400 text-sm mt-0.5">Unidades sob sua responsabilidade</p>
          </div>
          <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
            <button onClick={prevMonth} className="text-slate-400 hover:text-white transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-white font-medium text-sm min-w-[120px] text-center">
              {MONTHS[month - 1]} {year}
            </span>
            <button onClick={nextMonth} className="text-slate-400 hover:text-white transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="text-slate-400 text-xs uppercase tracking-wide">Laudos</span>
            </div>
            <p className="text-2xl font-bold text-white">{totalLaudos}</p>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-slate-400" />
              <span className="text-slate-400 text-xs uppercase tracking-wide">Total ao Sistema</span>
            </div>
            <p className="text-2xl font-bold text-amber-400">{fmtBRL(totalSystem)}</p>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-slate-400 text-xs uppercase tracking-wide">Pago ao Sistema</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{fmtBRL(totalSystemPaid)}</p>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-orange-400" />
              <span className="text-slate-400 text-xs uppercase tracking-wide">Pendente ao Sistema</span>
            </div>
            <p className="text-2xl font-bold text-orange-400">{fmtBRL(totalSystemPending)}</p>
          </div>
        </div>

        {/* Lista de unidades */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-800/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : units.length === 0 ? (
          <div className="bg-slate-800/40 rounded-xl p-12 text-center border border-slate-700/50">
            <Building2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Nenhuma unidade vinculada à sua conta.</p>
            <p className="text-slate-500 text-xs mt-1">
              Solicite ao administrador que vincule uma unidade ao seu perfil.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {units.map((u) => (
              <div
                key={u.unit_id}
                className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold">{u.unit_name}</p>
                      <p className="text-slate-400 text-xs">
                        {u.total_laudos} laudos
                        {' · '}
                        {(() => {
                          const pad = (n: number) => String(n).padStart(2, '0');
                          const sd = u.cycle_start_day ?? 1;
                          const ed = u.cycle_end_day ?? 31;
                          if (sd <= ed) {
                            return `Ciclo: ${pad(sd)}/${pad(month)} – ${pad(ed)}/${pad(month)}`;
                          } else {
                            const nextM = month === 12 ? 1 : month + 1;
                            return `Ciclo: ${pad(sd)}/${pad(month)} – ${pad(ed)}/${pad(nextM)}`;
                          }
                        })()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedUnit({ id: u.unit_id, name: u.unit_name })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Ver médicos
                  </button>
                </div>

                {/* Barra de valores */}
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="bg-slate-900/50 rounded-lg p-2.5">
                    <p className="text-slate-500 text-xs mb-1">Total ao Sistema</p>
                    <p className="text-amber-400 font-semibold text-sm">{fmtBRL(u.system_total)}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-2.5">
                    <p className="text-slate-500 text-xs mb-1">Pago ao Sistema</p>
                    <p className="text-emerald-400 font-semibold text-sm">{fmtBRL(u.system_paid)}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-2.5">
                    <p className="text-slate-500 text-xs mb-1">Pendente ao Sistema</p>
                    <p className={`font-semibold text-sm ${u.system_pending > 0 ? "text-orange-400" : "text-slate-500"}`}>
                      {fmtBRL(u.system_pending)}
                    </p>
                  </div>
                </div>

                {/* Barra de valores — médicos */}
                {(u.doctor_total > 0 || u.doctor_pending > 0) && (
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    <div className="bg-slate-900/30 rounded-lg p-2.5 border border-slate-700/30">
                      <p className="text-slate-500 text-xs mb-1">Total Médicos</p>
                      <p className="text-cyan-400 font-semibold text-sm">{fmtBRL(u.doctor_total)}</p>
                    </div>
                    <div className="bg-slate-900/30 rounded-lg p-2.5 border border-slate-700/30">
                      <p className="text-slate-500 text-xs mb-1">Pago Médicos</p>
                      <p className="text-emerald-400 font-semibold text-sm">{fmtBRL(u.doctor_paid)}</p>
                    </div>
                    <div className="bg-slate-900/30 rounded-lg p-2.5 border border-slate-700/30">
                      <p className="text-slate-500 text-xs mb-1">Pendente Médicos</p>
                      <p className={`font-semibold text-sm ${u.doctor_pending > 0 ? "text-rose-400" : "text-slate-500"}`}>
                        {fmtBRL(u.doctor_pending)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Status visual */}
                {u.system_pending === 0 && u.total_laudos > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-emerald-400 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Pagamentos ao sistema em dia</span>
                  </div>
                )}
                {u.system_pending > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-orange-400 text-xs">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Pagamento pendente ao sistema</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de médicos */}
      {selectedUnit && (
        <DoctorsModal
          unitId={selectedUnit.id}
          unitName={selectedUnit.name}
          referenceDate={referenceDate}
          onClose={() => setSelectedUnit(null)}
        />
      )}
    </FinanceShell>
  );
}
