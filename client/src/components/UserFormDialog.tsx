import { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown, ChevronRight, KeyRound, Upload, PenLine, Trash2, ImageOff,
  DollarSign, Pencil, Check, X, TrendingUp, Building2, User,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const ROLES = [
  { value: "admin_master", label: "Admin Master" },
  { value: "unit_admin", label: "Admin Unidade" },
  { value: "medico", label: "Médico" },
  { value: "responsavel_financeiro", label: "Responsável Financeiro" },
  { value: "viewer", label: "Visualizador" },
  { value: "operador", label: "Operador" },
] as const;

type Role = typeof ROLES[number]["value"];

export interface UnitPermission {
  unit_id: number;
  view_studies: boolean;
  edit_reports: boolean;
  view_anamnesis: boolean;
  print_reports: boolean;
  manage_templates: boolean;
}

export interface UserFormData {
  id?: number;
  name: string;
  email: string;
  username: string;
  password?: string;
  role: Role;
  unit_id?: number | null;
  isActive: boolean;
  expiration_date: string;
  permissions: UnitPermission[];
  crm?: string;
  signature_url?: string | null;
}

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserFormData | null;
  units: { id: number; name: string; isActive: boolean }[];
  onSave: (user: UserFormData) => void;
  onResetPassword?: (userId: number, email: string) => void;
  loading?: boolean;
  currentUserRole?: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin_master: "border-red-200 text-red-700 bg-red-50",
  unit_admin: "border-orange-200 text-orange-700 bg-orange-50",
  medico: "border-blue-200 text-blue-700 bg-blue-50",
  responsavel_financeiro: "border-emerald-200 text-emerald-700 bg-emerald-50",
  viewer: "border-gray-200 text-gray-600 bg-gray-50",
  operador: "border-green-200 text-green-700 bg-green-50",
};

const PERMISSION_LABELS: Array<{ key: keyof UnitPermission; label: string }> = [
  { key: "view_studies", label: "Visualizar Estudos" },
  { key: "edit_reports", label: "Editar Laudos" },
  { key: "view_anamnesis", label: "Ver Anamnese" },
  { key: "print_reports", label: "Imprimir Laudos" },
  { key: "manage_templates", label: "Gerenciar Templates" },
];

function defaultPermission(unitId: number): UnitPermission {
  return {
    unit_id: unitId,
    view_studies: true,
    edit_reports: false,
    view_anamnesis: false,
    print_reports: false,
    manage_templates: false,
  };
}

