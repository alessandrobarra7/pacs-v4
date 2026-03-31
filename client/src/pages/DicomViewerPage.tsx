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
  Download,
  Archive,
} from "lucide-react";
import { toast } from "sonner";

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
  const viewportRef = useRef<any>(null);
  const renderingEngineRef = useRef<any>(null);
  const cornerstoneInitRef = useRef(false);
  const sseRef = useRef<EventSource | null>(null);

  // Ler unit_id da query string (passado pelo admin_master)
  const urlUnitId = useMemo(() => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const uid = params.get("unit_id");
    return uid ? parseInt(uid, 10) : undefined;
  }, [location]);

  // ─── Estado de fase ───────────────────────────────────────────────────────
  // "idle"        → aguardando início
  // "connecting"  → SSE conectado, aguardando 1º arquivo
  // "streaming"   → recebendo arquivos, viewer já pode mostrar imagens
  // "rendering"   → inicializando Cornerstone
  // "ready"       → viewer pronto
  // "error"       → erro
  const [phase, setPhase] = useState<"idle" | "connecting" | "streaming" | "rendering" | "ready" | "error">("idle");
  // Ref para o phase — evita closure stale no addImageToStack
  // DEVE ser declarado ANTES do useEffect que o sincroniza
  const phaseRef = useRef<"idle" | "connecting" | "streaming" | "rendering" | "ready" | "error">("idle");
  // Mantém phaseRef sincronizado com phase para uso em callbacks
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const [downloadProgress, setDownloadProgress] = useState<string>("Aguardando...");
  const [progressPercent, setProgressPercent] = useState(0);
  const [receivedCount, setReceivedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [studyInfo, setStudyInfo] = useState<StudyInfo | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [viewport, setViewport] = useState<any>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>("WindowLevel");
  const [wl, setWl] = useState<{ ww: number; wc: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pacsAeTitle, setPacsAeTitle] = useState<string>("DPACS");

  // Lista de imageIds acumulados durante o streaming
  const imageIdsRef = useRef<string[]>([]);
  const [imageIds, setImageIds] = useState<string[]>([]);

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr.length !== 8) return dateStr || "";
    return `${dateStr.slice(6, 8)}/${dateStr.slice(4, 6)}/${dateStr.slice(0, 4)}`;
  };

  const cleanPatientName = (name: string) => {
    if (!name) return "-";
    return name.replace(/\^/g, " ").replace(/\s+\d{10,}$/g, "").trim();
  };

  // ─── Inicializa Cornerstone (apenas uma vez) ──────────────────────────────
  const ensureCornerstoneInit = useCallback(async () => {
    if (cornerstoneInitRef.current) return;
    cornerstoneInitRef.current = true;

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
    const workerCount = Math.min(6, Math.max(2, Math.floor((navigator.hardwareConcurrency || 4) / 2)));
    await csDicomLoader.init({ maxWebWorkers: workerCount });
    await initTools();

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
      toolGroup.setToolActive(WindowLevelTool.toolName, {
        bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
      });
      toolGroup.setToolActive(ZoomTool.toolName, {
        bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }],
      });
      toolGroup.setToolActive(PanTool.toolName, {
        bindings: [{ mouseButton: ToolEnums.MouseBindings.Auxiliary }],
      });
      toolGroup.setToolActive(StackScrollTool.toolName, {
        bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
      });
    }

    const engineId = `PACS_RE_${Date.now()}`;
    const engine = new RenderingEngine(engineId);
    renderingEngineRef.current = engine;

    if (!viewerRef.current) throw new Error("Elemento de visualização não encontrado");

    const viewportId = `PACS_VP_${Date.now()}`;
    engine.enableElement({
      viewportId,
      type: Enums.ViewportType.STACK,
      element: viewerRef.current,
      defaultOptions: { background: [0, 0, 0] as [number, number, number] },
    });

    const vp = engine.getViewport(viewportId) as any;
    viewportRef.current = vp;
    setViewport(vp);

    if (toolGroup) toolGroup.addViewport(viewportId, engineId);

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
  }, []);

  // ─── Renderiza a 1ª imagem assim que tiver pelo menos 1 arquivo ──────────
  const renderFirstImage = useCallback(async (firstFilename: string) => {
    try {
      setPhase("rendering");
      setDownloadProgress("Renderizando 1ª imagem...");
      await ensureCornerstoneInit();

      const vp = viewportRef.current;
      if (!vp) return;

      const firstId = `wadouri:${window.location.origin}/api/dicom-files/${studyUid}/${firstFilename}`;
      imageIdsRef.current = [firstId];
      setImageIds([firstId]);
      setImageCount(1);

      await vp.setStack([firstId], 0);
      vp.render();

      // Captura WL inicial
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

      setPhase("ready");
      toast.success("1ª imagem carregada — restante chegando em background...");
    } catch (err: any) {
      console.error("[DicomViewer] Erro ao renderizar 1ª imagem:", err);
      // Não seta error aqui — continua tentando com mais arquivos
    }
  }, [studyUid, ensureCornerstoneInit]);
  // ─── Adiciona imagens ao stack progressivamente ────────────────────────────
  const addImageToStack = useCallback(async (filename: string) => {
    const newId = `wadouri:${window.location.origin}/api/dicom-files/${studyUid}/${filename}`;
    if (imageIdsRef.current.includes(newId)) return;

    imageIdsRef.current = [...imageIdsRef.current, newId].sort();
    const updatedIds = imageIdsRef.current;
    setImageIds(updatedIds);
    setImageCount(updatedIds.length);

    const vp = viewportRef.current;
    // Atualiza o stack sempre que o viewport existir (sem depender do phase)
    // O viewport só existe após renderFirstImage ser chamado
    if (!vp) return;

    try {
      const currentIdx = vp.getCurrentImageIdIndex?.() ?? 0;
      await vp.setStack(updatedIds, currentIdx);
      // Não re-renderiza automaticamente para não interromper a navegação do usuário
    } catch (_) {}
  }, [studyUid]); // ─── Carrega metadados do primeiro arquivo ────────────────────────────────
  const loadMetadata = useCallback(async () => {
    try {
      const resp = await fetch(`/api/dicom-files/${studyUid}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.metadata?.patientName) {
          setStudyInfo({
            patientName: data.metadata.patientName || "Paciente",
            studyDate: data.metadata.studyDate || "",
            studyDescription: data.metadata.studyDescription || "Estudo DICOM",
            modality: data.metadata.modality || "-",
            studyInstanceUid: studyUid!,
          });
        }
      }
    } catch (_) {}
  }, [studyUid]);

  // ─── Fluxo principal via SSE ──────────────────────────────────────────────
  const startStreamingViewer = useCallback(() => {
    if (!studyUid) return;

    // Fecha SSE anterior se existir
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    setPhase("connecting");
    setError(null);
    setProgressPercent(5);
    setReceivedCount(0);
    setTotalCount(0);
    setDownloadProgress("Conectando ao PACS...");
    imageIdsRef.current = [];
    setImageIds([]);
    setImageCount(0);
    cornerstoneInitRef.current = false;

    let firstFileReceived = false;
    let localTotal = 0;
    let localReceived = 0;

    const sse = new EventSource(`/api/dicom-stream/${studyUid}`);
    sseRef.current = sse;

    sse.addEventListener("status", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.phase === "connecting") {
          setDownloadProgress("Conectando ao PACS...");
          setProgressPercent(8);
        } else if (data.phase === "downloading") {
          setPhase("streaming");
          setDownloadProgress(`Baixando imagens do PACS...`);
          setProgressPercent(10);
          if (data.total) {
            localTotal = data.total;
            setTotalCount(data.total);
          }
          if (data.pacsAeTitle) setPacsAeTitle(data.pacsAeTitle);
        } else if (data.phase === "cached") {
          setPhase("streaming");
          setDownloadProgress(`Cache encontrado: ${data.total} imagens`);
          localTotal = data.total || 0;
          setTotalCount(localTotal);
          if (data.pacsAeTitle) setPacsAeTitle(data.pacsAeTitle);
        }
      } catch (_) {}
    });

    sse.addEventListener("file", (e) => {
      try {
        const data = JSON.parse(e.data);
        const { filename, total } = data;
        if (!filename) return;

        localReceived++;
        if (total && total > localTotal) {
          localTotal = total;
          setTotalCount(total);
        }
        setReceivedCount(localReceived);

        const pct = localTotal > 0
          ? Math.min(85, 10 + Math.round((localReceived / localTotal) * 75))
          : Math.min(85, 10 + localReceived * 2);
        setProgressPercent(pct);
        setDownloadProgress(
          localTotal > 0
            ? `Recebendo: ${localReceived} / ${localTotal} imagens`
            : `Recebendo: ${localReceived} imagem(ns)...`
        );

        // Renderiza a 1ª imagem imediatamente
        if (!firstFileReceived) {
          firstFileReceived = true;
          renderFirstImage(filename).then(() => {
            // Após renderizar a 1ª, carrega metadados
            loadMetadata();
          });
        } else {
          // Adiciona ao stack progressivamente
          addImageToStack(filename);
        }
      } catch (_) {}
    });

    sse.addEventListener("complete", (e) => {
      try {
        const data = JSON.parse(e.data);
        sse.close();
        sseRef.current = null;

        if (data.total === 0) {
          setError("Nenhuma imagem recebida do PACS. Verifique a configuração.");
          setPhase("error");
          return;
        }

        setProgressPercent(100);
        setDownloadProgress(`${data.total} imagem(ns) carregada(s)`);

        // Garante que o stack final está completo
        setTimeout(async () => {
          try {
            const resp = await fetch(`/api/dicom-files/${studyUid}`);
            if (resp.ok) {
              const listData = await resp.json();
              const files: string[] = (listData.files || []).sort();
              const finalIds = files.map(
                (f: string) => `wadouri:${window.location.origin}/api/dicom-files/${studyUid}/${f}`
              );
              imageIdsRef.current = finalIds;
              setImageIds(finalIds);
              setImageCount(finalIds.length);

              const vp = viewportRef.current;
              // Usa phaseRef para evitar closure stale
              if (vp && phaseRef.current === "ready") {
                const currentIdx = vp.getCurrentImageIdIndex?.() ?? 0;
                await vp.setStack(finalIds, currentIdx);
              }

              // Metadados finais
              if (listData.metadata?.patientName) {
                setStudyInfo({
                  patientName: listData.metadata.patientName || "Paciente",
                  studyDate: listData.metadata.studyDate || "",
                  studyDescription: listData.metadata.studyDescription || "Estudo DICOM",
                  modality: listData.metadata.modality || "-",
                  studyInstanceUid: studyUid!,
                });
              }
            }
          } catch (_) {}
        }, 500);

        toast.success(`Download completo: ${data.total} imagem(ns)`);
      } catch (_) {}
    });

    sse.addEventListener("error", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data || "{}");
        setError(data.message || "Erro ao carregar imagens do PACS");
        setPhase("error");
      } catch {
        // SSE nativo error (sem dados) — pode ser desconexão normal
        if (phase !== "ready") {
          setError("Conexão com o servidor interrompida. Tente novamente.");
          setPhase("error");
        }
      }
      sse.close();
      sseRef.current = null;
    });

  }, [studyUid, renderFirstImage, addImageToStack, loadMetadata, phase]);

  // ─── Inicia ao montar ────────────────────────────────────────────────────
  useEffect(() => {
    if (studyUid) startStreamingViewer();
    return () => {
      // Fecha SSE
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      // Destroi Cornerstone
      if (renderingEngineRef.current) {
        try { renderingEngineRef.current.destroy(); } catch (_) {}
      }
      // Cache mantido no servidor por 30min de inatividade (limpeza automática por timer)
      // Não deletar ao fechar o viewer para permitir reabrir instantaneamente
    };
  }, [studyUid]);

  // ─── Atualiza índice ao navegar com scroll ────────────────────────────────
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

  // ─── Ferramentas ─────────────────────────────────────────────────────────
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
    const allTools: ActiveTool[] = ["WindowLevel", "Zoom", "Pan", "Length", "StackScroll"];
    allTools.forEach((t) => {
      try { tg.setToolPassive(toolMap[t]); } catch (_) {}
    });
    tg.setToolActive(toolMap[tool], {
      bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
    });
    setActiveTool(tool);
  }, []);

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
    // Protocolo correto: -paet AE_TITLE -pstv 0020000D "STUDY_UID"
    // O RadiAnt precisa ter o PACS configurado localmente com o mesmo AE Title
    const aeTitle = pacsAeTitle || "DPACS";
    const encodedUid = encodeURIComponent(`"${studyUid}"`);
    const radiantUrl = `radiant://?n=paet&v=${aeTitle}&n=pstv&v=0020000D&v=${encodedUid}`;
    window.location.href = radiantUrl;
    toast.info("Abrindo no RadiAnt DICOM Viewer...", {
      description: `O RadiAnt deve estar instalado e o PACS configurado com AE Title: ${aeTitle}`,
      duration: 6000,
    });
  };

  // ─── Exportação ZIP ───────────────────────────────────────────────────────
  const handleExportZip = async () => {
    if (!studyUid || isExporting) return;
    if (imageCount === 0) {
      toast.error("Nenhuma imagem disponível para exportar. Aguarde o download.");
      return;
    }
    setIsExporting(true);
    toast.info("Gerando arquivo ZIP...", { description: `${imageCount} imagem(ns) DICOM` });
    try {
      const resp = await fetch(`/api/dicom-export/${studyUid}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro ao gerar ZIP" }));
        throw new Error(err.error || "Erro ao gerar ZIP");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const patientLabel = studyInfo ? cleanPatientName(studyInfo.patientName).replace(/\s+/g, "_") : "DICOM";
      a.href = url;
      a.download = `DICOM_${patientLabel}_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("ZIP baixado com sucesso!", {
        description: "Abra no RadiAnt, OsiriX ou Horos.",
      });
    } catch (err: any) {
      toast.error("Erro ao exportar ZIP", { description: err.message });
    } finally {
      setIsExporting(false);
    }
  };

  const isLoading = phase === "connecting" || phase === "streaming" || phase === "rendering";
  const cornerstoneReady = phase === "ready";

  // Mostra o viewer assim que a 1ª imagem chegar (fase "ready" mesmo com download em andamento)
  const showViewer = phase === "ready";

  // Progresso do download em background (após 1ª imagem renderizada)
  const isBackgroundDownloading = showViewer && totalCount > 0 && imageCount < totalCount;

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
          {/* Logo clicável */}
          <button
            onClick={() => navigate("/pacs-query")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity focus:outline-none"
            title="Voltar para listagem de exames"
          >
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310419663028509564/cTdrattvNQ95XCgX9zeyNM/lauds_logo_branco_final_c960f283.png"
              alt="Lauds"
              className="object-contain"
              style={{ height: 36 }}
            />
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-white font-bold text-sm tracking-tight">lauds</span>
              <span className="text-white/40 text-xs">Gestão de Laudos Radiológicos</span>
            </div>
          </button>
          <div className="w-px h-5 bg-gray-700 mx-1" />
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
          {/* Indicador de download em background */}
          {isBackgroundDownloading && (
            <div className="flex items-center gap-1.5 bg-blue-900/40 border border-blue-800 rounded px-2 py-0.5">
              <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />
              <span className="text-xs text-blue-300 tabular-nums">
                {imageCount} / {totalCount}
              </span>
            </div>
          )}

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

          {/* Botão Exportar ZIP */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportZip}
            disabled={isExporting || imageCount === 0}
            className="text-xs border-green-700 text-green-400 hover:bg-green-900/40 h-7 px-2"
            title="Baixar imagens DICOM para abrir no RadiAnt, OsiriX ou Horos"
          >
            {isExporting ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Archive className="h-3 w-3 mr-1" />
            )}
            Exportar ZIP
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenRadiant}
            className="text-xs border-blue-700 text-blue-400 hover:bg-blue-900/40 h-7 px-2"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            RadiAnt
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar lateral esquerda */}
        <div className="flex flex-col gap-0.5 p-1.5 bg-gray-900 border-r border-gray-800 w-10 flex-shrink-0">
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
          {/* Loading overlay — apenas enquanto aguarda a 1ª imagem */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20 gap-4">
              <Loader2 className="h-10 w-10 text-blue-400 animate-spin" />
              <div className="w-80 text-center">
                <p className="text-gray-200 text-sm font-medium mb-1">
                  {phase === "connecting" && "Conectando ao PACS..."}
                  {phase === "streaming" && "Baixando imagens..."}
                  {phase === "rendering" && "Renderizando 1ª imagem..."}
                </p>
                <p className="text-gray-500 text-xs mb-3">{downloadProgress}</p>

                {/* Barra de progresso */}
                <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden mb-1">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-gray-600 text-xs">
                  {totalCount > 0
                    ? `${receivedCount} / ${totalCount} imagens (${progressPercent}%)`
                    : `${progressPercent}%`}
                </p>

                {/* Dica de performance */}
                {phase === "streaming" && receivedCount === 0 && (
                  <p className="text-gray-700 text-xs mt-3">
                    A 1ª imagem aparecerá assim que chegar do PACS...
                  </p>
                )}
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
                  onClick={startStreamingViewer}
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
                {isBackgroundDownloading && (
                  <span className="text-blue-400 ml-1">({totalCount} total)</span>
                )}
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
