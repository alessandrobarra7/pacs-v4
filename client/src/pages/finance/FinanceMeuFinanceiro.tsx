/** Visão financeira individual do médico, sempre limitada à unidade selecionada. */
import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { FinanceShell } from "./FinanceShell";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { renderSharedReportSheetHtml } from "@/components/SharedReportPrint";
import { ClinicalPatientDetails, ClinicalPatientName } from "@/components/ClinicalPatientDetails";
import { downloadFinancialReportPdf } from "@/lib/financialReportPdfDownload";
import { toast } from "sonner";
import {
  AlertCircle, Building2, CalendarDays, CheckCircle2, CircleDollarSign,
  Clock, FileText, History, Landmark, LoaderCircle, LockKeyhole, RefreshCw, Search,
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
  if (status === "cancelled") return { label: "Laudo cancelado", className: "bg-[var(--fin-danger-wash)] text-[var(--fin-danger)] ring-[var(--fin-danger-border)]" };
  if (status === "revised") return { label: "Retificado", className: "bg-violet-500/10 text-violet-300 ring-violet-400/30" };
  return { label: "Entregue", className: "bg-[var(--fin-success-wash)] text-[var(--fin-success)] ring-[var(--fin-success)]/30" };
}

export default function FinanceMeuFinanceiro() {
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
  const pastCyclesQuery = trpc.financeSimple.myPastCycles.useQuery();
  const trpcUtils = trpc.useUtils();

  const selectedUnit = units.find((unit) => unit.unit_id === unitId) ?? null;
  const summary = financeQuery.data?.summary[0];
  const reports = financeQuery.data?.delivered_reports ?? [];
  // NOVO (claude/modulo-repasse-preco-externo): repasses do ciclo, com status pago/pendente
  // e confirmação do próprio médico — antes calculado pela API e nunca exibido nesta tela.
  const repasses = financeQuery.data?.events ?? [];
  const confirmPayment = trpc.financeSimple.confirmDoctorPayment.useMutation({
    onSuccess: () => { toast.success("Resposta registrada."); void financeQuery.refetch(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível registrar sua resposta."),
  });
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
    <label className="flex items-center gap-2 rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] px-3 py-2 text-sm font-medium text-[var(--fin-text)] shadow-sm">
      <Building2 className="h-4 w-4 text-[var(--fin-accent-soft)]" />
      <select aria-label="Unidade financeira" value={unitId ?? ""} onChange={(event) => setUnitId(Number(event.target.value))} className="max-w-44 bg-transparent text-sm font-medium outline-none">
        {units.map((unit) => <option key={unit.unit_id} value={unit.unit_id} className="bg-[var(--fin-panel)]">{unit.unit_name}</option>)}
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
    <FinanceShell>
      <div className="mx-auto max-w-[1540px] px-3 py-4 sm:px-5 md:px-8 md:py-6">
        {unitsQuery.isLoading ? <div className="h-72 animate-pulse rounded-2xl bg-[var(--fin-panel)] shadow-sm" /> : units.length === 0 ? <EmptyFinancialAccess /> : hasError ? <FinancialError onRetry={() => { void unitsQuery.refetch(); void financeQuery.refetch(); void pricesQuery.refetch(); }} /> : (
          <div className="space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-xs font-medium text-[var(--fin-muted)]">Resumo do ciclo e eventos dos seus laudos</p><h1 className="fin-head text-xl font-bold tracking-tight text-[var(--fin-text)] md:text-2xl">Meu financeiro</h1></div>
              {units.length > 1 ? unitSelector : (
                <p className="inline-flex items-center gap-1.5 rounded-md bg-[var(--fin-accent-wash)] px-2.5 py-1.5 text-xs font-semibold text-[var(--fin-accent-soft)]"><Building2 className="h-4 w-4 text-[var(--fin-accent-soft)]" /> Unidade: {selectedUnit?.unit_name}</p>
              )}
            </header>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.6fr)]">
              <div className="space-y-3">
                <section className="grid gap-3 sm:grid-cols-2">
                  <MetricCard icon={<CheckCircle2 className="h-6 w-6" />} label="Laudos assinados no ciclo" value={String(summary?.signed_report_count ?? 0)} detail={`${fmtCalendarDate(summary?.cycle_start_display)} a ${fmtCalendarDate(summary?.cycle_end_display)}`} tone="teal" />
                  <MetricCard icon={<CircleDollarSign className="h-6 w-6" />} label="Repasses gerados no ciclo" value={fmtBRL(summary?.doctor_total)} detail="Valores aplicados aos eventos financeiros ativos" tone="blue" />
                </section>

                <section id="laudos-entregues" className="overflow-hidden rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--fin-line-soft)] px-4 py-3">
                    <div><h2 className="text-base font-semibold text-[var(--fin-text)]">Laudos entregues</h2><p className="mt-0.5 text-xs text-[var(--fin-muted)]">Busca com o mesmo critério do log: paciente, modalidade ou exame.</p></div>
                    <div className="flex items-center gap-2"><label className="relative block"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fin-muted-dim)]" /><input aria-label="Buscar laudos entregues" value={reportFilter} onChange={(event) => setReportFilter(event.target.value)} placeholder="Buscar paciente ou exame" className="h-8 w-52 rounded-lg border border-[var(--fin-line)] bg-[var(--fin-panel)] pl-8 pr-2 text-xs outline-none focus:border-[var(--fin-accent)] sm:w-60" /></label>{financeQuery.isFetching && <span className="text-xs font-medium text-[var(--fin-accent-soft)]">Atualizando…</span>}</div>
                  </div>
                  <div className="space-y-3 p-3 md:hidden">
                    {financeQuery.isLoading ? <p className="py-8 text-center text-sm text-[var(--fin-muted)]">Carregando laudos…</p> : visibleReports.length === 0 ? <p className="py-8 text-center text-sm text-[var(--fin-muted)]">{reportFilter ? "Nenhum laudo encontrado para a busca." : "Nenhum laudo entregue neste ciclo."}</p> : visibleReports.map((report) => <MobileReportCard key={report.id} report={report} onPrint={downloadConfiguredReport} downloading={downloadingReportId === report.id} />)}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="min-w-[780px] w-full text-sm"><thead className="bg-[var(--fin-panel-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--fin-muted)]"><tr><th className="px-4 py-2.5">Assinatura</th><th className="px-4 py-2.5">Paciente</th><th className="px-3 py-2.5">Modalidade</th><th className="px-3 py-2.5">Exame</th><th className="px-3 py-2.5">Situação</th><th className="px-4 py-2.5 text-right">Ação</th></tr></thead><tbody className="divide-y divide-slate-100">
                      {financeQuery.isLoading ? <tr><td colSpan={6} className="px-5 py-12 text-center text-[var(--fin-muted)]">Carregando laudos…</td></tr> : visibleReports.length === 0 ? <tr><td colSpan={6} className="px-5 py-12 text-center text-[var(--fin-muted)]">{reportFilter ? "Nenhum laudo encontrado para a busca." : "Nenhum laudo entregue neste ciclo."}</td></tr> : visibleReports.map((report) => <DesktopReportRow key={report.id} report={report} onPrint={downloadConfiguredReport} downloading={downloadingReportId === report.id} />)}
                    </tbody></table>
                  </div>
                </section>

                {/* NOVO (claude/modulo-repasse-preco-externo): status de repasse — a API já calculava
                    pago/pendente por evento, mas esta tela nunca exibia. Agora mostra e permite ao
                    médico confirmar ou contestar um repasse marcado como pago pela clínica. */}
                <section id="repasses" className="overflow-hidden rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] shadow-sm">
                  <div className="border-b border-[var(--fin-line-soft)] px-4 py-3">
                    <h2 className="text-base font-semibold text-[var(--fin-text)]">Repasses</h2>
                    <p className="mt-0.5 text-xs text-[var(--fin-muted)]">Situação de cada repasse deste ciclo, nesta unidade.</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {financeQuery.isLoading ? (
                      <p className="px-4 py-8 text-center text-sm text-[var(--fin-muted)]">Carregando repasses…</p>
                    ) : repasses.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-[var(--fin-muted)]">Nenhum repasse gerado neste ciclo.</p>
                    ) : repasses.map((event: any) => (
                      <RepasseRow
                        key={event.id}
                        event={event}
                        onRespond={(status, note) => confirmPayment.mutate({
                          event_type: event.event_source,
                          event_id: typeof event.id === "string" ? Number(String(event.id).replace("catalog-", "")) : event.id,
                          status,
                          note,
                        })}
                        isPending={confirmPayment.isPending}
                      />
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] px-4 py-3 shadow-sm"><div className="grid gap-3 sm:grid-cols-3"><CycleDate label="Início" value={fmtCalendarDate(summary?.cycle_start_display)} /><CycleDate label="Término" value={fmtCalendarDate(summary?.cycle_end_display)} /><CycleDate label="Unidade" value={selectedUnit?.unit_name ?? "—"} building /></div></section>
              </div>

              <aside id="configuracao-vigente" className="h-fit rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-4 shadow-sm">
                <h2 className="text-base font-semibold text-[var(--fin-text)]">Minha configuração vigente</h2>
                <div className="mt-3 flex gap-2 rounded-lg border border-[var(--fin-accent-border)] bg-[var(--fin-accent-wash)] p-2.5 text-xs text-[var(--fin-muted)]"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[var(--fin-accent-soft)]" /><p>Valores definidos pelo administrador, somente para consulta.</p></div>
                <h3 className="mt-4 text-sm font-semibold text-[var(--fin-text)]">Valor efetivo por modalidade</h3>
                <div className="mt-2 overflow-hidden rounded-lg border border-[var(--fin-line)]">
                  {pricesQuery.isLoading ? <div className="p-4 text-sm text-[var(--fin-muted)]">Carregando valores…</div> : pricesQuery.data?.map((price) => { const modality = MODALITY_META[price.modality] ?? { label: price.modality, className: "bg-[var(--fin-muted-dim)]" }; return <div key={price.modality} className="flex items-center justify-between gap-3 border-b border-[var(--fin-line-soft)] px-3 py-2.5 last:border-b-0"><span className={`rounded-md px-2 py-1 text-xs font-bold text-[var(--fin-accent-ink)] ${modality.className}`}>{modality.label}</span><div className="min-w-0 text-right"><p className={`font-semibold ${price.price_per_report === null ? "text-[var(--fin-warn)]" : "text-[var(--fin-text)]"}`}>{price.price_per_report === null ? "Não configurado" : fmtBRL(price.price_per_report)}</p><p className="truncate text-[10px] text-[var(--fin-muted)]">{price.source_label}</p></div></div>; })}
                </div>
                <div className="mt-4 space-y-2 text-xs text-[var(--fin-muted)]"><p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[var(--fin-accent-soft)]" /> Vigência: ciclo atual</p><p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[var(--fin-accent-soft)]" /> Unidade: {selectedUnit?.unit_name}</p></div>
                <p className="mt-4 rounded-lg bg-[var(--fin-panel-2)] p-2.5 text-[11px] leading-relaxed text-[var(--fin-muted)]">Preço individual tem prioridade. Sem ele, é exibido o <strong>Preço padrão da unidade</strong> usado na assinatura. Alterações futuras não recalculam documentos entregues.</p>
              </aside>

              <section id="periodos-anteriores" className="rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-[var(--fin-accent-soft)]" />
                  <h2 className="fin-head text-base font-semibold text-[var(--fin-text)]">Períodos anteriores</h2>
                </div>
                <p className="mt-0.5 text-xs text-[var(--fin-muted)]">Ciclos já fechados, em todas as unidades. O ciclo atual fica no resumo acima.</p>
                <div className="mt-3 divide-y divide-[var(--fin-line-soft)]">
                  {pastCyclesQuery.isLoading ? (
                    <p className="py-6 text-center text-sm text-[var(--fin-muted)]">Carregando…</p>
                  ) : (pastCyclesQuery.data?.cycles.length ?? 0) === 0 ? (
                    <p className="py-6 text-center text-sm text-[var(--fin-muted)]">Nenhum ciclo fechado ainda.</p>
                  ) : pastCyclesQuery.data!.cycles.map((cycle) => (
                    <div key={cycle.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--fin-text)]">{cycle.unit_name ?? "Unidade"}</p>
                        <p className="mt-0.5 text-xs text-[var(--fin-muted)]">
                          {fmtCalendarDate(String(cycle.cycle_starts_at).slice(0, 10))} a {fmtCalendarDate(String(cycle.cycle_ends_at).slice(0, 10))}
                          {" · "}{cycle.reports_count} laudo{cycle.reports_count === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-[var(--fin-text)]">{fmtBRL(cycle.amount_due)}</p>
                        <p className="mt-0.5 text-[10px] font-medium text-[var(--fin-muted-dim)]">{cycle.received_at ? "Pago" : "Pendente"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </FinanceShell>
  );
}

function MobileReportCard({ report, onPrint, downloading }: { report: any; onPrint: (report: any) => void; downloading: boolean }) {
  const status = statusMeta(report.status); const modality = MODALITY_META[report.modality ?? ""] ?? { label: report.modality ?? "—", className: "bg-[var(--fin-muted-dim)]" };
  return <article className="rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel-2)] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-[var(--fin-text)]">{displayPatient(report.patient_name)}</p><p className="mt-1 text-xs text-[var(--fin-muted)]">Assinado em {fmtDate(report.signed_at)}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${status.className}`}>{status.label}</span></div><div className="mt-2.5 flex items-center gap-2 text-sm text-[var(--fin-muted)]"><span className={`rounded-md px-2 py-1 text-xs font-bold text-[var(--fin-accent-ink)] ${modality.className}`}>{modality.label}</span><span className="min-w-0 truncate">{report.document_label ?? report.study_description ?? "Laudo entregue"}</span></div>{report.print_target ? <button type="button" disabled={downloading} onClick={() => onPrint(report)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-400/40 bg-[var(--fin-panel)] px-3 py-3 text-sm font-semibold text-violet-300 transition hover:bg-violet-500/100/15 disabled:cursor-wait disabled:opacity-60">{downloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}{downloading ? "Preparando PDF…" : "Baixar PDF"}</button> : <span className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--fin-line)] px-3 py-3 text-sm font-medium text-[var(--fin-muted-dim)]"><FileText className="h-4 w-4" /> PDF indisponível</span>}</article>;
}

function DesktopReportRow({ report, onPrint, downloading }: { report: any; onPrint: (report: any) => void; downloading: boolean }) {
  const status = statusMeta(report.status); const modality = MODALITY_META[report.modality ?? ""] ?? { label: report.modality ?? "—", className: "bg-[var(--fin-muted-dim)]" };
  return <tr className="hover:bg-[var(--fin-panel-2)]/80"><td className="whitespace-nowrap px-4 py-3 text-[var(--fin-muted)]">{fmtDate(report.signed_at)}</td><td className="px-4 py-3 font-medium text-[var(--fin-text)]">{displayPatient(report.patient_name)}</td><td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-xs font-bold text-[var(--fin-accent-ink)] ${modality.className}`}>{modality.label}</span></td><td className="max-w-56 truncate px-3 py-3 text-[var(--fin-muted)]">{report.document_label ?? report.study_description ?? "Laudo entregue"}</td><td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${status.className}`}>{status.label}</span></td><td className="px-4 py-3 text-right">{report.print_target ? <button type="button" disabled={downloading} onClick={() => onPrint(report)} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-400/40 bg-[var(--fin-panel)] px-3 py-2 text-xs font-semibold text-violet-300 transition hover:bg-violet-500/100/15 disabled:cursor-wait disabled:opacity-60">{downloading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}{downloading ? "Preparando…" : "Baixar PDF"}</button> : <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--fin-line)] px-3 py-2 text-xs font-medium text-[var(--fin-muted-dim)]"><FileText className="h-3.5 w-3.5" /> Indisponível</span>}</td></tr>;
}

function MetricCard({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: "teal" | "blue" }) {
  const toneClasses = tone === "teal" ? "bg-teal-500/10 text-teal-300" : "bg-[var(--fin-accent-wash)] text-[var(--fin-accent-soft)]";
  return <section className="rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-4 shadow-sm"><div className="flex gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toneClasses}`}>{icon}</span><div className="min-w-0"><p className="font-semibold text-[var(--fin-text)]">{label}</p><p className="mt-0.5 text-xs text-[var(--fin-muted)]">{detail}</p><p className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--fin-text)]">{value}</p></div></div></section>;
}

