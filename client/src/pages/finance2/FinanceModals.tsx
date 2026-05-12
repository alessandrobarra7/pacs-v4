/**
 * FinanceModals — Componentes compartilhados do módulo financeiro
 * LaudosModal e DoctorRow usados por FinanceDashboard2 e FinancePagamentos
 * Desenvolvimento StudioBarra7
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { CheckCircle2, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

export function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

// ─── Modal de laudos individuais ─────────────────────────────────────────────
export function LaudosModal({
  doctorUserId, unitId, year, month, doctorName, onClose
}: {
  doctorUserId: number; unitId: number; year: number; month: number;
  doctorName: string; onClose: () => void;
}) {
  const { data, isLoading } = trpc.financeSimple.eventsByDoctorUnit.useQuery({
    doctor_user_id: doctorUserId, unit_id: unitId, year, month
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <p className="text-white font-semibold">{doctorName}</p>
            <p className="text-slate-400 text-xs">{MONTHS[month-1]} {year} — laudos individuais</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-10 bg-slate-800 rounded animate-pulse" />)}
            </div>
          ) : !data?.length ? (
            <div className="p-8 text-center text-slate-500 text-sm">Nenhum laudo encontrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-6 py-3 text-slate-400 font-medium text-xs uppercase">Paciente</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">Modalidade</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">Data</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs uppercase">Valor</th>
                  <th className="text-right px-6 py-3 text-slate-400 font-medium text-xs uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {data.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-3 text-white truncate max-w-[180px]">{ev.patient_name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {(ev as any).modality_snapshot ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {fmtDate((ev as any).study_date ?? ev.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-amber-400 text-right font-medium">
                      {ev.doctor_amount_due ? fmtBRL(Number(ev.doctor_amount_due)) : "—"}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {ev.doctor_received_at ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {fmtDate(ev.doctor_received_at)}
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

// ─── Linha de médico (compartilhada) ─────────────────────────────────────────
export function DoctorRow({
  doctor, unitId, year, month
}: {
  doctor: {
    doctor_user_id: number; doctor_name: string;
    total_laudos: number; doctor_total: number;
    doctor_paid: number; doctor_pending: number;
    doctor_pending_count: number; last_received_at?: Date | null;
  };
  unitId: number; year: number; month: number;
}) {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const utils = trpc.useUtils();
  const markPaid = trpc.financeSimple.markDoctorPaid.useMutation({
    onSuccess: () => {
      toast.success(`Pagamento de ${doctor.doctor_name} marcado como pago`);
      utils.financeSimple.doctorSummaryByUnit.invalidate();
      utils.financeSimple.unitSummary.invalidate();
      utils.financeSimple.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const canMark = user?.role === "admin_master" || user?.role === "unit_admin" || user?.role === "responsavel_financeiro";
  const allPaid = (doctor.doctor_pending_count ?? 0) === 0;
  return (
    <>
      <div className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/30 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <span className="text-amber-400 text-xs font-bold">
              {(doctor.doctor_name ?? "?").charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{doctor.doctor_name ?? "Médico"}</p>
            <p className="text-xs text-slate-400">
              {doctor.total_laudos} laudo{doctor.total_laudos !== 1 ? "s" : ""}
              {doctor.last_received_at && (
                <span className="ml-2 text-emerald-500">· pago em {fmtDate(doctor.last_received_at)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <div className="text-right">
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
            className="text-xs text-slate-400 hover:text-cyan-400 transition-colors underline underline-offset-2"
          >
            Ver laudos
          </button>
          {canMark && !allPaid && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500 h-7 px-2.5"
              disabled={markPaid.isPending}
              onClick={() => markPaid.mutate({
                doctor_user_id: doctor.doctor_user_id,
                unit_id: unitId,
                year,
                month,
              })}
            >
              {markPaid.isPending ? "..." : "Marcar pago"}
            </Button>
          )}
          {allPaid && (
            <span className="text-xs text-emerald-400 w-[80px] text-center">✓ Quitado</span>
          )}
        </div>
      </div>
      {showModal && (
        <LaudosModal
          doctorUserId={doctor.doctor_user_id}
          unitId={unitId}
          year={year}
          month={month}
          doctorName={doctor.doctor_name ?? "Médico"}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
