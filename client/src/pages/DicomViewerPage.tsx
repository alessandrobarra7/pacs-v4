import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import * as csCore from "@cornerstonejs/core";
import * as csTools from "@cornerstonejs/tools";
import * as csDicomLoader from "@cornerstonejs/dicom-image-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Move,
  SunMedium,
  Ruler,
  MousePointer2,
  Maximize2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface StudyInfo {
  patientName: string;
  studyDate: string;
  studyDescription: string;
  modality: string;
  studyInstanceUid: string;
}

type ActiveTool = "WindowLevel" | "Zoom" | "Pan" | "Length" | "StackScroll";

export function DicomViewerPage() {
  const { studyUid } = useParams<{ studyUid: string }>();
  const [location, navigate] = useLocation();
  const viewerRef = useRef<HTMLDivElement>(null);
  const toolGroupRef = useRef<any>(null);

  // Ler unit_id da query string (passado pelo admin_master)
  const urlUnitId = useMemo(() => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const uid = params.get("unit_id");
    return uid ? parseInt(uid, 10) : undefined;
  }, [location]);

  const [phase, setPhase] = useState<"downloading" | "rendering" | "ready" | "error">("downloading");
  const [downloadProgress, setDownloadProgress] = useState<string>("Iniciando C-GET...");
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [studyInfo, setStudyInfo] = useState<StudyInfo | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [viewport, setViewport] = useState<any>(null);
  const [renderingEngine, setRenderingEngine] = useState<any>(null);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<ActiveTool>("WindowLevel");
  const [wl, setWl] = useState<{ ww: number; wc: number } | null>(null);

  const startViewerMutation = trpc.pacs.startViewer.useMutation();

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr.length !== 8) return dateStr || "";
    return `${dateStr.slice(6, 8)}/${dateStr.slice(4, 6)}/${dateStr.slice(0, 4)}`;
  };

  const cleanPatientName = (name: string) => {
    if (!name) return "-";
    return name.replace(/\^/g, " ").replace(/\s+\d{10,}$/g, "").trim();
  };

  // Extrai metadados do arquivo DICOM via endpoint de listagem
  const extractMetadataFromDicom = async (uid: string): Promise<StudyInfo> => {
    try {
      const resp = await fetch(`/api/dicom-files/${uid}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.metadata) {
          return {
            patientName: data.metadata.patientName || "Paciente",
            studyDate: data.metadata.studyDate || "",
            studyDescription: data.metadata.studyDescription || "Sem descrição",
            modality: data.metadata.modality || "-",
            studyInstanceUid: uid,
          };
        }
      }
    } catch (_) {}
    return {
      patientName: "Paciente",
      studyDate: "",
      studyDescription: "Estudo DICOM",
      modality: "-",
      studyInstanceUid: uid,
    };
  };

  // Troca a ferramenta ativa no ToolGroup
  const switchTool = useCallback((tool: ActiveTool) => {
    const tg = toolGroupRef.current;
    if (!tg) return;
    const { Enums: ToolEnums } = csTools;
    const toolMap: Record<ActiveTool, string> = {
      WindowLevel: csTools.WindowLevelTool.toolName,
      Zoom: csTools.ZoomTool.toolName,
      Pan: csTools.PanTool.toolName,
      Length: csTools.LengthTool.toolName,
      StackScroll: csTools.StackScrollTool.toolName,
    };
    // Desativa todas as ferramentas de clique esquerdo
    const allTools: ActiveTool[] = ["WindowLevel", "Zoom", "Pan", "Length", "StackScroll"];
    allTools.forEach((t) => {
      try { tg.setToolPassive(toolMap[t]); } catch (_) {}
    });
    // Ativa a ferramenta selecionada no botão esquerdo
    tg.setToolActive(toolMap[tool], {
      bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
    });
    setActiveTool(tool);
  }, []);

  // Inicializa Cornerstone com os arquivos do cache local
  const initCornerstoneWithCache = useCallback(async (ids: string[]) => {
    setPhase("rendering");
    setDownloadProgress("Inicializando visualizador...");
    setProgressPercent(90);

    try {
      const { RenderingEngine, Enums } = csCore;
      const {
        ToolGroupManager,
        WindowLevelTool,
        ZoomTool,
        PanTool,
        LengthTool,
        StackScrollTool,
        Enums: ToolEnums,
        addTool,
        init: initTools,
      } = csTools;

      await csCore.init();
      await csDicomLoader.init({ maxWebWorkers: 2 });
      await initTools();

      // Registra ferramentas (ignora erro se já registradas)
      [WindowLevelTool, ZoomTool, PanTool, LengthTool, StackScrollTool].forEach((T) => {
        try { addTool(T); } catch (_) {}
      });

      const toolGroupId = `PACS_TG_${Date.now()}`;
      const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
      toolGroupRef.current = toolGroup;

      if (toolGroup) {
        toolGroup.addTool(WindowLevelTool.toolName);
        toolGroup.addTool(ZoomTool.toolName);
        toolGroup.addTool(PanTool.toolName);
        toolGroup.addTool(LengthTool.toolName);
        toolGroup.addTool(StackScrollTool.toolName);

        // Window/Level no botão esquerdo (padrão clínico)
        toolGroup.setToolActive(WindowLevelTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
        });
        // Zoom no botão direito
        toolGroup.setToolActive(ZoomTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }],
        });
        // Pan no botão do meio
        toolGroup.setToolActive(PanTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Auxiliary }],
        });
        // Scroll de slices com a roda do mouse
        toolGroup.setToolActive(StackScrollTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
        });
      }

      const engineId = `PACS_RE_${Date.now()}`;
      const engine = new RenderingEngine(engineId);
      setRenderingEngine(engine);

      if (!viewerRef.current) throw new Error("Elemento de visualização não encontrado");

      const viewportId = `PACS_VP_${Date.now()}`;
      engine.enableElement({
        viewportId,
        type: Enums.ViewportType.STACK,
        element: viewerRef.current,
        defaultOptions: { background: [0, 0, 0] as [number, number, number] },
      });

      const vp = engine.getViewport(viewportId) as any;
      setViewport(vp);

      if (toolGroup) toolGroup.addViewport(viewportId, engineId);

      await vp.setStack(ids, 0);
      vp.render();

      // Captura window/level inicial após renderização
      setTimeout(() => {
        try {
          const props = vp.getProperties();
          if (props?.voiRange) {
            const ww = props.voiRange.upper - props.voiRange.lower;
            const wc = (props.voiRange.upper + props.voiRange.lower) / 2;
            setWl({ ww: Math.round(ww), wc: Math.round(wc) });
          }
        } catch (_) {}
      }, 500);

      // Atualiza WL ao interagir
      viewerRef.current?.addEventListener("mousemove", () => {
        try {
          const props = vp.getProperties();
          if (props?.voiRange) {
            const ww = props.voiRange.upper - props.voiRange.lower;
            const wc = (props.voiRange.upper + props.voiRange.lower) / 2;
            setWl({ ww: Math.round(ww), wc: Math.round(wc) });
          }
        } catch (_) {}
      });

      setProgressPercent(100);
      setPhase("ready");
      toast.success(`${ids.length} imagem(ns) carregada(s)`);
    } catch (err: any) {
      console.error("[DicomViewer] Erro ao inicializar Cornerstone:", err);
      setError(err.message || "Erro ao inicializar visualizador");
      setPhase("error");
    }
  }, []);

  // Polling de progresso durante C-GET
  const pollProgress = useCallback((uid: string, expectedCount: number) => {
    let attempts = 0;
    const maxAttempts = 120; // 2 min máx
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) { clearInterval(interval); return; }
      try {
        const resp = await fetch(`/api/dicom-files/${uid}`);
        if (resp.ok) {
          const data = await resp.json();
          const received = data.count || 0;
          if (received > 0) {
            const pct = expectedCount > 0
              ? Math.min(80, Math.round((received / expectedCount) * 80))
              : Math.min(80, attempts * 2);
            setProgressPercent(pct);
            setDownloadProgress(
              expectedCount > 0
                ? `[2/4] Recebendo imagens: ${received} / ${expectedCount}...`
                : `[2/4] Recebendo imagens: ${received} recebida(s)...`
            );
          }
        }
      } catch (_) {}
    }, 1000);
    return interval;
  }, []);

  // Fluxo principal: C-GET → cache → Cornerstone
  const startViewer = useCallback(async () => {
    if (!studyUid) return;
    setPhase("downloading");
    setError(null);
    setProgressPercent(5);

    let progressInterval: ReturnType<typeof setInterval> | null = null;

    try {
      setDownloadProgress("[1/4] Estabelecendo associação DICOM com o PACS...");
      setProgressPercent(10);

      // Inicia polling de progresso (estimativa: 220 imagens para CT)
      progressInterval = pollProgress(studyUid, 0);

      const result = await startViewerMutation.mutateAsync({
        studyInstanceUid: studyUid,
        unit_id: urlUnitId,
      });

      if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }

      if (!result.success) {
        throw new Error("C-GET falhou — verifique IP, Porta e AE Title do PACS");
      }

      setProgressPercent(82);
      setDownloadProgress(`[2/4] ${result.fileCount} arquivo(s) DICOM recebido(s).`);

      // Lista arquivos do cache
      setProgressPercent(85);
      setDownloadProgress(`[3/4] Preparando ${result.fileCount} imagem(ns)...`);
      const listResp = await fetch(`/api/dicom-files/${studyUid}`);
      if (!listResp.ok) throw new Error("Arquivos DICOM não encontrados no cache após C-GET");

      const listData = await listResp.json();
      const files: string[] = listData.files || [];
      if (files.length === 0) throw new Error("Nenhum arquivo DICOM encontrado no cache.");

      const ids = files.map(
        (f: string) => `wadouri:${window.location.origin}/api/dicom-files/${studyUid}/${f}`
      );
      setImageIds(ids);
      setImageCount(ids.length);

      // Metadados
      const meta = await extractMetadataFromDicom(studyUid);
      setStudyInfo(meta);

      setProgressPercent(88);
      setDownloadProgress(`[4/4] Inicializando visualizador com ${ids.length} imagem(ns)...`);
      await initCornerstoneWithCache(ids);
    } catch (err: any) {
      if (progressInterval) clearInterval(progressInterval);
      console.error("[DicomViewer] Erro:", err);
      setError(err.message || "Erro ao carregar estudo DICOM");
      setPhase("error");
    }
  }, [studyUid, startViewerMutation, initCornerstoneWithCache, pollProgress]);

  useEffect(() => {
    if (studyUid) startViewer();
    return () => {
      if (renderingEngine) {
        try { renderingEngine.destroy(); } catch (_) {}
      }
      fetch(`/api/dicom-files/${studyUid}`, { method: "DELETE" }).catch(() => {});
    };
  }, [studyUid]);

  // Atualiza índice ao navegar com scroll (evento do Cornerstone)
  useEffect(() => {
    if (!viewerRef.current || !viewport) return;
    const el = viewerRef.current;
    const handler = () => {
      try {
        const idx = viewport.getCurrentImageIdIndex?.() ?? 0;
        setCurrentIndex(idx);
      } catch (_) {}
    };
    el.addEventListener("CORNERSTONE_STACK_VIEWPORT_NEW_IMAGE", handler);
    el.addEventListener("cornerstoneimagerendered", handler);
    return () => {
      el.removeEventListener("CORNERSTONE_STACK_VIEWPORT_NEW_IMAGE", handler);
      el.removeEventListener("cornerstoneimagerendered", handler);
    };
  }, [viewport]);

  const handleZoomIn = () => {
    if (!viewport) return;
    try {
      const camera = viewport.getCamera();
      viewport.setCamera({ ...camera, parallelScale: (camera.parallelScale || 1) * 0.8 });
      viewport.render();
    } catch (_) {}
  };

  const handleZoomOut = () => {
    if (!viewport) return;
    try {
      const camera = viewport.getCamera();
      viewport.setCamera({ ...camera, parallelScale: (camera.parallelScale || 1) * 1.2 });
      viewport.render();
    } catch (_) {}
  };

  const handleRotateCW = () => {
    if (!viewport) return;
    try {
      const props = viewport.getProperties();
      viewport.setProperties({ rotation: ((props.rotation || 0) + 90) % 360 });
      viewport.render();
    } catch (_) {}
  };

  const handleRotateCCW = () => {
    if (!viewport) return;
    try {
      const props = viewport.getProperties();
      viewport.setProperties({ rotation: ((props.rotation || 0) - 90 + 360) % 360 });
      viewport.render();
    } catch (_) {}
  };

  const handleFlipH = () => {
    if (!viewport) return;
    try {
      const props = viewport.getProperties();
      viewport.setProperties({ flipHorizontal: !props.flipHorizontal });
      viewport.render();
    } catch (_) {}
  };

  const handleFlipV = () => {
    if (!viewport) return;
    try {
      const props = viewport.getProperties();
      viewport.setProperties({ flipVertical: !props.flipVertical });
      viewport.render();
    } catch (_) {}
  };

  const handleReset = () => {
    if (!viewport) return;
    try {
      viewport.resetCamera();
      viewport.resetProperties();
      viewport.render();
    } catch (_) {}
  };

  const handlePrevImage = () => {
    if (!viewport || currentIndex === 0) return;
    try {
      const newIdx = currentIndex - 1;
      viewport.setImageIdIndex(newIdx);
      setCurrentIndex(newIdx);
      viewport.render();
    } catch (_) {}
  };

  const handleNextImage = () => {
    if (!viewport || currentIndex >= imageCount - 1) return;
    try {
      const newIdx = currentIndex + 1;
      viewport.setImageIdIndex(newIdx);
      setCurrentIndex(newIdx);
      viewport.render();
    } catch (_) {}
  };

  const handleOpenRadiant = () => {
    if (!studyUid) return;
    const radiantUrl = `radiant://?n=1&v=0020000D&v=${encodeURIComponent(studyUid)}`;
    window.open(radiantUrl, "_blank");
    toast.info("Tentando abrir no RadiAnt DICOM Viewer...", {
      description: "Certifique-se que o RadiAnt está instalado.",
    });
  };

  const isLoading = phase === "downloading" || phase === "rendering";
  const cornerstoneReady = phase === "ready";

  const toolCursor: Record<ActiveTool, string> = {
    WindowLevel: "crosshair",
    Zoom: "zoom-in",
    Pan: "grab",
    Length: "crosshair",
    StackScroll: "ns-resize",
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/pacs-query")}
            className="text-gray-300 hover:text-white hover:bg-gray-800 h-7 px-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>

          {studyInfo ? (
            <div className="flex items-center gap-2 ml-1 border-l border-gray-700 pl-3">
              <Badge className="text-xs bg-blue-700 text-white border-0 h-5 px-2">
                {studyInfo.modality}
              </Badge>
              <div>
                <div className="text-sm font-semibold text-white leading-tight">
                  {cleanPatientName(studyInfo.patientName)}
                </div>
                <div className="text-xs text-gray-400 leading-tight">
                  {formatDate(studyInfo.studyDate)}{studyInfo.studyDescription ? ` • ${studyInfo.studyDescription}` : ""}
                </div>
              </div>
            </div>
          ) : (
            <div className="ml-1 border-l border-gray-700 pl-3">
              <div className="text-xs text-gray-500">Paciente • Estudo DICOM</div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {imageCount > 0 && (
            <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded tabular-nums">
              {currentIndex + 1} / {imageCount}
            </span>
          )}
          {wl && cornerstoneReady && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded tabular-nums hidden sm:inline">
              WW:{wl.ww} WC:{wl.wc}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenRadiant}
            className="text-xs border-blue-700 text-blue-400 hover:bg-blue-900/40 h-7 px-2"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Abrir no RadiAnt
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar lateral esquerda */}
        <div className="flex flex-col gap-0.5 p-1.5 bg-gray-900 border-r border-gray-800 w-10 flex-shrink-0">
          {/* Ferramentas de interação */}
          <div className="text-[9px] text-gray-600 text-center mb-0.5 uppercase tracking-wide">Ferr.</div>
          <ToolButton
            icon={<SunMedium className="h-4 w-4" />}
            title="Window/Level (Brilho e Contraste)"
            onClick={() => switchTool("WindowLevel")}
            disabled={!cornerstoneReady}
            active={activeTool === "WindowLevel"}
          />
          <ToolButton
            icon={<ZoomIn className="h-4 w-4" />}
            title="Zoom"
            onClick={() => switchTool("Zoom")}
            disabled={!cornerstoneReady}
            active={activeTool === "Zoom"}
          />
          <ToolButton
            icon={<Move className="h-4 w-4" />}
            title="Pan (Mover imagem)"
            onClick={() => switchTool("Pan")}
            disabled={!cornerstoneReady}
            active={activeTool === "Pan"}
          />
          <ToolButton
            icon={<Ruler className="h-4 w-4" />}
            title="Medição de distância"
            onClick={() => switchTool("Length")}
            disabled={!cornerstoneReady}
            active={activeTool === "Length"}
          />
          <ToolButton
            icon={<MousePointer2 className="h-4 w-4" />}
            title="Scroll de Slices"
            onClick={() => switchTool("StackScroll")}
            disabled={!cornerstoneReady}
            active={activeTool === "StackScroll"}
          />

          <div className="border-t border-gray-700 my-1" />

          {/* Ações de transformação */}
          <div className="text-[9px] text-gray-600 text-center mb-0.5 uppercase tracking-wide">Img</div>
          <ToolButton icon={<ZoomIn className="h-4 w-4" />} title="Zoom In" onClick={handleZoomIn} disabled={!cornerstoneReady} />
          <ToolButton icon={<ZoomOut className="h-4 w-4" />} title="Zoom Out" onClick={handleZoomOut} disabled={!cornerstoneReady} />
          <ToolButton icon={<RotateCcw className="h-4 w-4" />} title="Girar 90° Esquerda" onClick={handleRotateCCW} disabled={!cornerstoneReady} />
          <ToolButton icon={<RotateCw className="h-4 w-4" />} title="Girar 90° Direita" onClick={handleRotateCW} disabled={!cornerstoneReady} />
          <ToolButton icon={<FlipHorizontal className="h-4 w-4" />} title="Espelhar Horizontal" onClick={handleFlipH} disabled={!cornerstoneReady} />
          <ToolButton icon={<FlipVertical className="h-4 w-4" />} title="Espelhar Vertical" onClick={handleFlipV} disabled={!cornerstoneReady} />

          <div className="border-t border-gray-700 my-1" />
          <ToolButton icon={<RefreshCw className="h-3.5 w-3.5 text-yellow-400" />} title="Resetar Visualização" onClick={handleReset} disabled={!cornerstoneReady} />
          <ToolButton icon={<Maximize2 className="h-3.5 w-3.5 text-gray-400" />} title="Tela cheia" onClick={() => document.documentElement.requestFullscreen?.()} disabled={false} />
        </div>

        {/* Área principal do viewer */}
        <div className="flex-1 relative bg-black">
          {/* Loading overlay com barra de progresso */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20 gap-4">
              <Loader2 className="h-10 w-10 text-blue-400 animate-spin" />
              <div className="w-72 text-center">
                <p className="text-gray-200 text-sm font-medium mb-1">
                  {phase === "downloading" ? "Baixando imagens via C-GET..." : "Inicializando visualizador..."}
                </p>
                <p className="text-gray-500 text-xs mb-3">{downloadProgress}</p>
                {/* Barra de progresso */}
                <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-gray-600 text-xs mt-1">{progressPercent}%</p>
              </div>
            </div>
          )}

          {/* Error overlay */}
          {phase === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 z-20 p-6">
              <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
              <p className="text-red-300 text-sm font-semibold mb-1">Erro ao carregar imagens DICOM</p>
              <p className="text-gray-500 text-xs text-center max-w-md mb-4">{error}</p>
              <div className="flex gap-2 mb-4 flex-wrap justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/pacs-query")}
                  className="border-gray-600 text-gray-300 hover:bg-gray-800"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Voltar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startViewer}
                  className="border-blue-600 text-blue-400 hover:bg-blue-900/40"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Tentar Novamente
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenRadiant}
                  className="border-green-700 text-green-400 hover:bg-green-900/40"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Abrir no RadiAnt
                </Button>
              </div>
              <div className="p-3 bg-gray-900 rounded-lg text-xs text-gray-400 max-w-md">
                <p className="font-medium text-gray-300 mb-1">Dicas:</p>
                <p>• Verifique se o PACS está acessível (IP + Porta + AE Title)</p>
                <p>• O PACS deve suportar C-GET (protocolo pull-based)</p>
                <p>• Use "Abrir no RadiAnt" como alternativa</p>
              </div>
            </div>
          )}

          {/* Elemento do Cornerstone */}
          <div
            ref={viewerRef}
            className="w-full h-full"
            style={{
              minHeight: "400px",
              cursor: cornerstoneReady ? toolCursor[activeTool] : "default",
            }}
          />

          {/* Navegação entre imagens */}
          {cornerstoneReady && imageCount > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevImage}
                disabled={currentIndex === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 bg-black/50 text-white hover:bg-black/80 rounded-full border border-gray-700 disabled:opacity-20"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextImage}
                disabled={currentIndex >= imageCount - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 bg-black/50 text-white hover:bg-black/80 rounded-full border border-gray-700 disabled:opacity-20"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
              {/* Indicador de slice */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 px-3 py-1 rounded-full text-xs text-gray-300 border border-gray-700 tabular-nums">
                {currentIndex + 1} / {imageCount}
              </div>
            </>
          )}

          {/* Badge da ferramenta ativa */}
          {cornerstoneReady && (
            <div className="absolute top-2 right-2 bg-blue-900/80 border border-blue-700 text-blue-200 text-xs px-2 py-0.5 rounded">
              {activeTool === "WindowLevel" && "W/L"}
              {activeTool === "Zoom" && "Zoom"}
              {activeTool === "Pan" && "Pan"}
              {activeTool === "Length" && "Régua"}
              {activeTool === "StackScroll" && "Scroll"}
            </div>
          )}
        </div>
      </div>

      {/* Barra de status inferior */}
      <div className="flex items-center justify-between px-3 py-1 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span>🖱 Esq: {activeTool === "WindowLevel" ? "W/L" : activeTool === "Zoom" ? "Zoom" : activeTool === "Pan" ? "Pan" : activeTool === "Length" ? "Medir" : "Scroll"}</span>
          <span>🖱 Dir: Zoom</span>
          <span>🖱 Meio: Pan</span>
          <span>⚙ Scroll: Slices</span>
        </div>
        {studyUid && (
          <span className="font-mono text-gray-700 hidden md:inline">
            UID: {studyUid.substring(0, 36)}{studyUid.length > 36 ? "…" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  title,
  onClick,
  disabled,
  active,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-7 w-7 rounded ${
        active
          ? "bg-blue-600 text-white hover:bg-blue-700 ring-1 ring-blue-400"
          : "text-gray-400 hover:text-white hover:bg-gray-700"
      } disabled:opacity-25`}
    >
      {icon}
    </Button>
  );
}
