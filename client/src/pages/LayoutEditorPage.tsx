import { useState, useCallback, useReducer, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Reorder } from "framer-motion";
import {
  ArrowLeft, Save, Eye, EyeOff, RotateCcw, Upload, Loader2,
  FileText, Settings, Image as ImageIcon, Palette, GripVertical,
  Type, Ruler, Droplets, LayoutTemplate, Heading, Footprints,
  Building2, RotateCcw as UndoIcon, RotateCw as RedoIcon,
  Download, FolderOpen, Check, AlignLeft, AlignCenter, AlignRight,
} from "lucide-react";
import ReportDocument from "@/components/ReportDocument";
import { DEFAULT_LAYOUT_PREFERENCES, type LayoutPreferences } from "@/../../shared/types";

// ─── Tipos de dados do layout ─────────────────────────────────────────────────
interface LayoutData {
  preferences: LayoutPreferences;
  header_html: string | null;
  footer_html: string | null;
}

// ─── Temas de cor pré-configurados (Aprimoramento 1) ─────────────────────────
interface ColorTheme {
  id: string;
  name: string;
  headerBorderColor: string;
  headerTextColor: string;
  accentBgColor: string;
  accentBorderColor: string;
}

const COLOR_THEMES: ColorTheme[] = [
  { id: "hospitalar", name: "Hospitalar", headerBorderColor: "#1e40af", headerTextColor: "#1e3a5f", accentBgColor: "#eff6ff", accentBorderColor: "#bfdbfe" },
  { id: "clinica",    name: "Clínica",    headerBorderColor: "#0f6e56", headerTextColor: "#085041", accentBgColor: "#e1f5ee", accentBorderColor: "#9fe1cb" },
  { id: "elegante",   name: "Elegante",   headerBorderColor: "#534ab7", headerTextColor: "#26215c", accentBgColor: "#eeedfe", accentBorderColor: "#afa9ec" },
  { id: "sobrio",     name: "Sóbrio",     headerBorderColor: "#5f5e5a", headerTextColor: "#2c2c2a", accentBgColor: "#f1efe8", accentBorderColor: "#b4b2a9" },
  { id: "quente",     name: "Quente",     headerBorderColor: "#993c1d", headerTextColor: "#4a1b0c", accentBgColor: "#faece7", accentBorderColor: "#f0997b" },
];

// ─── Reordenação de blocos (Aprimoramento 2) ──────────────────────────────────
type BlockId = "header_unit" | "header_custom" | "patient_data" | "report_body" | "signature" | "footer_custom";

const DEFAULT_BLOCK_ORDER: BlockId[] = [
  "header_unit", "header_custom", "patient_data", "report_body", "signature", "footer_custom",
];

const FIXED_BLOCKS: BlockId[] = ["header_unit", "report_body"];

const BLOCK_LABELS: Record<BlockId, { label: string; icon: React.ReactNode }> = {
  header_unit:   { label: "Cabeçalho (logo + unidade)",     icon: <Building2 size={13} /> },
  header_custom: { label: "Cabeçalho personalizado (HTML)", icon: <Heading size={13} /> },
  patient_data:  { label: "Dados do paciente",              icon: <FileText size={13} /> },
  report_body:   { label: "Corpo do laudo",                 icon: <LayoutTemplate size={13} /> },
  signature:     { label: "Assinatura + carimbo",           icon: <Check size={13} /> },
  footer_custom: { label: "Rodapé personalizado (HTML)",    icon: <Footprints size={13} /> },
};

// ─── Undo/Redo com useReducer (Aprimoramento 6) ───────────────────────────────
const MAX_HISTORY = 50;

interface HistoryState {
  past: LayoutData[];
  present: LayoutData;
  future: LayoutData[];
}

type HistoryAction =
  | { type: "SET"; payload: LayoutData }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET"; payload: LayoutData };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "SET":
      return { past: [...state.past.slice(-MAX_HISTORY), state.present], present: action.payload, future: [] };
    case "UNDO":
      if (state.past.length === 0) return state;
      return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
    case "REDO":
      if (state.future.length === 0) return state;
      return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
    case "RESET":
      return { past: [], present: action.payload, future: [] };
    default:
      return state;
  }
}

