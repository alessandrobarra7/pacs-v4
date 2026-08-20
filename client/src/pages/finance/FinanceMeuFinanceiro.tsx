/**
 * FinanceMeuFinanceiro — painel operacional do médico, estritamente por unidade.
 * Desenvolvimento StudioBarra7
 */
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign,
  FileText, Landmark, CalendarDays, BadgeDollarSign,
} from "lucide-react";
import { FinanceShell } from "./FinanceShell";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const MODALITY_META: Record<string, { label: string; className: string }> = {
  CT: { label: "Tomografia Computadorizada", className: "bg-sky-500/20 text-sky-300 border-sky-400/30" },
  CR: { label: "Raio-X Convencional", className: "bg-amber-500/20 text-amber-300 border-amber-400/30" },
  US: { label: "Ultrassonografia", className: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30" },
  MR: { label: "Ressonância Magnética", className: "bg-violet-500/20 text-violet-300 border-violet-400/30" },
};

function fmtBRL(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
}

export default function FinanceMeuFinanceiro() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [unitId, setUnitId] = useState<number | null>(null);
  const referenceDate = useMemo(() => new Date(year, month - 1, 15).toISOString(), [year, month]);

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
  const events = financeQuery.data?.events ?? [];
  const pricingPending = events.filter((event) => event.pricing_status && event.pricing_status !== "ok").length;

  function previousMonth() {
    if (month === 1) { setMonth(12); setYear((value) => value - 1); }
    else setMonth((value) => value - 1);
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((value) => value + 1); }
    else setMonth((value) => value + 1);
  }

  return (
    <FinanceShell>
      <div className="min-h-full bg-slate-950">
        <header className="border-b border-slate-800 bg-slate-900/70 px-4 py-4 md:px-7">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-400">Meu Financeiro</p>
              <h1 className="mt-1 text-xl font-semibold text-white">Documentos e recebimentos</h1>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:min-w-[600px]">
              <label className="text-xs text-slate-400">
                Unidade <span className="text-cyan-300">(somente esta unidade)</span>
                <select
                  value={unitId ?? ""}
                  onChange={(event) => setUnitId(Number(event.target.value))}
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-white outline-none focus:border-cyan-500"
                >
                  {units.map((unit) => <option key={unit.unit_id} value={unit.unit_id}>{unit.unit_name}</option>)}
                </select>
              </label>
              <div className="text-xs text-slate-400">
                Ciclo de referência
                <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-2 py-1">
                  <button aria-label="Mês anterior" onClick={previousMonth} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-white"><CalendarDays className="h-4 w-4 text-cyan-400" />{MONTHS[month - 1]} {year}</span>
                  <button aria-label="Próximo mês" onClick={nextMonth} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] p-4 md:p-7">
          {unitsQuery.isLoading ? (
            <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900/40" />
          ) : units.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-12 text-center">
              <Landmark className="mx-auto h-10 w-10 text-slate-600" />
              <h2 className="mt-4 text-base font-semibold text-white">Nenhuma unidade financeira disponível</h2>
              <p className="mt-1 text-sm text-slate-400">Solicite ao responsável financeiro o vínculo e a permissão de acesso para sua unidade.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Dados exclusivos de <strong>{selectedUnit?.unit_name}</strong>. Nenhum valor de outra unidade é somado nesta tela.
              </div>

              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Laudos assinados" value={String(summary?.total_laudos ?? 0)} icon={<FileText className="h-5 w-5" />} tone="cyan" />
                <MetricCard label="A receber" value={fmtBRL(summary?.doctor_total)} icon={<CircleDollarSign className="h-5 w-5" />} tone="emerald" />
                <MetricCard label="Recebido" value={fmtBRL(summary?.doctor_paid)} icon={<BadgeDollarSign className="h-5 w-5" />} tone="blue" />
                <MetricCard label="Preço pendente" value={`${pricingPending} evento${pricingPending === 1 ? "" : "s"}`} icon={<AlertCircle className="h-5 w-5" />} tone="amber" sub={pricingPending > 0 ? "Consulte o responsável financeiro" : "Todos os eventos têm preço"} />
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(380px,0.9fr)]">
                <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
                  <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                    <div>
                      <h2 className="font-semibold text-white">Meus documentos assinados</h2>
                      <p className="mt-0.5 text-xs text-slate-400">Ciclo {summary?.cycle_label ?? `${MONTHS[month - 1]} ${year}`} · {events.length} documento(s)</p>
                    </div>
                    {financeQuery.isFetching && <span className="text-xs text-cyan-400">Atualizando…</span>}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-5 py-3 text-left">Data</th><th className="px-3 py-3 text-left">Documento</th><th className="px-3 py-3 text-left">Modalidade</th><th className="px-3 py-3 text-right">Preço aplicado</th><th className="px-5 py-3 text-right">Recebimento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {financeQuery.isLoading ? (
                          <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Carregando documentos…</td></tr>
                        ) : events.length === 0 ? (
                          <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">Nenhum documento assinado neste ciclo para esta unidade.</td></tr>
                        ) : events.map((event) => {
                          const priced = !event.pricing_status || event.pricing_status === "ok";
                          return <tr key={event.id} className="hover:bg-slate-800/35">
                            <td className="px-5 py-3 text-slate-400">{fmtDate(event.study_date ?? event.signed_at)}</td>
                            <td className="px-3 py-3 font-medium text-white">{event.exam_name_snapshot ?? "Documento assinado"}</td>
                            <td className="px-3 py-3"><span className="rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-300">{event.modality_snapshot ?? "—"}</span></td>
                            <td className={`px-3 py-3 text-right font-medium ${priced ? "text-cyan-300" : "text-amber-300"}`}>{priced ? fmtBRL(event.doctor_amount_due) : "Preço pendente"}</td>
                            <td className="px-5 py-3 text-right">{event.doctor_received_at ? <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Recebido</span> : <span className="text-amber-300">A receber</span>}</td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <aside className="rounded-xl border border-slate-800 bg-slate-900/60">
                  <div className="border-b border-slate-800 px-5 py-4"><h2 className="font-semibold text-white">Preço por modalidade</h2><p className="mt-0.5 text-xs text-slate-400">Valores vigentes nesta unidade</p></div>
                  <div className="divide-y divide-slate-800/80">
                    {pricesQuery.isLoading ? <div className="p-6 text-sm text-slate-500">Carregando preços…</div> : !pricesQuery.data?.length ? <div className="p-6 text-sm text-amber-300">Nenhum preço por modalidade está configurado para este ciclo. Consulte o responsável financeiro.</div> : pricesQuery.data.map((price) => {
                      const meta = MODALITY_META[price.modality] ?? { label: price.modality, className: "bg-slate-700 text-slate-200 border-slate-600" };
                      return <div key={price.modality} className="flex items-center justify-between gap-4 px-5 py-4"><div className="flex items-center gap-3"><span className={`rounded border px-2 py-1 text-xs font-bold ${meta.className}`}>{price.modality}</span><span className="text-sm text-slate-200">{meta.label}</span></div><span className="font-semibold text-cyan-300">{fmtBRL(price.price_per_report)}</span></div>;
                    })}
                  </div>
                  <div className="m-4 rounded-lg border border-slate-700/70 bg-slate-950/50 p-3 text-xs leading-relaxed text-slate-400">Valores definidos pelo responsável financeiro da unidade. Cada valor exibido é aplicado somente a documentos assinados dentro da vigência correspondente.</div>
                </aside>
              </section>
            </div>
          )}
        </main>
      </div>
    </FinanceShell>
  );
}

function MetricCard({ label, value, icon, tone, sub }: { label: string; value: string; icon: React.ReactNode; tone: "cyan" | "emerald" | "blue" | "amber"; sub?: string }) {
  const tones = {
    cyan: "border-cyan-500/20 bg-cyan-500/5 text-cyan-300",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
    blue: "border-blue-500/20 bg-blue-500/5 text-blue-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  };
  return <div className={`rounded-xl border p-4 ${tones[tone]}`}><div className="flex items-center gap-2 text-xs opacity-80">{icon}<span>{label}</span></div><p className="mt-3 text-xl font-bold text-white">{value}</p>{sub && <p className="mt-1 text-xs opacity-80">{sub}</p>}</div>;
}
