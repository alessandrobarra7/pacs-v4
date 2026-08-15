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

type BlockId = "logo" | "title" | "body" | "footer";

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

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_POSITIONS: BlockPositions = {
  logo:   { x: 2, y: 2,  w: 96, h: 11, visible: true },
  title:  { x: 2, y: 17, w: 96, h: 12, visible: true },
  body:   { x: 2, y: 32, w: 96, h: 40, visible: true },
  footer: { x: 2, y: 72, w: 96, h: 23, visible: true },
};

const LEGACY_DEFAULT_POSITIONS: BlockPositions = {
  logo:   { x: 2, y: 1,  w: 20, h: 10, visible: true },
  title:  { x: 2, y: 13, w: 96, h: 6,  visible: true },
  body:   { x: 2, y: 21, w: 96, h: 55, visible: true },
  footer: { x: 2, y: 88, w: 96, h: 8,  visible: true },
};

const BLOCK_LABELS: Record<BlockId, { label: string; color: string; preview: string }> = {
  logo:   { label: "Logo(s) da Unidade", color: "#3b82f6", preview: "logo" },
  title:  { label: "Título do Exame",    color: "#8b5cf6", preview: "RADIOGRAFIA DE TÓRAX PA E PERFIL" },
  body:   { label: "Corpo do Laudo",     color: "#10b981", preview: "Paciente: NOME DO PACIENTE\nData: 01/01/2026\n\nResultado do exame aqui..." },
  footer: { label: "Rodapé / Carimbo",  color: "#f59e0b", preview: "Dr. Nome do Médico — CRM 12345" },
};

const BLOCK_IDS: BlockId[] = ["logo", "title", "body", "footer"];

