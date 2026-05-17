/**
 * FinanceConfiguracao — Tela de configuração financeira por unidade
 * Bloco A: Dados financeiros da unidade (responsável, ciclo, preços padrão)
 * Bloco B: Tabela de médicos com valor/laudo e badge de status
 * Bloco C: Checklist de implantação (unitFinancialReadiness)
 * Bloco D: Ações de reprocessamento
 * Desenvolvimento StudioBarra7
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2, AlertCircle, Settings, CalendarDays,
  DollarSign, Users, RefreshCw, ChevronDown, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FinanceShell } from "./FinanceShell";
import { fmtBRL, PriceConfigModal, CycleConfigModal } from "./FinanceModals";

// ─── Bloco B: Linha de médico com preço configurável inline ──────────────────
function DoctorPriceRow({ doctor, unitId, onSaved }: {
  doctor: { doctor_user_id: number; doctor_name: string; price_per_report: number | null };
  unitId: number;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(doctor.price_per_report ?? ""));
  const utils = trpc.useUtils();
  const save = trpc.financeSimple.setDoctorPriceDirect.useMutation({
    onSuccess: () => {
      toast.success(`Preço de ${doctor.doctor_name} atualizado`);
      utils.financeSimple.listAllDoctorPrices.invalidate();
      utils.financeSimple.unitFinancialReadiness.invalidate();
      setEditing(false);
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const hasPrice = doctor.price_per_report !== null && doctor.price_per_report > 0;

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
          <span className="text-amber-400 text-xs font-bold">
            {(doctor.doctor_name ?? "?").charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-white truncate">{doctor.doctor_name}</p>
          {!editing && (
            <p className="text-xs text-slate-400">
              {hasPrice ? fmtBRL(doctor.price_per_report!) + "/laudo" : "Sem preço configurado"}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        {!hasPrice && !editing && (
          <span className="text-xs bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full">
            Sem preço
          </span>
        )}
        {hasPrice && !editing && (
          <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            Configurado
          </span>
        )}
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              type="number" min="0" step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-7 w-24 bg-slate-800 border-slate-600 text-white text-xs"
              placeholder="0.00"
              autoFocus
            />
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs bg-cyan-600 hover:bg-cyan-500"
              disabled={save.isPending}
              onClick={() => save.mutate({ unitId: unitId, doctorUserId: doctor.doctor_user_id, pricePerReport: String(parseFloat(price) || 0), startsAt: new Date().toISOString() })}
            >
              {save.isPending ? "..." : "Salvar"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-400" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button
            size="sm" variant="ghost"
            className="h-7 px-2.5 text-xs text-slate-400 hover:text-cyan-400"
            onClick={() => { setPrice(String(doctor.price_per_report ?? "")); setEditing(true); }}
          >
            Editar
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Bloco C: Checklist de aptidão ───────────────────────────────────────────
function ReadinessChecklist({ unitId }: { unitId: number }) {
  const { data, isLoading } = trpc.financeSimple.unitFinancialReadiness.useQuery({ unit_id: unitId });

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-8 bg-slate-800 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const items = [
    {
      label: "Unidade ativa",
      ok: data.is_active,
      detail: data.is_active ? "Ativa" : "Inativa — ative a unidade no Admin",
    },
    {
      label: "Responsável financeiro vinculado",
      ok: data.has_responsible,
      detail: data.has_responsible
        ? data.responsible_name ?? "Vinculado"
        : "Sem responsável — vincule em Admin → Unidades → Responsável",
    },
    {
      label: "Usuário vinculado ao responsável",
      ok: data.has_responsible_user,
      detail: data.has_responsible_user
        ? "Usuário vinculado"
        : "Sem usuário — vincule em Admin → Responsáveis → Usuários",
    },
    {
      label: "Ciclo de pagamento configurado",
      ok: data.has_cycle,
      detail: data.has_cycle
        ? `Dia ${data.cycle_start_day} ao dia ${data.cycle_end_day}`
        : "Sem ciclo — configure acima",
    },
    {
      label: "Preço de sistema configurado",
      ok: data.has_specific_system_price || data.has_default_system_price,
      detail: data.system_price
        ? `R$ ${data.system_price.toFixed(2)}/laudo`
        : "Sem preço de sistema — configure acima",
    },
    {
      label: "Médicos com preço configurado",
      ok: data.has_default_doctor_price || data.doctors_with_price > 0,
      detail: data.doctors_with_price > 0
        ? `${data.doctors_with_price} médico(s) com preço`
        : data.has_default_doctor_price
          ? "Usando preço padrão da unidade"
          : "Sem preço de médico — configure na tabela acima",
    },
    {
      label: "Eventos com precificação pendente",
      ok: data.pending_pricing_count === 0,
      detail: data.pending_pricing_count === 0
        ? "Todos os laudos precificados"
        : `${data.pending_pricing_count} laudo(s) com precificação pendente — use Reprocessar abaixo`,
    },
  ];

  const allOk = items.every(i => i.ok);

  return (
    <div className="space-y-1">
      {allOk && (
        <div className="mb-3 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <p className="text-emerald-300 text-sm font-medium">Unidade pronta para operação financeira</p>
        </div>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800/20 transition-colors">
          {item.ok ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className={`text-sm font-medium ${item.ok ? "text-white" : "text-rose-300"}`}>{item.label}</p>
            <p className={`text-xs mt-0.5 ${item.ok ? "text-slate-400" : "text-rose-400/80"}`}>{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function FinanceConfiguracao() {
  const { data: units, isLoading: unitsLoading } = trpc.financeSimple.unitSummary.useQuery({});
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showCycleModal, setShowCycleModal] = useState(false);
  const utils = trpc.useUtils();

  const selectedUnit = units?.find(u => u.unit_id === selectedUnitId);

  const { data: allDoctors, isLoading: doctorsLoading } = trpc.financeSimple.listAllDoctorPrices.useQuery(
    undefined,
    { enabled: selectedUnitId !== null }
  );
  const doctors = allDoctors?.filter(d => d.unit_id === selectedUnitId);

  const { data: readiness } = trpc.financeSimple.unitFinancialReadiness.useQuery(
    { unit_id: selectedUnitId! },
    { enabled: selectedUnitId !== null }
  );

  const reprocess = trpc.financeSimple.reprocessBillingEvents.useMutation({
    onSuccess: (result: any) => {
      toast.success(`Reprocessamento concluído: ${result?.updated ?? 0} evento(s) atualizados`);
      utils.financeSimple.unitFinancialReadiness.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <FinanceShell>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="h-5 w-5 text-cyan-400" />
            Configuração Financeira
          </h1>
          <p className="text-slate-400 text-sm mt-1">Configure responsáveis, ciclos, preços e verifique a aptidão de cada unidade.</p>
        </div>

        {/* Seletor de unidade */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <label className="text-xs text-slate-400 uppercase tracking-wide block mb-2">Selecionar Unidade</label>
          {unitsLoading ? (
            <div className="h-10 bg-slate-800 rounded animate-pulse" />
          ) : (
            <div className="relative">
              <select
                value={selectedUnitId ?? ""}
                onChange={(e) => setSelectedUnitId(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                <option value="">— Selecione uma unidade —</option>
                {units?.map(u => (
                  <option key={u.unit_id} value={u.unit_id}>{u.unit_name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>

        {selectedUnitId && selectedUnit && (
          <>
            {/* ── Bloco A: Dados financeiros da unidade ── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-cyan-400" />
                  <h2 className="text-sm font-semibold text-white">Dados Financeiros — {selectedUnit.unit_name}</h2>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs border-slate-600 text-slate-300 hover:text-white"
                    onClick={() => setShowPriceModal(true)}
                  >
                    <Settings className="h-3.5 w-3.5 mr-1.5" />
                    Preços Padrão
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs border-slate-600 text-slate-300 hover:text-white"
                    onClick={() => setShowCycleModal(true)}
                  >
                    <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                    Ciclo
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-800">
                {[
                  { label: "Responsável", value: readiness?.responsible_name ?? "Sem responsável", warn: !readiness?.has_responsible },
                  { label: "Ciclo", value: readiness?.has_cycle ? `Dia ${readiness.cycle_start_day}–${readiness.cycle_end_day}` : "Não configurado", warn: !readiness?.has_cycle },
                  { label: "Preço Sistema", value: readiness?.system_price ? `R$ ${readiness.system_price.toFixed(2)}` : "Não configurado", warn: !readiness?.has_specific_system_price && !readiness?.has_default_system_price },
                  { label: "Médicos c/ preço", value: readiness ? `${readiness.doctors_with_price}` : "—", warn: !readiness?.has_default_doctor_price && (readiness?.doctors_with_price ?? 0) === 0 },
                ].map((item, i) => (
                  <div key={i} className="bg-slate-900 px-4 py-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">{item.label}</p>
                    <p className={`text-sm font-medium mt-0.5 ${item.warn ? "text-rose-400" : "text-white"}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Bloco B: Médicos com preço ── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
                <Users className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">Médicos — Preço por Laudo</h2>
                {readiness && (readiness.doctors_with_price ?? 0) === 0 && !readiness.has_default_doctor_price && (
                  <span className="ml-auto text-xs bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full">
                    Nenhum médico configurado
                  </span>
                )}
              </div>
              {doctorsLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-800 rounded animate-pulse" />)}
                </div>
              ) : !doctors?.length ? (
                <div className="p-6 text-center text-slate-500 text-sm">
                  Nenhum médico com laudos nesta unidade no período.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {doctors.map((d: any) => (
                    <DoctorPriceRow
                      key={d.doctor_user_id}
                      doctor={d}
                      unitId={selectedUnitId}
                      onSaved={() => utils.financeSimple.listAllDoctorPrices.invalidate()}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Bloco C: Checklist de aptidão ── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Checklist de Implantação</h2>
              </div>
              <div className="py-2">
                <ReadinessChecklist unitId={selectedUnitId} />
              </div>
            </div>

            {/* ── Bloco D: Ações de reprocessamento ── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
                <RefreshCw className="h-4 w-4 text-violet-400" />
                <h2 className="text-sm font-semibold text-white">Ações de Diagnóstico</h2>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">Reprocessar eventos pendentes</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Recalcula preços dos laudos com <code className="text-violet-300 bg-slate-800 px-1 rounded">pricing_status ≠ ok</code> nesta unidade.
                      {readiness && readiness.pending_pricing_count > 0 && (
                        <span className="ml-1 text-rose-400 font-medium">{readiness.pending_pricing_count} pendente(s)</span>
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-violet-600/50 text-violet-400 hover:bg-violet-500/10 hover:border-violet-500 shrink-0"
                    disabled={!reprocess || reprocess.isPending || (readiness?.pending_pricing_count ?? 0) === 0}
                    onClick={() => reprocess?.mutate({ unit_id: selectedUnitId })}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${reprocess?.isPending ? "animate-spin" : ""}`} />
                    {reprocess?.isPending ? "Processando..." : "Reprocessar"}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {!selectedUnitId && !unitsLoading && (
          <div className="text-center py-16 text-slate-500">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Selecione uma unidade acima para ver e editar sua configuração financeira.</p>
          </div>
        )}
      </div>

      {/* Modais */}
      {showPriceModal && selectedUnit && (
        <PriceConfigModal
          unitId={selectedUnitId!}
          unitName={selectedUnit.unit_name}
          onClose={() => setShowPriceModal(false)}
        />
      )}
      {showCycleModal && selectedUnit && (
        <CycleConfigModal
          unitId={selectedUnitId!}
          unitName={selectedUnit.unit_name}
          onClose={() => setShowCycleModal(false)}
        />
      )}
    </FinanceShell>
  );
}
