/** Visão financeira individual do médico, sempre limitada à unidade selecionada. */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AppHeader } from "@/components/AppHeader";
import {
  AlertCircle, Building2, CalendarDays, CheckCircle2, CircleDollarSign,
  Download, FileText, Landmark, LockKeyhole, RefreshCw,
} from "lucide-react";

const MODALITY_META: Record<string, { label: string; className: string }> = {
  CT: { label: "CT", className: "bg-sky-600" },
  CR: { label: "CR", className: "bg-teal-600" },
  US: { label: "US", className: "bg-cyan-600" },
  MR: { label: "RM", className: "bg-violet-600" },
};

function fmtBRL(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
}

function fmtCalendarDate(value: string | null | undefined) {
  if (!value) return "—";
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : "—";
}

function displayPatient(value: string | null | undefined) {
  return value?.replace(/\^/g, " ").replace(/\s+/g, " ").trim() || "Paciente não identificado";
}

export default function FinanceMeuFinanceiro() {
  const [, navigate] = useLocation();
  const [unitId, setUnitId] = useState<number | null>(null);
  const referenceDate = useMemo(() => new Date().toISOString(), []);
  const unitsQuery = trpc.financeSimple.myFinanceiroUnits.useQuery();
  const units = unitsQuery.data ?? [];

  useEffect(() => {
    if (unitId === null && units.length > 0) setUnitId(units[0].unit_id);
  }, [unitId, units]);

  const financeQuery = trpc.financeSimple.myFinanceiro.useQuery(
    { unit_id: unitId ?? 0, reference_date: referenceDate },
    { enabled: unitId !== null },
  );
  const pricesQuery = trpc.financeSimple.myModalityPrices.useQuery(
    { unit_id: unitId ?? 0, reference_date: referenceDate },
    { enabled: unitId !== null },
  );

  const selectedUnit = units.find((unit) => unit.unit_id === unitId) ?? null;
  const summary = financeQuery.data?.summary[0];
  const reports = financeQuery.data?.delivered_reports ?? [];
  const hasError = unitsQuery.isError || financeQuery.isError || pricesQuery.isError;

  const unitSelector = (
    <label className="flex items-center gap-2 rounded-xl border border-white/20 bg-slate-950/20 px-3 py-2 text-sm font-medium text-white shadow-sm backdrop-blur">
      <Building2 className="h-4 w-4 text-cyan-200" />
      <select
        aria-label="Unidade financeira"
        value={unitId ?? ""}
        onChange={(event) => setUnitId(Number(event.target.value))}
        className="max-w-44 bg-transparent text-sm font-medium outline-none"
      >
        {units.map((unit) => <option key={unit.unit_id} value={unit.unit_id} className="bg-slate-900">{unit.unit_name}</option>)}
      </select>
    </label>
  );

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      <AppHeader
        unitSlot={units.length > 0 ? unitSelector : undefined}
        mobileUnitSlot={units.length > 0 ? unitSelector : undefined}
        mobileUnitLabel={selectedUnit?.unit_name}
        nav={
          <>
            <button onClick={() => navigate("/")} className="rounded-md px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white">Estudos</button>
            <span className="rounded-md border-b-2 border-amber-400 px-3 py-2 text-sm font-semibold text-amber-300">Financeiro</span>
          </>
        }
      />

      <main className="mx-auto max-w-[1540px] px-4 py-6 md:px-8 md:py-8">
        {unitsQuery.isLoading ? (
          <div className="h-72 animate-pulse rounded-2xl bg-white shadow-sm" />
        ) : units.length === 0 ? (
          <EmptyFinancialAccess />
        ) : hasError ? (
          <FinancialError onRetry={() => { void unitsQuery.refetch(); void financeQuery.refetch(); void pricesQuery.refetch(); }} />
        ) : (
          <div className="space-y-5">
            <header>
              <p className="text-sm font-medium text-slate-500">Resumo do seu ciclo e laudos entregues</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Meu financeiro</h1>
              <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-950">
                <Building2 className="h-4 w-4 text-cyan-700" /> Dados da unidade: {selectedUnit?.unit_name}
              </p>
            </header>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.62fr)]">
              <div className="space-y-5">
                <section className="grid gap-4 sm:grid-cols-2">
                  <MetricCard
                    icon={<CheckCircle2 className="h-7 w-7" />}
                    label="Laudos assinados no ciclo"
                    value={String(summary?.signed_report_count ?? 0)}
                    detail={`${fmtCalendarDate(summary?.cycle_start_display)} a ${fmtCalendarDate(summary?.cycle_end_display)}`}
                    unitName={selectedUnit?.unit_name}
                    tone="teal"
                  />
                  <MetricCard
                    icon={<CircleDollarSign className="h-7 w-7" />}
                    label="Repasses gerados no ciclo"
                    value={fmtBRL(summary?.doctor_total)}
                    detail="Soma dos valores aplicados aos eventos financeiros ativos"
                    unitName={selectedUnit?.unit_name}
                    tone="blue"
                  />
                </section>

                <section id="laudos-entregues" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">Laudos entregues</h2>
                      <p className="mt-1 text-sm text-slate-500">Documentos assinados por você em {selectedUnit?.unit_name}. Laudos cancelados permanecem visíveis para conferência.</p>
                    </div>
                    {financeQuery.isFetching && <span className="text-xs font-medium text-cyan-700">Atualizando…</span>}
                  </div>
                  <div className="space-y-3 p-4 md:hidden">
                    {financeQuery.isLoading ? (
                      <p className="py-8 text-center text-sm text-slate-500">Carregando laudos entregues…</p>
                    ) : reports.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-500">Nenhum laudo entregue neste ciclo para esta unidade.</p>
                    ) : reports.map((report) => {
                      const status = report.status === "cancelled" ? "Laudo cancelado" : report.status === "revised" ? "Retificado" : "Entregue";
                      const statusClass = report.status === "cancelled" ? "bg-rose-50 text-rose-700 ring-rose-200" : report.status === "revised" ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200";
                      const modality = MODALITY_META[report.modality ?? ""] ?? { label: report.modality ?? "—", className: "bg-slate-600" };
                      return (
                        <article key={report.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-950">{displayPatient(report.patient_name)}</p>
                              <p className="mt-1 text-xs text-slate-500">Assinado em {fmtDate(report.signed_at)}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass}`}>{status}</span>
                          </div>
                          <div className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                            <span className={`rounded-md px-2 py-1 text-xs font-bold text-white ${modality.className}`}>{modality.label}</span>
                            <span className="min-w-0 truncate">{report.document_label ?? report.study_description ?? "Laudo entregue"}</span>
                          </div>
                          {report.download_url ? (
                            <a href={report.download_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-300 bg-white px-3 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-50">
                              <Download className="h-4 w-4" /> Baixar laudo
                            </a>
                          ) : (
                            <span className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm font-medium text-slate-400"><FileText className="h-4 w-4" /> PDF indisponível</span>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="min-w-[830px] w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Data de assinatura</th>
                          <th className="px-4 py-3">Paciente</th>
                          <th className="px-4 py-3">Modalidade</th>
                          <th className="px-4 py-3">Exame</th>
                          <th className="px-4 py-3">Situação</th>
                          <th className="px-5 py-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {financeQuery.isLoading ? (
                          <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">Carregando laudos entregues…</td></tr>
                        ) : reports.length === 0 ? (
                          <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">Nenhum laudo entregue neste ciclo para esta unidade.</td></tr>
                        ) : reports.map((report) => {
                          const status = report.status === "cancelled" ? "Laudo cancelado" : report.status === "revised" ? "Retificado" : "Entregue";
                          const statusClass = report.status === "cancelled" ? "bg-rose-50 text-rose-700 ring-rose-200" : report.status === "revised" ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200";
                          const modality = MODALITY_META[report.modality ?? ""] ?? { label: report.modality ?? "—", className: "bg-slate-600" };
                          return (
                            <tr key={report.id} className="hover:bg-slate-50/80">
                              <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">{fmtDate(report.signed_at)}</td>
                              <td className="px-4 py-3.5 font-medium text-slate-900">{displayPatient(report.patient_name)}</td>
                              <td className="px-4 py-3.5"><span className={`rounded-md px-2 py-1 text-xs font-bold text-white ${modality.className}`}>{modality.label}</span></td>
                              <td className="max-w-56 truncate px-4 py-3.5 text-slate-700">{report.document_label ?? report.study_description ?? "Laudo entregue"}</td>
                              <td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass}`}>{status}</span></td>
                              <td className="px-5 py-3.5 text-right">
                                {report.download_url ? (
                                  <a href={report.download_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-50">
                                    <Download className="h-3.5 w-3.5" /> Baixar laudo
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-400"><FileText className="h-3.5 w-3.5" /> PDF indisponível</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-950">Ciclo atual</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <CycleDate label="Início" value={fmtCalendarDate(summary?.cycle_start_display)} />
                    <CycleDate label="Término" value={fmtCalendarDate(summary?.cycle_end_display)} />
                    <CycleDate label="Unidade" value={selectedUnit?.unit_name ?? "—"} building />
                  </div>
                </section>
              </div>

              <aside id="configuracao-vigente" className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-950">Minha configuração vigente</h2>
                <div className="mt-4 flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                  <p>Valores definidos pelo administrador e apresentados somente para consulta.</p>
                </div>
                <h3 className="mt-5 text-sm font-semibold text-slate-800">Valor por modalidade</h3>
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  {pricesQuery.isLoading ? <div className="p-5 text-sm text-slate-500">Carregando valores…</div> : pricesQuery.data?.length ? pricesQuery.data.map((price) => {
                    const modality = MODALITY_META[price.modality] ?? { label: price.modality, className: "bg-slate-600" };
                    return <div key={price.modality} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-b-0"><span className={`rounded-md px-2 py-1 text-xs font-bold text-white ${modality.className}`}>{modality.label}</span><span className="font-semibold text-slate-900">{fmtBRL(price.price_per_report)}</span></div>;
                  }) : <div className="p-5 text-sm text-amber-700">Nenhum valor por modalidade está configurado para este ciclo. Consulte o responsável financeiro.</div>}
                </div>
                <div className="mt-5 space-y-3 text-sm text-slate-600">
                  <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-cyan-700" /> Vigência: ciclo atual</p>
                  <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-cyan-700" /> Unidade vinculada: {selectedUnit?.unit_name}</p>
                </div>
                <p className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">O repasse do ciclo é calculado pelos valores efetivamente aplicados aos eventos assinados. Alterações futuras de configuração não recalculam os documentos já entregues.</p>
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MetricCard({ icon, label, value, detail, unitName, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; unitName?: string | null; tone: "teal" | "blue" }) {
  const toneClasses = tone === "teal" ? "bg-teal-50 text-teal-700" : "bg-blue-50 text-blue-700";
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex gap-4"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${toneClasses}`}>{icon}</span><div className="min-w-0"><p className="font-semibold text-slate-900">{label}</p><p className="mt-1 text-sm text-slate-500">{detail}</p><p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value}</p><p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500"><Building2 className="h-3.5 w-3.5" /> Unidade: {unitName ?? "—"}</p></div></div></section>;
}

function CycleDate({ label, value, building = false }: { label: string; value: string; building?: boolean }) {
  const Icon = building ? Building2 : CalendarDays;
  return <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600"><Icon className="h-4 w-4" /></span><div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-0.5 font-semibold text-slate-900">{value}</p></div></div>;
}

function EmptyFinancialAccess() {
  return <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm"><Landmark className="mx-auto h-10 w-10 text-slate-400" /><h1 className="mt-4 text-xl font-semibold text-slate-900">Nenhuma unidade financeira disponível</h1><p className="mt-2 text-sm text-slate-500">Solicite ao responsável financeiro o vínculo e a permissão para visualizar seus dados na unidade.</p></div>;
}

function FinancialError({ onRetry }: { onRetry: () => void }) {
  return <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-white p-10 text-center shadow-sm"><AlertCircle className="mx-auto h-10 w-10 text-rose-600" /><h1 className="mt-4 text-xl font-semibold text-slate-900">Não foi possível carregar seu financeiro</h1><p className="mt-2 text-sm text-slate-500">Nenhum dado foi ocultado como lista vazia. Tente novamente ou comunique o responsável pela unidade.</p><button onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"><RefreshCw className="h-4 w-4" /> Tentar novamente</button></div>;
}
