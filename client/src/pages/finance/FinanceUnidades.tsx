import { useState, useMemo } from "react";
import { FinanceShell } from "@/components/FinanceShell";
import { trpc } from "@/lib/trpc";
import { Building2, Activity, DollarSign, Search } from "lucide-react";

function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Unit = { id: number; name: string; address?: string | null; city?: string | null; state?: string | null; isActive: boolean };
type SystemPrice = { id: number; financial_responsible_id: number; unit_id: number; unit_name: string | null; price_per_report: string; starts_at: Date | string; ends_at: Date | string | null };
type Responsible = { id: number; legal_name: string; trade_name: string | null; isActive: boolean };
type ResponsibleUnit = { id: number; unit_id: number; financial_responsible_id: number; starts_at: Date | string; ends_at: Date | string | null };

export default function FinanceUnidades() {
  const [search, setSearch] = useState("");

  const { data: unitsData, isLoading: loadingUnits } = trpc.units.list.useQuery();
  const { data: systemPricesData, isLoading: loadingPrices } = trpc.billing.listAllSystemPrices.useQuery();
  const { data: responsiblesData } = trpc.billing.listResponsibles.useQuery();

  const units = (unitsData ?? []) as Unit[];
  const systemPrices = (systemPricesData ?? []) as SystemPrice[];
  const responsibles = (responsiblesData ?? []) as Responsible[];

  // Mapa: unit_id → preço mais recente
  const priceByUnit = useMemo(() => {
    const map = new Map<number, SystemPrice>();
    for (const p of systemPrices) {
      if (!p.ends_at) {
        const existing = map.get(p.unit_id);
        if (!existing || new Date(p.starts_at) > new Date(existing.starts_at)) {
          map.set(p.unit_id, p);
        }
      }
    }
    return map;
  }, [systemPrices]);

  // Mapa: unit_id → responsável
  const respByUnit = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of systemPrices) {
      if (!p.ends_at) map.set(p.unit_id, p.financial_responsible_id);
    }
    return map;
  }, [systemPrices]);

  const respMap = useMemo(() => {
    const map = new Map<number, Responsible>();
    for (const r of responsibles) map.set(r.id, r);
    return map;
  }, [responsibles]);

  const activeUnits = units.filter((u) => u.isActive).length;
  const allPrices = Array.from(priceByUnit.values()).map((p) => parseFloat(p.price_per_report));
  const avgPrice = allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0;

  const filtered = units.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()));

  const isLoading = loadingUnits || loadingPrices;

  return (
    <FinanceShell activeSection="unidades">
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Título */}
        <div>
          <h1 className="text-2xl font-bold text-white">Unidades</h1>
          <p className="text-slate-400 text-sm mt-0.5">Cadastro e gestão de unidades médicas</p>
        </div>

        {/* Cards de métricas */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Unidades", value: units.length, icon: Building2, color: "text-cyan-400", border: "border-cyan-400/20" },
            { label: "Ativas", value: activeUnits, icon: Activity, color: "text-emerald-400", border: "border-emerald-400/20" },
            { label: "Custo Médio/Laudo", value: fmtBRL(avgPrice), icon: DollarSign, color: "text-amber-400", border: "border-amber-400/20" },
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

        {/* Tabela */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
          {/* Busca */}
          <div className="p-4 border-b border-slate-700/50">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar unidade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>

          {/* Cabeçalho */}
          <div className="grid grid-cols-12 px-4 py-2.5 text-xs font-medium text-slate-400 uppercase tracking-wide border-b border-slate-700/30 bg-slate-900/30">
            <div className="col-span-4">Unidade</div>
            <div className="col-span-3 hidden sm:block">Endereço</div>
            <div className="col-span-2">Custo/Laudo</div>
            <div className="col-span-2">Resp. Financeiro</div>
            <div className="col-span-1 text-center">Status</div>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 bg-slate-700/30 rounded animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 className="h-8 w-8 mx-auto text-slate-600 mb-2" />
              <p className="text-slate-500 text-sm">Nenhuma unidade encontrada.</p>
            </div>
          ) : (
            filtered.map((unit) => {
              const price = priceByUnit.get(unit.id);
              const respId = respByUnit.get(unit.id);
              const resp = respId ? respMap.get(respId) : null;
              const address = [unit.address, unit.city, unit.state].filter(Boolean).join(", ");

              return (
                <div
                  key={unit.id}
                  className="grid grid-cols-12 px-4 py-3.5 border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors items-center"
                >
                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-cyan-700/30 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-cyan-400" />
                    </div>
                    <p className="text-sm font-medium text-white truncate">{unit.name}</p>
                  </div>
                  <div className="col-span-3 hidden sm:block">
                    <span className="text-xs text-slate-400 truncate">{address || "—"}</span>
                  </div>
                  <div className="col-span-2">
                    {price ? (
                      <span className="text-sm font-semibold text-emerald-400">{fmtBRL(price.price_per_report)}</span>
                    ) : (
                      <span className="text-xs text-slate-500">Não configurado</span>
                    )}
                  </div>
                  <div className="col-span-2">
                    {resp ? (
                      <span className="text-xs text-slate-300 truncate">{resp.trade_name ?? resp.legal_name}</span>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </div>
                  <div className="col-span-1 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      unit.isActive ? "bg-emerald-400/10 text-emerald-400" : "bg-slate-600/40 text-slate-400"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${unit.isActive ? "bg-emerald-400" : "bg-slate-500"}`} />
                      {unit.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </FinanceShell>
  );
}