export default function UserFormDialog({
  open, onOpenChange, user, units, onSave, onResetPassword, loading = false, currentUserRole,
}: UserFormDialogProps) {
  const isEditing = !!user?.id;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("medico");
  const [isActive, setIsActive] = useState(true);
  const [expirationDate, setExpirationDate] = useState("");
  const [permissions, setPermissions] = useState<UnitPermission[]>([]);
  const [expandedUnits, setExpandedUnits] = useState<Record<number, boolean>>({});
  const [crm, setCrm] = useState("");
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [signatureFile, setSignatureFile] = useState<string | null>(null);
  const [removingSignature, setRemovingSignature] = useState(false);
  const sigInputRef = useRef<HTMLInputElement>(null);
  const [stampPreview, setStampPreview] = useState<string | null>(null);
  const [stampFile, setStampFile] = useState<string | null>(null);
  const [removingStamp, setRemovingStamp] = useState(false);
  const stampInputRef = useRef<HTMLInputElement>(null);

  // Aba ativa — para médicos em edição, começa em "dados"
  const [activeTab, setActiveTab] = useState("dados");

  // Edição inline de preço por unidade
  const [editingPriceUnitId, setEditingPriceUnitId] = useState<number | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");

  const utils = trpc.useUtils();

  const updateStamp = trpc.medicalData.updateStamp.useMutation({
    onSuccess: () => {
      toast.success("Carimbo atualizado com sucesso");
      setStampFile(null);
      utils.medicalData.getReportContext.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar carimbo"),
  });

  const removeStamp = trpc.medicalData.removeStamp.useMutation({
    onSuccess: () => {
      toast.success("Carimbo removido com sucesso");
      setStampPreview(null);
      setStampFile(null);
      setRemovingStamp(false);
      utils.medicalData.getReportContext.invalidate();
    },
    onError: (e) => {
      toast.error(e.message || "Erro ao remover carimbo");
      setRemovingStamp(false);
    },
  });

  const updateMedical = trpc.medicalData.updateUserMedical.useMutation({
    onSuccess: () => {
      toast.success("Dados médicos atualizados");
      setSignatureFile(null);
      utils.medicalData.getReportContext.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar dados médicos"),
  });

  const removeSignature = trpc.medicalData.removeSignature.useMutation({
    onSuccess: () => {
      toast.success("Assinatura removida com sucesso");
      setSignaturePreview(null);
      setSignatureFile(null);
      setRemovingSignature(false);
      utils.medicalData.getReportContext.invalidate();
    },
    onError: (e) => {
      toast.error(e.message || "Erro ao remover assinatura");
      setRemovingSignature(false);
    },
  });

  // Dados financeiros completos do médico (nova procedure)
  const isMedicoEditing = isEditing && role === "medico" && currentUserRole === "admin_master";
  const isMedicoCreating = !isEditing && role === "medico" && currentUserRole === "admin_master";

  const { data: doctorFullCtx, refetch: refetchDoctorCtx } = trpc.billing.getDoctorFullContext.useQuery(
    { doctorUserId: user?.id ?? 0 },
    { enabled: isMedicoEditing && !!user?.id }
  );

  const setDoctorPriceDirect = trpc.billing.setDoctorPriceDirect.useMutation({
    onSuccess: () => {
      toast.success("Preço atualizado");
      setEditingPriceUnitId(null);
      refetchDoctorCtx();
    },
    onError: (e) => toast.error(e.message || "Erro ao atualizar preço"),
  });

  const handleSavePriceDirect = (unitId: number) => {
    if (!user?.id) return;
    const val = parseFloat(editingPriceValue.replace(",", "."));
    if (isNaN(val) || val < 0) { toast.error("Informe um valor válido"); return; }
    setDoctorPriceDirect.mutate({
      doctorUserId: user.id,
      unitId,
      pricePerReport: val.toFixed(2),
      startsAt: new Date().toISOString(),
    });
  };

  // Load existing permissions from backend when editing
  const { data: existingPerms } = trpc.admin.getUserPermissions.useQuery(
    { userId: user?.id ?? 0 },
    { enabled: isEditing && open && !!user?.id }
  );

  useEffect(() => {
    if (open) {
      setActiveTab("dados");
      if (user) {
        setName(user.name || "");
        setEmail(user.email || "");
        setUsername(user.username || "");
        setPassword("");
        setRole(user.role);
        setIsActive(user.isActive);
        if (user.expiration_date) {
          const d = new Date(Number(user.expiration_date));
          const yyyy = d.getUTCFullYear();
          const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
          const dd = String(d.getUTCDate()).padStart(2, "0");
          setExpirationDate(`${yyyy}-${mm}-${dd}`);
        } else {
          setExpirationDate("");
        }
        setPermissions(user.permissions || []);
        setCrm((user as any).crm || "");
        setSignaturePreview((user as any).signature_url || null);
        setSignatureFile(null);
        setRemovingSignature(false);
        setStampPreview((user as any).stamp_url || null);
        setStampFile(null);
        setRemovingStamp(false);
      } else {
        setName(""); setEmail(""); setUsername(""); setPassword("");
        setRole("medico"); setIsActive(true); setExpirationDate("");
        setPermissions([]);
        setCrm(""); setSignaturePreview(null); setSignatureFile(null); setRemovingSignature(false);
        setStampPreview(null); setStampFile(null); setRemovingStamp(false);
      }
      setEditingPriceUnitId(null);
      setEditingPriceValue("");
      setPendingPrices({});
    }
  }, [open, user]);

  useEffect(() => {
    if (existingPerms && isEditing) {
      setPermissions(existingPerms.map((p: any) => ({
        unit_id: p.unit_id,
        view_studies: p.view_studies ?? true,
        edit_reports: p.edit_reports ?? false,
        view_anamnesis: p.view_anamnesis ?? false,
        print_reports: p.print_reports ?? false,
        manage_templates: p.manage_templates ?? false,
      })));
    }
  }, [existingPerms, isEditing]);

  const toggleUnit = (unitId: number, checked: boolean) => {
    if (checked) {
      setPermissions((prev) => {
        if (prev.find((p) => p.unit_id === unitId)) return prev;
        return [...prev, defaultPermission(unitId)];
      });
    } else {
      setPermissions((prev) => prev.filter((p) => p.unit_id !== unitId));
    }
  };

  const toggleExpand = (unitId: number) => {
    setExpandedUnits((prev) => ({ ...prev, [unitId]: !prev[unitId] }));
  };

  const togglePermission = (unitId: number, key: keyof UnitPermission, value: boolean) => {
    setPermissions((prev) =>
      prev.map((p) => (p.unit_id === unitId ? { ...p, [key]: value } : p))
    );
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const d = ev.target?.result as string;
      setSignaturePreview(d);
      setSignatureFile(d);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveSignature = () => {
    if (!user?.id) return;
    if (!confirm("Remover a assinatura deste médico?")) return;
    setRemovingSignature(true);
    removeSignature.mutate({ userId: user.id });
  };

  const handleStampChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const d = ev.target?.result as string;
      setStampPreview(d);
      setStampFile(d);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveStamp = () => {
    if (!user?.id) return;
    if (!confirm("Remover o carimbo deste médico? Esta ação não pode ser desfeita.")) return;
    setRemovingStamp(true);
    removeStamp.mutate({ userId: user.id });
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error("Informe o nome do usuário"); return; }
    if (!isEditing && !username.trim()) { toast.error("Informe o nome de usuário (login)"); return; }
    if (!isEditing && !password.trim()) { toast.error("Defina uma senha para o novo usuário"); return; }
    if (isEditing && user?.id && (role === "medico" || role === "unit_admin")) {
      if (crm.trim() || signatureFile) {
        updateMedical.mutate({ userId: user.id, crm: crm.trim() || undefined, signatureFile: signatureFile ?? undefined });
      }
    }
    if (isEditing && user?.id && stampFile) {
      updateStamp.mutate({ userId: user.id, stampFile });
    }
    onSave({
      id: user?.id,
      name: name.trim(),
      email: email.trim(),
      username: username.trim(),
      password: password || undefined,
      role,
      unit_id: null,
      isActive,
      expiration_date: expirationDate,
      permissions,
      crm: crm.trim() || undefined,
      _stampFile: !isEditing ? stampFile || undefined : undefined,
      _signatureFile: !isEditing ? signatureFile || undefined : undefined,
      _pendingPrices: isMedicoCreating ? pendingPrices : undefined,
    } as any);
  };

  const handleResetPassword = () => {
    if (user?.id && onResetPassword) {
      onResetPassword(user.id, email);
    } else {
      toast.info("Digite a nova senha no campo acima e salve");
    }
  };

  const isMedical = role === "medico" || role === "unit_admin";

  // Preços pendentes para configuração na criação do médico (unit_id -> valor string)
  const [pendingPrices, setPendingPrices] = useState<Record<number, string>>({});

  // Determinar quais abas mostrar
  const showFinancialTabs = isMedicoEditing || isMedicoCreating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            {isEditing ? `Editar: ${name || "Usuário"}` : "Novo Usuário"}
            {isEditing && (
              <Badge variant="outline" className={`text-xs ml-1 ${ROLE_COLORS[role] || ""}`}>
                {ROLES.find(r => r.value === role)?.label}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className={`grid w-full shrink-0 ${showFinancialTabs ? "grid-cols-4" : "grid-cols-2"}`}>
            <TabsTrigger value="dados" className="gap-1.5 text-xs">
              <User className="h-3.5 w-3.5" />
              Dados
            </TabsTrigger>
            <TabsTrigger value="unidades" className="gap-1.5 text-xs">
              <Building2 className="h-3.5 w-3.5" />
              Unidades
            </TabsTrigger>
            {showFinancialTabs && (
              <>
                <TabsTrigger value="valores" className="gap-1.5 text-xs">
                  <DollarSign className="h-3.5 w-3.5" />
                  Valores
                </TabsTrigger>
                <TabsTrigger value="resumo" className="gap-1.5 text-xs">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Resumo
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* ─── ABA DADOS ─────────────────────────────────────────────────────── */}
          <TabsContent value="dados" className="flex-1 overflow-y-auto mt-0 pt-4 space-y-5">
            {/* Dados básicos */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Nome</Label>
                <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" placeholder="Nome completo" />
              </div>
              <div>
                <Label className="text-sm font-medium">Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" placeholder="email@exemplo.com" />
              </div>
              <div>
                <Label className="text-sm font-medium">Usuário</Label>
                <Input value={username} onChange={e => setUsername(e.target.value)} className="mt-1 font-mono text-sm" placeholder="login" disabled={isEditing} />
              </div>
              <div>
                <Label className="text-sm font-medium">{isEditing ? "Nova Senha (opcional)" : "Senha"}</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1" placeholder="••••••••" />
              </div>
            </div>

            {/* Perfil, Expiração, Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Perfil</Label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as Role)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-sm font-medium">Expiração</Label>
                <Input type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} className="mt-1" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <div>
                  <span className="text-sm font-medium">{isActive ? "Ativo" : "Inativo"}</span>
                  <p className="text-xs text-muted-foreground">{isActive ? "Acesso permitido" : "Acesso bloqueado"}</p>
                </div>
              </div>
              {isEditing && (
                <Button variant="outline" size="sm" onClick={handleResetPassword} className="gap-1.5 text-xs" type="button">
                  <KeyRound className="h-3.5 w-3.5" />
                  Resetar Senha
                </Button>
              )}
            </div>

            {/* Dados Médicos */}
            {isMedical && (
              <div className="border-t border-border pt-4 space-y-4">
                <div className="flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-blue-600" />
                  <Label className="text-sm font-semibold">Dados Médicos</Label>
                </div>
                <div>
                  <Label className="text-sm font-medium">CRM</Label>
                  <Input value={crm} onChange={e => setCrm(e.target.value)} className="mt-1" placeholder="Ex: 12345/SP" />
                </div>

                {currentUserRole === "admin_master" && (
                  <div>
                    <Label className="text-sm font-medium">Carimbo do Médico</Label>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                      Imagem do carimbo oficial. PNG ou JPG, máx. 2 MB.
                    </p>
                    {stampPreview ? (
                      <div className="flex items-start gap-3">
                        <img src={stampPreview} alt="Carimbo" className="h-20 max-w-[220px] object-contain border border-gray-200 rounded p-2 bg-white" />
                        <div className="flex flex-col gap-2 mt-1">
                          <label className="flex items-center gap-1.5 cursor-pointer px-3 py-1.5 text-xs border border-dashed border-gray-300 rounded hover:bg-gray-50 transition-colors">
                            <Upload className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-gray-600">Trocar carimbo</span>
                            <input ref={stampInputRef} type="file" accept="image/*" className="hidden" onChange={handleStampChange} />
                          </label>
                          {isEditing && (
                            <button type="button" onClick={handleRemoveStamp} disabled={removingStamp || removeStamp.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors disabled:opacity-50">
                              {removingStamp ? <span className="animate-spin h-3.5 w-3.5 border-2 border-red-400 border-t-transparent rounded-full inline-block" /> : <Trash2 className="h-3.5 w-3.5" />}
                              Remover carimbo
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 cursor-pointer px-3 py-3 border border-dashed border-gray-300 rounded hover:bg-gray-50 transition-colors">
                        <ImageOff className="h-5 w-5 text-gray-300" />
                        <div>
                          <p className="text-sm text-gray-600">Nenhum carimbo cadastrado</p>
                          <p className="text-xs text-gray-400">Clique para fazer upload</p>
                        </div>
                        <input ref={stampInputRef} type="file" accept="image/*" className="hidden" onChange={handleStampChange} />
                      </label>
                    )}
                    {stampFile && (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mt-2">
                        <Upload className="h-3 w-3" />
                        {isEditing ? 'Novo carimbo será salvo ao clicar em "Salvar Alterações"' : "Carimbo será enviado após criar o usuário"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ─── ABA UNIDADES ──────────────────────────────────────────────────── */}
          <TabsContent value="unidades" className="flex-1 overflow-y-auto mt-0 pt-4 space-y-3">
            <div>
              <Label className="text-sm font-semibold">Unidades e Permissões</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Selecione as unidades e configure as permissões de acesso.
              </p>
            </div>
            <div className="space-y-2">
              {units.map((unit) => {
                const perm = permissions.find((p) => p.unit_id === unit.id);
                const selected = !!perm;
                const expanded = !!expandedUnits[unit.id];
                return (
                  <div
                    key={unit.id}
                    className={`rounded-md border transition-colors ${
                      selected ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                    }`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(v) => toggleUnit(unit.id, !!v)}
                        id={`unit-${unit.id}`}
                      />
                      <label htmlFor={`unit-${unit.id}`} className="flex-1 text-sm font-medium cursor-pointer select-none">
                        {unit.name}
                      </label>
                      {!unit.isActive && (
                        <Badge variant="secondary" className="text-xs">Inativa</Badge>
                      )}
                      {selected && (
                        <button type="button" onClick={() => toggleExpand(unit.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                    {selected && expanded && (
                      <div className="px-4 pb-3 grid grid-cols-2 gap-2 border-t border-border/50 pt-2">
                        {PERMISSION_LABELS.map(({ key, label }) => (
                          <div key={key} className="flex items-center gap-2">
                            <Checkbox
                              checked={perm?.[key] as boolean}
                              onCheckedChange={(v) => togglePermission(unit.id, key, !!v)}
                              id={`perm-${unit.id}-${key}`}
                            />
                            <label htmlFor={`perm-${unit.id}-${key}`} className="text-xs text-muted-foreground cursor-pointer select-none">
                              {label}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {units.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma unidade cadastrada</p>
              )}
            </div>
          </TabsContent>
          {/* ─── ABA VALORES POR UNIDADE (médico em edição OU criação) ──────────── */}
          {showFinancialTabs && (
            <TabsContent value="valores" className="flex-1 overflow-y-auto mt-0 pt-4 space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  <Label className="text-sm font-semibold">Valores por Unidade</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isMedicoCreating
                    ? "Configure o valor por laudo para cada unidade vinculada. Será salvo após criar o médico."
                    : "Valor por laudo em cada unidade. O responsável financeiro é vinculado automaticamente."}
                </p>
              </div>

              {/* MODO CRIAÇÃO: usa unidades selecionadas na aba Unidades + pendingPrices */}
              {isMedicoCreating && (
                permissions.length > 0 ? (
                  <div className="space-y-2">
                    {permissions.map((perm) => {
                      const unit = units.find(u => u.id === perm.unit_id);
                      if (!unit) return null;
                      const currentVal = pendingPrices[perm.unit_id] ?? "";
                      return (
                        <div key={perm.unit_id} className="rounded-md border border-border bg-background px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{unit.name}</p>
                              {currentVal ? (
                                <p className="text-xs text-emerald-600 font-medium">R$ {parseFloat(currentVal || "0").toFixed(2)} / laudo</p>
                              ) : (
                                <p className="text-xs text-amber-500">Sem preço definido (opcional)</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">R$</span>
                              <Input
                                value={currentVal}
                                onChange={e => setPendingPrices(prev => ({ ...prev, [perm.unit_id]: e.target.value }))}
                                className="h-7 w-24 text-sm text-right"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-xs text-muted-foreground pt-1">
                      ℹ️ Os preços são opcionais. Você pode configurar depois na aba Valores ao editar o médico.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Nenhuma unidade selecionada. Vincule unidades na aba Unidades primeiro.</p>
                  </div>
                )
              )}

              {/* MODO EDIÇÃO: usa doctorFullCtx */}
              {isMedicoEditing && (
                doctorFullCtx?.unitLinks && doctorFullCtx.unitLinks.length > 0 ? (
                  <div className="space-y-2">
                    {doctorFullCtx.unitLinks.map((ul) => {
                      const activePrice = doctorFullCtx.activePrices?.find(p => p.unit_id === ul.unit_id);
                      const isEditingThis = editingPriceUnitId === ul.unit_id;
                      const responsible = ul.unit_id ? doctorFullCtx.unitResponsibles?.[ul.unit_id] : null;
                      const isDefaultResp = responsible?.name === "Sem Responsável";
                      return (
                        <div key={ul.unit_id} className="rounded-md border border-border bg-background px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{ul.unit_name}</p>
                              {activePrice ? (
                                <p className="text-xs text-emerald-600 font-medium">
                                  R$ {parseFloat(activePrice.price_per_report).toFixed(2)} / laudo
                                </p>
                              ) : (
                                <p className="text-xs text-amber-500">Sem preço configurado</p>
                              )}
                              {responsible && !isDefaultResp && (
                                <p className="text-xs text-muted-foreground">Resp.: {responsible.name}</p>
                              )}
                              {isDefaultResp && (
                                <p className="text-xs text-amber-600 flex items-center gap-1">
                                  ⚠️ Sem responsável — configure no módulo Financeiro
                                </p>
                              )}
                            </div>
                            {isEditingThis ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">R$</span>
                                <Input
                                  value={editingPriceValue}
                                  onChange={e => setEditingPriceValue(e.target.value)}
                                  className="h-7 w-20 text-sm text-right"
                                  placeholder="0.00"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === "Enter") handleSavePriceDirect(ul.unit_id!);
                                    if (e.key === "Escape") setEditingPriceUnitId(null);
                                  }}
                                />
                                <button type="button" onClick={() => handleSavePriceDirect(ul.unit_id!)}
                                  disabled={setDoctorPriceDirect.isPending}
                                  className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                                  <Check className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => setEditingPriceUnitId(null)}
                                  className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors">
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <button type="button"
                                onClick={() => {
                                  setEditingPriceUnitId(ul.unit_id!);
                                  setEditingPriceValue(activePrice ? parseFloat(activePrice.price_per_report).toFixed(2) : "");
                                }}
                                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">
                      {doctorFullCtx ? "Médico sem unidades vinculadas. Vincule unidades na aba Unidades." : "Carregando..."}
                    </p>
                  </div>
                )
              )}

              {/* Histórico de preços (só na edição) */}
              {isMedicoEditing && doctorFullCtx?.priceHistory && doctorFullCtx.priceHistory.length > 0 && (
                <div className="border-t border-border pt-3 mt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Histórico de preços</p>
                  <div className="space-y-1">
                    {doctorFullCtx.priceHistory.slice(0, 5).map((ph) => (
                      <div key={ph.id} className="flex items-center justify-between text-xs text-muted-foreground py-1 border-b border-border/30 last:border-0">
                        <span>{ph.unit_name}</span>
                        <span className={ph.ends_at ? "line-through opacity-50" : "text-emerald-600 font-medium"}>
                          R$ {parseFloat(ph.price_per_report).toFixed(2)}
                        </span>
                        <span>{new Date(ph.starts_at!).toLocaleDateString("pt-BR")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          )}
          {/* ─── ABA RESUMO FINANCEIRO (médico em edição) ──────────────────────── */}
          {showFinancialTabs && (
            <TabsContent value="resumo" className="flex-1 overflow-y-auto mt-0 pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                <Label className="text-sm font-semibold">Resumo Financeiro</Label>
                <span className="text-xs text-muted-foreground">(ciclo corrente)</span>
              </div>

              {doctorFullCtx ? (
                <>
                  {/* Card saldo total */}
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs text-emerald-700 font-medium uppercase tracking-wide">Saldo a receber</p>
                    <p className="text-3xl font-bold text-emerald-700 mt-1">
                      R$ {parseFloat(doctorFullCtx.totalBalance ?? "0").toFixed(2)}
                    </p>
                    <p className="text-xs text-emerald-600 mt-0.5">Ciclo aberto atual — todas as unidades</p>
                  </div>

                  {/* Por unidade */}
                  {doctorFullCtx.openCycles && doctorFullCtx.openCycles.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Por unidade</p>
                      {doctorFullCtx.openCycles.map((oc, i) => (
                        <div key={i} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">{oc.unit_name}</p>
                            <p className="text-xs text-muted-foreground">{oc.reports_count} laudo{oc.reports_count !== 1 ? "s" : ""}</p>
                          </div>
                          <p className="text-sm font-semibold text-emerald-600">
                            R$ {parseFloat(oc.amount_due ?? "0").toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || updateMedical.isPending}>
            {loading || updateMedical.isPending ? "Salvando..." : isEditing ? "Salvar Alterações" : "Criar Usuário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
