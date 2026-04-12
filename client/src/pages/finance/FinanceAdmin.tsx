/**
 * FinanceAdmin — Painel administrativo financeiro
 * Cards: Receita Sistema, Pagto Médicos, Laudos, Pendências
 * Abas: Preços | Vínculos | Pendências | Consolidação | Fechamentos
 * Botão: Fechar Ciclo
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign,
  Users,
  FileText,
  AlertTriangle,
  Calendar,
  RefreshCw,
} from "lucide-react";

function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("pt-BR");
}

type AdminTab = "precos" | "vinculos" | "pendencias" | "consolidacao" | "fechamentos";

// ── Sub-aba: Preços ──────────────────────────────────────────────────────────
function TabPrecos() {
  const { data: sysPrices, isLoading: loadingSys } = trpc.billing.listAllSystemPrices.useQuery();
  const { data: docPrices, isLoading: loadingDoc } = trpc.billing.listAllDoctorPrices.useQuery();

  const sys = (sysPrices ?? []) as Array<{
    id: number; unit_id: number; unit_name: string | null;
    price_per_report: string; ends_at: Date | string | null;
  }>;
  const doc = (docPrices ?? []) as Array<{
    id: number; unit_id: number; unit_name: string | null;
    doctor_user_id: number; doctor_name: string | null;
    price_per_report: string; ends_at: Date | string | null;
  }>;

  const activeSys = sys.filter((p) => !p.ends_at);
  const activeDoc = doc.filter((p) => !p.ends_at);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Custo do Sistema por Unidade */}
      <Card className="border border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Custo do Sistema por Unidade</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingSys ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Unidade</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Custo/Laudo</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeSys.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium text-sm">{p.unit_name ?? `Unidade ${p.unit_id}`}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-blue-600">{fmtBRL(p.price_per_report)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant="outline" className="text-green-600 border-green-600 text-xs">Ativo</Badge>
                    </td>
                  </tr>
                ))}
                {activeSys.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-4 text-center text-muted-foreground text-xs">Nenhum preço configurado.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Preço do Médico por Unidade */}
      <Card className="border border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Preço do Médico por Unidade</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingDoc ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Médico</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Unidade</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Valor</th>
                </tr>
              </thead>
              <tbody>
                {activeDoc.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium text-sm">{p.doctor_name ?? `Médico ${p.doctor_user_id}`}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs hidden sm:table-cell">{p.unit_name ?? `Unidade ${p.unit_id}`}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-green-600">{fmtBRL(p.price_per_report)}</td>
                  </tr>
                ))}
                {activeDoc.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-4 text-center text-muted-foreground text-xs">Nenhum preço configurado.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-aba: Vínculos ────────────────────────────────────────────────────────
function TabVinculos() {
  const { data: responsiblesData, isLoading } = trpc.billing.listResponsibles.useQuery();
  const { data: unitsData } = trpc.units.list.useQuery();

  const responsibles = (responsiblesData ?? []) as Array<{
    id: number; legal_name: string; trade_name: string | null; isActive: boolean;
  }>;
  const units = (unitsData ?? []) as Array<{ id: number; name: string; isActive: boolean }>;

  return (
    <Card className="border border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Responsáveis Financeiros</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Responsável</th>
                <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {responsibles.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium">{r.trade_name ?? r.legal_name}</td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge
                      variant="outline"
                      className={r.isActive ? "text-green-600 border-green-600 text-xs" : "text-xs"}
                    >
                      {r.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                </tr>
              ))}
              {responsibles.length === 0 && (
                <tr><td colSpan={2} className="px-4 py-4 text-center text-muted-foreground text-xs">Nenhum responsável cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Sub-aba: Pendências ──────────────────────────────────────────────────────
function TabPendencias({ year, month }: { year: number; month: number }) {
  const { data: summaryData, isLoading } = trpc.billing.getAdminSummary.useQuery({ year, month });
  const pending = ((summaryData as { pending?: unknown[] })?.pending ?? []) as Array<{
    id: number;
    unit_name: string;
    doctor_name: string;
    patient_name: string | null;
    report_key: string;
    pricing_status: string;
    system_amount: string;
    doctor_amount: string;
  }>;

  return (
    <Card className="border border-border/60">
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : pending.length === 0 ? (
          <div className="py-12 text-center">
            <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">Nenhuma pendência encontrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Laudo</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Unidade</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Médico</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Problema</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Sistema</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Médico</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.patient_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{item.report_key}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">{item.unit_name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">{item.doctor_name}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">
                        {item.pricing_status === "pending_system" ? "Sem preço sistema"
                          : item.pricing_status === "pending_doctor" ? "Sem preço médico"
                          : "Sem preço"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">{fmtBRL(item.system_amount)}</td>
                    <td className="px-4 py-3 text-right text-xs">{fmtBRL(item.doctor_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Sub-aba: Consolidação ────────────────────────────────────────────────────
function TabConsolidacao({ year, month }: { year: number; month: number }) {
  const { data: summaryData, isLoading } = trpc.billing.getAdminSummary.useQuery({ year, month });
  const responsibles = ((summaryData as { responsibles?: unknown[] })?.responsibles ?? []) as Array<{
    id: number;
    legal_name: string;
    trade_name: string | null;
    system_total: number;
    doctor_total: number;
    reports_count: number;
  }>;

  return (
    <Card className="border border-border/60">
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Responsável</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Laudos</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Receita Sistema</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Pagto Médicos</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {responsibles.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{r.trade_name ?? r.legal_name}</td>
                    <td className="px-4 py-3 text-right">{r.reports_count}</td>
                    <td className="px-4 py-3 text-right text-blue-600 font-semibold">{fmtBRL(r.system_total)}</td>
                    <td className="px-4 py-3 text-right text-amber-600 font-semibold">{fmtBRL(r.doctor_total)}</td>
                    <td className="px-4 py-3 text-right font-bold">{fmtBRL(r.system_total + r.doctor_total)}</td>
                  </tr>
                ))}
                {responsibles.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-4 text-center text-muted-foreground text-xs">Nenhum dado no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Sub-aba: Fechamentos ─────────────────────────────────────────────────────
function TabFechamentos() {
  const { data: unitsData } = trpc.units.list.useQuery();
  const units = (unitsData ?? []) as Array<{ id: number; name: string }>;

  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);
  const unitId = selectedUnit ?? (units[0]?.id ?? 0);

  const { data: cyclesData, isLoading } = trpc.billing.listUnitCycles.useQuery(
    { unit_id: unitId },
    { enabled: unitId > 0 }
  );

  const cycles = (cyclesData ?? []) as unknown as Array<{
    id: number;
    status: string;
    starts_at: Date | string;
    ends_at: Date | string;
    total_reports: number;
    total_amount: string;
    cycle_type: string;
  }>;

  const closed = cycles.filter((c) => c.status === "closed");

  return (
    <div className="space-y-4">
      {/* Seletor de unidade */}
      <div className="flex gap-2 flex-wrap">
        {units.map((u) => (
          <button
            key={u.id}
            onClick={() => setSelectedUnit(u.id)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              unitId === u.id
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {u.name}
          </button>
        ))}
      </div>

      <Card className="border border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : closed.length === 0 ? (
            <div className="py-12 text-center">
              <Calendar className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">Nenhum ciclo fechado para esta unidade.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Período</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Tipo</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Laudos</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Total</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {closed.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-medium text-xs">{fmtDate(c.starts_at)} — {fmtDate(c.ends_at)}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className="text-xs">
                          {c.cycle_type === "doctor" ? "Médico" : "Sistema"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">{c.total_reports}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600">{fmtBRL(c.total_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className="text-muted-foreground text-xs">Fechado</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function FinanceAdmin() {
  const [tab, setTab] = useState<AdminTab>("precos");
  const { toast } = useToast();
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth() + 1);
  const utils = trpc.useUtils();

  const { data: summaryData, isLoading } = trpc.billing.getAdminSummary.useQuery({ year, month });

  const closeCycle = trpc.billing.closeCycle.useMutation({
    onSuccess: () => {
      toast({ title: "Ciclo fechado com sucesso." });
      utils.billing.getAdminSummary.invalidate();
    },
    onError: (e) => toast({ title: "Erro ao fechar ciclo", description: e.message, variant: "destructive" }),
  });

  const summary = summaryData as {
    system_total?: number;
    doctor_total?: number;
    reports_count?: number;
    pending_count?: number;
    open_cycle_id?: number;
  } | undefined;

  const tabs: { id: AdminTab; label: string; icon: React.ElementType }[] = [
    { id: "precos", label: "Preços", icon: DollarSign },
    { id: "vinculos", label: "Vínculos", icon: Users },
    { id: "pendencias", label: "Pendências", icon: AlertTriangle },
    { id: "consolidacao", label: "Consolidação", icon: RefreshCw },
    { id: "fechamentos", label: "Fechamentos", icon: Calendar },
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configuração e controle do setor financeiro</p>
        </div>
        {summary?.open_cycle_id && (
          <Button
            variant="outline"
            size="sm"
            disabled={closeCycle.isPending}
            onClick={() => closeCycle.mutate({ cycle_id: summary.open_cycle_id! })}
            className="flex items-center gap-1.5"
          >
            <Calendar className="h-4 w-4" />
            Fechar Ciclo
          </Button>
        )}
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "RECEITA SISTEMA",
            value: isLoading ? null : fmtBRL(summary?.system_total ?? 0),
            icon: DollarSign,
            color: "text-blue-600",
            bg: "bg-blue-50 dark:bg-blue-950",
          },
          {
            label: "PAGTO MÉDICOS",
            value: isLoading ? null : fmtBRL(summary?.doctor_total ?? 0),
            icon: Users,
            color: "text-amber-600",
            bg: "bg-amber-50 dark:bg-amber-950",
          },
          {
            label: "LAUDOS",
            value: isLoading ? null : summary?.reports_count ?? 0,
            icon: FileText,
            color: "text-green-600",
            bg: "bg-green-50 dark:bg-green-950",
          },
          {
            label: "PENDÊNCIAS",
            value: isLoading ? null : summary?.pending_count ?? 0,
            icon: AlertTriangle,
            color: "text-red-600",
            bg: "bg-red-50 dark:bg-red-950",
          },
        ].map((card) => (
          <Card key={card.label} className="border border-border/60">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground tracking-wide">{card.label}</p>
                  {card.value === null ? (
                    <Skeleton className="h-7 w-20 mt-1" />
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

      {/* Abas */}
      <div className="flex gap-1 border-b border-border/60 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
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
  );
}
