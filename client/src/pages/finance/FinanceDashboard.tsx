/**
 * FinanceDashboard — Dashboard do módulo financeiro
 * Visão geral: médicos ativos, unidades, laudos no ciclo, pendências,
 * resumo financeiro do mês e últimos eventos.
 */
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Building2,
  FileText,
  AlertTriangle,
  DollarSign,
  UserCheck,
  Settings,
  ChevronRight,
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

export default function FinanceDashboard() {
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth() + 1);

  const { data: summary, isLoading: loadingSummary } = trpc.billing.getAdminSummary.useQuery(
    { year, month }
  );

  const { data: responsibles, isLoading: loadingResp } = trpc.billing.listResponsibles.useQuery();
  const { data: unitsData, isLoading: loadingUnits } = trpc.units.list.useQuery();
  const { data: usersData, isLoading: loadingUsers } = trpc.admin.listUsers.useQuery();

  const units = (unitsData ?? []) as Array<{ id: number; name: string; isActive: boolean }>;
  const users = (usersData ?? []) as Array<{ id: number; role: string; isActive: boolean }>;
  const resp = (responsibles ?? []) as Array<{ id: number; legal_name: string; trade_name: string | null; isActive: boolean }>;

  const activeDoctors = users.filter((u) => u.role === "medico" && u.isActive).length;
  const activeUnits = units.filter((u) => u.isActive).length;

  // summary.responsibles: array de responsáveis com totais
  const summaryResp = (summary?.responsibles ?? []) as Array<{
    id: number;
    legal_name: string;
    trade_name: string | null;
    system_total: number;
    doctor_total: number;
    reports_count: number;
    pending_count: number;
  }>;

  const totalSystem = summaryResp.reduce((s, r) => s + r.system_total, 0);
  const totalDoctors = summaryResp.reduce((s, r) => s + r.doctor_total, 0);
  const totalGeral = totalSystem + totalDoctors;
  const totalReports = summaryResp.reduce((s, r) => s + r.reports_count, 0);
  const totalPending = summaryResp.reduce((s, r) => s + r.pending_count, 0);

  const isLoading = loadingSummary || loadingResp || loadingUnits || loadingUsers;

  const monthName = new Date(year, month - 1, 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Visão geral do sistema PACS</p>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "MÉDICOS ATIVOS",
            value: isLoading ? null : activeDoctors,
            icon: Users,
            color: "text-blue-600",
            bg: "bg-blue-50 dark:bg-blue-950",
          },
          {
            label: "UNIDADES ATIVAS",
            value: isLoading ? null : activeUnits,
            icon: Building2,
            color: "text-green-600",
            bg: "bg-green-50 dark:bg-green-950",
          },
          {
            label: "LAUDOS (CICLO)",
            value: isLoading ? null : totalReports,
            icon: FileText,
            color: "text-amber-600",
            bg: "bg-amber-50 dark:bg-amber-950",
          },
          {
            label: "PENDÊNCIAS",
            value: isLoading ? null : totalPending,
            icon: AlertTriangle,
            color: "text-red-500",
            bg: "bg-red-50 dark:bg-red-950",
          },
        ].map((card) => (
          <Card key={card.label} className="border border-border/60">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground tracking-wide">{card.label}</p>
                  {card.value === null ? (
                    <Skeleton className="h-7 w-12 mt-1" />
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

      {/* Resumo financeiro + Acesso rápido */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Resumo financeiro */}
        <Card className="lg:col-span-2 border border-border/60">
          <CardContent className="p-5">
            <h2 className="font-semibold text-sm text-foreground mb-4 capitalize">
              Resumo Financeiro — {monthName}
            </h2>
            {loadingSummary ? (
              <div className="grid grid-cols-3 gap-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Receita Sistema</p>
                  <p className="text-lg font-bold text-blue-600 mt-1">{fmtBRL(totalSystem)}</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Pago Médicos</p>
                  <p className="text-lg font-bold text-amber-600 mt-1">{fmtBRL(totalDoctors)}</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Geral</p>
                  <p className="text-lg font-bold text-green-600 mt-1">{fmtBRL(totalGeral)}</p>
                </div>
              </div>
            )}

            {/* Últimos eventos */}
            <div className="mt-5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Últimos Eventos Financeiros
              </h3>
            {loadingSummary ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : summaryResp.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum evento financeiro no ciclo atual.
              </p>
            ) : (
              <div className="space-y-1.5">
                {summaryResp.slice(0, 6).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.trade_name ?? r.legal_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.reports_count} laudo{r.reports_count !== 1 ? "s" : ""} · {r.pending_count} pendente{r.pending_count !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-xs text-muted-foreground">Sistema</p>
                      <p className="text-sm font-semibold text-blue-600">{fmtBRL(r.system_total)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </CardContent>
        </Card>

        {/* Acesso rápido */}
        <Card className="border border-border/60">
          <CardContent className="p-5">
            <h2 className="font-semibold text-sm text-foreground mb-4">Acesso Rápido</h2>
            <div className="space-y-2">
              {[
                { label: "Cadastrar Médico", icon: Users, href: "/admin" },
                { label: "Gerenciar Unidades", icon: Building2, href: "/financeiro/unidades" },
                { label: "Responsáveis", icon: UserCheck, href: "/financeiro/responsaveis" },
                { label: "Admin Financeiro", icon: Settings, href: "/financeiro/admin" },
              ].map((item) => (
                <Link key={item.href} href={item.href}>
                  <a className="flex items-center justify-between px-4 py-3 rounded-lg border border-border/60 hover:bg-muted/40 hover:border-primary/30 transition-all cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                        <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </a>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
