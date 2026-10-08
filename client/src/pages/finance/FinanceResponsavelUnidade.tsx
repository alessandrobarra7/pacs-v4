/**
 * FinanceResponsavelUnidade — Detalhe de uma unidade para o responsável financeiro
 * NOVO (claude/painel-responsavel-financeiro-detalhe-unidade, 2026-10-08).
 * CORRIGIDO (2026-10-08, parecer de bloqueio da Manus) — ver comentários
 * "BLOQUEIO N" abaixo, um por achado do parecer.
 *
 * Pedido explícito do Alessandro (produto): ao "entrar numa unidade" o responsável
 * deve ver, numa única tela, (1) quanto a unidade deve ao Sistema no ciclo — total,
 * já pago, pendente — independente de qual médico gerou; (2) um painel com todos os
 * médicos envolvidos, quanto cada um laudou e quanto a unidade deve a cada um, pelo
 * preço configurado para aquela unidade; (3) um painel de preço externo, onde o
 * responsável configura quanto cobra do paciente fora do sistema, com o lucro
 * calculado como preço externo − valor do médico − valor do sistema.
 *
 * Esta tela não inventa nenhum dado novo além do que já existe no backend — ver
 * handoff em docs/auditoria-claude/ para o mapeamento completo de qual procedure
 * alimenta qual bloco.
 */
