/**
 * FinanceDashboard — Módulo financeiro simplificado
 * Nível 1: lista de Responsáveis Financeiros com totais
 * Nível 2: ao selecionar um responsável, mostra suas unidades
 * Nível 3: ao selecionar uma unidade, mostra médicos e ações de pagamento
 * Desenvolvimento StudioBarra7
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Building2, ChevronLeft, ChevronRight, DollarSign,
  FileText, CheckCircle2, AlertCircle, X, Settings, CalendarDays, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FinanceShell } from "./FinanceShell";
import { DoctorRow, fmtBRL, MONTHS } from "./FinanceModals";

// ─── Modal de configuração de preços padrão da unidade ─────────────────────────────────
function PriceConfigModal({ unitId, unitName, onClose }: { unitId: number; unitName: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.financeSimple.getUnitDefaultPrices.useQuery({ unit_id: unitId });
  const [sysPrice, setSysPrice] = useState("");
  const [docPrice, setDocPrice] = useState("");
  useEffect(() => {
    if (!isLoading && data) {
      setSysPrice(String(data.default_system_price ?? 0));
      setDocPrice(String(data.default_doctor_price ?? 0));
    }
  }, [data, isLoading]);
  const save = trpc.financeSimple.setUnitDefaultPrices.useMutation({
    onSuccess: () => {
      toast.success("Preços atualizados");
      utils.financeSimple.unitSummary.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <p className="text-white font-semibold">Preços Padrão</p>
            <p className="text-slate-400 text-xs">{unitName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-10 bg-slate-800 rounded animate-pulse" />
              <div className="h-10 bg-slate-800 rounded animate-pulse" />
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1.5">Preço Sistema (R$)</label>
                <Input type="number" min="0" step="0.01" value={sysPrice} onChange={(e) => setSysPrice(e.target.value)} placeholder="0.00" className="bg-slate-800 border-slate-600 text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1.5">Preço Médico (R$)</label>
                <Input type="number" min="0" step="0.01" value={docPrice} onChange={(e) => setDocPrice(e.target.value)} placeholder="0.00" className="bg-slate-800 border-slate-600 text-white" />
              </div>
            </>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 border-slate-600 text-slate-300" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white" disabled={save.isPending || isLoading} onClick={() => save.mutate({ unit_id: unitId, default_system_price: parseFloat(sysPrice) || 0, default_doctor_price: parseFloat(docPrice) || 0 })}>
              {save.isPending ? "Salvando..." : "Salvar Preços"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de configuração de ciclo de pagamento ─────────────────────────────
function CycleConfigModal({ unitId, unitName, onClose }: { unitId: number; unitName: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.financeSimple.getUnitCycle.useQuery({ unit_id: unitId });
  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");
  useEffect(() => {
    if (!isLoading && data) {
      setStartDay(String(data.start_day ?? 1));
      setEndDay(String(data.end_day ?? 31));
    }
  }, [data, isLoading]);
  const save = trpc.financeSimple.setUnitCycle.useMutation({
    onSuccess: () => {
      toast.success("Ciclo de pagamento atualizado");
      utils.financeSimple.unitSummary.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const startDayNum = parseInt(startDay) || 1;
  const endDayNum = parseInt(endDay) || 31;
  const crossesMonth = startDayNum > endDayNum;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <p className="text-white font-semibold">Ciclo de Pagamento</p>
            <p className="text-slate-400 text-xs">{unitName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-slate-400">Defina o dia de início e fim do ciclo mensal de pagamento desta unidade.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1.5">Dia de Início</label>
              <Input type="number" min="1" max="31" value={startDay} onChange={(e) => setStartDay(e.target.value)} placeholder="1" className="bg-slate-800 border-slate-600 text-white" />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1.5">Dia de Fim</label>
              <Input type="number" min="1" max="31" value={endDay} onChange={(e) => setEndDay(e.target.value)} placeholder="31" className="bg-slate-800 border-slate-600 text-white" />
            </div>
          </div>
          <div className={`rounded-lg px-4 py-3 text-xs ${crossesMonth ? "bg-violet-500/10 border border-violet-500/30 text-violet-300" : "bg-slate-800/60 border border-slate-700 text-slate-300"}`}>
            {crossesMonth ? (
              <span>Ciclo cruza meses: do dia <strong>{startDayNum}</strong> ao dia <strong>{endDayNum}</strong> do mês seguinte</span>
            ) : (
              <span>Ciclo mensal: do dia <strong>{startDayNum}</strong> ao dia <strong>{endDayNum}</strong> do mesmo mês</span>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 border-slate-600 text-slate-300" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1 bg-violet-600 hover:bg-violet-500 text-white" disabled={save.isPending} onClick={() => save.mutate({ unit_id: unitId, start_day: startDayNum, end_day: endDayNum })}>
              {save.isPending ? "Salvando..." : "Salvar Ciclo"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Painel de detalhes da unidade selecionada ────────────────────────────────
function UnitDetail({ unit, referenceDate }: { unit: any; referenceDate: string }) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showCycleModal, setShowCycleModal] = useState(false);
  const { data: doctors, isLoading } = trpc.financeSimple.doctorSummaryByUnit.useQuery({ unit_id: unit.unit_id, reference_date: referenceDate });
  const markSystemPaid = trpc.financeSimple.markSystemPaid.useMutation({
    onSuccess: () => {
      toast.success(`Pagamento ao sistema da ${unit.unit_name} marcado como pago`);
      utils.financeSimple.unitSummary.invalidate();
      utils.financeSimple.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const isAdmin = user?.role === "admin_master";
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/50 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold text-base">{unit.unit_name}</h2>
            <p className="text-slate-400 text-xs mt-0.5">{unit.total_laudos} laudo{unit.total_laudos !== 1 ? "s" : ""} no período</p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCycleModal(true)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-violet-400 transition-colors border border-slate-700 hover:border-violet-500/50 rounded-lg px-2.5 py-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Ciclo
              </button>
              <button onClick={() => setShowPriceModal(true)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors border border-slate-700 hover:border-cyan-500/50 rounded-lg px-2.5 py-1.5">
                <Settings className="h-3.5 w-3.5" /> Preços
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="bg-slate-800/50 rounded-lg px-3 py-2">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Sistema</p>
            <p className="text-sm font-bold text-cyan-400">{fmtBRL(unit.system_total)}</p>
            {unit.system_pending > 0 ? <p className="text-xs text-rose-400">{fmtBRL(unit.system_pending)} pend.</p> : unit.system_total > 0 ? <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Pago</p> : null}
          </div>
          <div className="bg-slate-800/50 rounded-lg px-3 py-2">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Médicos</p>
            <p className="text-sm font-bold text-amber-400">{fmtBRL(unit.doctor_total)}</p>
            {unit.doctor_pending > 0 && <p className="text-xs text-rose-400">{fmtBRL(unit.doctor_pending)} pend.</p>}
          </div>
          <div className="bg-slate-800/50 rounded-lg px-3 py-2">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Laudos</p>
            <p className="text-sm font-bold text-blue-400">{unit.total_laudos}</p>
            <p className="text-xs text-slate-500">{unit.doctor_pending_count > 0 ? `${unit.doctor_pending_count} méd. pend.` : "Tudo pago"}</p>
          </div>
        </div>
        {isAdmin && unit.system_pending_count > 0 && (
          <div className="mt-3 flex items-center justify-between bg-cyan-500/5 border border-cyan-500/20 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-cyan-400" />
              <span className="text-sm text-slate-300">Pagamento ao sistema: <span className="text-cyan-400 font-semibold">{fmtBRL(unit.system_total)}</span></span>
            </div>
            <Button size="sm" variant="outline" className="text-xs border-cyan-600/50 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500" disabled={markSystemPaid.isPending} onClick={() => markSystemPaid.mutate({ unit_id: unit.unit_id, reference_date: referenceDate })}>
              {markSystemPaid.isPending ? "..." : "Marcar sistema pago"}
            </Button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-3 border-b border-slate-800">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> Médicos</p>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-800/40 rounded-lg animate-pulse" />)}</div>
        ) : !doctors?.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-8 w-8 text-slate-700 mb-2" />
            <p className="text-slate-500 text-sm">Nenhum médico com laudos neste período.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {doctors.map((doc) => <DoctorRow key={doc.doctor_user_id} doctor={doc} unitId={unit.unit_id} referenceDate={referenceDate} />)}
          </div>
        )}
      </div>
      {showPriceModal && <PriceConfigModal unitId={unit.unit_id} unitName={unit.unit_name} onClose={() => setShowPriceModal(false)} />}
      {showCycleModal && <CycleConfigModal unitId={unit.unit_id} unitName={unit.unit_name} onClose={() => setShowCycleModal(false)} />}
    </div>
  );
}

// helper: gera ISO string para o primeiro dia do mês/ano selecionado
function toRefDate(year: number, month: number): string {
  return new Date(year, month - 1, 1).toISOString();
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanceDashboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  // Nível 1: responsável selecionado
  const [selectedResponsible, setSelectedResponsible] = useState<{ id: number | null; name: string } | null>(null);
  // Nível 2: unidade selecionada
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);

  const referenceDate = toRefDate(year, month);

  // Dados nível 1: resumo por responsável
  const { data: responsibles, isLoading: loadingResp } = trpc.financeSimple.responsibleSummary.useQuery({ reference_date: referenceDate });

  // Dados nível 2: unidades do responsável selecionado
  const { data: units, isLoading: loadingUnits } = trpc.financeSimple.unitSummary.useQuery(
    { reference_date: referenceDate, responsible_id: selectedResponsible?.id ?? undefined },
    { enabled: selectedResponsible !== null }
  );

  const selectedUnit = units?.find(u => u.unit_id === selectedUnitId) ?? null;

  function prevMonth() {
    setSelectedUnitId(null);
    if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1);
  }
  function nextMonth() {
    setSelectedUnitId(null);
    if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1);
  }

  return (
    <FinanceShell>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Barra de mês */}
        <div className="shrink-0 border-b border-slate-800 bg-slate-900/50 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedResponsible && (
              <button
                onClick={() => { setSelectedResponsible(null); setSelectedUnitId(null); }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-white font-semibold text-sm">
              {selectedResponsible
                ? selectedResponsible.id === null ? "Sem Responsável" : selectedResponsible.name
                : "Dashboard Financeiro"}
            </h2>
          </div>
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
            <button onClick={prevMonth} className="text-slate-400 hover:text-white transition-colors px-1"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-white font-medium text-sm min-w-[130px] text-center">{MONTHS[month - 1]} {year}</span>
            <button onClick={nextMonth} className="text-slate-400 hover:text-white transition-colors px-1"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Nível 1: lista de responsáveis */}
        {!selectedResponsible && (
          <div className="flex-1 overflow-y-auto p-5">
            {loadingResp ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-slate-800/40 rounded-xl animate-pulse" />)}</div>
            ) : !responsibles?.length ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <DollarSign className="h-12 w-12 text-slate-700 mb-3" />
                <p className="text-slate-400 text-sm">Nenhum laudo faturado em {MONTHS[month-1]} {year}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {responsibles.map((r) => {
                  const hasPending = r.system_pending > 0 || r.doctor_pending > 0;
                  return (
                    <button
                      key={r.responsible_id ?? "none"}
                      onClick={() => setSelectedResponsible({ id: r.responsible_id, name: r.responsible_name })}
                      className="w-full text-left bg-slate-800/60 border border-slate-700 hover:border-cyan-500/40 hover:bg-slate-800 rounded-xl p-4 transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-white font-semibold">{r.responsible_name}</p>
                          <p className="text-slate-400 text-xs mt-0.5">
                            {r.unit_count} unidade{r.unit_count !== 1 ? "s" : ""} · {r.total_laudos} laudos
                          </p>
                        </div>
                        {hasPending && <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-900/60 rounded-lg p-2.5">
                          <p className="text-xs text-slate-500 mb-1">Sistema</p>
                          <p className="text-sm font-semibold text-cyan-400">{fmtBRL(r.system_total)}</p>
                          {r.system_pending > 0 && <p className="text-xs text-rose-400">{fmtBRL(r.system_pending)} pend.</p>}
                        </div>
                        <div className="bg-slate-900/60 rounded-lg p-2.5">
                          <p className="text-xs text-slate-500 mb-1">Médicos</p>
                          <p className="text-sm font-semibold text-amber-400">{fmtBRL(r.doctor_total)}</p>
                          {r.doctor_pending > 0 && <p className="text-xs text-amber-500">{fmtBRL(r.doctor_pending)} pend.</p>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Nível 2: unidades do responsável + detalhe */}
        {selectedResponsible && (
          <div className="flex flex-1 overflow-hidden">
            {/* Coluna esquerda — unidades */}
            <div className="w-64 shrink-0 border-r border-slate-800 overflow-y-auto bg-slate-900/50">
              <div className="px-4 py-3 border-b border-slate-800">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Unidades</p>
              </div>
              {loadingUnits ? (
                <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-800/40 rounded-lg animate-pulse" />)}</div>
              ) : !units?.length ? (
                <div className="p-4 text-center text-slate-500 text-xs">Nenhum laudo em {MONTHS[month-1]} {year}</div>
              ) : (
                <div className="p-2 space-y-1">
                  {units.map((u) => {
                    const isSelected = selectedUnitId === u.unit_id;
                    const hasPending = u.system_pending > 0 || u.doctor_pending > 0;
                    return (
                      <button key={u.unit_id} onClick={() => setSelectedUnitId(u.unit_id)} className={`w-full text-left rounded-lg px-3 py-2.5 transition-all ${isSelected ? "bg-cyan-500/20 border border-cyan-500/40" : "hover:bg-slate-800/60 border border-transparent"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className={`text-sm font-medium truncate ${isSelected ? "text-cyan-300" : "text-white"}`}>{u.unit_name}</p>
                          {hasPending && <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 ml-1" />}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-400">{u.total_laudos} laudos</span>
                          {u.system_pending > 0 && <span className="text-rose-400">S: {fmtBRL(u.system_pending)}</span>}
                          {u.doctor_pending > 0 && <span className="text-amber-400">M: {fmtBRL(u.doctor_pending)}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Corpo direito — detalhe da unidade */}
            <div className="flex-1 overflow-hidden">
              {!selectedUnit ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Building2 className="h-12 w-12 text-slate-700 mb-3" />
                  <p className="text-slate-500 text-sm">Selecione uma unidade para ver os detalhes</p>
                </div>
              ) : (
                <UnitDetail unit={selectedUnit} referenceDate={referenceDate} />
              )}
            </div>
          </div>
        )}
      </div>
    </FinanceShell>
  );
}
