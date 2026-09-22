/**
 * FinanceDashboard — Financeiro v2
 * Catálogo de unidades e detalhe financeiro por rota. Preços por modalidade
 * preservam vigências; a tela não sobrescreve valores históricos.
 */
import React, { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { FinanceShell } from "./FinanceShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileText,
  Loader2,
  ScrollText,
  Settings2,
  Stethoscope,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { fmtBRL, MONTHS } from "./FinanceModals";
import { ProfitModal } from "./FinanceMeuResponsavel";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const MODALITIES = ["CT", "CR", "MR", "US"] as const;
const MODALITY_LABEL: Record<(typeof MODALITIES)[number], string> = { CT: "CT", CR: "CR", MR: "RM", US: "US" };

type UnitSummary = {
  unit_id: number;
  unit_name: string;
  cycle_label: string;
  cycle_start_date: string;
  cycle_end_date: string;
  historical_system_rates: Array<{ rate: number; event_count: number }>;
  has_multiple_system_rates: boolean;
  total_laudos: number;
  system_total: number;
  doctor_total: number;
  system_pending: number;
  doctor_pending: number;
};

function unitSlug(unitName: string) {
  return unitName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function asMoney(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function monthReference(year: number, month: number) {
  return new Date(year, month - 1, 15, 12, 0, 0).toISOString();
}

function historicalSystemRatesLabel(unit: UnitSummary) {
  if (!unit.historical_system_rates?.length) return "Sem taxa histórica registrada nos eventos deste ciclo";
  return unit.historical_system_rates
    .map(({ rate, event_count }) => `${fmtBRL(asMoney(rate))} em ${event_count} evento${event_count === 1 ? "" : "s"}`)
    .join(" · ");
}

function MiniMetric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "cyan" | "emerald" }) {
  const tones = { slate: "text-[var(--fin-muted)]", cyan: "text-[var(--fin-accent-soft)]", emerald: "text-[var(--fin-success)]" };
  return <div className="rounded-lg border border-[var(--fin-line-soft)] bg-[var(--fin-panel-2)] px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--fin-muted-dim)]">{label}</p><p className={`mt-0.5 text-sm font-semibold tabular-nums ${tones[tone]}`}>{value}</p></div>;
}

function UnitCatalogCard({ unit, onOpen }: { unit: UnitSummary; onOpen: () => void }) {
  const { data: prices } = trpc.financeSimple.getUnitDefaultPrices.useQuery({ unit_id: unit.unit_id });
  const eventCount = Number(unit.total_laudos ?? 0);
  const systemRate = asMoney(prices?.default_system_price);
  const systemCycleTotal = asMoney(unit.system_total);
  return (
    <article className="group flex min-h-[218px] flex-col rounded-2xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--fin-accent)] hover:shadow-md">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><Building2 className="h-4 w-4 shrink-0 text-[var(--fin-accent-soft)]" /><h2 className="truncate text-sm font-bold uppercase tracking-tight text-[var(--fin-text)]">{unit.unit_name}</h2></div><p className="mt-1 text-xs font-medium text-[var(--fin-muted)]">Ciclo: {unit.cycle_label}</p></div><span className="shrink-0 rounded-full bg-[var(--fin-success-wash)] px-2 py-1 text-[10px] font-semibold text-[var(--fin-success)] ring-1 ring-[var(--fin-success-wash)]">Ativa</span></div>
      <div className="mt-4 grid grid-cols-2 gap-2"><MiniMetric label="Eventos do ciclo atual" value={String(eventCount)} tone="cyan" /><MiniMetric label="Valor configurado por evento" value={prices?.default_system_price == null ? "Não definida" : fmtBRL(systemRate)} tone="emerald" /><MiniMetric label="Rendimento atual do ciclo" value={fmtBRL(systemCycleTotal)} tone="emerald" /></div>
      <p className="mt-3 text-[11px] leading-4 text-[var(--fin-muted)]">A consulta de taxas e valores de períodos anteriores fica na aba Histórico.</p><div className="mt-auto flex justify-end pt-4"><Button size="sm" onClick={onOpen} className="h-8 bg-[var(--fin-accent)] px-3 text-xs hover:bg-[var(--fin-accent-hover)]">Abrir financeiro <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button></div>
    </article>
  );
}

function SystemRateEditor({ unitId, currentPrice }: { unitId: number; currentPrice: number | null | undefined; defaultDoctorPrice?: number | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(currentPrice ?? ""));
  const { data: rate } = trpc.financeSimple.getUnitSystemRate.useQuery({ unit_id: unitId });
  const utils = trpc.useUtils();
  const save = trpc.financeSimple.setUnitSystemRate.useMutation({
    onSuccess: () => { toast.success("Nova taxa LAUDS publicada com vigência auditável"); utils.financeSimple.getUnitSystemRate.invalidate({ unit_id: unitId }); utils.financeSimple.getUnitDefaultPrices.invalidate({ unit_id: unitId }); utils.financeSimple.unitSummary.invalidate(); setOpen(false); },
    onError: (error) => toast.error(error.message),
  });
  const nextDate = rate?.next_change_at ? new Date(rate.next_change_at) : new Date();
  return <><Button variant="outline" size="sm" className="h-8 border-[var(--fin-accent-border)] text-xs text-[var(--fin-accent-soft)] hover:bg-[var(--fin-accent-wash)]" onClick={() => { setValue(String(rate?.price_per_event ?? currentPrice ?? "")); setOpen(true); }}><Edit3 className="mr-1.5 h-3.5 w-3.5" />Editar taxa</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Taxa LAUDS por evento</DialogTitle></DialogHeader><p className="text-sm text-[var(--fin-muted)]">{rate?.configured ? `A taxa vigente será preservada. A nova taxa somente começa no próximo ciclo, em ${nextDate.toLocaleDateString("pt-BR")}.` : "Esta é a primeira taxa versionada da unidade e será registrada com autoria e início de vigência."}</p><Input type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0,00" /><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={save.isPending} onClick={() => save.mutate({ unit_id: unitId, price_per_event: Number(value) || 0, starts_at: nextDate.toISOString() })}>{save.isPending ? "Publicando..." : "Publicar nova vigência"}</Button></DialogFooter></DialogContent></Dialog></>;
}

function UnitModalityPrices({ unitId, referenceDate, canManage }: { unitId: number; referenceDate: string; canManage: boolean }) {
  const { data: prices = [], isLoading } = trpc.financeSimple.getUnitModalityPrices.useQuery({ unit_id: unitId });
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const save = trpc.financeSimple.setUnitModalityPrice.useMutation({
    onSuccess: () => { utils.financeSimple.getUnitModalityPrices.invalidate({ unit_id: unitId }); toast.success("Valor padrão publicado com histórico de vigência"); },
    onError: (error) => toast.error(error.message),
  });
  const byModality = new Map(prices.map((price) => [price.modality, price]));
  return <><div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">{MODALITIES.map((modality) => {
    const price = byModality.get(modality);
    const current = Number(price?.price_per_event ?? 0);
    const draft = drafts[modality];
    const commit = () => {
      if (!canManage || draft === undefined) return;
      const nextValue = Number(draft);
      if (!Number.isFinite(nextValue) || nextValue < 0) return toast.error("Informe um valor válido, igual ou maior que zero.");
      if (price?.configured && Math.abs(nextValue - current) < 0.001) return;
      save.mutate({ unit_id: unitId, modality, price_per_event: nextValue });
    };
    return <div key={modality} className="rounded-xl border border-[var(--fin-line-soft)] bg-[var(--fin-panel-2)] p-4"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-[var(--fin-muted)]">{MODALITY_LABEL[modality]}</p>{price?.configured && <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fin-success)]">Vigente</span>}</div>{canManage ? <Input aria-label={`Valor padrão vigente ${MODALITY_LABEL[modality]}`} className="mt-2 h-9 border-[var(--fin-line)] bg-[var(--fin-panel)] px-2 text-sm font-bold tabular-nums text-[var(--fin-text)]" type="number" min="0" step="0.01" value={draft ?? current.toFixed(2)} onChange={(event) => setDrafts((previous) => ({ ...previous, [modality]: event.target.value }))} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} disabled={isLoading || save.isPending} /> : <p className="mt-2 text-lg font-bold text-[var(--fin-text)]">{fmtBRL(current)}</p>}<p className="mt-2 text-[11px] text-[var(--fin-muted)]">Fallback para médico sem valor individual</p></div>;
  })}</div><div className="flex justify-end border-t border-[var(--fin-line-soft)] px-5 py-3"><AuditTrailLauncher unitId={unitId} referenceDate={referenceDate} /></div></>;
}

