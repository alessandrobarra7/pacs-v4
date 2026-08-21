/**
 * FinanceDashboard — Financeiro v2
 * Catálogo de unidades e detalhe financeiro por rota. Preços por modalidade
 * preservam vigências; a tela não sobrescreve valores históricos.
 */
import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
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
  Settings2,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { fmtBRL, MONTHS } from "./FinanceModals";

const MODALITIES = ["CT", "CR", "MR", "US"] as const;
const MODALITY_LABEL: Record<(typeof MODALITIES)[number], string> = { CT: "CT", CR: "CR", MR: "RM", US: "US" };

type UnitSummary = {
  unit_id: number;
  unit_name: string;
  cycle_label: string;
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

function MiniMetric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "cyan" | "emerald" }) {
  const tones = { slate: "text-slate-700", cyan: "text-cyan-700", emerald: "text-emerald-700" };
  return <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className={`mt-0.5 text-sm font-semibold tabular-nums ${tones[tone]}`}>{value}</p></div>;
}

function UnitCatalogCard({ unit, onOpen }: { unit: UnitSummary; onOpen: () => void }) {
  const { data: prices } = trpc.financeSimple.getUnitDefaultPrices.useQuery({ unit_id: unit.unit_id });
  const eventCount = Number(unit.total_laudos ?? 0);
  const systemRate = asMoney(prices?.default_system_price);
  const systemCycleTotal = asMoney(unit.system_total);
  return (
    <article className="group flex min-h-[218px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><Building2 className="h-4 w-4 shrink-0 text-cyan-700" /><h2 className="truncate text-sm font-bold uppercase tracking-tight text-slate-900">{unit.unit_name}</h2></div><p className="mt-1 text-xs text-slate-500">{unit.cycle_label}</p></div><span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Ativa</span></div>
      <div className="mt-4 grid grid-cols-2 gap-2"><MiniMetric label="Eventos no ciclo" value={String(eventCount)} tone="cyan" /><MiniMetric label="Taxa LAUDS / evento" value={prices?.default_system_price == null ? "Não definida" : fmtBRL(systemRate)} tone="emerald" /><MiniMetric label="Soma para o sistema" value={fmtBRL(systemCycleTotal)} tone="emerald" /></div>
      <div className="mt-auto flex justify-end pt-4"><Button size="sm" onClick={onOpen} className="h-8 bg-cyan-700 px-3 text-xs hover:bg-cyan-600">Abrir financeiro <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button></div>
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
  return <><Button variant="outline" size="sm" className="h-8 border-cyan-200 text-xs text-cyan-800 hover:bg-cyan-50" onClick={() => { setValue(String(rate?.price_per_event ?? currentPrice ?? "")); setOpen(true); }}><Edit3 className="mr-1.5 h-3.5 w-3.5" />Editar taxa</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Taxa LAUDS por evento</DialogTitle></DialogHeader><p className="text-sm text-slate-500">{rate?.configured ? `A taxa vigente será preservada. A nova taxa somente começa no próximo ciclo, em ${nextDate.toLocaleDateString("pt-BR")}.` : "Esta é a primeira taxa versionada da unidade e será registrada com autoria e início de vigência."}</p><Input type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0,00" /><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={save.isPending} onClick={() => save.mutate({ unit_id: unitId, price_per_event: Number(value) || 0, starts_at: nextDate.toISOString() })}>{save.isPending ? "Publicando..." : "Publicar nova vigência"}</Button></DialogFooter></DialogContent></Dialog></>;
}

function UnitModalityPrices({ unitId, canManage }: { unitId: number; canManage: boolean }) {
  const { data: prices = [], isLoading } = trpc.financeSimple.getUnitModalityPrices.useQuery({ unit_id: unitId });
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const save = trpc.financeSimple.setUnitModalityPrice.useMutation({
    onSuccess: () => { utils.financeSimple.getUnitModalityPrices.invalidate({ unit_id: unitId }); toast.success("Valor padrão publicado com histórico de vigência"); },
    onError: (error) => toast.error(error.message),
  });
  const byModality = new Map(prices.map((price) => [price.modality, price]));
  return <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">{MODALITIES.map((modality) => {
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
    return <div key={modality} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-slate-500">{MODALITY_LABEL[modality]}</p>{price?.configured && <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Vigente</span>}</div>{canManage ? <Input aria-label={`Valor padrão vigente ${MODALITY_LABEL[modality]}`} className="mt-2 h-9 border-slate-200 bg-white px-2 text-sm font-bold tabular-nums text-slate-900" type="number" min="0" step="0.01" value={draft ?? current.toFixed(2)} onChange={(event) => setDrafts((previous) => ({ ...previous, [modality]: event.target.value }))} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} disabled={isLoading || save.isPending} /> : <p className="mt-2 text-lg font-bold text-slate-900">{fmtBRL(current)}</p>}<p className="mt-2 text-[11px] text-slate-500">Fallback para médico sem valor individual</p></div>;
  })}</div>;
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
    return <td key={modality} className="px-2 py-2 text-center">{canManage && responsibleId !== null ? <Input aria-label={`Preço de médico ${MODALITY_LABEL[modality]}`} className="h-8 min-w-20 border-slate-200 bg-white px-2 text-center text-xs tabular-nums" type="number" min="0" step="0.01" placeholder={fallback.toFixed(2)} value={draft ?? (configured === undefined ? "" : configured.toFixed(2))} onChange={(event) => setDrafts((previous) => ({ ...previous, [modality]: event.target.value }))} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} disabled={save.isPending} /> : <span className="text-xs font-medium text-slate-700">{configured === undefined ? <span className="text-slate-400">Padrão {fmtBRL(fallback)}</span> : fmtBRL(configured)}</span>}</td>;
  })}</>;
}

