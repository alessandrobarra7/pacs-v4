import { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
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
  Wifi, WifiOff, Users, Loader2, Plus, UserMinus,
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

type DialogTab = "dados" | "responsavel" | "medicos" | "equipe" | "custo" | "resumo";

const NAV_ITEMS: { id: DialogTab; label: string; icon: React.ElementType; editOnly?: boolean }[] = [
  { id: "dados",       label: "Dados",        icon: Settings2 },
  { id: "responsavel", label: "Responsável",  icon: UserCheck,  editOnly: true },
  { id: "medicos",     label: "Médicos",      icon: Stethoscope,editOnly: true },
  { id: "equipe",      label: "Equipe",       icon: Users,      editOnly: true },
  { id: "custo",       label: "Custo Sistema",icon: DollarSign, editOnly: true },
  { id: "resumo",      label: "Resumo",       icon: TrendingUp, editOnly: true },
];

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

  // Custo / Responsável
  const [editingSystemPrice, setEditingSystemPrice] = useState(false);
  const [systemPriceValue, setSystemPriceValue] = useState("");
  const [selectedResponsibleId, setSelectedResponsibleId] = useState<number | null>(null);

  // Teste de conexão DICOM (na aba Dados)
  const [testingDicom, setTestingDicom] = useState(false);
  const [dicomTestResult, setDicomTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Equipe
  const [addingTeamUserId, setAddingTeamUserId] = useState<number | null>(null);

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

  const { data: teamMembers, refetch: refetchTeam } = trpc.finance.listTeamMembers.useQuery(
    { unitId: unit?.id ?? 0 },
    { enabled: isEditing && !!unit?.id && open && activeTab === "equipe" }
  );

  const { data: allUsers } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: isEditing && open && activeTab === "equipe",
  });

  const setSystemPriceDirect = trpc.billing.setSystemPriceDirect.useMutation({
    onSuccess: () => { toast.success("Custo do sistema atualizado"); setEditingSystemPrice(false); refetchUnitCtx(); },
    onError: (e) => toast.error(e.message || "Erro ao atualizar custo"),
  });

  const linkResponsibleDirect = trpc.billing.linkResponsibleToUnitDirect.useMutation({
    onSuccess: () => { toast.success("Responsável vinculado"); setSelectedResponsibleId(null); refetchUnitCtx(); },
    onError: (e) => toast.error(e.message || "Erro ao vincular responsável"),
  });

  const testOrthancConnection = trpc.finance.testOrthancConnection.useMutation({
    onSuccess: (data) => { setDicomTestResult(data); setTestingDicom(false); },
    onError: (e) => { setDicomTestResult({ ok: false, message: e.message }); setTestingDicom(false); },
  });

  const addTeamMember = trpc.finance.addTeamMember.useMutation({
    onSuccess: () => { toast.success("Membro adicionado"); setAddingTeamUserId(null); refetchTeam(); },
    onError: (e) => toast.error(e.message || "Erro ao adicionar membro"),
  });

  const removeTeamMember = trpc.finance.removeTeamMember.useMutation({
    onSuccess: () => { toast.success("Membro removido"); refetchTeam(); },
    onError: (e) => toast.error(e.message || "Erro ao remover membro"),
  });

  useEffect(() => {
    if (open) {
      setActiveTab("dados");
      setEditingSystemPrice(false);
      setSystemPriceValue("");
      setSelectedResponsibleId(null);
      setDicomTestResult(null);
      setAddingTeamUserId(null);
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

  const handleTestDicom = () => {
    if (!unit?.id) return;
    setTestingDicom(true);
    setDicomTestResult(null);
    testOrthancConnection.mutate({ unitId: unit.id });
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

  const teamUserIds = new Set((teamMembers ?? []).map(m => m.id));
  const availableUsers = (allUsers ?? []).filter(u => u.role !== "medico" && !teamUserIds.has(u.id));

  const ROLE_LABELS: Record<string, string> = {
    unit_admin: "Admin Unidade", operador: "Operador", viewer: "Visualizador",
    responsavel_financeiro: "Resp. Financeiro", admin_master: "Admin Master",
  };

  const visibleTabs = NAV_ITEMS.filter(t => !t.editOnly || isEditing);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[96vw] w-[96vw] h-[95vh] max-h-[95vh] p-0 overflow-hidden flex flex-col gap-0">
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
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

        {/* ── BODY: sidebar + conteúdo ────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Sidebar de navegação */}
          <nav className="w-56 shrink-0 border-r border-border bg-muted/30 flex flex-col py-4 gap-1 overflow-y-auto">
            {visibleTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors text-left w-full
                  ${activeTab === id
                    ? "bg-background text-foreground border-r-2 border-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                  }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          {/* Área de conteúdo */}
          <div className="flex-1 overflow-y-auto px-8 py-6">

            {/* ── ABA DADOS ─────────────────────────────────────────────── */}
            {activeTab === "dados" && (
              <div className="space-y-6 max-w-3xl">
                {/* Informações gerais */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-4">Informações da Unidade</h3>
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
                  <div className="mt-4">
                    <Label className="text-sm font-medium">Endereço</Label>
                    <Input value={address} onChange={e => setAddress(e.target.value)} className="mt-1" placeholder="Rua, número, cidade" />
                  </div>
                  <div className="mt-4">
                    <Label className="text-sm font-medium">Equipamentos</Label>
                    <Textarea value={equipmentInfo} onChange={e => setEquipmentInfo(e.target.value)} className="mt-1 text-sm" rows={2} placeholder="Tomógrafo, ressonância..." />
                  </div>
                </div>

                {/* Conexão DICOM */}
                <div className="border-t border-border pt-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Conexão DICOM / PACS</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <Label className="text-sm font-medium">IP do PACS</Label>
                      <Input value={pacsIp} onChange={e => setPacsIp(e.target.value)} className="mt-1 font-mono text-sm" placeholder="192.168.1.100" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Porta DICOM</Label>
                      <Input value={pacsPort} onChange={e => setPacsPort(e.target.value)} className="mt-1 font-mono text-sm" placeholder="11112" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium">AE Title</Label>
                      <Input value={pacsAeTitle} onChange={e => setPacsAeTitle(e.target.value)} className="mt-1 font-mono text-sm" placeholder="ORTHANC" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <Label className="text-sm font-medium">AE Title Local</Label>
                    <Input value={pacsLocalAeTitle} onChange={e => setPacsLocalAeTitle(e.target.value)} className="mt-1 font-mono text-sm" placeholder="LAUDS" />
                  </div>

                  {/* Botão Testar Conexão — inline com os campos DICOM */}
                  {isEditing && (
                    <div className="mt-4 flex items-center gap-3">
                      <Button type="button" variant="outline" size="sm" onClick={handleTestDicom} disabled={testingDicom || !pacsIp}>
                        {testingDicom
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Testando...</>
                          : <><Wifi className="h-3.5 w-3.5 mr-2" />Testar Conexão DICOM</>
                        }
                      </Button>
                      {dicomTestResult && (
                        <div className={`flex items-center gap-2 text-sm rounded-md px-3 py-1.5 border ${dicomTestResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
                          {dicomTestResult.ok ? <Wifi className="h-3.5 w-3.5 shrink-0" /> : <WifiOff className="h-3.5 w-3.5 shrink-0" />}
                          <span className="text-xs">{dicomTestResult.message}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Logo */}
                <div className="border-t border-border pt-5">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Logo da Unidade</h3>
                  <p className="text-xs text-muted-foreground mb-3">Aparece no cabeçalho do laudo. PNG com fundo branco, máx. 2 MB.</p>
                  {logoPreview ? (
                    <div className="flex items-start gap-4">
                      <img src={logoPreview} alt="Logo" className="h-20 max-w-[200px] object-contain border border-gray-200 rounded p-2 bg-white" />
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
                    <label className="flex items-center gap-3 cursor-pointer px-4 py-4 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition-colors max-w-xs">
                      <ImageOff className="h-6 w-6 text-gray-300 shrink-0" />
                      <div><p className="text-sm text-gray-600">Nenhum logo cadastrado</p><p className="text-xs text-gray-400">Clique para fazer upload</p></div>
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                    </label>
                  )}
                  {logoFile && <p className="text-xs text-amber-600 flex items-center gap-1 mt-2"><Upload className="h-3 w-3" />Novo logo será salvo ao clicar em "Salvar Alterações"</p>}
                </div>

                {/* Status */}
                <div className="flex items-center gap-3 border-t border-border pt-5">
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                  <div>
                    <span className="text-sm font-medium">{isActive ? "Unidade Ativa" : "Unidade Desativada"}</span>
                    <p className="text-xs text-muted-foreground">{isActive ? "Novos exames podem ser recebidos" : "Unidade bloqueada para novos exames"}</p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-border pt-5">
                  <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
                  <Button onClick={handleSave} disabled={loading || updateLogo.isPending}>
                    {loading || updateLogo.isPending ? "Salvando..." : unit ? "Salvar Alterações" : "Criar Unidade"}
                  </Button>
                </div>
              </div>
            )}

            {/* ── ABA RESPONSÁVEL ──────────────────────────────────────── */}
            {activeTab === "responsavel" && isEditing && (
              <div className="space-y-5 max-w-3xl">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                    <UserCheck className="h-4 w-4 text-blue-600" /> Responsável Financeiro
                  </h3>
                  <p className="text-xs text-muted-foreground">Pessoa ou empresa responsável pelo contrato financeiro desta unidade.</p>
                </div>

                {activeResponsible ? (
                  <div className={`rounded-lg border p-4 ${isDefaultResp ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                    {isDefaultResp && (
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <p className="text-xs text-amber-700 font-medium">Responsável padrão — configure um responsável real</p>
                      </div>
                    )}
                    <p className="text-sm font-semibold">{activeResponsible.legal_name}</p>
                    {activeResponsible.trade_name && <p className="text-xs text-muted-foreground mt-0.5">{activeResponsible.trade_name}</p>}
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
                  <p className="text-xs text-muted-foreground mt-1 mb-3">Selecione um responsável cadastrado para vincular a esta unidade.</p>
                  <div className="flex gap-3">
                    <select value={selectedResponsibleId ?? ""} onChange={e => setSelectedResponsibleId(e.target.value ? Number(e.target.value) : null)}
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="">Selecione um responsável...</option>
                      {responsibles?.filter(r => r.isActive && r.legal_name !== "Sem Responsável").map(r => (
                        <option key={r.id} value={r.id}>{r.legal_name}{r.trade_name ? ` (${r.trade_name})` : ""}</option>
                      ))}
                    </select>
                    <Button type="button" disabled={!selectedResponsibleId || linkResponsibleDirect.isPending} onClick={handleLinkResponsible}>
                      {linkResponsibleDirect.isPending ? "Vinculando..." : "Vincular"}
                    </Button>
                  </div>
                </div>

                {unitCtx?.responsibleHistory && unitCtx.responsibleHistory.length > 1 && (
                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-medium text-muted-foreground mb-3">Histórico de responsáveis</p>
                    <div className="space-y-1">
                      {unitCtx.responsibleHistory.map((rh) => (
                        <div key={rh.link_id} className="flex items-center justify-between text-xs text-muted-foreground py-2 border-b border-border/30 last:border-0">
                          <span className={rh.ends_at ? "line-through opacity-50" : "font-medium"}>{rh.legal_name}</span>
                          <span>{new Date(rh.starts_at!).toLocaleDateString("pt-BR")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── ABA MÉDICOS ──────────────────────────────────────────── */}
            {activeTab === "medicos" && isEditing && (
              <div className="h-full">
                {/* Banner explicativo sobre o preço do médico */}
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
                  <DollarSign className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">Valor por laudo do médico</p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Cada médico pode ter um valor diferente por laudo assinado nesta unidade.
                      Clique no ícone <Pencil className="inline h-3 w-3" /> ou no valor na coluna <strong>Valor/Laudo</strong> para definir ou alterar.
                      Este valor é independente do custo do sistema (configurado na aba <strong>Custo Sistema</strong>).
                    </p>
                  </div>
                </div>
                <UnitDoctorsTab unitId={unit!.id!} />
              </div>
            )}

            {/* ── ABA EQUIPE ───────────────────────────────────────────── */}
            {activeTab === "equipe" && isEditing && (
              <div className="space-y-5 max-w-3xl">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-indigo-600" /> Equipe da Unidade
                  </h3>
                  <p className="text-xs text-muted-foreground">Operadores, visualizadores e administradores de unidade vinculados a este PACS. Médicos são gerenciados na aba Médicos.</p>
                </div>

                <div className="flex gap-3">
                  <select value={addingTeamUserId ?? ""} onChange={e => setAddingTeamUserId(e.target.value ? Number(e.target.value) : null)}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Selecionar usuário para adicionar...</option>
                    {availableUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name} — {ROLE_LABELS[u.role] ?? u.role}</option>
                    ))}
                  </select>
                  <Button type="button" disabled={!addingTeamUserId || addTeamMember.isPending}
                    onClick={() => addingTeamUserId && addTeamMember.mutate({ unitId: unit!.id!, userId: addingTeamUserId })}>
                    <Plus className="h-4 w-4 mr-2" />Adicionar
                  </Button>
                </div>

                {teamMembers && teamMembers.length > 0 ? (
                  <div className="space-y-2">
                    {teamMembers.map(m => (
                      <div key={m.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{ROLE_LABELS[m.role] ?? m.role} · @{m.username}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={m.isActive ? "default" : "secondary"} className="text-xs">
                            {m.isActive ? "Ativo" : "Inativo"}
                          </Badge>
                          <button type="button"
                            onClick={() => removeTeamMember.mutate({ unitId: unit!.id!, userId: m.id })}
                            disabled={removeTeamMember.isPending}
                            className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors">
                            <UserMinus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Nenhum membro de equipe vinculado</p>
                    <p className="text-xs mt-1">Use o seletor acima para adicionar membros</p>
                  </div>
                )}
              </div>
            )}

            {/* ── ABA CUSTO SISTEMA ────────────────────────────────────── */}
            {activeTab === "custo" && isEditing && (
              <div className="space-y-5 max-w-3xl">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                    <DollarSign className="h-4 w-4 text-emerald-600" /> Custo do Sistema por Laudo
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Valor cobrado pelo <strong>sistema</strong> por laudo assinado nesta unidade.
                    Este valor é diferente do valor pago ao médico (configurado na aba <strong>Médicos</strong>).
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-background p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Custo vigente</p>
                      {activeSystemPrice ? (
                        <p className="text-3xl font-bold text-emerald-600 mt-1">
                          R$ {parseFloat(activeSystemPrice.price_per_report).toFixed(2)}
                          <span className="text-base font-normal text-muted-foreground ml-2">/ laudo</span>
                        </p>
                      ) : (
                        <p className="text-sm text-amber-500 mt-2">Não configurado</p>
                      )}
                      {activeSystemPrice && <p className="text-xs text-muted-foreground mt-1">Desde {new Date(activeSystemPrice.starts_at!).toLocaleDateString("pt-BR")}</p>}
                    </div>
                    {!editingSystemPrice && (
                      <button type="button" onClick={() => { setEditingSystemPrice(true); setSystemPriceValue(activeSystemPrice ? parseFloat(activeSystemPrice.price_per_report).toFixed(2) : ""); }}
                        className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {editingSystemPrice && (
                    <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
                      <span className="text-sm text-muted-foreground">R$</span>
                      <Input value={systemPriceValue} onChange={e => setSystemPriceValue(e.target.value)} className="h-9 w-32 text-sm text-right" placeholder="0.00" autoFocus
                        onKeyDown={e => { if (e.key === "Enter") handleSaveSystemPrice(); if (e.key === "Escape") setEditingSystemPrice(false); }} />
                      <span className="text-sm text-muted-foreground">/ laudo</span>
                      <button type="button" onClick={handleSaveSystemPrice} disabled={setSystemPriceDirect.isPending}
                        className="p-2 rounded text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"><Check className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setEditingSystemPrice(false)}
                        className="p-2 rounded text-muted-foreground hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>

                {unitCtx?.systemPriceHistory && unitCtx.systemPriceHistory.length > 0 && (
                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-medium text-muted-foreground mb-3">Histórico de custos do sistema</p>
                    <div className="space-y-1">
                      {unitCtx.systemPriceHistory.map((sp) => (
                        <div key={sp.id} className="flex items-center justify-between text-xs text-muted-foreground py-2 border-b border-border/30 last:border-0">
                          <span>{new Date(sp.starts_at!).toLocaleDateString("pt-BR")}</span>
                          <span className={sp.ends_at ? "line-through opacity-50" : "text-emerald-600 font-medium"}>R$ {parseFloat(sp.price_per_report).toFixed(2)}</span>
                          <span>{sp.ends_at ? "Encerrado" : "Vigente"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── ABA RESUMO ───────────────────────────────────────────── */}
            {activeTab === "resumo" && isEditing && (
              <div className="space-y-5 max-w-3xl">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-blue-600" /> Resumo Financeiro
                  </h3>
                  <p className="text-xs text-muted-foreground">Ciclo corrente — dados consolidados desta unidade.</p>
                </div>

                {unitCtx ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-lg border border-border bg-background p-4">
                        <p className="text-xs text-muted-foreground font-medium">Laudos no ciclo</p>
                        <p className="text-3xl font-bold mt-1">{unitCtx.financialSummary.totalReports}</p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-xs text-emerald-700 font-medium">Custo médicos</p>
                        <p className="text-3xl font-bold text-emerald-700 mt-1">R$ {parseFloat(unitCtx.financialSummary.totalDoctorAmount).toFixed(2)}</p>
                      </div>
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <p className="text-xs text-blue-700 font-medium">Custo sistema</p>
                        <p className="text-3xl font-bold text-blue-700 mt-1">R$ {parseFloat(unitCtx.financialSummary.totalSystemAmount).toFixed(2)}</p>
                      </div>
                      <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                        <p className="text-xs text-purple-700 font-medium">Total geral</p>
                        <p className="text-3xl font-bold text-purple-700 mt-1">R$ {parseFloat(unitCtx.financialSummary.totalGeral).toFixed(2)}</p>
                      </div>
                    </div>

                    {unitCtx.doctorPrices && unitCtx.doctorPrices.length > 0 && (
                      <div className="border-t border-border pt-4">
                        <p className="text-xs font-medium text-muted-foreground mb-3">Médicos com preço configurado</p>
                        <div className="space-y-2">
                          {unitCtx.doctorPrices.map((dp) => (
                            <div key={dp.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
                              <p className="text-sm font-medium">{dp.doctor_name}</p>
                              <p className="text-sm text-emerald-600 font-medium">R$ {parseFloat(dp.price_per_report).toFixed(2)}/laudo</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {unitCtx.financialSummary.totalReports === 0 && (
                      <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
                        <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">Nenhum laudo no ciclo corrente</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="animate-spin h-7 w-7 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-sm">Carregando resumo financeiro...</p>
                  </div>
                )}
              </div>
            )}

          </div>{/* fim área de conteúdo */}
        </div>{/* fim body */}

        {/* ── FOOTER (apenas nas abas não-dados) ─────────────────────────── */}
        {activeTab !== "dados" && (
          <div className="px-6 py-3 border-t border-border shrink-0 flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
