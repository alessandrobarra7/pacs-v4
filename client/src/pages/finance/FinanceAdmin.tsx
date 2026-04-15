import { useState } from "react";
import { FinanceShell } from "@/components/FinanceShell";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Users, FileText, AlertTriangle, Calendar, RefreshCw, Plus, Pencil, X, ChevronDown } from "lucide-react";

function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("pt-BR");
}
function toInputDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().split("T")[0];
}

type AdminTab = "precos" | "vinculos" | "pendencias" | "consolidacao" | "fechamentos";

// ── Modal Fechar Ciclo ────────────────────────────────────────────────────────
function ModalFecharCiclo({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: openCycles, isLoading } = trpc.billing.listAllOpenCycles.useQuery();
  const cycles = (openCycles ?? []) as Array<{
    id: number; unit_name: string; responsible_name: string;
    cycle_type: string; starts_at: Date | string; ends_at: Date | string;
  }>;

  const closeCycle = trpc.billing.closeCycle.useMutation({
    onSuccess: () => {
      toast({ title: "Ciclo fechado com sucesso." });
      utils.billing.listAllOpenCycles.invalidate();
      utils.billing.listUnitCycles.invalidate();
      utils.billing.getAdminSummary.invalidate();
    },
    onError: (e) => toast({ title: "Erro ao fechar ciclo", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-white">Fechar Ciclo</h2>
            <p className="text-slate-400 text-xs mt-0.5">Selecione o ciclo aberto que deseja encerrar</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-14 bg-slate-800 rounded-lg animate-pulse"/>)}</div>
          ) : cycles.length === 0 ? (
            <div className="py-10 text-center">
              <Calendar className="h-10 w-10 mx-auto text-slate-600 mb-3"/>
              <p className="text-slate-500 text-sm">Nenhum ciclo aberto encontrado.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {cycles.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-700/50 bg-slate-800/50 hover:border-slate-600 transition-colors">
                  <div className="min-w-0">
                    <p className="text-white font-medium text-sm truncate">{c.unit_name}</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {c.responsible_name && <span className="mr-2">{c.responsible_name}</span>}
                      <span className="text-slate-500">{fmtDate(c.starts_at)} → {fmtDate(c.ends_at)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400">
                      {c.cycle_type === "doctor" ? "Médico" : "Sistema"}
                    </span>
                    <button
                      disabled={closeCycle.isPending}
                      onClick={() => closeCycle.mutate({ cycle_id: c.id })}
                      className="px-3 py-1.5 text-xs rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 transition-colors disabled:opacity-50"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal Criar Ciclo ─────────────────────────────────────────────────────────
function ModalCriarCiclo({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: unitsData } = trpc.units.list.useQuery();
  const { data: responsiblesData } = trpc.billing.listResponsibles.useQuery();
  const units = (unitsData ?? []) as Array<{ id: number; name: string }>;
  const responsibles = (responsiblesData ?? []) as Array<{ id: number; legal_name: string; trade_name: string | null }>;

  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split("T")[0];

  const [form, setForm] = useState({
    unit_id: units[0]?.id ?? 0,
    financial_responsible_id: null as number | null,
    cycle_type: "doctor" as "doctor" | "system",
    starts_at: firstDay,
    ends_at: lastDay,
  });

  const createCycle = trpc.billing.createCycleManual.useMutation({
    onSuccess: () => {
      toast({ title: "Ciclo criado com sucesso." });
      utils.billing.listUnitCycles.invalidate();
      utils.billing.listAllOpenCycles.invalidate();
      onClose();
    },
    onError: (e) => toast({ title: "Erro ao criar ciclo", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.unit_id || !form.starts_at || !form.ends_at) {
      toast({ title: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }
    createCycle.mutate({
      unit_id: form.unit_id,
      financial_responsible_id: form.financial_responsible_id,
      cycle_type: form.cycle_type,
      starts_at: form.starts_at,
      ends_at: form.ends_at,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-white">Criar Ciclo</h2>
            <p className="text-slate-400 text-xs mt-0.5">Abrir novo ciclo financeiro manualmente</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Unidade */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Unidade *</label>
            <div className="relative">
              <select
                value={form.unit_id}
                onChange={(e) => setForm(f => ({ ...f, unit_id: Number(e.target.value) }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm appearance-none pr-8 focus:outline-none focus:border-cyan-500"
              >
                <option value={0} disabled>Selecione uma unidade</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {/* Responsável */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Responsável Financeiro</label>
            <div className="relative">
              <select
                value={form.financial_responsible_id ?? ""}
                onChange={(e) => setForm(f => ({ ...f, financial_responsible_id: e.target.value ? Number(e.target.value) : null }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm appearance-none pr-8 focus:outline-none focus:border-cyan-500"
              >
                <option value="">Sem responsável</option>
                {responsibles.map(r => <option key={r.id} value={r.id}>{r.trade_name ?? r.legal_name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Tipo de Ciclo *</label>
            <div className="flex gap-2">
              {(["doctor", "system"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm(f => ({ ...f, cycle_type: t }))}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                    form.cycle_type === t
                      ? "bg-cyan-700/40 border-cyan-500 text-white"
                      : "border-slate-600 text-slate-400 hover:text-white"
                  }`}
                >
                  {t === "doctor" ? "Médico" : "Sistema"}
                </button>
              ))}
            </div>
          </div>
          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Data Início *</label>
              <input
                type="date"
                value={form.starts_at}
                onChange={(e) => setForm(f => ({ ...f, starts_at: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Data Fim *</label>
              <input
                type="date"
                value={form.ends_at}
                onChange={(e) => setForm(f => ({ ...f, ends_at: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg border border-slate-600 text-slate-400 hover:text-white transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={createCycle.isPending}
            className="flex-1 py-2 text-sm rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-colors disabled:opacity-50"
          >
            {createCycle.isPending ? "Criando..." : "Criar Ciclo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Editar Ciclo ────────────────────────────────────────────────────────
function ModalEditarCiclo({ cycle, onClose }: {
  cycle: { id: number; starts_at: Date | string; ends_at: Date | string; unit_name?: string };
  onClose: () => void;
}) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [starts_at, setStartsAt] = useState(toInputDate(cycle.starts_at));
  const [ends_at, setEndsAt] = useState(toInputDate(cycle.ends_at));

  const editCycle = trpc.billing.editCycleDates.useMutation({
    onSuccess: () => {
      toast({ title: "Datas do ciclo atualizadas." });
      utils.billing.listUnitCycles.invalidate();
      utils.billing.listAllOpenCycles.invalidate();
      onClose();
    },
    onError: (e) => toast({ title: "Erro ao editar ciclo", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-white">Editar Ciclo</h2>
            {cycle.unit_name && <p className="text-slate-400 text-xs mt-0.5">{cycle.unit_name}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Data Início</label>
            <input
              type="date"
              value={starts_at}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Data Fim</label>
            <input
              type="date"
              value={ends_at}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg border border-slate-600 text-slate-400 hover:text-white transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => editCycle.mutate({ cycle_id: cycle.id, starts_at, ends_at })}
            disabled={editCycle.isPending}
            className="flex-1 py-2 text-sm rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-colors disabled:opacity-50"
          >
            {editCycle.isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Abas ──────────────────────────────────────────────────────────────────────
function TabPrecos() {
  const { data: sysPrices, isLoading: loadingSys } = trpc.billing.listAllSystemPrices.useQuery();
  const { data: docPrices, isLoading: loadingDoc } = trpc.billing.listAllDoctorPrices.useQuery();
  const sys = (sysPrices ?? []) as Array<{ id: number; unit_id: number; unit_name: string | null; price_per_report: string; ends_at: Date | string | null }>;
  const doc = (docPrices ?? []) as Array<{ id: number; unit_id: number; unit_name: string | null; doctor_user_id: number; doctor_name: string | null; price_per_report: string; ends_at: Date | string | null }>;
  const activeSys = sys.filter((p) => !p.ends_at);
  const activeDoc = doc.filter((p) => !p.ends_at);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/30">
          <h3 className="text-sm font-semibold text-white">Custo do Sistema por Unidade</h3>
        </div>
        {loadingSys ? (
          <div className="p-4 space-y-2">{[1,2,3].map(i=><div key={i} className="h-8 bg-slate-700/30 rounded animate-pulse"/>)}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/30 bg-slate-900/30">
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Unidade</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">Custo/Laudo</th>
                <th className="text-center px-4 py-2 text-xs font-medium text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {activeSys.map((p) => (
                <tr key={p.id} className="border-b border-slate-700/20 hover:bg-slate-700/20">
                  <td className="px-4 py-2.5 text-white font-medium text-sm">{p.unit_name ?? `Unidade ${p.unit_id}`}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-cyan-400">{fmtBRL(p.price_per_report)}</td>
                  <td className="px-4 py-2.5 text-center"><span className="text-xs px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400">Ativo</span></td>
                </tr>
              ))}
              {activeSys.length === 0 && <tr><td colSpan={3} className="px-4 py-4 text-center text-slate-500 text-xs">Nenhum preço configurado.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/30">
          <h3 className="text-sm font-semibold text-white">Preço do Médico por Unidade</h3>
        </div>
        {loadingDoc ? (
          <div className="p-4 space-y-2">{[1,2,3].map(i=><div key={i} className="h-8 bg-slate-700/30 rounded animate-pulse"/>)}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/30 bg-slate-900/30">
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Médico</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-400 hidden sm:table-cell">Unidade</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">Valor</th>
              </tr>
            </thead>
            <tbody>
              {activeDoc.map((p) => (
                <tr key={p.id} className="border-b border-slate-700/20 hover:bg-slate-700/20">
                  <td className="px-4 py-2.5 text-white font-medium">{p.doctor_name ?? `Médico ${p.doctor_user_id}`}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs hidden sm:table-cell">{p.unit_name ?? `Unidade ${p.unit_id}`}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-emerald-400">{fmtBRL(p.price_per_report)}</td>
                </tr>
              ))}
              {activeDoc.length === 0 && <tr><td colSpan={3} className="px-4 py-4 text-center text-slate-500 text-xs">Nenhum preço configurado.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TabVinculos() {
  const { data: responsiblesData, isLoading } = trpc.billing.listResponsibles.useQuery();
  const responsibles = (responsiblesData ?? []) as Array<{ id: number; legal_name: string; trade_name: string | null; isActive: boolean }>;
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/30">
        <h3 className="text-sm font-semibold text-white">Responsáveis Financeiros</h3>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[1,2,3].map(i=><div key={i} className="h-8 bg-slate-700/30 rounded animate-pulse"/>)}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/30 bg-slate-900/30">
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Responsável</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-slate-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {responsibles.map((r) => (
              <tr key={r.id} className="border-b border-slate-700/20 hover:bg-slate-700/20">
                <td className="px-4 py-2.5 text-white font-medium">{r.trade_name ?? r.legal_name}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.isActive ? "bg-emerald-400/10 text-emerald-400" : "bg-slate-600/40 text-slate-400"}`}>
                    {r.isActive ? "Ativo" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
            {responsibles.length === 0 && <tr><td colSpan={2} className="px-4 py-4 text-center text-slate-500 text-xs">Nenhum responsável cadastrado.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TabPendencias({ year, month }: { year: number; month: number }) {
  const { data: summaryData, isLoading } = trpc.billing.getAdminSummary.useQuery({ year, month });
  const pending = ((summaryData as { pending?: unknown[] })?.pending ?? []) as Array<{
    id: number; unit_name: string; doctor_name: string; patient_name: string | null;
    report_key: string; pricing_status: string; system_amount: string; doctor_amount: string;
  }>;
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
      {isLoading ? (
        <div className="p-4 space-y-2">{[1,2,3].map(i=><div key={i} className="h-10 bg-slate-700/30 rounded animate-pulse"/>)}</div>
      ) : pending.length === 0 ? (
        <div className="py-12 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto text-slate-600 mb-3"/>
          <p className="text-slate-500 text-sm">Nenhuma pendência encontrada.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/30 bg-slate-900/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Laudo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 hidden sm:table-cell">Unidade</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 hidden md:table-cell">Médico</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Problema</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Sistema</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Médico</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((item) => (
                <tr key={item.id} className="border-b border-slate-700/20 hover:bg-slate-700/20">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{item.patient_name ?? "—"}</p>
                    <p className="text-xs text-slate-500 font-mono">{item.report_key}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">{item.unit_name}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">{item.doctor_name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400">
                      {item.pricing_status === "pending_system" ? "Sem preço sistema" : item.pricing_status === "pending_doctor" ? "Sem preço médico" : "Sem preço"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-300">{fmtBRL(item.system_amount)}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-300">{fmtBRL(item.doctor_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabConsolidacao({ year, month }: { year: number; month: number }) {
  const { data: summaryData, isLoading } = trpc.billing.getAdminSummary.useQuery({ year, month });
  const responsibles = ((summaryData as { responsibles?: unknown[] })?.responsibles ?? []) as Array<{
    id: number; legal_name: string; trade_name: string | null; system_total: number; doctor_total: number; reports_count: number;
  }>;
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
      {isLoading ? (
        <div className="p-4 space-y-2">{[1,2,3].map(i=><div key={i} className="h-10 bg-slate-700/30 rounded animate-pulse"/>)}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/30 bg-slate-900/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Responsável</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Laudos</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Receita Sistema</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Pagto Médicos</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {responsibles.map((r) => (
                <tr key={r.id} className="border-b border-slate-700/20 hover:bg-slate-700/20">
                  <td className="px-4 py-3 text-white font-medium">{r.trade_name ?? r.legal_name}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{r.reports_count}</td>
                  <td className="px-4 py-3 text-right font-semibold text-cyan-400">{fmtBRL(r.system_total)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-amber-400">{fmtBRL(r.doctor_total)}</td>
                  <td className="px-4 py-3 text-right font-bold text-white">{fmtBRL(r.system_total + r.doctor_total)}</td>
                </tr>
              ))}
              {responsibles.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-center text-slate-500 text-xs">Nenhum dado no período.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabFechamentos() {
  const { data: unitsData } = trpc.units.list.useQuery();
  const units = (unitsData ?? []) as Array<{ id: number; name: string }>;
  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);
  const [editingCycle, setEditingCycle] = useState<null | { id: number; starts_at: Date | string; ends_at: Date | string; unit_name?: string }>(null);
  const unitId = selectedUnit ?? (units[0]?.id ?? 0);

  const { data: cyclesData, isLoading } = trpc.billing.listUnitCycles.useQuery(
    { unit_id: unitId },
    { enabled: unitId > 0 }
  );
  const cycles = (cyclesData ?? []) as unknown as Array<{
    id: number; status: string; starts_at: Date | string; ends_at: Date | string;
    total_reports: number; total_amount: string; cycle_type: string;
  }>;

  const unitName = units.find(u => u.id === unitId)?.name;

  return (
    <div className="space-y-4">
      {editingCycle && (
        <ModalEditarCiclo
          cycle={editingCycle}
          onClose={() => setEditingCycle(null)}
        />
      )}
      <div className="flex gap-2 flex-wrap">
        {units.map((u) => (
          <button
            key={u.id}
            onClick={() => setSelectedUnit(u.id)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              unitId === u.id
                ? "bg-cyan-700/60 text-white border-cyan-600"
                : "border-slate-600 text-slate-400 hover:text-white hover:border-slate-400"
            }`}
          >
            {u.name}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{[1,2,3].map(i=><div key={i} className="h-10 bg-slate-700/30 rounded animate-pulse"/>)}</div>
        ) : cycles.length === 0 ? (
          <div className="py-12 text-center">
            <Calendar className="h-10 w-10 mx-auto text-slate-600 mb-3"/>
            <p className="text-slate-500 text-sm">Nenhum ciclo para esta unidade.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/30 bg-slate-900/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Período</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Tipo</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Laudos</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Ações</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((c) => (
                  <tr key={c.id} className="border-b border-slate-700/20 hover:bg-slate-700/20">
                    <td className="px-4 py-3 text-white text-xs font-medium">{fmtDate(c.starts_at)} — {fmtDate(c.ends_at)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-600/40 text-slate-300">
                        {c.cycle_type === "doctor" ? "Médico" : "Sistema"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">{c.total_reports}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-400">{fmtBRL(c.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === "open" ? "bg-emerald-400/10 text-emerald-400" : "bg-slate-600/40 text-slate-400"}`}>
                        {c.status === "open" ? "Aberto" : "Fechado"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.status === "open" && (
                        <button
                          onClick={() => setEditingCycle({ id: c.id, starts_at: c.starts_at, ends_at: c.ends_at, unit_name: unitName })}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
                          title="Editar datas"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componente Principal ──────────────────────────────────────────────────────
export default function FinanceAdmin() {
  const [tab, setTab] = useState<AdminTab>("precos");
  const [showFecharModal, setShowFecharModal] = useState(false);
  const [showCriarModal, setShowCriarModal] = useState(false);
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth() + 1);

  const { data: summaryData, isLoading } = trpc.billing.getAdminSummary.useQuery({ year, month });
  const summary = summaryData as { system_total?: number; doctor_total?: number; reports_count?: number; pending_count?: number } | undefined;

  const tabs: { id: AdminTab; label: string; icon: React.ElementType }[] = [
    { id: "precos", label: "Preços", icon: DollarSign },
    { id: "vinculos", label: "Vínculos", icon: Users },
    { id: "pendencias", label: "Pendências", icon: AlertTriangle },
    { id: "consolidacao", label: "Consolidação", icon: RefreshCw },
    { id: "fechamentos", label: "Fechamentos", icon: Calendar },
  ];

  return (
    <FinanceShell activeSection="admin">
      {showFecharModal && <ModalFecharCiclo onClose={() => setShowFecharModal(false)} />}
      {showCriarModal && <ModalCriarCiclo onClose={() => setShowCriarModal(false)} />}

      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Título */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Financeiro</h1>
            <p className="text-slate-400 text-sm mt-0.5">Configuração e controle do setor financeiro</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCriarModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:border-emerald-500 hover:text-white text-sm transition-colors"
            >
              <Plus className="h-4 w-4" />
              Novo Ciclo
            </button>
            <button
              onClick={() => setShowFecharModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:border-rose-500 hover:text-white text-sm transition-colors"
            >
              <Calendar className="h-4 w-4" />
              Fechar Ciclo
            </button>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Receita Sistema", value: fmtBRL(summary?.system_total ?? 0), icon: DollarSign, color: "text-cyan-400", border: "border-cyan-400/20" },
            { label: "Pagto Médicos", value: fmtBRL(summary?.doctor_total ?? 0), icon: Users, color: "text-amber-400", border: "border-amber-400/20" },
            { label: "Laudos", value: String(summary?.reports_count ?? 0), icon: FileText, color: "text-emerald-400", border: "border-emerald-400/20" },
            { label: "Pendências", value: String(summary?.pending_count ?? 0), icon: AlertTriangle, color: "text-rose-400", border: "border-rose-400/20" },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border ${card.border} bg-slate-800/50 p-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-xs uppercase tracking-wide">{card.label}</span>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
              {isLoading ? (
                <div className="h-7 w-20 bg-slate-700 rounded animate-pulse" />
              ) : (
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              )}
            </div>
          ))}
        </div>

        {/* Abas */}
        <div className="flex gap-1 border-b border-slate-700/50 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                tab === t.id
                  ? "border-cyan-400 text-cyan-400"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        {tab === "precos" && <TabPrecos />}
        {tab === "vinculos" && <TabVinculos />}
        {tab === "pendencias" && <TabPendencias year={year} month={month} />}
        {tab === "consolidacao" && <TabConsolidacao year={year} month={month} />}
        {tab === "fechamentos" && <TabFechamentos />}
      </div>
    </FinanceShell>
  );
}
