import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Maximize2,
  Minimize2,
  FlipHorizontal,
  FlipVertical,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface StudyInfo {
  patientName: string;
  studyDate: string;
  studyDescription: string;
  modality: string;
  studyInstanceUid: string;
}

export function DicomViewerPage() {
  const { studyUid } = useParams<{ studyUid: string }>();
  const [, navigate] = useLocation();
  const viewerRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studyInfo, setStudyInfo] = useState<StudyInfo | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [cornerstoneReady, setCornerstoneReady] = useState(false);
  const [viewport, setViewport] = useState<any>(null);
  const [renderingEngine, setRenderingEngine] = useState<any>(null);
  const [imageIds, setImageIds] = useState<string[]>([]);

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr.length !== 8) return dateStr || "";
    return `${dateStr.slice(6, 8)}/${dateStr.slice(4, 6)}/${dateStr.slice(0, 4)}`;
  };

  const cleanPatientName = (name: string) => {
    if (!name) return "-";
    return name.replace(/\^/g, " ").replace(/\s+\d{10,}$/g, "").trim();
  };

  // Carrega info do estudo via DICOMweb QIDO-RS
  const loadStudyMetadata = useCallback(async () => {
    if (!studyUid) return null;

    try {
      // Busca séries do estudo
      const seriesResp = await fetch(`/api/dicomweb/studies/${studyUid}/series`, {
        headers: { Accept: "application/dicom+json" },
      });

      if (!seriesResp.ok) {
        throw new Error(`Erro ao buscar séries: HTTP ${seriesResp.status}`);
      }

      const seriesData = await seriesResp.json();
      if (!seriesData || seriesData.length === 0) {
        throw new Error("Nenhuma série encontrada neste estudo");
      }

      const firstSeries = seriesData[0];
      const patientNameRaw =
        firstSeries["00100010"]?.Value?.[0]?.Alphabetic ||
        firstSeries["00100010"]?.Value?.[0] ||
        "Paciente";
      const studyDate = firstSeries["00080020"]?.Value?.[0] || "";
      const studyDesc =
        firstSeries["00081030"]?.Value?.[0] ||
        firstSeries["0008103E"]?.Value?.[0] ||
        "Sem descrição";
      const modality = firstSeries["00080060"]?.Value?.[0] || "-";

      const info: StudyInfo = {
        patientName:
          typeof patientNameRaw === "object"
            ? patientNameRaw.Alphabetic || "Paciente"
            : String(patientNameRaw),
        studyDate,
        studyDescription: studyDesc,
        modality,
        studyInstanceUid: studyUid,
      };
      setStudyInfo(info);

      // Coleta todas as instâncias de todas as séries
      const allImageIds: string[] = [];
      for (const serie of seriesData) {
        const seriesUid = serie["0020000E"]?.Value?.[0];
        if (!seriesUid) continue;

        const instResp = await fetch(
          `/api/dicomweb/studies/${studyUid}/series/${seriesUid}/instances`,
          { headers: { Accept: "application/dicom+json" } }
        );

        if (!instResp.ok) continue;

        const instances = await instResp.json();
        for (const inst of instances) {
          const sopUid = inst["00080018"]?.Value?.[0];
          if (sopUid) {
            // wadors: URL para WADO-RS
            const wadoUrl = `${window.location.origin}/api/dicomweb/studies/${studyUid}/series/${seriesUid}/instances/${sopUid}`;
            allImageIds.push(`wadors:${wadoUrl}`);
          }
        }
      }

      if (allImageIds.length === 0) {
        throw new Error("Nenhuma imagem encontrada neste estudo");
      }

      return allImageIds;
    } catch (err: any) {
      console.error("[DicomViewer] Erro ao carregar metadados:", err);
      throw err;
    }
  }, [studyUid]);

  // Inicializa Cornerstone.js
  const initViewer = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setCornerstoneReady(false);

    try {
      // 1. Carrega metadados e imageIds
      const ids = await loadStudyMetadata();
      if (!ids || ids.length === 0) {
        throw new Error("Nenhuma imagem disponível");
      }
      setImageIds(ids);
      setImageCount(ids.length);

      // 2. Importa Cornerstone dinamicamente
      const [csCore, csTools, csDicomLoader] = await Promise.all([
        import("@cornerstonejs/core"),
        import("@cornerstonejs/tools"),
        import("@cornerstonejs/dicom-image-loader"),
      ]);

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

      // 3. Inicializa Cornerstone Core
      await csCore.init();

      // 4. Inicializa DICOM Image Loader
      await csDicomLoader.init({ maxWebWorkers: 1 });

      // 5. Inicializa Tools
      await initTools();

      // 6. Registra ferramentas
      addTool(WindowLevelTool);
      addTool(ZoomTool);
      addTool(PanTool);
      addTool(LengthTool);
      addTool(StackScrollTool);

      // 7. Cria Tool Group
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

      // 8. Cria Rendering Engine
      const engineId = `PACS_RE_${Date.now()}`;
      const engine = new RenderingEngine(engineId);
      setRenderingEngine(engine);

      if (!viewerRef.current) {
        throw new Error("Elemento de visualização não encontrado");
      }

      // 9. Configura viewport
      const viewportId = `PACS_VP_${Date.now()}`;
      engine.enableElement({
        viewportId,
        type: Enums.ViewportType.STACK,
        element: viewerRef.current,
        defaultOptions: {
          background: [0, 0, 0] as [number, number, number],
        },
      });

      const vp = engine.getViewport(viewportId) as any;
      setViewport(vp);

      // 10. Adiciona viewport ao tool group
      if (toolGroup) {
        toolGroup.addViewport(viewportId, engineId);
      }

      // 11. Carrega stack de imagens
      await vp.setStack(ids, 0);
      vp.render();

      setCornerstoneReady(true);
      setIsLoading(false);
      toast.success(`${ids.length} imagem(ns) carregada(s) com sucesso`);
    } catch (err: any) {
      console.error("[DicomViewer] Erro na inicialização:", err);
      setError(err.message || "Erro ao inicializar visualizador DICOM");
      setIsLoading(false);
    }
  }, [loadStudyMetadata]);

  useEffect(() => {
    if (studyUid) {
      initViewer();
    }
    return () => {
      if (renderingEngine) {
        try {
          renderingEngine.destroy();
        } catch (_) {}
      }
    };
  }, [studyUid]);

  // Ações do viewer
  const handleZoomIn = () => {
    if (!viewport) return;
    try {
      const camera = viewport.getCamera();
      viewport.setCamera({ ...camera, parallelScale: (camera.parallelScale || 1) * 0.8 });
      viewport.render();
    } catch (e) {}
  };

  const handleZoomOut = () => {
    if (!viewport) return;
    try {
      const camera = viewport.getCamera();
      viewport.setCamera({ ...camera, parallelScale: (camera.parallelScale || 1) * 1.2 });
      viewport.render();
    } catch (e) {}
  };

  const handleRotateCW = () => {
    if (!viewport) return;
    try {
      const props = viewport.getProperties();
      viewport.setProperties({ rotation: ((props.rotation || 0) + 90) % 360 });
      viewport.render();
    } catch (e) {}
  };

  const handleRotateCCW = () => {
    if (!viewport) return;
    try {
      const props = viewport.getProperties();
      viewport.setProperties({ rotation: ((props.rotation || 0) - 90 + 360) % 360 });
      viewport.render();
    } catch (e) {}
  };

  const handleFlipH = () => {
    if (!viewport) return;
    try {
      const props = viewport.getProperties();
      viewport.setProperties({ flipHorizontal: !props.flipHorizontal });
      viewport.render();
    } catch (e) {}
  };

  const handleFlipV = () => {
    if (!viewport) return;
    try {
      const props = viewport.getProperties();
      viewport.setProperties({ flipVertical: !props.flipVertical });
      viewport.render();
    } catch (e) {}
  };

  const handleReset = () => {
    if (!viewport) return;
    try {
      viewport.resetCamera();
      viewport.resetProperties();
      viewport.render();
    } catch (e) {}
  };

  const handlePrevImage = () => {
    if (!viewport || currentIndex === 0) return;
    try {
      const newIdx = currentIndex - 1;
      viewport.setImageIdIndex(newIdx);
      setCurrentIndex(newIdx);
      viewport.render();
    } catch (e) {}
  };

  const handleNextImage = () => {
    if (!viewport || currentIndex >= imageCount - 1) return;
    try {
      const newIdx = currentIndex + 1;
      viewport.setImageIdIndex(newIdx);
      setCurrentIndex(newIdx);
      viewport.render();
    } catch (e) {}
  };

  const handleOpenRadiant = () => {
    if (!studyUid) return;
    // URL scheme do RadiAnt DICOM Viewer para abrir por Study UID
    const radiantUrl = `radiant://?n=1&v=0020000D&v=${encodeURIComponent(studyUid)}`;
    window.open(radiantUrl, "_blank");
    toast.info("Tentando abrir no RadiAnt DICOM Viewer...", {
      description: "Certifique-se que o RadiAnt está instalado no computador.",
    });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/studies")}
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
                  {formatDate(studyInfo.studyDate)} •{" "}
                  {studyInfo.studyDescription}
                </div>
              </div>
              <Badge
                variant="outline"
                className="text-xs border-blue-500 text-blue-400 h-5"
              >
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
          <ToolButton
            icon={<ZoomIn className="h-4 w-4" />}
            title="Zoom In"
            onClick={handleZoomIn}
            disabled={!cornerstoneReady}
          />
          <ToolButton
            icon={<ZoomOut className="h-4 w-4" />}
            title="Zoom Out"
            onClick={handleZoomOut}
            disabled={!cornerstoneReady}
          />
          <div className="border-t border-gray-700 my-0.5" />
          <ToolButton
            icon={<RotateCcw className="h-4 w-4" />}
            title="Girar 90° Esquerda"
            onClick={handleRotateCCW}
            disabled={!cornerstoneReady}
          />
          <ToolButton
            icon={<RotateCw className="h-4 w-4" />}
            title="Girar 90° Direita"
            onClick={handleRotateCW}
            disabled={!cornerstoneReady}
          />
          <div className="border-t border-gray-700 my-0.5" />
          <ToolButton
            icon={<FlipHorizontal className="h-4 w-4" />}
            title="Espelhar Horizontal"
            onClick={handleFlipH}
            disabled={!cornerstoneReady}
          />
          <ToolButton
            icon={<FlipVertical className="h-4 w-4" />}
            title="Espelhar Vertical"
            onClick={handleFlipV}
            disabled={!cornerstoneReady}
          />
          <div className="border-t border-gray-700 my-0.5" />
          <ToolButton
            icon={<RefreshCw className="h-4 w-4 text-yellow-400" />}
            title="Resetar Visualização"
            onClick={handleReset}
            disabled={!cornerstoneReady}
          />
        </div>

        {/* Área principal do viewer */}
        <div className="flex-1 relative bg-black">
          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20">
              <Loader2 className="h-12 w-12 text-blue-400 animate-spin mb-4" />
              <p className="text-gray-300 text-sm font-medium">
                Carregando imagens DICOM...
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Conectando ao servidor PACS (45.189.160.17:8042)
              </p>
            </div>
          )}

          {/* Error overlay */}
          {error && !isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 z-20 p-6">
              <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
              <p className="text-red-300 text-sm font-semibold mb-2">
                Erro ao carregar imagens DICOM
              </p>
              <p className="text-gray-500 text-xs text-center max-w-md mb-4">
                {error}
              </p>
              <div className="flex gap-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/studies")}
                  className="border-gray-600 text-gray-300 hover:bg-gray-800"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Voltar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={initViewer}
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
                <p>• Verifique se o servidor Orthanc está acessível</p>
                <p>• O estudo deve ter suporte a DICOMweb (WADO-RS)</p>
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

              {/* Indicador de posição */}
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
            UID: {studyUid.substring(0, 40)}
            {studyUid.length > 40 ? "..." : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// Componente auxiliar para botões da toolbar
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
          ? "bg-blue-600 text-white hover:bg-blue-700"
          : "text-gray-400 hover:text-white hover:bg-gray-700"
      } disabled:opacity-30`}
    >
      {icon}
    </Button>
  );
}