import { useMemo, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, Building2, AlertCircle, TrendingUp, Users,
} from "lucide-react";
import { FinanceShell } from "./FinanceShell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const MODALITIES = ["CT", "CR", "MR", "US"] as const;
const MODALITY_LABEL: Record<string, string> = {
  CT: "Tomografia (CT)",
  CR: "Raio-X (CR)",
  MR: "Ressonância (MR)",
  US: "Ultrassom (US)",
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
/** BLOQUEIO 2/3 (parecer Manus): lê o contexto (responsável selecionado, ciclo em
 * exibição) que a tela de origem embute na query string — sem isso, uma conta com
 * mais de um responsável vinculado perdia a seleção ao entrar numa unidade (o
 * backend corretamente recusava com BAD_REQUEST), e qualquer navegação perdia o
 * mês/ano escolhido, mostrando sempre o ciclo corrente do instante do clique. */
function useUnitDetailContext() {
  const search = useSearch();
  return useMemo(() => {
    const params = new URLSearchParams(search);
    const financialResponsibleIdRaw = params.get("financialResponsibleId");
    const financialResponsibleId = financialResponsibleIdRaw && /^\d+$/.test(financialResponsibleIdRaw)
      ? Number(financialResponsibleIdRaw)
      : undefined;
    const referenceDateRaw = params.get("reference_date");
    const referenceDate = referenceDateRaw && !Number.isNaN(new Date(referenceDateRaw).getTime())
      ? referenceDateRaw
      : undefined;
    return { financialResponsibleId, referenceDate };
  }, [search]);
}

type CfgTab = "sistema" | "medicos" | "externo";

export default function FinanceResponsavelUnidade() {
  const { unitId: unitIdParam } = useParams<{ unitId: string }>();
  const unitIdRaw = Number(unitIdParam);
  // PONTO ADICIONAL 2 (parecer Manus): Number.isFinite aceitava negativo/fracionário.
  const unitId = Number.isInteger(unitIdRaw) && unitIdRaw > 0 ? unitIdRaw : null;
  const { financialResponsibleId, referenceDate } = useUnitDetailContext();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [cfgTab, setCfgTab] = useState<CfgTab>("sistema");
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [modalityPriceInput, setModalityPriceInput] = useState<Record<string, string>>({});
  const [externalPriceInput, setExternalPriceInput] = useState<Record<number, string>>({});

  // BLOQUEIO 2: financialResponsibleId do contexto é repassado explicitamente —
  // o backend (resolveResponsibleContext) valida que pertence ao usuário logado e
  // devolve FORBIDDEN se alguém adulterar isso na URL manualmente.
  const { data: summary, isLoading: loadingSummary, isError: summaryError, error: summaryErrorObj } =
    trpc.financeSimple.myResponsavelSummary.useQuery({ financialResponsibleId, reference_date: referenceDate });
  const unit = useMemo(() => summary?.units.find((u) => u.unit_id === unitId) ?? null, [summary, unitId]);

  // BLOQUEIO 3: reference_date propagado da tela de origem para todas as consultas
  // que dependem de ciclo — sem isso, cada uma resolvia o ciclo corrente do momento
  // da abertura, podendo divergir do mês que o responsável estava analisando.
  const { data: doctorSummary, isLoading: loadingDoctors } = trpc.financeSimple.doctorSummaryByUnit.useQuery(
    { unit_id: unitId!, reference_date: referenceDate },
    { enabled: unitId !== null },
  );

  const { data: systemRate } = trpc.financeSimple.getUnitSystemRate.useQuery(
    { unit_id: unitId! },
    { enabled: unitId !== null && cfgTab === "sistema" },
  );

  const { data: doctorsForUnit } = trpc.financeSimple.listDoctorsForUnit.useQuery(
    { unit_id: unitId! },
    { enabled: unitId !== null && cfgTab === "medicos" },
  );
  const { data: doctorModalityPrices } = trpc.financeSimple.listDoctorModalityPrices.useQuery(
    { financialResponsibleId: summary?.responsavelId ?? 0, unitId: unitId!, doctorUserId: selectedDoctorId! },
    { enabled: !!summary?.responsavelId && !!selectedDoctorId && unitId !== null && cfgTab === "medicos" },
  );
  const setDoctorModalityPrice = trpc.financeSimple.setDoctorModalityPrice.useMutation({
    onSuccess: () => {
      toast.success("Preço do médico atualizado.");
      utils.financeSimple.listDoctorModalityPrices.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: externalPrices } = trpc.financeSimple.listExternalSalePrices.useQuery(
    { unit_id: unitId! },
    { enabled: unitId !== null && cfgTab === "externo" },
  );
  const setExternalSalePrice = trpc.financeSimple.setExternalSalePrice.useMutation({
    onSuccess: () => {
      toast.success("Preço externo atualizado.");
      utils.financeSimple.listExternalSalePrices.invalidate();
      utils.financeSimple.unitProfitCalculator.invalidate();
      utils.financeSimple.getUnitProfitEventsDetailed.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const {
    data: profitTotals, isError: profitTotalsError, error: profitTotalsErrorObj,
  } = trpc.financeSimple.unitProfitCalculator.useQuery(
    { unit_id: unitId!, reference_date: referenceDate },
    { enabled: unitId !== null },
  );
  const {
    data: profitDetail, isLoading: loadingProfitDetail, isError: profitDetailError, error: profitDetailErrorObj,
  } = trpc.financeSimple.getUnitProfitEventsDetailed.useQuery(
    { unit_id: unitId!, reference_date: referenceDate },
    { enabled: unitId !== null },
  );

  // PONTO ADICIONAL 1 (parecer Manus): não confundir "sem dado" com "FORBIDDEN" ou
  // outra falha — a tela precisa dizer qual dos dois está acontecendo.
  function describeQueryError(error: unknown): string {
    const code = (error as { data?: { code?: string } } | null)?.data?.code;
    if (code === "FORBIDDEN") return "Você não tem permissão para ver o preço externo e o lucro desta unidade.";
    if (error instanceof Error) return error.message;
    return "Falha ao carregar os dados. Tente novamente.";
  }

  if (unitId === null) {
    return (
      <FinanceShell>
        <div className="p-6 max-w-5xl mx-auto">
          <p className="text-[var(--fin-danger)] text-sm">Unidade inválida.</p>
        </div>
      </FinanceShell>
    );
  }

  if (summaryError) {
    return (
      <FinanceShell>
        <div className="p-6 max-w-5xl mx-auto">
          <div className="bg-[var(--fin-panel-soft)] rounded-xl p-6 text-center border border-[var(--fin-line)]">
            <AlertCircle className="h-6 w-6 text-[var(--fin-danger)] mx-auto mb-2" />
            <p className="text-[var(--fin-muted)] text-sm">{describeQueryError(summaryErrorObj)}</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => navigate("/financeiro/responsavel")}>
              Voltar
            </Button>
          </div>
        </div>
      </FinanceShell>
    );
  }

  return (
    <FinanceShell>
      <div className="p-6 max-w-5xl mx-auto">
        <button
          onClick={() => navigate("/financeiro/responsavel")}
          className="flex items-center gap-1 text-[var(--fin-muted)] hover:text-[var(--fin-text)] text-sm mb-4 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Minhas Unidades
        </button>

        <div className="mb-6">
          <h1 className="text-xl font-bold text-[var(--fin-text)] flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[var(--fin-muted)]" />
            {unit?.unit_name ?? (loadingSummary ? "Carregando…" : `Unidade ${unitId}`)}
          </h1>
          {/* BLOQUEIO 3: o rótulo do ciclo vem do backend (já resolvido com o
              reference_date recebido) — nunca mais o texto fixo "Ciclo atual", que
              mentia quando a navegação vinha de um mês anterior. */}
          {unit && (
            <p className="text-[var(--fin-muted)] text-sm mt-0.5">Ciclo: {unit.cycle_label}</p>
          )}
        </div>

        {/* Navegação por âncora — rolagem, não abas que escondem conteúdo */}
        <div className="flex gap-2 mb-8">
          <a href="#sec-sistema" className="text-xs px-3 py-1.5 rounded-full bg-[var(--fin-panel-2)] border border-[var(--fin-line)] text-[var(--fin-muted)] hover:text-[var(--fin-text)] transition-colors">Sistema</a>
          <a href="#sec-medicos" className="text-xs px-3 py-1.5 rounded-full bg-[var(--fin-panel-2)] border border-[var(--fin-line)] text-[var(--fin-muted)] hover:text-[var(--fin-text)] transition-colors">Médicos</a>
          <a href="#sec-preco" className="text-xs px-3 py-1.5 rounded-full bg-[var(--fin-panel-2)] border border-[var(--fin-line)] text-[var(--fin-muted)] hover:text-[var(--fin-text)] transition-colors">Preço externo</a>
        </div>

        {/* ── 1. QUANTO A UNIDADE DEVE AO SISTEMA ──────────────────────────── */}
        <section id="sec-sistema" className="mb-10 scroll-mt-6">
          <h2 className="text-xs font-bold text-[var(--fin-muted)] uppercase tracking-wide mb-1">1. Quanto a unidade deve ao Sistema</h2>
          <p className="text-[var(--fin-muted-dim)] text-xs mb-4">
            {unit ? `${unit.total_laudos} eventos financeiros no ciclo, de todos os médicos.` : "—"}
          </p>

          {loadingSummary ? (
            <div className="h-28 bg-[var(--fin-panel-soft)] rounded-xl animate-pulse mb-4" />
          ) : !unit ? (
            <div className="bg-[var(--fin-panel-soft)] rounded-xl p-6 text-center border border-[var(--fin-line)] mb-4">
              <AlertCircle className="h-6 w-6 text-[var(--fin-danger)] mx-auto mb-2" />
              <p className="text-[var(--fin-muted)] text-sm">Esta unidade não está vinculada ao seu perfil financeiro.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
              <div className="bg-[var(--fin-panel-soft)] rounded-xl p-4 border border-[var(--fin-line)]">
                <p className="text-[var(--fin-muted)] text-xs uppercase tracking-wide mb-1">Devido ao Sistema</p>
                <p className="text-xl font-bold text-[var(--fin-text)]">{fmtBRL(unit.system_total)}</p>
              </div>
              <div className="bg-[var(--fin-panel-soft)] rounded-xl p-4 border border-[var(--fin-line)]">
                <p className="text-[var(--fin-muted)] text-xs uppercase tracking-wide mb-1">Devido aos Médicos</p>
                <p className="text-xl font-bold text-[var(--fin-text)]">{fmtBRL(unit.doctor_total)}</p>
              </div>
              <div className="bg-[var(--fin-panel-soft)] rounded-xl p-4 border border-[var(--fin-success-border,var(--fin-line))]">
                <p className="text-[var(--fin-success)] text-xs uppercase tracking-wide mb-1">Lucro da unidade (ciclo)</p>
                {profitTotalsError ? (
                  <p className="text-[var(--fin-danger)] text-xs">{describeQueryError(profitTotalsErrorObj)}</p>
                ) : (
                  <p className="text-xl font-bold text-[var(--fin-success)]">{profitTotals ? fmtBRL(profitTotals.totals.profit) : "—"}</p>
                )}
              </div>
              <div className="bg-[var(--fin-panel-soft)] rounded-xl p-4 border border-[var(--fin-line)]">
                <p className="text-[var(--fin-warn)] text-xs uppercase tracking-wide mb-1">Pendente ao Sistema</p>
                <p className="text-xl font-bold text-[var(--fin-warn)]">{fmtBRL(unit.system_pending)}</p>
              </div>
              <div className="bg-[var(--fin-panel-soft)] rounded-xl p-4 border border-[var(--fin-line)]">
                <p className="text-[var(--fin-warn)] text-xs uppercase tracking-wide mb-1">Pendente aos Médicos</p>
                <p className="text-xl font-bold text-[var(--fin-warn)]">{fmtBRL(unit.doctor_pending)}</p>
              </div>
            </div>
          )}

          {/* Bloco de configuração de preços — 3 abas de verdade */}
          <div className="bg-[var(--fin-panel-soft)] rounded-xl border border-[var(--fin-line)] overflow-hidden">
            <div className="flex gap-1 px-3 pt-2 border-b border-[var(--fin-line)]">
              {([
                ["sistema", "Preço do Sistema"],
                ["medicos", "Preço dos Médicos"],
                ["externo", "Preço Externo"],
              ] as [CfgTab, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCfgTab(key)}
                  className={`px-3 py-2 text-xs border-b-2 transition-colors ${
                    cfgTab === key
                      ? "border-[var(--fin-accent)] text-[var(--fin-text)] font-semibold"
                      : "border-transparent text-[var(--fin-muted)] hover:text-[var(--fin-text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {cfgTab === "sistema" && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] uppercase tracking-wide bg-[var(--fin-panel-2)] text-[var(--fin-muted)] px-2 py-0.5 rounded-full">Somente leitura</span>
                    <p className="text-[var(--fin-muted-dim)] text-xs">Preço fixo que esta unidade paga ao Sistema por laudo — configurado pela administração.</p>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-[var(--fin-text)]">{systemRate ? fmtBRL(systemRate.price_per_event) : "—"}</span>
                    <span className="text-[var(--fin-muted-dim)] text-xs">por laudo</span>
                  </div>
                  {systemRate?.configured && (
                    <p className="text-[var(--fin-muted-dim)] text-xs mt-1">Vigente desde {fmtDate(systemRate.starts_at)}. Qualquer mudança só entraria em vigor a partir de {fmtDate(systemRate.next_change_at)} (próximo ciclo).</p>
                  )}
                </div>
              )}

              {cfgTab === "medicos" && (
                <div>
                  <p className="text-[var(--fin-muted-dim)] text-xs mb-3">
                    Valor configurado por modalidade para cada médico nesta unidade. Tem prioridade sobre este o preço por legenda de exame específica, quando configurado (fora desta tela).
                  </p>
                  <select
                    value={selectedDoctorId ?? ""}
                    onChange={(e) => setSelectedDoctorId(e.target.value ? Number(e.target.value) : null)}
                    className="bg-[var(--fin-panel-2)] border border-[var(--fin-line-strong)] text-[var(--fin-text)] rounded-lg px-3 py-2 text-sm mb-3 w-full max-w-sm"
                  >
                    <option value="">— Selecione um médico —</option>
                    {(doctorsForUnit ?? []).map((d) => (
                      <option key={d.doctor_user_id} value={d.doctor_user_id}>{d.doctor_name}</option>
                    ))}
                  </select>

                  {selectedDoctorId && (
                    <div className="space-y-2">
                      {MODALITIES.map((mod) => {
                        const active = doctorModalityPrices?.find((p) => p.modality === mod && !p.ends_at);
                        // BLOQUEIO 4 (parecer Manus): quando já existe preço vigente para
                        // esta modalidade, o backend (assertCycleAlignedPriceStart) só
                        // aceita uma nova vigência começando exatamente no primeiro dia do
                        // PRÓXIMO ciclo financeiro — nunca "agora". unit.cycle_end_date já
                        // é esse instante (o ciclo é contíguo: fim do atual = início do
                        // próximo), então reaproveitamos o valor que já veio de
                        // myResponsavelSummary, sem round-trip extra. Sem preço ativo, a
                        // primeira configuração pode valer imediatamente.
                        const nextValidStart = active ? (unit?.cycle_end_date || new Date().toISOString()) : new Date().toISOString();
                        return (
                          <div key={mod} className="bg-[var(--fin-panel-faint)] rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[var(--fin-text)] text-sm">{MODALITY_LABEL[mod]}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[var(--fin-muted-dim)] text-xs">{active ? fmtBRL(Number(active.price_per_report)) : "não configurado"}</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="novo valor"
                                  value={modalityPriceInput[mod] ?? ""}
                                  onChange={(e) => setModalityPriceInput((s) => ({ ...s, [mod]: e.target.value }))}
                                  className="w-24 bg-[var(--fin-panel-2)] border border-[var(--fin-line-strong)] text-[var(--fin-text)] rounded px-2 py-1 text-xs"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!modalityPriceInput[mod] || !summary?.responsavelId || setDoctorModalityPrice.isPending}
                                  onClick={() => {
                                    const value = modalityPriceInput[mod];
                                    const financialResponsibleIdForSave = summary?.responsavelId;
                                    if (!value || !financialResponsibleIdForSave || !selectedDoctorId) return;
                                    // BLOQUEIO 4: o campo só é limpo em caso de sucesso — se o
                                    // backend recusar (ex.: data de vigência incompatível por
                                    // qualquer outra razão), o valor digitado permanece visível
                                    // em vez de desaparecer junto com o erro.
                                    setDoctorModalityPrice.mutate(
                                      {
                                        financialResponsibleId: financialResponsibleIdForSave,
                                        unitId,
                                        doctorUserId: selectedDoctorId,
                                        modality: mod,
                                        pricePerReport: Number(value).toFixed(2),
                                        startsAt: nextValidStart,
                                      },
                                      { onSuccess: () => setModalityPriceInput((s) => ({ ...s, [mod]: "" })) },
                                    );
                                  }}
                                >
                                  Salvar
                                </Button>
                              </div>
                            </div>
                            {active && (
                              <p className="text-[var(--fin-muted-dim)] text-[11px] mt-1">
                                Já existe preço vigente — uma alteração só entra em vigor em {fmtDate(nextValidStart)} (início do próximo ciclo), nunca retroativamente nem no meio do ciclo atual.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {cfgTab === "externo" && (
                <div>
                  <p className="text-[var(--fin-muted-dim)] text-xs mb-3">
                    Valor que esta unidade cobra do paciente/cliente fora do sistema, por legenda de exame. Usado para calcular o lucro: preço externo − valor do médico − valor do Sistema.
                  </p>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {(externalPrices ?? []).map((p) => (
                      <div key={p.exam_legend_id} className="flex items-center justify-between gap-3 bg-[var(--fin-panel-faint)] rounded-lg px-3 py-2">
                        <div>
                          <p className="text-[var(--fin-text)] text-sm">{p.exam_name}</p>
                          <p className="text-[var(--fin-muted-dim)] text-xs">{p.modality}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--fin-muted-dim)] text-xs">{p.configured ? fmtBRL(p.price_external!) : "não configurado"}</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="novo valor"
                            value={externalPriceInput[p.exam_legend_id] ?? ""}
                            onChange={(e) => setExternalPriceInput((s) => ({ ...s, [p.exam_legend_id]: e.target.value }))}
                            className="w-24 bg-[var(--fin-panel-2)] border border-[var(--fin-line-strong)] text-[var(--fin-text)] rounded px-2 py-1 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!externalPriceInput[p.exam_legend_id] || setExternalSalePrice.isPending}
                            onClick={() => {
                              const value = externalPriceInput[p.exam_legend_id];
                              if (!value) return;
                              setExternalSalePrice.mutate(
                                { unit_id: unitId, exam_legend_id: p.exam_legend_id, price_external: Number(value) },
                                { onSuccess: () => setExternalPriceInput((s) => ({ ...s, [p.exam_legend_id]: "" })) },
                              );
                            }}
                          >
                            Salvar
                          </Button>
                        </div>
                      </div>
                    ))}
                    {externalPrices?.length === 0 && (
                      <p className="text-[var(--fin-muted-dim)] text-xs">Nenhuma legenda de exame ativa cadastrada.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── 2. QUANTO A UNIDADE DEVE A CADA MÉDICO ───────────────────────── */}
        <section id="sec-medicos" className="mb-10 scroll-mt-6">
          <h2 className="text-xs font-bold text-[var(--fin-muted)] uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> 2. Quanto a unidade deve a cada médico
          </h2>
          <p className="text-[var(--fin-muted-dim)] text-xs mb-3">Quanto cada médico laudou e quanto a unidade deve a ele, pelo preço configurado aqui.</p>

          {loadingDoctors ? (
            <div className="h-24 bg-[var(--fin-panel-soft)] rounded-xl animate-pulse" />
          ) : !doctorSummary || doctorSummary.length === 0 ? (
            <div className="bg-[var(--fin-panel-soft)] rounded-xl p-6 text-center border border-[var(--fin-line)]">
              <p className="text-[var(--fin-muted)] text-sm">Nenhum médico com laudos nesta unidade no ciclo exibido.</p>
            </div>
          ) : (
            // PONTO ADICIONAL 3 (parecer Manus): rolagem horizontal consciente em vez
            // de esconder colunas em telas estreitas — valores financeiros nunca somem.
            <div className="bg-[var(--fin-panel-soft)] rounded-xl border border-[var(--fin-line)] overflow-x-auto">
              <div className="grid grid-cols-5 gap-2 px-4 py-2 text-[10px] uppercase tracking-wide text-[var(--fin-muted-dim)] border-b border-[var(--fin-line)] min-w-[520px]">
                <div className="col-span-2">Médico</div>
                <div>Laudos</div>
                <div>Devido ao médico</div>
                <div>Pendente ao médico</div>
              </div>
              {doctorSummary.map((d) => (
                <div key={d.doctor_user_id} className="grid grid-cols-5 gap-2 px-4 py-3 items-center border-b border-[var(--fin-line-soft)] last:border-0 text-sm min-w-[520px]">
                  <div className="col-span-2 text-[var(--fin-text)]">{d.doctor_name}</div>
                  <div className="text-[var(--fin-muted)]">{d.total_laudos}</div>
                  <div className="text-[var(--fin-text)] font-medium">{fmtBRL(d.doctor_total)}</div>
                  <div className={d.doctor_total - d.doctor_paid > 0 ? "text-[var(--fin-warn)]" : "text-[var(--fin-muted-dim)]"}>
                    {fmtBRL(d.doctor_total - d.doctor_paid)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 3. PREÇO EXTERNO E LUCRO DA UNIDADE ──────────────────────────── */}
        <section id="sec-preco" className="mb-10 scroll-mt-6">
          <h2 className="text-xs font-bold text-[var(--fin-muted)] uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> 3. Preço externo e lucro da unidade
          </h2>
          <p className="text-[var(--fin-muted-dim)] text-xs mb-3">
            Detalhamento por laudo: data, se foi entregue dentro do prazo de SLA e a composição do lucro.
            {" "}Disponível apenas para laudos faturados pelo fluxo de legenda de exame — ver nota no handoff.
          </p>

          {loadingProfitDetail ? (
            <div className="h-24 bg-[var(--fin-panel-soft)] rounded-xl animate-pulse" />
          ) : profitDetailError ? (
            <div className="bg-[var(--fin-panel-soft)] rounded-xl p-6 text-center border border-[var(--fin-danger-border,var(--fin-line))]">
              <AlertCircle className="h-6 w-6 text-[var(--fin-danger)] mx-auto mb-2" />
              <p className="text-[var(--fin-danger)] text-sm">{describeQueryError(profitDetailErrorObj)}</p>
            </div>
          ) : !profitDetail || profitDetail.events.length === 0 ? (
            <div className="bg-[var(--fin-panel-soft)] rounded-xl p-6 text-center border border-[var(--fin-line)]">
              <p className="text-[var(--fin-muted)] text-sm">Nenhum laudo faturado por legenda de exame neste ciclo.</p>
            </div>
          ) : (
            <div className="bg-[var(--fin-panel-soft)] rounded-xl border border-[var(--fin-line)] overflow-x-auto">
              <div className="grid grid-cols-8 gap-2 px-4 py-2 text-[10px] uppercase tracking-wide text-[var(--fin-muted-dim)] border-b border-[var(--fin-line)] min-w-[760px]">
                <div>Data</div>
                <div className="col-span-2">Médico</div>
                <div>Modal.</div>
                <div>Entrega</div>
                <div>Ext.</div>
                <div>− Méd./Sist.</div>
                <div>Lucro</div>
              </div>
              {profitDetail.events.map((e) => (
                <div key={e.event_id} className="grid grid-cols-8 gap-2 px-4 py-2.5 items-center border-b border-[var(--fin-line-soft)] last:border-0 text-xs min-w-[760px]">
                  <div className="text-[var(--fin-muted)]">{fmtDate(e.signed_at)}</div>
                  <div className="col-span-2 text-[var(--fin-text)]">{e.doctor_name}</div>
                  <div className="text-[var(--fin-muted)]">{e.modality}</div>
                  <div>
                    {e.on_time === null ? (
                      <span className="text-[10px] uppercase tracking-wide bg-[var(--fin-panel-2)] text-[var(--fin-muted-dim)] px-1.5 py-0.5 rounded-full">sem SLA</span>
                    ) : e.on_time ? (
                      <span className="text-[10px] uppercase tracking-wide bg-[var(--fin-success-wash,var(--fin-panel-2))] text-[var(--fin-success)] px-1.5 py-0.5 rounded-full">no prazo</span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wide bg-[var(--fin-warn-wash,var(--fin-panel-2))] text-[var(--fin-warn)] px-1.5 py-0.5 rounded-full">atrasado</span>
                    )}
                  </div>
                  <div className="text-[var(--fin-muted)]">{e.price_external !== null ? fmtBRL(e.price_external) : "—"}</div>
                  <div className="text-[var(--fin-warn)]">{fmtBRL(e.doctor_amount)} / {fmtBRL(e.system_amount)}</div>
                  <div className={e.profit !== null ? "text-[var(--fin-success)] font-semibold" : "text-[var(--fin-muted-dim)]"}>
                    {e.profit !== null ? fmtBRL(e.profit) : "sem preço externo"}
                  </div>
                </div>
              ))}
              {profitTotalsError ? (
                <div className="px-4 py-3 bg-[var(--fin-panel-faint)] text-xs text-[var(--fin-danger)]">{describeQueryError(profitTotalsErrorObj)}</div>
              ) : profitTotals && (
                <div className="px-4 py-3 bg-[var(--fin-panel-faint)] flex items-center justify-between text-xs min-w-[760px]">
                  <span className="text-[var(--fin-muted-dim)]">Ciclo: {profitTotals.cycle_label}</span>
                  <span className="text-[var(--fin-muted)]">Lucro no ciclo: <span className="text-[var(--fin-success)] font-bold">{fmtBRL(profitTotals.totals.profit)}</span></span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </FinanceShell>
  );
}