function DoctorModalityCells({ unitId, doctorId, responsibleId, fallbacks, canManage }: { unitId: number; doctorId: number; responsibleId: number | null; fallbacks: Map<string, number>; canManage: boolean }) {
  const { data: prices } = trpc.financeSimple.listDoctorModalityPrices.useQuery({ financialResponsibleId: responsibleId ?? 0, unitId, doctorUserId: doctorId }, { enabled: responsibleId !== null });
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const save = trpc.financeSimple.setDoctorModalityPrice.useMutation({
    onSuccess: () => { utils.financeSimple.listDoctorModalityPrices.invalidate({ financialResponsibleId: responsibleId ?? 0, unitId, doctorUserId: doctorId }); toast.success("Preço individual registrado com nova vigência"); },
    onError: (error) => toast.error(error.message),
  });
  const currentByModality = new Map<string, number>();
  const now = new Date();
  for (const price of prices ?? []) {
    const starts = new Date(price.starts_at); const ends = price.ends_at ? new Date(price.ends_at) : null;
    if (starts <= now && (!ends || ends >= now) && !currentByModality.has(price.modality)) currentByModality.set(price.modality, asMoney(price.price_per_report));
  }
  return <>{MODALITIES.map((modality) => {
    const configured = currentByModality.get(modality); const fallback = fallbacks.get(modality) ?? 0; const draft = drafts[modality];
    const commit = () => {
      if (!canManage || responsibleId === null || draft === undefined) return;
      const nextValue = Number(draft);
      if (!Number.isFinite(nextValue) || nextValue < 0) return toast.error("Informe um preço válido, igual ou maior que zero.");
      if (configured !== undefined && Math.abs(nextValue - configured) < 0.001) return;
      save.mutate({ financialResponsibleId: responsibleId, unitId, doctorUserId: doctorId, modality, pricePerReport: nextValue.toFixed(2), startsAt: new Date().toISOString() });
    };
    return <td key={modality} className="px-2 py-2 text-center">{canManage && responsibleId !== null ? <Input aria-label={`Preço de médico ${MODALITY_LABEL[modality]}`} className="h-8 min-w-20 border-[var(--fin-line)] bg-[var(--fin-panel)] px-2 text-center text-xs tabular-nums" type="number" min="0" step="0.01" placeholder={fallback.toFixed(2)} value={draft ?? (configured === undefined ? "" : configured.toFixed(2))} onChange={(event) => setDrafts((previous) => ({ ...previous, [modality]: event.target.value }))} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} disabled={save.isPending} /> : <span className="text-xs font-medium text-[var(--fin-muted)]">{configured === undefined ? <span className="text-[var(--fin-muted-dim)]">Padrão {fmtBRL(fallback)}</span> : fmtBRL(configured)}</span>}</td>;
  })}</>;
}

