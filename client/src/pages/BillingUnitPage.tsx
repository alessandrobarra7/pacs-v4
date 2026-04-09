/**
 * BillingUnitPage V4 — Painel do Responsável Financeiro
 *
 * Visão do responsável_financeiro: quanto devo ao sistema, quanto devo
 * aos médicos, total geral. Abas: Por Unidade / Por Médico / Extrato.
 *
 * Roles com acesso: responsavel_financeiro, unit_admin, admin_master
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Receipt,
  Stethoscope,
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

// ─── Página principal ──────────────────────────────────────────────────────────
export default function BillingUnitPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const ALLOWED = ["responsavel_financeiro", "unit_admin", "admin_master"];

  const { data, isLoading } = trpc.billing.getResponsibleSummary.useQuery(undefined, {
    enabled: !!user && ALLOWED.includes(user.role),
  });

  const { data: responsibleInfo } = trpc.billing.getMyResponsible.useQuery(undefined, {
    enabled: !!user && ALLOWED.includes(user.role),
  });

  if (!user || !ALLOWED.includes(user.role)) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-muted-foreground">Acesso restrito a responsáveis financeiros.</p>
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Painel Financeiro</h1>
          </div>
          {responsibleInfo && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {responsibleInfo.trade_name || responsibleInfo.legal_name}
            </Badge>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Cards de resumo */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Devo ao Sistema */}
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Devo ao Sistema</p>
                    <p className="text-2xl font-bold text-blue-600 mt-1">{fmtBRL(totalSystemNum)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {byUnit.length} unidade{byUnit.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-blue-500/30" />
                </div>
              </CardContent>
            </Card>

            {/* Devo aos Médicos */}
            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Devo aos Médicos</p>
                    <p className="text-2xl font-bold text-purple-600 mt-1">{fmtBRL(totalDoctorsNum)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {byDoctor.length} médico{byDoctor.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <Stethoscope className="h-8 w-8 text-purple-500/30" />
                </div>
              </CardContent>
            </Card>

            {/* Total Geral */}
            <Card className={`bg-gradient-to-br ${totalGeralNum > 0 ? "from-red-500/10 to-red-500/5 border-red-500/20" : "from-green-500/10 to-green-500/5 border-green-500/20"}`}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Geral</p>
                    <p className={`text-2xl font-bold mt-1 ${totalGeralNum > 0 ? "text-red-600" : "text-green-600"}`}>
                      {fmtBRL(totalGeralNum)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Sistema + Médicos</p>
                  </div>
                  {totalGeralNum > 0
                    ? <AlertCircle className="h-8 w-8 text-red-500/30" />
                    : <DollarSign className="h-8 w-8 text-green-500/30" />
                  }
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Abas */}
        <Tabs defaultValue="by-unit">
          <TabsList className="grid w-full grid-cols-2 max-w-sm">
            <TabsTrigger value="by-unit" className="text-xs">
              <Building2 className="h-3.5 w-3.5 mr-1.5" />
              Por Unidade
            </TabsTrigger>
            <TabsTrigger value="by-doctor" className="text-xs">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Por Médico
            </TabsTrigger>
          </TabsList>

          {/* Aba: Por Unidade */}
          <TabsContent value="by-unit" className="mt-4">
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : byUnit.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Building2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">Nenhuma unidade vinculada ou sem movimentação.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left pb-3 font-medium">Unidade</th>
                          <th className="text-right pb-3 font-medium">Visitas</th>
                          <th className="text-right pb-3 font-medium">Ao Sistema</th>
                          <th className="text-right pb-3 font-medium">Aos Médicos</th>
                          <th className="text-right pb-3 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byUnit.map((row) => {
                          const sysAmt = parseFloat(row.system_amount_due);
                          const docAmt = parseFloat(row.doctor_amount_due);
                          const total = sysAmt + docAmt;
                          return (
                            <tr key={row.unit_id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="font-medium">{row.unit_name || `Unidade #${row.unit_id}`}</span>
                                </div>
                              </td>
                              <td className="py-3 text-right text-muted-foreground">{row.reports_count}</td>
                              <td className="py-3 text-right text-blue-600 font-medium">{fmtBRL(sysAmt)}</td>
                              <td className="py-3 text-right text-purple-600 font-medium">{fmtBRL(docAmt)}</td>
                              <td className="py-3 text-right font-bold">{fmtBRL(total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 bg-muted/20">
                          <td className="py-3 font-bold">Total</td>
                          <td className="py-3 text-right text-muted-foreground font-medium">
                            {byUnit.reduce((s, r) => s + r.reports_count, 0)}
                          </td>
                          <td className="py-3 text-right text-blue-600 font-bold">{fmtBRL(totalSystemNum)}</td>
                          <td className="py-3 text-right text-purple-600 font-bold">{fmtBRL(totalDoctorsNum)}</td>
                          <td className="py-3 text-right font-bold text-lg">{fmtBRL(totalGeralNum)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
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
                <CardContent className="pt-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left pb-3 font-medium">Médico</th>
                          <th className="text-left pb-3 font-medium">Unidade</th>
                          <th className="text-right pb-3 font-medium">Visitas</th>
                          <th className="text-right pb-3 font-medium">Valor a Pagar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byDoctor.map((row, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                  {(row.doctor_name || "M").charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium">{row.doctor_name || `Médico #${row.doctor_user_id}`}</span>
                              </div>
                            </td>
                            <td className="py-3 text-muted-foreground text-xs">
                              {row.unit_name || `Unidade #${row.unit_id}`}
                            </td>
                            <td className="py-3 text-right text-muted-foreground">{row.reports_count}</td>
                            <td className="py-3 text-right font-bold text-purple-600">{fmtBRL(row.amount_due)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 bg-muted/20">
                          <td className="py-3 font-bold" colSpan={2}>Total Médicos</td>
                          <td className="py-3 text-right text-muted-foreground font-medium">
                            {byDoctor.reduce((s, r) => s + r.reports_count, 0)}
                          </td>
                          <td className="py-3 text-right font-bold text-lg text-purple-600">{fmtBRL(totalDoctorsNum)}</td>
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
    </div>
  );
}
