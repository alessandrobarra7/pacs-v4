/**
 * BillingUnitPage V3 — Painel do Responsável Financeiro
 *
 * Visão do responsável_financeiro / unit_admin / admin_master:
 * - Devo ao Sistema (por unidade)
 * - Devo aos Médicos (por unidade e por médico)
 *
 * Roles com acesso: responsavel_financeiro, unit_admin, admin_master
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Building2, Users, DollarSign, TrendingDown, ChevronDown, ChevronRight,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(val: string | number | null | undefined) {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return dt.toLocaleDateString("pt-BR");
}

const ALLOWED_ROLES = ["responsavel_financeiro", "unit_admin", "admin_master"];

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function BillingUnitPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [tab, setTab] = useState("system");
  const [expandedUnit, setExpandedUnit] = useState<number | null>(null);

  const { data: summary, isLoading } = trpc.billing.getResponsibleSummary.useQuery(undefined, {
    enabled: !!user && ALLOWED_ROLES.includes(user.role ?? ""),
  });

  if (!user || !ALLOWED_ROLES.includes(user.role ?? "")) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-muted-foreground">Acesso restrito ao responsável financeiro.</p>
      </div>
    );
  }

  type UnitRow = {
    unit_id: number;
    unit_name?: string;
    visits_count: number;
    system_amount_due: string;
    doctor_amount_due: string;
    cycle?: { id: number; starts_at: Date | string; ends_at: Date | string };
  };

  type DoctorRow = {
    unit_id: number;
    unit_name?: string;
    doctor_user_id: number;
    doctor_name?: string;
    visits_count: number;
    amount_due: string;
  };

  const byUnit = ((summary?.byUnit ?? []) as unknown) as UnitRow[];
  const byDoctor = ((summary?.byDoctor ?? []) as unknown) as DoctorRow[];

  const totalSystem = byUnit.reduce((s, r) => s + parseFloat(r.system_amount_due ?? "0"), 0);
  const totalDoctor = byUnit.reduce((s, r) => s + parseFloat(r.doctor_amount_due ?? "0"), 0);
  const totalVisits = byUnit.reduce((s, r) => s + (r.visits_count ?? 0), 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Painel Financeiro</h1>
            <p className="text-xs text-muted-foreground">Ciclo atual — obrigações financeiras</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Devo ao Sistema</p>
                  <p className="text-xl font-bold text-red-600">{fmtBRL(totalSystem)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <Users className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Devo aos Médicos</p>
                  <p className="text-xl font-bold text-amber-600">{fmtBRL(totalDoctor)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Laudos no ciclo</p>
                  <p className="text-xl font-bold text-blue-600">{totalVisits}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Abas */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="system">
              <Building2 className="h-4 w-4 mr-1" /> Por Unidade
            </TabsTrigger>
            <TabsTrigger value="doctors">
              <Users className="h-4 w-4 mr-1" /> Por Médico
            </TabsTrigger>
          </TabsList>

          {/* Aba: Por Unidade */}
          <TabsContent value="system" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground font-normal">
                  Obrigações do ciclo atual por unidade
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
                ) : byUnit.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum laudo no ciclo atual.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {byUnit.map((row) => {
                      const isExpanded = expandedUnit === row.unit_id;
                      const doctorsForUnit = byDoctor.filter((d) => d.unit_id === row.unit_id);
                      return (
                        <div key={row.unit_id} className="border rounded-lg overflow-hidden">
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => setExpandedUnit(isExpanded ? null : row.unit_id)}
                          >
                            <div className="flex items-center gap-3">
                              {isExpanded
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium text-sm">
                                  {row.unit_name || `Unidade #${row.unit_id}`}
                                </p>
                                {row.cycle && (
                                  <p className="text-xs text-muted-foreground">
                                    Ciclo: {fmtDate(row.cycle.starts_at)} → {fmtDate(row.cycle.ends_at)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Sistema</p>
                                <p className="font-semibold text-red-600">{fmtBRL(row.system_amount_due)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Médicos</p>
                                <p className="font-semibold text-amber-600">{fmtBRL(row.doctor_amount_due)}</p>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {row.visits_count} laudo(s)
                              </Badge>
                            </div>
                          </div>

                          {/* Médicos desta unidade */}
                          {isExpanded && doctorsForUnit.length > 0 && (
                            <div className="border-t bg-muted/20 p-4">
                              <p className="text-xs font-medium text-muted-foreground mb-3">Médicos nesta unidade:</p>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Médico</TableHead>
                                    <TableHead className="text-xs text-right">Laudos</TableHead>
                                    <TableHead className="text-xs text-right">A Pagar</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {doctorsForUnit.map((doc) => (
                                    <TableRow key={doc.doctor_user_id}>
                                      <TableCell className="text-sm font-medium">
                                        {doc.doctor_name || `Médico #${doc.doctor_user_id}`}
                                      </TableCell>
                                      <TableCell className="text-sm text-right">{doc.visits_count}</TableCell>
                                      <TableCell className="text-sm text-right font-medium text-amber-600">
                                        {fmtBRL(doc.amount_due)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba: Por Médico */}
          <TabsContent value="doctors" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground font-normal">
                  Valores a pagar por médico no ciclo atual
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
                ) : byDoctor.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum médico com laudos no ciclo atual.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Médico</TableHead>
                        <TableHead className="text-xs">Unidade</TableHead>
                        <TableHead className="text-xs text-right">Laudos</TableHead>
                        <TableHead className="text-xs text-right">A Pagar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byDoctor.map((doc, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm font-medium">
                            {doc.doctor_name || `Médico #${doc.doctor_user_id}`}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {doc.unit_name || `Unidade #${doc.unit_id}`}
                          </TableCell>
                          <TableCell className="text-sm text-right">{doc.visits_count}</TableCell>
                          <TableCell className="text-sm text-right font-medium text-amber-600">
                            {fmtBRL(doc.amount_due)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
