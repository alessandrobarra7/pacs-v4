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
  FileText,
  Mic,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PatientAttachmentsModal } from "@/components/PatientAttachmentsModal";
import { AudioReportsModal } from "@/components/AudioReportsModal";
import { Paperclip } from "lucide-react";
import SlaCountdown, { type ReadinessData } from "@/components/SlaCountdown";

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
const RADIANT_ASSISTANT_INSTALLER_PATH = "/api/radiant-assistant-installer";

export function DicomViewerPage() {
  const { studyUid } = useParams<{ studyUid: string }>();
  const [location, navigate] = useLocation();
  const viewerRef = useRef<HTMLDivElement>(null);
  const toolGroupRef = useRef<any>(null);
  const toolGroupIdRef = useRef<string | null>(null); // FIX P1: guardar ID para destroyToolGroup no cleanup
  const viewportRef = useRef<any>(null);
  const renderingEngineRef = useRef<any>(null);
  const cornerstoneInitRef = useRef(false);
  const sseRef = useRef<EventSource | null>(null);

  // Ler unitId da query string (passado pelo admin_master via ?unitId=X ou ?unit_id=X)
  const urlUnitId = useMemo(() => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const uid = params.get("unitId") || params.get("unit_id");
    return uid ? parseInt(uid, 10) : undefined;
  }, [location]);

  // Permissões granulares também são aplicadas aos atalhos do viewer mobile.
  const { data: currentUser } = trpc.auth.me.useQuery();
  const viewerUnitId = urlUnitId ?? currentUser?.unit_id ?? undefined;
  const { data: viewerPermissions } = trpc.units.myPermissions.useQuery(
    { unitId: viewerUnitId ?? 0 },
    { enabled: !!viewerUnitId && !!currentUser }
  );
  const canOpenReport = currentUser?.role === "admin_master" || viewerPermissions?.edit_reports === true;
  const canAccessClinicalMedia = currentUser?.role === "medico" || currentUser?.role === "operador";
  const canViewAttachments = Boolean(currentUser?.id);

  // ─── Estado de fase ───────────────────────────────────────────────────────
  const [phase, setPhase] = useState<"idle" | "connecting" | "streaming" | "rendering" | "ready" | "error">("idle");
  const phaseRef = useRef<"idle" | "connecting" | "streaming" | "rendering" | "ready" | "error">("idle");
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const setViewerPhase = useCallback((nextPhase: "idle" | "connecting" | "streaming" | "rendering" | "ready" | "error") => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);
  const [downloadProgress, setDownloadProgress] = useState<string>("Aguardando...");
  const [progressPercent, setProgressPercent] = useState(0);
  const [receivedCount, setReceivedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [studyInfo, setStudyInfo] = useState<StudyInfo | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [viewport, setViewport] = useState<any>(null);
  const isLoading = phase === "connecting" || phase === "streaming" || phase === "rendering";
  const isBackgroundDownloading = phase === "ready" && totalCount > 0 && imageCount < totalCount;
  // StackScroll como ferramenta padrão ao abrir
  const [activeTool, setActiveTool] = useState<ActiveTool>("StackScroll");
  const [wl, setWl] = useState<{ ww: number; wc: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [launchingViewer, setLaunchingViewer] = useState<string | null>(null);
  const [isActivatingRadiant, setIsActivatingRadiant] = useState(false);
  const [isReloadingStudy, setIsReloadingStudy] = useState(false);
  const [pacsAeTitle, setPacsAeTitle] = useState<string>("DPACS");

  // ─── Cine (Play automático) ───────────────────────────────────────────────
  const [isCinePlaying, setIsCinePlaying] = useState(false);
  const [cineFps, setCineFps] = useState(8); // frames por segundo
  // BUG-3 FIX: usar number (retorno de requestAnimationFrame) em vez de setInterval
  const cineIntervalRef = useRef<number | null>(null);
  const cineIndexRef = useRef(0); // ref para evitar closure stale

  // Lista de imageIds acumulados durante o streaming
  const imageIdsRef = useRef<string[]>([]);
  const imageIdsSetRef = useRef<Set<string>>(new Set()); // FIX P3: Set para checagem O(1) de duplicatas
  const [imageIds, setImageIds] = useState<string[]>([]);
  // BUG-1 FIX: refs para batch de setStack (evita O(n²) durante streaming de TC)
  const pendingIdsRef = useRef<string[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingProgressRef = useRef({ received: 0, total: 0 });
  const streamingProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Séries DICOM ──────────────────────────────────────────────────────────
  const [series, setSeries] = useState<DicomSeries[]>([]);
  const [activeSeries, setActiveSeries] = useState<string | null>(null);
  const [seriesLoaded, setSeriesLoaded] = useState(false);
  const seriesLoadedRef = useRef(false); // FIX P4: ref para evitar closure stale no guard de loadSeries

  const flushStreamingProgress = useCallback(() => {
    streamingProgressTimerRef.current = null;
    const { received, total } = streamingProgressRef.current;
    setReceivedCount(received);
    if (total > 0) setTotalCount(total);
    const pct = total > 0
      ? Math.min(85, 10 + Math.round((received / total) * 75))
      : Math.min(85, 10 + received * 2);
    setProgressPercent(pct);
    setDownloadProgress(total > 0
      ? `Recebendo: ${received} / ${total} imagens`
      : `Recebendo: ${received} imagem(ns)...`);
  }, []);

  const scheduleStreamingProgress = useCallback((received: number, total: number) => {
    streamingProgressRef.current = { received, total };
    if (streamingProgressTimerRef.current) return;
    streamingProgressTimerRef.current = setTimeout(flushStreamingProgress, 150);
  }, [flushStreamingProgress]);

  // ─── Anamnese ──────────────────────────────────────────────────────────────
  const [showAnamnesisPanel, setShowAnamnesisPanel] = useState(false);
  const anamnesisQuery = trpc.anamnesisSimple.getByStudy.useQuery(
    { studyInstanceUid: studyUid ?? "" },
    { enabled: !!studyUid }
  );

  // ─── Anexos e Áudios do Paciente no Viewer ─────────────────────────────────
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const { data: viewerAttachments = [], refetch: refetchViewerAttachments } = trpc.annotations.list.useQuery(
    { study_instance_uid: studyUid ?? "" },
    { enabled: !!studyUid && canViewAttachments }
  );
  const { data: viewerAudios = [], refetch: refetchViewerAudios } = trpc.audioReports.list.useQuery(
    { study_instance_uid: studyUid ?? "" },
    { enabled: !!studyUid && canAccessClinicalMedia }
  );

  function PatientViewerAttachmentsButton() {
    if (!canViewAttachments) return null;
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowAttachmentsModal(true)}
        className={`text-xs h-7 px-2 ${
          viewerAttachments.length > 0
            ? 'border-blue-700 text-blue-400 hover:bg-blue-900/40'
            : 'border-gray-600 text-gray-400 hover:bg-gray-800'
        }`}
        title="Ver anexos e fotos do paciente"
      >
        <Paperclip className="h-3 w-3 mr-1" />
        Anexos ({viewerAttachments.length})
      </Button>
    );
  }

  function PatientViewerAudioButton() {
    if (!canAccessClinicalMedia) return null;
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowAudioModal(true)}
        className={`text-xs h-7 px-2 ${
          viewerAudios.length > 0
            ? 'border-purple-700 text-purple-400 hover:bg-purple-900/40'
            : 'border-gray-600 text-gray-400 hover:bg-gray-800'
        }`}
        title="Ouvir ou gravar áudios de laudo falado"
      >
        <Mic className="h-3 w-3 mr-1" />
        Áudios ({viewerAudios.length})
      </Button>
    );
  }

  // ─── SLA Readiness ─────────────────────────────────────────────────────────
  const { data: slaReadiness, refetch: refetchSlaReadiness } = trpc.sla.getByStudy.useQuery(
    { studyInstanceUid: studyUid ?? "", unitId: urlUnitId ?? 0 },
    { enabled: !!studyUid && !!urlUnitId, staleTime: 30_000 }
  );
  const hasAnamnesis = !!anamnesisQuery.data?.manual_text;
  // Metadados editados pelo técnico (nome do paciente, descrição, notas)
  const studyMetaQuery = trpc.studyMetadata.get.useQuery(
    { studyInstanceUid: studyUid ?? "" },
    { enabled: !!studyUid }
  );
  const studyMeta = studyMetaQuery.data as any;
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
    toolGroupIdRef.current = toolGroupId; // FIX P1: salvar ID para destruir no cleanup
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

    // FIX P5: detectar perda de contexto WebGL — comum em abas inativas por muito tempo
    // ou quando a GPU fica sem memória com múltiplos estudos abertos
    const canvas = viewerRef.current?.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('webglcontextlost', (e: Event) => {
        e.preventDefault(); // necessário para permitir restauração posterior
        console.warn('[DicomViewer] Contexto WebGL perdido');
        setError('O visualizador perdeu o contexto gráfico. Clique em "Recarregar" para continuar.');
        setPhase('error');
      });
      canvas.addEventListener('webglcontextrestored', () => {
        console.info('[DicomViewer] Contexto WebGL restaurado');
        setError('Contexto gráfico restaurado. Clique em "Recarregar" para continuar.');
      });
    }

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
      setViewerPhase("rendering");
      setDownloadProgress("Renderizando 1ª imagem...");
      await ensureCornerstoneInit();

      const vp = viewportRef.current;
      if (!vp) throw new Error("Viewport DICOM não foi inicializado.");

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

      setViewerPhase("ready");
      toast.success("1ª imagem carregada — restante chegando em background...");
    } catch (err: any) {
      console.error("[DicomViewer] Erro ao renderizar 1ª imagem:", err);
      setError("Não foi possível renderizar a primeira imagem deste estudo.");
      setViewerPhase("error");
    }
  }, [studyUid, ensureCornerstoneInit, setViewerPhase]);

  // ─── Adiciona imagens ao stack progressivamente (batch para evitar O(n²)) ─────────────
  // Agrupa imagens em janelas maiores para reduzir a reconstrução repetida da pilha
  // durante a chegada de estudos grandes, sem atrasar a primeira imagem.
  const addImageToStack = useCallback((filename: string) => {
    const newId = `wadouri:${window.location.origin}/api/dicom-files/${studyUid}/${filename}`;
    // FIX P3: checagem O(1) via Set em vez de includes() O(n)
    if (imageIdsSetRef.current.has(newId)) return;
    imageIdsSetRef.current.add(newId);
    pendingIdsRef.current.push(newId);

    // Cancela o timer anterior e agenda um novo flush
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    batchTimerRef.current = setTimeout(async () => {
      if (pendingIdsRef.current.length === 0) return;
      // Mantém a ordem emitida pelo backend. O backend já entrega os arquivos
      // ordenados por série, InstanceNumber e posição espacial DICOM.
      imageIdsRef.current = [...imageIdsRef.current, ...pendingIdsRef.current];
      pendingIdsRef.current = [];
      // FIX P3: manter o Set sincronizado com o array (já foram adicionados no has() acima)
      const updatedIds = imageIdsRef.current;
      setImageIds([...updatedIds]);
      setImageCount(updatedIds.length);
      const vp = viewportRef.current;
      if (!vp) return;
      try {
        const currentIdx = vp.getCurrentImageIdIndex?.() ?? 0;
        await vp.setStack(updatedIds, currentIdx);
      } catch (_) {}
    }, 750);
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
    // FIX P4: usar seriesLoadedRef.current em vez de seriesLoaded (evita closure stale)
    if (!studyUid || seriesLoadedRef.current) return;
    try {
      const resp = await fetch(`/api/dicom-series/${studyUid}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.success && Array.isArray(data.series) && data.series.length > 0) {
        setSeries(data.series);
        setActiveSeries(data.series[0].seriesUid);
        seriesLoadedRef.current = true; // FIX P4: resetar guard para novo estudo
        setSeriesLoaded(true);
      }
    } catch (_) {}
  }, [studyUid]); // FIX P4: removido seriesLoaded das deps — agora usa seriesLoadedRef.current

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

    setViewerPhase("connecting");
    setError(null);
    setProgressPercent(5);
    setReceivedCount(0);
    setTotalCount(0);
    setDownloadProgress("Conectando ao PACS...");
    imageIdsRef.current = [];
    imageIdsSetRef.current.clear(); // FIX P3: limpar Set ao reiniciar o viewer
    streamingProgressRef.current = { received: 0, total: 0 };
    if (streamingProgressTimerRef.current) {
      clearTimeout(streamingProgressTimerRef.current);
      streamingProgressTimerRef.current = null;
    }
    setImageIds([]);
    setImageCount(0);
    cornerstoneInitRef.current = false;
    seriesLoadedRef.current = false; // FIX P4: resetar guard ao reiniciar — permite recarregar séries

    let firstFileReceived = false;
    let firstImageRender: Promise<void> | null = null;
    let localTotal = 0;
    let localReceived = 0;

    const unitSuffix = urlUnitId ? `?unitId=${urlUnitId}` : '';
    const sse = new EventSource(`/api/dicom-stream/${studyUid}${unitSuffix}`);
    sseRef.current = sse;

    sse.addEventListener("status", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.phase === "connecting") {
          setDownloadProgress("Conectando ao PACS...");
          setProgressPercent(8);
        } else if (data.phase === "downloading") {
          if (phaseRef.current === "connecting" || phaseRef.current === "streaming") {
            setViewerPhase("streaming");
          }
          setDownloadProgress(`Baixando imagens do PACS...`);
          setProgressPercent(10);
          if (data.total) {
            localTotal = data.total;
            setTotalCount(data.total);
          }
          if (data.pacsAeTitle) setPacsAeTitle(data.pacsAeTitle);
        } else if (data.phase === "cached") {
          if (phaseRef.current === "connecting" || phaseRef.current === "streaming") {
            setViewerPhase("streaming");
          }
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
        scheduleStreamingProgress(localReceived, localTotal);

        if (!firstFileReceived) {
          firstFileReceived = true;
          firstImageRender = renderFirstImage(filename);
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
        streamingProgressRef.current = { received: data.total, total: data.total };
        if (streamingProgressTimerRef.current) {
          clearTimeout(streamingProgressTimerRef.current);
        }
        flushStreamingProgress();

        setTimeout(async () => {
          try {
            await firstImageRender;
            if (phaseRef.current === "error") return;
            const resp = await fetch(`/api/dicom-files/${studyUid}`);
            if (resp.ok) {
              const listData = await resp.json();
              // A API devolve os arquivos na ordem clínica DICOM; não reordenar
              // pelo nome do SOPInstanceUID, pois isso mistura as instâncias.
              const files: string[] = listData.files || [];
              const finalIds = files.map(
                (f: string) => `wadouri:${window.location.origin}/api/dicom-files/${studyUid}/${f}`
              );
              imageIdsRef.current = finalIds;
              setImageIds(finalIds);
              setImageCount(finalIds.length);

              const vp = viewportRef.current;
              if (vp) {
                const currentIdx = vp.getCurrentImageIdIndex?.() ?? 0;
                await vp.setStack(finalIds, currentIdx);
                vp.render();
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
        setViewerPhase("error");
      } catch {
        // FIX P2: usar phaseRef.current em vez de phase (evita closure stale)
        if (phaseRef.current !== "ready") {
          setError("Conexão com o servidor interrompida. Tente novamente.");
          setViewerPhase("error");
        }
      }
      sse.close();
      sseRef.current = null;
    });
  }, [studyUid, renderFirstImage, addImageToStack, scheduleStreamingProgress, flushStreamingProgress, setViewerPhase]);
  // BUG-4 FIX: removido `phase` das dependências — usar phaseRef.current dentro
  // do callback (já é uma ref e não causa recriação). A recriação por mudança de
  // phase causava closures stale nos event listeners do SSE durante o streaming.

  // ─── Inicia ao montar ────────────────────────────────────────────────────
  useEffect(() => {
    if (studyUid) {
      try {
        const stored = sessionStorage.getItem(`study_${studyUid}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.patientName) {
            setStudyInfo({
              patientName: parsed.patientName,
              studyDate: parsed.studyDate || "",
              studyDescription: parsed.studyDescription || parsed.examDescription || "Estudo DICOM",
              modality: parsed.modality || "-",
              studyInstanceUid: studyUid,
            });
          }
        }
      } catch (_) {}
      startStreamingViewer();
    }
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      if (renderingEngineRef.current) {
        try { renderingEngineRef.current.destroy(); } catch (_) {}
      }
      // FIX P1: destruir ToolGroup ao desmontar — evita memory leak no ToolGroupManager
      if (toolGroupIdRef.current) {
        try {
          const { ToolGroupManager } = csTools;
          ToolGroupManager.destroyToolGroup(toolGroupIdRef.current);
        } catch (_) {}
        toolGroupIdRef.current = null;
      }
      // BUG-1 FIX: limpar batch timer ao desmontar (evita setState em ref nula)
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
      if (streamingProgressTimerRef.current) {
        clearTimeout(streamingProgressTimerRef.current);
        streamingProgressTimerRef.current = null;
      }
      // BUG-3 FIX: cancelAnimationFrame em vez de clearInterval (cine migrou para RAF)
      if (cineIntervalRef.current !== null) {
        cancelAnimationFrame(cineIntervalRef.current);
        cineIntervalRef.current = null;
      }
    };
  }, [studyUid]);

  // Séries completas só são lidas após o C-GET terminar. Ler cabeçalhos enquanto o
  // PACS ainda grava milhares de arquivos disputa I/O e deixa o navegador travado.
  useEffect(() => {
    if (phase === "ready" && totalCount > 0 && imageCount >= totalCount) {
      loadSeries();
    }
  }, [phase, totalCount, imageCount, loadSeries]);

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
      // BUG-2 FIX: remover vp.render() — setImageIdIndex já agenda o render
      // internamente no Cornerstone. Chamar render() manualmente duplica o
      // trabalho e empilha frames quando o usuário navega rápido.
    } catch (_) {}
  }, []);

  const handlePrevImage = useCallback(() => goToSlice(currentIndex - 1), [currentIndex, goToSlice]);
  const handleNextImage = useCallback(() => goToSlice(currentIndex + 1), [currentIndex, goToSlice]);
  const handleFirstImage = useCallback(() => goToSlice(0), [goToSlice]);
  const handleLastImage = useCallback(() => goToSlice(imageCount - 1), [imageCount, goToSlice]);

  // ─── Cine (Play automático) ─────────────────────────────────────────────────────────────────────────────
  // BUG-3 FIX: requestAnimationFrame sincroniza com o ciclo de pintura do browser
  // e pausa automaticamente quando a aba perde o foco, economizando CPU.
  const startCine = useCallback(() => {
    if (cineIntervalRef.current !== null) {
      cancelAnimationFrame(cineIntervalRef.current);
      cineIntervalRef.current = null;
    }
    setIsCinePlaying(true);

    const frameInterval = 1000 / cineFps;
    let lastTime = 0;

    const tick = (now: number) => {
      if (now - lastTime >= frameInterval) {
        lastTime = now;
        const total = imageIdsRef.current.length;
        if (total > 0) {
          const next = (cineIndexRef.current + 1) % total;
          goToSlice(next);
        }
      }
      // Agenda o próximo frame — para automaticamente se a ref for zerada
      cineIntervalRef.current = requestAnimationFrame(tick);
    };

    cineIntervalRef.current = requestAnimationFrame(tick);
  }, [cineFps, goToSlice]);

  const stopCine = useCallback(() => {
    if (cineIntervalRef.current !== null) {
      cancelAnimationFrame(cineIntervalRef.current);
      cineIntervalRef.current = null;
    }
    setIsCinePlaying(false);
  }, []);

  const toggleCine = useCallback(() => {
    if (isCinePlaying) stopCine();
    else startCine();
  }, [isCinePlaying, startCine, stopCine]);

  const handleReloadStudy = useCallback(async () => {
    if (!studyUid || isReloadingStudy || isLoading || isBackgroundDownloading) return;
    const confirmed = window.confirm(
      "As imagens temporárias deste estudo serão removidas e baixadas novamente do PACS. Deseja continuar?"
    );
    if (!confirmed) return;

    setIsReloadingStudy(true);
    try {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
      const response = await fetch(`/api/dicom-files/${studyUid}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Não foi possível limpar o cache deste estudo.");
      }

      stopCine();
      if (renderingEngineRef.current) {
        try { renderingEngineRef.current.destroy(); } catch (_) {}
        renderingEngineRef.current = null;
      }
      viewportRef.current = null;
      setViewport(null);
      if (toolGroupIdRef.current) {
        try { csTools.ToolGroupManager.destroyToolGroup(toolGroupIdRef.current); } catch (_) {}
        toolGroupIdRef.current = null;
      }
      toolGroupRef.current = null;
      cornerstoneInitRef.current = false;
      imageIdsRef.current = [];
      imageIdsSetRef.current.clear();
      pendingIdsRef.current = [];
      setImageIds([]);
      setImageCount(0);
      setCurrentIndex(0);
      setSeries([]);
      setActiveSeries(null);
      setSeriesLoaded(false);
      seriesLoadedRef.current = false;

      toast.info("Cache do estudo removido. Solicitando novas imagens ao PACS...");
      startStreamingViewer();
    } catch (err: any) {
      toast.error("Não foi possível recarregar as imagens", { description: err.message });
    } finally {
      setIsReloadingStudy(false);
    }
  }, [isBackgroundDownloading, isLoading, isReloadingStudy, startStreamingViewer, stopCine, studyUid]);

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
  // ─── Viewers externos (Weasis, OsiriX, Horos) ────────────────────────────────────────────────────────────────────────────
  // Usa URLs diretas dos arquivos no cache do servidor — sem PACS configurado no cliente.
  // Weasis:  weasis://?$dicom:get -r "url"...
  // OsiriX:  osirix://?methodName=DownloadURL&URL=<zip>&Display=YES (macOS)
  // Horos:   horos://?methodName=DownloadURL&URL=<zip>&Display=YES  (macOS, gratuito)
  const viewerLabels: Record<string, string> = { weasis: 'Weasis', osirix: 'OsiriX', horos: 'Horos' };
  const handleOpenViewer = async (viewer: 'weasis' | 'osirix' | 'horos') => {
    if (!studyUid || launchingViewer) return;
    setLaunchingViewer(viewer);
    try {
      const resp = await fetch(`/api/dicom-viewer-launch/${studyUid}?viewer=${viewer}`);
      const data = await resp.json();
      if (!resp.ok) {
        toast.error(`Erro ao abrir no ${viewerLabels[viewer]}`, {
          description: data.error || 'Erro desconhecido. Certifique-se de que o estudo está carregado no visualizador primeiro.',
          duration: 8000,
        });
        return;
      }
      window.location.href = data.launchUrl;
      toast.info(`Abrindo no ${viewerLabels[viewer]}...`, {
        description: `${data.fileCount} imagens serão abertas. O viewer deve estar instalado. Arquivos temporários apagados ao fechar.`,
        duration: 7000,
      });
    } catch (err: any) {
      toast.error(`Erro ao abrir no ${viewerLabels[viewer]}`, { description: err.message });
    } finally {
      setLaunchingViewer(null);
    }
  };
  // RadiAnt: usa o Assistente local para baixar somente o estudo autorizado e
  // abrir os arquivos temporários sem tocar no PACS configurado pelo médico.
  const handleOpenRadiant = async () => {
    if (!studyUid || launchingViewer) return;
    setLaunchingViewer('radiant');
    try {
      const resp = await fetch(`/api/radiant-assistant-launch/${studyUid}`);
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        toast.error('Não foi possível abrir no RadiAnt', {
          description: errData.error || 'Certifique-se de que o estudo está carregado no visualizador primeiro.',
          duration: 8000,
        });
        return;
      }
      const data = await resp.json();
      window.location.href = data.launchUrl;
      toast.success('RadiAnt acionado', {
        description: `${data.fileCount} imagens serão abertas pelo Assistente, sem alterar a configuração PACS existente.`,
        duration: 8000,
      });
    } catch (err: any) {
      toast.error('Erro ao abrir no RadiAnt', { description: err.message });
    } finally {
      setLaunchingViewer(null);
    }
  };

  const handleActivateRadiant = () => {
    if (isActivatingRadiant) return;
    setIsActivatingRadiant(true);
    try {
      const anchor = document.createElement('a');
      anchor.href = RADIANT_ASSISTANT_INSTALLER_PATH;
      anchor.download = 'PacsRadiantAssistantSetup.exe';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      toast.info('Instalador do Assistente RadiAnt baixado', {
        description: 'Abra o instalador e clique em Instalar uma única vez. Ele não modifica as configurações PACS já existentes no RadiAnt.',
        duration: 12000,
      });
    } finally {
      setIsActivatingRadiant(false);
    }
  };

  // ─── Exportação ZIP ─────────────────────────────────────────────────────────────────────────────────────
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

  const cornerstoneReady = phase === "ready";
  const showViewer = phase === "ready";

  const handleOpenReportFromMobile = () => {
    if (!studyUid || !studyInfo) return;
    if (!canOpenReport) {
      toast.error("Seu perfil não possui permissão para editar laudos nesta unidade.");
      return;
    }

    const storedRaw = sessionStorage.getItem(`study_${studyUid}`);
    const storedStudy = storedRaw ? JSON.parse(storedRaw) : {};
    const examLabel = studyMeta?.description_override || studyInfo.studyDescription || "Sem descrição";
    const examNames = examLabel.split(" + ").map((item: string) => item.trim()).filter(Boolean);

    sessionStorage.setItem(`study_${studyUid}`, JSON.stringify({
      ...storedStudy,
      patientName: studyInfo.patientName || "",
      studyDate: studyInfo.studyDate || "",
      modality: studyInfo.modality || "",
      studyDescription: examLabel,
      studyInstanceUid: studyUid,
      unitId: viewerUnitId ?? storedStudy.unitId ?? null,
      examCount: storedStudy.examCount ?? (examNames.length || 1),
      examNames,
    }));
    navigate(`/reports/create/${studyUid}`);
  };

  const handleMobileVoiceReport = () => {
    setShowAudioModal(true);
  };

  const mobileViewerError = error?.includes("spawn") || error?.includes("ENOENT")
    ? "PACS não configurado ou indisponível para esta unidade"
    : (error || "PACS não configurado para esta unidade");

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
    <div className="flex flex-col h-[100dvh] bg-gray-950 text-white select-none">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="hidden md:flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
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
              {/* Badge SLA */}
              {urlUnitId && (
                <div className="ml-1">
                  <SlaCountdown
                    readiness={slaReadiness as ReadinessData | null}
                    hasAnamnesis={hasAnamnesis}
                    compact={false}
                  />
                </div>
              )}
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
            onClick={handleReloadStudy}
            disabled={isReloadingStudy || isLoading || isBackgroundDownloading}
            className="text-xs border-amber-700 text-amber-300 hover:bg-amber-900/40 h-7 px-2"
            title="Remover apenas o cache deste estudo e baixar as imagens novamente do PACS"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isReloadingStudy ? "animate-spin" : ""}`} />
            Recarregar PACS
          </Button>

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
          {/* Assistente RadiAnt: entrega local temporária, sem alterar configuração PACS existente */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleActivateRadiant}
            disabled={isActivatingRadiant}
            className="text-xs border-cyan-700 text-cyan-300 hover:bg-cyan-900/40 h-7 px-2"
            title="Instalar uma única vez o Assistente RadiAnt neste computador Windows"
          >
            {isActivatingRadiant ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ExternalLink className="h-3 w-3 mr-1" />}
            Ativar RadiAnt
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenRadiant}
            disabled={!!launchingViewer || imageCount === 0}
            className="text-xs border-blue-700 text-blue-400 hover:bg-blue-900/40 h-7 px-2"
            title="Abrir o estudo autorizado no RadiAnt sem modificar a configuração PACS existente"
          >
            {launchingViewer === 'radiant' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ExternalLink className="h-3 w-3 mr-1" />}
            RadiAnt
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenViewer('weasis')}
            disabled={!!launchingViewer || imageCount === 0}
            className="text-xs border-purple-700 text-purple-400 hover:bg-purple-900/40 h-7 px-2"
            title="Abrir no Weasis DICOM Viewer (Windows/Linux/macOS) — sem PACS configurado"
          >
            {launchingViewer === 'weasis' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ExternalLink className="h-3 w-3 mr-1" />}
            Weasis
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenViewer('horos')}
            disabled={!!launchingViewer || imageCount === 0}
            className="text-xs border-orange-700 text-orange-400 hover:bg-orange-900/40 h-7 px-2"
            title="Abrir no Horos DICOM Viewer (macOS, gratuito) — sem PACS configurado"
          >
            {launchingViewer === 'horos' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ExternalLink className="h-3 w-3 mr-1" />}
            Horos
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenViewer('osirix')}
            disabled={!!launchingViewer || imageCount === 0}
            className="text-xs border-teal-700 text-teal-300 hover:bg-teal-900/40 h-7 px-2"
            title="Abrir no OsiriX (macOS) com o estudo autorizado, sem PACS configurado"
          >
            {launchingViewer === 'osirix' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ExternalLink className="h-3 w-3 mr-1" />}
            OsiriX
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

          {/* Botão Anexos do Paciente no Viewer */}
          <PatientViewerAttachmentsButton />
          {/* Botão Áudio do Paciente no Viewer */}
          <PatientViewerAudioButton />
        </div>
      </div>

      {/* ── Cabeçalho mobile: paciente/exame + ações principais ──────────────── */}
      <div className="flex md:hidden flex-col bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-3 min-h-[58px]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/pacs-query")}
            className="h-9 shrink-0 gap-1 px-2 text-gray-200 hover:bg-slate-800 hover:text-white"
            aria-label="Voltar para a listagem de exames"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Voltar</span>
          </Button>
          <div className="min-w-0 flex-1 text-center leading-tight">
            <p className="truncate text-[14px] font-semibold uppercase text-white">
              {studyInfo ? cleanPatientName(studyInfo.patientName) : "Paciente"}
            </p>
            <p className="truncate text-[12px] font-semibold uppercase text-blue-300">
              {studyInfo?.studyDescription || "Estudo DICOM"}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleReloadStudy}
            disabled={isReloadingStudy || isLoading || isBackgroundDownloading}
            className="h-9 w-9 shrink-0 border-amber-700 text-amber-300 hover:bg-amber-900/40"
            title="Recarregar imagens deste estudo do PACS"
            aria-label="Recarregar imagens deste estudo do PACS"
          >
            <RefreshCw className={`h-4 w-4 ${isReloadingStudy ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-slate-700/80 px-3 py-3">
          <Button
            onClick={handleOpenReportFromMobile}
            disabled={!studyInfo || !canOpenReport}
            className="h-12 min-w-0 gap-1.5 rounded-xl bg-blue-600 px-2 text-[12px] font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
            title={canOpenReport ? "Abrir editor de laudo" : "Sem permissão para editar laudos"}
          >
            <FileText className="h-5 w-5 shrink-0" />
            <span className="truncate">Laudar</span>
          </Button>
          <Button
            onClick={handleMobileVoiceReport}
            className="h-12 min-w-0 gap-1.5 rounded-xl bg-emerald-600 px-2 text-[12px] font-semibold text-white hover:bg-emerald-500"
            title="Laudo falado"
          >
            <Mic className="h-5 w-5 shrink-0" />
            <span className="truncate">Laudo falado</span>
          </Button>
          <Button
            onClick={() => setShowAttachmentsModal(true)}
            className="h-12 min-w-0 gap-1.5 rounded-xl border border-slate-600 bg-slate-800 px-2 text-[12px] font-semibold text-slate-100 hover:bg-slate-700"
            title="Abrir requisição e anexos do paciente"
          >
            <Paperclip className="h-5 w-5 shrink-0" />
            <span className="truncate">Requisição</span>
          </Button>
        </div>
      </div>

      {/* ── Painel de Anamnese (colapsável abaixo do header) ──────────────────── */}
      {showAnamnesisPanel && (
        <div className="hidden md:flex flex-shrink-0 bg-gray-900 border-b border-gray-700 px-4 py-3 items-start gap-4">
          <ClipboardList className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 space-y-3">
            {/* Metadados editados pelo técnico */}
            {studyMeta && (studyMeta.patient_name_override || studyMeta.description_override || studyMeta.notes) && (
              <div className="bg-amber-900/30 border border-amber-700/50 rounded p-2 space-y-1">
                <p className="text-xs font-semibold text-amber-400 mb-1">✏️ Editado pelo Técnico</p>
                {studyMeta.patient_name_override && (
                  <p className="text-xs text-amber-200">
                    <span className="text-amber-500">Paciente:</span> {studyMeta.patient_name_override}
                  </p>
                )}
                {studyMeta.description_override && (
                  <p className="text-xs text-amber-200">
                    <span className="text-amber-500">Exame:</span> {studyMeta.description_override}
                  </p>
                )}
                {studyMeta.notes && (
                  <p className="text-xs text-amber-200">
                    <span className="text-amber-500">Observações:</span> {studyMeta.notes}
                  </p>
                )}
                {studyMeta.edited_by_name && (
                  <p className="text-xs text-gray-600">
                    por {studyMeta.edited_by_name} • {studyMeta.updatedAt ? new Date(studyMeta.updatedAt).toLocaleString('pt-BR') : ''}
                  </p>
                )}
              </div>
            )}
            {/* Anamnese */}
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
        <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Toolbar lateral esquerda ──────────────────────────────────── */}
        <div className="hidden md:flex flex-col gap-0.5 p-1.5 bg-gray-900 border-r border-gray-800 w-10 flex-shrink-0">

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
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center overflow-y-auto bg-gray-950 px-4 py-6 md:p-6">
              <AlertCircle className="mb-4 h-12 w-12 text-red-400 md:h-10 md:w-10" />
              <p className="mb-2 text-center text-base font-semibold text-red-300 md:text-sm">Erro ao carregar imagens DICOM</p>
              <p className="mb-5 max-w-md text-center text-sm text-gray-500 md:hidden">{mobileViewerError}</p>
              <p className="mb-4 hidden max-w-md text-center text-xs text-gray-500 md:block">{error}</p>
              <div className="mb-4 flex w-full max-w-[420px] flex-col justify-center gap-3 md:w-auto md:flex-row md:flex-wrap">
                <Button variant="outline" size="sm" onClick={() => navigate("/pacs-query")} className="h-12 w-full border-gray-600 text-base text-gray-300 hover:bg-gray-800 md:h-9 md:w-auto md:text-sm">
                  <ArrowLeft className="mr-2 h-5 w-5 md:mr-1 md:h-4 md:w-4" />Voltar
                </Button>
                <Button variant="outline" size="sm" onClick={startStreamingViewer} className="h-12 w-full border-blue-600 text-base text-blue-400 hover:bg-blue-900/40 md:h-9 md:w-auto md:text-sm">
                  <RefreshCw className="mr-2 h-5 w-5 md:mr-1 md:h-4 md:w-4" />Tentar Novamente
                </Button>
                <Button variant="outline" size="sm" onClick={handleOpenRadiant} className="hidden border-green-700 text-green-400 hover:bg-green-900/40 md:inline-flex">
                  <ExternalLink className="mr-1 h-4 w-4" />Abrir no RadiAnt
                </Button>
              </div>
              <div className="hidden max-w-md rounded-lg bg-gray-900 p-3 text-xs text-gray-400 md:block">
                <p className="mb-1 font-medium text-gray-300">Dicas:</p>
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
          <div className="hidden md:flex flex-col items-center justify-between py-2 px-1 bg-gray-900 border-l border-gray-800 w-10 flex-shrink-0 gap-1">
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

      {/* ── Anamnese compacta no rodapé mobile ───────────────────────────────── */}
      <div className="flex md:hidden flex-shrink-0 flex-col gap-1 border-t border-slate-700 bg-slate-900 px-3 py-2">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-emerald-400">
          <ClipboardList className="h-4 w-4" />
          <span>Anamnese</span>
          {hasAnamnesis && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
        </div>
        <p className="line-clamp-2 text-[12px] leading-snug text-slate-200">
          {anamnesisQuery.isLoading
            ? "Carregando anamnese..."
            : anamnesisQuery.data?.manual_text || "Nenhuma anamnese registrada para este estudo."}
        </p>
      </div>

      {/* ── Navegação mobile entre imagens ───────────────────────────────────── */}
      <div className="flex md:hidden items-center gap-2 bg-slate-900 px-3 py-2 border-t border-slate-800 flex-shrink-0">
        <button
          onClick={handleFirstImage}
          disabled={!cornerstoneReady || imageCount <= 1}
          className="p-1 text-slate-500 disabled:opacity-30"
          aria-label="Primeira imagem"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(imageCount - 1, 0)}
          value={imageCount > 0 ? currentIndex : 0}
          onChange={(event) => goToSlice(parseInt(event.target.value, 10))}
          disabled={!cornerstoneReady || imageCount <= 1}
          className="h-1.5 flex-1 accent-blue-500 disabled:opacity-30"
          aria-label="Navegar entre imagens"
        />
        <span className="min-w-[48px] rounded-md bg-slate-800 px-2 py-1 text-center text-[12px] tabular-nums text-slate-200">
          {imageCount > 0 ? `${currentIndex + 1}/${imageCount}` : "0/0"}
        </span>
        <button
          onClick={handleLastImage}
          disabled={!cornerstoneReady || imageCount <= 1}
          className="p-1 text-slate-500 disabled:opacity-30"
          aria-label="Última imagem"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <button
          onClick={toggleCine}
          disabled={!cornerstoneReady || imageCount <= 1}
          className={`p-1 ${isCinePlaying ? "text-yellow-400" : "text-emerald-400"} disabled:opacity-30`}
          aria-label={isCinePlaying ? "Pausar cine" : "Iniciar cine"}
        >
          {isCinePlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
      </div>

      {/* ── Faixa de miniaturas de séries ──────────────────────────────────────────────────────── */}
      {series.length > 1 && (
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-900 border-t border-gray-800 overflow-x-auto flex-shrink-0" style={{ minHeight: 72 }}>
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
                {s.thumbnail ? (
                  <img
                    src={`/api/dicom-thumbnail/${studyUid}/${s.thumbnail}`}
                    alt={s.description || s.modality || 'Série'}
                    className="w-full h-full object-contain"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                      (e.currentTarget.nextElementSibling as HTMLElement | null)?.style && ((e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex');
                    }}
                  />
                ) : null}
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ display: s.thumbnail ? 'none' : 'flex' }}
                >
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
      <div className="hidden md:flex items-center justify-between px-3 py-1 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 flex-shrink-0">
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

      {canViewAttachments && showAttachmentsModal && (
        <PatientAttachmentsModal
          open={showAttachmentsModal}
          onClose={() => setShowAttachmentsModal(false)}
          studyInstanceUid={studyUid ?? ""}
          unitId={viewerUnitId}
          patientName={studyMeta?.patient_name_override || studyMeta?.patient_name || studyInfo?.patientName}
          onUploadSuccess={() => void refetchViewerAttachments()}
        />
      )}

      {canAccessClinicalMedia && showAudioModal && (
        <AudioReportsModal
          open={showAudioModal}
          onClose={() => setShowAudioModal(false)}
          studyInstanceUid={studyUid ?? ""}
          unitId={viewerUnitId ?? undefined}
          patientName={studyMeta?.patient_name_override || studyMeta?.patient_name || studyInfo?.patientName}
          allowRecording={currentUser?.role === "medico"}
          onUploadSuccess={() => {
            refetchViewerAudios();
          }}
        />
      )}
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
