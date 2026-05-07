import { useState, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Eye, EyeOff, RotateCcw, Upload, Loader2,
  FileText, Settings, Image as ImageIcon,
} from "lucide-react";
import ReportDocument from "@/components/ReportDocument";
import { DEFAULT_LAYOUT_PREFERENCES, type LayoutPreferences } from "@/../../shared/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function SectionTitle({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/40 last:border-0">
      <Label className="text-xs text-muted-foreground w-40 shrink-0">{label}</Label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function LayoutEditorPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ unitId: string }>();
  const unitId = parseInt(params.unitId || "0", 10);
  const { user } = useAuth();

  // Verificar permissão
  const isAllowed = user?.role === "admin_master" || user?.role === "unit_admin";

  // Dados da unidade
  const { data: units } = trpc.units.list.useQuery(undefined, { enabled: isAllowed });
  const unit = units?.find((u: { id: number; name: string; logo_url?: string | null }) => u.id === unitId);

  // Layout atual
  const { data: layout, refetch } = trpc.layouts.getByUnit.useQuery(
    { unitId },
    { enabled: isAllowed && unitId > 0 }
  );

  // Estado local das preferências
  const [prefs, setPrefs] = useState<LayoutPreferences>(DEFAULT_LAYOUT_PREFERENCES);
  const [headerHtml, setHeaderHtml] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // Sincronizar estado com dados do servidor quando carregados
  const [initialized, setInitialized] = useState(false);
  if (layout && !initialized) {
    setPrefs((layout.preferences as LayoutPreferences) ?? DEFAULT_LAYOUT_PREFERENCES);
    setHeaderHtml(layout.header_html ?? "");
    setFooterHtml(layout.footer_html ?? "");
    setInitialized(true);
  }

  // Mutations
  const upsertMutation = trpc.layouts.upsert.useMutation({
    onSuccess: () => {
      toast.success("Layout salvo com sucesso!");
      refetch();
    },
    onError: (e) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  // Handlers
  const updatePref = useCallback(<K extends keyof LayoutPreferences>(key: K, value: LayoutPreferences[K]) => {
    setPrefs(p => ({ ...p, [key]: value }));
  }, []);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo deve ter no máximo 2MB");
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    // Nota: upload de logo é feito via units.update separadamente
    upsertMutation.mutate({
      unitId,
      headerHtml: headerHtml || null,
      footerHtml: footerHtml || null,
      preferences: prefs,
    });
  };

  const handleReset = () => {
    setPrefs(DEFAULT_LAYOUT_PREFERENCES);
    setHeaderHtml("");
    setFooterHtml("");
    setLogoPreview(null);
    setLogoFile(null);
    setInitialized(false);
    toast.info("Preferências resetadas para o padrão");
  };

  if (!isAllowed) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Acesso não autorizado.</p>
      </div>
    );
  }

  const isSaving = upsertMutation.isPending;
  const effectiveLogoUrl = logoPreview ?? unit?.logo_url ?? null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h1 className="text-sm font-semibold">Editor de Layout de Laudos</h1>
            <p className="text-xs text-muted-foreground">{unit?.name ?? `Unidade #${unitId}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(p => !p)}
            className="gap-1.5"
          >
            {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPreview ? "Ocultar preview" : "Mostrar preview"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Resetar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar Layout
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Painel de controles */}
        <aside className="w-80 shrink-0 border-r border-border bg-card overflow-y-auto p-4 space-y-6">

          {/* Logo */}
          <div>
            <SectionTitle icon={ImageIcon} title="Logo da Unidade" />
            <div className="flex flex-col items-center gap-3">
              {effectiveLogoUrl ? (
                <img
                  src={effectiveLogoUrl}
                  alt="Logo"
                  className="max-h-16 max-w-full object-contain rounded border border-border p-1"
                />
              ) : (
                <div className="h-16 w-full flex items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">
                  Sem logo
                </div>
              )}
              <label className="w-full cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                <Button variant="outline" size="sm" className="w-full gap-1.5 pointer-events-none">
                  <Upload className="h-3.5 w-3.5" />
                  {effectiveLogoUrl ? "Trocar logo" : "Enviar logo"}
                </Button>
              </label>
            </div>
          </div>

          {/* Configurações gerais */}
          <div>
            <SectionTitle icon={Settings} title="Configurações Gerais" />
            <div className="space-y-1">
              <FieldRow label="Mostrar carimbo">
                <Switch
                  checked={prefs.showStamp}
                  onCheckedChange={(v) => updatePref("showStamp", v)}
                />
              </FieldRow>
              <FieldRow label="Mostrar tabela paciente">
                <Switch
                  checked={prefs.showPatientTable}
                  onCheckedChange={(v) => updatePref("showPatientTable", v)}
                />
              </FieldRow>
              <FieldRow label="Mostrar CRM">
                <Switch
                  checked={prefs.showCrm}
                  onCheckedChange={(v) => updatePref("showCrm", v)}
                />
              </FieldRow>
              <FieldRow label="Divisor no cabeçalho">
                <Switch
                  checked={prefs.showHeaderDivider}
                  onCheckedChange={(v) => updatePref("showHeaderDivider", v)}
                />
              </FieldRow>
            </div>
          </div>

          {/* Tipografia */}
          <div>
            <SectionTitle icon={FileText} title="Tipografia" />
            <div className="space-y-1">
              <FieldRow label="Fonte do corpo">
                <select
                  className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
                  value={prefs.fontFamily}
                  onChange={(e) => updatePref("fontFamily", e.target.value)}
                >
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Verdana">Verdana</option>
                </select>
              </FieldRow>
              <FieldRow label="Tamanho do corpo">
                <div className="flex items-center gap-2">
                  <Slider
                    min={8}
                    max={16}
                    step={1}
                    value={[prefs.fontSize]}
                    onValueChange={([v]) => updatePref("fontSize", v)}
                    className="flex-1"
                  />
                  <span className="text-xs w-10 text-right">{prefs.fontSize}pt</span>
                </div>
              </FieldRow>
              <FieldRow label="Espaçamento de linha">
                <div className="flex items-center gap-2">
                  <Slider
                    min={1}
                    max={2.5}
                    step={0.1}
                    value={[prefs.lineHeight]}
                    onValueChange={([v]) => updatePref("lineHeight", v)}
                    className="flex-1"
                  />
                  <span className="text-xs w-10 text-right">{prefs.lineHeight.toFixed(1)}</span>
                </div>
              </FieldRow>
            </div>
          </div>

          {/* Margens */}
          <div>
            <SectionTitle icon={Settings} title="Margens (mm)" />
            <div className="grid grid-cols-2 gap-2">
              {(["marginTop", "marginBottom", "marginLeft", "marginRight"] as const).map((key) => (
                <div key={key}>
                  <Label className="text-xs text-muted-foreground capitalize">
                    {key.replace("margin", "").toLowerCase()}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={prefs[key]}
                    onChange={(e) => updatePref(key, parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs mt-0.5"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Cabeçalho HTML customizado */}
          <div>
            <SectionTitle icon={FileText} title="Cabeçalho HTML (opcional)" />
            <Textarea
              value={headerHtml}
              onChange={(e) => setHeaderHtml(e.target.value)}
              placeholder="<div style='text-align:center'>Texto do cabeçalho</div>"
              rows={4}
              className="text-xs font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Aparece antes do conteúdo do laudo. Deixe vazio para usar apenas o logo.
            </p>
          </div>

          {/* Rodapé HTML customizado */}
          <div>
            <SectionTitle icon={FileText} title="Rodapé HTML (opcional)" />
            <Textarea
              value={footerHtml}
              onChange={(e) => setFooterHtml(e.target.value)}
              placeholder="<div style='text-align:center'>Texto do rodapé</div>"
              rows={4}
              className="text-xs font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Aparece após a assinatura. Deixe vazio para usar o rodapé legal padrão.
            </p>
          </div>

        </aside>

        {/* Preview do documento */}
        {showPreview && (
          <main className="flex-1 overflow-y-auto bg-muted/30 p-6 flex justify-center">
            <div className="w-full max-w-[210mm]">
              <p className="text-xs text-muted-foreground text-center mb-3">
                Pré-visualização — tamanho A4
              </p>
              <div className="shadow-lg">
                <ReportDocument
                  patientName="PACIENTE EXEMPLO DA SILVA"
                  studyDate="07/05/2026"
                  examTitle="TOMOGRAFIA COMPUTADORIZADA DE CRÂNIO SEM CONTRASTE"
                  doctorName="DR. MÉDICO EXEMPLO"
                  crm="CRM/CE 12345"
                  signatureUrl={null}
                  stampUrl={null}
                  unitLogoUrl={effectiveLogoUrl}
                  headerHtml={headerHtml || null}
                  footerHtml={footerHtml || null}
                  preferences={prefs}
                />
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
