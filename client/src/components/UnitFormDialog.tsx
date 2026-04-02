import { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, Building2, Trash2, ImageOff } from "lucide-react";
import { trpc } from "@/lib/trpc";

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

export default function UnitFormDialog({
  open, onOpenChange, unit, onSave, loading = false,
}: UnitFormDialogProps) {
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

  const utils = trpc.useUtils();

  const updateLogo = trpc.medicalData.updateUnitLogo.useMutation({
    onSuccess: () => {
      toast.success("Logo da unidade atualizado com sucesso");
      setLogoFile(null);
      utils.medicalData.getReportContext.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar logo"),
  });

  const removeLogo = trpc.medicalData.removeLogo.useMutation({
    onSuccess: () => {
      toast.success("Logo removido com sucesso");
      setLogoPreview(null);
      setLogoFile(null);
      setRemovingLogo(false);
      utils.medicalData.getReportContext.invalidate();
    },
    onError: (e) => {
      toast.error(e.message || "Erro ao remover logo");
      setRemovingLogo(false);
    },
  });

  useEffect(() => {
    if (open) {
      if (unit) {
        setName(unit.name);
        setSlug(unit.slug);
        setAddress(unit.address || "");
        setEquipmentInfo(unit.equipment_info || "");
        setPacsIp(unit.pacs_ip || "");
        setPacsPort(String(unit.pacs_port || 11112));
        setPacsAeTitle(unit.pacs_ae_title || "");
        setPacsLocalAeTitle(unit.pacs_local_ae_title || "LAUDS");
        setIsActive(unit.isActive);
        setLogoPreview(unit.logo_url || null);
        setLogoFile(null);
        setRemovingLogo(false);
      } else {
        setName(""); setSlug(""); setAddress(""); setEquipmentInfo("");
        setPacsIp(""); setPacsPort("11112"); setPacsAeTitle(""); setPacsLocalAeTitle("LAUDS");
        setIsActive(true);
        setLogoPreview(null); setLogoFile(null); setRemovingLogo(false);
      }
    }
  }, [open, unit]);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!unit) {
      setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const d = reader.result as string;
      setLogoFile(d);
      setLogoPreview(d);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveLogo = () => {
    if (!unit?.id) return;
    if (!confirm("Remover o logo desta unidade? Esta ação não pode ser desfeita.")) return;
    setRemovingLogo(true);
    removeLogo.mutate({ unitId: unit.id });
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error("Informe o nome da unidade"); return; }
    if (!pacsIp.trim()) { toast.error("Informe o IP do PACS"); return; }
    const port = parseInt(pacsPort);
    if (isNaN(port) || port < 1 || port > 65535) { toast.error("Porta PACS inválida"); return; }
    // Upload do logo se houver novo arquivo
    if (unit?.id && logoFile) {
      updateLogo.mutate({ unitId: unit.id, logoFile });
    }
    onSave({
      id: unit?.id,
      name: name.trim(),
      slug: slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      address: address.trim(),
      equipment_info: equipmentInfo.trim(),
      pacs_ip: pacsIp.trim(),
      pacs_port: port,
      pacs_ae_title: pacsAeTitle.trim(),
      pacs_local_ae_title: pacsLocalAeTitle.trim() || "LAUDS",
      isActive,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {unit ? "Editar Unidade" : "Nova Unidade"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nome e Slug */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Nome da Unidade</Label>
              <Input
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                className="mt-1"
                placeholder="Ex: Clínica Central"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">
                Slug / ID
                <span className="text-xs text-muted-foreground ml-1">(gerado automaticamente)</span>
              </Label>
              <Input
                value={slug}
                onChange={e => setSlug(e.target.value)}
                className="mt-1 font-mono text-sm"
                placeholder="clinica-central"
              />
            </div>
          </div>

          {/* Endereço */}
          <div>
            <Label className="text-sm font-medium">Endereço</Label>
            <Input
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="mt-1"
              placeholder="Rua, número — Bairro, Cidade"
            />
          </div>

          {/* Equipamentos */}
          <div>
            <Label className="text-sm font-medium">Informações do Equipamento</Label>
            <Textarea
              value={equipmentInfo}
              onChange={e => setEquipmentInfo(e.target.value)}
              className="mt-1 min-h-[60px] resize-none"
              placeholder="Ex: Raio-X CR Agfa, Tomógrafo Siemens 64 canais..."
            />
          </div>

          {/* Configuração PACS */}
          <div className="border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground mb-3">Configuração PACS / DICOM</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">IP do PACS</Label>
                <Input
                  value={pacsIp}
                  onChange={e => setPacsIp(e.target.value)}
                  className="mt-1 font-mono text-sm"
                  placeholder="192.168.1.100"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Porta</Label>
                <Input
                  value={pacsPort}
                  onChange={e => setPacsPort(e.target.value)}
                  className="mt-1 font-mono text-sm"
                  placeholder="11112"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">AE Title (remoto)</Label>
                <Input
                  value={pacsAeTitle}
                  onChange={e => setPacsAeTitle(e.target.value)}
                  className="mt-1 font-mono text-sm"
                  placeholder="PACSML"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">AE Title (local)</Label>
                <Input
                  value={pacsLocalAeTitle}
                  onChange={e => setPacsLocalAeTitle(e.target.value)}
                  className="mt-1 font-mono text-sm"
                  placeholder="LAUDS"
                />
              </div>
            </div>
          </div>

          {/* Logo da Unidade */}
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-amber-600" />
              <Label className="text-sm font-semibold">Logo da Unidade</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Aparece no cabeçalho do laudo. Recomendado: PNG com fundo branco, máx. 2 MB.
            </p>

            {/* Preview atual */}
            {logoPreview ? (
              <div className="flex items-start gap-3">
                <img
                  src={logoPreview}
                  alt="Logo da unidade"
                  className="h-20 max-w-[180px] object-contain border border-gray-200 rounded p-2 bg-white"
                />
                <div className="flex flex-col gap-2 mt-1">
                  {/* Trocar logo */}
                  <label className="flex items-center gap-1.5 cursor-pointer px-3 py-1.5 text-xs border border-dashed border-gray-300 rounded hover:bg-gray-50 transition-colors">
                    <Upload className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-gray-600">Trocar logo</span>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoChange}
                    />
                  </label>
                  {/* Remover logo (apenas ao editar unidade existente) */}
                  {unit?.id && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      disabled={removingLogo || removeLogo.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {removingLogo ? (
                        <span className="animate-spin h-3.5 w-3.5 border-2 border-red-400 border-t-transparent rounded-full" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Remover logo
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer px-3 py-3 border border-dashed border-gray-300 rounded hover:bg-gray-50 transition-colors">
                <ImageOff className="h-5 w-5 text-gray-300" />
                <div>
                  <p className="text-sm text-gray-600">Nenhum logo cadastrado</p>
                  <p className="text-xs text-gray-400">Clique para fazer upload</p>
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </label>
            )}

            {/* Indicador de novo logo pendente de salvar */}
            {logoFile && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <Upload className="h-3 w-3" />
                Novo logo será salvo ao clicar em "Salvar Alterações"
              </p>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <div>
              <span className="text-sm font-medium">{isActive ? "Unidade Ativa" : "Unidade Desativada"}</span>
              <p className="text-xs text-muted-foreground">
                {isActive ? "Novos exames podem ser recebidos" : "Unidade bloqueada para novos exames"}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || updateLogo.isPending}>
            {loading || updateLogo.isPending ? "Salvando..." : unit ? "Salvar Alterações" : "Criar Unidade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