type AuditEvent = {
  id: string;
  source: "legacy" | "catalog";
  billing_occurrence: number | null;
  source_report_id: number | null;
  report_id?: number | null;
  patient_name: string | null;
  study_date: Date | string | null;
  study_description: string | null;
  modality: string | null;
  clinical_label: string | null;
  doctor_name: string | null;
  signed_at: Date | string | null;
  doctor_amount_due: string | number | null;
  system_amount_due: string | number | null;
  doctor_received_at: Date | string | null;
  system_paid_at: Date | string | null;
  pricing_status: string | null;
  financial_status: "active" | "cancelled";
};

function auditDate(value: Date | string | null) {
  return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function auditOriginDescription(event: AuditEvent) {
  if (event.source === "legacy") return "Evento legado; ocorrência não registrada";
  if (event.billing_occurrence == null) return "Ocorrência não registrada";
  if (event.source_report_id == null) return `Ocorrência ${event.billing_occurrence}; origem histórica sem laudo vinculado`;
  return `Ocorrência ${event.billing_occurrence}; laudo de origem #${event.source_report_id}`;
}

function AuditTrailLauncher({ unitId, referenceDate }: { unitId: number; referenceDate: string }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const { data, isLoading, isError, error, refetch } = trpc.financeSimple.auditEventsByUnit.useQuery({ unit_id: unitId, reference_date: referenceDate }, { enabled: open });
  const normalized = filter.trim().toLocaleLowerCase("pt-BR");
  const events = useMemo(() => ((data?.events ?? []) as AuditEvent[]).filter((event) => !normalized || [event.patient_name, event.study_description, event.clinical_label, event.doctor_name, event.modality, event.source].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(normalized)), [data?.events, normalized]);
  const errorMessage = error instanceof Error ? error.message : "Não foi possível carregar o log auditável deste ciclo.";
  return <><Button variant="outline" size="sm" className="h-8 border-[var(--fin-accent-border)] text-xs text-[var(--fin-accent-soft)] hover:bg-[var(--fin-accent-wash)]" onClick={() => setOpen(true)}><ScrollText className="mr-1.5 h-3.5 w-3.5" />Ver log do ciclo</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[88vh] max-w-6xl overflow-hidden p-0"><DialogHeader className="border-b border-[var(--fin-line-soft)] px-6 py-5"><DialogTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5 text-[var(--fin-accent-soft)]" /> Log auditável dos eventos financeiros</DialogTitle><p className="mt-1 text-sm font-normal text-[var(--fin-muted)]">Cada linha identifica a assinatura que gerou o evento, sua ocorrência clínica, valores e situação financeira.</p></DialogHeader><div className="border-b border-[var(--fin-line-soft)] px-6 py-3"><Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar por paciente, médico, modalidade ou exame" className="h-9 max-w-md text-sm" /></div><div className="max-h-[60vh] overflow-auto"><table className="min-w-[1080px] w-full text-sm"><thead className="sticky top-0 bg-[var(--fin-panel-2)] text-[10px] uppercase tracking-[0.1em] text-[var(--fin-muted)]"><tr><th className="px-5 py-3 text-left">Data e evento</th><th className="px-5 py-3 text-left">Paciente e estudo</th><th className="px-5 py-3 text-left">Médico da assinatura</th><th className="px-4 py-3 text-left">Origem</th><th className="px-5 py-3 text-right">Médico</th><th className="px-5 py-3 text-right">LAUDS</th><th className="px-5 py-3 text-left">Situação</th></tr></thead><tbody className="divide-y divide-[var(--fin-line-soft)]">{isLoading ? <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-[var(--fin-accent-soft)]" /></td></tr> : isError ? <tr><td colSpan={7} className="py-12 text-center text-[var(--fin-danger)]"><p className="font-semibold">Falha ao carregar o log auditável.</p><p className="mt-1 text-sm text-[var(--fin-danger)]">{errorMessage}</p><Button type="button" variant="outline" size="sm" className="mt-4 border-[var(--fin-danger-border)] text-[var(--fin-danger)] hover:bg-[var(--fin-danger-wash)]" onClick={() => void refetch()}>Tentar novamente</Button></td></tr> : events.length === 0 ? <tr><td colSpan={7} className="py-12 text-center text-[var(--fin-muted)]">{filter ? "Nenhum evento encontrado." : "Não há eventos no ciclo consultado."}</td></tr> : events.map((event) => <tr key={event.id} className={`align-top hover:bg-[var(--fin-panel-2)] ${event.financial_status === "cancelled" ? "bg-[var(--fin-danger-wash)]" : ""}`}><td className="px-5 py-3"><p className="font-medium text-[var(--fin-text)]">{auditDate(event.signed_at)}</p><p className="mt-0.5 text-xs text-[var(--fin-muted-dim)]">{event.modality ?? "—"} · {event.clinical_label ?? event.study_description ?? "Evento financeiro"}</p></td><td className="px-5 py-3"><p className="font-semibold text-[var(--fin-text)]">{event.patient_name?.replace(/\^/g, " ") ?? "Paciente não disponível"}</p><p className="mt-0.5 text-xs text-[var(--fin-muted)]">Estudo: {auditDate(event.study_date)}{event.study_description ? ` · ${event.study_description}` : ""}</p></td><td className="px-5 py-3 text-[var(--fin-muted)]"><p>{event.doctor_name ?? "Médico não disponível"}</p><p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--fin-muted-dim)]">{event.financial_status === "cancelled" ? "Assinatura histórica cancelada" : "Assinatura registrada no evento"}</p></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${event.source === "catalog" ? "bg-[var(--fin-accent-wash)] text-[var(--fin-accent-soft)]" : "bg-[var(--fin-panel-2)] text-[var(--fin-muted)]"}`}>{event.source === "catalog" ? "Catálogo" : "Legado"}</span><p className="mt-2 max-w-44 text-[11px] leading-4 text-[var(--fin-muted)]">{auditOriginDescription(event)}</p></td><td className="px-5 py-3 text-right font-semibold text-[var(--fin-text)]">{fmtBRL(asMoney(event.doctor_amount_due))}<p className={`mt-1 text-[10px] font-semibold uppercase ${event.financial_status === "cancelled" ? "text-[var(--fin-danger)]" : event.doctor_received_at ? "text-[var(--fin-success)]" : "text-[var(--fin-warn)]"}`}>{event.financial_status === "cancelled" ? "Cancelado" : event.doctor_received_at ? "Pago" : "Pendente"}</p></td><td className="px-5 py-3 text-right font-semibold text-[var(--fin-text)]">{fmtBRL(asMoney(event.system_amount_due))}<p className={`mt-1 text-[10px] font-semibold uppercase ${event.financial_status === "cancelled" ? "text-[var(--fin-danger)]" : event.system_paid_at ? "text-[var(--fin-success)]" : "text-[var(--fin-warn)]"}`}>{event.financial_status === "cancelled" ? "Cancelado" : event.system_paid_at ? "Quitado" : "Pendente"}</p></td><td className="px-5 py-3 text-xs text-[var(--fin-muted)]">{event.financial_status === "cancelled" ? <><p>Evento cancelado; fora dos totais</p><p className="mt-1 text-[11px] text-[var(--fin-danger)]">A linha permanece apenas para auditoria.</p></> : event.pricing_status === "ok" ? "Preço aplicado" : event.pricing_status?.replace(/_/g, " ") ?? "Sem status"}</td></tr>)}</tbody></table></div></DialogContent></Dialog></>;
}

