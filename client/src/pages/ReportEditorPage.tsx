import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowLeft, Printer, CheckCircle, Search, ChevronDown, ChevronRight,
  Plus, Trash2, Star, StarOff, GripVertical, Image as ImageIcon, FileText,
  MessageSquare, Layers, X, Edit2, Check,
} from "lucide-react";

// ─── Constantes ───────────────────────────────────────────────────────────────
const LEGAL_FOOTER = `Este documento foi gerado pela plataforma de sistema de laudos "Lauds", inscrita no CNPJ nº 12.345.678/0001-90. Em caso de dúvidas, entre em contato pelo número comercial 0800 896 555 489 625. Para mais informações, acesse nosso site www.lauds.com.br ou siga-nos no Instagram @lauds_radiologia.`;

const EXAM_SUGGESTIONS = [
  "Radiografia de Tórax PA e Perfil",
  "Radiografia de Tórax PA",
  "Tomografia Computadorizada de Crânio sem Contraste",
  "Tomografia Computadorizada de Crânio com Contraste",
  "Tomografia Computadorizada de Tórax sem Contraste",
  "Tomografia Computadorizada de Tórax com Contraste",
  "Tomografia Computadorizada de Abdome e Pelve sem Contraste",
  "Tomografia Computadorizada de Abdome e Pelve com Contraste",
  "Tomografia Computadorizada de Coluna Cervical",
  "Tomografia Computadorizada de Coluna Lombar",
  "Tomografia Computadorizada de Seios da Face",
  "Tomografia Computadorizada de Mastoides",
  "Tomografia Computadorizada de Órbitas",
  "Tomografia Computadorizada de Pescoço",
  "Tomografia Computadorizada de Pelve",
  "Tomografia Computadorizada de Joelho",
  "Tomografia Computadorizada de Ombro",
  "Ressonância Magnética de Crânio sem Contraste",
  "Ressonância Magnética de Crânio com Contraste",
  "Ressonância Magnética de Coluna Cervical",
  "Ressonância Magnética de Coluna Torácica",
  "Ressonância Magnética de Coluna Lombar",
  "Ressonância Magnética de Joelho",
  "Ressonância Magnética de Ombro",
  "Ressonância Magnética de Quadril",
  "Ressonância Magnética de Abdome",
  "Ressonância Magnética de Pelve",
  "Ultrassonografia de Abdome Total",
  "Ultrassonografia de Abdome Superior",
  "Ultrassonografia Pélvica Transvaginal",
  "Ultrassonografia Pélvica Suprapúbica",
  "Ultrassonografia de Tireoide",
  "Ultrassonografia de Mama Bilateral",
  "Ultrassonografia de Partes Moles",
  "Ultrassonografia Doppler de Carótidas",
  "Ultrassonografia Doppler de Membros Inferiores",
  "Ultrassonografia Doppler de Membros Superiores",
  "Ultrassonografia de Próstata",
  "Ultrassonografia Obstétrica",
  "Ultrassonografia Morfológica",
  "Ecocardiograma Transtorácico",
  "Radiografia de Coluna Cervical AP e Perfil",
  "Radiografia de Coluna Lombar AP e Perfil",
  "Radiografia de Abdome sem Preparo",
  "Radiografia de Bacia AP",
  "Radiografia de Joelho AP e Perfil",
  "Radiografia de Ombro AP",
  "Radiografia de Mão AP e Oblíqua",
  "Radiografia de Pé AP e Perfil",
  "Radiografia de Tornozelo AP e Perfil",
  "Radiografia de Crânio AP e Perfil",
  "Mamografia Bilateral",
  "Densitometria Óssea",
  "Cintilografia Óssea",
  "Angiotomografia de Coronárias",
  "Angiotomografia de Aorta",
  "Angiotomografia Cerebral",
  "Angiorressonância Cerebral",
  "Angiorressonância de Carótidas",
];

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface StudyInfo {
  patientName: string;
  studyDescription: string;
  studyDate: string;
  birthDate: string;
  age: string;
  sex: string;
  studyInstanceUid: string;
  unitId: number | null;
}

