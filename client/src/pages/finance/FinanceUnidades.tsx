/**
 * FinanceUnidades — Lista de unidades com custo/laudo e responsável financeiro
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Activity, DollarSign, Search } from "lucide-react";

function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Unit = {
  id: number;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  isActive: boolean;
};

type SystemPrice = {
  id: number;
  financial_responsible_id: number;
  unit_id: number;
  unit_name: string | null;
  price_per_report: string;
  starts_at: Date | string;
  ends_at: Date | string | null;
};

type Responsible = {
  id: number;
  legal_name: string;
  trade_name: string | null;
  isActive: boolean;
};

type ResponsibleUnit = {
  id: number;
  unit_id: number;
  financial_responsible_id: number;
  starts_at: Date | string;
  ends_at: Date | string | null;
};

export default function FinanceUnidades() {
  const [search, setSearch] = useState("");

  const { data: unitsData, isLoading: loadingUnits } = trpc.units.list.useQuery();
  const { data: sysPricesData, isLoading: loadingPrices } = trpc.billing.listAllSystemPrices.useQuery();
  const { data: responsiblesData } = trpc.billing.listResponsibles.useQuery();

  const units = (unitsData ?? []) as Unit[];
  const sysPrices = (sysPricesData ?? []) as SystemPrice[];
  const responsibles = (responsiblesData ?? []) as Responsible[];

  // Mapa: unit_id → preço do sistema ativo (sem ends_at)
  const activePriceByUnit = useMemo(() => {
    const map = new Map<number, SystemPrice>();
    for (const p of sysPrices) {
      if (!p.ends_at) {
        map.set(p.unit_id, p);
      }
    }
    return map;
  }, [sysPrices]);

  // Mapa: financial_responsible_id → nome
  const respNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of responsibles) {
      map.set(r.id, r.trade_name ?? r.legal_name);
    }
    return map;
  }, [responsibles]);

  const activeUnits = units.filter((u) => u.isActive);

  // Custo médio por laudo
  const activePrices = Array.from(activePriceByUnit.values());
  const avgCost =
    activePrices.length > 0
      ? activePrices.reduce((s, p) => s + parseFloat(p.price_per_report), 0) / activePrices.length
      : 0;

  const filtered = units.filter((u) => {
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || (u.city ?? "").toLowerCase().includes(q);
  });

  const isLoading = loadingUnits || loadingPrices;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Unidades</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cadastro e gestão de unidades médicas</p>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "TOTAL UNIDADES",
            value: isLoading ? null : units.length,
            icon: Building2,
            color: "text-blue-600",
            bg: "bg-blue-50 dark:bg-blue-950",
          },
          {
            label: "ATIVAS",
            value: isLoading ? null : activeUnits.length,
            icon: Activity,
            color: "text-green-600",
            bg: "bg-green-50 dark:bg-green-950",
          },
          {
            label: "CUSTO MÉDIO/LAUDO",
            value: isLoading ? null : fmtBRL(avgCost),
            icon: DollarSign,
            color: "text-amber-600",
            bg: "bg-amber-50 dark:bg-amber-950",
          },
        ].map((card) => (
          <Card key={card.label} className="border border-border/60">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground tracking-wide">{card.label}</p>
                  {card.value === null ? (
                    <Skeleton className="h-7 w-16 mt-1" />
                  ) : (
                    <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                  )}
                </div>
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabela */}
      <Card className="border border-border/60">
        <CardContent className="p-0">
          <div className="p-4 border-b border-border/60">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="Buscar unidade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">Nenhuma unidade encontrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Unidade</th>
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground hidden md:table-cell">Endereço</th>
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Custo/Laudo</th>
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground hidden sm:table-cell">Resp. Financeiro</th>
                    <th className="text-center px-4 py-3 font-medium text-xs text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((unit) => {
                    const price = activePriceByUnit.get(unit.id);
                    const respName = price ? respNameById.get(price.financial_responsible_id) : null;

                    return (
                      <tr key={unit.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-blue-600" />
                            </div>
                            <p className="font-medium">{unit.name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                          {unit.address
                            ? `${unit.address}${unit.city ? ` · ${unit.city}` : ""}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {price ? (
                            <span className="text-sm font-semibold text-green-600">
                              {fmtBRL(price.price_per_report)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Não configurado</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm hidden sm:table-cell">
                          {respName ? (
                            <span className="text-primary font-medium">{respName}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant="outline"
                            className={unit.isActive
                              ? "text-green-600 border-green-600 text-xs"
                              : "text-muted-foreground text-xs"}
                          >
                            {unit.isActive ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
