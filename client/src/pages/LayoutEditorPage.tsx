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
import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, Save, RotateCcw, Upload, Image as ImageIcon,
  Move, Eye, EyeOff, Loader2, X, Plus,
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

  const dragging = useRef<{
    block: BlockId;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

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

  // ── Handlers: drag-and-drop ────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent, block: BlockId) => {
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
  }, [positions]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragging.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dx = ((e.clientX - drag.startX) / rect.width) * 100;
    const dy = ((e.clientY - drag.startY) / rect.height) * 100;
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

  const handleMouseUp = useCallback(() => {
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

  const handleReset = useCallback(() => {
    setPositions(DEFAULT_POSITIONS);
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
  }, [bgFile, bgOpacity, bgSizeOption, bgUrl, footerFile, footerUrl, logos, positions, unitId, uploadImage, upsertLayout, refetchLayout]);

  const unitName = unitData?.name ?? `Unidade #${unitId}`;
  const activeBlockIds: BlockId[] = [...LOGO_BLOCK_IDS.slice(0, logos.length), ...STATIC_BLOCK_IDS];
  const pageBackgroundFit = bgSizeOption === "contain" ? "contain" : bgSizeOption === "cover" ? "cover" : "fill";

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-gray-800 truncate">Editor de Layout — {unitName}</h1>
          <p className="text-xs text-gray-500">Logos, fundo, rodapé e posicionamento dos blocos</p>
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
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-1" /> Resetar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isSaving || isUploading} className="bg-blue-600 hover:bg-blue-700 text-white">
          {(isSaving || isUploading) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          {isUploading ? "Enviando..." : isSaving ? "Salvando..." : "Salvar Layout"}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Painel esquerdo */}
        <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0 p-4 space-y-5">

          {/* ── Logos ─────────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" /> Logos da Unidade
              </h2>
              {logos.length < 3 && (
                <button onClick={addLogoSlot} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                  <Plus className="h-3 w-3" /> Adicionar logo
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-3">Até 3 logos. Ajuste a largura e altura de cada um.</p>

            <div className="space-y-4">
              {logos.map((slot, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">Logo {i + 1}</span>
                    {logos.length > 1 && (
                      <button onClick={() => removeLogoSlot(i)} className="text-red-400 hover:text-red-600" title="Remover slot">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Upload / preview */}
                  {slot.preview ? (
                    <div className="relative rounded overflow-hidden border border-gray-200 bg-white">
                      <img src={slot.preview} alt={`Logo ${i + 1}`} className="w-full h-20 object-contain p-1" />
                      <button onClick={() => handleLogoRemove(i)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs hover:bg-red-600" title="Remover imagem">×</button>
                      {slot.file && <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-white text-xs text-center py-0.5">Novo — salve para enviar</div>}
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-16 border-2 border-dashed border-gray-300 rounded cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                      <Upload className="h-4 w-4 text-gray-400 mb-0.5" />
                      <span className="text-xs text-gray-500">Clique para importar</span>
                      <input type="file" accept="image/*" className="hidden" onChange={e => handleLogoUpload(i, e)} />
                    </label>
                  )}

                  {/* Rótulo */}
                  <input
                    type="text"
                    value={slot.label}
                    onChange={e => handleLogoLabel(i, e.target.value)}
                    placeholder="Rótulo (opcional)"
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                  />

                  {/* Dimensões */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">Largura (px)</label>
                      <input
                        type="number"
                        min={20} max={600} step={5}
                        value={slot.width}
                        onChange={e => handleLogoResize(i, "width", parseInt(e.target.value) || 120)}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">Altura (px)</label>
                      <input
                        type="number"
                        min={20} max={300} step={5}
                        value={slot.height}
                        onChange={e => handleLogoResize(i, "height", parseInt(e.target.value) || 60)}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* ── Fundo da Página ───────────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" /> Fundo da Página
            </h2>
            {bgPreview ? (
              <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                <img src={bgPreview} alt="Fundo" className="w-full h-28 object-cover" />
                <button onClick={handleRemoveBg} className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600" title="Remover fundo">×</button>
                {bgFile && <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-white text-xs text-center py-0.5">Novo — salve para enviar</div>}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <Upload className="h-5 w-5 text-gray-400 mb-1" />
                <span className="text-xs text-gray-500">Clique para importar fundo</span>
                <span className="text-xs text-gray-400">PNG, JPG — máx. 5 MB</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
              </label>
            )}
            <p className="text-xs text-gray-400 mt-2">Timbre ou papel timbrado da clínica. Aparece atrás de todo o conteúdo.</p>

            {/* Slider de opacidade */}
            <div className="mt-3 space-y-1">
              <label className="text-xs font-medium text-gray-600">
                Opacidade: <span className="text-blue-600 font-semibold">{Math.round(bgOpacity * 100)}%</span>
              </label>
              <input
                type="range"
                min={0.05}
                max={1.0}
                step={0.05}
                value={bgOpacity}
                onChange={e => { setBgOpacity(parseFloat(e.target.value)); setIsDirty(true); }}
                className="w-full h-1.5 accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>5% (quase invisível)</span>
                <span>50% (marca d'água)</span>
                <span>100% (sólido)</span>
              </div>
            </div>

            {/* Seletor de modo de escala */}
            <div className="mt-3 space-y-1">
              <label className="text-xs font-medium text-gray-600">Modo de escala</label>
              <select
                value={bgSizeOption}
                onChange={e => { setBgSizeOption(e.target.value); setIsDirty(true); }}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="cover">Preencher página (cover) — recomendado para A4</option>
                <option value="contain">Mostrar imagem completa (contain) — sem corte</option>
                <option value="100% 100%">Esticar para A4 — posicionamento exato</option>
                <option value="210mm 297mm">Tamanho fixo A4 — mais preciso</option>
              </select>
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* ── Imagem de Rodapé ──────────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" /> Imagem de Rodapé
            </h2>
            {footerPreview ? (
              <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                <img src={footerPreview} alt="Rodapé" className="w-full h-20 object-cover" />
                <button onClick={handleRemoveFooter} className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600" title="Remover rodapé">×</button>
                {footerFile && <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-white text-xs text-center py-0.5">Novo — salve para enviar</div>}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <Upload className="h-5 w-5 text-gray-400 mb-1" />
                <span className="text-xs text-gray-500">Clique para importar rodapé</span>
                <span className="text-xs text-gray-400">PNG, JPG — máx. 5 MB</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFooterUpload} />
              </label>
            )}
            <p className="text-xs text-gray-400 mt-2">Onda, assinatura ou rodapé institucional. Aparece na parte inferior do laudo.</p>
          </section>

          <hr className="border-gray-100" />

          {/* ── Blocos ────────────────────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Move className="h-3.5 w-3.5" /> Blocos do Laudo
            </h2>
            <p className="text-xs text-gray-400 mb-3">Arraste os blocos no preview ou ajuste posição e tamanho abaixo.</p>
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
                  <div
                    key={block}
                    onClick={() => setActiveBlock(block)}
                    className={`rounded-lg border p-2 transition-colors ${activeBlock === block ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: info.color }} />
                      <span className="flex-1 text-xs font-medium text-gray-700">{info.label}</span>
                      <span className="text-[10px] text-gray-400 tabular-nums">{Math.round(pos.x)}%,{Math.round(pos.y)}% - {Math.round(pos.w)}x{Math.round(pos.h)}%</span>
                      <button onClick={(e) => { e.stopPropagation(); toggleVisible(block); }} className={`transition-colors ${pos.visible ? "text-green-600 hover:text-green-800" : "text-gray-400 hover:text-gray-600"}`} title={pos.visible ? "Ocultar bloco" : "Mostrar bloco"}>
                        {pos.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 pt-2">
                      {fields.map(item => (
                        <label key={item.field} className="block">
                          <span className="block text-[10px] font-medium text-gray-500 mb-0.5">{item.label}</span>
                          <input
                            type="number"
                            min={item.min}
                            max={item.max}
                            step={0.5}
                            value={Number(pos[item.field].toFixed(1))}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => setActiveBlock(block)}
                            onChange={e => handleBlockMetricChange(block, item.field, parseFloat(e.target.value))}
                            className="w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <hr className="border-gray-100" />

          <section className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 space-y-1.5">
            <p className="font-semibold">Como usar:</p>
            <p>1. Faça upload dos logos (até 3) e ajuste cada logo como um bloco independente.</p>
            <p>2. Importe a imagem de fundo (timbre) e o rodapé (onda/assinatura).</p>
            <p>3. Arraste os blocos coloridos ou ajuste X, Y, largura e altura.</p>
            <p>4. Clique em <strong>Salvar Layout</strong> para aplicar.</p>
            <p className="text-blue-500 pt-1 border-t border-blue-200">O médico não vê este editor — ele preenche apenas os dados clínicos.</p>
          </section>
        </div>

        {/* Canvas A4 */}
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
                <span className="text-xs text-gray-600">
                  {previewMode === "real" ? "Visualizacao limpa da pagina" : "Modo de posicionamento"}
                </span>
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
                    style={{ width: 595, height: 842, userSelect: "none" }}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    {/* Fundo */}
                    {bgPreview && (
                      <img
                        src={bgPreview}
                        alt="Fundo"
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        style={{
                          zIndex: 0,
                          opacity: bgOpacity,
                          objectFit: pageBackgroundFit,
                        }}
                      />
                    )}

                    {/* Rodape renderizado dentro do bloco configuravel. */}

                    {/* Blocos drag-and-drop */}
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
                          onMouseDown={(e) => {
                            setActiveBlock(block);
                            handleMouseDown(e, block);
                          }}
                          style={{
                            position: "absolute",
                            left: `${pos.x}%`, top: `${pos.y}%`,
                            width: `${pos.w}%`, height: `${pos.h}%`,
                            border: `2px ${isActive ? 'solid' : 'dashed'} ${info.color}`,
                            background: isActive ? `${info.color}25` : `${info.color}10`,
                            cursor: "grab",
                            zIndex: isActive ? 20 : 2,
                            borderRadius: 4,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            overflow: "hidden",
                            boxShadow: isActive ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                            transition: "box-shadow 0.1s, border 0.1s",
                          }}
                        >
                          <div style={{ position: "absolute", top: 2, left: 4, fontSize: 8, fontWeight: 700, color: info.color, background: "rgba(255,255,255,0.95)", padding: "1px 5px", borderRadius: 3, lineHeight: 1.4, zIndex: 5, pointerEvents: "none", boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                            {info.label} ({Math.round(pos.w)}% × {Math.round(pos.h)}%)
                          </div>

                          {/* Alças de redimensionamento rápido visíveis quando ativo */}
                          {isActive && (
                            <>
                              <div
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  const startX = e.clientX;
                                  const startW = pos.w;
                                  const onMove = (me: MouseEvent) => {
                                    const dw = ((me.clientX - startX) / 450) * 100;
                                    setPositions(prev => ({
                                      ...prev,
                                      [block]: { ...prev[block], w: Math.max(10, Math.min(100 - prev[block].x, startW + dw)) }
                                    }));
                                  };
                                  const onUp = () => {
                                    window.removeEventListener('mousemove', onMove);
                                    window.removeEventListener('mouseup', onUp);
                                  };
                                  window.addEventListener('mousemove', onMove);
                                  window.addEventListener('mouseup', onUp);
                                }}
                                style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: 8, background: info.color, cursor: 'ew-resize', zIndex: 30, borderRadius: '4px 0 0 4px' }}
                                title="Arraste para redimensionar largura"
                              />
                              <div
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  const startY = e.clientY;
                                  const startH = pos.h;
                                  const onMove = (me: MouseEvent) => {
                                    const dh = ((me.clientY - startY) / 600) * 100;
                                    setPositions(prev => ({
                                      ...prev,
                                      [block]: { ...prev[block], h: Math.max(5, Math.min(100 - prev[block].y, startH + dh)) }
                                    }));
                                  };
                                  const onUp = () => {
                                    window.removeEventListener('mousemove', onMove);
                                    window.removeEventListener('mouseup', onUp);
                                  };
                                  window.addEventListener('mousemove', onMove);
                                  window.addEventListener('mouseup', onUp);
                                }}
                                style={{ position: 'absolute', bottom: 0, left: '25%', right: '25%', height: 8, background: info.color, cursor: 'ns-resize', zIndex: 30, borderRadius: '0 0 4px 4px' }}
                                title="Arraste para redimensionar altura"
                              />
                            </>
                          )}

                          <div style={{ fontSize: block === "title" ? 8 : 7, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", textAlign: "center", padding: block === "footer" && footerPreview ? "16px 6px 6px" : "18px 6px 4px", whiteSpace: "pre-wrap", lineHeight: 1.4, pointerEvents: "none", maxWidth: "100%", overflow: "hidden" }}>
                            {logoIndex >= 0 ? (
                              logoSlot?.preview ? (
                                <img
                                  src={logoSlot.preview}
                                  alt={logoSlot.label || `Logo ${logoIndex + 1}`}
                                  style={{ width: '100%', height: '100%', maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                                />
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                                  <div style={{ width: 28, height: 28, background: info.color + "33", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>L</div>
                                  <span style={{ fontSize: 6, color: "#888" }}>{info.label}</span>
                                </div>
                              )
                            ) : block === "footer" && footerPreview ? (
                              <img src={footerPreview} alt="Rodape" style={{ width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
                            ) : info.preview}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ position: "absolute", inset: 0, border: "1px solid #e5e7eb", pointerEvents: "none", zIndex: 0 }} />
                  </div>
                  <p className="text-xs text-gray-500 text-center mt-2">Canvas A4 (595 x 842 px) - arraste os blocos para reposicionar</p>
                </>
              ) : (
                <>
                  <div
                    className="bg-white shadow-2xl relative overflow-hidden"
                    style={{ width: 595, height: 842 }}
                  >
                    {bgPreview && (
                      <img
                        src={bgPreview}
                        alt="Fundo"
                        className="absolute inset-0 h-full w-full pointer-events-none"
                        style={{ zIndex: 0, opacity: bgOpacity, objectFit: pageBackgroundFit }}
                      />
                    )}

                    {activeBlockIds.map(block => {
                      const pos = positions[block];
                      const logoIndex = logoBlockIndex(block);
                      const logoSlot = logoIndex >= 0 ? logos[logoIndex] : null;
                      const visibleLogoSlot = logoIndex >= 0 && logoSlot?.preview ? logoSlot : null;
                      if (!pos.visible) return null;
                      if (logoIndex >= 0 && !visibleLogoSlot) return null;

                      return (
                        <div
                          key={block}
                          className="absolute overflow-hidden"
                          style={{
                            left: `${pos.x}%`,
                            top: `${pos.y}%`,
                            width: `${pos.w}%`,
                            height: `${pos.h}%`,
                            zIndex: logoIndex >= 0 ? 3 : block === "footer" ? 2 : 1,
                          }}
                        >
                          {visibleLogoSlot ? (
                            <div className="flex h-full w-full items-center justify-center">
                              <img
                                src={visibleLogoSlot.preview}
                                alt={visibleLogoSlot.label || `Logo ${logoIndex + 1}`}
                                style={{ width: visibleLogoSlot.width, height: visibleLogoSlot.height, maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                              />
                            </div>
                          ) : block === "patientName" ? (
                            <div className="flex h-full w-full items-center justify-center px-4 text-center font-serif text-[13px] font-bold uppercase tracking-normal text-gray-950">
                              {REAL_PREVIEW_SAMPLE.patientName}
                            </div>
                          ) : block === "patientInfo" ? (
                            <div className="flex h-full w-full flex-col justify-center overflow-hidden px-4 text-left font-serif text-[8px] leading-snug text-gray-950">
                              <div>Realizado em: {REAL_PREVIEW_SAMPLE.date}</div>
                              <div>Data de nascimento: {REAL_PREVIEW_SAMPLE.birthDate}</div>
                              <div>Sexo: {REAL_PREVIEW_SAMPLE.sex}</div>
                            </div>
                          ) : block === "title" ? (
                            <div className="flex h-full w-full items-center justify-center border-b border-gray-200 px-6 text-center font-serif text-[14px] font-bold uppercase tracking-normal text-gray-950">
                              {REAL_PREVIEW_SAMPLE.examTitle}
                            </div>
                          ) : block === "body" ? (
                            <div className="h-full w-full px-6 py-5 font-serif text-[11px] leading-relaxed text-gray-950">
                              <h2 className="mb-3 text-center text-[13px] font-bold uppercase">{REAL_PREVIEW_SAMPLE.bodyTitle}</h2>
                              <div className="space-y-3">
                                {REAL_PREVIEW_SAMPLE.body.map(paragraph => (
                                  <p key={paragraph}>{paragraph}</p>
                                ))}
                              </div>
                            </div>
                          ) : block === "footer" && footerPreview ? (
                            <div className="flex h-full w-full items-center justify-center px-6 py-2">
                              <img src={footerPreview} alt="Rodape" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                            </div>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center px-6 text-center font-serif text-[10px] text-gray-800">
                              Dr. Nome do Medico - CRM 12345
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 text-center mt-2">Previa real da pagina com os blocos aplicados</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