const EMPTY_LOGO = (): LogoSlot => ({
  url: "", preview: "", file: null, width: 120, height: 60, label: "",
});

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
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [mobileTab, setMobileTab] = useState<"preview" | "logos" | "bg" | "blocks">("preview");
  const [previewScale, setPreviewScale] = useState(1);
  const [isPreviewUpdating, setIsPreviewUpdating] = useState(false);
  const previewUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markLayoutChange = useCallback(() => {
    setIsDirty(true);
    setIsPreviewUpdating(true);
    if (previewUpdateTimer.current) clearTimeout(previewUpdateTimer.current);
    previewUpdateTimer.current = setTimeout(() => {
      setIsPreviewUpdating(false);
      previewUpdateTimer.current = null;
    }, 260);
  }, []);

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
      const saved = layoutData.block_positions as Partial<BlockPositions>;
      const isLegacyDefault = BLOCK_IDS.every(k => {
        const savedBlock = saved[k];
        const legacyBlock = LEGACY_DEFAULT_POSITIONS[k];
        return Boolean(savedBlock) && savedBlock!.x === legacyBlock.x && savedBlock!.y === legacyBlock.y && savedBlock!.w === legacyBlock.w && savedBlock!.h === legacyBlock.h;
      });
      setPositions(prev => {
        if (isLegacyDefault) return DEFAULT_POSITIONS;
        const merged = { ...prev };
        for (const k of BLOCK_IDS) {
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
    markLayoutChange();
  }, []);

  const handleRemoveBg = useCallback(() => {
    setBgFile(null); setBgPreview(null); setBgUrl(null); markLayoutChange();
  }, []);

  // ── Handlers: imagem de rodapé ─────────────────────────────────────────────
  const handleFooterUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem (PNG ou JPG)."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 5 MB."); return; }
    setFooterFile(file);
    setFooterPreview(URL.createObjectURL(file));
    markLayoutChange();
  }, []);

  const handleRemoveFooter = useCallback(() => {
    setFooterFile(null); setFooterPreview(null); setFooterUrl(null); markLayoutChange();
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
    markLayoutChange();
  }, []);

  const handleLogoRemove = useCallback((index: number) => {
    setLogos(prev => {
      const next = [...prev];
      next[index] = { ...next[index], url: "", preview: "", file: null };
      return next;
    });
    markLayoutChange();
  }, []);

  const handleLogoResize = useCallback((index: number, field: "width" | "height", value: number) => {
    setLogos(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    markLayoutChange();
  }, []);

  const handleLogoLabel = useCallback((index: number, label: string) => {
    setLogos(prev => {
      const next = [...prev];
      next[index] = { ...next[index], label };
      return next;
    });
    markLayoutChange();
  }, []);

  const addLogoSlot = useCallback(() => {
    if (logos.length >= 3) { toast.info("Máximo de 3 logos permitido."); return; }
    setLogos(prev => [...prev, EMPTY_LOGO()]);
    markLayoutChange();
  }, [logos.length]);

  const removeLogoSlot = useCallback((index: number) => {
    setLogos(prev => prev.filter((_, i) => i !== index));
    markLayoutChange();
  }, []);

  // ── Handlers: drag-and-drop ────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.PointerEvent, block: BlockId) => {
    e.preventDefault();
    setActiveBlock(block);
    if (!canvasRef.current) return;
    canvasRef.current.setPointerCapture?.(e.pointerId);
    dragging.current = {
      block,
      startX: e.clientX,
      startY: e.clientY,
      origX: positions[block].x,
      origY: positions[block].y,
    };
  }, [positions]);

  const handleMouseMove = useCallback((e: React.PointerEvent) => {
    const drag = dragging.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dx = ((e.clientX - drag.startX) / rect.width) * 100;
    const dy = ((e.clientY - drag.startY) / rect.height) * 100;
    const { block, origX, origY } = drag;
    setPositions(prev => {
      const newX = Math.max(0, Math.min(100 - prev[block].w, origX + dx));
      const newY = Math.max(0, Math.min(100 - prev[block].h, origY + dy));
      return { ...prev, [block]: { ...prev[block], x: newX, y: newY } };
    });
    markLayoutChange();
  }, [markLayoutChange]);

  const handleMouseUp = useCallback((e?: React.PointerEvent) => {
    if (e && canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
    dragging.current = null;
  }, []);

  const toggleVisible = useCallback((block: BlockId) => {
    setPositions(prev => ({ ...prev, [block]: { ...prev[block], visible: !prev[block].visible } }));
    markLayoutChange();
  }, []);

  const handleReset = useCallback(() => {
    setPositions(DEFAULT_POSITIONS);
    markLayoutChange();
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar layout.");
    } finally {
      setIsSaving(false);
      setIsUploading(false);
    }
  }, [bgFile, bgUrl, footerFile, footerUrl, logos, positions, unitId, uploadImage, upsertLayout, refetchLayout]);

  const unitName = unitData?.name ?? `Unidade #${unitId}`;

  useEffect(() => {
    return () => {
      if (previewUpdateTimer.current) clearTimeout(previewUpdateTimer.current);
    };
  }, []);

  // A prévia mantém o canvas A4 em 595 × 842 px, mas reduz sua escala
  // somente quando a largura disponível no viewport mobile for menor.
  useEffect(() => {
    const updatePreviewScale = () => {
      const availableWidth = Math.max(280, window.innerWidth - 32);
      setPreviewScale(Math.min(1, availableWidth / 595));
    };
    updatePreviewScale();
    window.addEventListener("resize", updatePreviewScale);
    return () => window.removeEventListener("resize", updatePreviewScale);
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header desktop */}
      <div className="hidden lg:flex bg-white border-b border-gray-200 px-4 py-3 items-center gap-3 shadow-sm">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="shrink-0">
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-gray-800 truncate">Editor de Layout — {unitName}</h1>
          <p className="text-xs text-gray-500 truncate">Logos, fundo, rodapé e posicionamento dos blocos</p>
        </div>
        {isDirty && (
          <span className="shrink-0 text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            Alterações não salvas
          </span>
        )}
        <Button variant="outline" size="sm" onClick={() => setShowPreview(v => !v)} className="shrink-0">
          {showPreview ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
          {showPreview ? "Modo Blocos" : "Laudo Pronto (A4 Real)"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleReset} className="shrink-0">
          <RotateCcw className="h-4 w-4 mr-1" /> Resetar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isSaving || isUploading} className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white">
          {(isSaving || isUploading) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          {isUploading ? "Enviando..." : isSaving ? "Salvando..." : "Salvar Layout"}
        </Button>
      </div>

      {/* Header mobile: título em uma linha e ações em uma segunda linha */}
      <div className="lg:hidden bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 px-3 py-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="h-9 shrink-0 px-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-gray-800">Editor de Layout</h1>
            <p className="truncate text-[11px] text-gray-500">{unitName}</p>
          </div>
          {isDirty && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Não salvo</span>}
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-gray-100 px-3 pb-3 pt-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(v => !v)} className="h-9 min-w-0 px-1 text-xs">
            {showPreview ? <EyeOff className="mr-1 h-3.5 w-3.5 shrink-0" /> : <Eye className="mr-1 h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{showPreview ? "Blocos" : "Prévia A4"}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} className="h-9 min-w-0 px-1 text-xs">
            <RotateCcw className="mr-1 h-3.5 w-3.5 shrink-0" /> <span>Resetar</span>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || isUploading} className="h-9 min-w-0 bg-blue-600 px-1 text-xs text-white hover:bg-blue-700">
            {(isSaving || isUploading) ? <Loader2 className="mr-1 h-3.5 w-3.5 shrink-0 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{isUploading ? "Enviando" : isSaving ? "Salvando" : "Salvar"}</span>
          </Button>
        </div>
      </div>

      {/* ── Abas de navegação mobile para edição de layout ── */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between gap-1 overflow-x-auto shrink-0">
        <button
          onClick={() => setMobileTab("preview")}
          className={`flex-1 min-w-[75px] py-2 px-3 text-xs font-medium rounded-lg whitespace-nowrap text-center transition-colors ${mobileTab === "preview" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        >
          Prévia A4
        </button>
        <button
          onClick={() => setMobileTab("logos")}
          className={`flex-1 min-w-[75px] py-2 px-3 text-xs font-medium rounded-lg whitespace-nowrap text-center transition-colors ${mobileTab === "logos" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        >
          Logos
        </button>
        <button
          onClick={() => setMobileTab("bg")}
          className={`flex-1 min-w-[75px] py-2 px-3 text-xs font-medium rounded-lg whitespace-nowrap text-center transition-colors ${mobileTab === "bg" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        >
          Fundo / Rodapé
        </button>
        <button
          onClick={() => setMobileTab("blocks")}
          className={`flex-1 min-w-[75px] py-2 px-3 text-xs font-medium rounded-lg whitespace-nowrap text-center transition-colors ${mobileTab === "blocks" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        >
          Blocos
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Painel esquerdo */}
        <div className={`w-full min-w-0 lg:w-80 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0 p-4 space-y-5 ${mobileTab === "preview" ? "hidden lg:block" : "block"}`}>
          <div className="lg:hidden flex items-center justify-between bg-blue-50 border border-blue-100 p-3 rounded-xl mb-3">
            <span className="text-xs font-semibold text-blue-800">Editando Configurações Mobile</span>
            <Button variant="default" size="sm" onClick={() => setMobileTab("preview")} className="h-8 text-xs bg-blue-600 text-white">Ver Prévia A4</Button>
          </div>

          {/* ── Logos ─────────────────────────────────────────────────────── */}
          <section className={mobileTab === "logos" ? "block" : "hidden lg:block"}>
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
          <section className={mobileTab === "bg" ? "block" : "hidden lg:block"}>
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
                onChange={e => { setBgOpacity(parseFloat(e.target.value)); markLayoutChange(); }}
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
                onChange={e => { setBgSizeOption(e.target.value); markLayoutChange(); }}
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
          <section className={mobileTab === "bg" ? "block" : "hidden lg:block"}>
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
          <section className={mobileTab === "blocks" ? "block" : "hidden lg:block"}>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Move className="h-3.5 w-3.5" /> Blocos do Laudo
            </h2>
            <p className="text-xs text-gray-400 mb-3">Arraste os blocos coloridos no preview para reposicioná-los.</p>
            <div className="space-y-2">
              {BLOCK_IDS.map(block => {
                const info = BLOCK_LABELS[block];
                const pos = positions[block];
                return (
                  <div key={block} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${activeBlock === block ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}>
                    <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: info.color }} />
                    <span className="flex-1 text-xs font-medium text-gray-700">{info.label}</span>
                    <span className="text-xs text-gray-400 tabular-nums">{Math.round(pos.x)}%,{Math.round(pos.y)}%</span>
                    <button onClick={() => toggleVisible(block)} className={`transition-colors ${pos.visible ? "text-green-600 hover:text-green-800" : "text-gray-400 hover:text-gray-600"}`} title={pos.visible ? "Ocultar bloco" : "Mostrar bloco"}>
                      {pos.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <hr className="border-gray-100" />

          <section className={`${mobileTab === "blocks" ? "block" : "hidden lg:block"} bg-blue-50 rounded-lg p-3 text-xs text-blue-700 space-y-1.5`}>
            <p className="font-semibold">Como usar:</p>
            <p>1. Faça upload dos logos (até 3) e ajuste as dimensões.</p>
            <p>2. Importe a imagem de fundo (timbre) e o rodapé (onda/assinatura).</p>
            <p>3. Arraste os blocos coloridos no preview para posicioná-los.</p>
            <p>4. Clique em <strong>Salvar Layout</strong> para aplicar.</p>
            <p className="text-blue-500 pt-1 border-t border-blue-200">O médico não vê este editor — ele preenche apenas os dados clínicos.</p>
          </section>
        </div>

        {/* Canvas A4 */}
        {showPreview && (
          <div className={`flex-1 min-w-0 overflow-auto bg-gray-300 flex-col items-center justify-start p-4 lg:p-8 ${mobileTab === "preview" ? "flex" : "hidden lg:flex"}`}>
            <div className="lg:hidden w-full max-w-xl mb-3 flex items-center justify-between bg-white border border-gray-200 p-3 rounded-xl shadow-sm">
              <span className="text-xs font-medium text-gray-700">Deseja alterar logos ou rodapé?</span>
              <Button variant="outline" size="sm" onClick={() => setMobileTab("logos")} className="h-8 text-xs border-blue-200 text-blue-700 bg-blue-50">Abrir Painel</Button>
            </div>
            <div className="w-full flex flex-col items-center">
              {!showPreview && (
                <div className="flex items-center justify-center gap-4 mb-2 flex-wrap">
                  {BLOCK_IDS.map(b => (
                    <div key={b} className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: BLOCK_LABELS[b].color }} />
                      <span className="text-xs text-gray-600">{BLOCK_LABELS[b].label}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="relative mx-auto" style={{ width: 595 * previewScale, height: 842 * previewScale }}>
                <div
                ref={canvasRef}
                className="bg-white shadow-2xl relative overflow-hidden"
                style={{ width: 595, height: 842, userSelect: "none", touchAction: "none", transform: `scale(${previewScale})`, transformOrigin: "top left" }}
                onPointerMove={handleMouseMove}
                onPointerUp={handleMouseUp}
                onPointerCancel={handleMouseUp}
              >
                {/* Folha institucional A4 — composição próxima ao PDF/Android */}
                {bgPreview && (
                  <img src={bgPreview} alt="Fundo institucional" className="absolute inset-0 h-full w-full object-cover pointer-events-none opacity-20" style={{ zIndex: 0 }} />
                )}

                <div
                  onPointerDown={e => handleMouseDown(e, "logo")}
                  className={`absolute z-10 rounded-sm px-1 py-1 transition-shadow ${!showPreview ? "cursor-move border border-dashed border-blue-400 bg-blue-50/20" : "cursor-grab"} ${activeBlock === "logo" ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
                  style={{ left: `${positions.logo.x}%`, top: `${positions.logo.y}%`, width: `${positions.logo.w}%`, minHeight: `${positions.logo.h}%` }}
                >
                  <div className="flex items-start gap-3 border-b border-gray-300 pb-2">
                    <div className="flex min-h-8 w-24 shrink-0 items-start gap-1 overflow-hidden">
                      {logos.filter(l => l.preview).length > 0 ? (
                        logos.filter(l => l.preview).map((slot, i) => (
                          <img key={i} src={slot.preview} alt={slot.label || `Logo ${i + 1}`} className="max-h-10 max-w-20 object-contain" />
                        ))
                      ) : (
                        <span className="pt-2 text-[8px] text-gray-400">Logo da unidade</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-center">
                      <p className="truncate text-[13px] font-bold uppercase tracking-wide text-gray-900">{unitName}</p>
                      <p className="text-[8px] text-gray-500">Laudo de Interpretação Radiológica</p>
                    </div>
                  </div>
                  {!showPreview && <span className="absolute -top-2 left-1 rounded bg-blue-600 px-1.5 py-0.5 text-[7px] font-semibold text-white">Cabeçalho</span>}
                </div>

                <div
                  onPointerDown={e => handleMouseDown(e, "title")}
                  className={`absolute z-10 rounded-sm px-1 py-1 transition-shadow ${!showPreview ? "cursor-move border border-dashed border-violet-400 bg-violet-50/20" : "cursor-grab"} ${activeBlock === "title" ? "ring-2 ring-violet-500 ring-offset-1" : ""}`}
                  style={{ left: `${positions.title.x}%`, top: `${positions.title.y}%`, width: `${positions.title.w}%`, minHeight: `${positions.title.h}%` }}
                >
                  <div className="space-y-0.5 text-[9px] leading-4 text-gray-800">
                    <p>Nome do paciente: <strong>ANTONIA DE SOUZA BATISTA</strong></p>
                    <p>Data de nascimento: 15/05/1970</p>
                    <p>Sexo: Feminino</p>
                    <p>Data de realização do exame: 15/08/2026</p>
                  </div>
                  <div className="mt-4 text-center text-[12px] font-bold uppercase tracking-wide text-gray-900">RADIOGRAFIA DE TÓRAX PA E PERFIL</div>
                  {!showPreview && <span className="absolute -top-2 left-1 rounded bg-violet-600 px-1.5 py-0.5 text-[7px] font-semibold text-white">Identificação e exame</span>}
                </div>

                <div
                  onPointerDown={e => handleMouseDown(e, "body")}
                  className={`absolute z-10 rounded-sm px-1 py-1 transition-shadow ${!showPreview ? "cursor-move border border-dashed border-emerald-400 bg-emerald-50/20" : "cursor-grab"} ${activeBlock === "body" ? "ring-2 ring-emerald-500 ring-offset-1" : ""}`}
                  style={{ left: `${positions.body.x}%`, top: `${positions.body.y}%`, width: `${positions.body.w}%`, minHeight: `${positions.body.h}%` }}
                >
                  <div className="space-y-2 text-[10px] leading-4 text-gray-900">
                    <p className="font-bold uppercase">RADIOGRAFIA DE TÓRAX</p>
                    <p><strong>Incidência:</strong><br />P.A e perfil</p>
                    <p className="font-bold">Análise:</p>
                    <p>Presença de volumoso pneumotórax à esquerda.</p>
                    <p>Dispositivo de cateter de infusão projetado na região superior do hemitórax direito.</p>
                    <p>Dreno de tórax à esquerda.</p>
                  </div>
                  {!showPreview && <span className="absolute -top-2 left-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[7px] font-semibold text-white">Corpo do laudo</span>}
                </div>

                <div
                  onPointerDown={e => handleMouseDown(e, "footer")}
                  className={`absolute z-20 overflow-hidden rounded-sm px-1 py-1 transition-shadow ${!showPreview ? "cursor-move border border-dashed border-amber-400 bg-amber-50/20" : "cursor-grab"} ${activeBlock === "footer" ? "ring-2 ring-amber-500 ring-offset-1" : ""}`}
                  style={{ left: `${positions.footer.x}%`, top: `${positions.footer.y}%`, width: `${positions.footer.w}%`, minHeight: `${positions.footer.h}%` }}
                >
                  {footerPreview && <img src={footerPreview} alt="Rodapé institucional" className="pointer-events-none absolute inset-x-[-8%] bottom-[-6%] h-24 w-[116%] max-w-none object-cover opacity-90" />}
                  <div className="relative z-10 flex flex-col items-center justify-end pt-4 text-center text-[9px] text-gray-700">
                    <div className="mb-1 w-32 border-t border-gray-500" />
                    <p className="font-bold text-gray-900">Admin Master</p>
                    <p className="text-[8px]">CRM 12345 / RQE 9876</p>
                    <p className="mt-1 text-[7px] text-gray-500">Assinado em: 15/08/2026, 17:43</p>
                    <span className="absolute bottom-0 right-0 text-[7px] text-gray-400">Página 0 de 0</span>
                  </div>
                  {!showPreview && <span className="absolute -top-2 left-1 rounded bg-amber-600 px-1.5 py-0.5 text-[7px] font-semibold text-white">Assinatura e rodapé</span>}
                </div>

                {isPreviewUpdating && (
                  <div className="lg:hidden absolute inset-0 z-[60] flex items-center justify-center bg-white/60 backdrop-blur-[1px]" role="status" aria-live="polite">
                    <div className="flex items-center gap-2 rounded-full bg-slate-900/85 px-3 py-2 text-[10px] font-semibold text-white shadow-lg">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando prévia
                    </div>
                  </div>
                )}
                <div style={{ position: "absolute", inset: 0, border: "1px solid #e5e7eb", pointerEvents: "none", zIndex: 0 }} />
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center mt-2">Canvas A4 (595 × 842 px) — arraste os blocos para reposicionar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