// ─── Editor Rich Text (Aprimoramento 5) ──────────────────────────────────────
function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showCode, setShowCode] = useState(false);
  const [codeValue, setCodeValue] = useState(value);

  // Sincronizar o editor quando o valor externo muda (ex: reset)
  useEffect(() => {
    if (editorRef.current && !showCode) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value ?? "";
      }
    }
  }, [value, showCode]);

  const execCmd = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const handleToggleCode = (checked: boolean) => {
    if (checked) {
      // Entrando no modo código: capturar HTML atual
      setCodeValue(editorRef.current?.innerHTML ?? value);
    } else {
      // Saindo do modo código: aplicar HTML editado
      onChange(codeValue);
      setTimeout(() => {
        if (editorRef.current) editorRef.current.innerHTML = codeValue;
      }, 0);
    }
    setShowCode(checked);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Barra de ferramentas */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-muted/30 border-b border-border flex-wrap">
        <button
          title="Negrito"
          onMouseDown={(e) => { e.preventDefault(); execCmd("bold"); }}
          className="h-6 w-6 rounded flex items-center justify-center text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >B</button>
        <button
          title="Itálico"
          onMouseDown={(e) => { e.preventDefault(); execCmd("italic"); }}
          className="h-6 w-6 rounded flex items-center justify-center text-xs italic text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >I</button>
        <button
          title="Sublinhado"
          onMouseDown={(e) => { e.preventDefault(); execCmd("underline"); }}
          className="h-6 w-6 rounded flex items-center justify-center text-xs underline text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >U</button>
        <Separator orientation="vertical" className="h-4 mx-0.5" />
        <button title="Alinhar esquerda" onMouseDown={(e) => { e.preventDefault(); execCmd("justifyLeft"); }} className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><AlignLeft size={11} /></button>
        <button title="Centralizar" onMouseDown={(e) => { e.preventDefault(); execCmd("justifyCenter"); }} className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><AlignCenter size={11} /></button>
        <button title="Alinhar direita" onMouseDown={(e) => { e.preventDefault(); execCmd("justifyRight"); }} className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><AlignRight size={11} /></button>
        <Separator orientation="vertical" className="h-4 mx-0.5" />
        {/* Cor do texto */}
        <div className="relative h-6 w-6">
          <input
            type="color"
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            onInput={(e) => execCmd("foreColor", (e.target as HTMLInputElement).value)}
            title="Cor do texto"
          />
          <div className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors pointer-events-none">
            <Droplets size={11} />
          </div>
        </div>
        {/* Tamanho da fonte */}
        <select
          className="text-[10px] h-6 border border-border rounded px-1 bg-background text-foreground"
          defaultValue="3"
          onChange={(e) => execCmd("fontSize", e.target.value)}
        >
          <option value="1">8pt</option>
          <option value="2">10pt</option>
          <option value="3">12pt</option>
          <option value="4">14pt</option>
          <option value="5">18pt</option>
        </select>
        <Separator orientation="vertical" className="h-4 mx-0.5" />
        {/* Toggle HTML bruto */}
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer ml-auto">
          <input
            type="checkbox"
            className="h-3 w-3"
            checked={showCode}
            onChange={(e) => handleToggleCode(e.target.checked)}
          />
          HTML
        </label>
      </div>
      {/* Área de edição */}
      {showCode ? (
        <textarea
          className="w-full min-h-[90px] p-2.5 text-[11px] font-mono bg-background text-foreground focus:outline-none resize-y"
          value={codeValue}
          onChange={(e) => setCodeValue(e.target.value)}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: value ?? "" }}
          onInput={() => { if (editorRef.current) onChange(editorRef.current.innerHTML); }}
          className="min-h-[90px] p-2.5 text-sm focus:outline-none"
          style={{ fontFamily: "inherit", fontSize: "12px", lineHeight: "1.6" }}
        />
      )}
    </div>
  );
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────
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

// Seções da sidebar
type Section = "themes" | "blocks" | "typo" | "margins" | "colors" | "structure" | "header" | "footer";

