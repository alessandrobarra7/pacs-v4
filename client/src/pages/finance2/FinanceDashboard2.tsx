/**
 * FinanceDashboard2 — Módulo financeiro simplificado
 * Layout: coluna esquerda = lista de unidades | corpo direito = médicos, valores, transações
 * Desenvolvimento StudioBarra7
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Building2, ChevronLeft, ChevronRight, DollarSign,
  FileText, CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLocation } from "wouter";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Modal de laudos individuais ─────────────────────────────────────────────
function LaudosModal({
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
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
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
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">Data</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs uppercase">Valor</th>
                  <th className="text-right px-6 py-3 text-slate-400 font-medium text-xs uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {data.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-3 text-white truncate max-w-[200px]">{ev.patient_name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {ev.createdAt ? new Date(ev.createdAt).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-3 text-amber-400 text-right font-medium">
                      {ev.doctor_amount_due ? fmtBRL(Number(ev.doctor_amount_due)) : "—"}
                    </td>
                    <td className="px-6 py-3 text-right">
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

// ─── Linha de médico ──────────────────────────────────────────────────────────
function DoctorRow({
  doctor, unitId, year, month
}: {
  doctor: any; unitId: number; year: number; month: number;
}) {
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

  const isPaid = doctor.doctor_pending <= 0;

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
            <p className="text-xs text-slate-400">{doctor.total_laudos} laudo{doctor.total_laudos !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-amber-400">{fmtBRL(doctor.doctor_total)}</p>
            {!isPaid && (
              <p className="text-xs text-rose-400">{fmtBRL(doctor.doctor_pending)} pend.</p>
            )}
            {isPaid && (
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
          {!isPaid ? (
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-amber-600/50 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500 h-7 px-2.5"
              disabled={markPaid.isPending}
              onClick={() => markPaid.mutate({ doctor_user_id: doctor.doctor_user_id, unit_id: unitId, year, month })}
            >
              {markPaid.isPending ? "..." : "Marcar pago"}
            </Button>
          ) : (
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

// ─── Painel de detalhes da unidade selecionada ────────────────────────────────
function UnitDetail({
  unit, year, month
}: {
  unit: any; year: number; month: number;
}) {
  const utils = trpc.useUtils();
  const { user } = useAuth();

  const { data: doctors, isLoading } = trpc.financeSimple.doctorSummaryByUnit.useQuery({
    unit_id: unit.unit_id, year, month
  });

  const markSystemPaid = trpc.financeSimple.markSystemPaid.useMutation({
    onSuccess: () => {
      toast.success("Pagamento ao sistema marcado como pago");
      utils.financeSimple.unitSummary.invalidate();
      utils.financeSimple.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const systemPaid = unit.system_pending <= 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header da unidade */}
      <div className="px-6 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{unit.unit_name}</h2>
            <p className="text-slate-400 text-xs">{unit.total_laudos} laudos em {MONTHS[month-1]} {year}</p>
          </div>
        </div>

        {/* Cards de resumo da unidade */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Deve ao Sistema</p>
            <p className="text-xl font-bold text-cyan-400">{fmtBRL(unit.system_total)}</p>
            {!systemPaid && (
              <p className="text-xs text-rose-400 mt-0.5">{fmtBRL(unit.system_pending)} pendente</p>
            )}
            {systemPaid && (
              <p className="text-xs text-emerald-400 mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Quitado
              </p>
            )}
          </div>
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Deve aos Médicos</p>
            <p className="text-xl font-bold text-amber-400">{fmtBRL(unit.doctor_total)}</p>
            {unit.doctor_pending > 0 && (
              <p className="text-xs text-rose-400 mt-0.5">{fmtBRL(unit.doctor_pending)} pendente</p>
            )}
            {unit.doctor_pending <= 0 && (
              <p className="text-xs text-emerald-400 mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Quitado
              </p>
            )}
          </div>
        </div>

        {/* Botão marcar sistema pago */}
        {user?.role === "admin_master" && (
          <div className="mt-3 flex items-center justify-between bg-slate-800/60 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-cyan-400" />
              <span className="text-sm text-slate-300">
                Pagamento ao sistema: <span className="text-cyan-400 font-semibold">{fmtBRL(unit.system_total)}</span>
              </span>
            </div>
            {!systemPaid ? (
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-cyan-600/50 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500 h-7"
                disabled={markSystemPaid.isPending}
                onClick={() => markSystemPaid.mutate({ unit_id: unit.unit_id, year, month })}
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
      </div>

      {/* Lista de médicos */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-3 border-b border-slate-700/30">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Médicos participantes</p>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-800/40 rounded animate-pulse" />)}
          </div>
        ) : !doctors?.length ? (
          <div className="p-8 text-center">
            <FileText className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">Nenhum médico com laudos neste período.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/20">
            {doctors.map((doc) => (
              <DoctorRow
                key={doc.doctor_user_id}
                doctor={doc}
                unitId={unit.unit_id}
                year={year}
                month={month}
              />
            ))}
          </div>
        )}
      </div>

      {/* Totais no rodapé */}
      <div className="px-6 py-3 border-t border-slate-700/50 bg-slate-900/60">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Total geral da unidade</span>
          <span className="font-semibold text-white">
            {fmtBRL(unit.system_total + unit.doctor_total)}
          </span>
        </div>
        {(unit.system_pending > 0 || unit.doctor_pending > 0) && (
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-rose-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Total pendente
            </span>
            <span className="text-rose-400 font-semibold">
              {fmtBRL(unit.system_pending + unit.doctor_pending)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function FinanceDashboard2() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [, navigate] = useLocation();

  const { data: units, isLoading } = trpc.financeSimple.unitSummary.useQuery({ year, month });
  const { data: dashData } = trpc.financeSimple.dashboard.useQuery({ year, month });

  // Seleciona a primeira unidade automaticamente quando carrega
  const selectedUnit = units?.find(u => u.unit_id === selectedUnitId) ?? units?.[0] ?? null;

  function prevMonth() {
    setSelectedUnitId(null);
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    setSelectedUnitId(null);
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar ao PACS
          </button>
          <span className="text-slate-700">|</span>
          <h1 className="text-white font-semibold">Financeiro</h1>
        </div>
        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
          <button onClick={prevMonth} className="text-slate-400 hover:text-white transition-colors px-1">‹</button>
          <span className="text-white font-medium text-sm min-w-[130px] text-center">
            {MONTHS[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="text-slate-400 hover:text-white transition-colors px-1">›</button>
        </div>
      </div>

      {/* Cards de resumo global */}
      <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-slate-800 shrink-0">
        {[
          { label: "Laudos", value: String(dashData?.total_laudos ?? 0), color: "text-blue-400" },
          { label: "Sistema total", value: fmtBRL(dashData?.system_total ?? 0), color: "text-cyan-400",
            sub: dashData?.system_pending ? `${fmtBRL(dashData.system_pending)} pend.` : undefined },
          { label: "Médicos total", value: fmtBRL(dashData?.doctor_total ?? 0), color: "text-amber-400",
            sub: dashData?.doctor_pending ? `${fmtBRL(dashData.doctor_pending)} pend.` : undefined },
          { label: "Pendências", value: String((dashData?.system_pending_count ?? 0) + (dashData?.doctor_pending_count ?? 0)),
            color: "text-rose-400",
            sub: `${dashData?.system_pending_count ?? 0} sist. · ${dashData?.doctor_pending_count ?? 0} méd.` },
        ].map(c => (
          <div key={c.label} className="bg-slate-800/50 rounded-lg px-4 py-2.5">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
            {c.sub && <p className="text-xs text-slate-500">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* Layout duas colunas */}
      <div className="flex flex-1 overflow-hidden">
        {/* Coluna esquerda — lista de unidades */}
        <div className="w-64 shrink-0 border-r border-slate-800 overflow-y-auto bg-slate-900/50">
          <div className="px-4 py-3 border-b border-slate-800">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Unidades</p>
          </div>
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[1,2,3,4].map(i => <div key={i} className="h-14 bg-slate-800/40 rounded-lg animate-pulse" />)}
            </div>
          ) : !units?.length ? (
            <div className="p-4 text-center text-slate-500 text-xs">
              Nenhum laudo em {MONTHS[month-1]} {year}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {units.map((u) => {
                const isSelected = (selectedUnit?.unit_id === u.unit_id);
                const hasPending = u.system_pending > 0 || u.doctor_pending > 0;
                return (
                  <button
                    key={u.unit_id}
                    onClick={() => setSelectedUnitId(u.unit_id)}
                    className={`w-full text-left rounded-lg px-3 py-2.5 transition-all ${
                      isSelected
                        ? "bg-cyan-500/20 border border-cyan-500/40"
                        : "hover:bg-slate-800/60 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className={`text-sm font-medium truncate ${isSelected ? "text-cyan-300" : "text-white"}`}>
                        {u.unit_name}
                      </p>
                      {hasPending && (
                        <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 ml-1" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">{u.total_laudos} laudos</span>
                      {u.system_pending > 0 && (
                        <span className="text-rose-400">S: {fmtBRL(u.system_pending)}</span>
                      )}
                      {u.doctor_pending > 0 && (
                        <span className="text-amber-400">M: {fmtBRL(u.doctor_pending)}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Corpo direito — detalhes da unidade selecionada */}
        <div className="flex-1 overflow-hidden">
          {!selectedUnit ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Building2 className="h-12 w-12 text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm">Selecione uma unidade para ver os detalhes</p>
            </div>
          ) : (
            <UnitDetail unit={selectedUnit} year={year} month={month} />
          )}
        </div>
      </div>
    </div>
  );
}
