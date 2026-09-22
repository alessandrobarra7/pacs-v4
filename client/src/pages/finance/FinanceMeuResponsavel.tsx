/**
 * FinanceMeuResponsavel — Painel do Responsável Financeiro
 * Exibe as unidades vinculadas, resumo de laudos/valores e drill-down de médicos
 * Desenvolvimento StudioBarra7
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Building2, ChevronLeft, ChevronRight, DollarSign, FileText,
  CheckCircle2, Clock, AlertCircle, X, Users, Settings, TrendingUp,
} from "lucide-react";
import { FinanceShell } from "./FinanceShell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
      <div className="bg-[var(--fin-panel)] border border-[var(--fin-line)] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fin-line)]">
          <div>
            <p className="text-[var(--fin-text)] font-semibold">{unitName}</p>
            <p className="text-[var(--fin-muted)] text-xs">Ciclo atual — médicos</p>
          </div>
          <button onClick={onClose} className="text-[var(--fin-muted)] hover:text-[var(--fin-text)] transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-[var(--fin-panel-2)] rounded animate-pulse" />)}
            </div>
          ) : !data?.length ? (
            <div className="p-8 text-center text-[var(--fin-muted-dim)] text-sm">Nenhum médico com laudos neste período.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--fin-line)]">
                  <th className="text-left px-6 py-3 text-[var(--fin-muted)] font-medium text-xs uppercase">Médico</th>
                  <th className="text-right px-4 py-3 text-[var(--fin-muted)] font-medium text-xs uppercase">Laudos</th>
                  <th className="text-right px-4 py-3 text-[var(--fin-muted)] font-medium text-xs uppercase">R$/Laudo</th>
                  <th className="text-right px-4 py-3 text-[var(--fin-muted)] font-medium text-xs uppercase">Total</th>
                  <th className="text-right px-4 py-3 text-[var(--fin-muted)] font-medium text-xs uppercase">Pago</th>
                  <th className="text-right px-6 py-3 text-[var(--fin-muted)] font-medium text-xs uppercase">Pendente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--fin-line-soft)]">
                {data.map((doc) => (
                  <tr key={doc.doctor_user_id} className="hover:bg-[var(--fin-panel-soft)] transition-colors">
                    <td className="px-6 py-3 text-[var(--fin-text)]">{doc.doctor_name}</td>
                    <td className="px-4 py-3 text-[var(--fin-muted)] text-right">{doc.total_laudos}</td>
                    <td className="px-4 py-3 text-[var(--fin-accent-soft)] text-right text-xs">
                      {(doc as any).price_per_report ? fmtBRL(Number((doc as any).price_per_report)) : <span className="text-[var(--fin-muted-dim)]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--fin-warn)] text-right font-medium">{fmtBRL(doc.doctor_total)}</td>
                    <td className="px-4 py-3 text-[var(--fin-success)] text-right">{fmtBRL(doc.doctor_paid)}</td>
                    <td className="px-6 py-3 text-right">
                      {doc.doctor_pending > 0 ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-[var(--fin-warn)] font-medium">{fmtBRL(doc.doctor_pending)}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs border-emerald-600 text-[var(--fin-success)] hover:bg-emerald-900/30"
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
                        <span className="inline-flex flex-col items-center gap-0.5 text-[var(--fin-success)] text-xs">
                          <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Quitado</span>
                          {doc.last_received_at && (
                            <span className="text-[var(--fin-muted-dim)] text-[10px]">{new Date(doc.last_received_at).toLocaleDateString('pt-BR')}</span>
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

// ─── NOVO (auditoria claude/modulo-repasse-preco-externo) ───────────────────
// Modal de preço de venda externa + calculadora de lucro da clínica, por unidade.
// Ambiente exclusivo do responsável financeiro / unit_admin — não diz respeito
// a admin_master nem a médico, conforme definido na coleta de requisitos.
export function ProfitModal({
  unitId, unitName, onClose,
}: {
  unitId: number; unitName: string; onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [editingLegendId, setEditingLegendId] = useState<number | null>(null);
  const [priceInput, setPriceInput] = useState("");

  const pricesQuery = trpc.financeSimple.listExternalSalePrices.useQuery({ unit_id: unitId });
  const profitQuery = trpc.financeSimple.unitProfitCalculator.useQuery({ unit_id: unitId });

  const setPrice = trpc.financeSimple.setExternalSalePrice.useMutation({
    onSuccess: () => {
      toast.success("Preço de venda externa atualizado.");
      utils.financeSimple.listExternalSalePrices.invalidate();
      utils.financeSimple.unitProfitCalculator.invalidate();
      setEditingLegendId(null);
      setPriceInput("");
    },
    onError: (e) => toast.error(e.message),
  });

  // CORREÇÃO (revisão independente Manus, 2026-09-17): by_exam agora pode ter mais de uma
  // linha para a mesma legenda quando o preço externo mudou dentro do ciclo (cada linha usa
  // o preço vigente no momento de cada laudo). Somamos aqui só para exibir um total por
  // legenda nesta tabela; o valor exato por vigência continua correto na origem.
  const profitByLegend = new Map<number, { units_sold: number; profit: number }>();
  for (const row of profitQuery.data?.by_exam ?? []) {
    const current = profitByLegend.get(row.exam_legend_id) ?? { units_sold: 0, profit: 0 };
    current.units_sold += row.units_sold;
    current.profit += row.profit;
    profitByLegend.set(row.exam_legend_id, current);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--fin-panel)] border border-[var(--fin-line)] rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fin-line)]">
          <div>
            <p className="text-[var(--fin-text)] font-semibold">{unitName}</p>
            <p className="text-[var(--fin-muted)] text-xs">Preço de venda externa e lucro — {profitQuery.data?.cycle_label ?? "ciclo atual"}</p>
          </div>
          <button onClick={onClose} className="text-[var(--fin-muted)] hover:text-[var(--fin-text)] transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {profitQuery.data && (
          <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-[var(--fin-line)]">
            <div className="bg-[var(--fin-panel-soft)] rounded-lg p-3">
              <p className="text-[var(--fin-muted-dim)] text-xs mb-1">Caixa recebido</p>
              <p className="text-[var(--fin-accent-soft)] font-semibold">{fmtBRL(profitQuery.data.totals.cash_received)}</p>
            </div>
            <div className="bg-[var(--fin-panel-soft)] rounded-lg p-3">
              <p className="text-[var(--fin-muted-dim)] text-xs mb-1">Repasse sistema</p>
              <p className="text-[var(--fin-warn)] font-semibold">{fmtBRL(profitQuery.data.totals.system_repasse)}</p>
            </div>
            <div className="bg-[var(--fin-panel-soft)] rounded-lg p-3">
              <p className="text-[var(--fin-muted-dim)] text-xs mb-1">Repasse médicos</p>
              <p className="text-[var(--fin-danger)] font-semibold">{fmtBRL(profitQuery.data.totals.doctor_repasse)}</p>
            </div>
            <div className="bg-[var(--fin-panel-soft)] rounded-lg p-3">
              <p className="text-[var(--fin-muted-dim)] text-xs mb-1">Lucro da clínica</p>
              <p className="text-[var(--fin-success)] font-semibold">{fmtBRL(profitQuery.data.totals.profit)}</p>
            </div>
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          {pricesQuery.isLoading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-[var(--fin-panel-2)] rounded animate-pulse" />)}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--fin-line)]">
                  <th className="text-left px-6 py-3 text-[var(--fin-muted)] font-medium text-xs uppercase">Exame</th>
                  <th className="text-right px-4 py-3 text-[var(--fin-muted)] font-medium text-xs uppercase">Preço externo</th>
                  <th className="text-right px-4 py-3 text-[var(--fin-muted)] font-medium text-xs uppercase">Vendidos no ciclo</th>
                  <th className="text-right px-4 py-3 text-[var(--fin-muted)] font-medium text-xs uppercase">Lucro no ciclo</th>
                  <th className="text-right px-6 py-3 text-[var(--fin-muted)] font-medium text-xs uppercase">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--fin-line-soft)]">
                {(pricesQuery.data ?? []).map((legend) => {
                  const profitRow = profitByLegend.get(legend.exam_legend_id);
                  const isEditing = editingLegendId === legend.exam_legend_id;
                  return (
                    <tr key={legend.exam_legend_id} className="hover:bg-[var(--fin-panel-soft)] transition-colors">
                      <td className="px-6 py-3 text-[var(--fin-text)]">{legend.exam_name}</td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input
                            autoFocus
                            type="number"
                            step="0.01"
                            min="0"
                            value={priceInput}
                            onChange={(e) => setPriceInput(e.target.value)}
                            className="w-24 bg-[var(--fin-panel-2)] border border-[var(--fin-line-strong)] rounded px-2 py-1 text-right text-[var(--fin-text)] text-xs"
                          />
                        ) : legend.configured ? (
                          <span className="text-[var(--fin-accent-soft)] font-medium">{fmtBRL(legend.price_external!)}</span>
                        ) : (
                          <span className="text-[var(--fin-muted-dim)] text-xs">Não configurado</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--fin-muted)] text-right">{profitRow?.units_sold ?? 0}</td>
                      <td className="px-4 py-3 text-right">
                        {profitRow ? (
                          <span className="text-[var(--fin-success)] font-semibold">{fmtBRL(profitRow.profit)}</span>
                        ) : (
                          <span className="text-[var(--fin-muted-dim)] text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              className="h-6 px-2 text-xs bg-emerald-700 hover:bg-emerald-600"
                              disabled={setPrice.isPending || !priceInput || Number(priceInput) <= 0}
                              onClick={() => setPrice.mutate({
                                unit_id: unitId,
                                exam_legend_id: legend.exam_legend_id,
                                price_external: Number(priceInput),
                              })}
                            >
                              Salvar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs border-[var(--fin-line-strong)] text-[var(--fin-muted)]"
                              onClick={() => { setEditingLegendId(null); setPriceInput(""); }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs border-[var(--fin-line-strong)] text-[var(--fin-muted)] hover:bg-[var(--fin-panel-2)]"
                            onClick={() => {
                              setEditingLegendId(legend.exam_legend_id);
                              setPriceInput(legend.configured ? String(legend.price_external) : "");
                            }}
                          >
                            {legend.configured ? "Editar" : "Configurar"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {(profitQuery.data?.unconfigured_exams.length ?? 0) > 0 && (
            <div className="mx-6 mb-4 mt-2 flex items-start gap-2 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                {profitQuery.data!.unconfigured_exams.length} exame(s) tiveram laudos emitidos neste ciclo mas ainda não têm preço de venda externa configurado — o lucro deles não entra no total até você configurar o preço.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanceMeuResponsavel() {
  const [, navigate] = useLocation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedUnit, setSelectedUnit] = useState<{ id: number; name: string } | null>(null);
  const [selectedProfitUnit, setSelectedProfitUnit] = useState<{ id: number; name: string } | null>(null);

  // Suporte a múltiplos responsáveis financeiros por conta (decisão de produto,
  // 2026-09-17): se a conta tiver mais de um vínculo, exige seleção explícita
  // antes de abrir qualquer dado financeiro — nunca escolhe "o primeiro" de
  // forma implícita. Com 0 ou 1 vínculo, comportamento idêntico ao de sempre.
  const [selectedResponsibleId, setSelectedResponsibleId] = useState<number | null>(null);
  const { data: myResponsibles } = trpc.financeSimple.listMyResponsibles.useQuery();
  const { data: profitHistory } = trpc.financeSimple.getResponsibleProfitHistory.useQuery(
    { financialResponsibleId: selectedResponsibleId ?? undefined },
    { enabled: myResponsibles !== undefined && !((myResponsibles?.length ?? 0) > 1 && selectedResponsibleId === null) },
  );
  const needsResponsibleSelection = (myResponsibles?.length ?? 0) > 1 && selectedResponsibleId === null;

  const referenceDate = new Date(year, month - 1, 15).toISOString();
  const { data, isLoading } = trpc.financeSimple.myResponsavelSummary.useQuery(
    { reference_date: referenceDate, financialResponsibleId: selectedResponsibleId ?? undefined },
    { enabled: myResponsibles !== undefined && !needsResponsibleSelection }
  );

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
            <h1 className="text-xl font-bold text-[var(--fin-text)]">Meu Painel Financeiro</h1>
            <p className="text-[var(--fin-muted)] text-sm mt-0.5">Unidades sob sua responsabilidade</p>
          </div>
          <div className="flex items-center gap-2">
            {myResponsibles && myResponsibles.length > 1 && (
              <select
                value={selectedResponsibleId ?? ""}
                onChange={(e) => setSelectedResponsibleId(e.target.value ? Number(e.target.value) : null)}
                className="bg-[var(--fin-panel-2)] border border-[var(--fin-line-strong)] text-[var(--fin-text)] rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— Selecione o responsável —</option>
                {myResponsibles.map((r) => (
                  <option key={r.id} value={r.id}>{r.trade_name || r.legal_name}</option>
                ))}
              </select>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/financeiro/configuracao')}
              className="border-[var(--fin-accent-border)] text-[var(--fin-accent-soft)] hover:bg-[var(--fin-accent-wash)]"
            >
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Preços
            </Button>
            <div className="flex items-center gap-2 bg-[var(--fin-panel-2)] rounded-lg px-3 py-2">
              <button onClick={prevMonth} className="text-[var(--fin-muted)] hover:text-[var(--fin-text)] transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-[var(--fin-text)] font-medium text-sm min-w-[120px] text-center">
                {MONTHS[month - 1]} {year}
              </span>
              <button onClick={nextMonth} className="text-[var(--fin-muted)] hover:text-[var(--fin-text)] transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {needsResponsibleSelection ? (
        <div className="bg-[var(--fin-panel-soft)] rounded-xl p-12 text-center border border-[var(--fin-line)]">
          <Building2 className="h-10 w-10 text-[var(--fin-muted-dim)] mx-auto mb-3" />
          <p className="text-[var(--fin-muted)] text-sm font-medium">Sua conta tem mais de um responsável financeiro vinculado.</p>
          <p className="text-[var(--fin-muted-dim)] text-xs mt-1">Selecione qual responsável você quer visualizar no menu acima antes de continuar.</p>
        </div>
        ) : (
        <>
        {/* Cards de resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-[var(--fin-panel-soft)] rounded-xl p-4 border border-[var(--fin-line)]">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-[var(--fin-muted)]" />
              <span className="text-[var(--fin-muted)] text-xs uppercase tracking-wide">Laudos</span>
            </div>
            <p className="text-2xl font-bold text-[var(--fin-text)]">{totalLaudos}</p>
          </div>
          <div className="bg-[var(--fin-panel-soft)] rounded-xl p-4 border border-[var(--fin-line)]">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-[var(--fin-muted)]" />
              <span className="text-[var(--fin-muted)] text-xs uppercase tracking-wide">Total ao Sistema</span>
            </div>
            <p className="text-2xl font-bold text-[var(--fin-warn)]">{fmtBRL(totalSystem)}</p>
          </div>
          <div className="bg-[var(--fin-panel-soft)] rounded-xl p-4 border border-[var(--fin-line)]">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--fin-success)]" />
              <span className="text-[var(--fin-muted)] text-xs uppercase tracking-wide">Pago ao Sistema</span>
            </div>
            <p className="text-2xl font-bold text-[var(--fin-success)]">{fmtBRL(totalSystemPaid)}</p>
          </div>
          <div className="bg-[var(--fin-panel-soft)] rounded-xl p-4 border border-[var(--fin-line)]">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-[var(--fin-warn)]" />
              <span className="text-[var(--fin-muted)] text-xs uppercase tracking-wide">Pendente ao Sistema</span>
            </div>
            <p className="text-2xl font-bold text-[var(--fin-warn)]">{fmtBRL(totalSystemPending)}</p>
          </div>
        </div>

        {/* Receita, custos e lucro por período — NOVO. Receita é ESTIMATIVA: aplica o
            preço externo vigente HOJE sobre a produção de cada ciclo já fechado, porque
            não existe registro histórico de receita externa (ver getResponsibleProfitHistory
            em server/db.ts). Por isso o rótulo do gráfico deixa isso explícito. */}
        {profitHistory && profitHistory.periods.length > 0 && (
          <div className="bg-[var(--fin-panel-soft)] rounded-xl border border-[var(--fin-line)] p-4 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-[var(--fin-accent-soft)]" />
              <h2 className="fin-head text-sm font-semibold text-[var(--fin-text)]">Receita, custos e lucro por período</h2>
            </div>
            <p className="text-[var(--fin-muted-dim)] text-xs mb-3">
              Receita estimada com o preço externo vigente hoje aplicado à produção de cada ciclo já fechado — não é o valor real cobrado na época, que o sistema não guarda.
            </p>
            <div className="h-56 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={profitHistory.periods} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--fin-line-soft)" vertical={false} />
                  <XAxis dataKey="cycle_label" tick={{ fill: "var(--fin-muted-dim)", fontSize: 10 }} axisLine={{ stroke: "var(--fin-line)" }} tickLine={false} />
                  <YAxis tick={{ fill: "var(--fin-muted-dim)", fontSize: 10 }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => fmtBRL(Number(v))} />
                  <Tooltip
                    formatter={(value: number) => fmtBRL(value)}
                    contentStyle={{ background: "var(--fin-panel)", border: "1px solid var(--fin-line)", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "var(--fin-text)" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "var(--fin-muted)" }} />
                  <Bar dataKey="estimated_revenue" name="Receita (estimada)" fill="var(--fin-accent)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="system_cost" name="Sistema" fill="var(--fin-warn)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="doctor_cost" name="Médicos" fill="var(--fin-danger)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="estimated_profit" name="Lucro (estimado)" fill="var(--fin-success)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Lista de unidades */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-[var(--fin-panel-soft)] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : units.length === 0 ? (
          <div className="bg-[var(--fin-panel-soft)] rounded-xl p-12 text-center border border-[var(--fin-line)]">
            <Building2 className="h-10 w-10 text-[var(--fin-muted-dim)] mx-auto mb-3" />
            <p className="text-[var(--fin-muted)] text-sm">Nenhuma unidade vinculada à sua conta.</p>
            <p className="text-[var(--fin-muted-dim)] text-xs mt-1">
              Solicite ao administrador que vincule uma unidade ao seu perfil.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {units.map((u) => (
              <div
                key={u.unit_id}
                className="bg-[var(--fin-panel-soft)] rounded-xl border border-[var(--fin-line)] p-4 hover:border-[var(--fin-line-strong)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--fin-panel-2)] flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-[var(--fin-muted)]" />
                    </div>
                    <div>
                      <p className="text-[var(--fin-text)] font-semibold">{u.unit_name}</p>
                      <p className="text-[var(--fin-muted)] text-xs">
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedProfitUnit({ id: u.unit_id, name: u.unit_name })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[var(--fin-line-strong)] text-[var(--fin-muted)] hover:bg-[var(--fin-panel-2)] transition-colors"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Preço externo / Lucro
                    </button>
                    <button
                      onClick={() => setSelectedUnit({ id: u.unit_id, name: u.unit_name })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[var(--fin-line-strong)] text-[var(--fin-muted)] hover:bg-[var(--fin-panel-2)] transition-colors"
                    >
                      <Users className="h-3.5 w-3.5" />
                      Ver médicos
                    </button>
                  </div>
                </div>

                {/* Barra de valores */}
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="bg-[var(--fin-panel-faint)] rounded-lg p-2.5">
                    <p className="text-[var(--fin-muted-dim)] text-xs mb-1">Total ao Sistema</p>
                    <p className="text-[var(--fin-warn)] font-semibold text-sm">{fmtBRL(u.system_total)}</p>
                  </div>
                  <div className="bg-[var(--fin-panel-faint)] rounded-lg p-2.5">
                    <p className="text-[var(--fin-muted-dim)] text-xs mb-1">Pago ao Sistema</p>
                    <p className="text-[var(--fin-success)] font-semibold text-sm">{fmtBRL(u.system_paid)}</p>
                  </div>
                  <div className="bg-[var(--fin-panel-faint)] rounded-lg p-2.5">
                    <p className="text-[var(--fin-muted-dim)] text-xs mb-1">Pendente ao Sistema</p>
                    <p className={`font-semibold text-sm ${u.system_pending > 0 ? "text-[var(--fin-warn)]" : "text-[var(--fin-muted-dim)]"}`}>
                      {fmtBRL(u.system_pending)}
                    </p>
                  </div>
                </div>

                {/* Barra de valores — médicos */}
                {(u.doctor_total > 0 || u.doctor_pending > 0) && (
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    <div className="bg-[var(--fin-panel-faint)] rounded-lg p-2.5 border border-[var(--fin-line-soft)]">
                      <p className="text-[var(--fin-muted-dim)] text-xs mb-1">Total Médicos</p>
                      <p className="text-[var(--fin-accent-soft)] font-semibold text-sm">{fmtBRL(u.doctor_total)}</p>
                    </div>
                    <div className="bg-[var(--fin-panel-faint)] rounded-lg p-2.5 border border-[var(--fin-line-soft)]">
                      <p className="text-[var(--fin-muted-dim)] text-xs mb-1">Pago Médicos</p>
                      <p className="text-[var(--fin-success)] font-semibold text-sm">{fmtBRL(u.doctor_paid)}</p>
                    </div>
                    <div className="bg-[var(--fin-panel-faint)] rounded-lg p-2.5 border border-[var(--fin-line-soft)]">
                      <p className="text-[var(--fin-muted-dim)] text-xs mb-1">Pendente Médicos</p>
                      <p className={`font-semibold text-sm ${u.doctor_pending > 0 ? "text-[var(--fin-danger)]" : "text-[var(--fin-muted-dim)]"}`}>
                        {fmtBRL(u.doctor_pending)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Status visual */}
                {u.system_pending === 0 && u.total_laudos > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-[var(--fin-success)] text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Pagamentos ao sistema em dia</span>
                  </div>
                )}
                {u.system_pending > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-[var(--fin-warn)] text-xs">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Pagamento pendente ao sistema</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </>
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

      {/* Modal de preço externo / lucro — NOVO (claude/modulo-repasse-preco-externo) */}
      {selectedProfitUnit && (
        <ProfitModal
          unitId={selectedProfitUnit.id}
          unitName={selectedProfitUnit.name}
          onClose={() => setSelectedProfitUnit(null)}
        />
      )}
    </FinanceShell>
  );
}