const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "themes",    label: "Temas",       icon: Palette },
  { id: "blocks",    label: "Blocos",      icon: GripVertical },
  { id: "typo",      label: "Tipografia",  icon: Type },
  { id: "margins",   label: "Margens",     icon: Ruler },
  { id: "colors",    label: "Cores",       icon: Droplets },
  { id: "structure", label: "Estrutura",   icon: Settings },
  { id: "header",    label: "Cabeçalho",   icon: Heading },
  { id: "footer",    label: "Rodapé",      icon: Footprints },
];

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function LayoutEditorPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ unitId: string }>();
  const unitId = parseInt(params.unitId || "0", 10);
  const { user } = useAuth();

  const isAllowed = user?.role === "admin_master" || user?.role === "unit_admin";

  const { data: units } = trpc.units.list.useQuery(undefined, { enabled: isAllowed });
  const unit = units?.find((u: { id: number; name: string; logo_url?: string | null }) => u.id === unitId);

  const { data: layout, refetch } = trpc.layouts.getByUnit.useQuery(
    { unitId },
    { enabled: isAllowed && unitId > 0 }
  );

  // ── Estado inicial ──────────────────────────────────────────────────────────
  const initialData: LayoutData = {
    preferences: DEFAULT_LAYOUT_PREFERENCES,
    header_html: null,
    footer_html: null,
  };

  // ── Undo/Redo (Aprimoramento 6) ─────────────────────────────────────────────
  const [historyState, dispatch] = useReducer(historyReducer, {
    past: [], present: initialData, future: [],
  });

  const data = historyState.present;
  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;

  const setData = useCallback((next: LayoutData) => dispatch({ type: "SET", payload: next }), []);
  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);

  // Helpers para atualizar preferências e HTML
  const updatePref = useCallback(<K extends keyof LayoutPreferences>(key: K, value: LayoutPreferences[K]) => {
    setData({ ...data, preferences: { ...data.preferences, [key]: value } });
  }, [data, setData]);

  const setHeaderHtml = useCallback((html: string) => setData({ ...data, header_html: html || null }), [data, setData]);
  const setFooterHtml = useCallback((html: string) => setData({ ...data, footer_html: html || null }), [data, setData]);

  // ── Reordenação de blocos ───────────────────────────────────────────────────
  const [blockOrder, setBlockOrder] = useState<BlockId[]>(DEFAULT_BLOCK_ORDER);

  // ── Indicador dirty (Aprimoramento 7) ──────────────────────────────────────
  const [savedData, setSavedData] = useState<LayoutData>(initialData);
  const isDirty = JSON.stringify(data) !== JSON.stringify(savedData);

  // ── Modo comparação (Aprimoramento 9) ──────────────────────────────────────
  const [previewMode, setPreviewMode] = useState<"current" | "saved">("current");

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showPreview, setShowPreview] = useState(true);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("themes");
  const [initialized, setInitialized] = useState(false);

  // Sincronizar com dados do servidor
  if (layout && !initialized) {
    const serverData: LayoutData = {
      preferences: (layout.preferences as LayoutPreferences) ?? DEFAULT_LAYOUT_PREFERENCES,
      header_html: layout.header_html ?? null,
      footer_html: layout.footer_html ?? null,
    };
    dispatch({ type: "RESET", payload: serverData });
    setSavedData(serverData);
    setInitialized(true);
  }

  // ── Atalhos de teclado Ctrl+Z / Ctrl+Y (Aprimoramento 6) ───────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  // ── Aviso de alterações não salvas ao fechar aba (Aprimoramento 7) ──────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const upsertMutation = trpc.layouts.upsert.useMutation({
    onSuccess: () => {
      toast.success("Layout salvo com sucesso!");
      setSavedData(data);
      refetch();
    },
    onError: (e) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo deve ter no máximo 2MB"); return; }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    upsertMutation.mutate({
      unitId,
      headerHtml: data.header_html,
      footerHtml: data.footer_html,
      preferences: data.preferences,
    });
  };

  const handleReset = () => {
    const fresh: LayoutData = { preferences: { ...DEFAULT_LAYOUT_PREFERENCES }, header_html: null, footer_html: null };
    dispatch({ type: "RESET", payload: fresh });
    setBlockOrder(DEFAULT_BLOCK_ORDER);
    setLogoPreview(null);
    setLogoFile(null);
    setInitialized(false);
    toast.info("Preferências resetadas para o padrão");
  };

  // ── Export / Import JSON (Aprimoramento 8) ──────────────────────────────────
  const handleExport = () => {
    const exportPayload = { ...data, blockOrder };
    const json = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `layout-${(unit?.name ?? `unit-${unitId}`).replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Layout exportado como JSON");
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target?.result as string);
          if (parsed.preferences && typeof parsed.preferences === "object") {
            setData({
              preferences: { ...DEFAULT_LAYOUT_PREFERENCES, ...parsed.preferences },
              header_html: parsed.header_html ?? null,
              footer_html: parsed.footer_html ?? null,
            });
            if (Array.isArray(parsed.blockOrder)) setBlockOrder(parsed.blockOrder);
            toast.success("Layout importado com sucesso");
          } else {
            toast.error("Arquivo JSON inválido — verifique o formato");
          }
        } catch {
          toast.error("Erro ao ler o arquivo JSON");
        }
      };
      reader.readAsText(file);
    };
    input.click();
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
  const previewPrefs = previewMode === "current" ? data.preferences : savedData.preferences;
  const previewHeader = previewMode === "current" ? data.header_html : savedData.header_html;
  const previewFooter = previewMode === "current" ? data.footer_html : savedData.footer_html;
  const p = data.preferences;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="border-b border-border bg-card px-4 py-2.5 flex items-center justify-between gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h1 className="text-sm font-semibold">Editor de Layout de Laudos</h1>
            <p className="text-xs text-muted-foreground">{unit?.name ?? `Unidade #${unitId}`}</p>
          </div>
          {/* Indicador dirty (Aprimoramento 7) */}
          {isDirty && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-600">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Alterações não salvas
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Undo/Redo (Aprimoramento 6) */}
          <Button variant="ghost" size="sm" disabled={!canUndo} onClick={undo} title="Desfazer (Ctrl+Z)">
            <UndoIcon className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" disabled={!canRedo} onClick={redo} title="Refazer (Ctrl+Y)">
            <RedoIcon className="h-3.5 w-3.5" />
          </Button>
          <Separator orientation="vertical" className="h-5 mx-1" />
          {/* Modo comparação (Aprimoramento 9) */}
          <div className="flex border border-border rounded-md overflow-hidden text-[11px]">
            <button
              className={`px-2.5 py-1 transition-colors ${previewMode === "current" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setPreviewMode("current")}
            >Editado</button>
            <button
              className={`px-2.5 py-1 transition-colors ${previewMode === "saved" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setPreviewMode("saved")}
            >Salvo</button>
          </div>
          <Separator orientation="vertical" className="h-5 mx-1" />
          {/* Export / Import (Aprimoramento 8) */}
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Exportar
          </Button>
          <Button variant="outline" size="sm" onClick={handleImport} className="gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" />
            Importar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPreview(v => !v)} className="gap-1.5">
            {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPreview ? "Ocultar" : "Preview"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar Layout
          </Button>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar de navegação ─────────────────────────────────────────── */}
        <nav className="w-44 shrink-0 border-r border-border bg-muted/20 overflow-y-auto p-2 space-y-0.5">
          {/* Logo da unidade — sempre visível no topo */}
          <div className="px-2 py-3 border-b border-border mb-2">
            <div className="flex flex-col items-center gap-2">
              {effectiveLogoUrl ? (
                <img src={effectiveLogoUrl} alt="Logo" className="max-h-12 max-w-full object-contain rounded border border-border p-1" />
              ) : (
                <div className="h-10 w-full flex items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground">
                  Sem logo
                </div>
              )}
              <label className="w-full cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                <Button variant="outline" size="sm" className="w-full gap-1 pointer-events-none text-[11px] h-7">
                  <Upload className="h-3 w-3" />
                  {effectiveLogoUrl ? "Trocar" : "Enviar logo"}
                </Button>
              </label>
            </div>
          </div>

          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs transition-colors
                ${activeSection === s.id
                  ? "bg-background text-foreground font-medium border border-border shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                }`}
            >
              <s.icon className="h-3.5 w-3.5 shrink-0" />
              {s.label}
              {s.id === "blocks" && (
                <Badge variant="secondary" className="ml-auto text-[9px] px-1 py-0">novo</Badge>
              )}
            </button>
          ))}

          {/* Mini resumo config */}
          <div className="mt-4 pt-3 border-t border-border px-1">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-2">Config atual</p>
            <div className="grid grid-cols-2 gap-1">
              <div className="bg-background border border-border rounded p-1.5">
                <div className="text-[9px] text-muted-foreground">Fonte</div>
                <div className="text-[11px] font-medium truncate">{p.fontFamily.split(" ")[0]}</div>
              </div>
              <div className="bg-background border border-border rounded p-1.5">
                <div className="text-[9px] text-muted-foreground">Tamanho</div>
                <div className="text-[11px] font-medium">{p.fontSize}pt</div>
              </div>
            </div>
          </div>
        </nav>

        {/* ── Painel central de controles ──────────────────────────────────── */}
        <aside className="w-80 shrink-0 border-r border-border bg-card overflow-y-auto p-4 space-y-5">

          {/* ── SEÇÃO: Temas (Aprimoramento 1) ─────────────────────────────── */}
          {activeSection === "themes" && (
            <div>
              <SectionTitle icon={Palette} title="Temas de cor" />
              <p className="text-xs text-muted-foreground mb-3">
                Selecione um tema para aplicar todas as cores de uma vez.
              </p>
              <div className="grid grid-cols-5 gap-2">
                {COLOR_THEMES.map((theme) => {
                  const isActive = p.headerBorderColor === theme.headerBorderColor && p.accentBgColor === theme.accentBgColor;
                  return (
                    <button
                      key={theme.id}
                      onClick={() => {
                        updatePref("headerBorderColor", theme.headerBorderColor);
                        updatePref("headerTextColor",   theme.headerTextColor);
                        updatePref("accentBgColor",     theme.accentBgColor);
                        updatePref("accentBorderColor", theme.accentBorderColor);
                      }}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-all
                        ${isActive
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border bg-background hover:border-muted-foreground/30"
                        }`}
                    >
                      <div className="flex gap-0.5">
                        <div style={{ width: 10, height: 10, borderRadius: 999, background: theme.headerBorderColor }} />
                        <div style={{ width: 10, height: 10, borderRadius: 999, background: theme.accentBgColor }} />
                        <div style={{ width: 10, height: 10, borderRadius: 999, background: theme.accentBorderColor }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground font-medium leading-tight text-center">{theme.name}</span>
                      {isActive && <Check size={9} className="text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── SEÇÃO: Blocos (Aprimoramento 2) ────────────────────────────── */}
          {activeSection === "blocks" && (
            <div>
              <SectionTitle icon={GripVertical} title="Ordem dos blocos" />
              <p className="text-[11px] text-muted-foreground mb-3">
                Arraste os blocos <span className="text-primary font-medium">móveis</span> para reordenar. Blocos fixos sempre ficam na posição definida.
              </p>
              <Reorder.Group
                axis="y"
                values={blockOrder}
                onReorder={setBlockOrder}
                className="space-y-2"
              >
                {blockOrder.map((blockId) => {
                  const isFixed = FIXED_BLOCKS.includes(blockId);
                  const { label, icon } = BLOCK_LABELS[blockId];
                  return (
                    <Reorder.Item
                      key={blockId}
                      value={blockId}
                      dragListener={!isFixed}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs
                        bg-background transition-colors select-none
                        ${isFixed ? "opacity-50 cursor-default" : "cursor-grab hover:border-primary/30 active:cursor-grabbing"}
                      `}
                    >
                      <GripVertical size={13} className={isFixed ? "text-muted-foreground/30" : "text-muted-foreground"} />
                      <div className="text-muted-foreground/60">{icon}</div>
                      <span className="flex-1 text-foreground">{label}</span>
                      <Badge variant={isFixed ? "secondary" : "outline"} className="text-[9px] px-1.5">
                        {isFixed ? "fixo" : "móvel"}
                      </Badge>
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            </div>
          )}

          {/* ── SEÇÃO: Tipografia (Aprimoramento 3 — preview ao vivo) ──────── */}
          {activeSection === "typo" && (
            <div>
              <SectionTitle icon={Type} title="Tipografia" />
              <div className="grid grid-cols-1 gap-4">
                {/* Controles */}
                <div className="space-y-1">
                  <FieldRow label="Fonte do corpo">
                    <select
                      className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
                      value={p.fontFamily}
                      onChange={(e) => updatePref("fontFamily", e.target.value)}
                    >
                      {["Arial", "Calibri", "Times New Roman", "Georgia", "Helvetica", "Verdana"].map((f) => (
                        <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                      ))}
                    </select>
                  </FieldRow>
                  <FieldRow label="Tamanho do corpo">
                    <div className="flex items-center gap-2">
                      <Slider min={8} max={16} step={1} value={[p.fontSize]} onValueChange={([v]) => updatePref("fontSize", v)} className="flex-1" />
                      <span className="text-xs w-10 text-right">{p.fontSize}pt</span>
                    </div>
                  </FieldRow>
                  <FieldRow label="Espaçamento de linha">
                    <div className="flex items-center gap-2">
                      <Slider min={1} max={2.5} step={0.1} value={[p.lineHeight]} onValueChange={([v]) => updatePref("lineHeight", v)} className="flex-1" />
                      <span className="text-xs w-10 text-right">{p.lineHeight.toFixed(1)}</span>
                    </div>
                  </FieldRow>
                </div>
                {/* Preview tipográfico ao vivo (Aprimoramento 3) */}
                <div
                  className="rounded-lg border bg-muted/20 p-3"
                  style={{ fontFamily: `${p.fontFamily}, sans-serif`, fontSize: `${p.fontSize}pt`, lineHeight: p.lineHeight }}
                >
                  <div className="font-bold mb-1.5" style={{ fontSize: `${p.fontSize + 2}pt` }}>Laudo de Imagem</div>
                  <div style={{ color: "#555", fontSize: `${p.fontSize}pt` }}>
                    O exame demonstra campos pulmonares com expansão simétrica, sem consolidações ou derrame pleural bilateral.
                  </div>
                  <div className="mt-2 font-bold">Conclusão:</div>
                  <div>Exame dentro dos limites da normalidade para a faixa etária.</div>
                </div>
              </div>
            </div>
          )}

          {/* ── SEÇÃO: Margens (Aprimoramento 4 — visualização proporcional) ─ */}
          {activeSection === "margins" && (
            <div>
              <SectionTitle icon={Ruler} title="Margens (mm)" />
              <div className="grid grid-cols-2 gap-2 mb-4">
                {(["marginTop", "marginBottom", "marginLeft", "marginRight"] as const).map((key) => (
                  <div key={key}>
                    <Label className="text-xs text-muted-foreground capitalize">
                      {key.replace("margin", "").toLowerCase()}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      value={p[key]}
                      onChange={(e) => updatePref(key, parseFloat(e.target.value) || 0)}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
              {/* Visualização proporcional (Aprimoramento 4) */}
              <div className="mt-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Proporção da área útil</p>
                <div className="flex justify-center">
                  <div className="relative bg-white border border-dashed border-muted-foreground/30 rounded" style={{ width: 120, height: 170 }}>
                    <div
                      className="absolute border border-primary/40 bg-primary/5 rounded-sm flex items-center justify-center"
                      style={{
                        top:    `${(p.marginTop / 50) * 100}%`,
                        right:  `${(p.marginRight / 50) * 100}%`,
                        bottom: `${(p.marginBottom / 50) * 100}%`,
                        left:   `${(p.marginLeft / 50) * 100}%`,
                      }}
                    >
                      <span className="text-[7px] text-primary/40 font-mono">Área útil</span>
                    </div>
                    <span className="absolute text-[7px] text-muted-foreground/60" style={{ top: "3%", left: "50%", transform: "translateX(-50%)" }}>{p.marginTop}mm</span>
                    <span className="absolute text-[7px] text-muted-foreground/60" style={{ bottom: "3%", left: "50%", transform: "translateX(-50%)" }}>{p.marginBottom}mm</span>
                    <span className="absolute text-[7px] text-muted-foreground/60" style={{ left: "2%", top: "50%", transform: "translateY(-50%) rotate(-90deg)" }}>{p.marginLeft}mm</span>
                    <span className="absolute text-[7px] text-muted-foreground/60" style={{ right: "2%", top: "50%", transform: "translateY(-50%) rotate(90deg)" }}>{p.marginRight}mm</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SEÇÃO: Cores ─────────────────────────────────────────────────── */}
          {activeSection === "colors" && (
            <div>
              <SectionTitle icon={Droplets} title="Cores" />
              <div className="space-y-1">
                <FieldRow label="Borda do cabeçalho">
                  <input type="color" value={p.headerBorderColor} onChange={(e) => updatePref("headerBorderColor", e.target.value)} className="w-full h-8 rounded cursor-pointer border border-border" />
                </FieldRow>
                <FieldRow label="Texto do cabeçalho">
                  <input type="color" value={p.headerTextColor} onChange={(e) => updatePref("headerTextColor", e.target.value)} className="w-full h-8 rounded cursor-pointer border border-border" />
                </FieldRow>
                <FieldRow label="Fundo de destaque">
                  <input type="color" value={p.accentBgColor} onChange={(e) => updatePref("accentBgColor", e.target.value)} className="w-full h-8 rounded cursor-pointer border border-border" />
                </FieldRow>
                <FieldRow label="Borda de destaque">
                  <input type="color" value={p.accentBorderColor} onChange={(e) => updatePref("accentBorderColor", e.target.value)} className="w-full h-8 rounded cursor-pointer border border-border" />
                </FieldRow>
              </div>
            </div>
          )}

          {/* ── SEÇÃO: Estrutura ─────────────────────────────────────────────── */}
          {activeSection === "structure" && (
            <div>
              <SectionTitle icon={Settings} title="Estrutura" />
              <div className="space-y-1">
                <FieldRow label="Mostrar carimbo">
                  <Switch checked={p.showStamp} onCheckedChange={(v) => updatePref("showStamp", v)} />
                </FieldRow>
                <FieldRow label="Mostrar tabela paciente">
                  <Switch checked={p.showPatientTable} onCheckedChange={(v) => updatePref("showPatientTable", v)} />
                </FieldRow>
                <FieldRow label="Mostrar CRM">
                  <Switch checked={p.showCrm} onCheckedChange={(v) => updatePref("showCrm", v)} />
                </FieldRow>
                <FieldRow label="Divisor no cabeçalho">
                  <Switch checked={p.showHeaderDivider} onCheckedChange={(v) => updatePref("showHeaderDivider", v)} />
                </FieldRow>
                <FieldRow label="Tamanho da página">
                  <select
                    className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
                    value={p.pageSize}
                    onChange={(e) => updatePref("pageSize", e.target.value as "A4" | "Letter")}
                  >
                    <option value="A4">A4 (210 × 297mm)</option>
                    <option value="Letter">Letter (216 × 279mm)</option>
                  </select>
                </FieldRow>
                <FieldRow label="Alinhamento do logo">
                  <select
                    className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
                    value={p.logoAlign}
                    onChange={(e) => updatePref("logoAlign", e.target.value as "left" | "center" | "right")}
                  >
                    <option value="left">Esquerda</option>
                    <option value="center">Centro</option>
                    <option value="right">Direita</option>
                  </select>
                </FieldRow>
                <FieldRow label="Altura do logo (px)">
                  <div className="flex items-center gap-2">
                    <Slider min={20} max={120} step={5} value={[p.logoHeight]} onValueChange={([v]) => updatePref("logoHeight", v)} className="flex-1" />
                    <span className="text-xs w-10 text-right">{p.logoHeight}px</span>
                  </div>
                </FieldRow>
                <FieldRow label="Posição da assinatura">
                  <select
                    className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
                    value={p.signaturePosition}
                    onChange={(e) => updatePref("signaturePosition", e.target.value as LayoutPreferences["signaturePosition"])}
                  >
                    <option value="bottom-right">Direita</option>
                    <option value="bottom-center">Centro</option>
                    <option value="bottom-left">Esquerda</option>
                  </select>
                </FieldRow>
              </div>
            </div>
          )}

          {/* ── SEÇÃO: Cabeçalho HTML (Aprimoramento 5 — rich text) ─────────── */}
          {activeSection === "header" && (
            <div>
              <SectionTitle icon={Heading} title="Cabeçalho HTML (opcional)" />
              <RichTextEditor
                value={data.header_html ?? ""}
                onChange={setHeaderHtml}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Aparece antes do conteúdo do laudo. Deixe vazio para usar apenas o logo.
              </p>
            </div>
          )}

          {/* ── SEÇÃO: Rodapé HTML (Aprimoramento 5 — rich text) ────────────── */}
          {activeSection === "footer" && (
            <div>
              <SectionTitle icon={Footprints} title="Rodapé HTML (opcional)" />
              <RichTextEditor
                value={data.footer_html ?? ""}
                onChange={setFooterHtml}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Aparece após a assinatura. Deixe vazio para usar o rodapé legal padrão.
              </p>
            </div>
          )}

        </aside>

        {/* ── Preview do documento ─────────────────────────────────────────── */}
        {showPreview && (
          <main className="flex-1 overflow-y-auto bg-muted/30 p-6 flex justify-center">
            <div className="w-full max-w-[210mm]">
              <p className="text-xs text-muted-foreground text-center mb-3">
                Pré-visualização — tamanho A4
                {previewMode === "saved" && (
                  <span className="ml-2 text-amber-600 font-medium">(versão salva)</span>
                )}
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
                  headerHtml={previewHeader}
                  footerHtml={previewFooter}
                  preferences={previewPrefs}
                />
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
