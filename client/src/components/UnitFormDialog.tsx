import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

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
      } else {
        setName(""); setSlug(""); setAddress(""); setEquipmentInfo("");
        setPacsIp(""); setPacsPort("11112"); setPacsAeTitle(""); setPacsLocalAeTitle("LAUDS");
        setIsActive(true);
      }
    }
  }, [open, unit]);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!unit) {
      setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    }
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error("Informe o nome da unidade"); return; }
    if (!pacsIp.trim()) { toast.error("Informe o IP do PACS"); return; }
    const port = parseInt(pacsPort);
    if (isNaN(port) || port < 1 || port > 65535) { toast.error("Porta PACS inválida"); return; }
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
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Salvando..." : unit ? "Salvar Alterações" : "Criar Unidade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
