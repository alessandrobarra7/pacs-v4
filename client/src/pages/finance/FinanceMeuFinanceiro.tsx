/** Visão financeira individual do médico, sempre limitada à unidade selecionada. */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AppHeader } from "@/components/AppHeader";
import {
  AlertCircle, Building2, CalendarDays, CheckCircle2, CircleDollarSign,
  FileText, Landmark, LockKeyhole, RefreshCw, Search,
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

function statusMeta(status: string | null | undefined) {
  if (status === "cancelled") return { label: "Laudo cancelado", className: "bg-rose-50 text-rose-700 ring-rose-200" };
  if (status === "revised") return { label: "Retificado", className: "bg-violet-50 text-violet-700 ring-violet-200" };
  return { label: "Entregue", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
}

export default function FinanceMeuFinanceiro() {
  const [, navigate] = useLocation();
  const [unitId, setUnitId] = useState<number | null>(null);
  const [reportFilter, setReportFilter] = useState("");
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
  const normalizedFilter = reportFilter.trim().toLocaleLowerCase("pt-BR");
  const visibleReports = useMemo(() => reports.filter((report) => !normalizedFilter || [
    report.patient_name,
    report.study_description,
    report.document_label,
    report.modality,
    report.status,
  ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(normalizedFilter)), [reports, normalizedFilter]);
  const hasError = unitsQuery.isError || financeQuery.isError || pricesQuery.isError;

  const unitSelector = (
    <label className="flex items-center gap-2 rounded-xl border border-white/20 bg-slate-950/20 px-3 py-2 text-sm font-medium text-white shadow-sm backdrop-blur">
      <Building2 className="h-4 w-4 text-cyan-200" />
      <select aria-label="Unidade financeira" value={unitId ?? ""} onChange={(event) => setUnitId(Number(event.target.value))} className="max-w-44 bg-transparent text-sm font-medium outline-none">
        {units.map((unit) => <option key={unit.unit_id} value={unit.unit_id} className="bg-slate-900">{unit.unit_name}</option>)}
      </select>
    </label>
  );

  const openConfiguredPrint = (report: typeof reports[number]) => {
    const target = report.print_target;
    if (!target?.study_instance_uid) return;
    sessionStorage.setItem(`study_${target.study_instance_uid}`, JSON.stringify({
      patientName: target.patient_name ?? "",
      studyDate: "",
      modality: target.modality ?? "",
      studyDescription: target.study_description ?? target.document_label,
      unitId: target.unit_id,
      documentKey: target.document_key,
      documentLabel: target.document_label,
    }));
    const params = new URLSearchParams({ document: target.document_key, documentLabel: target.document_label, unitId: String(target.unit_id), financialView: "1" });
    window.open(`/reports/create/${encodeURIComponent(target.study_instance_uid)}?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      <AppHeader
        unitSlot={units.length > 0 ? unitSelector : undefined}
        mobileUnitSlot={units.length > 0 ? unitSelector : undefined}
        mobileUnitLabel={selectedUnit?.unit_name}
        nav={<><button onClick={() => navigate("/")} className="rounded-md px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white">Estudos</button><span className="rounded-md border-b-2 border-amber-400 px-3 py-2 text-sm font-semibold text-amber-300">Financeiro</span></>}
      />

      <main className="mx-auto max-w-[1540px] px-3 py-4 sm:px-5 md:px-8 md:py-6">
        {unitsQuery.isLoading ? <div className="h-72 animate-pulse rounded-2xl bg-white shadow-sm" /> : units.length === 0 ? <EmptyFinancialAccess /> : hasError ? <FinancialError onRetry={() => { void unitsQuery.refetch(); void financeQuery.refetch(); void pricesQuery.refetch(); }} /> : (
          <div className="space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-xs font-medium text-slate-500">Resumo do ciclo e eventos dos seus laudos</p><h1 className="text-xl font-bold tracking-tight text-slate-950 md:text-2xl">Meu financeiro</h1></div>
              <p className="inline-flex items-center gap-1.5 rounded-md bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-950"><Building2 className="h-4 w-4 text-cyan-700" /> Unidade: {selectedUnit?.unit_name}</p>
            </header>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.6fr)]">
              <div className="space-y-3">
                <section className="grid gap-3 sm:grid-cols-2">
                  <MetricCard icon={<CheckCircle2 className="h-6 w-6" />} label="Laudos assinados no ciclo" value={String(summary?.signed_report_count ?? 0)} detail={`${fmtCalendarDate(summary?.cycle_start_display)} a ${fmtCalendarDate(summary?.cycle_end_display)}`} tone="teal" />
                  <MetricCard icon={<CircleDollarSign className="h-6 w-6" />} label="Repasses gerados no ciclo" value={fmtBRL(summary?.doctor_total)} detail="Valores aplicados aos eventos financeiros ativos" tone="blue" />
                </section>

                <section id="laudos-entregues" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <div><h2 className="text-base font-semibold text-slate-950">Laudos entregues</h2><p className="mt-0.5 text-xs text-slate-500">Busca com o mesmo critério do log: paciente, modalidade ou exame.</p></div>
                    <div className="flex items-center gap-2"><label className="relative block"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input aria-label="Buscar laudos entregues" value={reportFilter} onChange={(event) => setReportFilter(event.target.value)} placeholder="Buscar paciente ou exame" className="h-8 w-52 rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs outline-none focus:border-cyan-500 sm:w-60" /></label>{financeQuery.isFetching && <span className="text-xs font-medium text-cyan-700">Atualizando…</span>}</div>
                  </div>
                  <div className="space-y-3 p-3 md:hidden">
                    {financeQuery.isLoading ? <p className="py-8 text-center text-sm text-slate-500">Carregando laudos…</p> : visibleReports.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{reportFilter ? "Nenhum laudo encontrado para a busca." : "Nenhum laudo entregue neste ciclo."}</p> : visibleReports.map((report) => <MobileReportCard key={report.id} report={report} onPrint={openConfiguredPrint} />)}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="min-w-[780px] w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2.5">Assinatura</th><th className="px-4 py-2.5">Paciente</th><th className="px-3 py-2.5">Modalidade</th><th className="px-3 py-2.5">Exame</th><th className="px-3 py-2.5">Situação</th><th className="px-4 py-2.5 text-right">Ação</th></tr></thead><tbody className="divide-y divide-slate-100">
                      {financeQuery.isLoading ? <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">Carregando laudos…</td></tr> : visibleReports.length === 0 ? <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">{reportFilter ? "Nenhum laudo encontrado para a busca." : "Nenhum laudo entregue neste ciclo."}</td></tr> : visibleReports.map((report) => <DesktopReportRow key={report.id} report={report} onPrint={openConfiguredPrint} />)}
                    </tbody></table>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><div className="grid gap-3 sm:grid-cols-3"><CycleDate label="Início" value={fmtCalendarDate(summary?.cycle_start_display)} /><CycleDate label="Término" value={fmtCalendarDate(summary?.cycle_end_display)} /><CycleDate label="Unidade" value={selectedUnit?.unit_name ?? "—"} building /></div></section>
              </div>

              <aside id="configuracao-vigente" className="h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-base font-semibold text-slate-950">Minha configuração vigente</h2>
                <div className="mt-3 flex gap-2 rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-xs text-slate-700"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /><p>Valores definidos pelo administrador, somente para consulta.</p></div>
                <h3 className="mt-4 text-sm font-semibold text-slate-800">Valor efetivo por modalidade</h3>
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                  {pricesQuery.isLoading ? <div className="p-4 text-sm text-slate-500">Carregando valores…</div> : pricesQuery.data?.map((price) => { const modality = MODALITY_META[price.modality] ?? { label: price.modality, className: "bg-slate-600" }; return <div key={price.modality} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0"><span className={`rounded-md px-2 py-1 text-xs font-bold text-white ${modality.className}`}>{modality.label}</span><div className="min-w-0 text-right"><p className={`font-semibold ${price.price_per_report === null ? "text-amber-700" : "text-slate-900"}`}>{price.price_per_report === null ? "Não configurado" : fmtBRL(price.price_per_report)}</p><p className="truncate text-[10px] text-slate-500">{price.source_label}</p></div></div>; })}
                </div>
                <div className="mt-4 space-y-2 text-xs text-slate-600"><p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-cyan-700" /> Vigência: ciclo atual</p><p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-cyan-700" /> Unidade: {selectedUnit?.unit_name}</p></div>
                <p className="mt-4 rounded-lg bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-500">Preço individual tem prioridade. Sem ele, é exibido o <strong>Preço padrão da unidade</strong> usado na assinatura. Alterações futuras não recalculam documentos entregues.</p>
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MobileReportCard({ report, onPrint }: { report: any; onPrint: (report: any) => void }) {
  const status = statusMeta(report.status); const modality = MODALITY_META[report.modality ?? ""] ?? { label: report.modality ?? "—", className: "bg-slate-600" };
  return <article className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-950">{displayPatient(report.patient_name)}</p><p className="mt-1 text-xs text-slate-500">Assinado em {fmtDate(report.signed_at)}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${status.className}`}>{status.label}</span></div><div className="mt-2.5 flex items-center gap-2 text-sm text-slate-700"><span className={`rounded-md px-2 py-1 text-xs font-bold text-white ${modality.className}`}>{modality.label}</span><span className="min-w-0 truncate">{report.document_label ?? report.study_description ?? "Laudo entregue"}</span></div>{report.print_target ? <button type="button" onClick={() => onPrint(report)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-300 bg-white px-3 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"><FileText className="h-4 w-4" /> Baixar PDF</button> : <span className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm font-medium text-slate-400"><FileText className="h-4 w-4" /> PDF indisponível</span>}</article>;
}

function DesktopReportRow({ report, onPrint }: { report: any; onPrint: (report: any) => void }) {
  const status = statusMeta(report.status); const modality = MODALITY_META[report.modality ?? ""] ?? { label: report.modality ?? "—", className: "bg-slate-600" };
  return <tr className="hover:bg-slate-50/80"><td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(report.signed_at)}</td><td className="px-4 py-3 font-medium text-slate-900">{displayPatient(report.patient_name)}</td><td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-xs font-bold text-white ${modality.className}`}>{modality.label}</span></td><td className="max-w-56 truncate px-3 py-3 text-slate-700">{report.document_label ?? report.study_description ?? "Laudo entregue"}</td><td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${status.className}`}>{status.label}</span></td><td className="px-4 py-3 text-right">{report.print_target ? <button type="button" onClick={() => onPrint(report)} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-50"><FileText className="h-3.5 w-3.5" /> Baixar PDF</button> : <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-400"><FileText className="h-3.5 w-3.5" /> Indisponível</span>}</td></tr>;
}

function MetricCard({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: "teal" | "blue" }) {
  const toneClasses = tone === "teal" ? "bg-teal-50 text-teal-700" : "bg-blue-50 text-blue-700";
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toneClasses}`}>{icon}</span><div className="min-w-0"><p className="font-semibold text-slate-900">{label}</p><p className="mt-0.5 text-xs text-slate-500">{detail}</p><p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950">{value}</p></div></div></section>;
}

function CycleDate({ label, value, building = false }: { label: string; value: string; building?: boolean }) {
  const Icon = building ? Building2 : CalendarDays;
  return <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600"><Icon className="h-4 w-4" /></span><div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-0.5 font-semibold text-slate-900">{value}</p></div></div>;
}

function EmptyFinancialAccess() {
  return <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm"><Landmark className="mx-auto h-10 w-10 text-slate-400" /><h1 className="mt-4 text-xl font-semibold text-slate-900">Nenhuma unidade financeira disponível</h1><p className="mt-2 text-sm text-slate-500">Solicite ao responsável financeiro o vínculo e a permissão para visualizar seus dados na unidade.</p></div>;
}

function FinancialError({ onRetry }: { onRetry: () => void }) {
  return <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-white p-10 text-center shadow-sm"><AlertCircle className="mx-auto h-10 w-10 text-rose-600" /><h1 className="mt-4 text-xl font-semibold text-slate-900">Não foi possível carregar seu financeiro</h1><p className="mt-2 text-sm text-slate-500">Nenhum dado foi ocultado como lista vazia. Tente novamente ou comunique o responsável pela unidade.</p><button onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"><RefreshCw className="h-4 w-4" /> Tentar novamente</button></div>;
}
