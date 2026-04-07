/**
 * BillingDoctorPage — Painel Financeiro do Médico
 *
 * Funcionalidades:
 * - Resumo mensal de laudos assinados e valor a receber
 * - Lista detalhada de laudos no período
 * - Histórico de competências anteriores
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, FileText, TrendingUp } from "lucide-react";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function fmtCurrency(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtStatus(status: string | null | undefined) {
  if (!status || status === "open") return <Badge variant="outline">Aberto</Badge>;
  if (status === "closed") return <Badge className="bg-amber-500 text-white">Fechado</Badge>;
  if (status === "paid") return <Badge className="bg-green-600 text-white">Pago</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default function BillingDoctorPage() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const unitId = user?.unit_id ?? 0;
  const doctorUserId = user?.id ?? 0;

  // Consolidado mensal do médico
  const { data: monthly, isLoading: loadingMonthly } = trpc.billing.getMonthlyDoctor.useQuery(
    { unitId, doctorUserId, year, month },
    { enabled: !!user && unitId > 0 && doctorUserId > 0 }
  );

  // Itens do período (via getMonthlyUnit filtrado)
  const { data: unitData, isLoading: loadingItems } = trpc.billing.getMonthlyUnit.useQuery(
    { unitId, year, month },
    { enabled: !!user && unitId > 0 }
  );

  // Histórico
  const { data: history } = trpc.billing.listMonthlyDoctor.useQuery(
    { unitId, doctorUserId },
    { enabled: !!user && unitId > 0 && doctorUserId > 0 }
  );

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  if (authLoading) return null;
  if (!user) {
    navigate("/");
    return null;
  }

  // Filtra apenas os laudos do médico logado
  const myItems = (unitData?.items ?? []).filter((item: any) => item.doctor_user_id === doctorUserId);

  // Calcula total acumulado do histórico
  const totalAcumulado = (history ?? []).reduce(
    (s: number, h: any) => s + parseFloat((h.total_amount as string) ?? "0"),
    0
  );

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Meu Financeiro</h1>
            <p className="text-muted-foreground text-sm">
              Acompanhe seus laudos e valores a receber
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" /> Laudos no Período
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{monthly?.reports_count ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {MONTHS[month - 1]} / {year}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Valor a Receber
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{fmtCurrency(monthly?.doctor_total_due)}</p>
              <div className="mt-1">{fmtStatus(monthly?.status)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Total Acumulado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{fmtCurrency(totalAcumulado)}</p>
              <p className="text-xs text-muted-foreground mt-1">Todos os períodos</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="items">
          <TabsList>
            <TabsTrigger value="items">Laudos do Período</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          {/* Aba: Laudos */}
          <TabsContent value="items">
            <Card>
              <CardContent className="pt-4">
                {loadingItems ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                ) : myItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum laudo assinado neste período.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Exame(s)</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Assinado em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myItems.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.patient_name ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.exam_names ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">{fmtCurrency(item.price_charged)}</TableCell>
                          <TableCell className="text-xs">
                            {item.signed_at
                              ? new Date(item.signed_at).toLocaleDateString("pt-BR")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba: Histórico */}
          <TabsContent value="history">
            <Card>
              <CardContent className="pt-4">
                {!history || history.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">Nenhum histórico.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Competência</TableHead>
                        <TableHead className="text-right">Laudos</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((h: any) => (
                        <TableRow
                          key={h.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            setYear(h.competence_year);
                            setMonth(h.competence_month);
                          }}
                        >
                          <TableCell>
                            {MONTHS[h.competence_month - 1]} / {h.competence_year}
                          </TableCell>
                          <TableCell className="text-right">{h.total_reports}</TableCell>
                          <TableCell className="text-right">{fmtCurrency(h.total_amount)}</TableCell>
                          <TableCell>{fmtStatus(h.status)}</TableCell>
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
    </DashboardLayout>
  );
}
