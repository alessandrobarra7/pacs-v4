/**
 * LayoutEditorPage — Editor de Layout de Laudos por Unidade
 *
 * Funcionalidades:
 *  1. Até 3 logos com upload independente e redimensionamento (largura/altura)
 *  2. Upload de imagem de fundo (timbre da clínica)
 *  3. Upload de imagem de rodapé (onda, assinatura, etc.)
 *  4. Drag-and-drop de blocos: logo, título, corpo, rodapé
 *  5. Salvar tudo no banco via trpc.layouts.upsert
 */
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { ClinicalPatientDetails, ClinicalPatientName } from "../components/ClinicalPatientDetails";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SharedReportSheet } from "@/components/SharedReportSheet";
import { toast } from "sonner";
import { DEFAULT_LAYOUT_PREFERENCES, type LayoutPreferences } from "../../../shared/types";
import { pageHeightMm, pageWidthMm } from "@/lib/pdfPageGeometry";
import { getAreaUtilWrapperStyle, getCanvasOuterStyle, pointerDeltaToPercent } from "@/lib/layoutEditorAreaUtil";
import {
  ArrowLeft, Save, RotateCcw, Upload, Image as ImageIcon,
  Move, Eye, EyeOff, Loader2, X, Plus,
  CheckCircle2, FileText, Layers3, ShieldCheck, ZoomIn, ZoomOut, Focus, Settings2, Palette,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type LogoBlockId = "logo1" | "logo2" | "logo3";
type StaticBlockId = "patientName" | "patientInfo" | "title" | "body" | "footer";
type BlockId = LogoBlockId | StaticBlockId;

interface BlockPosition {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

type BlockPositions = Record<BlockId, BlockPosition>;

interface LogoSlot {
  url: string;       // URL S3 persistida
  preview: string;   // URL local (createObjectURL) ou S3
  file: File | null; // arquivo pendente de upload
  width: number;     // largura em px no laudo
  height: number;    // altura em px no laudo
  label: string;     // rótulo (ex: "Logo 1")
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const LOGO_BLOCK_IDS: LogoBlockId[] = ["logo1", "logo2", "logo3"];
const STATIC_BLOCK_IDS: StaticBlockId[] = ["patientName", "patientInfo", "title", "body", "footer"];
const BLOCK_IDS: BlockId[] = [...LOGO_BLOCK_IDS, ...STATIC_BLOCK_IDS];

const logoBlockIndex = (block: BlockId): number => LOGO_BLOCK_IDS.indexOf(block as LogoBlockId);

const DEFAULT_POSITIONS: BlockPositions = {
  logo1:       { x: 2,  y: 2,  w: 26, h: 11, visible: true },
  logo2:       { x: 37, y: 2,  w: 26, h: 11, visible: true },
  logo3:       { x: 72, y: 2,  w: 26, h: 11, visible: true },
  patientInfo: { x: 2,  y: 15, w: 96, h: 9,  visible: true },
  patientName: { x: 2,  y: 25, w: 96, h: 5,  visible: true },
  title:       { x: 2,  y: 31, w: 96, h: 6,  visible: true },
  body:        { x: 2,  y: 38, w: 96, h: 48, visible: true },
  footer:      { x: 2,  y: 88, w: 96, h: 9,  visible: true },
};

const BLOCK_LABELS: Record<BlockId, { label: string; color: string; preview: string }> = {
  logo1:       { label: "Logo 1", color: "#3b82f6", preview: "logo" },
  logo2:       { label: "Logo 2", color: "#2563eb", preview: "logo" },
  logo3:       { label: "Logo 3", color: "#1d4ed8", preview: "logo" },
  patientName: { label: "Nome do Paciente", color: "#0ea5e9", preview: "PACIENTE DE EXEMPLO" },
  patientInfo: { label: "Dados do Paciente", color: "#64748b", preview: "Realizado em, data de nascimento e sexo" },
  title:       { label: "Título do Exame", color: "#8b5cf6", preview: "RADIOGRAFIA DE TÓRAX PA E PERFIL" },
  body:        { label: "Corpo do Laudo", color: "#10b981", preview: "Resultado do exame aqui..." },
  footer:      { label: "Rodapé / Carimbo", color: "#f59e0b", preview: "Dr. Nome do Médico - CRM 12345" },
};

const EMPTY_LOGO = (): LogoSlot => ({
  url: "", preview: "", file: null, width: 120, height: 60, label: "",
});

const REAL_PREVIEW_SAMPLE = {
  patientName: "PACIENTE DE EXEMPLO",
  examTitle: "RADIOGRAFIA DE TORAX PA E PERFIL",
  birthDate: "29/01/2024",
  date: "27/07/2026",
  sex: "Masculino",
  responsibleDoctor: "Dr. Nome do Medico - CRM 12345",
  bodyTitle: "LAUDO RADIOLOGICO",
  body: [
    "Tecnica: exame realizado conforme protocolo da unidade.",
    "Achados: estruturas avaliadas sem alteracoes significativas no exemplo de visualizacao.",
    "Conclusao: modelo demonstrativo para conferencia de posicionamento, timbre, logos e rodape.",
  ],
};
type WizardStepId = "format" | "identity" | "position" | "review";

const WIZARD_STEPS: Array<{ id: WizardStepId; label: string; short: string; description: string }> = [
  { id: "format", label: "Formato e papel", short: "Papel", description: "Tamanho físico, margens e tipografia usados pelo motor final." },
  { id: "identity", label: "Identidade visual", short: "Identidade", description: "Logos, fundo, rodapé e cores consumidos pela folha compartilhada." },
  { id: "position", label: "Posicionamento", short: "Layout", description: "Blocos oficiais x/y/w/h/visible, sempre relativos à área útil." },
  { id: "review", label: "Validar e salvar", short: "Revisão", description: "Checklist do contrato canônico antes de persistir a configuração." },
];

const MARGIN_PRESETS: Record<string, Pick<LayoutPreferences, "marginTop" | "marginRight" | "marginBottom" | "marginLeft">> = {
  "Padrão clínico": { marginTop: 20, marginRight: 25, marginBottom: 25, marginLeft: 25 },
  Compacto: { marginTop: 12, marginRight: 14, marginBottom: 14, marginLeft: 14 },
  Amplo: { marginTop: 28, marginRight: 28, marginBottom: 28, marginLeft: 28 },
};

const POSITION_PRESETS: Record<string, BlockPositions> = {
  Clássico: DEFAULT_POSITIONS,
  Bilateral: {
    ...DEFAULT_POSITIONS,
    logo1: { ...DEFAULT_POSITIONS.logo1, x: 2, w: 30, visible: true },
    logo2: { ...DEFAULT_POSITIONS.logo2, x: 68, w: 30, visible: true },
    logo3: { ...DEFAULT_POSITIONS.logo3, visible: false },
  },
  Centralizado: {
    ...DEFAULT_POSITIONS,
    logo1: { ...DEFAULT_POSITIONS.logo1, x: 35, w: 30, visible: true },
    logo2: { ...DEFAULT_POSITIONS.logo2, visible: false },
    logo3: { ...DEFAULT_POSITIONS.logo3, visible: false },
    patientName: { ...DEFAULT_POSITIONS.patientName, x: 8, w: 84, visible: true },
    title: { ...DEFAULT_POSITIONS.title, x: 8, w: 84, visible: true },
  },
  "Pré-timbrado": {
    ...DEFAULT_POSITIONS,
    logo1: { ...DEFAULT_POSITIONS.logo1, visible: false },
    logo2: { ...DEFAULT_POSITIONS.logo2, visible: false },
    logo3: { ...DEFAULT_POSITIONS.logo3, visible: false },
    patientInfo: { ...DEFAULT_POSITIONS.patientInfo, y: 12 },
    patientName: { ...DEFAULT_POSITIONS.patientName, y: 21 },
    title: { ...DEFAULT_POSITIONS.title, y: 28 },
    body: { ...DEFAULT_POSITIONS.body, y: 36, h: 50 },
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function LayoutEditorPage() {
  const [, navigate] = useLocation();
  const { unitId: unitIdParam } = useParams<{ unitId: string }>();
  const unitId = parseInt(unitIdParam || "0", 10);
  const { user } = useAuth();
  const isAdminMaster = user?.role === "admin_master";

  // Blocos drag-and-drop
  const [positions, setPositions] = useState<BlockPositions>(DEFAULT_POSITIONS);
  const [activeBlock, setActiveBlock] = useState<BlockId | null>(null);

  // Imagem de fundo
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgOpacity, setBgOpacity] = useState<number>(1.0);
  const [bgSizeOption, setBgSizeOption] = useState<string>('cover');

  // Imagem de rodapé
  const [footerUrl, setFooterUrl] = useState<string | null>(null);
  const [footerPreview, setFooterPreview] = useState<string | null>(null);
  const [footerFile, setFooterFile] = useState<File | null>(null);

  // Logos (até 3)
  const [logos, setLogos] = useState<LogoSlot[]>([EMPTY_LOGO()]);

  // UI state
  const [isDirty, setIsDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [previewMode, setPreviewMode] = useState<"editor" | "real">("editor");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStepId>("format");
  const [previewZoom, setPreviewZoom] = useState(0.78);
  const [showPayload, setShowPayload] = useState(false);
  // Preferências de página/margens (pageSize + 4 margens) — mesma fonte usada
  // pelo fluxo real de PDF/impressão (layoutData.preferences), para que o
  // canvas do editor deixe de ser uma folha A4 fixa e passe a refletir a
  // folha física realmente entregue (parecer Manus 2026-09-25,
  // "equivalência editor/PDF").
  const [layoutPrefs, setLayoutPrefs] = useState<Partial<LayoutPreferences> | null>(null);
  const effectiveLayoutPrefs: LayoutPreferences = { ...DEFAULT_LAYOUT_PREFERENCES, ...(layoutPrefs ?? {}) };
  const paperWidthMmValue = pageWidthMm(effectiveLayoutPrefs.pageSize);
  const paperHeightMmValue = pageHeightMm(effectiveLayoutPrefs.pageSize);

  const dragging = useRef<{
    block: BlockId;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  // Wrapper interno com a mesma caixa de padding (mm) usada por
  // SharedReportSheet — representa a ÁREA ÚTIL real renderizada na tela,
  // usada para converter movimento de ponteiro em percentuais corretos
  // (Bloqueio C do parecer).
  const usableAreaRef = useRef<HTMLDivElement>(null);

  const { data: unitData } = trpc.units.getById.useQuery({ id: unitId }, { enabled: unitId > 0 });
  const { data: layoutData, refetch: refetchLayout } = trpc.layouts.getByUnit.useQuery(
    { unitId },
    { enabled: unitId > 0 }
  );

  const uploadFileMutation = trpc.storage.uploadFile.useMutation();
  const upsertLayout = trpc.layouts.upsert.useMutation();

  // ── Inicializar a partir do banco ──────────────────────────────────────────
  useEffect(() => {
    if (!layoutData) return;

    if ((layoutData as { preferences?: unknown }).preferences && typeof (layoutData as { preferences?: unknown }).preferences === "object") {
      setLayoutPrefs((layoutData as { preferences?: Partial<LayoutPreferences> }).preferences ?? null);
    }

    if (layoutData.background_image_url) {
      setBgUrl(layoutData.background_image_url);
      setBgPreview(layoutData.background_image_url);
    }
    if ((layoutData as { background_opacity?: string | null }).background_opacity != null) {
      setBgOpacity(Number((layoutData as { background_opacity?: string | null }).background_opacity));
    }
    if ((layoutData as { background_size?: string | null }).background_size) {
      setBgSizeOption((layoutData as { background_size?: string | null }).background_size!);
    }
    if ((layoutData as { footer_image_url?: string | null }).footer_image_url) {
      const fu = (layoutData as { footer_image_url?: string | null }).footer_image_url!;
      setFooterUrl(fu);
      setFooterPreview(fu);
    }
    if ((layoutData as { logos?: unknown }).logos) {
      const saved = (layoutData as { logos?: unknown }).logos as Array<{
        url: string; width: number; height: number; label: string;
      }>;
      if (Array.isArray(saved) && saved.length > 0) {
        setLogos(saved.map(l => ({
          url: l.url, preview: l.url, file: null,
          width: l.width ?? 120, height: l.height ?? 60, label: l.label ?? "",
        })));
      }
    }
    if (layoutData.block_positions && typeof layoutData.block_positions === "object") {
      const saved = layoutData.block_positions as Partial<Record<BlockId | "logo", BlockPosition>>;
      setPositions(prev => {
        const merged = { ...prev };
        const legacyLogo = saved.logo;
        for (const k of LOGO_BLOCK_IDS) {
          const index = logoBlockIndex(k);
          if (saved[k]) {
            merged[k] = { ...prev[k], ...(saved[k] as BlockPosition) };
          } else if (legacyLogo) {
            const legacyW = Math.max(4, Math.min(100, legacyLogo.w));
            const legacyH = Math.max(3, Math.min(100, legacyLogo.h));
            const legacyStep = Math.min(24, legacyW + 4);
            merged[k] = {
              ...prev[k],
              ...legacyLogo,
              w: legacyW,
              h: legacyH,
              x: Math.max(0, Math.min(100 - legacyW, legacyLogo.x + index * legacyStep)),
              y: Math.max(0, Math.min(100 - legacyH, legacyLogo.y)),
            };
          }
        }
        for (const k of STATIC_BLOCK_IDS) {
          if (saved[k]) merged[k] = { ...prev[k], ...(saved[k] as BlockPosition) };
        }
        return merged;
      });
    }
  }, [layoutData]);

  // ── Proteção de acesso ─────────────────────────────────────────────────────
  useEffect(() => {
    if (user && !isAdminMaster) {
      toast.error("Acesso restrito ao administrador root.");
      navigate("/admin");
    }
  }, [user, isAdminMaster, navigate]);

  // ── Handlers: imagem de fundo ──────────────────────────────────────────────
  const handleBgUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem (PNG ou JPG)."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 5 MB."); return; }
    setBgFile(file);
    setBgPreview(URL.createObjectURL(file));
    setIsDirty(true);
  }, []);

  const handleRemoveBg = useCallback(() => {
    setBgFile(null); setBgPreview(null); setBgUrl(null); setIsDirty(true);
  }, []);

  // ── Handlers: imagem de rodapé ─────────────────────────────────────────────
  const handleFooterUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem (PNG ou JPG)."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 5 MB."); return; }
    setFooterFile(file);
    setFooterPreview(URL.createObjectURL(file));
    setIsDirty(true);
  }, []);

  const handleRemoveFooter = useCallback(() => {
    setFooterFile(null); setFooterPreview(null); setFooterUrl(null); setIsDirty(true);
  }, []);

  // ── Handlers: logos ────────────────────────────────────────────────────────
  const handleLogoUpload = useCallback((index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem (PNG ou JPG)."); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error("Logo muito grande. Máximo 3 MB."); return; }
    setLogos(prev => {
      const next = [...prev];
      next[index] = { ...next[index], file, preview: URL.createObjectURL(file) };
      return next;
    });
    setIsDirty(true);
  }, []);

  const handleLogoRemove = useCallback((index: number) => {
    setLogos(prev => {
      const next = [...prev];
      next[index] = { ...next[index], url: "", preview: "", file: null };
      return next;
    });
    setIsDirty(true);
  }, []);

  const handleLogoResize = useCallback((index: number, field: "width" | "height", value: number) => {
    setLogos(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setIsDirty(true);
  }, []);

  const handleLogoLabel = useCallback((index: number, label: string) => {
    setLogos(prev => {
      const next = [...prev];
      next[index] = { ...next[index], label };
      return next;
    });
    setIsDirty(true);
  }, []);

  const addLogoSlot = useCallback(() => {
    if (logos.length >= 3) { toast.info("Máximo de 3 logos permitido."); return; }
    setLogos(prev => [...prev, EMPTY_LOGO()]);
    setIsDirty(true);
  }, [logos.length]);

  const removeLogoSlot = useCallback((index: number) => {
    setLogos(prev => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  }, []);

  // ── Handlers: drag-and-drop (Pointer Events: mouse, caneta e toque) ───────
  const handlePointerDown = useCallback((e: React.PointerEvent, block: BlockId) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const current = positions[block];
    if (!canvas || !current) return;

    setActiveBlock(block);
    dragging.current = {
      block,
      startX: e.clientX,
      startY: e.clientY,
      origX: current.x,
      origY: current.y,
    };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ponteiro pode já ter sido liberado */ }
  }, [positions]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragging.current;
    // Bloqueio C (parecer Manus 2026-09-25): o percentual arrastado deve ser
    // relativo à ÁREA ÚTIL (folha menos margens), não à folha inteira —
    // usableAreaRef é o wrapper com a mesma caixa de padding em mm usada por
    // SharedReportSheet, então seu retângulo real já é a área útil.
    const usable = usableAreaRef.current;
    if (!drag || !usable) return;

    const rect = usable.getBoundingClientRect();
    const dx = pointerDeltaToPercent(e.clientX - drag.startX, rect.width);
    const dy = pointerDeltaToPercent(e.clientY - drag.startY, rect.height);
    const { block, origX, origY } = drag;

    setPositions(prev => {
      const current = prev[block];
      if (!current) return prev;
      const newX = Math.max(0, Math.min(100 - current.w, origX + dx));
      const newY = Math.max(0, Math.min(100 - current.h, origY + dy));
      return { ...prev, [block]: { ...current, x: newX, y: newY } };
    });
    setIsDirty(true);
  }, []);

  const handlePointerUp = useCallback((e?: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (e && canvas?.hasPointerCapture(e.pointerId)) {
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* captura já liberada */ }
    }
    dragging.current = null;
  }, []);

  const toggleVisible = useCallback((block: BlockId) => {
    setPositions(prev => ({ ...prev, [block]: { ...prev[block], visible: !prev[block].visible } }));
    setIsDirty(true);
  }, []);

  const handleBlockMetricChange = useCallback((block: BlockId, field: "x" | "y" | "w" | "h", value: number) => {
    if (!Number.isFinite(value)) return;
    setPositions(prev => {
      const current = prev[block];
      const next = { ...current, [field]: value };
      const nextW = Math.max(4, Math.min(100, next.w));
      const nextH = Math.max(3, Math.min(100, next.h));
      return {
        ...prev,
        [block]: {
          ...next,
          w: nextW,
          h: nextH,
          x: Math.max(0, Math.min(100 - nextW, next.x)),
          y: Math.max(0, Math.min(100 - nextH, next.y)),
        },
      };
    });
    setIsDirty(true);
  }, []);

  const updatePreference = useCallback(<K extends keyof LayoutPreferences>(key: K, value: LayoutPreferences[K]) => {
    setLayoutPrefs(prev => ({ ...(prev ?? {}), [key]: value }));
    setIsDirty(true);
  }, []);

  const applyMarginPreset = useCallback((preset: Pick<LayoutPreferences, "marginTop" | "marginRight" | "marginBottom" | "marginLeft">) => {
    setLayoutPrefs(prev => ({ ...(prev ?? {}), ...preset }));
    setIsDirty(true);
  }, []);

  const applyPositionPreset = useCallback((preset: BlockPositions) => {
    setPositions(JSON.parse(JSON.stringify(preset)) as BlockPositions);
    setActiveBlock("body");
    setIsDirty(true);
  }, []);

  const handleReset = useCallback(() => {
    if (!window.confirm("Resetar todas as posições dos blocos para o padrão de fábrica? Isso altera apenas o estado em tela até salvar.")) return;
    setPositions(DEFAULT_POSITIONS);
    setActiveBlock("body");
    setIsDirty(true);
    toast.info("Posições resetadas para o padrão.");
  }, []);
  // ── Upload helper ──────────────────────────────────────────────────────────
  const uploadImage = useCallback(async (file: File, folder: string, prefix: string): Promise<string> => {
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const result = await uploadFileMutation.mutateAsync({
      fileName: `${prefix}-${unitId}-${Date.now()}.${file.name.split(".").pop()}`,
      base64,
      mimeType: file.type,
      folder,
    });
    return result.url;
  }, [uploadFileMutation, unitId]);

  // ── Salvar ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setIsUploading(true);
    try {
      // 1. Upload de fundo
      let finalBgUrl = bgUrl;
      if (bgFile) {
        finalBgUrl = await uploadImage(bgFile, "layout-backgrounds", "layout-bg");
        setBgUrl(finalBgUrl);
        setBgFile(null);
      }

      // 2. Upload de rodapé
      let finalFooterUrl = footerUrl;
      if (footerFile) {
        finalFooterUrl = await uploadImage(footerFile, "layout-footers", "layout-footer");
        setFooterUrl(finalFooterUrl);
        setFooterFile(null);
      }

      // 3. Upload de logos pendentes
      const finalLogos: Array<{ url: string; width: number; height: number; label: string }> = [];
      const nextLogos = [...logos];
      for (let i = 0; i < nextLogos.length; i++) {
        const slot = nextLogos[i];
        if (slot.file) {
          const url = await uploadImage(slot.file, "layout-logos", `layout-logo${i + 1}`);
          nextLogos[i] = { ...slot, url, preview: url, file: null };
        }
        if (nextLogos[i].url) {
          finalLogos.push({
            url: nextLogos[i].url,
            width: nextLogos[i].width,
            height: nextLogos[i].height,
            label: nextLogos[i].label,
          });
        }
      }
      setLogos(nextLogos);

      // 4. Persistir no banco
      await upsertLayout.mutateAsync({
        unitId,
        backgroundImageUrl: finalBgUrl ?? undefined,
        backgroundOpacity:  bgOpacity,
        backgroundSize:     bgSizeOption as 'cover' | 'contain' | '100% 100%' | '210mm 297mm',
        footerImageUrl:     finalFooterUrl ?? undefined,
        logos:              finalLogos.length > 0 ? finalLogos : undefined,
        blockPositions:     positions as unknown as Record<string, unknown>,
        preferences:        effectiveLayoutPrefs,
      });

      setIsDirty(false);
      toast.success("Layout salvo com sucesso!");
      await refetchLayout();
      // Sincroniza abas abertas: o editor clínico refaz a consulta sem exigir F5.
      try {
        const update = { unitId, savedAt: Date.now() };
        localStorage.setItem("pacs-layout-updated", JSON.stringify(update));
        window.dispatchEvent(new CustomEvent("pacs-layout-updated", { detail: update }));
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel("pacs-layout-updates");
          channel.postMessage(update);
          channel.close();
        }
      } catch {
        // A atualização principal já foi persistida; sincronização entre abas é opcional.
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar layout.");
    } finally {
      setIsSaving(false);
      setIsUploading(false);
    }
  }, [bgFile, bgOpacity, bgSizeOption, bgUrl, footerFile, footerUrl, logos, positions, unitId, uploadImage, upsertLayout, refetchLayout, effectiveLayoutPrefs]);

  const unitName = unitData?.name ?? `Unidade #${unitId}`;
  const activeBlockIds: BlockId[] = [...LOGO_BLOCK_IDS.slice(0, logos.length), ...STATIC_BLOCK_IDS];
  const currentStep = WIZARD_STEPS.find(step => step.id === wizardStep) ?? WIZARD_STEPS[0];
  const currentStepIndex = WIZARD_STEPS.findIndex(step => step.id === wizardStep);

  const overlapPairs = useMemo(() => {
    const visibleBlocks = BLOCK_IDS.filter(block => {
      const pos = positions[block];
      if (!pos?.visible) return false;
      const logoIndex = logoBlockIndex(block);
      return logoIndex < 0 || Boolean(logos[logoIndex]?.preview || logos[logoIndex]?.url);
    });
    const pairs: string[] = [];
    visibleBlocks.forEach((a, index) => {
      visibleBlocks.slice(index + 1).forEach(b => {
        const first = positions[a];
        const second = positions[b];
        const intersects = first.x < second.x + second.w && first.x + first.w > second.x && first.y < second.y + second.h && first.y + first.h > second.y;
        if (intersects) pairs.push(`${BLOCK_LABELS[a].label} + ${BLOCK_LABELS[b].label}`);
      });
    });
    return pairs;
  }, [positions, logos]);

  const canonicalChecks = [
    { label: "Motor único: preview administrativo usa SharedReportSheet", ok: true },
    { label: "Formato físico e margens vêm de LayoutPreferences", ok: Boolean(effectiveLayoutPrefs.pageSize) },
    { label: "Blocos obrigatórios de paciente, título, corpo e rodapé continuam visíveis", ok: positions.patientName.visible && positions.patientInfo.visible && positions.title.visible && positions.body.visible && positions.footer.visible },
    { label: overlapPairs.length ? `${overlapPairs.length} sobreposição(ões) entre blocos visíveis` : "Nenhuma sobreposição entre blocos visíveis", ok: overlapPairs.length === 0 },
    { label: "Todos os blocos estão dentro da área útil", ok: BLOCK_IDS.every(block => positions[block].x >= 0 && positions[block].y >= 0 && positions[block].x + positions[block].w <= 100 && positions[block].y + positions[block].h <= 100) },
  ];

  const canonicalPayload = useMemo(() => ({
    unitId,
    backgroundImageUrl: bgUrl ?? undefined,
    backgroundOpacity: bgOpacity,
    backgroundSize: bgSizeOption,
    footerImageUrl: footerUrl ?? undefined,
    logos: logos.filter(logo => Boolean(logo.url || logo.preview)).map(logo => ({
      url: logo.url || logo.preview,
      width: logo.width,
      height: logo.height,
      label: logo.label,
    })),
    blockPositions: positions,
    preferences: effectiveLayoutPrefs,
  }), [unitId, bgUrl, bgOpacity, bgSizeOption, footerUrl, logos, positions, effectiveLayoutPrefs]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header canônico */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-gray-800 truncate">Configuração oficial da página de laudo — {unitName}</h1>
            <p className="text-xs text-gray-500">Esta tela edita somente o contrato usado por SharedReportSheet, impressão, PACS, PDF e financeiro.</p>
          </div>
          {isDirty && (
            <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              Alterações não salvas
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowPreview(v => !v)}>
            {showPreview ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {showPreview ? "Ocultar preview" : "Mostrar preview"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} title="Restaura somente as posições oficiais x/y/w/h/visible">
            <RotateCcw className="h-4 w-4 mr-1" /> Resetar posições
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || isUploading} className="bg-blue-600 hover:bg-blue-700 text-white">
            {(isSaving || isUploading) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            {isUploading ? "Enviando..." : isSaving ? "Salvando..." : "Salvar Layout"}
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {WIZARD_STEPS.map((step, index) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setWizardStep(step.id)}
              className={`rounded-lg border px-3 py-2 text-left transition ${wizardStep === step.id ? "border-blue-400 bg-blue-50 text-blue-800" : index < currentStepIndex ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide">Etapa {index + 1}</span>
              <span className="block truncate text-xs font-semibold">{step.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Painel oficial do motor único */}
        <aside className="w-[400px] bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="sticky top-0 z-10 bg-white/95 border-b border-gray-100 px-4 py-3 backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600">Etapa {Math.max(0, currentStepIndex) + 1} de {WIZARD_STEPS.length}</p>
            <div className="mt-1 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-gray-900 truncate">{currentStep.label}</h2>
                <p className="text-xs text-gray-500 leading-4">{currentStep.description}</p>
              </div>
              <FileText className="h-5 w-5 text-blue-500 flex-shrink-0" />
            </div>
          </div>

          <div className="p-4 space-y-5">
            {wizardStep === "format" && (
              <>
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5" /> Formato físico</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {(["A4", "Letter"] as const).map(size => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => updatePreference("pageSize", size)}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition ${effectiveLayoutPrefs.pageSize === size ? "border-blue-400 bg-blue-50 text-blue-800" : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300"}`}
                      >
                        <span className="block font-semibold">{size}</span>
                        <span className="block text-[10px] text-gray-400">{size === "A4" ? "210 x 297 mm" : "215,9 x 279,4 mm"}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Margens oficiais</h3>
                    <span className="text-[10px] text-gray-400">mm</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(MARGIN_PRESETS).map(([label, preset]) => (
                      <button key={label} type="button" onClick={() => applyMarginPreset(preset)} className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50">
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["marginTop", "Topo"],
                      ["marginRight", "Direita"],
                      ["marginBottom", "Base"],
                      ["marginLeft", "Esquerda"],
                    ] as const).map(([field, label]) => (
                      <label key={field} className="block">
                        <span className="block text-[10px] font-medium text-gray-500 mb-0.5">{label}</span>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          step={1}
                          value={effectiveLayoutPrefs[field]}
                          onChange={e => {
                            const raw = parseFloat(e.target.value);
                            if (!Number.isFinite(raw)) return;
                            updatePreference(field, Math.max(0, Math.min(60, raw)));
                          }}
                          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
                        />
                      </label>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipografia usada no PDF</h3>
                  <label className="block">
                    <span className="block text-[10px] font-medium text-gray-500 mb-0.5">Fonte</span>
                    <select
                      value={effectiveLayoutPrefs.fontFamily}
                      onChange={e => updatePreference("fontFamily", e.target.value)}
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    >
                      <option value="Arial">Arial</option>
                      <option value="Helvetica">Helvetica</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Verdana">Verdana</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-[10px] font-medium text-gray-500 mb-0.5">Tamanho (pt)</span>
                      <input type="number" min={8} max={18} value={effectiveLayoutPrefs.fontSize} onChange={e => updatePreference("fontSize", Math.max(8, Math.min(18, parseInt(e.target.value, 10) || 11)))} className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300" />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-medium text-gray-500 mb-0.5">Entrelinha</span>
                      <input type="number" min={1} max={3} step={0.1} value={effectiveLayoutPrefs.lineHeight} onChange={e => updatePreference("lineHeight", Math.max(1, Math.min(3, parseFloat(e.target.value) || 1.6)))} className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300" />
                    </label>
                  </div>
                </section>
              </>
            )}

            {wizardStep === "identity" && (
              <>
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Logos oficiais</h3>
                    {logos.length < 3 && <button onClick={addLogoSlot} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"><Plus className="h-3 w-3" /> Adicionar</button>}
                  </div>
                  <div className="space-y-3">
                    {logos.map((slot, i) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                        <div className="flex items-center justify-between"><span className="text-xs font-semibold text-gray-600">Logo {i + 1}</span>{logos.length > 1 && <button onClick={() => removeLogoSlot(i)} className="text-red-400 hover:text-red-600" title="Remover slot"><X className="h-3.5 w-3.5" /></button>}</div>
                        {slot.preview ? (
                          <div className="relative rounded overflow-hidden border border-gray-200 bg-white"><img src={slot.preview} alt={`Logo ${i + 1}`} className="w-full h-20 object-contain p-1" /><button onClick={() => handleLogoRemove(i)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs hover:bg-red-600" title="Remover imagem">×</button>{slot.file && <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-white text-xs text-center py-0.5">Novo — salve para enviar</div>}</div>
                        ) : (
                          <label className="flex flex-col items-center justify-center w-full h-16 border-2 border-dashed border-gray-300 rounded cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"><Upload className="h-4 w-4 text-gray-400 mb-0.5" /><span className="text-xs text-gray-500">Clique para importar</span><input type="file" accept="image/*" className="hidden" onChange={e => handleLogoUpload(i, e)} /></label>
                        )}
                        <input type="text" value={slot.label} onChange={e => handleLogoLabel(i, e.target.value)} placeholder="Rótulo (opcional)" className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300" />
                        <div className="grid grid-cols-2 gap-2">
                          <label><span className="text-xs text-gray-500 block mb-0.5">Largura (px)</span><input type="number" min={20} max={600} step={5} value={slot.width} onChange={e => handleLogoResize(i, "width", parseInt(e.target.value, 10) || 120)} className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300" /></label>
                          <label><span className="text-xs text-gray-500 block mb-0.5">Altura (px)</span><input type="number" min={20} max={300} step={5} value={slot.height} onChange={e => handleLogoResize(i, "height", parseInt(e.target.value, 10) || 60)} className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300" /></label>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Fundo e rodapé</h3>
                  {bgPreview ? (
                    <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50"><img src={bgPreview} alt="Fundo" className="w-full h-28 object-cover" /><button onClick={handleRemoveBg} className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600" title="Remover fundo">×</button>{bgFile && <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-white text-xs text-center py-0.5">Novo — salve para enviar</div>}</div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"><Upload className="h-5 w-5 text-gray-400 mb-1" /><span className="text-xs text-gray-500">Importar fundo oficial</span><span className="text-xs text-gray-400">PNG, JPG — máx. 5 MB</span><input type="file" accept="image/*" className="hidden" onChange={handleBgUpload} /></label>
                  )}
                  <label className="block"><span className="text-xs font-medium text-gray-600">Opacidade do fundo: <span className="text-blue-600 font-semibold">{Math.round(bgOpacity * 100)}%</span></span><input type="range" min={0.05} max={1.0} step={0.05} value={bgOpacity} onChange={e => { setBgOpacity(parseFloat(e.target.value)); setIsDirty(true); }} className="w-full h-1.5 accent-blue-600" /></label>
                  <label className="block"><span className="text-xs font-medium text-gray-600 block mb-1">Escala do fundo</span><select value={bgSizeOption} onChange={e => { setBgSizeOption(e.target.value); setIsDirty(true); }} className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"><option value="cover">Preencher página (cover)</option><option value="contain">Mostrar imagem completa (contain)</option><option value="100% 100%">Esticar para a página</option><option value="210mm 297mm">Tamanho fixo A4 legado</option></select></label>
                  {footerPreview ? (
                    <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50"><img src={footerPreview} alt="Rodapé" className="w-full h-20 object-cover" /><button onClick={handleRemoveFooter} className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600" title="Remover rodapé">×</button>{footerFile && <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-white text-xs text-center py-0.5">Novo — salve para enviar</div>}</div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"><Upload className="h-5 w-5 text-gray-400 mb-1" /><span className="text-xs text-gray-500">Importar imagem de rodapé</span><span className="text-xs text-gray-400">PNG, JPG — máx. 5 MB</span><input type="file" accept="image/*" className="hidden" onChange={handleFooterUpload} /></label>
                  )}
                </section>
              </>
            )}

            {wizardStep === "position" && (
              <>
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Layers3 className="h-3.5 w-3.5" /> Presets compatíveis</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(POSITION_PRESETS).map(([name, preset]) => <button key={name} type="button" onClick={() => applyPositionPreset(preset)} className="rounded border border-gray-200 bg-gray-50 px-2 py-2 text-left text-xs font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50">{name}</button>)}
                  </div>
                </section>
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Move className="h-3.5 w-3.5" /> Blocos oficiais</h3>
                  <div className="space-y-3">
                    {activeBlockIds.map(block => {
                      const info = BLOCK_LABELS[block];
                      const pos = positions[block];
                      const fields = [
                        { field: "x", label: "X", min: 0, max: Math.max(0, 100 - pos.w) },
                        { field: "y", label: "Y", min: 0, max: Math.max(0, 100 - pos.h) },
                        { field: "w", label: "Larg.", min: 4, max: 100 },
                        { field: "h", label: "Alt.", min: 3, max: 100 },
                      ] as const;
                      return (
                        <div key={block} onClick={() => setActiveBlock(block)} className={`rounded-lg border p-2 transition-colors ${activeBlock === block ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}>
                          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: info.color }} /><span className="flex-1 text-xs font-medium text-gray-700">{info.label}</span><span className="text-[10px] text-gray-400 tabular-nums">{Math.round(pos.x)}%,{Math.round(pos.y)}% - {Math.round(pos.w)}x{Math.round(pos.h)}%</span><button onClick={(e) => { e.stopPropagation(); toggleVisible(block); }} className={`transition-colors ${pos.visible ? "text-green-600 hover:text-green-800" : "text-gray-400 hover:text-gray-600"}`} title={pos.visible ? "Ocultar bloco" : "Mostrar bloco"}>{pos.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button></div>
                          {activeBlock === block && <div className="grid grid-cols-4 gap-1.5 pt-2">{fields.map(item => <label key={item.field} className="block"><span className="block text-[10px] font-medium text-gray-500 mb-0.5">{item.label}</span><input type="number" min={item.min} max={item.max} step={0.5} value={Number(pos[item.field].toFixed(1))} onClick={(e) => e.stopPropagation()} onFocus={() => setActiveBlock(block)} onChange={e => handleBlockMetricChange(block, item.field, parseFloat(e.target.value))} className="w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300" /></label>)}</div>}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            {wizardStep === "review" && (
              <>
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Checklist do motor único</h3>
                  <div className="space-y-2">
                    {canonicalChecks.map(check => <div key={check.label} className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"><CheckCircle2 className={`mt-0.5 h-4 w-4 flex-shrink-0 ${check.ok ? "text-emerald-600" : "text-amber-500"}`} /><span className="text-xs leading-4 text-gray-700">{check.label}</span></div>)}
                  </div>
                </section>
                <section className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800 space-y-2">
                  <p className="font-semibold">Contrato que será salvo</p>
                  <p>Somente campos aceitos pelo motor atual: preferences, logos, fundo, rodapé e blockPositions x/y/w/h/visible.</p>
                  <Button variant="outline" size="sm" onClick={() => setShowPayload(true)}><FileText className="h-4 w-4 mr-1" /> Revisar payload</Button>
                </section>
              </>
            )}
          </div>

          <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-gray-100 bg-white p-4">
            <Button variant="outline" disabled={currentStepIndex <= 0} onClick={() => setWizardStep(WIZARD_STEPS[Math.max(0, currentStepIndex - 1)].id)}>Voltar</Button>
            {currentStepIndex < WIZARD_STEPS.length - 1 ? <Button onClick={() => setWizardStep(WIZARD_STEPS[Math.min(WIZARD_STEPS.length - 1, currentStepIndex + 1)].id)}>Próxima etapa</Button> : <Button onClick={handleSave} disabled={isSaving || isUploading}><Save className="h-4 w-4 mr-1" /> Salvar</Button>}
          </div>
        </aside>
        {/* Canvas oficial do motor único */}
        {showPreview && (
          <div className="flex-1 overflow-auto bg-gray-300 flex items-start justify-center p-8">
            <div>
              <div className="mb-3 flex items-center justify-center gap-3 flex-wrap">
                <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("editor")}
                    className={`px-3 py-1.5 text-xs font-medium transition ${previewMode === "editor" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                  >
                    Editar blocos
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("real")}
                    className={`px-3 py-1.5 text-xs font-medium transition ${previewMode === "real" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                  >
                    Previa real
                  </button>
                </div>
                <div className="inline-flex items-center overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <button type="button" onClick={() => setPreviewZoom(z => Math.max(0.45, Number((z - 0.1).toFixed(2))))} className="px-2 py-1.5 text-gray-600 hover:bg-gray-50" title="Diminuir zoom">
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-12 border-x border-gray-200 px-2 py-1.5 text-center text-xs font-medium text-gray-600">{Math.round(previewZoom * 100)}%</span>
                  <button type="button" onClick={() => setPreviewZoom(z => Math.min(1.1, Number((z + 0.1).toFixed(2))))} className="px-2 py-1.5 text-gray-600 hover:bg-gray-50" title="Aumentar zoom">
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setPreviewZoom(0.78)} className="border-l border-gray-200 px-2 py-1.5 text-gray-600 hover:bg-gray-50" title="Recentralizar visualização">
                    <Focus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="w-full text-center text-xs text-gray-600">
                  {previewMode === "real" ? "Prévia final do mesmo motor usado para imprimir e gerar PDF" : "Modo de posicionamento sobre a folha final compartilhada"}
                </p>
              </div>

              {previewMode === "editor" ? (
                <>
                  <div className="flex items-center justify-center gap-4 mb-2 flex-wrap">
                    {activeBlockIds.map(b => (
                      <div key={b} className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: BLOCK_LABELS[b].color }} />
                        <span className="text-xs text-gray-600">{BLOCK_LABELS[b].label}</span>
                      </div>
                    ))}
                  </div>
                  <div
                    ref={canvasRef}
                    className="bg-white shadow-2xl relative overflow-hidden"
                    style={{
                      ...getCanvasOuterStyle(effectiveLayoutPrefs.pageSize),
                      transform: `scale(${previewZoom})`,
                      transformOrigin: "top center",
                      userSelect: "none",
                      touchAction: "none",
                    }}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                  >
                    {/* A folha real permanece visível durante a edição; os overlays abaixo cuidam apenas da interação. */}
                    <SharedReportSheet
                      positions={positions}
                      logos={logos.filter(logo => Boolean(logo.preview)).map(logo => ({
                        url: logo.preview as string,
                        width: logo.width,
                        height: logo.height,
                        label: logo.label,
                      }))}
                      backgroundUrl={bgPreview}
                      backgroundOpacity={bgOpacity}
                      backgroundSize={bgSizeOption}
                      footerImageUrl={footerPreview}
                      patientName={REAL_PREVIEW_SAMPLE.patientName}
                      patientInfo={
                        <div style={{ width: "100%", fontSize: "8pt", lineHeight: 1.35 }}>
                          Realizado em: <strong>{REAL_PREVIEW_SAMPLE.date}</strong>
                          <span style={{ margin: "0 6px" }}>·</span>
                          Nasc.: <strong>{REAL_PREVIEW_SAMPLE.birthDate}</strong>
                          <span style={{ margin: "0 6px" }}>·</span>
                          Sexo: <strong>{REAL_PREVIEW_SAMPLE.sex}</strong>
                        </div>
                      }
                      title={<div style={{ width: "100%", textAlign: "center", fontWeight: "bold", fontSize: "13pt", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e0e0e0", paddingBottom: 6 }}>{REAL_PREVIEW_SAMPLE.examTitle}</div>}
                      body={
                        <div style={{ width: "100%", fontSize: "11pt", lineHeight: 1.6 }}>
                          <h2 style={{ margin: "0 0 12px", textAlign: "center", fontSize: "13pt", fontWeight: 700, textTransform: "uppercase" }}>{REAL_PREVIEW_SAMPLE.bodyTitle}</h2>
                          <div style={{ display: "grid", gap: 12 }}>
                            {REAL_PREVIEW_SAMPLE.body.map(paragraph => <p key={paragraph} style={{ margin: 0 }}>{paragraph}</p>)}
                          </div>
                        </div>
                      }
                      footer={<div style={{ textAlign: "center", fontSize: "9pt" }}>Dr. Nome do Medico - CRM 12345</div>}
                      pageSize={effectiveLayoutPrefs.pageSize}
                      marginTop={effectiveLayoutPrefs.marginTop}
                      marginRight={effectiveLayoutPrefs.marginRight}
                      marginBottom={effectiveLayoutPrefs.marginBottom}
                      marginLeft={effectiveLayoutPrefs.marginLeft}
                      style={{ width: "100%", height: "100%" }}
                    />

                    {/* Camada de interação: mesma caixa de padding (mm) que SharedReportSheet usa
                        internamente, para que os overlays de arrastar/redimensionar fiquem
                        exatamente sobre a ÁREA ÚTIL real, e não sobre a folha inteira
                        (Bloqueio C, parecer Manus 2026-09-25). */}
                    <div style={getAreaUtilWrapperStyle(effectiveLayoutPrefs)}>
                      <div ref={usableAreaRef} style={{ position: "relative", width: "100%", height: "100%" }}>
                    {/* Overlays transparentes para selecionar, arrastar e redimensionar blocos. */}
                    {activeBlockIds.map(block => {
                      const pos = positions[block];
                      const info = BLOCK_LABELS[block];
                      const logoIndex = logoBlockIndex(block);
                      const logoSlot = logoIndex >= 0 ? logos[logoIndex] : null;
                      if (!pos.visible) return null;
                      if (logoIndex >= 0 && !logoSlot) return null;
                      const isActive = activeBlock === block;
                      return (
                        <div
                          key={block}
                          onPointerDown={(e) => {
                            setActiveBlock(block);
                            handlePointerDown(e, block);
                          }}
                          style={{
                            position: "absolute",
                            left: `${pos.x}%`, top: `${pos.y}%`,
                            width: `${pos.w}%`, height: `${pos.h}%`,
                            border: `${isActive ? 2 : 1}px ${isActive ? 'solid' : 'dashed'} ${isActive ? info.color : `${info.color}66`}`,
                            background: isActive ? `${info.color}12` : "transparent",
                            cursor: "grab",
                            pointerEvents: "auto",
                            zIndex: isActive ? 20 : 2,
                            borderRadius: 4,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            overflow: "hidden",
                            boxShadow: isActive ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                            transition: "box-shadow 0.1s, border 0.1s",
                          }}
                        >
                          {isActive && <div style={{ position: "absolute", top: 2, left: 4, fontSize: 8, fontWeight: 700, color: info.color, background: "rgba(255,255,255,0.96)", padding: "1px 5px", borderRadius: 3, lineHeight: 1.4, zIndex: 5, pointerEvents: "none", boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                            {info.label} · {Math.round(pos.w)}% × {Math.round(pos.h)}%
                          </div>}

                          {/* Alças de redimensionamento rápido visíveis quando ativo */}
                          {isActive && (
                            <>
                              <div
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* captura indisponível */ }
                                  const startX = e.clientX;
                                  const startW = pos.w;
                                  // Bloqueio C: redimensionar como % da área útil real (não um
                                  // divisor fixo em px que ignorava pageSize/margens).
                                  const usableWidthPx = usableAreaRef.current?.getBoundingClientRect().width || 1;
                                  const onMove = (me: PointerEvent) => {
                                    const dw = pointerDeltaToPercent(me.clientX - startX, usableWidthPx);
                                    setPositions(prev => {
                                      const current = prev[block];
                                      if (!current) return prev;
                                      return { ...prev, [block]: { ...current, w: Math.max(10, Math.min(100 - current.x, startW + dw)) } };
                                    });
                                    setIsDirty(true);
                                  };
                                  const onUp = () => {
                                    window.removeEventListener('pointermove', onMove);
                                    window.removeEventListener('pointerup', onUp);
                                    window.removeEventListener('pointercancel', onUp);
                                  };
                                  window.addEventListener('pointermove', onMove);
                                  window.addEventListener('pointerup', onUp);
                                  window.addEventListener('pointercancel', onUp);
                                }}
                                style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: 12, background: info.color, cursor: 'ew-resize', zIndex: 30, borderRadius: '4px 0 0 4px', touchAction: 'none' }}
                                title="Arraste para redimensionar largura"
                              />
                              <div
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* captura indisponível */ }
                                  const startY = e.clientY;
                                  const startH = pos.h;
                                  // Bloqueio C: mesmo ajuste para a alça de altura.
                                  const usableHeightPx = usableAreaRef.current?.getBoundingClientRect().height || 1;
                                  const onMove = (me: PointerEvent) => {
                                    const dh = pointerDeltaToPercent(me.clientY - startY, usableHeightPx);
                                    setPositions(prev => {
                                      const current = prev[block];
                                      if (!current) return prev;
                                      return { ...prev, [block]: { ...current, h: Math.max(5, Math.min(100 - current.y, startH + dh)) } };
                                    });
                                    setIsDirty(true);
                                  };
                                  const onUp = () => {
                                    window.removeEventListener('pointermove', onMove);
                                    window.removeEventListener('pointerup', onUp);
                                    window.removeEventListener('pointercancel', onUp);
                                  };
                                  window.addEventListener('pointermove', onMove);
                                  window.addEventListener('pointerup', onUp);
                                  window.addEventListener('pointercancel', onUp);
                                }}
                                style={{ position: 'absolute', bottom: 0, left: '25%', right: '25%', height: 12, background: info.color, cursor: 'ns-resize', zIndex: 30, borderRadius: '0 0 4px 4px', touchAction: 'none' }}
                                title="Arraste para redimensionar altura"
                              />
                            </>
                          )}

                          {/* O conteúdo real permanece na folha compartilhada; este overlay não o duplica. */}
                        </div>
                      );
                    })}
                      </div>
                    </div>
                    <div style={{ position: "absolute", inset: 0, border: "1px solid #e5e7eb", pointerEvents: "none", zIndex: 0 }} />
                  </div>
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Canvas {effectiveLayoutPrefs.pageSize} ({paperWidthMmValue}mm x {paperHeightMmValue}mm) - arraste os blocos para reposicionar
                  </p>
                </>
              ) : (
                <>
                  <div
                    className="bg-white shadow-2xl relative overflow-hidden"
                    style={{
                      ...getCanvasOuterStyle(effectiveLayoutPrefs.pageSize),
                      transform: `scale(${previewZoom})`,
                      transformOrigin: "top center",
                    }}
                  >
                    <SharedReportSheet
                    positions={positions}
                    logos={logos.filter(logo => Boolean(logo.preview)).map(logo => ({
                      url: logo.preview as string,
                      width: logo.width,
                      height: logo.height,
                      label: logo.label,
                    }))}
                    backgroundUrl={bgPreview}
                    backgroundOpacity={bgOpacity}
                    backgroundSize={bgSizeOption}
                    footerImageUrl={footerPreview}
                    patientName={REAL_PREVIEW_SAMPLE.patientName}
                    patientNameContent={<ClinicalPatientName patientName={REAL_PREVIEW_SAMPLE.patientName} />}
                    patientInfo={
                      <ClinicalPatientDetails
                        birthDate={REAL_PREVIEW_SAMPLE.birthDate}
                        sex={REAL_PREVIEW_SAMPLE.sex}
                        studyDate={REAL_PREVIEW_SAMPLE.date}
                        modality="CT"
                      />
                    }
                    title={<div style={{ width: "100%", textAlign: "center", fontWeight: "bold", fontSize: "13pt", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e0e0e0", paddingBottom: 6 }}>{REAL_PREVIEW_SAMPLE.examTitle}</div>}
                    body={
                      <div style={{ width: "100%", fontSize: "11pt", lineHeight: 1.6 }}>
                        <h2 style={{ margin: "0 0 12px", textAlign: "center", fontSize: "13pt", fontWeight: 700, textTransform: "uppercase" }}>{REAL_PREVIEW_SAMPLE.bodyTitle}</h2>
                        <div style={{ display: "grid", gap: 12 }}>
                          {REAL_PREVIEW_SAMPLE.body.map(paragraph => <p key={paragraph} style={{ margin: 0 }}>{paragraph}</p>)}
                        </div>
                      </div>
                    }
                    footer={<div style={{ textAlign: "center", fontSize: "9pt" }}>Dr. Nome do Medico - CRM 12345</div>}
                    pageSize={effectiveLayoutPrefs.pageSize}
                    marginTop={effectiveLayoutPrefs.marginTop}
                    marginRight={effectiveLayoutPrefs.marginRight}
                    marginBottom={effectiveLayoutPrefs.marginBottom}
                    marginLeft={effectiveLayoutPrefs.marginLeft}
                    style={{ width: "100%", height: "100%" }}
                  />
                  </div>
                  <p className="text-xs text-gray-500 text-center mt-2">Prévia real da página com os blocos aplicados pelo motor único</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Payload canônico do layout</h2>
                <p className="text-xs text-gray-500">Campos enviados ao motor oficial de laudo para esta unidade.</p>
              </div>
              <button type="button" onClick={() => setShowPayload(false)} className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700" title="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="max-h-[60vh] overflow-auto bg-slate-950 p-4 text-[11px] leading-5 text-slate-100">
              {JSON.stringify(canonicalPayload, null, 2)}
            </pre>
            <div className="flex justify-end border-t border-gray-200 px-4 py-3">
              <Button variant="outline" onClick={() => setShowPayload(false)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
