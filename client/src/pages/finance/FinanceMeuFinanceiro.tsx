/** Visão financeira individual do médico, sempre limitada à unidade selecionada. */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AppHeader } from "@/components/AppHeader";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { renderSharedReportSheetHtml } from "@/components/SharedReportPrint";
import { ClinicalPatientDetails, ClinicalPatientName } from "@/components/ClinicalPatientDetails";
import { downloadFinancialReportPdf } from "@/lib/financialReportPdfDownload";
import { toast } from "sonner";
import {
  AlertCircle, Building2, CalendarDays, CheckCircle2, CircleDollarSign,
  FileText, Landmark, LoaderCircle, LockKeyhole, RefreshCw, Search,
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

function absoluteMediaUrl(value: string | null | undefined) {
  return value?.startsWith("/") ? `${window.location.origin}${value}` : value || null;
}

async function waitForReportImages(container: HTMLElement) {
  await Promise.all(Array.from(container.querySelectorAll("img")).map((image) => new Promise<void>((resolve) => {
    if (image.complete) return resolve();
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  })));
}

async function downloadFinancialPdf(documentData: any) {
  const report = documentData.report;
  const layout = { ...(documentData.layout ?? {}), ...(report.layout_snapshot ?? {}) } as Record<string, any>;
  const preferences = (layout.preferences ?? {}) as Record<string, any>;
  const positions = (layout.block_positions ?? null) as Record<string, { x: number; y: number; w: number; h: number; visible: boolean }> | null;
  const logos = Array.isArray(layout.logos) ? layout.logos.map((logo: any) => ({ ...logo, url: absoluteMediaUrl(logo.url) ?? "" })).filter((logo: any) => Boolean(logo.url)) : [];
  const patientName = displayPatient(report.patient_name);
  const studyDate = fmtCalendarDate(report.study_date ? String(report.study_date).slice(0, 10) : null);
  const signedAt = report.signed_at ? new Date(report.signed_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const signature = absoluteMediaUrl(documentData.signer.signature_url);
  const stamp = absoluteMediaUrl(documentData.signer.stamp_url);
  const signerFooter = (
    <div style={{ width: "100%", textAlign: "center", marginTop: 24 }}>
      {stamp ? <img src={stamp} alt="Carimbo" style={{ maxHeight: 90, maxWidth: 200, objectFit: "contain", display: "block", margin: "0 auto 8px" }} /> : null}
      {signature ? <img src={signature} alt="Assinatura" style={{ maxHeight: 48, maxWidth: 170, objectFit: "contain", display: "block", margin: "0 auto 8px" }} /> : null}
      <div style={{ borderTop: "1px solid #333", width: 170, margin: "0 auto 8px" }} />
      <div style={{ fontWeight: 700, fontSize: "10pt" }}>{documentData.signer.name}{report.status === "revised" ? " — RETIFICADO" : ""}</div>
      {documentData.signer.crm ? <div style={{ fontSize: "9pt", color: "#444", marginTop: 2 }}>CRM: {documentData.signer.crm}</div> : null}
      {signedAt ? <div style={{ fontSize: "8pt", color: "#666", marginTop: 4 }}>Assinado em: {signedAt}</div> : null}
    </div>
  );
  const patientInfo = <ClinicalPatientDetails birthDate="—" sex="—" studyDate={studyDate} modality={report.modality ?? "—"} />;
  const makeSheet = (title: string, body: string, isLast: boolean) => renderSharedReportSheetHtml({
    positions,
    logos,
    backgroundUrl: absoluteMediaUrl(layout.background_image_url),
    backgroundOpacity: Number(layout.background_opacity ?? 1),
    backgroundSize: layout.background_size ?? "cover",
    footerImageUrl: isLast ? absoluteMediaUrl(layout.footer_image_url) : null,
    fontFamily: preferences.fontFamily ? `'${preferences.fontFamily}', sans-serif` : "Arial, Helvetica, sans-serif",
    fontSize: Number(preferences.fontSize ?? 11),
    lineHeight: Number(preferences.lineHeight ?? 1.6),
    patientName,
    patientNameContent: <ClinicalPatientName patientName={patientName} />,
    patientInfo,
    title: <div style={{ width: "100%", textAlign: "center", fontWeight: 700, fontSize: "13pt", textTransform: "uppercase", letterSpacing: "0.05em", paddingBottom: 6, borderBottom: "1px solid #e0e0e0" }}>{title || "—"}</div>,
    body: <div className="report-body" dangerouslySetInnerHTML={{ __html: body }} />,
    footer: isLast ? signerFooter : <div />,
  });
  let sections: Array<{ title: string; body: string }> = [{ title: report.document_label ?? report.study_description ?? "Laudo", body: report.body }];
  try {
    const parsed = JSON.parse(report.body);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => item && typeof item.body === "string")) sections = parsed;
  } catch { /* relatório em HTML simples */ }
  const staging = document.createElement("div");
  staging.setAttribute("aria-hidden", "true");
  staging.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;z-index:-1;background:#fff;";
  staging.innerHTML = sections.map((section, index) => makeSheet(section.title, section.body, index === sections.length - 1)).join("");
  document.body.appendChild(staging);
  try {
    await waitForReportImages(staging);
    const pages = Array.from(staging.querySelectorAll<HTMLElement>("[data-shared-report-sheet]"));
    if (pages.length === 0) throw new Error("Não foi possível preparar as páginas do documento.");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const canvas = await html2canvas(page, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297);
    }
    pdf.save(`Laudo_${patientName.replace(/[^a-zA-Z0-9]+/g, "_") || "entregue"}.pdf`);
  } finally {
    staging.remove();
  }
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
  const [downloadingReportId, setDownloadingReportId] = useState<number | null>(null);
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
  const trpcUtils = trpc.useUtils();

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

  const downloadConfiguredReport = async (report: typeof reports[number]) => {
    const target = report.print_target;
    if (!target?.study_instance_uid) return;
    setDownloadingReportId(report.id);
    const loadingToast = toast.loading("Preparando PDF configurado…");
    try {
      const documentData = await trpcUtils.financeSimple.myReportDownload.fetch({
        unit_id: target.unit_id,
        study_instance_uid: target.study_instance_uid,
        document_key: target.document_key,
      });
      await downloadFinancialReportPdf(documentData);
      toast.success("PDF baixado com sucesso.", { id: loadingToast });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível baixar o PDF.", { id: loadingToast });
    } finally {
      setDownloadingReportId(null);
    }
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
                    {financeQuery.isLoading ? <p className="py-8 text-center text-sm text-slate-500">Carregando laudos…</p> : visibleReports.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{reportFilter ? "Nenhum laudo encontrado para a busca." : "Nenhum laudo entregue neste ciclo."}</p> : visibleReports.map((report) => <MobileReportCard key={report.id} report={report} onPrint={downloadConfiguredReport} downloading={downloadingReportId === report.id} />)}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="min-w-[780px] w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2.5">Assinatura</th><th className="px-4 py-2.5">Paciente</th><th className="px-3 py-2.5">Modalidade</th><th className="px-3 py-2.5">Exame</th><th className="px-3 py-2.5">Situação</th><th className="px-4 py-2.5 text-right">Ação</th></tr></thead><tbody className="divide-y divide-slate-100">
                      {financeQuery.isLoading ? <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">Carregando laudos…</td></tr> : visibleReports.length === 0 ? <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">{reportFilter ? "Nenhum laudo encontrado para a busca." : "Nenhum laudo entregue neste ciclo."}</td></tr> : visibleReports.map((report) => <DesktopReportRow key={report.id} report={report} onPrint={downloadConfiguredReport} downloading={downloadingReportId === report.id} />)}
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

function MobileReportCard({ report, onPrint, downloading }: { report: any; onPrint: (report: any) => void; downloading: boolean }) {
  const status = statusMeta(report.status); const modality = MODALITY_META[report.modality ?? ""] ?? { label: report.modality ?? "—", className: "bg-slate-600" };
  return <article className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-950">{displayPatient(report.patient_name)}</p><p className="mt-1 text-xs text-slate-500">Assinado em {fmtDate(report.signed_at)}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${status.className}`}>{status.label}</span></div><div className="mt-2.5 flex items-center gap-2 text-sm text-slate-700"><span className={`rounded-md px-2 py-1 text-xs font-bold text-white ${modality.className}`}>{modality.label}</span><span className="min-w-0 truncate">{report.document_label ?? report.study_description ?? "Laudo entregue"}</span></div>{report.print_target ? <button type="button" disabled={downloading} onClick={() => onPrint(report)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-300 bg-white px-3 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 disabled:cursor-wait disabled:opacity-60">{downloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}{downloading ? "Preparando PDF…" : "Baixar PDF"}</button> : <span className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm font-medium text-slate-400"><FileText className="h-4 w-4" /> PDF indisponível</span>}</article>;
}

function DesktopReportRow({ report, onPrint, downloading }: { report: any; onPrint: (report: any) => void; downloading: boolean }) {
  const status = statusMeta(report.status); const modality = MODALITY_META[report.modality ?? ""] ?? { label: report.modality ?? "—", className: "bg-slate-600" };
  return <tr className="hover:bg-slate-50/80"><td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(report.signed_at)}</td><td className="px-4 py-3 font-medium text-slate-900">{displayPatient(report.patient_name)}</td><td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-xs font-bold text-white ${modality.className}`}>{modality.label}</span></td><td className="max-w-56 truncate px-3 py-3 text-slate-700">{report.document_label ?? report.study_description ?? "Laudo entregue"}</td><td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${status.className}`}>{status.label}</span></td><td className="px-4 py-3 text-right">{report.print_target ? <button type="button" disabled={downloading} onClick={() => onPrint(report)} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-50 disabled:cursor-wait disabled:opacity-60">{downloading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}{downloading ? "Preparando…" : "Baixar PDF"}</button> : <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-400"><FileText className="h-3.5 w-3.5" /> Indisponível</span>}</td></tr>;
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
