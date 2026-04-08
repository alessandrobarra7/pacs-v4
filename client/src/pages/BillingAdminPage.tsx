/**
 * BillingAdminPage V2 — Painel Financeiro do admin_master
 * Acesso: role === 'admin_master'
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Building2, DollarSign, Calculator, ChevronLeft, Plus, Lock, Unlock } from "lucide-react";

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const fmt = (v: number | string | null | undefined) =>
  v == null ? "—" : `R$ ${parseFloat(String(v)).toFixed(2).replace(".", ",")}`;

export default function BillingAdminPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedResponsibleId, setSelectedResponsibleId] = useState<number | null>(null);
  const [tab, setTab] = useState("overview");
  const [newRespOpen, setNewRespOpen] = useState(false);
  const [newRespForm, setNewRespForm] = useState({ person_type: "PJ" as "PF"|"PJ", legal_name: "", trade_name: "", cpf_cnpj: "", email: "", phone: "" });
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [priceForm, setPriceForm] = useState({ type: "system" as "system"|"doctor", unitId: "", doctorUserId: "", price: "", startsAt: "" });
  const [linkUnitOpen, setLinkUnitOpen] = useState(false);
  const [linkUnitForm, setLinkUnitForm] = useState({ unitId: "", startsAt: "" });

  const { toast } = useToast();
  const utils = trpc.useUtils();

  if (loading) return <div className="flex items-center justify-center h-screen text-muted-foreground">Carregando...</div>;
  if (!user || user.role !== "admin_master") { navigate("/"); return null; }
  const { data: responsibles = [], isLoading: loadingResp } = trpc.billing.listResponsibles.useQuery();
  const { data: adminSummary } = trpc.billing.getAdminSummary.useQuery({ year, month });
  const { data: allUnits = [] } = trpc.units.list.useQuery();
  const { data: allUsers = [] } = trpc.admin.listUsers.useQuery();
  const { data: responsibleSummary } = trpc.billing.getResponsibleSummary.useQuery(
    { financialResponsibleId: selectedResponsibleId!, year, month },
    { enabled: !!selectedResponsibleId }
  );
  const { data: reportItems = [] } = trpc.billing.getReportItems.useQuery(
    { financialResponsibleId: selectedResponsibleId!, year, month },
    { enabled: !!selectedResponsibleId }
  );
  const { data: unitLinks = [] } = trpc.billing.listUnitsForResponsible.useQuery(
    { financialResponsibleId: selectedResponsibleId! },
    { enabled: !!selectedResponsibleId }
  );

  const createResp = trpc.billing.createResponsible.useMutation({
    onSuccess: () => { utils.billing.listResponsibles.invalidate(); setNewRespOpen(false); toast({ title: "Responsável criado." }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const calcCompetence = trpc.billing.calculateCompetence.useMutation({
    onSuccess: (r) => { utils.billing.getAdminSummary.invalidate(); toast({ title: `Apuração: ${r.ok} ok, ${r.pending} pendentes de ${r.total} laudos.` }); },
    onError: (e: any) => toast({ title: "Erro na apuração", description: e.message, variant: "destructive" }),
  });
  const closeComp = trpc.billing.closeCompetence.useMutation({
    onSuccess: () => { utils.billing.getResponsibleSummary.invalidate(); toast({ title: "Competência fechada." }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const reopenComp = trpc.billing.reopenCompetence.useMutation({
    onSuccess: () => { utils.billing.getResponsibleSummary.invalidate(); toast({ title: "Competência reaberta." }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const setSystemPrice = trpc.billing.setSystemPrice.useMutation({
    onSuccess: () => { setPriceDialogOpen(false); toast({ title: "Preço do sistema salvo." }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const setDoctorPrice = trpc.billing.setDoctorPrice.useMutation({
    onSuccess: () => { setPriceDialogOpen(false); toast({ title: "Preço do médico salvo." }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const linkUnit = trpc.billing.linkUnit.useMutation({
    onSuccess: () => { utils.billing.listUnitsForResponsible.invalidate(); setLinkUnitOpen(false); toast({ title: "Unidade vinculada." }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const selectedResp = (responsibles as any[]).find((r) => r.id === selectedResponsibleId);
  const yearOptions = useMemo(() => Array.from({ length: 5 }, (_, i) => now.getFullYear() - i), []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b bg-card px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ChevronLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" />Módulo Financeiro</h1>
          <p className="text-sm text-muted-foreground">Gestão de responsáveis, preços e apuração de competências</p>
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
          <Button variant="outline" size="sm" onClick={() => calcCompetence.mutate({ year, month })} disabled={calcCompetence.isPending}>
            <Calculator className="h-4 w-4 mr-1" />{calcCompetence.isPending ? "Apurando..." : "Apurar"}
          </Button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        <div className="w-72 border-r bg-card/50 flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Responsáveis Financeiros</span>
            <Dialog open={newRespOpen} onOpenChange={setNewRespOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7"><Plus className="h-4 w-4" /></Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo Responsável Financeiro</DialogTitle></DialogHeader>
                <div className="space-y-3 mt-2">
                  <div><Label>Tipo</Label>
                    <Select value={newRespForm.person_type} onValueChange={v => setNewRespForm(f => ({ ...f, person_type: v as "PF"|"PJ" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="PJ">Pessoa Jurídica</SelectItem><SelectItem value="PF">Pessoa Física</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>Razão Social / Nome *</Label><Input value={newRespForm.legal_name} onChange={e => setNewRespForm(f => ({ ...f, legal_name: e.target.value }))} /></div>
                  <div><Label>Nome Fantasia</Label><Input value={newRespForm.trade_name} onChange={e => setNewRespForm(f => ({ ...f, trade_name: e.target.value }))} /></div>
                  <div><Label>{newRespForm.person_type === "PJ" ? "CNPJ" : "CPF"}</Label><Input value={newRespForm.cpf_cnpj} onChange={e => setNewRespForm(f => ({ ...f, cpf_cnpj: e.target.value }))} /></div>
                  <div><Label>E-mail</Label><Input type="email" value={newRespForm.email} onChange={e => setNewRespForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div><Label>Telefone</Label><Input value={newRespForm.phone} onChange={e => setNewRespForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  <Button className="w-full" onClick={() => createResp.mutate({ ...newRespForm, email: newRespForm.email || undefined, trade_name: newRespForm.trade_name || undefined, cpf_cnpj: newRespForm.cpf_cnpj || undefined, phone: newRespForm.phone || undefined })} disabled={createResp.isPending || !newRespForm.legal_name}>
                    {createResp.isPending ? "Salvando..." : "Criar Responsável"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingResp ? <p className="text-center text-sm text-muted-foreground py-8">Carregando...</p>
              : (responsibles as any[]).length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Nenhum responsável cadastrado</p>
              : (responsibles as any[]).map((resp) => {
                const summary = (adminSummary?.responsibles as any[] | undefined)?.find((r) => r.id === resp.id);
                return (
                  <button key={resp.id} onClick={() => setSelectedResponsibleId(resp.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${selectedResponsibleId === resp.id ? "bg-primary/10 border border-primary/30" : "hover:bg-accent"}`}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{resp.trade_name || resp.legal_name}</p>
                        <p className="text-xs text-muted-foreground">{resp.person_type} · {resp.cpf_cnpj || "—"}</p>
                      </div>
                    </div>
                    {summary && (
                      <div className="mt-2 flex gap-2 text-xs">
                        <span className="text-muted-foreground">{summary.reports_count} laudos</span>
                        {summary.pending_count > 0 && <Badge variant="destructive" className="text-xs py-0">{summary.pending_count} pend.</Badge>}
                      </div>
                    )}
                  </button>
                );
              })}
          </div>
          {adminSummary && (
            <div className="p-4 border-t space-y-1">
              <p className="text-xs text-muted-foreground font-medium">TOTAL {MONTHS[month-1]}/{year}</p>
              <p className="text-sm">Sistema: <span className="font-semibold text-primary">{fmt((adminSummary.responsibles as any[]).reduce((s, r) => s + r.system_total, 0))}</span></p>
              <p className="text-sm">Médicos: <span className="font-semibold text-blue-500">{fmt((adminSummary.responsibles as any[]).reduce((s, r) => s + r.doctor_total, 0))}</span></p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!selectedResponsibleId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <Building2 className="h-12 w-12 opacity-30" />
              <p>Selecione um responsável financeiro para gerenciar</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{selectedResp?.trade_name || selectedResp?.legal_name}</h2>
                  <p className="text-sm text-muted-foreground">{selectedResp?.legal_name} · {selectedResp?.cpf_cnpj || "Sem documento"}</p>
                </div>
                <div className="flex gap-2">
                  <Dialog open={linkUnitOpen} onOpenChange={setLinkUnitOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm"><Building2 className="h-4 w-4 mr-1" />Vincular Unidade</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Vincular Unidade ao Responsável</DialogTitle></DialogHeader>
                      <div className="space-y-3 mt-2">
                        <div><Label>Unidade</Label>
                          <Select value={linkUnitForm.unitId} onValueChange={v => setLinkUnitForm(f => ({ ...f, unitId: v }))}>
                            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                            <SelectContent>{(allUnits as any[]).map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div><Label>Vigência a partir de</Label><Input type="date" value={linkUnitForm.startsAt} onChange={e => setLinkUnitForm(f => ({ ...f, startsAt: e.target.value }))} /></div>
                        <Button className="w-full" onClick={() => linkUnit.mutate({ financialResponsibleId: selectedResponsibleId!, unitId: Number(linkUnitForm.unitId), startsAt: linkUnitForm.startsAt })} disabled={linkUnit.isPending || !linkUnitForm.unitId || !linkUnitForm.startsAt}>
                          {linkUnit.isPending ? "Vinculando..." : "Vincular"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm"><DollarSign className="h-4 w-4 mr-1" />Configurar Preço</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Configurar Preço por Laudo</DialogTitle></DialogHeader>
                      <div className="space-y-3 mt-2">
                        <div><Label>Tipo de Preço</Label>
                          <Select value={priceForm.type} onValueChange={v => setPriceForm(f => ({ ...f, type: v as "system"|"doctor" }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="system">Plataforma (cobrado ao responsável)</SelectItem>
                              <SelectItem value="doctor">Médico (pago ao médico)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Unidade</Label>
                          <Select value={priceForm.unitId} onValueChange={v => setPriceForm(f => ({ ...f, unitId: v }))}>
                            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                            <SelectContent>{(allUnits as any[]).map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        {priceForm.type === "doctor" && (
                          <div><Label>Médico</Label>
                            <Select value={priceForm.doctorUserId} onValueChange={v => setPriceForm(f => ({ ...f, doctorUserId: v }))}>
                              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                              <SelectContent>{(allUsers as any[]).filter((u) => u.role === "medico").map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name || u.username}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        )}
                        <div><Label>Valor por Laudo (R$)</Label><Input type="number" step="0.01" min="0" value={priceForm.price} onChange={e => setPriceForm(f => ({ ...f, price: e.target.value }))} /></div>
                        <div><Label>Vigência a partir de</Label><Input type="date" value={priceForm.startsAt} onChange={e => setPriceForm(f => ({ ...f, startsAt: e.target.value }))} /></div>
                        <Button className="w-full" onClick={() => {
                          if (priceForm.type === "system") setSystemPrice.mutate({ financialResponsibleId: selectedResponsibleId!, unitId: Number(priceForm.unitId), pricePerReport: priceForm.price, startsAt: priceForm.startsAt });
                          else setDoctorPrice.mutate({ financialResponsibleId: selectedResponsibleId!, unitId: Number(priceForm.unitId), doctorUserId: Number(priceForm.doctorUserId), pricePerReport: priceForm.price, startsAt: priceForm.startsAt });
                        }} disabled={setSystemPrice.isPending || setDoctorPrice.isPending || !priceForm.unitId || !priceForm.price || !priceForm.startsAt}>
                          Salvar Preço
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {responsibleSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Laudos</p><p className="text-2xl font-bold">{(responsibleSummary.systemSummary as any[]).reduce((s, r) => s + r.reports_count, 0)}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Sistema</p><p className="text-2xl font-bold text-primary">{fmt((responsibleSummary.systemSummary as any[]).reduce((s, r) => s + parseFloat(r.amount_due ?? "0"), 0))}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Médicos</p><p className="text-2xl font-bold text-blue-500">{fmt((responsibleSummary.doctorSummary as any[]).reduce((s, r) => s + parseFloat(r.amount_due ?? "0"), 0))}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Pendentes</p><p className="text-2xl font-bold text-destructive">{(responsibleSummary.systemSummary as any[]).reduce((s, r) => s + r.pending_items_count, 0)}</p></CardContent></Card>
                </div>
              )}

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="overview">Por Unidade</TabsTrigger>
                  <TabsTrigger value="items">Laudos</TabsTrigger>
                  <TabsTrigger value="units">Unidades Vinculadas</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-4">
                  {!(responsibleSummary?.systemSummary as any[] | undefined)?.length ? (
                    <div className="text-center py-12 text-muted-foreground"><Calculator className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>Nenhum dado para {MONTHS[month-1]}/{year}. Clique em "Apurar".</p></div>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Unidade</TableHead><TableHead className="text-right">Laudos</TableHead><TableHead className="text-right">Sistema</TableHead><TableHead className="text-right">Médicos</TableHead><TableHead className="text-right">Pendentes</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(responsibleSummary?.systemSummary as any[]).map((row) => {
                          const unit = (allUnits as any[]).find((u) => u.id === row.unit_id);
                          const docRow = (responsibleSummary?.doctorSummary as any[]).find((d) => d.unit_id === row.unit_id);
                          return (
                            <TableRow key={row.id}>
                              <TableCell className="font-medium">{unit?.name || `Unidade ${row.unit_id}`}</TableCell>
                              <TableCell className="text-right">{row.reports_count}</TableCell>
                              <TableCell className="text-right text-primary font-medium">{fmt(row.amount_due)}</TableCell>
                              <TableCell className="text-right text-blue-500 font-medium">{fmt(docRow?.amount_due)}</TableCell>
                              <TableCell className="text-right">{row.pending_items_count > 0 ? <Badge variant="destructive">{row.pending_items_count}</Badge> : <Badge variant="outline" className="text-green-600">0</Badge>}</TableCell>
                              <TableCell><Badge variant={row.status === "closed" ? "secondary" : "outline"}>{row.status === "closed" ? "Fechado" : "Aberto"}</Badge></TableCell>
                              <TableCell>
                                {row.status === "closed"
                                  ? <Button variant="ghost" size="sm" onClick={() => reopenComp.mutate({ financialResponsibleId: selectedResponsibleId!, year, month })}><Unlock className="h-3 w-3 mr-1" />Reabrir</Button>
                                  : <Button variant="ghost" size="sm" disabled={row.pending_items_count > 0} onClick={() => closeComp.mutate({ financialResponsibleId: selectedResponsibleId!, year, month })}><Lock className="h-3 w-3 mr-1" />Fechar</Button>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
                <TabsContent value="items" className="mt-4">
                  {(reportItems as any[]).length === 0 ? <div className="text-center py-12 text-muted-foreground">Nenhum laudo apurado.</div> : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Paciente</TableHead><TableHead>Médico</TableHead><TableHead>Assinado em</TableHead><TableHead className="text-right">Sistema</TableHead><TableHead className="text-right">Médico</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(reportItems as any[]).map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.patient_name || "—"}</TableCell>
                            <TableCell>{item.doctor_name || `ID ${item.doctor_user_id}`}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{item.report_signed_at ? new Date(item.report_signed_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                            <TableCell className="text-right text-primary">{fmt(item.system_amount_due)}</TableCell>
                            <TableCell className="text-right text-blue-500">{fmt(item.doctor_amount_due)}</TableCell>
                            <TableCell><Badge variant={item.pricing_status === "ok" ? "outline" : "destructive"} className="text-xs">{item.pricing_status === "ok" ? "OK" : item.pricing_status.replace("pending_","").replace("_"," ")}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
                <TabsContent value="units" className="mt-4">
                  {(unitLinks as any[]).length === 0 ? <div className="text-center py-12 text-muted-foreground">Nenhuma unidade vinculada.</div> : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Unidade</TableHead><TableHead>Vigência Início</TableHead><TableHead>Vigência Fim</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(unitLinks as any[]).map((link) => {
                          const unit = (allUnits as any[]).find((u) => u.id === link.unit_id);
                          return (
                            <TableRow key={link.id}>
                              <TableCell className="font-medium">{unit?.name || `Unidade ${link.unit_id}`}</TableCell>
                              <TableCell>{link.starts_at ? new Date(link.starts_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                              <TableCell>{link.ends_at ? new Date(link.ends_at).toLocaleDateString("pt-BR") : "Sem fim"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
