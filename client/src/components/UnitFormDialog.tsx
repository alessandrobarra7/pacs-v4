import { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload, Building2, Trash2, ImageOff, Settings2, Stethoscope,
  DollarSign, TrendingUp, UserCheck, Pencil, Check, X, AlertTriangle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import UnitDoctorsTab from "./UnitDoctorsTab";

export interface UnitFormData {
  id?: number;
  name: string;
  slug: string;
  address: string;
  equipment_info: string;
  pacs_ip: string;
  pacs_port: number;
  pacs_ae_title: string;
  pacs_local_ae_title: string;
  isActive: boolean;
  logo_url?: string | null;
}

interface UnitFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: UnitFormData | null;
  onSave: (unit: UnitFormData) => void;
  loading?: boolean;
}

type DialogTab = "dados" | "responsavel" | "custo" | "medicos" | "resumo";

export default function UnitFormDialog({
  open, onOpenChange, unit, onSave, loading = false,
}: UnitFormDialogProps) {
  const [activeTab, setActiveTab] = useState<DialogTab>("dados");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [address, setAddress] = useState("");
  const [equipmentInfo, setEquipmentInfo] = useState("");
  const [pacsIp, setPacsIp] = useState("");
  const [pacsPort, setPacsPort] = useState("11112");
  const [pacsAeTitle, setPacsAeTitle] = useState("");
  const [pacsLocalAeTitle, setPacsLocalAeTitle] = useState("LAUDS");
  const [isActive, setIsActive] = useState(true);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<string | null>(null);
  const [removingLogo, setRemovingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [editingSystemPrice, setEditingSystemPrice] = useState(false);
  const [systemPriceValue, setSystemPriceValue] = useState("");
  const [selectedResponsibleId, setSelectedResponsibleId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const isEditing = !!unit?.id;

  const updateLogo = trpc.medicalData.updateUnitLogo.useMutation({
    onSuccess: () => { toast.success("Logo atualizado"); setLogoFile(null); utils.medicalData.getReportContext.invalidate(); },
    onError: (e) => toast.error(e.message || "Erro ao salvar logo"),
  });

  const removeLogo = trpc.medicalData.removeLogo.useMutation({
    onSuccess: () => { toast.success("Logo removido"); setLogoPreview(null); setLogoFile(null); setRemovingLogo(false); utils.medicalData.getReportContext.invalidate(); },
    onError: (e) => { toast.error(e.message || "Erro ao remover logo"); setRemovingLogo(false); },
  });

  const { data: unitCtx, refetch: refetchUnitCtx } = trpc.billing.getUnitFullContext.useQuery(
    { unitId: unit?.id ?? 0 },
    { enabled: isEditing && !!unit?.id && open }
  );

  const { data: responsibles } = trpc.billing.listResponsibles.useQuery(undefined, {
    enabled: isEditing && open,
  });

  const setSystemPriceDirect = trpc.billing.setSystemPriceDirect.useMutation({
    onSuccess: () => { toast.success("Custo do sistema atualizado"); setEditingSystemPrice(false); refetchUnitCtx(); },
    onError: (e) => toast.error(e.message || "Erro ao atualizar custo"),
  });

  const linkResponsibleDirect = trpc.billing.linkResponsibleToUnitDirect.useMutation({
    onSuccess: () => { toast.success("Responsável vinculado"); setSelectedResponsibleId(null); refetchUnitCtx(); },
    onError: (e) => toast.error(e.message || "Erro ao vincular responsável"),
  });

  useEffect(() => {
    if (open) {
      setActiveTab("dados");
      setEditingSystemPrice(false);
      setSystemPriceValue("");
      setSelectedResponsibleId(null);
      if (unit) {
        setName(unit.name); setSlug(unit.slug); setAddress(unit.address || "");
        setEquipmentInfo(unit.equipment_info || ""); setPacsIp(unit.pacs_ip || "");
        setPacsPort(String(unit.pacs_port || 11112)); setPacsAeTitle(unit.pacs_ae_title || "");
        setPacsLocalAeTitle(unit.pacs_local_ae_title || "LAUDS"); setIsActive(unit.isActive);
        setLogoPreview(unit.logo_url || null); setLogoFile(null); setRemovingLogo(false);
      } else {
        setName(""); setSlug(""); setAddress(""); setEquipmentInfo("");
        setPacsIp(""); setPacsPort("11112"); setPacsAeTitle(""); setPacsLocalAeTitle("LAUDS");
        setIsActive(true); setLogoPreview(null); setLogoFile(null); setRemovingLogo(false);
      }
    }
  }, [open, unit]);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!unit) setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { const d = reader.result as string; setLogoFile(d); setLogoPreview(d); };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveLogo = () => {
    if (!unit?.id) return;
    if (!confirm("Remover o logo desta unidade?")) return;
    setRemovingLogo(true);
    removeLogo.mutate({ unitId: unit.id });
  };

  const handleSaveSystemPrice = () => {
    if (!unit?.id) return;
    const val = parseFloat(systemPriceValue.replace(",", "."));
    if (isNaN(val) || val < 0) { toast.error("Informe um valor válido"); return; }
    setSystemPriceDirect.mutate({ unitId: unit.id, pricePerReport: val.toFixed(2), startsAt: new Date().toISOString() });
  };

  const handleLinkResponsible = () => {
    if (!unit?.id || !selectedResponsibleId) return;
    linkResponsibleDirect.mutate({ unitId: unit.id, responsibleId: selectedResponsibleId, startsAt: new Date().toISOString() });
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error("Informe o nome da unidade"); return; }
    if (!pacsIp.trim()) { toast.error("Informe o IP do PACS"); return; }
    const port = parseInt(pacsPort);
    if (isNaN(port) || port < 1 || port > 65535) { toast.error("Porta PACS inválida"); return; }
    onSave({
      id: unit?.id, name: name.trim(),
      slug: slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      address: address.trim(), equipment_info: equipmentInfo.trim(),
      pacs_ip: pacsIp.trim(), pacs_port: port,
      pacs_ae_title: pacsAeTitle.trim(), pacs_local_ae_title: pacsLocalAeTitle.trim() || "LAUDS",
      isActive, _logoFile: logoFile || undefined,
    } as any);
  };

  const activeResponsible = unitCtx?.activeResponsible;
  const isDefaultResp = activeResponsible?.legal_name === "Sem Responsável";
  const activeSystemPrice = unitCtx?.activeSystemPrice;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            {isEditing ? `Editar: ${name || "Unidade"}` : "Nova Unidade"}
            {isEditing && (
              <Badge variant={isActive ? "default" : "secondary"} className="text-xs ml-1">
                {isActive ? "Ativa" : "Inativa"}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DialogTab)} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className={`grid w-full shrink-0 ${isEditing ? "grid-cols-5" : "grid-cols-1"}`}>
            <TabsTrigger value="dados" className="gap-1.5 text-xs"><Settings2 className="h-3.5 w-3.5" />Dados</TabsTrigger>
            {isEditing && (
              <>
                <TabsTrigger value="responsavel" className="gap-1.5 text-xs"><UserCheck className="h-3.5 w-3.5" />Responsável</TabsTrigger>
                <TabsTrigger value="custo" className="gap-1.5 text-xs"><DollarSign className="h-3.5 w-3.5" />Custo</TabsTrigger>
                <TabsTrigger value="medicos" className="gap-1.5 text-xs"><Stethoscope className="h-3.5 w-3.5" />Médicos</TabsTrigger>
                <TabsTrigger value="resumo" className="gap-1.5 text-xs"><TrendingUp className="h-3.5 w-3.5" />Resumo</TabsTrigger>
              </>
            )}
          </TabsList>

          {/* ABA DADOS */}
          <TabsContent value="dados" className="flex-1 overflow-y-auto mt-0 pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Nome da Unidade</Label>
                <Input value={name} onChange={e => handleNameChange(e.target.value)} className="mt-1" placeholder="Ex: PACS Principal" />
              </div>
              <div>
                <Label className="text-sm font-medium">Slug (URL)</Label>
                <Input value={slug} onChange={e => setSlug(e.target.value)} className="mt-1 font-mono text-sm" placeholder="pacs-principal" disabled={isEditing} />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Endereço</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} className="mt-1" placeholder="Rua, número, cidade" />
            </div>
            <div>
              <Label className="text-sm font-medium">Equipamentos</Label>
              <Textarea value={equipmentInfo} onChange={e => setEquipmentInfo(e.target.value)} className="mt-1 text-sm" rows={2} placeholder="Tomógrafo, ressonância..." />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <Label className="text-sm font-medium">IP do PACS</Label>
                <Input value={pacsIp} onChange={e => setPacsIp(e.target.value)} className="mt-1 font-mono text-sm" placeholder="192.168.1.100" />
              </div>
              <div>
                <Label className="text-sm font-medium">Porta</Label>
                <Input value={pacsPort} onChange={e => setPacsPort(e.target.value)} className="mt-1 font-mono text-sm" placeholder="11112" />
              </div>
              <div>
                <Label className="text-sm font-medium">AE Title</Label>
                <Input value={pacsAeTitle} onChange={e => setPacsAeTitle(e.target.value)} className="mt-1 font-mono text-sm" placeholder="ORTHANC" />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">AE Title Local</Label>
              <Input value={pacsLocalAeTitle} onChange={e => setPacsLocalAeTitle(e.target.value)} className="mt-1 font-mono text-sm" placeholder="LAUDS" />
            </div>
            <div className="border-t border-border pt-4">
              <Label className="text-sm font-medium">Logo da Unidade</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">Aparece no cabeçalho do laudo. PNG com fundo branco, máx. 2 MB.</p>
              {logoPreview ? (
                <div className="flex items-start gap-3">
                  <img src={logoPreview} alt="Logo" className="h-20 max-w-[180px] object-contain border border-gray-200 rounded p-2 bg-white" />
                  <div className="flex flex-col gap-2 mt-1">
                    <label className="flex items-center gap-1.5 cursor-pointer px-3 py-1.5 text-xs border border-dashed border-gray-300 rounded hover:bg-gray-50 transition-colors">
                      <Upload className="h-3.5 w-3.5 text-gray-400" /><span className="text-gray-600">Trocar logo</span>
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                    </label>
                    {unit?.id && (
                      <button type="button" onClick={handleRemoveLogo} disabled={removingLogo || removeLogo.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors disabled:opacity-50">
                        {removingLogo ? <span className="animate-spin h-3.5 w-3.5 border-2 border-red-400 border-t-transparent rounded-full" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Remover logo
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer px-3 py-3 border border-dashed border-gray-300 rounded hover:bg-gray-50 transition-colors">
                  <ImageOff className="h-5 w-5 text-gray-300" />
                  <div><p className="text-sm text-gray-600">Nenhum logo cadastrado</p><p className="text-xs text-gray-400">Clique para fazer upload</p></div>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                </label>
              )}
              {logoFile && <p className="text-xs text-amber-600 flex items-center gap-1 mt-2"><Upload className="h-3 w-3" />Novo logo será salvo ao clicar em "Salvar Alterações"</p>}
            </div>
            <div className="flex items-center gap-3 border-t border-border pt-4">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <div>
                <span className="text-sm font-medium">{isActive ? "Unidade Ativa" : "Unidade Desativada"}</span>
                <p className="text-xs text-muted-foreground">{isActive ? "Novos exames podem ser recebidos" : "Unidade bloqueada para novos exames"}</p>
              </div>
            </div>
          </TabsContent>

          {/* ABA RESPONSÁVEL */}
          {isEditing && (
            <TabsContent value="responsavel" className="flex-1 overflow-y-auto mt-0 pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-blue-600" />
                <Label className="text-sm font-semibold">Responsável Financeiro</Label>
              </div>
              {activeResponsible ? (
                <div className={`rounded-lg border p-4 ${isDefaultResp ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                  {isDefaultResp && (
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <p className="text-xs text-amber-700 font-medium">Responsável padrão — configure um responsável real</p>
                    </div>
                  )}
                  <p className="text-sm font-semibold">{activeResponsible.legal_name}</p>
                  {activeResponsible.trade_name && <p className="text-xs text-muted-foreground">{activeResponsible.trade_name}</p>}
                  {activeResponsible.email && <p className="text-xs text-muted-foreground mt-1">{activeResponsible.email}</p>}
                  {activeResponsible.phone && <p className="text-xs text-muted-foreground">{activeResponsible.phone}</p>}
                  <p className="text-xs text-muted-foreground mt-1">Vigente desde {new Date(activeResponsible.starts_at!).toLocaleDateString("pt-BR")}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Sem responsável configurado</p>
                    <p className="text-xs text-amber-700">Configure um responsável para habilitar o módulo financeiro desta unidade.</p>
                  </div>
                </div>
              )}
              <div className="border-t border-border pt-4">
                <Label className="text-sm font-medium">Vincular responsável</Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">Selecione um responsável cadastrado para vincular a esta unidade.</p>
                <div className="flex gap-2">
                  <select value={selectedResponsibleId ?? ""} onChange={e => setSelectedResponsibleId(e.target.value ? Number(e.target.value) : null)}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Selecione um responsável...</option>
                    {responsibles?.filter(r => r.isActive && r.legal_name !== "Sem Responsável").map(r => (
                      <option key={r.id} value={r.id}>{r.legal_name}{r.trade_name ? ` (${r.trade_name})` : ""}</option>
                    ))}
                  </select>
                  <Button type="button" size="sm" disabled={!selectedResponsibleId || linkResponsibleDirect.isPending} onClick={handleLinkResponsible}>
                    {linkResponsibleDirect.isPending ? "Vinculando..." : "Vincular"}
                  </Button>
                </div>
              </div>
              {unitCtx?.responsibleHistory && unitCtx.responsibleHistory.length > 1 && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Histórico de responsáveis</p>
                  <div className="space-y-1">
                    {unitCtx.responsibleHistory.map((rh) => (
                      <div key={rh.link_id} className="flex items-center justify-between text-xs text-muted-foreground py-1 border-b border-border/30 last:border-0">
                        <span className={rh.ends_at ? "line-through opacity-50" : "font-medium"}>{rh.legal_name}</span>
                        <span>{new Date(rh.starts_at!).toLocaleDateString("pt-BR")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          )}

          {/* ABA CUSTO */}
          {isEditing && (
            <TabsContent value="custo" className="flex-1 overflow-y-auto mt-0 pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                <Label className="text-sm font-semibold">Custo do Sistema por Laudo</Label>
              </div>
              <p className="text-xs text-muted-foreground">Valor cobrado pelo sistema por laudo assinado nesta unidade.</p>
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Custo vigente</p>
                    {activeSystemPrice ? (
                      <p className="text-2xl font-bold text-emerald-600 mt-1">
                        R$ {parseFloat(activeSystemPrice.price_per_report).toFixed(2)}<span className="text-sm font-normal text-muted-foreground ml-1">/ laudo</span>
                      </p>
                    ) : (
                      <p className="text-sm text-amber-500 mt-1">Não configurado</p>
                    )}
                    {activeSystemPrice && <p className="text-xs text-muted-foreground mt-0.5">Desde {new Date(activeSystemPrice.starts_at!).toLocaleDateString("pt-BR")}</p>}
                  </div>
                  {!editingSystemPrice && (
                    <button type="button" onClick={() => { setEditingSystemPrice(true); setSystemPriceValue(activeSystemPrice ? parseFloat(activeSystemPrice.price_per_report).toFixed(2) : ""); }}
                      className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {editingSystemPrice && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <Input value={systemPriceValue} onChange={e => setSystemPriceValue(e.target.value)} className="h-8 w-28 text-sm text-right" placeholder="0.00" autoFocus
                      onKeyDown={e => { if (e.key === "Enter") handleSaveSystemPrice(); if (e.key === "Escape") setEditingSystemPrice(false); }} />
                    <span className="text-sm text-muted-foreground">/ laudo</span>
                    <button type="button" onClick={handleSaveSystemPrice} disabled={setSystemPriceDirect.isPending}
                      className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"><Check className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setEditingSystemPrice(false)}
                      className="p-1.5 rounded text-muted-foreground hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
              {unitCtx?.systemPriceHistory && unitCtx.systemPriceHistory.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Histórico de custos</p>
                  <div className="space-y-1">
                    {unitCtx.systemPriceHistory.map((sp) => (
                      <div key={sp.id} className="flex items-center justify-between text-xs text-muted-foreground py-1 border-b border-border/30 last:border-0">
                        <span>{new Date(sp.starts_at!).toLocaleDateString("pt-BR")}</span>
                        <span className={sp.ends_at ? "line-through opacity-50" : "text-emerald-600 font-medium"}>R$ {parseFloat(sp.price_per_report).toFixed(2)}</span>
                        <span>{sp.ends_at ? "Encerrado" : "Vigente"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          )}

          {/* ABA MÉDICOS */}
          {isEditing && (
            <TabsContent value="medicos" className="flex-1 overflow-y-auto mt-0 pt-2">
              <UnitDoctorsTab unitId={unit!.id!} />
            </TabsContent>
          )}

          {/* ABA RESUMO */}
          {isEditing && (
            <TabsContent value="resumo" className="flex-1 overflow-y-auto mt-0 pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                <Label className="text-sm font-semibold">Resumo Financeiro</Label>
                <span className="text-xs text-muted-foreground">(ciclo corrente)</span>
              </div>
              {unitCtx ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border bg-background p-3">
                      <p className="text-xs text-muted-foreground font-medium">Laudos</p>
                      <p className="text-2xl font-bold mt-0.5">{unitCtx.financialSummary.totalReports}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-xs text-emerald-700 font-medium">Total médicos</p>
                      <p className="text-2xl font-bold text-emerald-700 mt-0.5">R$ {parseFloat(unitCtx.financialSummary.totalDoctorAmount).toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-xs text-blue-700 font-medium">Custo sistema</p>
                      <p className="text-2xl font-bold text-blue-700 mt-0.5">R$ {parseFloat(unitCtx.financialSummary.totalSystemAmount).toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                      <p className="text-xs text-purple-700 font-medium">Total geral</p>
                      <p className="text-2xl font-bold text-purple-700 mt-0.5">R$ {parseFloat(unitCtx.financialSummary.totalGeral).toFixed(2)}</p>
                    </div>
                  </div>
                  {unitCtx.doctorPrices && unitCtx.doctorPrices.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Médicos com preço configurado</p>
                      <div className="space-y-1">
                        {unitCtx.doctorPrices.map((dp) => (
                          <div key={dp.id} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                            <p className="text-sm font-medium">{dp.doctor_name}</p>
                            <p className="text-sm text-emerald-600 font-medium">R$ {parseFloat(dp.price_per_report).toFixed(2)}/laudo</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {unitCtx.financialSummary.totalReports === 0 && (
                    <div className="text-center py-6 text-muted-foreground">
                      <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">Nenhum laudo no ciclo corrente</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                  <p className="text-sm">Carregando resumo financeiro...</p>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="pt-3 border-t border-border">
          {activeTab === "dados" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
              <Button onClick={handleSave} disabled={loading || updateLogo.isPending}>
                {loading || updateLogo.isPending ? "Salvando..." : unit ? "Salvar Alterações" : "Criar Unidade"}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
