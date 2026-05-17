/**
 * FinancePagamentos — Pagamentos por unidade e médico
 * Admin vê todas as unidades; unit_admin vê só a sua
 * Desenvolvimento StudioBarra7
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  Building2, Users, ChevronRight, ChevronDown, CheckCircle2,
  Clock, DollarSign, FileText, X
} from "lucide-react";
import { FinanceShell } from "./FinanceShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

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

// ─── Modal de laudos individuais ─────────────────────────────────────────────
function EventsModal({
  unitId, doctorId, doctorName, referenceDate, onClose,
}: {
  unitId: number; doctorId: number; doctorName: string;
  referenceDate: string; onClose: () => void;
}) {
  const { data, isLoading } = trpc.financeSimple.eventsByDoctorUnit.useQuery({
    unit_id: unitId, doctor_user_id: doctorId, reference_date: referenceDate,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <p className="text-white font-semibold">{doctorName}</p>
            <p className="text-slate-400 text-xs">Laudos individuais do ciclo</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-5 space-y-2">
              {[1,2,3,4].map(i => <div key={i} className="h-10 bg-slate-700/40 rounded animate-pulse" />)}
            </div>
          ) : !data?.length ? (
            <p className="text-slate-500 text-sm text-center py-8">Nenhum laudo encontrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-700/50">
                  <th className="px-4 py-2 text-left">Paciente</th>
                  <th className="px-4 py-2 text-left">Data</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2 text-center">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {data.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 text-white truncate max-w-[180px]">
                      {ev.patient_name ?? "—"}
                      {ev.modality_snapshot && (
                        <span className="ml-1.5 text-xs text-slate-500">{ev.modality_snapshot}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                      {fmtDate(ev.study_date ?? ev.signed_at)}
                    </td>
                    <td className="px-4 py-2.5 text-amber-400 text-right font-medium">
                      {ev.doctor_amount_due ? fmtBRL(Number(ev.doctor_amount_due)) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {ev.doctor_received_at ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {fmtDate(ev.doctor_received_at)}
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
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Linha de médico ──────────────────────────────────────────────────────────
function DoctorRow({
  doctor, unitId, referenceDate,
}: {
  doctor: {
    doctor_user_id: number; doctor_name: string;
    total_laudos: number; doctor_total: number;
    doctor_paid: number; doctor_pending: number;
    doctor_pending_count: number; last_received_at: Date | null;
  };
  unitId: number; referenceDate: string;
}) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [showModal, setShowModal] = useState(false);

  const markPaid = trpc.financeSimple.markDoctorPaid.useMutation({
    onSuccess: () => {
      toast.success(`Pagamento de ${doctor.doctor_name} marcado como pago`);
      utils.financeSimple.doctorSummaryByUnit.invalidate();
      utils.financeSimple.dashboard.invalidate();
      utils.financeSimple.unitSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const canMark = user?.role === "admin_master" || user?.role === "unit_admin" || user?.role === "responsavel_financeiro";
  const allPaid = doctor.doctor_pending_count === 0;

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-700/20 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0 text-xs font-bold text-slate-300">
            {doctor.doctor_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{doctor.doctor_name}</p>
            <p className="text-xs text-slate-400">
              {doctor.total_laudos} laudo{doctor.total_laudos !== 1 ? "s" : ""}
              {doctor.last_received_at && (
                <span className="ml-2 text-emerald-500">· pago em {fmtDate(doctor.last_received_at)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-amber-400">{fmtBRL(doctor.doctor_total)}</p>
            {!allPaid && (
              <p className="text-xs text-rose-400">{fmtBRL(doctor.doctor_pending)} pend.</p>
            )}
            {allPaid && (
              <p className="text-xs text-emerald-400 flex items-center gap-1 justify-end">
                <CheckCircle2 className="h-3 w-3" /> Pago
              </p>
            )}
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-2 py-1 transition-colors"
          >
            Ver laudos
          </button>
          {canMark && !allPaid && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500"
              disabled={markPaid.isPending}
              onClick={() =>
                markPaid.mutate({
                  unit_id: unitId,
                  doctor_user_id: doctor.doctor_user_id,
                  reference_date: referenceDate,
                })
              }
            >
              {markPaid.isPending ? "..." : "Marcar pago"}
            </Button>
          )}
        </div>
      </div>
      {showModal && (
        <EventsModal
          unitId={unitId}
          doctorId={doctor.doctor_user_id}
          doctorName={doctor.doctor_name}
          referenceDate={referenceDate}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ─── Bloco de unidade ─────────────────────────────────────────────────────────
function UnitBlock({
  unit, referenceDate,
}: {
  unit: {
    unit_id: number; unit_name: string; total_laudos: number;
    system_total: number; system_paid: number; system_pending: number;
    system_pending_count: number; doctor_total: number;
    doctor_paid: number; doctor_pending: number; doctor_pending_count: number;
  };
  referenceDate: string;
}) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(true);
  const utils = trpc.useUtils();

  const { data: doctors, isLoading } = trpc.financeSimple.doctorSummaryByUnit.useQuery(
    { unit_id: unit.unit_id, reference_date: referenceDate },
    { enabled: expanded }
  );

  const markSystemPaid = trpc.financeSimple.markSystemPaid.useMutation({
    onSuccess: () => {
      toast.success(`Pagamento ao sistema da ${unit.unit_name} marcado como pago`);
      utils.financeSimple.unitSummary.invalidate();
      utils.financeSimple.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
      {/* Header da unidade */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-700/20 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
          <div>
            <p className="text-white font-semibold">{unit.unit_name}</p>
            <p className="text-slate-400 text-xs">{unit.total_laudos} laudo{unit.total_laudos !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-slate-500">Sistema</p>
            <p className="text-sm font-semibold text-cyan-400">{fmtBRL(unit.system_total)}</p>
            {unit.system_pending > 0 && (
              <p className="text-xs text-rose-400">{fmtBRL(unit.system_pending)} pend.</p>
            )}
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-slate-500">Médicos</p>
            <p className="text-sm font-semibold text-amber-400">{fmtBRL(unit.doctor_total)}</p>
            {unit.doctor_pending > 0 && (
              <p className="text-xs text-rose-400">{fmtBRL(unit.doctor_pending)} pend.</p>
            )}
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500" />
          )}
        </div>
      </button>

      {/* Pagamento ao sistema */}
      {expanded && user?.role === "admin_master" && (
        <div className="px-5 py-3 bg-slate-900/40 border-t border-slate-700/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-cyan-400" />
            <span className="text-sm text-slate-300">
              Pagamento ao sistema: <span className="text-cyan-400 font-semibold">{fmtBRL(unit.system_total)}</span>
            </span>
          </div>
          {unit.system_pending_count > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-cyan-600/50 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500"
              disabled={markSystemPaid.isPending}
              onClick={() => markSystemPaid.mutate({ unit_id: unit.unit_id, reference_date: referenceDate })}
            >
              {markSystemPaid.isPending ? "..." : "Marcar sistema pago"}
            </Button>
          ) : (
            <span className="flex items-center gap-1 text-emerald-400 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" /> Sistema pago
            </span>
          )}
        </div>
      )}

      {/* Lista de médicos */}
      {expanded && (
        <div className="border-t border-slate-700/30">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1,2].map(i => <div key={i} className="h-10 bg-slate-700/30 rounded animate-pulse" />)}
            </div>
          ) : !doctors?.length ? (
            <p className="text-slate-500 text-sm text-center py-4">Nenhum médico com laudos neste período.</p>
          ) : (
            <div className="divide-y divide-slate-700/20">
              {doctors.map((doc) => (
                <DoctorRow
                  key={doc.doctor_user_id}
                  doctor={doc}
                  unitId={unit.unit_id}
                  referenceDate={referenceDate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function FinancePagamentos() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const referenceDate = new Date(year, month - 1, 15).toISOString();
  const { data: units, isLoading } = trpc.financeSimple.unitSummary.useQuery({ reference_date: referenceDate });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  return (
    <FinanceShell>
      <div className="p-6 space-y-5 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Pagamentos</h1>
            <p className="text-slate-400 text-sm mt-0.5">Gerencie pagamentos ao sistema e aos médicos</p>
          </div>
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
            <button onClick={prevMonth} className="text-slate-400 hover:text-white transition-colors px-1">‹</button>
            <span className="text-white font-medium text-sm min-w-[130px] text-center">
              {MONTHS[month - 1]} {year}
            </span>
            <button onClick={nextMonth} className="text-slate-400 hover:text-white transition-colors px-1">›</button>
          </div>
        </div>

        {/* Unidades */}
        {isLoading ? (
          <div className="space-y-4">
            {[1,2].map(i => <div key={i} className="h-24 bg-slate-800/40 rounded-xl animate-pulse" />)}
          </div>
        ) : !units?.length ? (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-10 text-center">
            <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Nenhum laudo registrado em {MONTHS[month-1]} {year}.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {units.map((u) => (
              <UnitBlock key={u.unit_id} unit={u} referenceDate={referenceDate} />
            ))}
          </div>
        )}
      </div>
    </FinanceShell>
  );
}