function CycleDate({ label, value, building = false }: { label: string; value: string; building?: boolean }) {
  const Icon = building ? Building2 : CalendarDays;
  return <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--fin-line)] text-[var(--fin-muted)]"><Icon className="h-4 w-4" /></span><div><p className="text-[11px] font-medium uppercase tracking-wide text-[var(--fin-muted)]">{label}</p><p className="mt-0.5 font-semibold text-[var(--fin-text)]">{value}</p></div></div>;
}

function EmptyFinancialAccess() {
  return <div className="mx-auto max-w-xl rounded-2xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-10 text-center shadow-sm"><Landmark className="mx-auto h-10 w-10 text-[var(--fin-muted-dim)]" /><h1 className="mt-4 text-xl font-semibold text-[var(--fin-text)]">Nenhuma unidade financeira disponível</h1><p className="mt-2 text-sm text-[var(--fin-muted)]">Solicite ao responsável financeiro o vínculo e a permissão para visualizar seus dados na unidade.</p></div>;
}

function FinancialError({ onRetry }: { onRetry: () => void }) {
  return <div className="mx-auto max-w-xl rounded-2xl border border-[var(--fin-danger-border)] bg-[var(--fin-panel)] p-10 text-center shadow-sm"><AlertCircle className="mx-auto h-10 w-10 text-[var(--fin-danger)]" /><h1 className="mt-4 text-xl font-semibold text-[var(--fin-text)]">Não foi possível carregar seu financeiro</h1><p className="mt-2 text-sm text-[var(--fin-muted)]">Nenhum dado foi ocultado como lista vazia. Tente novamente ou comunique o responsável pela unidade.</p><button onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--fin-accent)] px-4 py-2 text-sm font-semibold text-[var(--fin-accent-ink)] hover:bg-[var(--fin-accent-hover)]"><RefreshCw className="h-4 w-4" /> Tentar novamente</button></div>;
}

