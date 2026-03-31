import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
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
  ChevronUp,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  Move,
  SunMedium,
  Ruler,
  Layers,
  Maximize2,
  Archive,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ClipboardList,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface StudyInfo {
  patientName: string;
  studyDate: string;
  studyDescription: string;
  modality: string;
  studyInstanceUid: string;
}

interface DicomSeries {
  seriesUid: string;
  description: string;
  modality: string;
  seriesNumber: string;
  fileCount: number;
  files: string[];
  thumbnail: string | null;
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
  const [phase, setPhase] = useState<"idle" | "connecting" | "streaming" | "rendering" | "ready" | "error">("idle");
  const phaseRef = useRef<"idle" | "connecting" | "streaming" | "rendering" | "ready" | "error">("idle");
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
  // StackScroll como ferramenta padrão ao abrir
  const [activeTool, setActiveTool] = useState<ActiveTool>("StackScroll");
  const [wl, setWl] = useState<{ ww: number; wc: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pacsAeTitle, setPacsAeTitle] = useState<string>("DPACS");

  // ─── Cine (Play automático) ───────────────────────────────────────────────
  const [isCinePlaying, setIsCinePlaying] = useState(false);
  const [cineFps, setCineFps] = useState(8); // frames por segundo
  const cineIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cineIndexRef = useRef(0); // ref para evitar closure stale

  // Lista de imageIds acumulados durante o streaming
  const imageIdsRef = useRef<string[]>([]);
  const [imageIds, setImageIds] = useState<string[]>([]);

  // ─── Séries DICOM ──────────────────────────────────────────────────────────
  const [series, setSeries] = useState<DicomSeries[]>([]);
  const [activeSeries, setActiveSeries] = useState<string | null>(null);
  const [seriesLoaded, setSeriesLoaded] = useState(false);

  // ─── Anamnese ──────────────────────────────────────────────────────────────
  const [showAnamnesisPanel, setShowAnamnesisPanel] = useState(false);
  const anamnesisQuery = trpc.anamnesisSimple.getByStudy.useQuery(
    { studyInstanceUid: studyUid ?? "" },
    { enabled: !!studyUid }
  );
  // ─── Anotações persistentes ─────────────────────────────────────────────────
  const saveAnnotationMutation = trpc.annotations.save.useMutation();
  const deleteAnnotationMutation = trpc.annotations.delete.useMutation();
  const annotationsQuery = trpc.annotations.getByStudy.useQuery(
    { studyInstanceUid: studyUid ?? "" },
    { enabled: !!studyUid && phase === "ready" }
  );
  const annotationsLoadedRef = useRef(false);

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

