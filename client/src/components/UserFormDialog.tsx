import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, KeyRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const ROLES = [
  { value: "admin_master", label: "Admin Master" },
  { value: "unit_admin", label: "Admin Unidade" },
  { value: "medico", label: "Médico" },
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
}

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserFormData | null;
  units: { id: number; name: string; isActive: boolean }[];
  onSave: (user: UserFormData) => void;
  onResetPassword?: (userId: number, email: string) => void;
  loading?: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  admin_master: "border-red-200 text-red-700 bg-red-50",
  unit_admin: "border-orange-200 text-orange-700 bg-orange-50",
  medico: "border-blue-200 text-blue-700 bg-blue-50",
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
  open, onOpenChange, user, units, onSave, onResetPassword, loading = false,
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

  // Load existing permissions from backend when editing
  const { data: existingPerms } = trpc.admin.getUserPermissions.useQuery(
    { userId: user?.id ?? 0 },
    { enabled: isEditing && open && !!user?.id }
  );

  useEffect(() => {
    if (open) {
      if (user) {
        setName(user.name || "");
        setEmail(user.email || "");
        setUsername(user.username || "");
        setPassword("");
        setRole(user.role);
        setIsActive(user.isActive);
        // expiration_date vem como BIGINT (ms) do banco — converter para YYYY-MM-DD para o input[type=date]
        if (user.expiration_date) {
          const d = new Date(Number(user.expiration_date));
          const yyyy = d.getUTCFullYear();
          const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
          const dd = String(d.getUTCDate()).padStart(2, '0');
          setExpirationDate(`${yyyy}-${mm}-${dd}`);
        } else {
          setExpirationDate("");
        }
        setPermissions(user.permissions || []);
      } else {
        setName(""); setEmail(""); setUsername(""); setPassword("");
        setRole("medico"); setIsActive(true); setExpirationDate("");
        setPermissions([]);
      }
      setExpandedUnits({});
    }
  }, [open, user]);

  // Sync permissions from backend
  useEffect(() => {
    if (existingPerms && existingPerms.length > 0) {
      setPermissions(
        existingPerms.map((p) => ({
          unit_id: p.unit_id,
          view_studies: p.view_studies,
          edit_reports: p.edit_reports,
          view_anamnesis: p.view_anamnesis,
          print_reports: p.print_reports,
          manage_templates: p.manage_templates,
        }))
      );
    }
  }, [existingPerms]);

  const isUnitSelected = (unitId: number) =>
    permissions.some((p) => p.unit_id === unitId);

  const getPermission = (unitId: number): UnitPermission =>
    permissions.find((p) => p.unit_id === unitId) ?? defaultPermission(unitId);

  const toggleUnit = (unitId: number, checked: boolean) => {
    if (checked) {
      setPermissions((prev) => [...prev, defaultPermission(unitId)]);
      setExpandedUnits((prev) => ({ ...prev, [unitId]: true }));
    } else {
      setPermissions((prev) => prev.filter((p) => p.unit_id !== unitId));
      setExpandedUnits((prev) => ({ ...prev, [unitId]: false }));
    }
  };

  const togglePermission = (unitId: number, key: keyof UnitPermission, value: boolean) => {
    setPermissions((prev) =>
      prev.map((p) => (p.unit_id === unitId ? { ...p, [key]: value } : p))
    );
  };

  const toggleExpand = (unitId: number) => {
    setExpandedUnits((prev) => ({ ...prev, [unitId]: !prev[unitId] }));
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error("Informe o nome do usuário"); return; }
    if (!username.trim()) { toast.error("Informe o nome de usuário (login)"); return; }
    if (!isEditing && !password.trim()) { toast.error("Defina uma senha para o novo usuário"); return; }
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
    });
  };

  const handleResetPassword = () => {
    if (user?.id && onResetPassword) {
      onResetPassword(user.id, email);
    } else {
      toast.info("Digite a nova senha no campo acima e salve");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {isEditing ? "Editar Usuário" : "Novo Usuário"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
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
                className="mt-1 w-full h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground"
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium">Data de Expiração</Label>
              <Input type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} className="mt-1" />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <div>
                <span className="text-sm font-medium">{isActive ? "Ativo" : "Inativo"}</span>
                <p className="text-xs text-muted-foreground">{isActive ? "Acesso permitido" : "Acesso bloqueado"}</p>
              </div>
            </div>
            <div className="flex items-end pb-1">
              <Badge variant="outline" className={`text-xs ${ROLE_COLORS[role] || ""}`}>
                {ROLES.find(r => r.value === role)?.label}
              </Badge>
            </div>
          </div>

          {/* Botão reset senha */}
          {isEditing && (
            <Button variant="outline" size="sm" onClick={handleResetPassword} className="gap-1.5 text-xs" type="button">
              <KeyRound className="h-3.5 w-3.5" />
              Resetar Senha
            </Button>
          )}

          {/* Unidades e Permissões */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Unidades e Permissões</Label>
            <p className="text-xs text-muted-foreground">
              Selecione as unidades que este usuário pode acessar e configure as permissões de cada uma.
            </p>
            <div className="space-y-2">
              {units.map((unit) => {
                const selected = isUnitSelected(unit.id);
                const expanded = expandedUnits[unit.id] ?? false;
                const perm = getPermission(unit.id);

                return (
                  <div
                    key={unit.id}
                    className={`rounded-md border transition-colors ${
                      selected ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                    }`}
                  >
                    {/* Header da unidade */}
                    <div className="flex items-center gap-3 p-3">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(v) => toggleUnit(unit.id, !!v)}
                        id={`unit-${unit.id}`}
                      />
                      <label
                        htmlFor={`unit-${unit.id}`}
                        className="flex-1 text-sm font-medium cursor-pointer select-none"
                      >
                        {unit.name}
                      </label>
                      {!unit.isActive && (
                        <Badge variant="secondary" className="text-xs">Inativa</Badge>
                      )}
                      {selected && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(unit.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      )}
                    </div>

                    {/* Permissões granulares */}
                    {selected && expanded && (
                      <div className="px-4 pb-3 grid grid-cols-2 gap-2 border-t border-border/50 pt-2">
                        {PERMISSION_LABELS.map(({ key, label }) => (
                          <div key={key} className="flex items-center gap-2">
                            <Checkbox
                              checked={perm[key] as boolean}
                              onCheckedChange={(v) => togglePermission(unit.id, key, !!v)}
                              id={`perm-${unit.id}-${key}`}
                            />
                            <label
                              htmlFor={`perm-${unit.id}-${key}`}
                              className="text-xs text-muted-foreground cursor-pointer select-none"
                            >
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
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma unidade cadastrada
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Salvando..." : isEditing ? "Salvar Alterações" : "Criar Usuário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