function HistoricalSettlement({ unitId, referenceDate, cycleLabel }: { unitId: number; referenceDate: string; cycleLabel: string }) {
  const { data, isLoading, isError, error, refetch } = trpc.financeSimple.auditEventsByUnit.useQuery({ unit_id: unitId, reference_date: referenceDate });
  const activeEvents = useMemo(() => ((data?.events ?? []) as AuditEvent[]).filter((event) => event.financial_status === "active"), [data?.events]);
  const doctorRows = useMemo(() => {
    const grouped = new Map<string, { name: string; events: AuditEvent[] }>();
    for (const event of activeEvents) {
      const name = event.doctor_name ?? "Médico não informado";
      const current = grouped.get(name) ?? { name, events: [] };
      current.events.push(event);
      grouped.set(name, current);
    }
    return Array.from(grouped.values()).map((group) => {
      const paidEvents = group.events.filter((event) => !!event.doctor_received_at);
      const amount = group.events.reduce((total, event) => total + asMoney(event.doctor_amount_due), 0);
      const paidAmount = paidEvents.reduce((total, event) => total + asMoney(event.doctor_amount_due), 0);
      return { ...group, amount, paidAmount, pendingAmount: amount - paidAmount, paidCount: paidEvents.length };
    }).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }, [activeEvents]);
  const systemPaidEvents = activeEvents.filter((event) => !!event.system_paid_at);
  const systemAmount = activeEvents.reduce((total, event) => total + asMoney(event.system_amount_due), 0);
  const systemPaidAmount = systemPaidEvents.reduce((total, event) => total + asMoney(event.system_amount_due), 0);
  const exportDoctorCsv = (doctor: { name: string; events: AuditEvent[] }) => {
    const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Período", "Médico", "Laudo", "Paciente", "Data do estudo", "Exame", "Modalidade", "Assinado em", "Valor médico", "Situação"],
      ...doctor.events.map((event) => [cycleLabel, doctor.name, event.source_report_id ?? event.report_id ?? "", event.patient_name?.replace(/\^/g, " ") ?? "", auditDate(event.study_date), event.clinical_label ?? event.study_description ?? "", event.modality ?? "", auditDate(event.signed_at), asMoney(event.doctor_amount_due).toFixed(2).replace(".", ","), event.doctor_received_at ? "Pago" : "Não pago"]),
    ];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `laudos-${doctor.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-${cycleLabel.replace(/[^0-9]+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  };
  if (isLoading) return <section className="mt-6 rounded-2xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-[var(--fin-accent-soft)]" /><p className="mt-3 text-sm text-[var(--fin-muted)]">Calculando o fechamento histórico do período.</p></section>;
  if (isError) return <section className="mt-6 rounded-2xl border border-[var(--fin-danger-border)] bg-[var(--fin-danger-wash)] p-6 text-[var(--fin-danger)]"><p className="font-semibold">Não foi possível montar o fechamento histórico.</p><p className="mt-1 text-sm">{error instanceof Error ? error.message : "Tente novamente."}</p><Button type="button" variant="outline" size="sm" className="mt-4 border-[var(--fin-danger-border)] text-[var(--fin-danger)]" onClick={() => void refetch()}>Tentar novamente</Button></section>;
  return <section className="mt-6 space-y-5"><div className="flex flex-col gap-2 border-b border-[var(--fin-line)] pb-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-bold text-[var(--fin-text)]">Fechamento histórico do período</h2><p className="mt-1 text-sm text-[var(--fin-muted)]">Laudos, valores e baixas financeiras de {cycleLabel}.</p></div><span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fin-muted)]">Consulta auditável</span></div><div className="grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fin-muted)]">Sistema · eventos</p><p className="mt-2 text-3xl font-bold text-[var(--fin-text)]">{activeEvents.length}</p><p className="mt-2 text-xs text-[var(--fin-muted)]">{systemPaidEvents.length} pago{systemPaidEvents.length === 1 ? "" : "s"} · {activeEvents.length - systemPaidEvents.length} não pago{activeEvents.length - systemPaidEvents.length === 1 ? "" : "s"}</p></div><div className="rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fin-muted)]">Sistema · valor</p><p className="mt-2 text-3xl font-bold text-[var(--fin-text)]">{fmtBRL(systemAmount)}</p><p className="mt-2 text-xs text-[var(--fin-muted)]">Pago: {fmtBRL(systemPaidAmount)} · Em aberto: {fmtBRL(systemAmount - systemPaidAmount)}</p></div><div className="rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fin-muted)]">Situação do sistema</p><p className={`mt-2 text-2xl font-bold ${activeEvents.length > 0 && systemPaidEvents.length === activeEvents.length ? "text-[var(--fin-success)]" : systemPaidEvents.length > 0 ? "text-[var(--fin-warn)]" : "text-[var(--fin-danger)]"}`}>{activeEvents.length === 0 ? "Sem eventos" : systemPaidEvents.length === activeEvents.length ? "Pago" : systemPaidEvents.length > 0 ? "Parcial" : "Não pago"}</p><p className="mt-2 text-xs text-[var(--fin-muted)]">Baixa registrada no próprio evento financeiro.</p></div></div><div className="overflow-hidden rounded-2xl border border-[var(--fin-line)] bg-[var(--fin-panel)] shadow-sm"><div className="border-b border-[var(--fin-line-soft)] p-5"><h3 className="font-bold text-[var(--fin-text)]">Fechamento por médico</h3><p className="mt-1 text-sm text-[var(--fin-muted)]">Exporte a lista dos laudos que compõem cada valor.</p></div><div className="overflow-x-auto"><table className="min-w-[880px] w-full text-sm"><thead className="bg-[var(--fin-panel-2)] text-[11px] uppercase tracking-[0.1em] text-[var(--fin-muted)]"><tr><th className="px-5 py-3 text-left">Médico</th><th className="px-4 py-3 text-center">Exames</th><th className="px-5 py-3 text-right">Valor</th><th className="px-5 py-3 text-center">Pagamento</th><th className="px-5 py-3 text-right">Laudos</th></tr></thead><tbody className="divide-y divide-[var(--fin-line-soft)]">{doctorRows.length === 0 ? <tr><td colSpan={5} className="py-10 text-center text-[var(--fin-muted)]">Nenhum evento ativo neste período.</td></tr> : doctorRows.map((doctor) => { const status = doctor.paidCount === doctor.events.length ? "Pago" : doctor.paidCount === 0 ? "Não pago" : "Parcial"; const statusClass = status === "Pago" ? "bg-[var(--fin-success-wash)] text-[var(--fin-success)]" : status === "Parcial" ? "bg-[var(--fin-warn-wash)] text-[var(--fin-warn)]" : "bg-[var(--fin-danger-wash)] text-[var(--fin-danger)]"; return <tr key={doctor.name} className="hover:bg-[var(--fin-panel-2)]"><td className="px-5 py-4 font-semibold text-[var(--fin-text)]">{doctor.name}</td><td className="px-4 py-4 text-center font-medium text-[var(--fin-muted)]">{doctor.events.length}</td><td className="px-5 py-4 text-right"><p className="font-bold text-[var(--fin-text)]">{fmtBRL(doctor.amount)}</p><p className="mt-1 text-xs text-[var(--fin-muted)]">Pago {fmtBRL(doctor.paidAmount)} · Aberto {fmtBRL(doctor.pendingAmount)}</p></td><td className="px-5 py-4 text-center"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass}`}>{status}</span></td><td className="px-5 py-4 text-right"><Button type="button" variant="outline" size="sm" className="border-[var(--fin-accent-border)] text-[var(--fin-accent-soft)] hover:bg-[var(--fin-accent-wash)]" onClick={() => exportDoctorCsv(doctor)}><FileText className="mr-1.5 h-3.5 w-3.5" />Exportar CSV</Button></td></tr>; })}</tbody></table></div></div></section>;
}

