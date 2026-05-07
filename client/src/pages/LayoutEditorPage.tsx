/**
 * LayoutEditorPage — Editor de Layout de Laudos por Unidade
 *
 * Funcionalidades (root/admin_master):
 *  1. Importar imagem de fundo (upload → S3 → background_image_url)
 *  2. Drag-and-drop de blocos: logo, título, corpo, rodapé
 *  3. Visualização em tempo real (canvas A4)
 *  4. Salvar posições e fundo no banco (block_positions + background_image_url)
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, Save, RotateCcw, Upload, Image as ImageIcon,
  Move, Eye, EyeOff, Loader2,
} from "lucide-react";

type BlockId = "logo" | "title" | "body" | "footer";

interface BlockPosition {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

type BlockPositions = Record<BlockId, BlockPosition>;

const DEFAULT_POSITIONS: BlockPositions = {
  logo:   { x: 2,  y: 1,  w: 20, h: 10, visible: true },
  title:  { x: 2,  y: 13, w: 96, h: 6,  visible: true },
  body:   { x: 2,  y: 21, w: 96, h: 55, visible: true },
  footer: { x: 2,  y: 88, w: 96, h: 8,  visible: true },
};

const BLOCK_LABELS: Record<BlockId, { label: string; color: string; preview: string }> = {
  logo:   { label: "Logo da Unidade",  color: "#3b82f6", preview: "logo" },
  title:  { label: "Título do Exame",  color: "#8b5cf6", preview: "RADIOGRAFIA DE TÓRAX PA E PERFIL" },
  body:   { label: "Corpo do Laudo",   color: "#10b981", preview: "Paciente: NOME DO PACIENTE\nData: 01/01/2026\n\nResultado do exame aqui..." },
  footer: { label: "Rodapé / Carimbo", color: "#f59e0b", preview: "Dr. Nome do Médico — CRM 12345" },
};

const BLOCK_IDS: BlockId[] = ["logo", "title", "body", "footer"];

export default function LayoutEditorPage() {
  const [, navigate] = useLocation();
  const { unitId: unitIdParam } = useParams<{ unitId: string }>();
  const unitId = parseInt(unitIdParam || "0", 10);
  const { user } = useAuth();
  const isAdminMaster = user?.role === "admin_master";

  const [positions, setPositions] = useState<BlockPositions>(DEFAULT_POSITIONS);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [activeBlock, setActiveBlock] = useState<BlockId | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
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

  useEffect(() => {
    if (!layoutData) return;
    if (layoutData.background_image_url) {
      setBgUrl(layoutData.background_image_url);
      setBgPreview(layoutData.background_image_url);
    }
    if (layoutData.block_positions && typeof layoutData.block_positions === "object") {
      const saved = layoutData.block_positions as Partial<BlockPositions>;
      setPositions(prev => {
        const merged = { ...prev };
        for (const k of BLOCK_IDS) {
          if (saved[k]) merged[k] = { ...prev[k], ...(saved[k] as BlockPosition) };
        }
        return merged;
      });
    }
  }, [layoutData]);

  useEffect(() => {
    if (user && !isAdminMaster) {
      toast.error("Acesso restrito ao administrador root.");
      navigate("/admin");
    }
  }, [user, isAdminMaster, navigate]);

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

  const handleMouseDown = useCallback((e: React.MouseEvent, block: BlockId) => {
    e.preventDefault();
    setActiveBlock(block);
    if (!canvasRef.current) return;
    dragging.current = {
      block,
      startX: e.clientX,
      startY: e.clientY,
      origX: positions[block].x,
      origY: positions[block].y,
    };
  }, [positions]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragging.current.startX) / rect.width) * 100;
    const dy = ((e.clientY - dragging.current.startY) / rect.height) * 100;
    const block = dragging.current.block;
    setPositions(prev => {
      const newX = Math.max(0, Math.min(100 - prev[block].w, dragging.current!.origX + dx));
      const newY = Math.max(0, Math.min(100 - prev[block].h, dragging.current!.origY + dy));
      return { ...prev, [block]: { ...prev[block], x: newX, y: newY } };
    });
    setIsDirty(true);
  }, []);

  const handleMouseUp = useCallback(() => { dragging.current = null; }, []);

  const toggleVisible = useCallback((block: BlockId) => {
    setPositions(prev => ({ ...prev, [block]: { ...prev[block], visible: !prev[block].visible } }));
    setIsDirty(true);
  }, []);

  const handleReset = useCallback(() => {
    setPositions(DEFAULT_POSITIONS);
    setIsDirty(true);
    toast.info("Posições resetadas para o padrão.");
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      let finalBgUrl = bgUrl;
      if (bgFile) {
        setIsUploading(true);
        try {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(bgFile);
          });
          const result = await uploadFileMutation.mutateAsync({
            fileName: `layout-bg-${unitId}-${Date.now()}.${bgFile.name.split(".").pop()}`,
            base64,
            mimeType: bgFile.type,
            folder: "layout-backgrounds",
          });
          finalBgUrl = result.url;
          setBgUrl(result.url);
        } finally {
          setIsUploading(false);
          setBgFile(null);
        }
      }
      await upsertLayout.mutateAsync({
        unitId,
        backgroundImageUrl: finalBgUrl ?? undefined,
        blockPositions: positions as unknown as Record<string, unknown>,
      });
      setIsDirty(false);
      toast.success("Layout salvo com sucesso!");
      await refetchLayout();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar layout.");
    } finally {
      setIsSaving(false);
    }
  }, [bgFile, bgUrl, positions, unitId, uploadFileMutation, upsertLayout, refetchLayout]);

  const unitName = unitData?.name ?? `Unidade #${unitId}`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-gray-800 truncate">Editor de Layout — {unitName}</h1>
          <p className="text-xs text-gray-500">Defina o fundo e posicione os blocos do laudo</p>
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
        <div className="w-72 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0 p-4 space-y-5">
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" /> Fundo da Página
            </h2>
            {bgPreview ? (
              <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                <img src={bgPreview} alt="Fundo" className="w-full h-32 object-cover" />
                <button onClick={handleRemoveBg} className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600" title="Remover fundo">×</button>
                {bgFile && <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-white text-xs text-center py-0.5">Arquivo novo — salve para enviar</div>}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <Upload className="h-6 w-6 text-gray-400 mb-1" />
                <span className="text-xs text-gray-500">Clique para importar fundo</span>
                <span className="text-xs text-gray-400">PNG, JPG — máx. 5 MB</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
              </label>
            )}
            <p className="text-xs text-gray-400 mt-2">Use uma imagem com o timbre da clínica. Ela aparecerá atrás de todos os blocos no laudo impresso.</p>
          </section>

          <hr className="border-gray-100" />

          <section>
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

          <section className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 space-y-1.5">
            <p className="font-semibold">Como usar:</p>
            <p>1. Importe uma imagem de fundo com o timbre da clínica.</p>
            <p>2. Arraste os blocos coloridos no preview para posicioná-los.</p>
            <p>3. Use o ícone de olho para mostrar ou ocultar blocos.</p>
            <p>4. Clique em <strong>Salvar Layout</strong> para aplicar.</p>
            <p className="text-blue-500 pt-1 border-t border-blue-200">O médico não vê este editor — ele preenche apenas os dados clínicos no laudo.</p>
          </section>
        </div>

        {showPreview && (
          <div className="flex-1 overflow-auto bg-gray-300 flex items-start justify-center p-8">
            <div>
              <div className="flex items-center justify-center gap-4 mb-2">
                {BLOCK_IDS.map(b => (
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
                {bgPreview && (
                  <img src={bgPreview} alt="Fundo" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ zIndex: 0 }} />
                )}
                {BLOCK_IDS.map(block => {
                  const pos = positions[block];
                  const info = BLOCK_LABELS[block];
                  if (!pos.visible) return null;
                  const isActive = activeBlock === block;
                  return (
                    <div
                      key={block}
                      onMouseDown={(e) => handleMouseDown(e, block)}
                      style={{
                        position: "absolute",
                        left: `${pos.x}%`, top: `${pos.y}%`,
                        width: `${pos.w}%`, height: `${pos.h}%`,
                        border: `2px dashed ${info.color}`,
                        background: isActive ? `${info.color}30` : `${info.color}12`,
                        cursor: "grab",
                        zIndex: isActive ? 10 : 1,
                        borderRadius: 3,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        overflow: "hidden",
                        transition: "background 0.1s",
                      }}
                    >
                      <div style={{ position: "absolute", top: 2, left: 4, fontSize: 7, fontWeight: 700, color: info.color, background: "rgba(255,255,255,0.9)", padding: "0 3px", borderRadius: 2, lineHeight: 1.5, pointerEvents: "none" }}>
                        {info.label}
                      </div>
                      <div style={{ fontSize: block === "title" ? 8 : 7, color: "#555", textAlign: "center", padding: "14px 6px 4px", whiteSpace: "pre-wrap", lineHeight: 1.4, pointerEvents: "none", maxWidth: "100%", overflow: "hidden" }}>
                        {block === "logo" ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                            <div style={{ width: 28, height: 28, background: info.color + "33", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🏥</div>
                            <span style={{ fontSize: 6, color: "#888" }}>Logo da Unidade</span>
                          </div>
                        ) : info.preview}
                      </div>
                    </div>
                  );
                })}
                <div style={{ position: "absolute", inset: 0, border: "1px solid #e5e7eb", pointerEvents: "none", zIndex: 0 }} />
              </div>
              <p className="text-xs text-gray-500 text-center mt-2">Canvas A4 (595 × 842 px) — arraste os blocos para reposicionar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