// ─── NOVO (auditoria claude/modulo-repasse-preco-externo) ───────────────────
// Linha de um repasse com status pago/pendente e confirmação do médico.
// Uma resposta só (confirmar ou contestar); o backend recusa uma segunda.
function RepasseRow({
  event, onRespond, isPending,
}: {
  event: any;
  onRespond: (status: "confirmed" | "disputed", note?: string) => void;
  isPending: boolean;
}) {
  const [disputing, setDisputing] = useState(false);
  const [note, setNote] = useState("");

  if (!event.doctor_received_at) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--fin-text)]">{displayPatient(event.patient_name)} — {event.exam_name_snapshot ?? "Exame"}</p><p className="mt-0.5 text-xs text-[var(--fin-muted)]">Assinado em {fmtDate(event.signed_at)}</p></div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--fin-warn-wash)] px-2.5 py-1 text-xs font-semibold text-[var(--fin-warn)] ring-1 ring-[var(--fin-warn-border)]"><Clock className="h-3.5 w-3.5" /> Pendente</span>
      </div>
    );
  }

  if (event.doctor_confirmation_status === "confirmed") {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--fin-text)]">{displayPatient(event.patient_name)} — {event.exam_name_snapshot ?? "Exame"}</p><p className="mt-0.5 text-xs text-[var(--fin-muted)]">Pago em {fmtDate(event.doctor_received_at)} · confirmado em {fmtDate(event.doctor_confirmed_at)}</p></div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--fin-success-wash)] px-2.5 py-1 text-xs font-semibold text-[var(--fin-success)] ring-1 ring-[var(--fin-success)]/30"><CheckCircle2 className="h-3.5 w-3.5" /> Confirmado</span>
      </div>
    );
  }

  if (event.doctor_confirmation_status === "disputed") {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--fin-text)]">{displayPatient(event.patient_name)} — {event.exam_name_snapshot ?? "Exame"}</p><p className="mt-0.5 text-xs text-[var(--fin-muted)]">Pago em {fmtDate(event.doctor_received_at)} · contestado em {fmtDate(event.doctor_confirmed_at)}</p></div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--fin-danger-wash)] px-2.5 py-1 text-xs font-semibold text-[var(--fin-danger)] ring-1 ring-[var(--fin-danger-border)]"><AlertCircle className="h-3.5 w-3.5" /> Contestado</span>
        </div>
        {event.doctor_confirmation_note && <p className="mt-1.5 rounded-lg bg-[var(--fin-danger-wash)] px-2.5 py-1.5 text-xs text-[var(--fin-danger)]">"{event.doctor_confirmation_note}"</p>}
      </div>
    );
  }

  // Pago pela clínica, aguardando a resposta do médico.
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--fin-text)]">{displayPatient(event.patient_name)} — {event.exam_name_snapshot ?? "Exame"}</p><p className="mt-0.5 text-xs text-[var(--fin-muted)]">Marcado como pago em {fmtDate(event.doctor_received_at)}{event.paid_by_name ? ` por ${event.paid_by_name}` : ""}</p></div>
        {!disputing && (
          <div className="flex shrink-0 items-center gap-2">
            <button disabled={isPending} onClick={() => onRespond("confirmed")} className="rounded-lg border border-emerald-300 bg-[var(--fin-panel)] px-3 py-1.5 text-xs font-semibold text-[var(--fin-success)] transition hover:bg-[var(--fin-success-wash)] disabled:opacity-60">Recebi</button>
            <button disabled={isPending} onClick={() => setDisputing(true)} className="rounded-lg border border-[var(--fin-danger-border)] bg-[var(--fin-panel)] px-3 py-1.5 text-xs font-semibold text-[var(--fin-danger)] transition hover:bg-[var(--fin-danger-wash)] disabled:opacity-60">Não recebi</button>
          </div>
        )}
      </div>
      {disputing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={note}
            onChange={(inputEvent) => setNote(inputEvent.target.value)}
            placeholder="Descreva brevemente o motivo"
            className="h-8 min-w-52 flex-1 rounded-lg border border-[var(--fin-line)] px-2.5 text-xs outline-none focus:border-[var(--fin-danger)]"
          />
          <button
            disabled={isPending || note.trim().length < 3}
            onClick={() => onRespond("disputed", note.trim())}
            className="rounded-lg bg-[var(--fin-danger)] px-3 py-1.5 text-xs font-semibold text-[var(--fin-accent-ink)] hover:opacity-90 disabled:opacity-60"
          >
            Enviar contestação
          </button>
          <button onClick={() => { setDisputing(false); setNote(""); }} className="rounded-lg border border-[var(--fin-line)] px-3 py-1.5 text-xs font-medium text-[var(--fin-muted)] hover:bg-[var(--fin-panel-2)]">Cancelar</button>
        </div>
      )}
    </div>
  );
}