      // StackScroll como ferramenta padrão no botão esquerdo
      toolGroup.setToolActive(StackScrollTool.toolName, {
        bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
      });
      toolGroup.setToolActive(ZoomTool.toolName, {
        bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }],
      });
      toolGroup.setToolActive(PanTool.toolName, {
        bindings: [{ mouseButton: ToolEnums.MouseBindings.Auxiliary }],
      });
      // Wheel também faz scroll
      toolGroup.setToolActive(StackScrollTool.toolName, {
        bindings: [
          { mouseButton: ToolEnums.MouseBindings.Primary },
          { mouseButton: ToolEnums.MouseBindings.Wheel },
        ],
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
    if (!vp) return;

    try {
      const currentIdx = vp.getCurrentImageIdIndex?.() ?? 0;
      await vp.setStack(updatedIds, currentIdx);
    } catch (_) {}
  }, [studyUid]);

  // ─── Carrega metadados do primeiro arquivo ────────────────────────────────
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

  // ─── Carrega lista de séries do estudo ────────────────────────────────────────────
  const loadSeries = useCallback(async () => {
    if (!studyUid || seriesLoaded) return;
    try {
      const resp = await fetch(`/api/dicom-series/${studyUid}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.success && Array.isArray(data.series) && data.series.length > 0) {
        setSeries(data.series);
        setActiveSeries(data.series[0].seriesUid);
        setSeriesLoaded(true);
      }
    } catch (_) {}
  }, [studyUid, seriesLoaded]);

  // ─── Troca a série ativa no viewport ────────────────────────────────────────────
  const switchSeries = useCallback(async (targetSeries: DicomSeries) => {
    const vp = viewportRef.current;
    if (!vp || !studyUid) return;
    setActiveSeries(targetSeries.seriesUid);
    const newIds = targetSeries.files.map(
      (f) => `wadouri:${window.location.origin}/api/dicom-files/${studyUid}/${f}`
    );
    imageIdsRef.current = newIds;
    setImageIds(newIds);
    setImageCount(newIds.length);
    setCurrentIndex(0);
    try {
      await vp.setStack(newIds, 0);
      vp.render();
      toast.info(`Série: ${targetSeries.description || targetSeries.seriesUid.slice(-8)} — ${targetSeries.fileCount} imagem(ns)`);
    } catch (err: any) {
      toast.error("Erro ao trocar série", { description: err.message });
    }
  }, [studyUid]);

  // ─── Fluxo principal via SSE ──────────────────────────────────────────────────────────
  const startStreamingViewer = useCallback(() => {
    if (!studyUid) return;

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

        if (!firstFileReceived) {
          firstFileReceived = true;
          renderFirstImage(filename).then(() => {
            loadMetadata();
          });
        } else {
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
              if (vp && phaseRef.current === "ready") {
                const currentIdx = vp.getCurrentImageIdIndex?.() ?? 0;
                await vp.setStack(finalIds, currentIdx);
              }

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
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      if (renderingEngineRef.current) {
        try { renderingEngineRef.current.destroy(); } catch (_) {}
      }
      // Para o cine ao desmontar
      if (cineIntervalRef.current) {
        clearInterval(cineIntervalRef.current);
        cineIntervalRef.current = null;
      }
    };
  }, [studyUid]);

  // ─── Carrega séries e anotações quando o viewer fica pronto ────────────────────────
  useEffect(() => {
    if (phase === "ready") {
      loadSeries();
    }
  }, [phase, loadSeries]);

  // ─── Restaura anotações salvas no Cornerstone ────────────────────────────────────
  useEffect(() => {
    if (!annotationsQuery.data || annotationsLoadedRef.current) return;
    if (annotationsQuery.data.length === 0) { annotationsLoadedRef.current = true; return; }
    try {
      const { annotation } = csTools;
      if (!annotation?.state) return;
      for (const ann of annotationsQuery.data) {
        try {
          const data = ann.annotation_data as Record<string, unknown>;
          if (data && typeof data === "object" && data.annotationUID) {
            annotation.state.addAnnotation(data as any, viewerRef.current!);
          }
        } catch (_) {}
      }
      annotationsLoadedRef.current = true;
      if (annotationsQuery.data.length > 0) {
        toast.info(`${annotationsQuery.data.length} anotação(es) restaurada(s)`, { duration: 3000 });
      }
      viewportRef.current?.render();
    } catch (_) {}
  }, [annotationsQuery.data]);

  // ─── Escuta eventos de criação/remoção de anotações e persiste no banco ──────────────
  useEffect(() => {
    if (!viewerRef.current || !studyUid) return;
    const el = viewerRef.current;

    const handleAnnotationCompleted = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail;
        const ann = detail?.annotation;
        if (!ann?.annotationUID) return;
        saveAnnotationMutation.mutate({
          studyInstanceUid: studyUid,
          annotationUid: ann.annotationUID,
          toolName: ann.metadata?.toolName ?? "Length",
          annotationData: ann as Record<string, unknown>,
          label: ann.data?.label ?? undefined,
        });
      } catch (_) {}
    };

    const handleAnnotationRemoved = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail;
        const ann = detail?.annotation;
        if (!ann?.annotationUID) return;
        deleteAnnotationMutation.mutate({ annotationUid: ann.annotationUID });
      } catch (_) {}
    };

    // Eventos do Cornerstone Tools
    el.addEventListener("CORNERSTONE_TOOLS_ANNOTATION_COMPLETED", handleAnnotationCompleted);
    el.addEventListener("CORNERSTONE_TOOLS_ANNOTATION_REMOVED", handleAnnotationRemoved);
    // Alias para versões diferentes do Cornerstone
    el.addEventListener("cornerstonetoolsannotationcompleted", handleAnnotationCompleted);
    el.addEventListener("cornerstonetoolsannotationremoved", handleAnnotationRemoved);

    return () => {
      el.removeEventListener("CORNERSTONE_TOOLS_ANNOTATION_COMPLETED", handleAnnotationCompleted);
      el.removeEventListener("CORNERSTONE_TOOLS_ANNOTATION_REMOVED", handleAnnotationRemoved);
      el.removeEventListener("cornerstonetoolsannotationcompleted", handleAnnotationCompleted);
      el.removeEventListener("cornerstonetoolsannotationremoved", handleAnnotationRemoved);
    };
  }, [studyUid, viewport, saveAnnotationMutation, deleteAnnotationMutation]);

  // ─── Atualiza índice ao navegar ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!viewerRef.current || !viewport) return;
    const el = viewerRef.current;
    const handler = () => {
      try {
        const idx = viewport.getCurrentImageIdIndex?.() ?? 0;
        setCurrentIndex(idx);
        cineIndexRef.current = idx;
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

    if (tool === "StackScroll") {
      // StackScroll: botão esquerdo + wheel
      tg.setToolActive(toolMap[tool], {
        bindings: [
          { mouseButton: ToolEnums.MouseBindings.Primary },
          { mouseButton: ToolEnums.MouseBindings.Wheel },
        ],
      });
    } else {
      tg.setToolActive(toolMap[tool], {
        bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
      });
      // Mantém wheel sempre como scroll
      try {
        tg.setToolActive(csTools.StackScrollTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
        });
      } catch (_) {}
    }
    setActiveTool(tool);
  }, []);

  // ─── Navegação entre slices ───────────────────────────────────────────────
  const goToSlice = useCallback((idx: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const total = imageIdsRef.current.length;
    if (total === 0) return;
    const clamped = Math.max(0, Math.min(total - 1, idx));
    try {
      vp.setImageIdIndex(clamped);
      setCurrentIndex(clamped);
      cineIndexRef.current = clamped;
      vp.render();
    } catch (_) {}
  }, []);

  const handlePrevImage = useCallback(() => goToSlice(currentIndex - 1), [currentIndex, goToSlice]);
  const handleNextImage = useCallback(() => goToSlice(currentIndex + 1), [currentIndex, goToSlice]);
  const handleFirstImage = useCallback(() => goToSlice(0), [goToSlice]);
  const handleLastImage = useCallback(() => goToSlice(imageCount - 1), [imageCount, goToSlice]);

  // ─── Cine (Play automático) ───────────────────────────────────────────────
  const startCine = useCallback(() => {
    if (cineIntervalRef.current) clearInterval(cineIntervalRef.current);
    setIsCinePlaying(true);
    cineIntervalRef.current = setInterval(() => {
      const total = imageIdsRef.current.length;
      if (total === 0) return;
      const next = (cineIndexRef.current + 1) % total;
      goToSlice(next);
    }, Math.round(1000 / cineFps));
  }, [cineFps, goToSlice]);

  const stopCine = useCallback(() => {
    if (cineIntervalRef.current) {
      clearInterval(cineIntervalRef.current);
      cineIntervalRef.current = null;
    }
    setIsCinePlaying(false);
  }, []);

  const toggleCine = useCallback(() => {
    if (isCinePlaying) stopCine();
    else startCine();
  }, [isCinePlaying, startCine, stopCine]);

  // Reinicia cine quando FPS muda
  useEffect(() => {
    if (isCinePlaying) {
      stopCine();
      startCine();
    }
  }, [cineFps]);

  // Para cine ao desmontar
  useEffect(() => () => stopCine(), []);

  // ─── Zoom / Rotação / Flip / Reset ───────────────────────────────────────
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

  // ─── RadiAnt ─────────────────────────────────────────────────────────────
  const handleOpenRadiant = () => {
    if (!studyUid) return;
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
    setIsExporting(true);
    try {
      const resp = await fetch(`/api/dicom-export/${studyUid}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${studyUid}.zip`;
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
  const showViewer = phase === "ready";
  const isBackgroundDownloading = showViewer && totalCount > 0 && imageCount < totalCount;

  const toolCursor: Record<ActiveTool, string> = {
    WindowLevel: "crosshair",
    Zoom: "zoom-in",
    Pan: "grab",
    Length: "crosshair",
    StackScroll: "ns-resize",
  };

  const toolLabel: Record<ActiveTool, string> = {
    WindowLevel: "W/L",
    Zoom: "Zoom",
    Pan: "Pan",
    Length: "Régua",
    StackScroll: "Scroll",
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white select-none">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
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
          {/* Botão Anamnese */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAnamnesisPanel(v => !v)}
            className={`text-xs h-7 px-2 ${
              anamnesisQuery.data
                ? 'border-emerald-700 text-emerald-400 hover:bg-emerald-900/40'
                : 'border-gray-600 text-gray-400 hover:bg-gray-800'
            } ${showAnamnesisPanel ? 'bg-gray-800' : ''}`}
            title={anamnesisQuery.data ? 'Anamnese registrada — clique para ver' : 'Sem anamnese registrada'}
          >
            <ClipboardList className="h-3 w-3 mr-1" />
            Anamnese
            {anamnesisQuery.data && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            )}
          </Button>
        </div>
      </div>
      {/* ── Painel de Anamnese (colapsável abaixo do header) ──────────────────── */}
      {showAnamnesisPanel && (
        <div className="flex-shrink-0 bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-start gap-4">
          <ClipboardList className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-emerald-400 mb-1">Indicação Clínica / Anamnese</p>
            {anamnesisQuery.isLoading ? (
              <p className="text-xs text-gray-500">Carregando...</p>
            ) : anamnesisQuery.data ? (
              <div className="space-y-1">
                {(anamnesisQuery.data.presets as string[])?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(anamnesisQuery.data.presets as string[]).map((p: string) => (
                      <span key={p} className="text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded px-1.5 py-0.5">{p}</span>
                    ))}
                  </div>
                )}
                <p className="text-sm text-gray-200 leading-relaxed">{anamnesisQuery.data.manual_text}</p>
                <p className="text-xs text-gray-600">
                  Registrado em: {new Date(anamnesisQuery.data.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">Nenhuma anamnese registrada para este estudo.</p>
            )}
          </div>
          <button
            onClick={() => setShowAnamnesisPanel(false)}
            className="text-gray-600 hover:text-gray-400 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* ── Corpo principal ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Toolbar lateral esquerda ──────────────────────────────────── */}
        <div className="flex flex-col gap-0.5 p-1.5 bg-gray-900 border-r border-gray-800 w-10 flex-shrink-0">

          {/* Ferramentas de interação */}
          <div className="text-[9px] text-gray-600 text-center mb-0.5 uppercase tracking-wide">Ferr.</div>

          <ToolButton
            icon={<SunMedium className="h-4 w-4" />}
            title="Window/Level — Ajuste de brilho e contraste (clique+arraste)"
            onClick={() => switchTool("WindowLevel")}
            disabled={!cornerstoneReady}
            active={activeTool === "WindowLevel"}
          />
          <ToolButton
            icon={<ZoomIn className="h-4 w-4" />}
            title="Zoom — Ampliar/reduzir (clique+arraste)"
            onClick={() => switchTool("Zoom")}
            disabled={!cornerstoneReady}
            active={activeTool === "Zoom"}
          />
          <ToolButton
            icon={<Move className="h-4 w-4" />}
            title="Pan — Mover imagem (clique+arraste)"
            onClick={() => switchTool("Pan")}
            disabled={!cornerstoneReady}
            active={activeTool === "Pan"}
          />
          <ToolButton
            icon={<Ruler className="h-4 w-4" />}
            title="Medição de distância (clique+arraste)"
            onClick={() => switchTool("Length")}
            disabled={!cornerstoneReady}
            active={activeTool === "Length"}
          />
          {/* Botão Scroll — destaque especial */}
          <ToolButton
            icon={<Layers className="h-4 w-4" />}
            title="Scroll de Slices — Navegar entre imagens (clique+arraste ↑↓ ou scroll do mouse)"
            onClick={() => switchTool("StackScroll")}
            disabled={!cornerstoneReady}
            active={activeTool === "StackScroll"}
          />

          <div className="border-t border-gray-700 my-1" />

          {/* Navegação rápida entre slices */}
          <div className="text-[9px] text-gray-600 text-center mb-0.5 uppercase tracking-wide">Nav.</div>
          <ToolButton
            icon={<SkipBack className="h-3.5 w-3.5" />}
            title="Primeira imagem"
            onClick={handleFirstImage}
            disabled={!cornerstoneReady || imageCount <= 1}
          />
          <ToolButton
            icon={<ChevronUp className="h-4 w-4" />}
            title="Imagem anterior (←)"
            onClick={handlePrevImage}
            disabled={!cornerstoneReady || currentIndex === 0}
          />
          <ToolButton
            icon={<ChevronDown className="h-4 w-4" />}
            title="Próxima imagem (→)"
            onClick={handleNextImage}
            disabled={!cornerstoneReady || currentIndex >= imageCount - 1}
          />
          <ToolButton
            icon={<SkipForward className="h-3.5 w-3.5" />}
            title="Última imagem"
            onClick={handleLastImage}
            disabled={!cornerstoneReady || imageCount <= 1}
          />

          {/* Cine Play/Pause */}
          <ToolButton
            icon={isCinePlaying
              ? <Pause className="h-4 w-4 text-yellow-400" />
              : <Play className="h-4 w-4 text-green-400" />
            }
            title={isCinePlaying ? "Pausar Cine" : "Play Cine — percorrer slices automaticamente"}
            onClick={toggleCine}
            disabled={!cornerstoneReady || imageCount <= 1}
            active={isCinePlaying}
          />

          <div className="border-t border-gray-700 my-1" />

          {/* Manipulação de imagem */}
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

        {/* ── Área principal do viewer ─────────────────────────────────────── */}
        <div className="flex-1 relative bg-black">
          {/* Loading overlay */}
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
                <Button variant="outline" size="sm" onClick={() => navigate("/pacs-query")} className="border-gray-600 text-gray-300 hover:bg-gray-800">
                  <ArrowLeft className="h-4 w-4 mr-1" />Voltar
                </Button>
                <Button variant="outline" size="sm" onClick={startStreamingViewer} className="border-blue-600 text-blue-400 hover:bg-blue-900/40">
                  <RefreshCw className="h-4 w-4 mr-1" />Tentar Novamente
                </Button>
                <Button variant="outline" size="sm" onClick={handleOpenRadiant} className="border-green-700 text-green-400 hover:bg-green-900/40">
                  <ExternalLink className="h-4 w-4 mr-1" />Abrir no RadiAnt
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

          {/* Canvas Cornerstone */}
          <div
            ref={viewerRef}
            className="w-full h-full"
            style={{
              minHeight: "400px",
              cursor: cornerstoneReady ? toolCursor[activeTool] : "default",
            }}
          />

          {/* Setas de navegação esquerda/direita (visíveis quando há múltiplas imagens) */}
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
                className="absolute right-14 top-1/2 -translate-y-1/2 h-9 w-9 bg-black/50 text-white hover:bg-black/80 rounded-full border border-gray-700 disabled:opacity-20"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}

          {/* Badge da ferramenta ativa */}
          {cornerstoneReady && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-gray-900/90 border border-gray-700 text-gray-300 text-xs px-3 py-0.5 rounded-full pointer-events-none">
              {activeTool === "StackScroll"
                ? "⬆⬇ Scroll de Slices — arraste ou use scroll do mouse"
                : `Ferramenta: ${toolLabel[activeTool]}`}
            </div>
          )}

          {/* Barra de progresso de slices clicável na parte inferior */}
          {cornerstoneReady && imageCount > 1 && (
            <div className="absolute bottom-0 left-0 right-14 h-6 flex items-center px-2 gap-2 bg-black/60">
              <span className="text-[10px] text-gray-500 tabular-nums w-12 text-right shrink-0">
                {currentIndex + 1}/{imageCount}
              </span>
              <input
                type="range"
                min={0}
                max={imageCount - 1}
                value={currentIndex}
                onChange={(e) => goToSlice(parseInt(e.target.value, 10))}
                className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
                style={{ accentColor: "#3b82f6" }}
              />
              {isBackgroundDownloading && (
                <span className="text-[10px] text-blue-400 tabular-nums shrink-0">
                  +{totalCount - imageCount}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Slider vertical de slices (lateral direita) ──────────────────── */}
        {cornerstoneReady && imageCount > 1 && (
          <div className="flex flex-col items-center justify-between py-2 px-1 bg-gray-900 border-l border-gray-800 w-10 flex-shrink-0 gap-1">
            {/* Botão topo */}
            <button
              onClick={handleFirstImage}
              disabled={currentIndex === 0}
              className="text-gray-500 hover:text-white disabled:opacity-20 p-0.5 rounded hover:bg-gray-700 transition-colors"
              title="Primeira imagem"
            >
              <ChevronUp className="h-4 w-4" />
            </button>

            {/* Slider vertical */}
            <div className="flex-1 flex items-center justify-center relative" style={{ minHeight: 80 }}>
              <input
                type="range"
                min={0}
                max={imageCount - 1}
                value={currentIndex}
                onChange={(e) => goToSlice(parseInt(e.target.value, 10))}
                className="cursor-pointer"
                style={{
                  writingMode: "vertical-lr" as any,
                  direction: "rtl" as any,
                  appearance: "slider-vertical" as any,
                  WebkitAppearance: "slider-vertical" as any,
                  width: 20,
                  height: "100%",
                  accentColor: "#3b82f6",
                }}
                title={`Slice ${currentIndex + 1} de ${imageCount}`}
              />
            </div>

            {/* Número atual */}
            <div className="text-[9px] text-gray-500 tabular-nums text-center leading-tight">
              <div className="text-blue-400 font-bold">{currentIndex + 1}</div>
              <div>/{imageCount}</div>
            </div>

            {/* Botão base */}
            <button
              onClick={handleLastImage}
              disabled={currentIndex >= imageCount - 1}
              className="text-gray-500 hover:text-white disabled:opacity-20 p-0.5 rounded hover:bg-gray-700 transition-colors"
              title="Última imagem"
            >
              <ChevronDown className="h-4 w-4" />
            </button>

            {/* Botão Cine */}
            <button
              onClick={toggleCine}
              disabled={imageCount <= 1}
              className={`p-0.5 rounded transition-colors ${
                isCinePlaying
                  ? "text-yellow-400 bg-yellow-900/30 hover:bg-yellow-900/50"
                  : "text-green-400 hover:text-green-300 hover:bg-gray-700"
              } disabled:opacity-20`}
              title={isCinePlaying ? "Pausar Cine" : "Play Cine"}
            >
              {isCinePlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>

      {/* ── Faixa de miniaturas de séries ──────────────────────────────────────────────────────── */}
      {series.length > 1 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border-t border-gray-800 overflow-x-auto flex-shrink-0" style={{ minHeight: 72 }}>
          <span className="text-[10px] text-gray-500 uppercase tracking-wide shrink-0">Séries</span>
          {series.map((s) => (
            <button
              key={s.seriesUid}
              onClick={() => switchSeries(s)}
              title={`${s.description || 'Série'} — ${s.fileCount} imagem(ns)`}
              className={`flex flex-col items-center gap-0.5 shrink-0 rounded p-1 border transition-all ${
                activeSeries === s.seriesUid
                  ? "border-blue-500 bg-blue-900/30"
                  : "border-gray-700 bg-gray-800 hover:border-gray-500 hover:bg-gray-700"
              }`}
            >
              <div className="relative bg-black rounded overflow-hidden" style={{ width: 48, height: 48 }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[9px] text-gray-400 font-mono text-center leading-tight px-1">
                    {s.modality || 'IMG'}
                    <br />
                    {s.fileCount}
                  </span>
                </div>
              </div>
              <span className="text-[9px] text-gray-400 max-w-[52px] truncate text-center leading-tight">
                {s.description ? s.description.substring(0, 8) : `Sér.${s.seriesNumber}`}
              </span>
              {activeSeries === s.seriesUid && (
                <div className="w-1 h-1 rounded-full bg-blue-400" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Barra de status inferior ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span>🖱 Esq: {toolLabel[activeTool]}</span>
          <span>🖱 Dir: Zoom</span>
          <span>🖱 Meio: Pan</span>
          <span>⚙ Scroll: Slices</span>
          {isCinePlaying && (
            <span className="text-yellow-400 flex items-center gap-1">
              <Play className="h-3 w-3" /> Cine {cineFps} fps
              <button onClick={() => setCineFps(f => Math.max(1, f - 2))} className="ml-1 px-1 bg-gray-800 rounded hover:bg-gray-700">−</button>
              <button onClick={() => setCineFps(f => Math.min(30, f + 2))} className="px-1 bg-gray-800 rounded hover:bg-gray-700">+</button>
            </span>
          )}
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
