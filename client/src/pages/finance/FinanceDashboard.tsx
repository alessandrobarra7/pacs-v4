/**
 * FinanceDashboard — Financeiro v2 (experiência visual do admin_master)
 *
 * Entrada: catálogo de unidades. Detalhe: métricas do ciclo, taxa LAUDS,
 * preços por modalidade e total individual de médicos. Nesta fase, a tela
 * reutiliza os dados e as mutações já existentes, sem substituir o modelo
 * financeiro legado nem criar novas regras de cálculo.
 */
import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ModalityPricesSection } from "@/components/DoctorPriceManager";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Edit3,
  FileText,
  Landmark,
  Loader2,
  Settings2,
  Stethoscope,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { fmtBRL, MONTHS } from "./FinanceModals";

const MODALITIES = ["CT", "CR", "MR", "US"] as const;

function unitSlug(unitName: string) {
  return unitName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

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

function asMoney(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function monthReference(year: number, month: number) {
  return new Date(year, month - 1, 15, 12, 0, 0).toISOString();
}

function MiniMetric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "cyan" | "emerald" | "amber" }) {
  const tones = {
    slate: "text-slate-700",
    cyan: "text-cyan-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
  };
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function UnitCatalogCard({ unit, referenceDate, onOpen }: { unit: UnitSummary; referenceDate: string; onOpen: () => void }) {
  const { data: prices } = trpc.financeSimple.getUnitDefaultPrices.useQuery({ unit_id: unit.unit_id });
  const eventCount = Number(unit.total_laudos ?? 0);
  const systemRate = prices?.default_system_price;
  const margin = asMoney(unit.system_total) - asMoney(unit.doctor_total);

  return (
    <article className="group flex min-h-[242px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-cyan-700" />
            <h2 className="truncate text-sm font-bold uppercase tracking-tight text-slate-900">{unit.unit_name}</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">{unit.cycle_label}</p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Ativa</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniMetric label="Eventos no ciclo" value={String(eventCount)} tone="cyan" />
        <MiniMetric label="Taxa LAUDS / evento" value={systemRate == null ? "Não definida" : fmtBRL(asMoney(systemRate))} tone="emerald" />
        <MiniMetric label="Soma para o sistema" value={fmtBRL(asMoney(unit.system_total))} tone="emerald" />
        <MiniMetric label="Margem atual" value={fmtBRL(margin)} tone="amber" />
      </div>

      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="text-xs text-slate-500"><Users className="mr-1 inline h-3.5 w-3.5" />Repasses: {fmtBRL(asMoney(unit.doctor_total))}</span>
        <Button size="sm" onClick={onOpen} className="h-8 bg-cyan-700 px-3 text-xs hover:bg-cyan-600">
          Abrir financeiro <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </article>
  );
}

function DoctorModalities({ unitId, doctorId, responsibleId }: { unitId: number; doctorId: number; responsibleId: number | null }) {
  const { data: prices } = trpc.financeSimple.listDoctorModalityPrices.useQuery(
    { financialResponsibleId: responsibleId ?? 0, unitId, doctorUserId: doctorId },
    { enabled: responsibleId !== null },
  );
  const now = new Date();
  const currentByModality = new Map<string, number>();
  for (const price of prices ?? []) {
    const starts = new Date(price.starts_at);
    const ends = price.ends_at ? new Date(price.ends_at) : null;
    if (starts <= now && (!ends || ends >= now) && !currentByModality.has(price.modality)) {
      currentByModality.set(price.modality, asMoney(price.price_per_report));
    }
  }

  return (
    <>
      {MODALITIES.map((modality) => (
        <td key={modality} className="px-2 py-3 text-center text-xs font-medium text-slate-700">
          {currentByModality.has(modality) ? fmtBRL(currentByModality.get(modality) ?? 0) : <span className="text-slate-300">—</span>}
        </td>
      ))}
    </>
  );
}

function SystemRateEditor({ unitId, defaultDoctorPrice, currentPrice }: { unitId: number; defaultDoctorPrice: number | null | undefined; currentPrice: number | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(currentPrice ?? ""));
  const utils = trpc.useUtils();
  const save = trpc.financeSimple.setUnitDefaultPrices.useMutation({
    onSuccess: () => {
      toast.success("Taxa da LAUDS por evento atualizada");
      utils.financeSimple.getUnitDefaultPrices.invalidate({ unit_id: unitId });
      utils.financeSimple.unitSummary.invalidate();
      setOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 border-cyan-200 text-xs text-cyan-800 hover:bg-cyan-50" onClick={() => { setValue(String(currentPrice ?? "")); setOpen(true); }}>
        <Edit3 className="mr-1.5 h-3.5 w-3.5" />Editar taxa
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Taxa da LAUDS por evento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">Este é o valor padrão já suportado pelo modelo atual para a unidade. A matriz específica por modalidade será persistida na próxima etapa do Financeiro v2.</p>
          <Input type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0,00" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate({ unit_id: unitId, default_system_price: Number(value) || 0, default_doctor_price: Number(defaultDoctorPrice ?? 0) })}>{save.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UnitFinancialDetail({ unit, year, month, onBack }: { unit: UnitSummary; year: number; month: number; onBack: () => void }) {
  const { user } = useAuth();
  const referenceDate = useMemo(() => monthReference(year, month), [year, month]);
  const { data: defaultPrices } = trpc.financeSimple.getUnitDefaultPrices.useQuery({ unit_id: unit.unit_id });
  const { data: doctors = [], isLoading: doctorsLoading } = trpc.financeSimple.doctorSummaryByUnit.useQuery({ unit_id: unit.unit_id, reference_date: referenceDate });
  const { data: linkedDoctors = [] } = trpc.financeSimple.listDoctorsForUnit.useQuery({ unit_id: unit.unit_id });
  const { data: readiness } = trpc.financeSimple.unitFinancialReadiness.useQuery({ unit_id: unit.unit_id });
  const [expandedDoctorId, setExpandedDoctorId] = useState<number | null>(null);
  const isAdminMaster = user?.role === "admin_master";
  const margin = asMoney(unit.system_total) - asMoney(unit.doctor_total);
  const doctorById = new Map(doctors.filter((doctor) => doctor.doctor_user_id != null).map((doctor) => [doctor.doctor_user_id as number, doctor]));
  const rows = linkedDoctors.length
    ? linkedDoctors.map((doctor: any) => ({ id: doctor.doctor_user_id ?? doctor.id, name: doctor.doctor_name ?? doctor.name ?? "Médico", summary: doctorById.get(doctor.doctor_user_id ?? doctor.id) }))
    : doctors.map((doctor) => ({ id: doctor.doctor_user_id ?? 0, name: doctor.doctor_name ?? "Médico", summary: doctor }));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-cyan-800">
        <ChevronLeft className="h-4 w-4" /> Voltar às unidades
      </button>

      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-700">Financeiro / Unidades</span></div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{unit.unit_name}</h1>
          <p className="mt-1 text-sm text-slate-500">Configuração e acompanhamento do ciclo {MONTHS[month - 1]} de {year}.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" /> Unidade ativa</span>
      </div>

      <section className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">Taxa LAUDS por evento</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{defaultPrices?.default_system_price == null ? "Não definida" : fmtBRL(asMoney(defaultPrices.default_system_price))}</p>
          {isAdminMaster && <div className="mt-3"><SystemRateEditor unitId={unit.unit_id} currentPrice={defaultPrices?.default_system_price} defaultDoctorPrice={defaultPrices?.default_doctor_price} /></div>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Eventos no ciclo</p><p className="mt-2 text-2xl font-bold text-slate-950">{unit.total_laudos}</p><p className="mt-1 text-xs text-slate-500">{unit.cycle_label}</p></div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Soma para o sistema</p><p className="mt-2 text-2xl font-bold text-slate-950">{fmtBRL(asMoney(unit.system_total))}</p><p className="mt-1 text-xs text-emerald-700">Movimentação LAUDS</p></div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Margem atual</p><p className="mt-2 text-2xl font-bold text-slate-950">{fmtBRL(margin)}</p><p className="mt-1 text-xs text-amber-700">Sistema menos repasses</p></div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-base font-bold text-slate-900">Preço que a unidade paga por evento</h2><p className="mt-1 text-sm text-slate-500">Valores vigentes até uma nova alteração autorizada.</p></div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"><Settings2 className="h-3.5 w-3.5" /> Configuração financeira da unidade</span>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
          {MODALITIES.map((modality) => (
            <div key={modality} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-500">{modality}</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{defaultPrices?.default_system_price == null ? "—" : fmtBRL(asMoney(defaultPrices.default_system_price))}</p>
              <p className="mt-1 text-[11px] text-slate-500">Usa a taxa padrão atual</p>
            </div>
          ))}
        </div>
        <div className="mx-5 mb-5 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">A matriz de valor da unidade por modalidade está pronta visualmente; nesta primeira validação ela ainda utiliza a taxa padrão já registrada, sem criar uma nova regra de cálculo.</div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-base font-bold text-slate-900">Médicos envolvidos — preços por modalidade</h2><p className="mt-1 text-sm text-slate-500">Edite os valores do médico por modalidade; o total individual considera os eventos já registrados no ciclo atual.</p></div>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600"><Stethoscope className="h-4 w-4 text-cyan-700" /> {rows.length} médico{rows.length === 1 ? "" : "s"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-5 py-3 text-left">Médico</th>{MODALITIES.map((modality) => <th key={modality} className="px-2 py-3 text-center">{modality}</th>)}<th className="px-4 py-3 text-center">Eventos</th><th className="px-5 py-3 text-right">Total no ciclo</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {doctorsLoading ? <tr><td colSpan={9} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-cyan-700" /></td></tr> : rows.length === 0 ? <tr><td colSpan={9} className="py-10 text-center text-slate-500">Nenhum médico vinculado a esta unidade.</td></tr> : rows.map((doctor) => (
                <>
                  <tr key={doctor.id} className="hover:bg-slate-50/80"><td className="px-5 py-3 font-semibold text-slate-900">{doctor.name}</td><DoctorModalities unitId={unit.unit_id} doctorId={doctor.id} responsibleId={readiness?.responsible_id ?? null} /><td className="px-4 py-3 text-center font-medium text-slate-600">{doctor.summary?.total_laudos ?? 0}</td><td className="px-5 py-3 text-right font-bold text-slate-900">{fmtBRL(asMoney(doctor.summary?.doctor_total))}</td><td className="px-4 py-3 text-right">{isAdminMaster && readiness?.responsible_id ? <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setExpandedDoctorId(expandedDoctorId === doctor.id ? null : doctor.id)}><Edit3 className="mr-1.5 h-3.5 w-3.5" />Editar preços</Button> : <span className="text-xs text-slate-400">Somente consulta</span>}</td></tr>
                  {expandedDoctorId === doctor.id && readiness?.responsible_id && <tr key={`${doctor.id}-editor`}><td colSpan={9} className="bg-slate-50 px-5 py-4"><ModalityPricesSection doctor={{ id: doctor.id, name: doctor.name, crm: null }} financialResponsibleId={readiness.responsible_id} unitId={unit.unit_id} /></td></tr>}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><CircleDollarSign className="h-4 w-4 text-cyan-700" />Soma individual por médico</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{doctors.map((doctor) => <div key={doctor.doctor_user_id} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{doctor.doctor_name}</p><p className="mt-1 text-sm text-slate-600">Ciclo {MONTHS[month - 1]}</p><p className="mt-1 text-xl font-bold text-slate-900">{fmtBRL(asMoney(doctor.doctor_total))}</p></div>)}</div></div>
        <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm"><Landmark className="h-5 w-5 text-cyan-300" /><p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">Total de repasses médicos</p><p className="mt-2 text-2xl font-bold">{fmtBRL(asMoney(unit.doctor_total))}</p><p className="mt-3 text-sm text-slate-300">Movimentação total da unidade: <strong className="text-white">{fmtBRL(asMoney(unit.system_total))}</strong></p></div>
      </section>
    </div>
  );
}

export default function FinanceDashboard() {
  const [, navigate] = useLocation();
  const [isUnitRoute, routeParams] = useRoute("/financeiro/dashboard/:unitSlug");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const referenceDate = useMemo(() => monthReference(year, month), [year, month]);
  const { data: units = [], isLoading } = trpc.financeSimple.unitSummary.useQuery({ reference_date: referenceDate });
  const selectedUnit = isUnitRoute
    ? units.find((unit) => unitSlug(unit.unit_name) === routeParams?.unitSlug) as UnitSummary | undefined
    : undefined;
  const changeMonth = (direction: -1 | 1) => {
    if (direction === -1) {
      if (month === 1) { setMonth(12); setYear((value) => value - 1); } else setMonth((value) => value - 1);
    } else if (month === 12) { setMonth(1); setYear((value) => value + 1); } else setMonth((value) => value + 1);
  };

  const nav = <><button onClick={() => navigate("/")} className="rounded-lg px-4 py-2 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white">Estudos</button><button onClick={() => navigate("/admin")} className="rounded-lg px-4 py-2 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white">Administração</button><button className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm">Financeiro</button></>;

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      <AppHeader nav={nav} />
      {selectedUnit ? <UnitFinancialDetail unit={selectedUnit} year={year} month={month} onBack={() => navigate("/financeiro/dashboard")} /> : (
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-cyan-700">Administração financeira</p><h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Financeiro por unidade</h1><p className="mt-1 text-sm text-slate-500">Selecione uma unidade para configurar preços e acompanhar o ciclo financeiro.</p></div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-40 text-center text-sm font-semibold text-slate-800"><CalendarDays className="mr-1.5 inline h-4 w-4 text-cyan-700" />{MONTHS[month - 1]} {year}</span><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonth(1)}><ChevronRight className="h-4 w-4" /></Button></div>
          </div>
          <div className="mt-6 rounded-xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-950"><FileText className="mr-2 inline h-4 w-4 text-cyan-700" />A legenda define a composição clínica e a quantidade de eventos. Os valores são configurados por unidade, modalidade e médico.</div>
          {isLoading ? <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1,2,3,4,5,6].map((key) => <div key={key} className="h-60 animate-pulse rounded-2xl bg-slate-200" />)}</div> : units.length === 0 ? <div className="mt-12 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center"><Building2 className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 text-base font-semibold text-slate-800">Nenhuma unidade com eventos no ciclo</h2><p className="mt-1 text-sm text-slate-500">Quando houver eventos financeiros, as unidades aparecerão aqui.</p></div> : <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(units as UnitSummary[]).map((unit) => <UnitCatalogCard key={unit.unit_id} unit={unit} referenceDate={referenceDate} onOpen={() => navigate(`/financeiro/dashboard/${unitSlug(unit.unit_name)}`)} />)}</div>}
        </main>
      )}
    </div>
  );
}
