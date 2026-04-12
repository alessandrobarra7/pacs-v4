/**
 * FinanceResponsaveis — Cards de responsáveis financeiros com dívidas e extrato
 * Cada card mostra: Dívida ao Sistema, Dívida aos Médicos, Total, Laudos
 * Abas: Resumo | Unidades | Dívida Sistema | Dívida Médicos | Extrato
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCheck, Activity, Building2, Search } from "lucide-react";

function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Responsible = {
  id: number;
  legal_name: string;
  trade_name: string | null;
  cpf_cnpj: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  system_total: number;
  doctor_total: number;
  reports_count: number;
  pending_count: number;
};

type Tab = "resumo" | "unidades" | "divida_sistema" | "divida_medicos" | "extrato";

function ResponsibleCard({ resp, year, month }: { resp: Responsible; year: number; month: number }) {
  const [tab, setTab] = useState<Tab>("resumo");

  const { data: unitsData } = trpc.billing.listUnitsForResponsible.useQuery(
    { financialResponsibleId: resp.id },
    { enabled: tab === "unidades" }
  );

  const { data: itemsData, isLoading: loadingItems } = trpc.billing.getReportItems.useQuery(
    { financialResponsibleId: resp.id, year, month },
    { enabled: tab === "extrato" || tab === "divida_sistema" || tab === "divida_medicos" }
  );

  const units = (unitsData ?? []) as unknown as Array<{ id: number; name: string; isActive: boolean }>;
  const items = (itemsData ?? []) as unknown as Array<{
    id: number;
    unit_id: number;
    unit_name: string;
    doctor_user_id: number;
    doctor_name: string;
    report_key: string;
    patient_name: string | null;
    study_date: string | null;
    system_amount: string;
    doctor_amount: string;
    pricing_status: string;
    payment_status: string;
  }>;

  const tabs: { id: Tab; label: string }[] = [
    { id: "resumo", label: "Resumo" },
    { id: "unidades", label: "Unidades" },
    { id: "divida_sistema", label: "Dívida Sistema" },
    { id: "divida_medicos", label: "Dívida Médicos" },
    { id: "extrato", label: "Extrato" },
  ];

  const displayName = resp.trade_name ?? resp.legal_name;

  return (
    <Card className="border border-border/60">
      <CardContent className="p-5">
        {/* Header do card */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <UserCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{displayName}</h3>
                <Badge
                  variant="outline"
                  className={resp.isActive ? "text-green-600 border-green-600 text-xs" : "text-muted-foreground text-xs"}
                >
                  {resp.isActive ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {resp.cpf_cnpj && <span>{resp.cpf_cnpj}</span>}
                {resp.email && <span className="ml-2">· {resp.email}</span>}
                {resp.phone && <span className="ml-2">· {resp.phone}</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 mb-4 border-b border-border/60 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Conteúdo das abas */}
        {tab === "resumo" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Dívida ao Sistema</p>
              <p className="text-base font-bold text-red-500 mt-1">{fmtBRL(resp.system_total)}</p>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Dívida aos Médicos</p>
              <p className="text-base font-bold text-amber-600 mt-1">{fmtBRL(resp.doctor_total)}</p>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Geral</p>
              <p className="text-base font-bold text-foreground mt-1">{fmtBRL(resp.system_total + resp.doctor_total)}</p>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Laudos</p>
              <p className="text-base font-bold text-blue-600 mt-1">{resp.reports_count}</p>
            </div>
          </div>
        )}

        {tab === "unidades" && (
          <div>
            {units.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma unidade vinculada.</p>
            ) : (
              <div className="space-y-2">
                {units.map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-border/60">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{u.name}</span>
                    </div>
                    <Badge variant="outline" className={u.isActive ? "text-green-600 border-green-600 text-xs" : "text-xs"}>
                      {u.isActive ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(tab === "divida_sistema" || tab === "divida_medicos" || tab === "extrato") && (
          <div>
            {loadingItems ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum item no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Laudo</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground hidden sm:table-cell">Unidade</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground hidden md:table-cell">Médico</th>
                      {(tab === "divida_sistema" || tab === "extrato") && (
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">Sistema</th>
                      )}
                      {(tab === "divida_medicos" || tab === "extrato") && (
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">Médico</th>
                      )}
                      <th className="text-center py-2 px-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.slice(0, 20).map((item) => (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-2 px-2">
                          <p className="font-medium">{item.patient_name ?? "—"}</p>
                          <p className="text-muted-foreground">{item.report_key}</p>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground hidden sm:table-cell">{item.unit_name}</td>
                        <td className="py-2 px-2 text-muted-foreground hidden md:table-cell">{item.doctor_name}</td>
                        {(tab === "divida_sistema" || tab === "extrato") && (
                          <td className="py-2 px-2 text-right font-medium text-blue-600">{fmtBRL(item.system_amount)}</td>
                        )}
                        {(tab === "divida_medicos" || tab === "extrato") && (
                          <td className="py-2 px-2 text-right font-medium text-amber-600">{fmtBRL(item.doctor_amount)}</td>
                        )}
                        <td className="py-2 px-2 text-center">
                          <Badge
                            variant="outline"
                            className={
                              item.payment_status === "paid"
                                ? "text-green-600 border-green-600 text-xs"
                                : item.payment_status === "pending"
                                ? "text-amber-600 border-amber-600 text-xs"
                                : "text-xs"
                            }
                          >
                            {item.payment_status === "paid" ? "Pago" : item.payment_status === "pending" ? "Pendente" : item.payment_status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {items.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Exibindo 20 de {items.length} itens.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FinanceResponsaveis() {
  const [search, setSearch] = useState("");
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data: summaryData, isLoading } = trpc.billing.getAdminSummary.useQuery({ year, month });

  const responsibles = ((summaryData?.responsibles ?? []) as Responsible[]);

  const filtered = responsibles.filter((r) => {
    const q = search.toLowerCase();
    const name = (r.trade_name ?? r.legal_name).toLowerCase();
    return name.includes(q) || (r.email ?? "").toLowerCase().includes(q);
  });

  const activeCount = responsibles.filter((r) => r.isActive).length;
  const unitsCount = 0; // calculado via unidades vinculadas

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Responsáveis Financeiros</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestão de responsáveis e suas obrigações</p>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "TOTAL",
            value: isLoading ? null : responsibles.length,
            icon: UserCheck,
            color: "text-blue-600",
            bg: "bg-blue-50 dark:bg-blue-950",
          },
          {
            label: "ATIVOS",
            value: isLoading ? null : activeCount,
            icon: Activity,
            color: "text-green-600",
            bg: "bg-green-50 dark:bg-green-950",
          },
          {
            label: "TOTAL LAUDOS",
            value: isLoading ? null : responsibles.reduce((s, r) => s + r.reports_count, 0),
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

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 h-9"
          placeholder="Buscar responsável..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Cards de responsáveis */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <UserCheck className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum responsável encontrado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((resp) => (
            <ResponsibleCard key={resp.id} resp={resp} year={year} month={month} />
          ))}
        </div>
      )}
    </div>
  );
}
