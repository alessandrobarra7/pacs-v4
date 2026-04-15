import { useState } from "react";
import { useLocation } from "wouter";
import { FinanceShell } from "@/components/FinanceShell";
import { trpc } from "@/lib/trpc";
import {
  Users, Building2, FileText, AlertTriangle,
  DollarSign, UserCheck, Settings, ChevronRight,
  TrendingUp, BarChart3,
} from "lucide-react";

function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FinanceDashboard() {
  const [, navigate] = useLocation();
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth() + 1);

  const { data: summary, isLoading: loadingSummary } = trpc.billing.getAdminSummary.useQuery({ year, month });
  const { data: unitsData } = trpc.units.list.useQuery();
  const { data: usersData } = trpc.admin.listUsers.useQuery();
  // Visão por unidade em tempo real (ciclo aberto)
  const { data: liveUnits = [], isLoading: loadingLive } = trpc.billing.getSystemOwnerLiveByUnit.useQuery();

  const units = (unitsData ?? []) as Array<{ id: number; isActive: boolean }>;
  const users = (usersData ?? []) as Array<{ id: number; role: string; isActive: boolean }>;

  const activeDoctors = users.filter((u) => u.role === "medico" && u.isActive).length;
  const activeUnits = units.filter((u) => u.isActive).length;

  const summaryResp = (summary?.responsibles ?? []) as Array<{
    id: number; legal_name: string; trade_name: string | null;
    system_total: number; doctor_total: number; reports_count: number; pending_count: number;
  }>;

  const totalSystem = summaryResp.reduce((s, r) => s + r.system_total, 0);
  const totalDoctors = summaryResp.reduce((s, r) => s + r.doctor_total, 0);
  const totalReports = summaryResp.reduce((s, r) => s + r.reports_count, 0);
  const totalPending = summaryResp.reduce((s, r) => s + r.pending_count, 0);
  const monthName = new Date(year, month - 1, 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });

  // Totais do ciclo aberto (tempo real)
  const liveSystem = liveUnits.reduce((s, u) => s + parseFloat(u.system_amount), 0);
  const liveDoctor = liveUnits.reduce((s, u) => s + parseFloat(u.doctor_amount), 0);
  const liveNet = liveSystem - liveDoctor;
  const liveReports = liveUnits.reduce((s, u) => s + u.reports_count, 0);
  const liveAlerts = liveUnits.filter((u) => u.has_missing_config).length;

  const metricCards = [
    { label: "Médicos Ativos", value: activeDoctors, icon: Users, color: "text-cyan-400", border: "border-cyan-400/20" },
    { label: "Unidades Ativas", value: activeUnits, icon: Building2, color: "text-emerald-400", border: "border-emerald-400/20" },
    { label: "Laudos (Ciclo)", value: totalReports, icon: FileText, color: "text-amber-400", border: "border-amber-400/20" },
    { label: "Pendências", value: totalPending, icon: AlertTriangle, color: "text-rose-400", border: "border-rose-400/20" },
  ];

  return (
    <FinanceShell activeSection="dashboard">
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Título */}
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard Financeiro</h1>
          <p className="text-slate-400 text-sm mt-0.5">Visão geral do sistema PACS</p>
        </div>

        {/* Cards de métricas operacionais */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-xl border ${card.border} bg-slate-800/50 p-4`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-xs uppercase tracking-wide">{card.label}</span>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
              {loadingSummary ? (
                <div className="h-7 w-16 bg-slate-700 rounded animate-pulse" />
              ) : (
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              )}
            </div>
          ))}
        </div>

        {/* Bloco: Receita em tempo real (ciclo aberto) */}
        <div className="rounded-xl border border-cyan-500/20 bg-slate-800/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-cyan-400" />
              <h2 className="text-white font-semibold">Receita do Sistema — Ciclo Aberto</h2>
              <span className="text-xs text-slate-500 ml-1">tempo real</span>
            </div>
            <button
              onClick={() => navigate("/financeiro/overview")}
              className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Ver por unidade
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Receita Sistema", value: liveSystem, color: "text-cyan-400" },
              { label: "Custo Médico", value: liveDoctor, color: "text-amber-400" },
              { label: "Margem Operacional", value: liveNet, color: liveNet >= 0 ? "text-emerald-400" : "text-red-400" },
              { label: "Laudos no Ciclo", value: liveReports, color: "text-violet-400", isCnt: true },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
                <p className="text-slate-400 text-xs uppercase tracking-wide">{item.label}</p>
                {loadingLive ? (
                  <div className="h-6 w-20 bg-slate-700 rounded animate-pulse mt-1" />
                ) : (
                  <p className={`text-lg font-bold mt-1 ${item.color}`}>
                    {(item as any).isCnt ? item.value.toLocaleString("pt-BR") : fmtBRL(item.value)}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Mini-tabela de unidades */}
          {loadingLive ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-10 bg-slate-700/30 rounded animate-pulse" />)}
            </div>
          ) : liveUnits.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-3">Nenhuma unidade ativa com ciclo aberto.</p>
          ) : (
            <div className="space-y-1.5">
              {liveUnits.slice(0, 4).map((u) => (
                <div
                  key={u.unit_id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-700/20 hover:bg-slate-700/40 transition-colors cursor-pointer"
                  onClick={() => navigate("/financeiro/overview")}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="text-sm text-white truncate">{u.unit_name}</span>
                    {u.has_missing_config && (
                      <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-2">
                    <span className="text-xs text-slate-400">{u.reports_count} laudos</span>
                    <span className="text-sm font-semibold text-cyan-400">{fmtBRL(u.system_amount)}</span>
                  </div>
                </div>
              ))}
              {liveUnits.length > 4 && (
                <button
                  onClick={() => navigate("/financeiro/overview")}
                  className="w-full text-center text-xs text-slate-500 hover:text-cyan-400 py-1.5 transition-colors"
                >
                  Ver todas as {liveUnits.length} unidades →
                </button>
              )}
            </div>
          )}

          {liveAlerts > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-400 bg-red-400/5 border border-red-400/20 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {liveAlerts} unidade{liveAlerts !== 1 ? "s" : ""} com configuração incompleta —
              <button onClick={() => navigate("/financeiro/overview")} className="underline hover:no-underline ml-1">
                corrigir agora
              </button>
            </div>
          )}
        </div>

        {/* Resumo por responsável + Acesso rápido */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Resumo por responsável financeiro */}
          <div className="lg:col-span-2 rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-amber-400" />
                <h2 className="text-white font-semibold capitalize">
                  Por Responsável — {monthName}
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: "Receita Sistema", value: totalSystem, color: "text-cyan-400" },
                { label: "Custo Médicos", value: totalDoctors, color: "text-amber-400" },
                { label: "Total Geral", value: totalSystem + totalDoctors, color: "text-emerald-400" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
                  <p className="text-slate-400 text-xs uppercase tracking-wide">{item.label}</p>
                  {loadingSummary ? (
                    <div className="h-6 w-20 bg-slate-700 rounded animate-pulse mt-1" />
                  ) : (
                    <p className={`text-lg font-bold mt-1 ${item.color}`}>{fmtBRL(item.value)}</p>
                  )}
                </div>
              ))}
            </div>

            <h3 className="text-slate-400 text-xs uppercase tracking-wide mb-3">Responsáveis Financeiros</h3>
            {loadingSummary ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-slate-700 rounded animate-pulse" />
                ))}
              </div>
            ) : summaryResp.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">Nenhum evento financeiro no ciclo atual.</p>
            ) : (
              <div className="space-y-1.5">
                {summaryResp.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/financeiro/responsaveis/${r.id}`)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center shrink-0">
                        <UserCheck className="h-3.5 w-3.5 text-slate-300" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{r.trade_name ?? r.legal_name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {r.reports_count} laudo{r.reports_count !== 1 ? "s" : ""} · {r.pending_count} pendente{r.pending_count !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-xs text-slate-400">Sistema</p>
                      <p className="text-sm font-semibold text-cyan-400">{fmtBRL(r.system_total)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Acesso rápido */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
            <h2 className="text-white font-semibold mb-4">Acesso Rápido</h2>
            <div className="space-y-2">
              {[
                { label: "Receita por Unidade", icon: TrendingUp, path: "/financeiro/overview" },
                { label: "Cadastrar Médico", icon: Users, path: "/admin" },
                { label: "Gerenciar Unidades", icon: Building2, path: "/financeiro/unidades" },
                { label: "Responsáveis", icon: UserCheck, path: "/financeiro/responsaveis" },
                { label: "Admin Financeiro", icon: Settings, path: "/financeiro/admin" },
              ].map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-700/50 bg-slate-700/30 hover:bg-slate-700/60 hover:border-cyan-500/30 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-600/50 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                      <item.icon className="h-4 w-4 text-slate-300 group-hover:text-cyan-400 transition-colors" />
                    </div>
                    <span className="text-sm text-slate-200">{item.label}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </FinanceShell>
  );
}
