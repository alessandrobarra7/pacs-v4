/**
 * BillingUnitPage V2 — Painel Financeiro do responsavel_financeiro
 * Acesso: role === 'responsavel_financeiro'
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
import { useToast } from "@/hooks/use-toast";
import { DollarSign, ChevronLeft, Building2, FileText, Users } from "lucide-react";

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const fmt = (v: number | string | null | undefined) =>
  v == null ? "\u2014" : `R$ ${parseFloat(String(v)).toFixed(2).replace(".", ",")}`;

export default function BillingUnitPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState("overview");

  const utils = trpc.useUtils();

  const { data: myResponsible } = trpc.billing.getMyResponsible.useQuery(undefined, { enabled: !loading && !!user });
  const financialResponsibleId = myResponsible?.id ?? 0;

  const { data: responsibleSummary, isLoading: loadingSummary } = trpc.billing.getResponsibleSummary.useQuery(
    { financialResponsibleId, year, month },
    { enabled: financialResponsibleId > 0 }
  );
  const { data: reportItems = [], isLoading: loadingItems } = trpc.billing.getReportItems.useQuery(
    { financialResponsibleId, year, month },
    { enabled: financialResponsibleId > 0 }
  );
  const { data: allUnits = [] } = trpc.units.list.useQuery();
  const yearOptions = useMemo(() => Array.from({ length: 5 }, (_, i) => now.getFullYear() - i), []);

  if (loading) return <div className="flex items-center justify-center h-screen text-muted-foreground">Carregando...</div>;
  if (!user || user.role !== "responsavel_financeiro") { navigate("/"); return null; }

  const totalSystem = (responsibleSummary?.systemSummary as any[] | undefined)?.reduce((s, r) => s + parseFloat(r.amount_due ?? "0"), 0) ?? 0;
  const totalDoctor = (responsibleSummary?.doctorSummary as any[] | undefined)?.reduce((s, r) => s + parseFloat(r.amount_due ?? "0"), 0) ?? 0;
  const totalReports = (responsibleSummary?.systemSummary as any[] | undefined)?.reduce((s, r) => s + r.reports_count, 0) ?? 0;
  const totalPending = (responsibleSummary?.systemSummary as any[] | undefined)?.reduce((s, r) => s + r.pending_items_count, 0) ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b bg-card px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ChevronLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" />Financeiro</h1>
          <p className="text-sm text-muted-foreground">{myResponsible?.trade_name || myResponsible?.legal_name || "Carregando..."}</p>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Laudos</p><p className="text-2xl font-bold">{loadingSummary ? "..." : totalReports}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Sistema</p><p className="text-2xl font-bold text-primary">{loadingSummary ? "..." : fmt(totalSystem)}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Médicos</p><p className="text-2xl font-bold text-blue-500">{loadingSummary ? "..." : fmt(totalDoctor)}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Pendentes</p><p className="text-2xl font-bold text-destructive">{loadingSummary ? "..." : totalPending}</p></CardContent></Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview"><Building2 className="h-4 w-4 mr-1" />Por Unidade</TabsTrigger>
            <TabsTrigger value="items"><FileText className="h-4 w-4 mr-1" />Laudos</TabsTrigger>
            <TabsTrigger value="doctors"><Users className="h-4 w-4 mr-1" />Por Médico</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            {!(responsibleSummary?.systemSummary as any[] | undefined)?.length ? (
              <div className="text-center py-12 text-muted-foreground"><Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>Nenhum dado para {MONTHS[month-1]}/{year}.</p></div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Unidade</TableHead><TableHead className="text-right">Laudos</TableHead><TableHead className="text-right">Sistema</TableHead><TableHead className="text-right">Médicos</TableHead><TableHead className="text-right">Pendentes</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(responsibleSummary?.systemSummary as any[]).map((row) => {
                    const unit = (allUnits as any[]).find((u) => u.id === row.unit_id);
                    // Somar todos os médicos da mesma unidade (não apenas o primeiro)
                    const docRowsForUnit = (responsibleSummary?.doctorSummary as any[]).filter((d: any) => d.unit_id === row.unit_id);
                    const totalDoctorForUnit = docRowsForUnit.reduce((s: number, d: any) => s + parseFloat(d.amount_due ?? "0"), 0);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{unit?.name || `Unidade ${row.unit_id}`}</TableCell>
                        <TableCell className="text-right">{row.reports_count}</TableCell>
                        <TableCell className="text-right text-primary font-medium">{fmt(row.amount_due)}</TableCell>
                        <TableCell className="text-right text-blue-500 font-medium">{fmt(totalDoctorForUnit)}</TableCell>
                        <TableCell className="text-right">{row.pending_items_count > 0 ? <Badge variant="destructive">{row.pending_items_count}</Badge> : <Badge variant="outline" className="text-green-600">0</Badge>}</TableCell>
                        <TableCell><Badge variant={row.status === "closed" ? "secondary" : "outline"}>{row.status === "closed" ? "Fechado" : "Aberto"}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="items" className="mt-4">
            {loadingItems ? <p className="text-center text-muted-foreground py-8">Carregando...</p>
              : (reportItems as any[]).length === 0 ? <div className="text-center py-12 text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>Nenhum laudo apurado.</p></div>
              : (
                <Table>
                  <TableHeader><TableRow><TableHead>Paciente</TableHead><TableHead>Médico</TableHead><TableHead>Assinado em</TableHead><TableHead className="text-right">Sistema</TableHead><TableHead className="text-right">Médico</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(reportItems as any[]).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.patient_name || "\u2014"}</TableCell>
                        <TableCell>{item.doctor_name || `ID ${item.doctor_user_id}`}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.report_signed_at ? new Date(item.report_signed_at).toLocaleDateString("pt-BR") : "\u2014"}</TableCell>
                        <TableCell className="text-right text-primary">{fmt(item.system_amount_due)}</TableCell>
                        <TableCell className="text-right text-blue-500">{fmt(item.doctor_amount_due)}</TableCell>
                        <TableCell><Badge variant={item.pricing_status === "ok" ? "outline" : "destructive"} className="text-xs">{item.pricing_status === "ok" ? "OK" : item.pricing_status.replace("pending_","").replace("_"," ")}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </TabsContent>

          <TabsContent value="doctors" className="mt-4">
            {!(responsibleSummary?.doctorSummary as any[] | undefined)?.length ? (
              <div className="text-center py-12 text-muted-foreground"><Users className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>Nenhum dado de médico.</p></div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Médico</TableHead><TableHead>Unidade</TableHead><TableHead className="text-right">Laudos</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(responsibleSummary?.doctorSummary as any[]).map((row) => {
                    const unit = (allUnits as any[]).find((u) => u.id === row.unit_id);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.doctor_name || `ID ${row.doctor_user_id}`}</TableCell>
                        <TableCell>{unit?.name || `Unidade ${row.unit_id}`}</TableCell>
                        <TableCell className="text-right">{row.reports_count}</TableCell>
                        <TableCell className="text-right text-blue-500 font-medium">{fmt(row.amount_due)}</TableCell>
                        <TableCell><Badge variant={row.status === "closed" ? "secondary" : "outline"}>{row.status === "closed" ? "Fechado" : "Aberto"}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