function UnitFinancialDetail({ unit, year, month, onBack }: { unit: UnitSummary; year: number; month: number; onBack: () => void }) {
  const { user } = useAuth();
  const referenceDate = useMemo(() => monthReference(year, month), [year, month]);
  const { data: defaultPrices } = trpc.financeSimple.getUnitDefaultPrices.useQuery({ unit_id: unit.unit_id });
  const { data: unitModalityPrices = [] } = trpc.financeSimple.getUnitModalityPrices.useQuery({ unit_id: unit.unit_id });
  const { data: doctors = [], isLoading: doctorsLoading } = trpc.financeSimple.doctorSummaryByUnit.useQuery({ unit_id: unit.unit_id, reference_date: referenceDate });
  const { data: linkedDoctors = [] } = trpc.financeSimple.listDoctorsForUnit.useQuery({ unit_id: unit.unit_id });
  const { data: readiness } = trpc.financeSimple.unitFinancialReadiness.useQuery({ unit_id: unit.unit_id });
  const isAdminMaster = user?.role === "admin_master";
  const canManagePrices = isAdminMaster || user?.role === "responsavel_financeiro";
  const systemCycleTotal = asMoney(unit.system_total);
  const fallbacks = new Map(unitModalityPrices.map((price) => [price.modality, Number(price.price_per_event ?? 0)]));
  const doctorById = new Map(doctors.filter((doctor) => doctor.doctor_user_id != null).map((doctor) => [doctor.doctor_user_id as number, doctor]));
  const rows = linkedDoctors.length ? linkedDoctors.map((doctor: any) => ({ id: doctor.doctor_user_id ?? doctor.id, name: doctor.doctor_name ?? doctor.name ?? "Médico", summary: doctorById.get(doctor.doctor_user_id ?? doctor.id) })) : doctors.map((doctor) => ({ id: doctor.doctor_user_id ?? 0, name: doctor.doctor_name ?? "Médico", summary: doctor }));
  return <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8"><button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-cyan-800"><ChevronLeft className="h-4 w-4" /> Voltar às unidades</button><div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-700">Financeiro / Unidades</span></div><h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{unit.unit_name}</h1><p className="mt-1 text-sm text-slate-500">Configuração vigente e acompanhamento financeiro desta unidade.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" /> Unidade ativa</span></div><section className="mt-6 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">Taxa LAUDS por evento</p><p className="mt-2 text-2xl font-bold text-slate-950">{defaultPrices?.default_system_price == null ? "Não definida" : fmtBRL(asMoney(defaultPrices.default_system_price))}</p>{isAdminMaster && <div className="mt-3"><SystemRateEditor unitId={unit.unit_id} currentPrice={defaultPrices?.default_system_price} defaultDoctorPrice={defaultPrices?.default_doctor_price} /></div>}</div><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Eventos no ciclo</p><p className="mt-2 text-2xl font-bold text-slate-950">{unit.total_laudos}</p><p className="mt-1 text-xs text-slate-500">{unit.cycle_label}</p></div><div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Soma para o sistema</p><p className="mt-2 text-2xl font-bold text-slate-950">{fmtBRL(systemCycleTotal)}</p><p className="mt-1 text-xs text-emerald-700">Taxa LAUDS × eventos do ciclo</p></div></section><section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-bold text-slate-900">Valor vigente por modalidade</h2><p className="mt-1 text-sm text-slate-500">Valor padrão da unidade; médicos sem valor individual recebem este fallback.</p></div><span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"><Settings2 className="h-3.5 w-3.5" /> Configuração financeira da unidade</span></div><UnitModalityPrices unitId={unit.unit_id} canManage={canManagePrices} /></section><section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-bold text-slate-900">Médicos envolvidos — preços por modalidade</h2><p className="mt-1 text-sm text-slate-500">Edite diretamente as células. Um campo vazio usa o valor padrão vigente da unidade.</p></div><span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600"><Stethoscope className="h-4 w-4 text-cyan-700" /> {rows.length} médico{rows.length === 1 ? "" : "s"}</span></div><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-5 py-3 text-left">Médico</th>{MODALITIES.map((modality) => <th key={modality} className="px-2 py-3 text-center">{MODALITY_LABEL[modality]}</th>)}<th className="px-4 py-3 text-center">Eventos</th><th className="px-5 py-3 text-right">Total no ciclo</th></tr></thead><tbody className="divide-y divide-slate-100">{doctorsLoading ? <tr><td colSpan={8} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-cyan-700" /></td></tr> : rows.length === 0 ? <tr><td colSpan={8} className="py-10 text-center text-slate-500">Nenhum médico vinculado a esta unidade.</td></tr> : rows.map((doctor) => <tr key={doctor.id} className="hover:bg-slate-50/80"><td className="px-5 py-3 font-semibold text-slate-900">{doctor.name}</td><DoctorModalityCells unitId={unit.unit_id} doctorId={doctor.id} responsibleId={readiness?.responsible_id ?? null} fallbacks={fallbacks} canManage={canManagePrices} /><td className="px-4 py-3 text-center font-medium text-slate-600">{doctor.summary?.total_laudos ?? 0}</td><td className="px-5 py-3 text-right font-bold text-slate-900">{fmtBRL(asMoney(doctor.summary?.doctor_total))}</td></tr>)}</tbody></table></div></section></div>;
}

