import { useState } from "react";
import { useLocation } from "wouter";
import { FinanceShell } from "@/components/FinanceShell";
import { trpc } from "@/lib/trpc";
import { UserCheck, Activity, Building2, Search, ChevronDown, ChevronUp, FileText, ExternalLink } from "lucide-react";

function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Responsible = {
  id: number; legal_name: string; trade_name: string | null;
  cpf_cnpj: string | null; email: string | null; phone: string | null;
  isActive: boolean; system_total: number; doctor_total: number;
  reports_count: number; pending_count: number;
};
type Tab = "resumo" | "unidades" | "divida_sistema" | "divida_medicos" | "extrato";

function ResponsibleCard({ resp, year, month }: { resp: Responsible; year: number; month: number }) {
  const [tab, setTab] = useState<Tab>("resumo");
  const [expanded, setExpanded] = useState(false);
  const [, navigate] = useLocation();

  const { data: unitsData } = trpc.billing.listUnitsForResponsible.useQuery(
    { financialResponsibleId: resp.id },
    { enabled: tab === "unidades" && expanded }
  );
  const { data: itemsData, isLoading: loadingItems } = trpc.billing.getReportItems.useQuery(
    { financialResponsibleId: resp.id, year, month },
    { enabled: (tab === "extrato" || tab === "divida_sistema" || tab === "divida_medicos") && expanded }
  );

  const units = (unitsData ?? []) as unknown as Array<{ id: number; name: string; isActive: boolean }>;
  const items = (itemsData ?? []) as unknown as Array<{
    id: number; unit_id: number; unit_name: string; doctor_user_id: number; doctor_name: string;
    report_key: string; patient_name: string | null; study_date: string | null;
    system_amount: string; doctor_amount: string; pricing_status: string;
  }>;

  const tabs: { key: Tab; label: string }[] = [
    { key: "resumo", label: "Resumo" },
    { key: "unidades", label: "Unidades" },
    { key: "divida_sistema", label: "Dívida Sistema" },
    { key: "divida_medicos", label: "Dívida Médicos" },
    { key: "extrato", label: "Extrato" },
  ];

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
      {/* Header do card */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-700/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 rounded-full bg-cyan-700/30 flex items-center justify-center shrink-0">
            <UserCheck className="h-5 w-5 text-cyan-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white truncate">{resp.trade_name ?? resp.legal_name}</p>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                resp.isActive ? "bg-emerald-400/10 text-emerald-400" : "bg-slate-600/40 text-slate-400"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${resp.isActive ? "bg-emerald-400" : "bg-slate-500"}`} />
                {resp.isActive ? "Ativo" : "Inativo"}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {resp.cpf_cnpj ?? ""}
              {resp.email ? ` • ${resp.email}` : ""}
              {resp.phone ? ` • ${resp.phone}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/financeiro/responsaveis/${resp.id}`); }}
            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded hover:bg-white/5 transition-colors"
          >
            <ExternalLink size={12} />
            Detalhe
          </button>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* Métricas resumo (sempre visíveis) */}
      <div className="grid grid-cols-4 border-t border-slate-700/30">
        {[
          { label: "Dívida ao Sistema", value: fmtBRL(resp.system_total), color: "text-rose-400" },
          { label: "Dívida aos Médicos", value: fmtBRL(resp.doctor_total), color: "text-amber-400" },
          { label: "Total Geral", value: fmtBRL(resp.system_total + resp.doctor_total), color: "text-cyan-400" },
          { label: "Laudos", value: String(resp.reports_count), color: "text-slate-300" },
        ].map((item) => (
          <div key={item.label} className="px-4 py-3 border-r border-slate-700/30 last:border-r-0">
            <p className="text-slate-400 text-xs uppercase tracking-wide">{item.label}</p>
            <p className={`text-base font-bold mt-0.5 ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Conteúdo expandido */}
      {expanded && (
        <div className="border-t border-slate-700/30">
          {/* Abas */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-700/30 bg-slate-900/30">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "bg-cyan-700/60 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Conteúdo da aba */}
          <div className="p-4">
            {tab === "resumo" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-700/50 p-3">
                  <p className="text-slate-400 text-xs mb-1">Razão Social</p>
                  <p className="text-white text-sm">{resp.legal_name}</p>
                </div>
                <div className="rounded-lg border border-slate-700/50 p-3">
                  <p className="text-slate-400 text-xs mb-1">Nome Fantasia</p>
                  <p className="text-white text-sm">{resp.trade_name ?? "—"}</p>
                </div>
                <div className="rounded-lg border border-slate-700/50 p-3">
                  <p className="text-slate-400 text-xs mb-1">CPF/CNPJ</p>
                  <p className="text-white text-sm">{resp.cpf_cnpj ?? "—"}</p>
                </div>
                <div className="rounded-lg border border-slate-700/50 p-3">
                  <p className="text-slate-400 text-xs mb-1">E-mail</p>
                  <p className="text-white text-sm">{resp.email ?? "—"}</p>
                </div>
                <div className="rounded-lg border border-slate-700/50 p-3">
                  <p className="text-slate-400 text-xs mb-1">Telefone</p>
                  <p className="text-white text-sm">{resp.phone ?? "—"}</p>
                </div>
                <div className="rounded-lg border border-slate-700/50 p-3">
                  <p className="text-slate-400 text-xs mb-1">Pendências</p>
                  <p className="text-rose-400 text-sm font-semibold">{resp.pending_count}</p>
                </div>
              </div>
            )}

            {tab === "unidades" && (
              <div className="space-y-2">
                {units.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">Nenhuma unidade vinculada.</p>
                ) : (
                  units.map((u) => (
                    <div key={u.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-700/30">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-cyan-400" />
                        <span className="text-sm text-white">{u.name}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        u.isActive ? "bg-emerald-400/10 text-emerald-400" : "bg-slate-600/40 text-slate-400"
                      }`}>
                        {u.isActive ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {(tab === "divida_sistema" || tab === "divida_medicos" || tab === "extrato") && (
              <div>
                {loadingItems ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-slate-700/30 rounded animate-pulse" />)}
                  </div>
                ) : items.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">Nenhum item encontrado.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-700/50">
                          <th className="text-left py-2 px-2 text-slate-400 font-medium">Chave</th>
                          <th className="text-left py-2 px-2 text-slate-400 font-medium">Médico</th>
                          <th className="text-left py-2 px-2 text-slate-400 font-medium">Unidade</th>
                          {(tab === "divida_sistema" || tab === "extrato") && (
                            <th className="text-right py-2 px-2 text-slate-400 font-medium">Sistema</th>
                          )}
                          {(tab === "divida_medicos" || tab === "extrato") && (
                            <th className="text-right py-2 px-2 text-slate-400 font-medium">Médico</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id} className="border-b border-slate-700/20 hover:bg-slate-700/20">
                            <td className="py-2 px-2 text-slate-300 font-mono">{item.report_key}</td>
                            <td className="py-2 px-2 text-slate-300">{item.doctor_name}</td>
                            <td className="py-2 px-2 text-slate-400">{item.unit_name}</td>
                            {(tab === "divida_sistema" || tab === "extrato") && (
                              <td className="py-2 px-2 text-right text-cyan-400 font-medium">{fmtBRL(item.system_amount)}</td>
                            )}
                            {(tab === "divida_medicos" || tab === "extrato") && (
                              <td className="py-2 px-2 text-right text-amber-400 font-medium">{fmtBRL(item.doctor_amount)}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FinanceResponsaveis() {
  const [search, setSearch] = useState("");
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth() + 1);

  const { data: summaryData, isLoading } = trpc.billing.getAdminSummary.useQuery({ year, month });
  const summaryResp = (summaryData?.responsibles ?? []) as Responsible[];

  const totalActive = summaryResp.filter((r) => r.isActive).length;
  const totalUnits = summaryResp.length; // placeholder

  const filtered = summaryResp.filter((r) =>
    (r.trade_name ?? r.legal_name).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <FinanceShell activeSection="responsaveis">
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Título */}
        <div>
          <h1 className="text-2xl font-bold text-white">Responsáveis Financeiros</h1>
          <p className="text-slate-400 text-sm mt-0.5">Gestão de responsáveis e suas obrigações</p>
        </div>

        {/* Cards de métricas */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total", value: summaryResp.length, icon: UserCheck, color: "text-cyan-400", border: "border-cyan-400/20" },
            { label: "Ativos", value: totalActive, icon: Activity, color: "text-emerald-400", border: "border-emerald-400/20" },
            { label: "Unidades Cobertas", value: totalUnits, icon: Building2, color: "text-amber-400", border: "border-amber-400/20" },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border ${card.border} bg-slate-800/50 p-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-xs uppercase tracking-wide">{card.label}</span>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
              {isLoading ? (
                <div className="h-7 w-12 bg-slate-700 rounded animate-pulse" />
              ) : (
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              )}
            </div>
          ))}
        </div>

        {/* Busca */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar responsável..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        {/* Cards de responsáveis */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-slate-800/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <UserCheck className="h-8 w-8 mx-auto text-slate-600 mb-2" />
            <p className="text-slate-500 text-sm">Nenhum responsável encontrado.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((resp) => (
              <ResponsibleCard key={resp.id} resp={resp} year={year} month={month} />
            ))}
          </div>
        )}
      </div>
    </FinanceShell>
  );
}