function UnitFinancialDetail({
  currentUnit,
  historicalUnit,
  activeView,
  onChangeView,
  historyYear,
  historyMonth,
  onChangeHistoryMonth,
  onBack,
}: {
  currentUnit: UnitSummary;
  historicalUnit: UnitSummary;
  activeView: "current" | "history";
  onChangeView: (view: "current" | "history") => void;
  historyYear: number;
  historyMonth: number;
  onChangeHistoryMonth: (direction: -1 | 1) => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const currentReference = useMemo(() => new Date().toISOString(), []);
  const historyReference = useMemo(() => monthReference(historyYear, historyMonth), [historyYear, historyMonth]);
  const visibleUnit = activeView === "current" ? currentUnit : historicalUnit;
  const visibleReference = activeView === "current" ? currentReference : historyReference;
  const { data: defaultPrices } = trpc.financeSimple.getUnitDefaultPrices.useQuery({ unit_id: currentUnit.unit_id });
  const { data: unitModalityPrices = [] } = trpc.financeSimple.getUnitModalityPrices.useQuery({ unit_id: currentUnit.unit_id });
  const { data: doctors = [], isLoading: doctorsLoading } = trpc.financeSimple.doctorSummaryByUnit.useQuery({ unit_id: currentUnit.unit_id, reference_date: visibleReference });
  const { data: linkedDoctors = [] } = trpc.financeSimple.listDoctorsForUnit.useQuery({ unit_id: currentUnit.unit_id });
  const { data: readiness } = trpc.financeSimple.unitFinancialReadiness.useQuery({ unit_id: currentUnit.unit_id });
  const isAdminMaster = user?.role === "admin_master";
  const canManagePrices = isAdminMaster || user?.role === "responsavel_financeiro";
  // NOVO (claude/modulo-repasse-preco-externo): preço de venda externa / lucro é exclusivo
  // do unit_admin aqui — admin_master não tem esse módulo, por decisão explícita de produto.
  const canManageExternalPrice = user?.role === "unit_admin";
  const [showProfitModal, setShowProfitModal] = useState(false);
  const systemCycleTotal = asMoney(visibleUnit.system_total);
  const historicalRates = historicalSystemRatesLabel(visibleUnit);
  const fallbacks = new Map(unitModalityPrices.map((price) => [price.modality, Number(price.price_per_event ?? 0)]));
  const doctorById = new Map(doctors.filter((doctor) => doctor.doctor_user_id != null).map((doctor) => [doctor.doctor_user_id as number, doctor]));
  const rows = linkedDoctors.length
    ? linkedDoctors.map((doctor: any) => ({ id: doctor.doctor_user_id ?? doctor.id, name: doctor.doctor_name ?? doctor.name ?? "Médico", summary: doctorById.get(doctor.doctor_user_id ?? doctor.id) }))
    : doctors.map((doctor) => ({ id: doctor.doctor_user_id ?? 0, name: doctor.doctor_name ?? "Médico", summary: doctor }));
  const changeHistoryMonth = (direction: -1 | 1) => onChangeHistoryMonth(direction);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--fin-muted)] transition-colors hover:text-[var(--fin-accent)]"><ChevronLeft className="h-4 w-4" /> Voltar às unidades</button>
      <div className="flex flex-col gap-4 border-b border-[var(--fin-line)] pb-6 md:flex-row md:items-start md:justify-between">
        <div><span className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--fin-accent-soft)]">Financeiro / Unidades</span><h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--fin-text)]">{currentUnit.unit_name}</h1><p className="mt-1 text-sm text-[var(--fin-muted)]">{activeView === "current" ? `Painel operacional do ciclo atual: ${currentUnit.cycle_label}.` : `Consulta histórica do período: ${historicalUnit.cycle_label}.`}</p></div>
        <div className="flex items-center gap-2">
          {/* CORREÇÃO (revisão independente Manus, 2026-09-17): o ProfitModal sempre usa o
              ciclo atual (não recebe reference_date); mostrar o botão também no modo
              histórico induzia o usuário a achar que estava vendo o lucro do período
              histórico selecionado. Só aparece no ciclo atual, que é o que ele de fato mostra. */}
          {canManageExternalPrice && activeView === "current" && <Button type="button" size="sm" variant="outline" className="border-[var(--fin-accent-border)] text-[var(--fin-accent-soft)]" onClick={() => setShowProfitModal(true)}>Preço externo / Lucro</Button>}
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--fin-success-wash)] px-3 py-1.5 text-xs font-semibold text-[var(--fin-success)] ring-1 ring-[var(--fin-success-wash)]"><CheckCircle2 className="h-3.5 w-3.5" /> Unidade ativa</span>
        </div>
      </div>
      {showProfitModal && <ProfitModal unitId={currentUnit.unit_id} unitName={currentUnit.unit_name} onClose={() => setShowProfitModal(false)} />}

      <div className="mt-6 flex flex-col gap-3 border-b border-[var(--fin-line)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-1 shadow-sm"><Button type="button" size="sm" variant={activeView === "current" ? "default" : "ghost"} className={activeView === "current" ? "bg-[var(--fin-accent)] hover:bg-[var(--fin-accent-hover)]" : ""} onClick={() => onChangeView("current")}>Ciclo atual</Button><Button type="button" size="sm" variant={activeView === "history" ? "default" : "ghost"} className={activeView === "history" ? "bg-[var(--fin-accent)] hover:bg-[var(--fin-accent-hover)]" : ""} onClick={() => onChangeView("history")}>Histórico</Button></div>
        {activeView === "history" && <div className="flex items-center gap-2 rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-1 shadow-sm"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeHistoryMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-40 text-center text-sm font-semibold text-[var(--fin-text)]"><CalendarDays className="mr-1.5 inline h-4 w-4 text-[var(--fin-accent-soft)]" />{MONTHS[historyMonth - 1]} {historyYear}</span><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeHistoryMonth(1)}><ChevronRight className="h-4 w-4" /></Button></div>}
      </div>

      {activeView === "current" ? <section className="mt-6"><div className="rounded-2xl border border-[var(--fin-accent-border)] bg-[var(--fin-accent-wash)] p-4 text-sm text-[var(--fin-accent-soft)]"><CalendarDays className="mr-2 inline h-4 w-4 text-[var(--fin-accent-soft)]" /><strong>Ciclo operacional atual:</strong> {currentUnit.cycle_label}. Os três indicadores abaixo usam somente eventos pertencentes a este ciclo.</div><div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-[var(--fin-accent-border)] bg-[var(--fin-accent-wash)] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fin-accent-soft)]">Valor configurado por evento</p><p className="mt-2 text-3xl font-bold text-[var(--fin-text)]">{defaultPrices?.default_system_price == null ? "Não definida" : fmtBRL(asMoney(defaultPrices.default_system_price))}</p><p className="mt-2 text-xs text-[var(--fin-accent-soft)]">Taxa vigente para a próxima assinatura financeira.</p>{isAdminMaster && <div className="mt-3"><SystemRateEditor unitId={currentUnit.unit_id} currentPrice={defaultPrices?.default_system_price} defaultDoctorPrice={defaultPrices?.default_doctor_price} /></div>}</div><div className="rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fin-muted)]">Eventos do ciclo atual</p><p className="mt-2 text-3xl font-bold text-[var(--fin-text)]">{currentUnit.total_laudos}</p><p className="mt-2 text-xs text-[var(--fin-muted)]">Assinaturas financeiras registradas entre {currentUnit.cycle_label}.</p></div><div className="rounded-xl border border-[var(--fin-success-wash)] bg-[var(--fin-success-wash)] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fin-success)]">Rendimento atual do ciclo</p><p className="mt-2 text-3xl font-bold text-[var(--fin-text)]">{fmtBRL(asMoney(currentUnit.system_total))}</p><p className="mt-2 text-xs text-[var(--fin-success)]">Total já gerado pelos {currentUnit.total_laudos} evento{currentUnit.total_laudos === 1 ? "" : "s"} deste ciclo.</p></div></div></section> : <section className="mt-6"><div className="rounded-2xl border border-[var(--fin-line)] bg-[var(--fin-panel-2)] p-4 text-sm text-[var(--fin-muted)]"><ScrollText className="mr-2 inline h-4 w-4 text-[var(--fin-muted)]" /><strong>Consulta histórica:</strong> este período não altera a configuração atual da unidade e não participa do painel operacional.</div><div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fin-muted)]">Eventos do período</p><p className="mt-2 text-3xl font-bold text-[var(--fin-text)]">{historicalUnit.total_laudos}</p><p className="mt-2 text-xs text-[var(--fin-muted)]">{historicalUnit.cycle_label}</p></div><div className="rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fin-muted)]">Taxas registradas</p><p className="mt-2 text-base font-bold text-[var(--fin-text)]">{historicalRates}</p><p className="mt-2 text-xs text-[var(--fin-muted)]">Snapshots gravados quando cada evento foi assinado.</p></div><div className="rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fin-muted)]">Rendimento histórico</p><p className="mt-2 text-3xl font-bold text-[var(--fin-text)]">{fmtBRL(systemCycleTotal)}</p><p className="mt-2 text-xs text-[var(--fin-muted)]">Soma preservada do período consultado.</p></div></div></section>}

      {activeView === "history" && <HistoricalSettlement unitId={currentUnit.unit_id} referenceDate={historyReference} cycleLabel={historicalUnit.cycle_label} />}

      {activeView === "current" && <><section className="mt-6 rounded-2xl border border-[var(--fin-line)] bg-[var(--fin-panel)] shadow-sm"><div className="flex flex-col gap-3 border-b border-[var(--fin-line-soft)] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-bold text-[var(--fin-text)]">Valores vigentes por modalidade</h2><p className="mt-1 text-sm text-[var(--fin-muted)]">Configuração para novas assinaturas; não altera eventos de ciclos anteriores.</p></div><span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--fin-muted)]"><Settings2 className="h-3.5 w-3.5" /> Configuração atual da unidade</span></div><UnitModalityPrices unitId={currentUnit.unit_id} referenceDate={currentReference} canManage={canManagePrices} /></section><section className="mt-6 overflow-hidden rounded-2xl border border-[var(--fin-line)] bg-[var(--fin-panel)] shadow-sm"><div className="flex flex-col gap-2 border-b border-[var(--fin-line-soft)] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-bold text-[var(--fin-text)]">Médicos no ciclo atual</h2><p className="mt-1 text-sm text-[var(--fin-muted)]">Eventos e rendimento calculados exclusivamente para {currentUnit.cycle_label}.</p></div><span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--fin-muted)]"><Stethoscope className="h-4 w-4 text-[var(--fin-accent-soft)]" /> {rows.length} médico{rows.length === 1 ? "" : "s"}</span></div><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead className="bg-[var(--fin-panel-2)] text-[11px] uppercase tracking-[0.1em] text-[var(--fin-muted)]"><tr><th className="px-5 py-3 text-left">Médico</th>{MODALITIES.map((modality) => <th key={modality} className="px-2 py-3 text-center">{MODALITY_LABEL[modality]}</th>)}<th className="px-4 py-3 text-center">Eventos</th><th className="px-5 py-3 text-right">Total no ciclo</th></tr></thead><tbody className="divide-y divide-[var(--fin-line-soft)]">{doctorsLoading ? <tr><td colSpan={8} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-[var(--fin-accent-soft)]" /></td></tr> : rows.length === 0 ? <tr><td colSpan={8} className="py-10 text-center text-[var(--fin-muted)]">Nenhum médico vinculado a esta unidade.</td></tr> : rows.map((doctor) => <tr key={doctor.id} className="hover:bg-[var(--fin-panel-2)]"><td className="px-5 py-3 font-semibold text-[var(--fin-text)]">{doctor.name}</td><DoctorModalityCells unitId={currentUnit.unit_id} doctorId={doctor.id} responsibleId={readiness?.responsible_id ?? null} fallbacks={fallbacks} canManage={canManagePrices} /><td className="px-4 py-3 text-center font-medium text-[var(--fin-muted)]">{doctor.summary?.total_laudos ?? 0}</td><td className="px-5 py-3 text-right font-bold text-[var(--fin-text)]">{fmtBRL(asMoney(doctor.summary?.doctor_total))}</td></tr>)}</tbody></table></div></section></>}
    </div>
  );
}