interface DraggableImage {
  id: string;
  src: string;
  label: string;
  x: number;
  y: number;
  width: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatPatientName(name: string) {
  return (name || "").replace(/\^/g, " ").trim();
}

function formatSex(s: string) {
  const u = (s || "").toUpperCase().trim();
  return u === "M" ? "M" : u === "F" ? "F" : s || "";
}

// Formata data DICOM YYYYMMDD para DD/MM/YYYY
function formatDicomDate(dateStr: string | undefined) {
  if (!dateStr) return "";
  const s = dateStr.replace(/[^0-9]/g, "");
  if (s.length === 8) return `${s.substring(6, 8)}/${s.substring(4, 6)}/${s.substring(0, 4)}`;
  return dateStr;
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function ReportEditorPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdminMaster = user?.role === "admin_master";
  const studyUid = window.location.pathname.split("/").pop() || "";

  // Info do estudo (vinda do sessionStorage)
  const [studyInfo, setStudyInfo] = useState<StudyInfo | null>(null);

  // Título do exame no documento (definido pela aba Exames)
  const [examTitle, setExamTitle] = useState("");

  // Aba ativa da sidebar
  const [activeTab, setActiveTab] = useState<"exames" | "templates" | "frases" | "inserir">("exames");

  // Referência ao documento editável
  const docRef = useRef<HTMLDivElement>(null);
  const savedSelection = useRef<Range | null>(null);

  // Imagens arrastáveis sobre o documento
  const [draggableImages, setDraggableImages] = useState<DraggableImage[]>([]);
  const dragging = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Dados médicos (assinatura, logo, CRM)
  const unitId = studyInfo?.unitId ?? 0;
  const { data: medCtx } = trpc.medicalData.getReportContext.useQuery(
    { unitId },
    { enabled: unitId > 0 }
  );

  // Laudo existente
  const { data: existingReport } = trpc.reports.getByStudyUid.useQuery(
    { studyInstanceUid: studyUid },
    { enabled: !!studyUid }
  );

  // Mutations
  const createReport = trpc.reports.create.useMutation();
  const updateReport = trpc.reports.update.useMutation();
  const signReport = trpc.reports.sign.useMutation();
  const reviseReport = trpc.reports.revise.useMutation();

  // Estado de retificação
  const [isRevising, setIsRevising] = useState(false);
  const [reviseReason, setReviseReason] = useState("");
  const [showReviseModal, setShowReviseModal] = useState(false);

  const isSigned = existingReport?.status === 'signed' || existingReport?.status === 'revised';
  const isEditable = !isSigned || isRevising;

  // ── Carregar info do estudo ──────────────────────────────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem(`study_${studyUid}`);
    if (raw) {
      try {
        const info = JSON.parse(raw);
        setStudyInfo(info);
        setExamTitle(info.studyDescription || "");
      } catch { /* ignore */ }
    }
  }, [studyUid]);

  // ── Carregar laudo existente no documento ────────────────────────────────
  useEffect(() => {
    if (existingReport?.body && docRef.current) {
      docRef.current.innerHTML = existingReport.body;
    }
  }, [existingReport]);

  // ── Salvar seleção antes de interagir com sidebar ────────────────────────
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && docRef.current?.contains(sel.anchorNode)) {
      savedSelection.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  // ── Inserir texto no cursor ──────────────────────────────────────────────
  const insertAtCursor = useCallback((text: string) => {
    docRef.current?.focus();
    const sel = window.getSelection();
    let range: Range;
    if (savedSelection.current) {
      range = savedSelection.current;
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else if (sel && sel.rangeCount > 0) {
      range = sel.getRangeAt(0);
    } else {
      // Inserir no final
      if (docRef.current) {
        range = document.createRange();
        range.selectNodeContents(docRef.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      } else return;
    }
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);
    savedSelection.current = range.cloneRange();
  }, []);

  // ── Salvar rascunho ──────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const body = docRef.current?.innerHTML || "";
    try {
      if (existingReport?.id) {
        await updateReport.mutateAsync({ id: existingReport.id, body });
      } else {
        await createReport.mutateAsync({
          study_instance_uid: studyUid,
          body,
        });
      }
      toast.success("Rascunho salvo");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    }
  }, [existingReport, studyUid, examTitle, studyInfo, updateReport, createReport]);

  // ── Assinar ──────────────────────────────────────────────────────────────
  const handleSign = useCallback(async () => {
    if (!existingReport?.id) {
      toast.error("Salve o laudo antes de assinar");
      return;
    }
    try {
      await signReport.mutateAsync({ id: existingReport.id });
      toast.success("Laudo assinado com sucesso!");
      navigate("/");
    } catch (e: any) {
      toast.error(e.message || "Erro ao assinar");
    }
  }, [existingReport, signReport, navigate]);

  // ── Retificar laudo assinado ─────────────────────────────────────────────
  const handleRevise = useCallback(async () => {
    if (!existingReport?.id) return;
    if (!reviseReason.trim() || reviseReason.trim().length < 5) {
      toast.error("Informe o motivo da retificação (mínimo 5 caracteres)");
      return;
    }
    const body = docRef.current?.innerHTML || "";
    try {
      await reviseReport.mutateAsync({ id: existingReport.id, body, reason: reviseReason });
      toast.success("Laudo retificado com sucesso!");
      setIsRevising(false);
      setShowReviseModal(false);
      setReviseReason("");
      navigate("/");
    } catch (e: any) {
      toast.error(e.message || "Erro ao retificar");
    }
  }, [existingReport, reviseReason, reviseReport, navigate]);

  // ── Imprimir ─────────────────────────────────────────────────────────────
  const patientName = formatPatientName(studyInfo?.patientName || "");
  const handlePrint = useCallback(() => {
    // Abre janela dedicada com o conteúdo do documento para impressão correta
    const logoHtml = medCtx?.unitLogoUrl
      ? `<img src="${medCtx.unitLogoUrl}" alt="Logo" style="max-height:50px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:120px;height:40px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:9pt;">Logo da unidade</div>`;
    const patientHtml = `
      <div><strong>Paciente:</strong> ${patientName}</div>
      ${studyInfo?.birthDate ? `<div><strong>Data Nasc:</strong> ${studyInfo.birthDate}</div>` : ""}
      ${studyInfo?.age ? `<div><strong>Idade:</strong> ${studyInfo.age}</div>` : ""}
      ${studyInfo?.sex ? `<div><strong>Sexo:</strong> ${formatSex(studyInfo.sex)}</div>` : ""}
      ${studyInfo?.studyDate ? `<div><strong>Realizado em:</strong> ${formatDicomDate(studyInfo.studyDate)}</div>` : ""}
    `;
    const titleHtml = examTitle
      ? `<div style="text-align:center;font-weight:bold;font-size:14pt;margin-bottom:6mm;text-transform:uppercase;letter-spacing:0.5px;">${examTitle}</div>`
      : "";
    const bodyHtml = docRef.current?.innerHTML || "";
    const draggableHtml = draggableImages.map(img =>
      `<img src="${img.src}" alt="${img.label}" style="position:absolute;left:${img.x}px;top:${img.y}px;width:${img.width}px;" />`
    ).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Laudo</title>
      <style>
        @page { size: A4; margin: 0; }
        body { margin: 0; font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; }
        .doc { position: relative; width: 210mm; min-height: 297mm; padding: 20mm 20mm 25mm 20mm; box-sizing: border-box; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8mm; border-bottom: 1px solid #ccc; padding-bottom: 4mm; }
        .patient { text-align: right; font-size: 10pt; }
        .body { min-height: 120mm; line-height: 1.8; white-space: pre-wrap; }
        .footer { position: absolute; bottom: 20mm; left: 20mm; right: 20mm; border-top: 1px solid #eee; padding-top: 3mm; font-size: 7pt; color: #888; line-height: 1.4; }
      </style></head><body>
      <div class="doc">
        ${draggableHtml}
        <div class="header"><div>${logoHtml}</div><div class="patient">${patientHtml}</div></div>
        ${titleHtml}
        <div class="body">${bodyHtml}</div>
        <div class="footer">${LEGAL_FOOTER}</div>
      </div>
      <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>
    </body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  }, [medCtx, patientName, studyInfo, examTitle, docRef, draggableImages]);

  // ── Drag de imagens sobre o documento ───────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const img = draggableImages.find(i => i.id === id);
    if (!img) return;
    dragging.current = { id, startX: e.clientX, startY: e.clientY, origX: img.x, origY: img.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - dragging.current.startX;
      const dy = ev.clientY - dragging.current.startY;
      setDraggableImages(prev => prev.map(i =>
        i.id === dragging.current!.id
          ? { ...i, x: dragging.current!.origX + dx, y: dragging.current!.origY + dy }
          : i
      ));
    };
    const onUp = () => {
      dragging.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [draggableImages]);

  const addDraggableImage = useCallback((src: string, label: string) => {
    setDraggableImages(prev => [...prev, {
      id: `img_${Date.now()}`,
      src,
      label,
      x: 40,
      y: 40,
      width: 160,
    }]);
  }, []);

  const removeDraggableImage = useCallback((id: string) => {
    setDraggableImages(prev => prev.filter(i => i.id !== id));
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  const examDesc = examTitle || studyInfo?.studyDescription || "";

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden print:block">
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0 print:hidden">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="w-px h-6 bg-gray-200" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{patientName || "Carregando..."}</p>
          {examDesc && <p className="text-xs text-gray-500 truncate">{examDesc}</p>}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5 text-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir
          </Button>
          {isSigned ? (
            isRevising ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setIsRevising(false); setReviseReason(""); }}
                  className="gap-1.5 text-xs"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowReviseModal(true)}
                  disabled={reviseReport.isPending}
                  className="gap-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  {reviseReport.isPending ? "Salvando..." : "Salvar Retificação"}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => setIsRevising(true)}
                className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Editar
              </Button>
            )
          ) : (
            <Button
              size="sm"
              onClick={handleSign}
              disabled={signReport.isPending}
              className="gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              {signReport.isPending ? "Assinando..." : "Assinar"}
            </Button>
          )}
        </div>
      </header>

      {/* ── CORPO ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden print:block">
        {/* ── SIDEBAR ──────────────────────────────────────────────────── */}
        <aside className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden print:hidden">
          {/* Abas */}
          <div className="flex border-b border-gray-200 bg-white">
            {(["exames", "templates", "frases", "inserir"] as const).map((tab) => {
              const icons = {
                exames: <Search className="h-3.5 w-3.5" />,
                templates: <FileText className="h-3.5 w-3.5" />,
                frases: <MessageSquare className="h-3.5 w-3.5" />,
                inserir: <Layers className="h-3.5 w-3.5" />,
              };
              const labels = { exames: "Exames", templates: "Templates", frases: "Frases", inserir: "Inserir" };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                    activeTab === tab
                      ? "text-blue-600 border-b-2 border-blue-600 bg-white"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {icons[tab]}
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          {/* Conteúdo da aba */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "exames" && (
              <ExamesTab
                onSelectExam={(name) => setExamTitle(name)}
                currentTitle={examTitle}
              />
            )}
            {activeTab === "templates" && (
              <TemplatesTab
                onApplyTemplate={(body) => {
                  if (docRef.current) docRef.current.innerHTML = body;
                }}
              />
            )}
            {activeTab === "frases" && (
              <FrasesTab
                onInsert={insertAtCursor}
                onFocus={saveSelection}
              />
            )}
            {activeTab === "inserir" && (
              <InserirTab
                stampUrl={medCtx?.stampUrl ?? null}
                doctorName={medCtx?.doctorName ?? ""}
                crm={medCtx?.crm ?? ""}
                unitLogoUrl={medCtx?.unitLogoUrl ?? null}
                unitId={unitId}
                isAdmin={user?.role === "admin_master" || user?.role === "unit_admin"}
                onInsertImage={addDraggableImage}
              />
            )}
          </div>

          {/* Botão salvar rascunho no rodapé da sidebar */}
          <div className="p-3 border-t border-gray-200 bg-white">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={handleSave}
              disabled={createReport.isPending || updateReport.isPending}
            >
              {(createReport.isPending || updateReport.isPending) ? "Salvando..." : "Salvar Rascunho"}
            </Button>
          </div>
        </aside>

        {/* ── ÁREA DO DOCUMENTO ────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-gray-100 flex justify-center py-8 print:bg-white print:p-0 print:block">
          <div
            className="relative bg-white shadow-md print:shadow-none"
            style={{ width: "210mm", minHeight: "297mm" }}
          >
            {/* Imagens arrastáveis */}
            {draggableImages.map((img) => (
              <div
                key={img.id}
                style={{ position: "absolute", left: img.x, top: img.y, width: img.width, zIndex: 10, cursor: "grab" }}
                onMouseDown={(e) => handleMouseDown(e, img.id)}
              >
                <div className="relative group">
                  <img src={img.src} alt={img.label} style={{ width: "100%", display: "block" }} />
                  <button
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity print:hidden"
                    onClick={() => removeDraggableImage(img.id)}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[8px] text-center py-0.5 opacity-0 group-hover:opacity-100 print:hidden">
                    <GripVertical className="h-3 w-3 inline" /> {img.label}
                  </div>
                </div>
              </div>
            ))}

            {/* Conteúdo do documento */}
            <div style={{ padding: "20mm 20mm 25mm 20mm", fontFamily: "Times New Roman, serif", fontSize: "12pt", color: "#000" }}>
              {/* Cabeçalho: Logo + dados do paciente */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8mm", borderBottom: "1px solid #ccc", paddingBottom: "4mm" }}>
                <div>
                  {medCtx?.unitLogoUrl ? (
                    <img src={medCtx.unitLogoUrl} alt="Logo" style={{ maxHeight: "50px", maxWidth: "160px", objectFit: "contain" }} />
                  ) : (
                    <div style={{ width: 120, height: 40, border: "1px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb", fontSize: "9pt" }}>
                      Logo da unidade
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", fontSize: "10pt" }}>
                  <div><strong>Paciente:</strong> {patientName}</div>
                  {studyInfo?.birthDate && <div><strong>Data Nasc:</strong> {studyInfo.birthDate}</div>}
                  {studyInfo?.age && <div><strong>Idade:</strong> {studyInfo.age}</div>}
                  {studyInfo?.sex && <div><strong>Sexo:</strong> {formatSex(studyInfo.sex)}</div>}
                  {studyInfo?.studyDate && <div><strong>Realizado em:</strong> {formatDicomDate(studyInfo.studyDate)}</div>}
                </div>
              </div>

              {/* Título do exame */}
              {examTitle && (
                <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "14pt", marginBottom: "6mm", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {examTitle}
                </div>
              )}

              {/* Banner de laudo assinado */}
              {isSigned && !isRevising && (
                <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, padding: '8px 12px', marginBottom: 8, fontSize: '10pt', color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                  <span>Laudo <strong>{existingReport?.status === 'revised' ? 'retificado' : 'assinado'}</strong> — clique em <strong>Editar</strong> para retificar.</span>
                </div>
              )}

              {/* Corpo editável */}
              <div
                ref={docRef}
                contentEditable={isEditable}
                suppressContentEditableWarning
                onMouseUp={isEditable ? saveSelection : undefined}
                onKeyUp={isEditable ? saveSelection : undefined}
                data-placeholder="Digite o laudo aqui..."
                style={{
                  minHeight: "120mm",
                  outline: "none",
                  lineHeight: 1.8,
                  whiteSpace: "pre-wrap",
                  cursor: isEditable ? 'text' : 'default',
                  background: isEditable ? 'transparent' : '#fafafa',
                }}
              />

              {/* Rodapé legal fixo na parte inferior */}
              <div style={{ position: "absolute", bottom: "20mm", left: "20mm", right: "20mm", borderTop: "1px solid #eee", paddingTop: "3mm", fontSize: "7pt", color: "#888", lineHeight: 1.4 }}>
                {LEGAL_FOOTER}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Modal de motivo de retificação */}
      {showReviseModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 440, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>Motivo da Retificação</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#666' }}>Descreva o motivo da alteração. Este registro será salvo no histórico de versões do laudo.</p>
            <textarea
              value={reviseReason}
              onChange={e => setReviseReason(e.target.value)}
              placeholder="Ex: Correção de erro tipográfico no parágrafo 2..."
              rows={4}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 12px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowReviseModal(false)}
                style={{ padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleRevise}
                disabled={reviseReport.isPending || reviseReason.trim().length < 5}
                style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: reviseReason.trim().length < 5 ? '#ccc' : '#ea580c', color: '#fff', cursor: reviseReason.trim().length < 5 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                {reviseReport.isPending ? 'Salvando...' : 'Confirmar Retificação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Estilos de impressão */}
      <style>{`
        @media print {
          body { margin: 0; }
          * { overflow: visible !important; }
          .print\\:hidden { display: none !important; }
          [contenteditable] { outline: none !important; }
        }
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #bbb;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

// ─── Aba Exames ───────────────────────────────────────────────────────────────
function ExamesTab({ onSelectExam, currentTitle }: { onSelectExam: (name: string) => void; currentTitle: string }) {
  const [search, setSearch] = useState("");
  const filtered = EXAM_SUGGESTIONS.filter(e => e.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Selecionar Exame</p>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar exame..."
          className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      <div className="space-y-0.5">
        {filtered.map((exam) => (
          <button
            key={exam}
            onClick={() => onSelectExam(exam)}
            className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors ${
              currentTitle === exam
                ? "bg-blue-100 text-blue-700 font-medium"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {exam}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-4">
            <p className="text-xs text-gray-400">Nenhum exame encontrado</p>
            <button
              onClick={() => onSelectExam(search)}
              className="mt-1 text-xs text-blue-600 hover:underline"
            >
              Usar "{search}" como título
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Aba Templates ────────────────────────────────────────────────────────────
function TemplatesTab({ onApplyTemplate }: { onApplyTemplate: (body: string) => void }) {
  const { data: rawTemplates = [], refetch } = trpc.templates.list.useQuery();
  const templates = rawTemplates.filter(Boolean);
  const createTemplate = trpc.templates.create.useMutation({ onSuccess: () => { refetch(); toast.success("Template criado"); } });
  const deleteTemplate = trpc.templates.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Template excluído"); } });

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newModality, setNewModality] = useState("");
  const [newBody, setNewBody] = useState("");

  // Agrupar por modalidade
  const grouped: Record<string, typeof templates> = {};
  for (const t of templates) {
    const key = t.modality || "Geral";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  }
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (k: string) => setOpenGroups(prev => ({ ...prev, [k]: !prev[k] }));

  const handleCreate = () => {
    if (!newName.trim() || !newBody.trim()) { toast.error("Preencha nome e conteúdo"); return; }
    createTemplate.mutate({ name: newName.trim(), modality: newModality.trim() || undefined, bodyTemplate: newBody.trim(), isGlobal: false });
    setShowNew(false); setNewName(""); setNewModality(""); setNewBody("");
  };

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Meus Templates</p>
        <button onClick={() => setShowNew(!showNew)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
          <Plus className="h-3.5 w-3.5" /> Novo
        </button>
      </div>

      {showNew && (
        <div className="border border-gray-200 rounded p-2 space-y-1.5 bg-white">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do template" className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <input value={newModality} onChange={e => setNewModality(e.target.value)} placeholder="Modalidade (ex: TC Crânio)" className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <textarea value={newBody} onChange={e => setNewBody(e.target.value)} placeholder="Conteúdo do template..." rows={4} className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
          <div className="flex gap-1">
            <button onClick={handleCreate} className="flex-1 text-xs bg-blue-600 text-white rounded py-1 hover:bg-blue-700">Criar</button>
            <button onClick={() => setShowNew(false)} className="flex-1 text-xs border border-gray-200 rounded py-1 hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      )}

      {Object.keys(grouped).length === 0 && !showNew && (
        <p className="text-xs text-gray-400 text-center py-4">Nenhum template criado</p>
      )}

      {Object.entries(grouped).map(([group, items]) => (
        <div key={group} className="border border-gray-200 rounded overflow-hidden">
          <button
            onClick={() => toggleGroup(group)}
            className="w-full flex items-center justify-between px-2 py-1.5 bg-gray-50 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            <span>{group}</span>
            {openGroups[group] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          {openGroups[group] && (
            <div className="divide-y divide-gray-100">
              {items.map(t => (
                <div key={t.id} className="flex items-center gap-1 px-2 py-1.5 hover:bg-blue-50 group">
                  <button
                    onClick={() => onApplyTemplate(t.bodyTemplate)}
                    className="flex-1 text-left text-xs text-gray-700 truncate"
                  >
                    {t.name}
                  </button>
                  <button
                    onClick={() => { if (confirm("Excluir template?")) deleteTemplate.mutate({ id: t.id }); }}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Aba Frases ───────────────────────────────────────────────────────────────
function FrasesTab({ onInsert, onFocus }: { onInsert: (text: string) => void; onFocus: () => void }) {
  const { data: rawGroups = [], refetch: refetchGroups } = trpc.phrases.listGroups.useQuery();
  const { data: rawPhrases = [], refetch: refetchPhrases } = trpc.phrases.list.useQuery();
  const groups = rawGroups.filter(Boolean);
  const phrases = rawPhrases.filter(Boolean);
  const createGroup = trpc.phrases.createGroup.useMutation({ onSuccess: () => { refetchGroups(); toast.success("Grupo criado"); } });
  const createPhrase = trpc.phrases.create.useMutation({ onSuccess: () => { refetchPhrases(); toast.success("Frase adicionada"); } });
  const deletePhrase = trpc.phrases.delete.useMutation({ onSuccess: () => { refetchPhrases(); toast.success("Frase excluída"); } });
  const toggleFav = trpc.phrases.toggleFavorite.useMutation({ onSuccess: () => refetchPhrases() });

  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({});
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingPhrase, setAddingPhrase] = useState<number | null>(null);
  const [newPhraseText, setNewPhraseText] = useState("");

  const toggleGroup = (id: number) => setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    createGroup.mutate({ name: newGroupName.trim() });
    setShowNewGroup(false); setNewGroupName("");
  };

  const handleAddPhrase = (groupId: number) => {
    if (!newPhraseText.trim()) return;
    createPhrase.mutate({ groupId, content: newPhraseText.trim() });
    setAddingPhrase(null); setNewPhraseText("");
  };

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Frases Prontas</p>
        <button onClick={() => setShowNewGroup(!showNewGroup)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
          <Plus className="h-3.5 w-3.5" /> Grupo
        </button>
      </div>

      {showNewGroup && (
        <div className="flex gap-1">
          <input
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreateGroup()}
            placeholder="Nome do grupo..."
            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            autoFocus
          />
          <button onClick={handleCreateGroup} className="text-xs bg-blue-600 text-white rounded px-2 hover:bg-blue-700">OK</button>
          <button onClick={() => setShowNewGroup(false)} className="text-xs border border-gray-200 rounded px-2 hover:bg-gray-50">✕</button>
        </div>
      )}

      {groups.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">Nenhum grupo criado</p>
      )}

      {groups.map(group => {
        const groupPhrases = phrases.filter(p => p.group_id === group.id);
        const isOpen = openGroups[group.id] ?? false;
        return (
          <div key={group.id} className="border border-gray-200 rounded overflow-hidden">
            <button
              onClick={() => toggleGroup(group.id)}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-gray-50 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              <span>{group.name}</span>
              <div className="flex items-center gap-1">
                <span className="text-gray-400 text-[10px]">{groupPhrases.length}</span>
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </div>
            </button>
            {isOpen && (
              <div className="divide-y divide-gray-100">
                {groupPhrases.map(phrase => (
                  <div key={phrase.id} className="flex items-start gap-1 px-2 py-1.5 hover:bg-blue-50 group">
                    <button
                      onClick={() => { onFocus(); onInsert(phrase.content); }}
                      className="flex-1 text-left text-xs text-gray-700 leading-relaxed"
                    >
                      {phrase.content}
                    </button>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                      <button
                        onClick={() => toggleFav.mutate({ phraseId: phrase.id, isFavorite: !phrase.is_favorite })}
                        className={phrase.is_favorite ? "text-amber-400" : "text-gray-300 hover:text-amber-400"}
                      >
                        <Star className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => deletePhrase.mutate({ phraseId: phrase.id })}
                        className="text-red-300 hover:text-red-500"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {addingPhrase === group.id ? (
                  <div className="p-2 space-y-1">
                    <textarea
                      value={newPhraseText}
                      onChange={e => setNewPhraseText(e.target.value)}
                      placeholder="Digite a frase..."
                      rows={2}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                      autoFocus
                    />
                    <div className="flex gap-1">
                      <button onClick={() => handleAddPhrase(group.id)} className="flex-1 text-xs bg-blue-600 text-white rounded py-0.5 hover:bg-blue-700">Adicionar</button>
                      <button onClick={() => { setAddingPhrase(null); setNewPhraseText(""); }} className="text-xs border border-gray-200 rounded px-2 hover:bg-gray-50">✕</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingPhrase(group.id)}
                    className="w-full text-left px-2 py-1.5 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Adicionar frase
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


// ─── Aba Inserir ──────────────────────────────────────────────────────────────
function InserirTab({
  stampUrl,
  doctorName,
  crm,
  unitLogoUrl,
  unitId,
  isAdmin,
  onInsertImage,
}: {
  stampUrl: string | null;
  doctorName: string;
  crm: string;
  unitLogoUrl: string | null;
  unitId: number;
  isAdmin: boolean;
  onInsertImage: (src: string, label: string) => void;
}) {
  const removeStamp = trpc.medicalData.removeStamp.useMutation();
  const removeLogo = trpc.medicalData.removeLogo.useMutation();
  const utils = trpc.useUtils();

  const handleRemoveStamp = async () => {
    if (!confirm("Tem certeza que deseja remover o carimbo?")) return;
    try {
      await removeStamp.mutateAsync({ userId: 0 });
      await utils.medicalData.getReportContext.invalidate();
      toast.success("Carimbo removido");
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover carimbo");
    }
  };

  const handleRemoveLogo = async () => {
    if (!confirm("Tem certeza que deseja remover o logo da unidade?")) return;
    try {
      await removeLogo.mutateAsync({ unitId });
      await utils.medicalData.getReportContext.invalidate();
      toast.success("Logo removido");
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover logo");
    }
  };

  return (
    <div className="p-3 space-y-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Inserir no Documento</p>
      <p className="text-xs text-gray-500">Clique para inserir a imagem no documento. Após inserida, arraste para posicioná-la.</p>

      {/* Logo da Unidade */}
      {unitLogoUrl && (
        <div className="border border-gray-200 rounded p-2 space-y-2">
          <p className="text-xs font-medium text-gray-700">Logo da Unidade</p>
          <div className="bg-white border border-gray-100 rounded p-2 flex items-center justify-center">
            <img src={unitLogoUrl} alt="Logo" className="max-h-16 object-contain" />
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => onInsertImage(unitLogoUrl, "Logo da Unidade")}
              className="flex-1 text-xs bg-blue-600 text-white rounded py-1.5 hover:bg-blue-700 flex items-center justify-center gap-1"
            >
              <Layers className="h-3.5 w-3.5" />
              Inserir Logo
            </button>
            {isAdmin && (
              <button
                onClick={handleRemoveLogo}
                disabled={removeLogo.isPending}
                className="text-xs bg-red-500 text-white rounded py-1.5 px-3 hover:bg-red-600 flex items-center justify-center gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Carimbo do Médico */}
      {stampUrl && (
        <div className="border border-gray-200 rounded p-2 space-y-2">
          <p className="text-xs font-medium text-gray-700">Carimbo do Médico</p>
          <div className="bg-white border border-gray-100 rounded p-2 flex items-center justify-center">
            <img src={stampUrl} alt="Carimbo" className="max-h-20 object-contain" />
          </div>
          <p className="text-[10px] text-gray-500 text-center">{doctorName}{crm ? ` — CRM: ${crm}` : ""}</p>
          <div className="flex gap-1">
            <button
              onClick={() => onInsertImage(stampUrl, "Carimbo")}
              className="flex-1 text-xs bg-gray-700 text-white rounded py-1.5 hover:bg-gray-800 flex items-center justify-center gap-1"
            >
              <Layers className="h-3.5 w-3.5" />
              Inserir Carimbo
            </button>
            {isAdmin && (
              <button
                onClick={handleRemoveStamp}
                disabled={removeStamp.isPending}
                className="text-xs bg-red-500 text-white rounded py-1.5 px-3 hover:bg-red-600 flex items-center justify-center gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {!unitLogoUrl && !stampUrl && (
        <p className="text-xs text-gray-400 text-center py-4">Nenhuma imagem disponível</p>
      )}
    </div>
  );
}