export default function FinanceDashboard() {
  const [, navigate] = useLocation();
  const [isUnitRoute, routeParams] = useRoute("/financeiro/dashboard/:unitSlug");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const referenceDate = useMemo(() => monthReference(year, month), [year, month]);
  const { data: units = [], isLoading } = trpc.financeSimple.unitSummary.useQuery({ reference_date: referenceDate });
  const selectedUnit = isUnitRoute ? units.find((unit) => unitSlug(unit.unit_name) === routeParams?.unitSlug) as UnitSummary | undefined : undefined;
  const changeMonth = (direction: -1 | 1) => { if (direction === -1) { if (month === 1) { setMonth(12); setYear((value) => value - 1); } else setMonth((value) => value - 1); } else if (month === 12) { setMonth(1); setYear((value) => value + 1); } else setMonth((value) => value + 1); };
  const nav = <><button onClick={() => navigate("/")} className="rounded-lg px-4 py-2 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white">Estudos</button><button onClick={() => navigate("/admin")} className="rounded-lg px-4 py-2 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white">Administração</button><button className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm">Financeiro</button></>;
  return <div className="min-h-screen bg-[#f6f8fb] text-slate-900"><AppHeader nav={nav} />{selectedUnit ? <UnitFinancialDetail unit={selectedUnit} year={year} month={month} onBack={() => navigate("/financeiro/dashboard")} /> : <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8"><div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-cyan-700">Administração financeira</p><h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Financeiro por unidade</h1><p className="mt-1 text-sm text-slate-500">Selecione uma unidade para configurar preços e acompanhar o ciclo financeiro.</p></div><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-40 text-center text-sm font-semibold text-slate-800"><CalendarDays className="mr-1.5 inline h-4 w-4 text-cyan-700" />{MONTHS[month - 1]} {year}</span><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonth(1)}><ChevronRight className="h-4 w-4" /></Button></div></div><div className="mt-6 rounded-xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-950"><FileText className="mr-2 inline h-4 w-4 text-cyan-700" />A legenda define a composição clínica e a quantidade de eventos. Os valores são configurados por unidade, modalidade e médico.</div>{isLoading ? <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((key) => <div key={key} className="h-56 animate-pulse rounded-2xl bg-slate-200" />)}</div> : units.length === 0 ? <div className="mt-12 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center"><Building2 className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 text-base font-semibold text-slate-800">Nenhuma unidade com eventos no ciclo</h2><p className="mt-1 text-sm text-slate-500">Quando houver eventos financeiros, as unidades aparecerão aqui.</p></div> : <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(units as UnitSummary[]).map((unit) => <UnitCatalogCard key={unit.unit_id} unit={unit} onOpen={() => navigate(`/financeiro/dashboard/${unitSlug(unit.unit_name)}`)} />)}</div>}</main>}</div>;
}
