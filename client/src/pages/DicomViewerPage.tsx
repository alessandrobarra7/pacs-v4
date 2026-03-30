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
  Download,
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

export function DicomViewerPage() {
  const { studyUid } = useParams<{ studyUid: string }>();
  const [location, navigate] = useLocation();
  const viewerRef = useRef<HTMLDivElement>(null);

  // Ler unit_id da query string (passado pelo admin_master)
  const urlUnitId = useMemo(() => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const uid = params.get('unit_id');
    return uid ? parseInt(uid, 10) : undefined;
  }, [location]);

  const [phase, setPhase] = useState<"downloading" | "rendering" | "ready" | "error">("downloading");
  const [downloadProgress, setDownloadProgress] = useState<string>("Iniciando C-GET...");
  const [error, setError] = useState<string | null>(null);
  const [studyInfo, setStudyInfo] = useState<StudyInfo | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [viewport, setViewport] = useState<any>(null);
  const [renderingEngine, setRenderingEngine] = useState<any>(null);
  const [imageIds, setImageIds] = useState<string[]>([]);

  const startViewerMutation = trpc.pacs.startViewer.useMutation();

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr.length !== 8) return dateStr || "";
    return `${dateStr.slice(6, 8)}/${dateStr.slice(4, 6)}/${dateStr.slice(0, 4)}`;
  };

  const cleanPatientName = (name: string) => {
    if (!name) return "-";
    return name.replace(/\^/g, " ").replace(/\s+\d{10,}$/g, "").trim();
  };

  // Extrai metadados do arquivo DICOM via pydicom tags
  const extractMetadataFromDicom = async (studyUid: string): Promise<StudyInfo> => {
    try {
      // Tenta ler metadados do primeiro arquivo DICOM via endpoint de listagem
      const resp = await fetch(`/api/dicom-files/${studyUid}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.metadata) {
          return {
            patientName: data.metadata.patientName || "Paciente",
            studyDate: data.metadata.studyDate || "",
            studyDescription: data.metadata.studyDescription || "Sem descrição",
            modality: data.metadata.modality || "-",
            studyInstanceUid: studyUid,
          };
        }
      }
    } catch (_) {}
    return {
      patientName: "Paciente",
      studyDate: "",
      studyDescription: "Estudo DICOM",
      modality: "-",
      studyInstanceUid: studyUid,
    };
  };

  // Inicializa Cornerstone com os arquivos do cache local
  const initCornerstoneWithCache = useCallback(async (ids: string[]) => {
    setPhase("rendering");
    setDownloadProgress("Inicializando visualizador...");

    try {
      // Usa imports estáticos (definidos no topo do arquivo) para que o Vite
      // use o pre-bundle e os wrappers ESM dos pacotes CJS sejam aplicados corretamente.
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

      console.log('[DicomViewer] csCore.init...');
      await csCore.init();
      console.log('[DicomViewer] csDicomLoader.init...');
      await csDicomLoader.init({ maxWebWorkers: 1 });
      console.log('[DicomViewer] initTools...');
      await initTools();
      console.log('[DicomViewer] tools initialized');

      addTool(WindowLevelTool);
      addTool(ZoomTool);
      addTool(PanTool);
      addTool(LengthTool);
      addTool(StackScrollTool);

      const toolGroupId = `PACS_TG_${Date.now()}`;
      const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

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
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
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

      console.log('[DicomViewer] setStack with', ids.length, 'images, first:', ids[0]);
      await vp.setStack(ids, 0);
      console.log('[DicomViewer] setStack done, calling render...');
      vp.render();
      console.log('[DicomViewer] render called, setting phase ready');

      setPhase("ready");
      toast.success(`${ids.length} imagem(ns) carregada(s) com sucesso`);
    } catch (err: any) {
      console.error("[DicomViewer] Erro ao inicializar Cornerstone:", err);
      setError(err.message || "Erro ao inicializar visualizador");
      setPhase("error");
    }
  }, []);

  // Fluxo principal: C-GET → cache → Cornerstone
  const startViewer = useCallback(async () => {
    if (!studyUid) return;
    setPhase("downloading");
    setError(null);

    try {
      // Etapa 1: Associação DICOM
      setDownloadProgress("[1/4] Estabelecendo associação DICOM com o PACS...");
      const result = await startViewerMutation.mutateAsync({
        studyInstanceUid: studyUid,
        unit_id: urlUnitId,
      });

      if (!result.success) {
        throw new Error("C-GET falhou — verifique IP, Porta e AE Title do PACS");
      }

      // Etapa 2: Recebimento confirmado
      setDownloadProgress(`[2/4] ${result.fileCount} arquivo(s) DICOM recebido(s) com sucesso.`);

      // Etapa 3: Lista os arquivos do cache
      setDownloadProgress(`[3/4] Preparando ${result.fileCount} imagem(ns) para visualização...`);
      const listResp = await fetch(`/api/dicom-files/${studyUid}`);
      if (!listResp.ok) throw new Error("Arquivos DICOM não encontrados no cache após C-GET");

      const listData = await listResp.json();
      const files: string[] = listData.files || [];

      if (files.length === 0) throw new Error("Nenhum arquivo DICOM encontrado no cache. O PACS enviou os arquivos?");

      // Monta imageIds usando wadouri (leitura local via servidor)
      const ids = files.map(
        (f: string) => `wadouri:${window.location.origin}/api/dicom-files/${studyUid}/${f}`
      );

      setImageIds(ids);
      setImageCount(ids.length);

      // Extrai metadados do estudo
      const meta = await extractMetadataFromDicom(studyUid);
      setStudyInfo(meta);

      // Etapa 4: Inicializa Cornerstone
      setDownloadProgress(`[4/4] Inicializando visualizador com ${ids.length} imagem(ns)...`);
      await initCornerstoneWithCache(ids);

    } catch (err: any) {
      console.error("[DicomViewer] Erro:", err);
      setError(err.message || "Erro ao carregar estudo DICOM");
      setPhase("error");
    }
  }, [studyUid, startViewerMutation, initCornerstoneWithCache]);

  useEffect(() => {
    if (studyUid) startViewer();
    return () => {
      if (renderingEngine) {
        try { renderingEngine.destroy(); } catch (_) {}
      }
      // Limpa cache ao fechar o viewer
      fetch(`/api/dicom-files/${studyUid}`, { method: "DELETE" }).catch(() => {});
    };
  }, [studyUid]);

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
      description: "Certifique-se que o RadiAnt está instalado no computador.",
    });
  };

  const isLoading = phase === "downloading" || phase === "rendering";
  const cornerstoneReady = phase === "ready";

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/pacs-query")}
            className="text-gray-300 hover:text-white hover:bg-gray-800 h-8"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>

          {studyInfo && (
            <div className="flex items-center gap-3 ml-2 border-l border-gray-700 pl-3">
              <div>
                <div className="text-sm font-semibold text-white leading-tight">
                  {cleanPatientName(studyInfo.patientName)}
                </div>
                <div className="text-xs text-gray-400 leading-tight mt-0.5">
                  {formatDate(studyInfo.studyDate)} • {studyInfo.studyDescription}
                </div>
              </div>
              <Badge variant="outline" className="text-xs border-blue-500 text-blue-400 h-5">
                {studyInfo.modality}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {imageCount > 0 && (
            <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
              {currentIndex + 1} / {imageCount}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenRadiant}
            className="text-xs border-blue-600 text-blue-400 hover:bg-blue-900 h-8"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Abrir no RadiAnt
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar lateral esquerda */}
        <div className="flex flex-col gap-1 p-2 bg-gray-900 border-r border-gray-800 w-11 flex-shrink-0">
          <ToolButton icon={<ZoomIn className="h-4 w-4" />} title="Zoom In" onClick={handleZoomIn} disabled={!cornerstoneReady} />
          <ToolButton icon={<ZoomOut className="h-4 w-4" />} title="Zoom Out" onClick={handleZoomOut} disabled={!cornerstoneReady} />
          <div className="border-t border-gray-700 my-0.5" />
          <ToolButton icon={<RotateCcw className="h-4 w-4" />} title="Girar 90° Esquerda" onClick={handleRotateCCW} disabled={!cornerstoneReady} />
          <ToolButton icon={<RotateCw className="h-4 w-4" />} title="Girar 90° Direita" onClick={handleRotateCW} disabled={!cornerstoneReady} />
          <div className="border-t border-gray-700 my-0.5" />
          <ToolButton icon={<FlipHorizontal className="h-4 w-4" />} title="Espelhar Horizontal" onClick={handleFlipH} disabled={!cornerstoneReady} />
          <ToolButton icon={<FlipVertical className="h-4 w-4" />} title="Espelhar Vertical" onClick={handleFlipV} disabled={!cornerstoneReady} />
          <div className="border-t border-gray-700 my-0.5" />
          <ToolButton icon={<RefreshCw className="h-4 w-4 text-yellow-400" />} title="Resetar Visualização" onClick={handleReset} disabled={!cornerstoneReady} />
        </div>

        {/* Área principal do viewer */}
        <div className="flex-1 relative bg-black">
          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20">
              <Loader2 className="h-12 w-12 text-blue-400 animate-spin mb-4" />
              <p className="text-gray-300 text-sm font-medium">
                {phase === "downloading" ? "Baixando imagens via C-GET..." : "Inicializando visualizador..."}
              </p>
              <p className="text-gray-500 text-xs mt-1 max-w-sm text-center">{downloadProgress}</p>
            </div>
          )}

          {/* Error overlay */}
          {phase === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 z-20 p-6">
              <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
              <p className="text-red-300 text-sm font-semibold mb-2">Erro ao carregar imagens DICOM</p>
              <p className="text-gray-500 text-xs text-center max-w-md mb-4">{error}</p>
              <div className="flex gap-2 mb-4">
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
                  className="border-blue-600 text-blue-400 hover:bg-blue-900"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Tentar Novamente
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenRadiant}
                  className="border-green-600 text-green-400 hover:bg-green-900"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Abrir no RadiAnt
                </Button>
              </div>
              <div className="p-3 bg-gray-900 rounded-lg text-xs text-gray-400 max-w-md">
                <p className="font-medium text-gray-300 mb-1">Dicas:</p>
                <p>• Verifique se o PACS está acessível (IP + Porta + AE Title)</p>
                <p>• O PACS deve suportar C-GET (protocolo pull-based — sem necessidade de listener externo)</p>
                <p>• Use "Abrir no RadiAnt" como alternativa</p>
              </div>
            </div>
          )}

          {/* Elemento do Cornerstone */}
          <div
            ref={viewerRef}
            className="w-full h-full"
            style={{ minHeight: "400px", cursor: cornerstoneReady ? "crosshair" : "default" }}
          />

          {/* Navegação entre imagens */}
          {cornerstoneReady && imageCount > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevImage}
                disabled={currentIndex === 0}
                className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 bg-black/60 text-white hover:bg-black/80 rounded-full border border-gray-700 disabled:opacity-30"
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextImage}
                disabled={currentIndex >= imageCount - 1}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 bg-black/60 text-white hover:bg-black/80 rounded-full border border-gray-700 disabled:opacity-30"
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 px-3 py-1 rounded-full text-xs text-gray-300 border border-gray-700">
                {currentIndex + 1} / {imageCount}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Barra de status inferior */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span>🖱 Esquerdo: Brilho/Contraste</span>
          <span>🖱 Direito: Zoom</span>
          <span>🖱 Scroll: Navegar imagens</span>
        </div>
        {studyUid && (
          <span className="font-mono text-gray-600">
            UID: {studyUid.substring(0, 40)}{studyUid.length > 40 ? "..." : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  icon, title, onClick, disabled, active,
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
        active ? "bg-blue-600 text-white hover:bg-blue-700" : "text-gray-400 hover:text-white hover:bg-gray-700"
      } disabled:opacity-30`}
    >
      {icon}
    </Button>
  );
}
