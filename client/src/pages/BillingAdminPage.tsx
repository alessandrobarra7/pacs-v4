/**
 * BillingAdminPage — Painel Financeiro do admin_master
 *
 * Funcionalidades:
 * - Visão geral de todas as unidades no mês selecionado
 * - Configuração de preço por laudo por unidade
 * - Drill-down: ver detalhes de uma unidade (itens + médicos)
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
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Building2, FileText, ChevronRight, Settings, X } from "lucide-react";

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

// ─── Sub-componente: Detalhe de uma unidade ─────────────────────────────────
function UnitDetail({
  unitId,
  unitName,
  year,
  month,
  onClose,
}: {
  unitId: number;
  unitName: string;
  year: number;
  month: number;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.billing.getMonthlyUnit.useQuery({ unitId, year, month });
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const closeMutation = trpc.billing.closeMonthlyUnit.useMutation({
    onSuccess: () => {
      toast({ title: "Competência fechada com sucesso." });
      utils.billing.getMonthlyUnit.invalidate({ unitId, year, month });
      utils.billing.listAllUnitsMonthly.invalidate({ year, month });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  if (!data) return <div className="p-8 text-center text-muted-foreground">Sem dados.</div>;

  const { monthly, items, doctors } = data;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{unitName}</h2>
          <p className="text-sm text-muted-foreground">
            {MONTHS[month - 1]} / {year}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {fmtStatus(monthly?.status)}
          {(!monthly?.status || monthly.status === "open") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => closeMutation.mutate({ unitId, year, month })}
              disabled={closeMutation.isPending}
            >
              Fechar Competência
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Laudos</p>
            <p className="text-2xl font-bold">{monthly?.reports_count ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor Total</p>
            <p className="text-2xl font-bold text-green-600">{fmtCurrency(monthly?.system_total_due)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Médicos Ativos</p>
            <p className="text-2xl font-bold">{doctors?.length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Por médico */}
      {doctors && doctors.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Por Médico</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Médico</TableHead>
                <TableHead className="text-right">Laudos</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doctors.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.doctor_user_id}</TableCell>
                  <TableCell className="text-right">{d.total_reports}</TableCell>
                  <TableCell className="text-right">{fmtCurrency(d.total_amount)}</TableCell>
                  <TableCell>{fmtStatus(d.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Itens individuais */}
      {items && items.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Laudos Cobrados</h3>
          <div className="max-h-64 overflow-y-auto border rounded-md">
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
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componente: Modal de configuração de preço ─────────────────────────
function SetPriceModal({
  unitId,
  unitName,
  onClose,
}: {
  unitId: number;
  unitName: string;
  onClose: () => void;
}) {
  const [price, setPrice] = useState("");
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const { data: prices } = trpc.billing.listUnitPrices.useQuery({ unitId });
  const mutation = trpc.billing.setUnitPrice.useMutation({
    onSuccess: () => {
      toast({ title: "Preço configurado com sucesso." });
      utils.billing.listUnitPrices.invalidate({ unitId });
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
      pricePerReport: parseFloat(price).toFixed(2),
      startsAt: Date.now(),
    });
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Configurar Preço — {unitName}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div>
          <label className="text-sm font-medium">Preço por laudo (R$)</label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Ex: 25.00"
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
            <p className="text-xs font-medium text-muted-foreground mb-1">Histórico de preços:</p>
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
export default function BillingAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedUnit, setSelectedUnit] = useState<{ id: number; name: string } | null>(null);
  const [priceUnit, setPriceUnit] = useState<{ id: number; name: string } | null>(null);

  const { data: allUnitsMonthly, isLoading } = trpc.billing.listAllUnitsMonthly.useQuery(
    { year, month },
    { enabled: !!user && user.role === "admin_master" }
  );

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  if (authLoading) return null;
  if (!user || user.role !== "admin_master") {
    navigate("/");
    return null;
  }

  const totalReports = allUnitsMonthly?.reduce((s, u) => s + (u.monthly?.reports_count ?? 0), 0) ?? 0;
  const totalAmount = allUnitsMonthly?.reduce((s, u) => s + parseFloat((u.monthly?.system_total_due as string) ?? "0"), 0) ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Módulo Financeiro</h1>
            <p className="text-muted-foreground text-sm">Visão geral de faturamento por unidade</p>
          </div>
          {/* Seletor de período */}
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
                <Building2 className="h-4 w-4" /> Unidades Ativas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{allUnitsMonthly?.length ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" /> Total de Laudos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalReports}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Faturamento Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{fmtCurrency(totalAmount)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabela de unidades */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unidades — {MONTHS[month - 1]} {year}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : !allUnitsMonthly || allUnitsMonthly.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nenhuma unidade cadastrada.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right">Laudos</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allUnitsMonthly.map(({ unit, monthly }) => (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium">{unit.name}</TableCell>
                      <TableCell className="text-right">{monthly?.reports_count ?? 0}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(monthly?.system_total_due)}</TableCell>
                      <TableCell>{fmtStatus(monthly?.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Configurar preço"
                            onClick={() => setPriceUnit({ id: unit.id, name: unit.name })}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Ver detalhes"
                            onClick={() => setSelectedUnit({ id: unit.id, name: unit.name })}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Painel de detalhe da unidade */}
        {selectedUnit && (
          <Card>
            <CardContent className="pt-6">
              <UnitDetail
                unitId={selectedUnit.id}
                unitName={selectedUnit.name}
                year={year}
                month={month}
                onClose={() => setSelectedUnit(null)}
              />
            </CardContent>
          </Card>
        )}

        {/* Modal de configuração de preço */}
        <Dialog open={!!priceUnit} onOpenChange={(open) => !open && setPriceUnit(null)}>
          {priceUnit && (
            <SetPriceModal
              unitId={priceUnit.id}
              unitName={priceUnit.name}
              onClose={() => setPriceUnit(null)}
            />
          )}
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
