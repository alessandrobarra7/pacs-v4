/**
 * FinanceResponsavelDivida — P4: Dívida do Responsável por Médico
 * Visão hierárquica: Responsável → Médico → Unidade → Dias laudados
 * Permite exportação CSV e PDF por responsável.
 */
import { useState } from "react";
import { FinanceShell } from "@/components/FinanceShell";
import { trpc } from "@/lib/trpc";
import { ChevronDown, ChevronUp, Building2, User, Download, AlertTriangle } from "lucide-react";

function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type DayGroup = { date: string; reports: number; amount: number };
type UnitGroup = { unit_id: number; unit_name: string; reports: number; amount: number; price_per_report: string; days: DayGroup[] };
type DoctorGroup = { doctor_id: number; doctor_name: string; total_reports: number; total_amount: number; units: UnitGroup[] };
type BackendResult = {
  doctors: DoctorGroup[];
  grand_total: number;
  responsible_id: number | null;
};

function exportCSV(doctors: DoctorGroup[], label: string) {
  const rows: string[] = ["Médico,Unidade,Data,Laudos,Valor"];
  for (const d of doctors) {
    for (const u of d.units) {
      for (const day of u.days) {
        rows.push(`"${d.doctor_name}","${u.unit_name}",${day.date},${day.reports},${day.amount.toFixed(2)}`);
      }
    }
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `divida_${label.replace(/\s+/g, "_") || 'medicos'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function DoctorAccordion({ doctor, responsibleName }: { doctor: DoctorGroup; responsibleName: string }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedUnit, setExpandedUnit] = useState<number | null>(null);

  return (
    <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 overflow-hidden">
      {/* Cabeçalho do médico */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-700/30 flex items-center justify-center shrink-0">
            <User className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">{doctor.doctor_name}</p>
            <p className="text-xs text-slate-400">{doctor.total_reports} laudos em {doctor.units.length} unidade(s)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-amber-400">{fmtBRL(doctor.total_amount)}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {/* Unidades do médico */}
      {expanded && (
        <div className="border-t border-slate-700/30 px-3 py-2 space-y-2">
          {doctor.units.map(u => (
            <div key={u.unit_id} className="rounded-lg border border-slate-700/30 bg-slate-900/30 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-700/10 transition-colors"
                onClick={() => setExpandedUnit(expandedUnit === u.unit_id ? null : u.unit_id)}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-cyan-400" />
                  <div className="text-left">
                    <p className="text-xs font-semibold text-white">{u.unit_name}</p>
                    <p className="text-xs text-slate-500">{u.reports} laudos · {fmtBRL(u.price_per_report)}/laudo</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-400">{fmtBRL(u.amount)}</span>
                  {expandedUnit === u.unit_id ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                </div>
              </button>

              {/* Dias laudados */}
              {expandedUnit === u.unit_id && (
                <div className="border-t border-slate-700/20">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700/20 bg-slate-900/30">
                        <th className="text-left px-3 py-2 font-medium text-slate-400">Data</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-400">Laudos</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-400">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {u.days.sort((a, b) => b.date.localeCompare(a.date)).map(d => (
                        <tr key={d.date} className="border-b border-slate-700/10 hover:bg-slate-700/10">
                          <td className="px-3 py-1.5 text-slate-300">
                            {d.date === "sem-data" ? "—" : new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR")}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-300">{d.reports}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-emerald-400">{fmtBRL(d.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



export default function FinanceResponsavelDivida() {
  const { data, isLoading, error } = trpc.billing.getResponsibleDebtByDoctor.useQuery();
  const result = data as BackendResult | undefined;
  const doctors = result?.doctors ?? [];

  const totalGeral = result?.grand_total ?? 0;
  const totalMedicos = doctors.length;
  const totalLaudos = doctors.reduce((s, d) => s + d.total_reports, 0);

  return (
    <FinanceShell activeSection="responsaveis">
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Título */}
        <div>
          <h1 className="text-2xl font-bold text-white">Dívida por Responsável</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Valor a pagar por cada responsável financeiro, detalhado por médico, unidade e dia laudado.
          </p>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-amber-400/20 bg-slate-800/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Total a Pagar</p>
            {isLoading ? <div className="h-7 w-24 bg-slate-700 rounded animate-pulse mt-1" /> : (
              <p className="text-xl font-bold text-amber-400 mt-1">{fmtBRL(totalGeral)}</p>
            )}
          </div>
          <div className="rounded-xl border border-violet-400/20 bg-slate-800/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Médicos</p>
            {isLoading ? <div className="h-7 w-12 bg-slate-700 rounded animate-pulse mt-1" /> : (
              <p className="text-xl font-bold text-violet-400 mt-1">{totalMedicos}</p>
            )}
          </div>
          <div className="rounded-xl border border-cyan-400/20 bg-slate-800/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Laudos</p>
            {isLoading ? <div className="h-7 w-12 bg-slate-700 rounded animate-pulse mt-1" /> : (
              <p className="text-xl font-bold text-cyan-400 mt-1">{totalLaudos}</p>
            )}
          </div>
        </div>

        {/* Conteúdo */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <div key={i} className="h-32 bg-slate-800/50 rounded-xl animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <p className="text-red-400 text-sm">{error.message}</p>
          </div>
        ) : doctors.length === 0 ? (
          <div className="py-16 text-center">
            <User className="h-12 w-12 mx-auto text-slate-600 mb-3" />
            <p className="text-slate-500">Nenhuma dívida pendente encontrada.</p>
            <p className="text-slate-600 text-xs mt-1">Todos os ciclos estão fechados ou não há médicos com produção no ciclo atual.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {doctors.map((d: DoctorGroup) => (
              <DoctorAccordion key={d.doctor_id} doctor={d} responsibleName="" />
            ))}
          </div>
        )}
      </div>
    </FinanceShell>
  );
}
