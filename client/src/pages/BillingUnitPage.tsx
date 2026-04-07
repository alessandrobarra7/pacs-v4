/**
 * BillingUnitPage — Painel Financeiro do unit_admin
 *
 * Funcionalidades:
 * - Resumo mensal da unidade
 * - Lista de laudos cobrados no período
 * - Detalhamento por médico
 * - Configuração de preço por médico
 * - Fechar competência
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { DollarSign, FileText, Users, Settings } from "lucide-react";

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

// ─── Modal de configuração de preço por médico ──────────────────────────────
function SetDoctorPriceModal({
  unitId,
  doctorUserId,
  doctorName,
  onClose,
}: {
  unitId: number;
  doctorUserId: number;
  doctorName: string;
  onClose: () => void;
}) {
  const [price, setPrice] = useState("");
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const { data: prices } = trpc.billing.listDoctorPrices.useQuery({ unitId, doctorUserId });
  const mutation = trpc.billing.setDoctorPrice.useMutation({
    onSuccess: () => {
      toast({ title: "Preço configurado com sucesso." });
      utils.billing.listDoctorPrices.invalidate({ unitId, doctorUserId });
      setPrice("");
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!price || isNaN(parseFloat(price))) {
      toast({ title: "Informe um valor válido.", variant: "destructive" });
      return;
    }
    mutation.mutate({
      unitId,
      doctorUserId,
      pricePerReport: parseFloat(price).toFixed(2),
      startsAt: Date.now(),
    });
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Preço por Laudo — {doctorName}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div>
          <label className="text-sm font-medium">Valor pago ao médico por laudo (R$)</label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Ex: 15.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Vigência a partir de agora. Laudos já registrados mantêm o preço original.
          </p>
        </div>
        {prices && prices.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Histórico:</p>
            <div className="space-y-1">
              {prices.slice(0, 5).map((p: any) => (
                <div key={p.id} className="flex justify-between text-xs text-muted-foreground">
                  <span>{new Date(p.starts_at).toLocaleDateString("pt-BR")}</span>
                  <span>{fmtCurrency(p.price_per_report)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSave} disabled={mutation.isPending}>Salvar</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function BillingUnitPage() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [priceDoctor, setPriceDoctor] = useState<{ id: number; name: string } | null>(null);

  const unitId = user?.unit_id ?? 0;

  const { data, isLoading } = trpc.billing.getMonthlyUnit.useQuery(
    { unitId, year, month },
    { enabled: !!user && unitId > 0 }
  );

  const { data: history } = trpc.billing.listMonthlyUnit.useQuery(
    { unitId },
    { enabled: !!user && unitId > 0 }
  );

  const utils = trpc.useUtils();
  const { toast } = useToast();
  const closeMutation = trpc.billing.closeMonthlyUnit.useMutation({
    onSuccess: () => {
      toast({ title: "Competência fechada com sucesso." });
      utils.billing.getMonthlyUnit.invalidate({ unitId, year, month });
      utils.billing.listMonthlyUnit.invalidate({ unitId });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  if (authLoading) return null;
  if (!user || (user.role !== "unit_admin" && user.role !== "admin_master")) {
    navigate("/");
    return null;
  }

  const { monthly, items, doctors } = data ?? { monthly: null, items: [], doctors: [] };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Financeiro da Unidade</h1>
            <p className="text-muted-foreground text-sm">Acompanhe o faturamento mensal</p>
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
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Valor Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{fmtCurrency(monthly?.system_total_due)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" /> Status
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3 pt-1">
              {fmtStatus(monthly?.status)}
              {(!monthly?.status || monthly.status === "open") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => closeMutation.mutate({ unitId, year, month })}
                  disabled={closeMutation.isPending}
                >
                  Fechar
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="doctors">
          <TabsList>
            <TabsTrigger value="doctors">Por Médico</TabsTrigger>
            <TabsTrigger value="items">Laudos</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          {/* Aba: Por Médico */}
          <TabsContent value="doctors">
            <Card>
              <CardContent className="pt-4">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                ) : !doctors || doctors.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum laudo registrado neste período.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Médico</TableHead>
                        <TableHead className="text-right">Laudos</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {doctors.map((d: any) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.doctor_user_id}</TableCell>
                          <TableCell className="text-right">{d.total_reports}</TableCell>
                          <TableCell className="text-right">{fmtCurrency(d.total_amount)}</TableCell>
                          <TableCell>{fmtStatus(d.status)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Configurar preço"
                              onClick={() => setPriceDoctor({ id: d.doctor_user_id, name: `Médico #${d.doctor_user_id}` })}
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba: Laudos */}
          <TabsContent value="items">
            <Card>
              <CardContent className="pt-4">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                ) : !items || items.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum laudo registrado neste período.
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
                      {items.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.patient_name ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.exam_names ?? "—"}</TableCell>
                          <TableCell className="text-right">{fmtCurrency(item.price_charged)}</TableCell>
                          <TableCell className="text-xs">
                            {item.signed_at ? new Date(item.signed_at).toLocaleDateString("pt-BR") : "—"}
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

        {/* Modal de preço por médico */}
        <Dialog open={!!priceDoctor} onOpenChange={(open) => !open && setPriceDoctor(null)}>
          {priceDoctor && (
            <SetDoctorPriceModal
              unitId={unitId}
              doctorUserId={priceDoctor.id}
              doctorName={priceDoctor.name}
              onClose={() => setPriceDoctor(null)}
            />
          )}
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
