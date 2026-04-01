import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

const ROLES = [
  { value: "admin_master", label: "Admin Master" },
  { value: "unit_admin", label: "Admin Unidade" },
  { value: "medico", label: "Médico" },
  { value: "viewer", label: "Visualizador" },
  { value: "operador", label: "Operador" },
] as const;

type Role = typeof ROLES[number]["value"];

export interface UserFormData {
  id?: number;
  name: string;
  email: string;
  username: string;
  password?: string;
  role: Role;
  unit_id?: number;
  isActive: boolean;
  expiration_date: string;
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

export default function UserFormDialog({
  open, onOpenChange, user, units, onSave, onResetPassword, loading = false,
}: UserFormDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("medico");
  const [unitId, setUnitId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [expirationDate, setExpirationDate] = useState("");

  useEffect(() => {
    if (open) {
      if (user) {
        setName(user.name);
        setEmail(user.email || "");
        setUsername(user.username || "");
        setPassword("");
        setRole(user.role);
        setUnitId(user.unit_id ? String(user.unit_id) : "");
        setIsActive(user.isActive);
        setExpirationDate(user.expiration_date || "");
      } else {
        setName(""); setEmail(""); setUsername(""); setPassword("");
        setRole("medico"); setUnitId(""); setIsActive(true); setExpirationDate("");
      }
    }
  }, [open, user]);

  const handleSave = () => {
    if (!name.trim()) { toast.error("Informe o nome do usuário"); return; }
    if (!username.trim()) { toast.error("Informe o nome de usuário (login)"); return; }
    if (!user && !password.trim()) { toast.error("Defina uma senha para o novo usuário"); return; }
    onSave({
      id: user?.id,
      name: name.trim(),
      email: email.trim(),
      username: username.trim(),
      password: password || undefined,
      role,
      unit_id: unitId ? Number(unitId) : undefined,
      isActive,
      expiration_date: expirationDate,
    });
  };

  const handleResetPassword = () => {
    if (user?.id && onResetPassword) {
      onResetPassword(user.id, email);
    } else {
      toast.info("Funcionalidade de reset de senha em breve");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {user ? "Editar Usuário" : "Novo Usuário"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Dados básicos */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Nome Completo</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className="mt-1"
                placeholder="Nome completo"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="mt-1"
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Usuário (login)</Label>
              <Input
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="mt-1 font-mono text-sm"
                placeholder="login"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">
                {user ? "Nova Senha (opcional)" : "Senha"}
              </Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="mt-1"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Perfil, Unidade, Expiração, Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Perfil</Label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as Role)}
                className="mt-1 w-full h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground"
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium">Unidade</Label>
              <select
                value={unitId}
                onChange={e => setUnitId(e.target.value)}
                className="mt-1 w-full h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground"
              >
                <option value="">— Sem unidade —</option>
                {units.map(u => (
                  <option key={u.id} value={String(u.id)}>
                    {u.name}{!u.isActive ? " (inativa)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium">Data de Expiração</Label>
              <Input
                type="date"
                value={expirationDate}
                onChange={e => setExpirationDate(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-0.5">Deixe em branco para não expirar</p>
            </div>
            <div className="flex items-end gap-3 pb-1">
              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <div>
                  <span className="text-sm font-medium">{isActive ? "Ativo" : "Inativo"}</span>
                  <p className="text-xs text-muted-foreground">{isActive ? "Acesso permitido" : "Acesso bloqueado"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Resumo do perfil selecionado */}
          <div className="bg-muted/40 rounded-lg px-4 py-3 border border-border">
            <p className="text-xs text-muted-foreground mb-1.5">Perfil selecionado</p>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-xs ${
                  role === "admin_master" ? "border-red-200 text-red-700 bg-red-50" :
                  role === "unit_admin" ? "border-orange-200 text-orange-700 bg-orange-50" :
                  role === "medico" ? "border-blue-200 text-blue-700 bg-blue-50" :
                  role === "viewer" ? "border-gray-200 text-gray-600 bg-gray-50" :
                  "border-purple-200 text-purple-700 bg-purple-50"
                }`}
              >
                {ROLES.find(r => r.value === role)?.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {role === "admin_master" && "Acesso total ao sistema, todas as unidades"}
                {role === "unit_admin" && "Gerencia usuários e configurações da unidade"}
                {role === "medico" && "Visualiza exames e emite laudos"}
                {role === "viewer" && "Somente visualização de exames"}
                {role === "operador" && "Operação de worklist e envio de exames"}
              </span>
            </div>
          </div>

          {/* Botão reset senha */}
          {user && (
            <div className="border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetPassword}
                className="gap-1.5 text-xs"
                type="button"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Resetar Senha
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                Define uma nova senha temporária para o usuário
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Salvando..." : user ? "Salvar Alterações" : "Criar Usuário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
