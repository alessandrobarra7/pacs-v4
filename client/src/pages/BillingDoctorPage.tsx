/**
 * BillingDoctorPage V2 — Painel Financeiro do médico
 * Acesso: role === 'medico'
 *
 * Exibe o resumo financeiro do médico logado: laudos assinados,
 * valores a receber por competência, agrupados por responsável financeiro.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, ChevronLeft, FileText, Building2 } from "lucide-react";

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const fmt = (v: number | string | null | undefined) =>
  v == null ? "\u2014" : `R$ ${parseFloat(String(v)).toFixed(2).replace(".", ",")}`;

export default function BillingDoctorPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState("summary");

  const { data: doctorSummary, isLoading: loadingSummary } = trpc.billing.getDoctorSummary.useQuery(
    { year, month },
    { enabled: !loading && !!user }
  );
  const yearOptions = useMemo(() => Array.from({ length: 5 }, (_, i) => now.getFullYear() - i), []);

  if (loading) return <div className="flex items-center justify-center h-screen text-muted-foreground">Carregando...</div>;
  if (!user || user.role !== "medico") { navigate("/"); return null; }

  const totalAmount = (doctorSummary?.byResponsible as any[] | undefined)?.reduce((s, r) => s + parseFloat(r.amount_due ?? "0"), 0) ?? 0;
  const totalReports = (doctorSummary?.byResponsible as any[] | undefined)?.reduce((s, r) => s + r.reports_count, 0) ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b bg-card px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ChevronLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" />Meu Financeiro</h1>
          <p className="text-sm text-muted-foreground">{user.name || user.username}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Laudos Assinados</p><p className="text-2xl font-bold">{loadingSummary ? "..." : totalReports}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total a Receber</p><p className="text-2xl font-bold text-primary">{loadingSummary ? "..." : fmt(totalAmount)}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Competência</p><p className="text-lg font-bold">{MONTHS[month-1]}/{year}</p></CardContent></Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="summary"><Building2 className="h-4 w-4 mr-1" />Por Responsável</TabsTrigger>
            <TabsTrigger value="items"><FileText className="h-4 w-4 mr-1" />Laudos</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-4">
            {loadingSummary ? <p className="text-center text-muted-foreground py-8">Carregando...</p>
              : !(doctorSummary?.byResponsible as any[] | undefined)?.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>Nenhum laudo apurado para {MONTHS[month-1]}/{year}.</p>
                  <p className="text-xs mt-1">Os valores aparecem após a apuração pelo administrador.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Responsável Financeiro</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right">Laudos</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(doctorSummary?.byResponsible as any[]).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.responsible_name || `ID ${row.financial_responsible_id}`}</TableCell>
                        <TableCell>{row.unit_name || `Unidade ${row.unit_id}`}</TableCell>
                        <TableCell className="text-right">{row.reports_count}</TableCell>
                        <TableCell className="text-right text-primary font-medium">{fmt(row.amount_due)}</TableCell>
                        <TableCell><Badge variant={row.status === "closed" ? "secondary" : "outline"}>{row.status === "closed" ? "Fechado" : "Aberto"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </TabsContent>

          <TabsContent value="items" className="mt-4">
            {loadingSummary ? <p className="text-center text-muted-foreground py-8">Carregando...</p>
              : !(doctorSummary?.items as any[] | undefined)?.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>Nenhum laudo apurado para este período.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Assinado em</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(doctorSummary?.items as any[]).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.patient_name || "\u2014"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.report_signed_at ? new Date(item.report_signed_at).toLocaleDateString("pt-BR") : "\u2014"}
                        </TableCell>
                        <TableCell className="text-right text-primary font-medium">{fmt(item.doctor_amount_due)}</TableCell>
                        <TableCell>
                          <Badge variant={item.pricing_status === "ok" ? "outline" : "destructive"} className="text-xs">
                            {item.pricing_status === "ok" ? "OK" : item.pricing_status.replace("pending_","").replace("_"," ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