export default function FinanceDashboard() {
  const [, navigate] = useLocation();
  const [isUnitRoute, routeParams] = useRoute("/financeiro/dashboard/:unitSlug");
  const today = useMemo(() => new Date(), []);
  const [historyYear, setHistoryYear] = useState(today.getFullYear());
  const [historyMonth, setHistoryMonth] = useState(today.getMonth() + 1);
  const [activeView, setActiveView] = useState<"current" | "history">("current");
  const currentReference = useMemo(() => new Date().toISOString(), []);
  const historyReference = useMemo(() => monthReference(historyYear, historyMonth), [historyYear, historyMonth]);
  const { data: currentUnits = [], isLoading: currentLoading } = trpc.financeSimple.unitSummary.useQuery({ reference_date: currentReference });
  const { data: overviewExtras } = trpc.financeSimple.financialOverviewExtras.useQuery(undefined, { enabled: !isUnitRoute });
  const { data: historicalUnits = [] } = trpc.financeSimple.unitSummary.useQuery({ reference_date: historyReference }, { enabled: isUnitRoute });
  const currentUnit = isUnitRoute ? currentUnits.find((unit) => unitSlug(unit.unit_name) === routeParams?.unitSlug) as UnitSummary | undefined : undefined;
  const historicalUnit = isUnitRoute ? historicalUnits.find((unit) => unitSlug(unit.unit_name) === routeParams?.unitSlug) as UnitSummary | undefined : undefined;
  const changeHistoryMonth = (direction: -1 | 1) => { if (direction === -1) { if (historyMonth === 1) { setHistoryMonth(12); setHistoryYear((value) => value - 1); } else setHistoryMonth((value) => value - 1); } else if (historyMonth === 12) { setHistoryMonth(1); setHistoryYear((value) => value + 1); } else setHistoryMonth((value) => value + 1); };
  if (isUnitRoute && currentUnit && historicalUnit) return <FinanceShell><UnitFinancialDetail currentUnit={currentUnit} historicalUnit={historicalUnit} activeView={activeView} onChangeView={setActiveView} historyYear={historyYear} historyMonth={historyMonth} onChangeHistoryMonth={changeHistoryMonth} onBack={() => navigate("/financeiro/dashboard")} /></FinanceShell>;
  return <FinanceShell><main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8"><div className="flex flex-col gap-4 border-b border-[var(--fin-line)] pb-6 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--fin-accent-soft)]">Administração financeira</p><h1 className="fin-head mt-2 text-2xl font-bold tracking-tight text-[var(--fin-text)]">Ciclos financeiros atuais</h1><p className="mt-1 text-sm text-[var(--fin-muted)]">Acompanhe apenas o ciclo atualmente aberto de cada unidade. A consulta de períodos anteriores fica dentro de cada unidade.</p></div><span className="inline-flex items-center gap-2 rounded-xl border border-[var(--fin-accent-border)] bg-[var(--fin-accent-wash)] px-3 py-2 text-sm font-semibold text-[var(--fin-accent-soft)]"><CalendarDays className="h-4 w-4 text-[var(--fin-accent-soft)]" /> Atualizado para o ciclo em aberto</span></div><div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fin-muted)]">Faturamento externo do ciclo atual</p>
          <p className="fin-head mt-2 text-3xl font-bold text-[var(--fin-text)]">{overviewExtras ? fmtBRL(overviewExtras.external_revenue_current) : "—"}</p>
          <p className="mt-2 text-xs text-[var(--fin-muted)]">Preço cobrado do paciente, todas as unidades, ciclo aberto agora. Valor real.</p>
        </div>
        <div className="rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-5">
          <div className="flex items-center gap-2 text-[var(--fin-accent-soft)]"><Users className="h-4 w-4" /><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--fin-muted)]">Médicos ativos</p></div>
          <p className="fin-head mt-2 text-3xl font-bold text-[var(--fin-text)]">{overviewExtras?.active_doctors ?? "—"}</p>
          <p className="mt-2 text-xs text-[var(--fin-muted)]">Com laudo faturável nos últimos 30 dias, todas as unidades.</p>
        </div>
      </div>

      {overviewExtras && overviewExtras.monthly_flow.length > 0 && (
        <div className="mt-6 rounded-xl border border-[var(--fin-line)] bg-[var(--fin-panel)] p-5">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-[var(--fin-accent-soft)]" /><h2 className="fin-head text-base font-bold text-[var(--fin-text)]">Fluxo financeiro consolidado</h2></div>
          <p className="text-xs text-[var(--fin-muted)] mb-3">Receita estimada com o preço externo vigente hoje aplicado à produção de cada mês já fechado — não é o valor real cobrado na época.</p>
          <div className="h-64 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overviewExtras.monthly_flow} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--fin-line-soft)" vertical={false} />
                <XAxis dataKey="month_label" tick={{ fill: "var(--fin-muted-dim)", fontSize: 10 }} axisLine={{ stroke: "var(--fin-line)" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--fin-muted-dim)", fontSize: 10 }} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => fmtBRL(Number(v))} />
                <Tooltip formatter={(value: number) => fmtBRL(value)} contentStyle={{ background: "var(--fin-panel)", border: "1px solid var(--fin-line)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--fin-text)" }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--fin-muted)" }} />
                <Bar dataKey="estimated_revenue" name="Receita (estimada)" fill="var(--fin-accent)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="system_cost" name="Sistema" fill="var(--fin-warn)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="doctor_cost" name="Médicos" fill="var(--fin-danger)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}<div className="mt-6 rounded-xl border border-[var(--fin-accent-border)] bg-[var(--fin-accent-wash)] px-4 py-3 text-sm text-[var(--fin-accent-soft)]"><FileText className="mr-2 inline h-4 w-4 text-[var(--fin-accent-soft)]" />Cada cartão apresenta o valor configurado para novos eventos, a quantidade de eventos e o rendimento do ciclo que está aberto agora.</div>{currentLoading ? <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((key) => <div key={key} className="h-56 animate-pulse rounded-2xl bg-[var(--fin-panel-2)]" />)}</div> : currentUnits.length === 0 ? <div className="mt-12 rounded-2xl border border-dashed border-[var(--fin-line-strong)] bg-[var(--fin-panel)] py-16 text-center"><Building2 className="mx-auto h-10 w-10 text-[var(--fin-muted-dim)]" /><h2 className="mt-4 text-base font-semibold text-[var(--fin-text)]">Nenhuma unidade configurada</h2><p className="mt-1 text-sm text-[var(--fin-muted)]">As unidades aparecerão aqui mesmo antes do primeiro evento do ciclo atual.</p></div> : <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(currentUnits as UnitSummary[]).map((unit) => <UnitCatalogCard key={unit.unit_id} unit={unit} onOpen={() => navigate(`/financeiro/dashboard/${unitSlug(unit.unit_name)}`)} />)}</div>}</main></FinanceShell>;
}
