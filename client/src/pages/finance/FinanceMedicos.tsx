/**
 * FinanceMedicos — Lista de médicos com faixa de preço e vínculos
 * Layout: 3 cards de resumo no topo + tabela com busca
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Activity, Building2, Search } from "lucide-react";

function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type DoctorUser = {
  id: number;
  name: string | null;
  username: string;
  email: string | null;
  role: string;
  isActive: boolean;
};

type DoctorPrice = {
  id: number;
  financial_responsible_id: number;
  unit_id: number;
  doctor_user_id: number;
  price_per_report: string;
  starts_at: Date | string;
  ends_at: Date | string | null;
};

type Unit = { id: number; name: string };

export default function FinanceMedicos() {
  const [search, setSearch] = useState("");

  const { data: usersData, isLoading: loadingUsers } = trpc.admin.listUsers.useQuery();
  const { data: pricesData, isLoading: loadingPrices } = trpc.billing.listAllDoctorPrices.useQuery();
  const { data: unitsData } = trpc.units.list.useQuery();

  const users = (usersData ?? []) as DoctorUser[];
  const prices = (pricesData ?? []) as DoctorPrice[];
  const units = (unitsData ?? []) as Unit[];

  const doctors = users.filter((u) => u.role === "medico");
  const activeDoctors = doctors.filter((d) => d.isActive);

  // Agrupar preços por médico
  const pricesByDoctor = useMemo(() => {
    const map = new Map<number, DoctorPrice[]>();
    for (const p of prices) {
      const arr = map.get(p.doctor_user_id) ?? [];
      arr.push(p);
      map.set(p.doctor_user_id, arr);
    }
    return map;
  }, [prices]);

  // Total de vínculos ativos (preços sem ends_at)
  const activeLinks = prices.filter((p) => !p.ends_at).length;

  const filtered = doctors.filter((d) => {
    const q = search.toLowerCase();
    return (
      (d.name ?? "").toLowerCase().includes(q) ||
      d.username.toLowerCase().includes(q) ||
      (d.email ?? "").toLowerCase().includes(q)
    );
  });

  const isLoading = loadingUsers || loadingPrices;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Médicos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cadastro de médicos e vínculos com unidades</p>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "TOTAL MÉDICOS",
            value: isLoading ? null : doctors.length,
            icon: Users,
            color: "text-blue-600",
            bg: "bg-blue-50 dark:bg-blue-950",
          },
          {
            label: "ATIVOS",
            value: isLoading ? null : activeDoctors.length,
            icon: Activity,
            color: "text-green-600",
            bg: "bg-green-50 dark:bg-green-950",
          },
          {
            label: "VÍNCULOS ATIVOS",
            value: isLoading ? null : activeLinks,
            icon: Building2,
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
                    <Skeleton className="h-7 w-10 mt-1" />
                  ) : (
                    <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
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
          {/* Busca */}
          <div className="p-4 border-b border-border/60">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="Buscar por nome ou e-mail..."
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
              <Users className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">Nenhum médico encontrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Médico</th>
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground hidden sm:table-cell">E-mail</th>
                    <th className="text-center px-4 py-3 font-medium text-xs text-muted-foreground">Unidades</th>
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Faixa de Preço</th>
                    <th className="text-center px-4 py-3 font-medium text-xs text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((doctor) => {
                    const doctorPrices = pricesByDoctor.get(doctor.id) ?? [];
                    const activePrices = doctorPrices.filter((p) => !p.ends_at);
                    const priceValues = activePrices.map((p) => parseFloat(p.price_per_report));
                    const minPrice = priceValues.length > 0 ? Math.min(...priceValues) : null;
                    const maxPrice = priceValues.length > 0 ? Math.max(...priceValues) : null;

                    const initials = (doctor.name ?? doctor.username)
                      .split(" ")
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase();

                    return (
                      <tr key={doctor.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{doctor.name ?? doctor.username}</p>
                              <p className="text-xs text-muted-foreground truncate hidden sm:block">
                                {doctor.username}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                          {doctor.email ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-medium">{activePrices.length}</span>
                          <span className="text-xs text-muted-foreground ml-1">
                            {activePrices.length === 1 ? "ativa" : "ativas"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {minPrice === null ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : minPrice === maxPrice ? (
                            <span className="text-sm font-medium text-green-600">{fmtBRL(minPrice)}</span>
                          ) : (
                            <span className="text-sm font-medium text-green-600">
                              {fmtBRL(minPrice)} – {fmtBRL(maxPrice)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant="outline"
                            className={doctor.isActive
                              ? "text-green-600 border-green-600 text-xs"
                              : "text-muted-foreground text-xs"}
                          >
                            {doctor.isActive ? "Ativo" : "Inativo"}
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
