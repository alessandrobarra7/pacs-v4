/**
 * BillingUnitPage V5 — Painel do Responsável Financeiro
 *
 * Visual reformulado: cards individuais por unidade e por médico,
 * melhor hierarquia visual, tabelas mais legíveis.
 *
 * Roles com acesso: responsavel_financeiro, unit_admin, admin_master
 * Roles SEM acesso: operador, viewer, medico
 */
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Stethoscope,
  Receipt,
  CheckCircle2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Tipos locais ──────────────────────────────────────────────────────────────
type ByUnitRow = {
  unit_id: number;
  unit_name: string;
  reports_count: number;
  system_amount_due: string;
  doctor_amount_due: string;
};

type ByDoctorRow = {
  unit_id: number;
  unit_name: string;
  doctor_user_id: number;
  doctor_name: string;
  reports_count: number;
  amount_due: string;
};

// ─── Card individual de unidade ───────────────────────────────────────────────
function UnitSummaryCard({ row }: { row: ByUnitRow }) {
  const sysAmt = parseFloat(row.system_amount_due);
  const docAmt = parseFloat(row.doctor_amount_due);
  const total = sysAmt + docAmt;

  return (
    <Card className="overflow-hidden border border-border/60 hover:border-primary/30 transition-all hover:shadow-sm">
      <div className="h-1 bg-primary/60" />
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{row.unit_name || `Unidade #${row.unit_id}`}</p>
            <p className="text-xs text-muted-foreground">{row.reports_count} laudo{row.reports_count !== 1 ? "s" : ""}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sistema</p>
            <p className="text-sm font-bold text-blue-600 mt-0.5">{fmtBRL(sysAmt)}</p>
          </div>
          <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/10">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Médicos</p>
            <p className="text-sm font-bold text-purple-600 mt-0.5">{fmtBRL(docAmt)}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total</p>
            <p className="text-sm font-bold mt-0.5">{fmtBRL(total)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function BillingUnitPage() {
  const { user } = useAuth();

  const ALLOWED = ["responsavel_financeiro", "unit_admin", "admin_master"];

  const { data, isLoading, isError } = trpc.billing.getResponsibleSummary.useQuery(undefined, {
    enabled: !!user && ALLOWED.includes(user.role),
  });

  const { data: responsibleInfo } = trpc.billing.getMyResponsible.useQuery(undefined, {
    enabled: !!user && ALLOWED.includes(user.role),
  });

  if (!user || !ALLOWED.includes(user.role)) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Acesso restrito a responsáveis financeiros.</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-destructive font-medium">Erro ao carregar dados financeiros.</p>
        <p className="text-muted-foreground text-sm">Tente recarregar a página.</p>
      </div>
    );
  }

  const byUnit = ((data?.byUnit ?? []) as unknown) as ByUnitRow[];
  const byDoctor = ((data?.byDoctor ?? []) as unknown) as ByDoctorRow[];
  const totalSystem = data?.totalSystem ?? "0.00";
  const totalDoctors = data?.totalDoctors ?? "0.00";
  const totalGeral = data?.totalGeral ?? "0.00";

  const totalSystemNum = parseFloat(totalSystem);
  const totalDoctorsNum = parseFloat(totalDoctors);
  const totalGeralNum = parseFloat(totalGeral);

  const totalLaudos = byUnit.reduce((s, r) => s + r.reports_count, 0);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            Painel Financeiro
          </h1>
          {responsibleInfo && (
            <p className="text-sm text-muted-foreground mt-1">
              {responsibleInfo.trade_name || responsibleInfo.legal_name}
            </p>
          )}
        </div>
        {totalGeralNum === 0 && (
          <Badge variant="outline" className="text-green-600 border-green-600 bg-green-50 dark:bg-green-950">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Em dia
          </Badge>
        )}
      </div>

      {/* Cards de resumo */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Devo ao Sistema</p>
                  <p className="text-xl font-bold text-blue-600 mt-1">{fmtBRL(totalSystemNum)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{byUnit.length} unidade{byUnit.length !== 1 ? "s" : ""}</p>
                </div>
                <TrendingUp className="h-7 w-7 text-blue-500/30" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-purple-500/5">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Devo aos Médicos</p>
                  <p className="text-xl font-bold text-purple-600 mt-1">{fmtBRL(totalDoctorsNum)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{byDoctor.length} médico{byDoctor.length !== 1 ? "s" : ""}</p>
                </div>
                <Stethoscope className="h-7 w-7 text-purple-500/30" />
              </div>
            </CardContent>
          </Card>

          <Card className={`border-${totalGeralNum > 0 ? "red" : "green"}-500/20 bg-gradient-to-br from-${totalGeralNum > 0 ? "red" : "green"}-500/10 to-${totalGeralNum > 0 ? "red" : "green"}-500/5`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Geral</p>
                  <p className={`text-xl font-bold mt-1 ${totalGeralNum > 0 ? "text-red-600" : "text-green-600"}`}>
                    {fmtBRL(totalGeralNum)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sistema + Médicos</p>
                </div>
                {totalGeralNum > 0
                  ? <AlertCircle className="h-7 w-7 text-red-500/30" />
                  : <DollarSign className="h-7 w-7 text-green-500/30" />
                }
              </div>
            </CardContent>
          </Card>

          <Card className="border-muted bg-muted/20">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Laudos</p>
                  <p className="text-xl font-bold mt-1">{totalLaudos}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">No período</p>
                </div>
                <Receipt className="h-7 w-7 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Abas */}
      <Tabs defaultValue="by-unit">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="by-unit" className="gap-1.5 text-xs sm:text-sm">
            <Building2 className="h-3.5 w-3.5" />
            Por Unidade
          </TabsTrigger>
          <TabsTrigger value="by-doctor" className="gap-1.5 text-xs sm:text-sm">
            <Users className="h-3.5 w-3.5" />
            Por Médico
          </TabsTrigger>
        </TabsList>

        {/* Aba: Por Unidade — cards individuais */}
        <TabsContent value="by-unit" className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
          ) : byUnit.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">Nenhuma unidade vinculada ou sem movimentação.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {byUnit.map((row) => (
                  <UnitSummaryCard key={row.unit_id} row={row} />
                ))}
              </div>
              {/* Totalizador */}
              <Card className="mt-3 border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <p className="text-sm font-semibold text-muted-foreground">
                      Total — {byUnit.length} unidade{byUnit.length !== 1 ? "s" : ""}, {totalLaudos} laudos
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sistema</p>
                        <p className="text-sm font-bold text-blue-600">{fmtBRL(totalSystemNum)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Médicos</p>
                        <p className="text-sm font-bold text-purple-600">{fmtBRL(totalDoctorsNum)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
                        <p className="text-base font-bold">{fmtBRL(totalGeralNum)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Aba: Por Médico */}
        <TabsContent value="by-doctor" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : byDoctor.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">Nenhum médico com movimentação no período.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Médico</th>
                        <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Unidade</th>
                        <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">Laudos</th>
                        <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">Valor a Pagar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byDoctor.map((row, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                {(row.doctor_name || "M").charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-sm">{row.doctor_name || `Médico #${row.doctor_user_id}`}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {row.unit_name || `Unidade #${row.unit_id}`}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{row.reports_count}</td>
                          <td className="px-4 py-3 text-right font-bold text-purple-600">{fmtBRL(row.amount_due)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-muted/20">
                        <td className="px-4 py-3 font-bold" colSpan={2}>Total Médicos</td>
                        <td className="px-4 py-3 text-right text-muted-foreground font-medium">
                          {byDoctor.reduce((s, r) => s + r.reports_count, 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-lg text-purple-600">{fmtBRL(totalDoctorsNum)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Nota informativa */}
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                Os valores exibidos referem-se aos <strong>ciclos financeiros ativos</strong> das unidades vinculadas a este responsável.
              </p>
              <p>
                Ciclos fechados pelo administrador são removidos desta visão. Para histórico completo, consulte o administrador do sistema.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
