/**
 * FinanceOwnerOverview — Painel operacional do dono do sistema por unidade.
 * Responde à pergunta principal: "Quanto o sistema está ganhando por unidade agora?"
 *
 * Blocos:
 *  1. Cards de totais globais (Receita do Sistema, Custo Médico, Margem, Laudos)
 *  2. Tabela por unidade com receita, custo, margem, ciclo, alertas
 *  3. Alertas de configuração ausente
 */
import { useState } from "react";
import { useLocation } from "wouter";
import {
  TrendingUp, Building2, FileText, AlertTriangle, CheckCircle,
  ChevronRight, RefreshCw, Settings, DollarSign, Users
} from "lucide-react";
import { FinanceShell } from "@/components/FinanceShell";
import { trpc } from "@/lib/trpc";

const fmtBRL = (v: number | string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: Date | string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export default function FinanceOwnerOverview() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<"all" | "ok" | "alert">("all");

  const { data: units = [], isLoading, refetch, isFetching } = trpc.billing.getSystemOwnerLiveByUnit.useQuery(undefined, {
    refetchInterval: 60_000, // atualiza a cada 60s
  });

  // Totais globais
  const totalSystem = units.reduce((s, u) => s + parseFloat(u.system_amount), 0);
  const totalDoctor = units.reduce((s, u) => s + parseFloat(u.doctor_amount), 0);
  const totalNet = units.reduce((s, u) => s + parseFloat(u.net_amount), 0);
  const totalReports = units.reduce((s, u) => s + u.reports_count, 0);
  const alertCount = units.filter((u) => u.has_missing_config).length;
  const topUnit = [...units].sort((a, b) => parseFloat(b.system_amount) - parseFloat(a.system_amount))[0];
  const topVolume = [...units].sort((a, b) => b.reports_count - a.reports_count)[0];

  const filtered = units.filter((u) => {
    if (filter === "ok") return !u.has_missing_config;
    if (filter === "alert") return u.has_missing_config;
    return true;
  });

  return (
    <FinanceShell activeSection="overview">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-cyan-400" />
              Receita do Sistema — Tempo Real
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Ciclo aberto por unidade · atualiza automaticamente
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700/50 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        {/* Cards de totais globais */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Receita do Sistema",
              value: fmtBRL(totalSystem),
              sub: `${units.length} unidade${units.length !== 1 ? "s" : ""}`,
              color: "text-cyan-400",
              bg: "bg-cyan-400/10",
              icon: DollarSign,
            },
            {
              label: "Custo Médico",
              value: fmtBRL(totalDoctor),
              sub: "total pago a médicos",
              color: "text-amber-400",
              bg: "bg-amber-400/10",
              icon: Users,
            },
            {
              label: "Margem Operacional",
              value: fmtBRL(totalNet),
              sub: totalSystem > 0 ? `${((totalNet / totalSystem) * 100).toFixed(1)}% da receita` : "—",
              color: totalNet >= 0 ? "text-emerald-400" : "text-red-400",
              bg: totalNet >= 0 ? "bg-emerald-400/10" : "bg-red-400/10",
              icon: TrendingUp,
            },
            {
              label: "Laudos no Ciclo",
              value: totalReports.toLocaleString("pt-BR"),
              sub: topUnit ? `Maior: ${topUnit.unit_name}` : "—",
              color: "text-violet-400",
              bg: "bg-violet-400/10",
              icon: FileText,
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-slate-400 text-xs uppercase tracking-wide">{card.label}</p>
                <div className={`w-7 h-7 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                </div>
              </div>
              {isLoading ? (
                <div className="h-7 w-28 bg-slate-700 rounded animate-pulse" />
              ) : (
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              )}
              <p className="text-slate-500 text-xs mt-1">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Destaques */}
        {!isLoading && (topUnit || topVolume || alertCount > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topUnit && (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-xs">Maior Receita</p>
                  <p className="text-white font-semibold text-sm truncate">{topUnit.unit_name}</p>
                  <p className="text-cyan-400 text-xs">{fmtBRL(topUnit.system_amount)}</p>
                </div>
              </div>
            )}
            {topVolume && (
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-violet-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-xs">Maior Volume</p>
                  <p className="text-white font-semibold text-sm truncate">{topVolume.unit_name}</p>
                  <p className="text-violet-400 text-xs">{topVolume.reports_count} laudos</p>
                </div>
              </div>
            )}
            {alertCount > 0 ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-xs">Configuração Incompleta</p>
                  <p className="text-white font-semibold text-sm">{alertCount} unidade{alertCount !== 1 ? "s" : ""}</p>
                  <p className="text-red-400 text-xs">requer atenção</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-xs">Configuração</p>
                  <p className="text-white font-semibold text-sm">Tudo configurado</p>
                  <p className="text-emerald-400 text-xs">todas as unidades ok</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filtros */}
        <div className="flex items-center gap-2">
          {[
            { key: "all", label: `Todas (${units.length})` },
            { key: "ok", label: `Configuradas (${units.length - alertCount})` },
            { key: "alert", label: `Com alerta (${alertCount})` },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-cyan-700/70 text-white"
                  : "bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50 border border-slate-700/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Tabela principal por unidade */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-900/40">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Unidade</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 hidden md:table-cell">Responsável</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 hidden sm:table-cell">Preço/Laudo</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Laudos</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400">Receita Sistema</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 hidden lg:table-cell">Custo Médico</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 hidden lg:table-cell">Margem</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 hidden xl:table-cell">Ciclo</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-700/20">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-slate-700/50 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                      Nenhuma unidade encontrada.
                    </td>
                  </tr>
                ) : (
                  filtered.map((unit) => {
                    const netVal = parseFloat(unit.net_amount);
                    const sysVal = parseFloat(unit.system_amount);
                    const margin = sysVal > 0 ? ((netVal / sysVal) * 100).toFixed(1) : null;
                    return (
                      <tr
                        key={unit.unit_id}
                        className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors"
                      >
                        {/* Unidade */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-slate-700/50 flex items-center justify-center shrink-0">
                              <Building2 className="h-3.5 w-3.5 text-slate-400" />
                            </div>
                            <span className="text-white font-medium text-sm">{unit.unit_name}</span>
                          </div>
                        </td>
                        {/* Responsável */}
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-slate-300 text-sm">
                            {unit.responsible_name ?? <span className="text-red-400">Não configurado</span>}
                          </span>
                        </td>
                        {/* Preço/Laudo */}
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          {unit.system_price_per_report ? (
                            <span className="text-slate-300 text-sm">{fmtBRL(unit.system_price_per_report)}</span>
                          ) : (
                            <span className="text-red-400 text-xs">Não configurado</span>
                          )}
                        </td>
                        {/* Laudos */}
                        <td className="px-4 py-3 text-right">
                          <span className="text-slate-200 font-medium">{unit.reports_count}</span>
                        </td>
                        {/* Receita Sistema */}
                        <td className="px-4 py-3 text-right">
                          <span className="text-cyan-400 font-semibold">{fmtBRL(unit.system_amount)}</span>
                        </td>
                        {/* Custo Médico */}
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          <span className="text-amber-400">{fmtBRL(unit.doctor_amount)}</span>
                        </td>
                        {/* Margem */}
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          <span className={netVal >= 0 ? "text-emerald-400" : "text-red-400"}>
                            {fmtBRL(unit.net_amount)}
                            {margin && <span className="text-xs text-slate-500 ml-1">({margin}%)</span>}
                          </span>
                        </td>
                        {/* Ciclo */}
                        <td className="px-4 py-3 hidden xl:table-cell">
                          {unit.cycle_start ? (
                            <span className="text-slate-400 text-xs">
                              {fmtDate(unit.cycle_start)} — {fmtDate(unit.cycle_end)}
                            </span>
                          ) : (
                            <span className="text-red-400 text-xs">Sem ciclo</span>
                          )}
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          {unit.has_missing_config ? (
                            <span
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-400/10 text-red-400"
                              title={unit.missing_config_details.join(", ")}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Alerta
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400">
                              <CheckCircle className="h-3 w-3" />
                              OK
                            </span>
                          )}
                        </td>
                        {/* Ações */}
                        <td className="px-4 py-3">
                          <button
                            onClick={() => navigate(`/financeiro/unidades?unit=${unit.unit_id}`)}
                            className="p-1.5 rounded hover:bg-slate-700/50 text-slate-500 hover:text-cyan-400 transition-colors"
                            title="Ver detalhe da unidade"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alertas de configuração */}
        {!isLoading && alertCount > 0 && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <h3 className="text-red-400 font-semibold text-sm">
                {alertCount} unidade{alertCount !== 1 ? "s" : ""} com configuração incompleta
              </h3>
            </div>
            <div className="space-y-2">
              {units.filter((u) => u.has_missing_config).map((u) => (
                <div key={u.unit_id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-red-500/5 border border-red-500/10">
                  <div>
                    <span className="text-white text-sm font-medium">{u.unit_name}</span>
                    <span className="text-red-400 text-xs ml-2">
                      Faltando: {u.missing_config_details.join(", ")}
                    </span>
                  </div>
                  <button
                    onClick={() => navigate(`/financeiro/unidades?unit=${u.unit_id}`)}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    <Settings className="h-3 w-3" />
                    Corrigir
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </FinanceShell>
  );
}
