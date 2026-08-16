import { useState, useEffect, useRef, useCallback } from "react";
import DOMPurify from 'dompurify';
import type { LayoutPreferences, LayoutSnapshot } from '../../../shared/types';
import { SharedReportBodyGuide, SharedReportSheet } from "@/components/SharedReportSheet";
import { renderSharedReportSheetHtml } from "@/components/SharedReportPrint";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowLeft, Printer, CheckCircle, Search, ChevronDown, ChevronRight,
  Plus, Trash2, Star, StarOff, GripVertical, Image as ImageIcon, FileText,
  MessageSquare, Layers, X, Edit2, Check, Copy,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Eye, EyeOff, BookOpen, Upload, Highlighter,
} from "lucide-react";

// F1-4: Sanitiza HTML antes de atribuir ao innerHTML (previne XSS no editor de laudos)
function sanitizeHtmlForEditor(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'sub', 'sup', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr',
      'ul', 'ol', 'li', 'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col',
    ],
    ALLOWED_ATTR: [
      'style', 'class', 'id', 'align', 'valign',
      'href', 'target', 'rel',
      'src', 'alt', 'width', 'height',
      'colspan', 'rowspan', 'span',
    ],
    ALLOW_DATA_ATTR: false,
  });
}

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
  modality?: string;
  accessionNumber?: string;
  examCount?: number;
  examNames?: string[];
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

// ─── Utilitários de impressão (fora do componente para evitar re-criação a cada render) ─

// P8/P4: mapeamento de fontes com fallback seguro
const SAFE_FONTS: Record<string, string> = {
  'Arial':           'Arial, Helvetica, sans-serif',
  'Calibri':         'Calibri, "Gill Sans", sans-serif',
  'Times New Roman': '"Times New Roman", Times, serif',
  'Georgia':         'Georgia, "Times New Roman", serif',
  'Helvetica':       '"Helvetica Neue", Helvetica, Arial, sans-serif',
  'Verdana':         'Verdana, Geneva, sans-serif',
};

// P1/P2: converte uma URL de imagem para base64 — necessário para janela de print (popup)
async function fetchToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null; // falhou silenciosamente — imprime sem fundo
  }
}

// P7/P4: converter imagens <img> para base64 para garantir que apareçam na janela de impressão
async function convertImagesToBase64(html: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const images = doc.querySelectorAll('img');
  await Promise.all(Array.from(images).map(async (img) => {
    const b64 = await fetchToBase64(img.src);
    if (b64) img.src = b64;
  }));
  return doc.body.innerHTML;
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
  // Edição inline do título
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // FIX: persistir o título escolhido pelo médico para uso na impressão
  // handlePrintReport em PacsQueryPage lê de localStorage['exam_label_...']
  useEffect(() => {
    if (examTitle && studyUid) {
      localStorage.setItem(`exam_label_${studyUid}`, examTitle);
    }
  }, [examTitle, studyUid]);

  // Aba ativa da sidebar
  // Redesign: 3 abas diretas conforme REDESIGN_EDITOR_LAUDOS.txt
  const [activeTab, setActiveTab] = useState<"modelos" | "frases" | "carimbo">("modelos");
  // Mobile: ferramentas auxiliares em uma gaveta inferior, sem dividir a tela do editor
  const [showMobileTools, setShowMobileTools] = useState(false);
  // DnD: controla o highlight do editor quando um item está sendo arrastado sobre ele
  const [isDragOver, setIsDragOver] = useState(false);

  // Referências aos documentos editáveis; o mobile usa uma instância própria para não conflitar com o DOM desktop oculto.
  const docRef = useRef<HTMLDivElement>(null);
  const mobileDocRef = useRef<HTMLDivElement>(null);
  const getVisibleDoc = useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      return mobileDocRef.current ?? docRef.current;
    }
    return docRef.current ?? mobileDocRef.current;
  }, []);
  const savedSelection = useRef<Range | null>(null);

  // Suporte a múltiplos exames (multi-seção)
  // examNames: array de nomes dos exames (ex: ['RX TÓRAX PA E PERFIL', 'SEIOS DA FACE'])
  // sectionBodies: array de HTML de cada seção, indexado por posição
  const [examNames, setExamNames] = useState<string[]>([]);
  const [sectionBodies, setSectionBodies] = useState<string[]>([]);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  // FIX BUG-1: rastreia qual seção está em foco no modo multi-seção
  const activeSectionRef = useRef<number>(0);
  const isMultiSection = examNames.length > 1;

  // FIX BUG-2: imagens inline no contentEditable (sem overlay arrastável)

  // Dados médicos (assinatura, logo, CRM)
  const unitId = studyInfo?.unitId ?? 0;
  const { data: medCtx } = trpc.medicalData.getReportContext.useQuery(
    { unitId },
    { enabled: unitId > 0 }
  );

  // Layout da unidade para o documento do laudo
  const { data: unitLayout, refetch: refetchUnitLayout } = trpc.layouts.getByUnit.useQuery(
    { unitId },
    { enabled: unitId > 0 }
  );

  // Mantém o laudo aberto sincronizado com alterações feitas no editor administrativo.
  useEffect(() => {
    if (unitId <= 0) return;
    const refreshIfSameUnit = (payload: unknown) => {
      const update = payload as { unitId?: number } | null;
      if (update?.unitId === unitId) void refetchUnitLayout();
    };
    const onCustomUpdate = (event: Event) => refreshIfSameUnit((event as CustomEvent<{ unitId?: number }>).detail);
    const onStorageUpdate = (event: StorageEvent) => {
      if (event.key !== "pacs-layout-updated" || !event.newValue) return;
      try { refreshIfSameUnit(JSON.parse(event.newValue)); } catch { /* ignorar evento inválido */ }
    };
    window.addEventListener("pacs-layout-updated", onCustomUpdate);
    window.addEventListener("storage", onStorageUpdate);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("pacs-layout-updates") : null;
    channel?.addEventListener("message", event => refreshIfSameUnit(event.data));
    return () => {
      window.removeEventListener("pacs-layout-updated", onCustomUpdate);
      window.removeEventListener("storage", onStorageUpdate);
      channel?.close();
    };
  }, [unitId, refetchUnitLayout]);

  // Laudo existente
  const { data: existingReport } = trpc.reports.getByStudyUid.useQuery(
    { studyInstanceUid: studyUid },
    { enabled: !!studyUid }
  );

  // Mutations
  const utils = trpc.useUtils();
  const createReport = trpc.reports.create.useMutation();
  const updateReport = trpc.reports.update.useMutation();
  const signReport = trpc.reports.sign.useMutation();
  const reviseReport = trpc.reports.revise.useMutation();
  const deleteReport = trpc.reports.delete.useMutation();
  const saveMetadata = trpc.studyMetadata.save.useMutation();

  // Estado de retificação
  const [isRevising, setIsRevising] = useState(false);
  const [reviseReason, setReviseReason] = useState("");
  const [showReviseModal, setShowReviseModal] = useState(false);
  // Bug fix B3: capturar body no momento de abertura do modal (não ao confirmar),
  // evitando race condition caso o usuário edite o documento enquanto o modal está aberto.
  const [pendingReviseBody, setPendingReviseBody] = useState<string>("");

  // Estado de exclusão
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  // LOG-01: motivo obrigatório para admin_master apagar laudo assinado/retificado
  const [deleteReason, setDeleteReason] = useState("");

  const isSigned = existingReport?.status === 'signed' || existingReport?.status === 'revised';
  const isEditable = !isSigned || isRevising;
  // ── Toolbar de formatação ────────────────────────────────────────────────
  const [fontSize, setFontSize] = useState("11");
  // ── Pré-visualização ─────────────────────────────────────────────────────
  const [isPreview, setIsPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [editorContentVersion, setEditorContentVersion] = useState(0);
  const markEditorContentChanged = useCallback(() => {
    setEditorContentVersion(version => version + 1);
  }, []);
  // ── Painel flutuante de Máscaras ─────────────────────────────────────────
  const [showMasksPanel, setShowMasksPanel] = useState(false);
  const [maskSearch, setMaskSearch] = useState("");
  const maskFileRef = useRef<HTMLInputElement>(null);
  // Query de máscaras (pessoais + unidade)
  const { data: masks, refetch: refetchMasks } = trpc.masks.list.useQuery(
    { unitId },
    { enabled: unitId > 0 && showMasksPanel }
  );
  const importMasks = trpc.masks.import.useMutation({
    onSuccess: (r) => { toast.success(`${r.imported} máscara(s) importada(s)`); refetchMasks(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMask = trpc.masks.delete.useMutation({
    onSuccess: () => { toast.success("Máscara removida"); refetchMasks(); },
    onError: (e) => toast.error(e.message),
  });
  // Aplica tamanho de fonte na seção ativa
  const applyFontSize = useCallback((size: string) => {
    setFontSize(size);
    const el = isMultiSection
      ? sectionRefs.current[activeSectionRef.current]
      : getVisibleDoc();
    if (el) el.style.fontSize = `${size}pt`;
  }, [isMultiSection, getVisibleDoc]);
  // Importa máscaras de arquivo JSON
  const handleMaskFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const arr = Array.isArray(data) ? data : [data];
        importMasks.mutate({ unitId, scope: isAdminMaster ? "unit" : "personal", masks: arr });
      } catch { toast.error("Arquivo JSON inválido"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [unitId, isAdminMaster, importMasks]);
  // Aplica máscara no editor
  const applyMask = useCallback((body: string, examTitle?: string | null) => {
    const clean = sanitizeHtmlForEditor(body);
    if (isMultiSection) {
      const el = sectionRefs.current[activeSectionRef.current];
      if (el) { el.innerHTML = clean; el.focus(); }
    } else {
      const visibleDoc = getVisibleDoc();
      if (visibleDoc) visibleDoc.innerHTML = clean;
    }
    if (examTitle) setExamTitle(examTitle);
    setShowMasksPanel(false);
  }, [isMultiSection, getVisibleDoc]);
  // Captura HTML atual para pré-visualização
  const handleTogglePreview = useCallback(() => {
    if (!isPreview) {
      const html = isMultiSection
        ? sectionRefs.current.map(el => el?.innerHTML ?? "").join("<hr/>")
        : getVisibleDoc()?.innerHTML ?? "";
      setPreviewHtml(html);
    }
    setIsPreview(p => !p);
  }, [isPreview, isMultiSection, getVisibleDoc]);

  // ── Carregar info do estudo ──────────────────────────────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem(`study_${studyUid}`);
    if (raw) {
      try {
        const info = JSON.parse(raw);
        setStudyInfo(info);
        setExamTitle(info.studyDescription || "");
        // Configura multi-seção se houver mais de 1 exame
        if (info.examNames && info.examNames.length > 1) {
          setExamNames(info.examNames);
          setSectionBodies(info.examNames.map(() => ""));
        } else {
          setExamNames([]);
          setSectionBodies([]);
        }
      } catch { /* ignore */ }
    }
  }, [studyUid]);

  // ── Carregar laudo existente no documento ────────────────────────────────────
  useEffect(() => {
    if (!existingReport?.body) return;
    if (isMultiSection && sectionRefs.current.length > 0) {
      // Laudo multi-página: tentar parsear JSON [{title, body}, ...]
      try {
        const pages: { title: string; body: string }[] = JSON.parse(existingReport.body);
        if (Array.isArray(pages)) {
          pages.forEach((page, i) => {
            if (sectionRefs.current[i]) {
              sectionRefs.current[i]!.innerHTML = sanitizeHtmlForEditor(page.body || "");
            }
          });
          return;
        }
      } catch { /* não é JSON — tentar formato legado */ }
      // Formato legado (HTML com .exam-section divs ou separador |||SECTION|||)
      if (existingReport.body.includes('class="exam-section"')) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(existingReport.body, "text/html");
        const sections = doc.querySelectorAll(".exam-section");
        sections.forEach((sec, i) => {
          const bodyDiv = sec.querySelector(".exam-section-body, div:last-child");
          if (sectionRefs.current[i] && bodyDiv) {
            sectionRefs.current[i]!.innerHTML = sanitizeHtmlForEditor(bodyDiv.innerHTML);
          }
        });
      } else {
        // Laudo antigo sem seções — colocar tudo na primeira página
        if (sectionRefs.current[0]) {
          sectionRefs.current[0].innerHTML = sanitizeHtmlForEditor(existingReport.body);
        }
      }
    } else if (docRef.current) {
      docRef.current.innerHTML = sanitizeHtmlForEditor(existingReport.body);
    }
  }, [existingReport, isMultiSection]);

  // Recalcula a guia visual depois que o conteúdo existente foi aplicado via DOM.
  useEffect(() => {
    markEditorContentChanged();
    const targets = [docRef.current, mobileDocRef.current, ...sectionRefs.current].filter(Boolean) as HTMLDivElement[];
    if (typeof MutationObserver === "undefined" || targets.length === 0) return;
    const observer = new MutationObserver(() => markEditorContentChanged());
    targets.forEach(target => observer.observe(target, { childList: true, subtree: true, characterData: true }));
    return () => observer.disconnect();
  }, [existingReport, isMultiSection, markEditorContentChanged]);

  // ── Salvar seleção antes de interagir com sidebar ────────────────────────
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && docRef.current?.contains(sel.anchorNode)) {
      savedSelection.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  // FIX BUG-1: usar execCommand('insertText') em vez de range.insertNode()
  // Garante cursor após o texto inserido (sem ordem reversa) e Undo/Redo nativo.
  const insertAtCursor = useCallback((text: string) => {
    // Determinar o elemento editor correto para o modo ativo
    const targetEl = isMultiSection
      ? sectionRefs.current[activeSectionRef.current]
      : docRef.current;

    if (!targetEl) return;

    // Restaurar foco e seleção salva antes de inserir
    targetEl.focus();

    if (savedSelection.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedSelection.current);
    } else {
      // Sem seleção salva: posicionar cursor no final do editor
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(targetEl);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    // execCommand garante: cursor avança após o texto, Undo/Redo nativo funciona,
    // nós de texto são normalizados automaticamente pelo browser.
    document.execCommand('insertText', false, text);

    // Salvar a nova posição do cursor após a inserção
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelection.current = sel.getRangeAt(0).cloneRange();
    }
  }, [isMultiSection]);

  // ── Salvar rascunho ──────────────────────────────────────────────────────
  // ── Coletar body (simples ou multi-página) ──────────────────────────────
  // MULTI-PÁGINA: serializa como JSON [{title, body}, ...] para preservar
  // estrutura de páginas independentes. Registro único no banco (1 body por studyInstanceUid).
  // PÁGINA ÚNICA: retorna HTML puro (compatibilidade com laudos existentes).
  const collectBody = useCallback(() => {
    if (existingReport?.body && (isSigned && !isRevising)) {
      return existingReport.body;
    }
    if (isMultiSection && sectionRefs.current.length > 0) {
      const pages = examNames.map((name, i) => ({
        title: name,
        body: sectionRefs.current[i]?.innerHTML || "",
      }));
      return JSON.stringify(pages);
    }
    return getVisibleDoc()?.innerHTML || existingReport?.body || "";
  }, [isMultiSection, examNames, getVisibleDoc, existingReport, isSigned, isRevising]);

  const handleSave = useCallback(async () => {
    const body = collectBody();
    try {
      if (existingReport?.id) {
        await updateReport.mutateAsync({ id: existingReport.id, body });
      } else {
        await createReport.mutateAsync({
          study_instance_uid: studyUid,
          body,
          unit_id: studyInfo?.unitId ?? undefined, // multi-unidade: passa a unidade selecionada
        });
        // Forçar refetch imediato para que cliques subsequentes usem update em vez de create
        await utils.reports.getByStudyUid.invalidate({ studyInstanceUid: studyUid });
      }
      toast.success("Rascunho salvo");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    }
  }, [existingReport, studyUid, examTitle, studyInfo, updateReport, createReport, collectBody]);

  // ── Assinar ──────────────────────────────────────────────────────────────
  // Salva o laudo automaticamente (se necessário) e depois assina em um único clique
  const handleSign = useCallback(async () => {
    const body = collectBody();
    if (!body.trim() || body.trim() === "<br>" || body.trim() === "<p></p>") {
      toast.error("Digite o conteúdo do laudo antes de assinar");
      return;
    }
    try {
      let reportId = existingReport?.id;
      // Se não existe laudo salvo ainda, criar primeiro
      if (!reportId) {
        const result = await createReport.mutateAsync({
          study_instance_uid: studyUid,
          body,
          unit_id: studyInfo?.unitId ?? undefined, // multi-unidade: passa a unidade selecionada
        });
        reportId = result.id;
      } else {
        // Atualizar o corpo do laudo antes de assinar
        await updateReport.mutateAsync({ id: reportId, body });
      }
      // Assinar + registrar evento financeiro atômico no backend
      // FIX GAP-1: construir snapshot do layout no momento da assinatura
      // Congela as configurações visuais para que alterações futuras na unidade
      // não afetem laudos já assinados
      const layoutSnapshot: LayoutSnapshot | null = unitLayout ? {
        preferences:  unitLayout.preferences as LayoutPreferences,
        header_html:  unitLayout.header_html ?? null,
        footer_html:  unitLayout.footer_html ?? null,
        background_image_url: unitLayout.background_image_url ?? null,
        background_opacity: unitLayout.background_opacity ?? null,
        background_size: unitLayout.background_size ?? null,
        footer_image_url: unitLayout.footer_image_url ?? null,
        logos: Array.isArray(unitLayout.logos) ? unitLayout.logos : null,
        block_positions: (unitLayout.block_positions as LayoutSnapshot["block_positions"]) ?? null,
        capturedAt:   new Date().toISOString(),
      } : null;

      const signResult = await signReport.mutateAsync({
        id: reportId,
        unit_id: studyInfo?.unitId ?? undefined,
        study_instance_uid: studyUid || undefined,
        patient_name: studyInfo?.patientName || undefined,
        exam_name: examTitle || studyInfo?.studyDescription || undefined,  // FIX ANALISE_GERACAO_DADOS P2
        study_date: studyInfo?.studyDate || undefined,
        layout_snapshot: layoutSnapshot,  // FIX GAP-1: snapshot do layout
      });

      // FIX P1: persistir examTitle em description_override para que impressões futuras usem o título correto
      if (examTitle && studyUid) {
        try {
          await saveMetadata.mutateAsync({
            studyInstanceUid: studyUid,
            unit_id: studyInfo?.unitId ?? undefined,
            descriptionOverride: examTitle,
          });
        } catch {
          // Não bloquear a assinatura se o save de metadata falhar
        }
      }
      // Invalidar queries financeiras para atualizar saldo imediatamente
      void utils.financeSimple.getUnitFinancialInfo.invalidate();
      void utils.financeSimple.getDoctorSummary.invalidate();
      // Toast informativo com valor gerado pelo backend
      const amt = signResult?.doctor_amount_due;
      if (amt && parseFloat(amt) > 0) {
        toast.success(`Laudo assinado! +R\$ ${parseFloat(amt).toFixed(2)} adicionados ao saldo`);
      } else {
        toast.success("Laudo assinado com sucesso!");
      }
      navigate("/");
    } catch (e: any) {
      toast.error(e.message || "Erro ao assinar");
    }
  }, [existingReport, studyUid, studyInfo, createReport, updateReport, signReport, navigate, collectBody]);

  // ── Retificar laudo assinado ─────────────────────────────────────────────
  const handleRevise = useCallback(async () => {
    if (!existingReport?.id) return;
    if (!reviseReason.trim() || reviseReason.trim().length < 5) {
      toast.error("Informe o motivo da retificação (mínimo 5 caracteres)");
      return;
    }
    // Bug fix N2: remover fallback ao DOM — bloquear se pendingReviseBody estiver vazio.
    // O fallback anterior (|| docRef.current?.innerHTML) reintroduzia o risco do Bug B3:
    // se o usuário editasse o documento enquanto o modal estava aberto, o DOM ao vivo seria lido.
    if (!pendingReviseBody) {
      toast.error("Erro interno: conteúdo não capturado. Feche o modal e tente novamente.");
      setShowReviseModal(false);
      return;
    }
    const body = pendingReviseBody; // sem fallback ao DOM
    try {
      await reviseReport.mutateAsync({ id: existingReport.id, body, reason: reviseReason });
      toast.success("Laudo retificado com sucesso!");
      setIsRevising(false);
      setShowReviseModal(false);
      setReviseReason("");
      setPendingReviseBody("");
      navigate("/");
    } catch (e: any) {
      toast.error(e.message || "Erro ao retificar");
    }
  }, [existingReport, reviseReason, pendingReviseBody, reviseReport, navigate]);

  // ── Apagar laudo ───────────────────────────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!existingReport?.id) return;
    // LOG-01: admin_master deve informar motivo ao apagar laudo assinado/retificado
    const needsReason = isAdminMaster && (existingReport.status === 'signed' || existingReport.status === 'revised');
    if (needsReason && !deleteReason.trim()) {
      toast.error('Informe o motivo para excluir um laudo assinado ou retificado.');
      return;
    }
    try {
      await deleteReport.mutateAsync({
        id: existingReport.id,
        reason: deleteReason.trim() || undefined,
      });
      toast.success("Laudo apagado com sucesso!");
      setShowDeleteModal(false);
      setDeleteReason("");
      navigate("/");
    } catch (e: any) {
      toast.error(e.message || "Erro ao apagar laudo");
    }
  }, [existingReport, deleteReport, navigate, isAdminMaster, deleteReason]);

  // FIX GAP-2: usar snapshot quando laudo já está assinado, caso contrário usar layout atual da unidade
  const layoutSource = (isSigned && existingReport?.layout_snapshot)
    ? existingReport.layout_snapshot as unknown as LayoutSnapshot
    : unitLayout ? {
        preferences:  unitLayout.preferences as LayoutPreferences,
        header_html:  unitLayout.header_html ?? null,
        footer_html:  unitLayout.footer_html ?? null,
      } as LayoutSnapshot
    : null;
  const layoutPrefs = layoutSource?.preferences;
  // GAP-BACKGROUND: a mesma fonte visual alimenta o desktop e o PDF.
  // Laudos assinados usam o snapshot; campos ausentes em snapshots antigos
  // recebem fallback do layout atual para preservar compatibilidade.
  type BlockPos = { x: number; y: number; w: number; h: number; visible: boolean };
  const activeLayoutRecord = (isSigned && existingReport?.layout_snapshot)
    ? { ...(unitLayout as Record<string, unknown> | null ?? {}), ...(existingReport.layout_snapshot as unknown as Record<string, unknown>) }
    : (unitLayout as Record<string, unknown> | null | undefined);
  const rawLayout = activeLayoutRecord;
  const toAbsUrl = (u: string | null | undefined) => u && u.startsWith('/') ? `${window.location.origin}${u}` : (u || null);
  const layoutBgUrl: string | null = toAbsUrl((rawLayout?.["background_image_url"] as string | null) ?? null);
  const layoutBgOpacity: number = parseFloat((rawLayout?.["background_opacity"] as string | null) ?? '1.0');
  const layoutBgSize: string = (rawLayout?.["background_size"] as string | null) ?? 'cover';
  const layoutBlockPos: Record<string, BlockPos> | null =
    (rawLayout?.["block_positions"] as Record<string, BlockPos> | null) ?? null;
  // Helpers para ler as posições dos blocos configuradas pelo admin
  const bpLogo   = layoutBlockPos?.["logo"]   ?? { x:2,  y:1,  w:20, h:10, visible:true };
  const bpTitle  = layoutBlockPos?.["title"]  ?? { x:2,  y:13, w:96, h:6,  visible:true };
  const bpFooter = layoutBlockPos?.["footer"] ?? { x:2,  y:88, w:96, h:8,  visible:true };
  // Largura do bloco logo em px (w% de 595px canvas A4)
  const logoWidthPx = Math.round((bpLogo.w / 100) * 595);
  // Alinhamento horizontal do logo: x < 30% = esquerda, 30–70% = centro, > 70% = direita
  const logoAlign: "left" | "center" | "right" =
    bpLogo.x < 30 ? "left" : bpLogo.x > 70 ? "right" : "center";
  const logoJustify = logoAlign === "left" ? "flex-start" : logoAlign === "right" ? "flex-end" : "center";
  const layoutFooterUrl: string | null = toAbsUrl((rawLayout?.["footer_image_url"] as string | null) ?? null);
  const layoutLogos: Array<{ url: string; width: number; height: number; label: string }> =
    Array.isArray(rawLayout?.["logos"]) ? (rawLayout!["logos"] as Array<{ url: string; width: number; height: number; label: string }>) : [];
  // ── Imprimir ───────────────────────────────────────────────────────────────────────────────────────
  const patientName = formatPatientName(studyInfo?.patientName || "");

  const handlePrint = useCallback(async () => {
    const birthDate = studyInfo?.birthDate || '';
    const studyDateFormatted = studyInfo?.studyDate ? formatDicomDate(studyInfo.studyDate) : '';
    const sexFormatted = studyInfo?.sex ? (studyInfo.sex.toUpperCase() === 'M' ? 'Masculino' : studyInfo.sex.toUpperCase() === 'F' ? 'Feminino' : studyInfo.sex) : '';
    const isSignedOrRevised = existingReport?.status === 'signed' || existingReport?.status === 'revised';
    const signedAtFormatted = existingReport?.signedAt
      ? new Date(existingReport.signedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    const unitName = medCtx?.unitName || '';

    // P1: detectar multi-seção e renderizar cada seção como bloco separado
    const rawBody = collectBody();
    let bodyHtml: string;
    if (isMultiSection) {
      try {
        const sections: { title: string; body: string }[] = JSON.parse(rawBody);
        bodyHtml = sections.map((sec, i) => `
          <div class="exam-section" style="margin-bottom:18px;${i > 0 ? 'page-break-before:auto;' : ''}">
            <div class="section-title">${sec.title}</div>
            <div class="section-body">${sec.body}</div>
          </div>
        `).join('');
      } catch {
        bodyHtml = rawBody; // fallback seguro
      }
    } else {
      bodyHtml = rawBody;
    }

    // P7: converter imagens do corpo para base64
    bodyHtml = await convertImagesToBase64(bodyHtml);

    // Logos do layout (até 3) têm prioridade; fallback para logo da unidade ou inicial
    const logoHtml = layoutLogos.length > 0
      ? layoutLogos.map(l => `<img src="${l.url}" alt="${l.label || 'Logo'}" style="max-height:${l.height}px;max-width:${l.width}px;object-fit:contain;display:inline-block;margin:0 4px;" />`).join('')
      : medCtx?.unitLogoUrl
        ? `<img src="${medCtx.unitLogoUrl}" alt="${unitName}" style="max-height:70px;max-width:155px;object-fit:contain;display:block;" />`
        : `<div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1a6b8a 0%,#6fb7c5 100%);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20pt;font-weight:700;font-family:Arial,sans-serif;">${(unitName || 'U').charAt(0).toUpperCase()}</div>`;

    // Bloco de dados do paciente em lista vertical
    const patientDataHtml = `
      <div style="margin-bottom:14px;font-size:9.5pt;line-height:1.8;">
        <div>Nome do paciente: ${patientName || '—'}</div>
        ${birthDate ? `<div>Data de nascimento: ${birthDate}</div>` : ''}
        ${sexFormatted ? `<div>Sexo: ${sexFormatted}</div>` : ''}
        ${studyDateFormatted ? `<div>Data de realização do exame: ${studyDateFormatted}</div>` : ''}
        ${studyInfo?.accessionNumber ? `<div>Número de requisição: ${studyInfo.accessionNumber}</div>` : ''}
      </div>
    `;

    // FIX: converter assinatura e carimbo para base64
    // URLs do MinIO não carregam na janela de impressão (sem autenticação)
    const sigBase64   = medCtx?.signatureUrl ? await fetchToBase64(medCtx.signatureUrl) : null;
    const stampBase64 = medCtx?.stampUrl     ? await fetchToBase64(medCtx.stampUrl)     : null;

    const doctorFooterHtml = isSignedOrRevised && medCtx?.doctorName ? `
      <div class="doctor-footer">
        ${sigBase64   ? `<img src="${sigBase64}"   alt="Assinatura" class="sig-img" />` : ''}
        ${stampBase64 ? `<img src="${stampBase64}" alt="Carimbo"    class="stamp-img" />` : ''}
        <div class="sig-line"></div>
        <div class="sig-name">${medCtx.doctorName}${existingReport?.status === 'revised' ? '<span class="revised-badge">RETIFICADO</span>' : ''}</div>
        ${(medCtx as any)?.specialty ? `<div class="sig-role">${(medCtx as any).specialty}</div>` : ''}
        ${medCtx.crm ? `<div class="sig-crm">CRM: ${medCtx.crm}</div>` : ''}
        ${signedAtFormatted ? `<div class="sig-date">Assinado em: ${signedAtFormatted}</div>` : ''}
      </div>
    ` : '';

    // P3: margens do @page a partir das preferências do layout
    const lMT = layoutPrefs?.marginTop ?? 20;
    // P5: reservar margem inferior para o rodapé (estimativa de 30mm se houver imagem)
    const footerReservedMm = layoutFooterUrl ? 30 : 0;
    const lMB = (layoutPrefs?.marginBottom ?? 20) + footerReservedMm;
    const lML = layoutPrefs?.marginLeft ?? 18;
    const lMR = layoutPrefs?.marginRight ?? 18;
    // P8: usar stack de fontes com fallback seguro
    const rawFont = layoutPrefs?.fontFamily || 'Arial';
    const fontStack = SAFE_FONTS[rawFont] ?? `${rawFont}, Arial, sans-serif`;
    const lSize = layoutPrefs?.fontSize || 11;
    const lLine = layoutPrefs?.lineHeight ?? 1.6;
    const lBorderColor = layoutPrefs?.headerBorderColor ?? '#1a6b8a';
    const pageSize = (layoutPrefs as any)?.pageSize ?? 'A4';
    // OPÇÃO 1: dimensões físicas do papel (mm) — 100vw/100vh != A4 na janela popup
    const paperW = pageSize === 'Letter' ? '216mm' : '210mm';
    const paperH = pageSize === 'Letter' ? '279mm' : '297mm';

    // P9: marca d'água RASCUNHO para laudos não assinados
    const draftWatermark = !isSignedOrRevised ? `
      <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:72pt;font-weight:900;color:rgba(200,50,50,0.10);pointer-events:none;user-select:none;white-space:nowrap;font-family:Arial,sans-serif;letter-spacing:0.1em;-webkit-print-color-adjust:exact;print-color-adjust:exact;">RASCUNHO</div>
      <div style="background:#fef3c7;border:1.5px solid #f59e0b;padding:6px 12px;border-radius:4px;margin-bottom:12px;font-size:9pt;color:#92400e;text-align:center;">⚠ LAUDO EM RASCUNHO — Não assinado — Não é um documento válido</div>
    ` : '';

    // FUNDO: base64 + background-image no body com dimensões físicas da folha
    const bgBase64 = layoutBgUrl ? await fetchToBase64(layoutBgUrl) : null;
    const footerBase64 = layoutFooterUrl ? await fetchToBase64(layoutFooterUrl) : null;
    const printLogos = await Promise.all(layoutLogos.map(async (logo) => {
      const absoluteUrl = toAbsUrl(logo.url) || logo.url;
      return { ...logo, url: (absoluteUrl ? await fetchToBase64(absoluteUrl) : null) || absoluteUrl };
    }));
    // FIX: aplicar block_positions no print — mesma lógica do WYSIWYG
    const logoWidthPrint   = Math.round((bpLogo.w / 100) * 210); // mm (papel = 210mm)
    const logoAlignPrint   = bpLogo.x < 30 ? "left" : bpLogo.x > 70 ? "right" : "center";
    const logoJustifyPrint = logoAlignPrint === "left" ? "flex-start"
                           : logoAlignPrint === "right" ? "flex-end" : "center";
    // FIX: overlay de opacidade via div position:fixed com dimensões em mm
    // body::after não é confiável em print — div com mm é mais preciso
    const overlayAlpha = Math.round((1 - layoutBgOpacity) * 100) / 100;
    const bgLayer = (bgBase64 && overlayAlpha > 0) ? `
      <div style="
        position: fixed;
        top: 0; left: 0;
        width: ${paperW}; height: ${paperH};
        background: rgba(255,255,255,${overlayAlpha});
        z-index: 0;
        pointer-events: none;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      "></div>
    ` : '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Laudo - ${patientName}</title>
<style>
  /* FIX full-bleed: margin:0 no @page → body representa a folha INTEIRA */
  /* Margens do layout são simuladas via padding no body */
  @page {
    size: ${pageSize} portrait;
    margin: 0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html {
    width: ${paperW};
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    /* MULTI-EXAME: body sem padding/background — cada div.print-page gerencia seu próprio espaço */
    margin: 0;
    padding: 0;
    font-family: ${fontStack};
    font-size: ${lSize}pt;
    color: #111;
    line-height: ${lLine};
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    /* FIX BUG-3: sem min-height — evita página em branco extra */
    overflow: hidden;
  }
  /* div.print-page = uma folha A4 completa com padding, fundo e conteúdo */
  .print-page {
    width: ${paperW};
    height: ${paperH};
    padding: ${lMT}mm ${lMR}mm ${lMB}mm ${lML}mm;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    ${bgBase64 ? `
    background-image: url('${bgBase64}');
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
    ` : ''}
  }
  .print-shared-sheet {
    width: ${paperW};
    height: ${paperH};
    padding: 0;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
    display: block;
    background: #fff;
    color: #111;
    font-family: ${fontStack};
    font-size: ${lSize}pt;
    line-height: ${lLine};
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .shared-report-page-break {
    page-break-after: always;
    break-after: page;
  }
  .shared-report-page-break:last-of-type {
    page-break-after: avoid;
    break-after: avoid;
  }
  .draft-watermark {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font: 900 72pt Arial, sans-serif;
    color: rgba(200,50,50,.10);
    white-space: nowrap;
    pointer-events: none;
    z-index: 5;
  }
  @media print {
    .print-page {
      page-break-after: always;
      break-after: page;
    }
    .print-page:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
    .print-shared-sheet {
      page-break-after: avoid;
      break-after: avoid;
    }
  }
  /* Número de página via div position:fixed (substitui @bottom-right que requer @page margin) */
  /* FIX BUG-2: CSS counter nativo para número de página correto por página */
  .page-number-fixed {
    position: fixed;
    z-index: 3;                              /* FIX: acima de tudo */
    bottom: ${Math.max(lMB - 8, 4)}mm;
    right: ${lMR}mm;
    font-size: 8pt;
    color: #888;
    font-family: Arial, sans-serif;
  }
  .page-number-fixed::after {
    content: "Página " counter(page) " de " counter(pages);
  }
  /* P4: cabeçalho repetível em múltiplas páginas via thead */
  table.print-layout {
    position: relative;                      /* FIX: cria stacking context */
    z-index: 2;                              /* FIX: acima do overlay branco (z:0) */
    width: 100%;
    border-collapse: collapse;
    height: 100%;                            /* FIX BUG-3: tabela usa toda a altura disponível */
  }
  table.print-layout td, table.print-layout th { background: transparent !important; }
  table.print-layout tbody tr td { vertical-align: top; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tbody { display: table-row-group; }
  .header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-bottom: 8pt;
    border-bottom: 2px solid ${lBorderColor};
    margin-bottom: 4mm;
  }
  .header-logo { flex-shrink: 0; width: ${logoWidthPrint}mm; display: flex; align-items: center; justify-content: ${logoJustifyPrint}; }
  .header-title { flex: 1; text-align: center; }
  .clinic-name { font-size: 14pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
  .clinic-sub { font-size: 10pt; color: #444; margin-top: 2pt; }
  .patient-data { font-size: 10pt; line-height: 1.7; margin-bottom: 12pt; }
  .exam-title { text-align: center; font-weight: 700; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.05em; margin: 8pt 0 12pt 0; }
  .report-body { font-size: ${lSize}pt; line-height: ${lLine}; }
  .report-body > p,
  .report-body > div:not(.exam-section) { margin-bottom: 6pt; line-height: 1.7; }
  .report-body h1,
  .report-body h2,
  .report-body h3,
  .report-body h4 {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: ${lSize}pt !important;
    margin: 14pt 0 4pt 0;
  }
  .report-body h1:first-child,
  .report-body h2:first-child,
  .report-body h3:first-child,
  .report-body h4:first-child { margin-top: 0; }
  .report-body strong, .report-body b { font-weight: 700; }
  /* P1: seções multi-exame */
  .exam-section { break-inside: avoid-page; margin-bottom: 18px; }
  .section-title {
    font-size: 11pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; text-align: center;
    padding: 6px 0; border-bottom: 1px solid #e0e0e0; margin-bottom: 10px;
  }
  .section-body { font-size: ${lSize}pt; line-height: ${lLine}; }
  .doctor-footer { text-align: center; margin: 14mm auto 0; max-width: 240px; page-break-inside: avoid; }
  .sig-img   { max-height: 48px; max-width: 170px; object-fit: contain; display: block; margin: 0 auto 2mm; }
  .stamp-img { max-height: 90px; max-width: 200px; object-fit: contain; display: block; margin: 0 auto 2mm; }
  .sig-line  { border-top: 1px solid #333; width: 170px; margin: 0 auto 3mm; }
  .sig-name  { font-weight: 700; font-size: 10pt; }
  .sig-role  { font-size: 9pt; color: #444; margin-top: 1pt; letter-spacing: 0.03em; }
  .sig-crm   { font-size: 9pt; color: #444; margin-top: 1pt; }
  .sig-date  { font-size: 8pt; color: #666; margin-top: 3pt; }
  .revised-badge { background: #f59e0b; color: #fff; font-size: 7pt; padding: 1px 5px; border-radius: 3px; font-weight: 700; margin-left: 5px; vertical-align: middle; }
  @media print {
    body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .doctor-footer { page-break-inside: avoid; }
  }
</style></head><body>
  ${bgLayer}
  ${draftWatermark}
  <!-- Número de página via div.page-number-fixed (substitui @bottom-right que precisa de @page margin) -->
  <!-- FIX BUG-2: conteúdo via CSS counter(page)/counter(pages) -->
  <div class="page-number-fixed"></div>
  <!-- MULTI-EXAME: cada exame = div.print-page com height:297mm e page-break-after:always -->
  <!-- Abordagem div-por-página é mais confiável que múltiplas tabelas no Chrome -->
  ${(() => {
    const renderPrintSheet = (sectionTitle: string, sectionBodyHtml: string, isLastPage: boolean) => {
      const sectionBody = sectionBodyHtml.trim()
        ? <div className="report-body" dangerouslySetInnerHTML={{ __html: sectionBodyHtml }} />
        : <SharedReportBodyGuide />;
      const markup = renderSharedReportSheetHtml({
        positions: layoutBlockPos,
        logos: printLogos,
        backgroundUrl: bgBase64 || layoutBgUrl,
        backgroundOpacity: layoutBgOpacity,
        backgroundSize: layoutBgSize,
        footerImageUrl: isLastPage ? (footerBase64 || layoutFooterUrl) : null,
        fontFamily: fontStack,
        fontSize: lSize,
        lineHeight: lLine,
        patientName,
        patientInfo: (
          <div style={{ width: "100%", fontSize: "8pt", lineHeight: 1.35 }}>
            Realizado em: <strong>{studyDateFormatted || "—"}</strong>
            <span style={{ margin: "0 6px" }}>·</span>
            Nasc.: <strong>{birthDate || "—"}</strong>
            <span style={{ margin: "0 6px" }}>·</span>
            Sexo: <strong>{sexFormatted || "—"}</strong>
          </div>
        ),
        title: (
          <div style={{ width: "100%", textAlign: "center", fontWeight: 700, fontSize: "13pt", textTransform: "uppercase", letterSpacing: "0.05em", paddingBottom: 6, borderBottom: "1px solid #e0e0e0" }}>
            {sectionTitle || "—"}
          </div>
        ),
        body: sectionBody,
        footer: isLastPage
          ? <div style={{ width: "100%" }} dangerouslySetInnerHTML={{ __html: doctorFooterHtml || '<div style="height:4mm;"></div>' }} />
          : <div />,
      });
      return `<div class="shared-report-page-break">${markup}</div>`;
    };
    // Tentar parsear seções multi-exame usando uma folha compartilhada por seção.
    try {
      const rawBodyForSplit = collectBody();
      const secs: { title: string; body: string }[] = JSON.parse(rawBodyForSplit);
      if (secs && secs.length > 1) {
        return secs.map((sec, i) => renderPrintSheet(sec.title, sec.body, i === secs.length - 1)).join('');
      }
    } catch {}
    // Página única: a marcação é produzida pelo mesmo componente React usado no editor.
    const printBody = bodyHtml
      ? <div className="report-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      : <SharedReportBodyGuide />;
    return renderSharedReportSheetHtml({
      positions: layoutBlockPos,
      logos: printLogos,
      backgroundUrl: bgBase64 || layoutBgUrl,
      backgroundOpacity: layoutBgOpacity,
      backgroundSize: layoutBgSize,
      footerImageUrl: footerBase64 || layoutFooterUrl,
      fontFamily: fontStack,
      fontSize: lSize,
      lineHeight: lLine,
      patientName,
      patientInfo: (
        <div style={{ width: "100%", fontSize: "8pt", lineHeight: 1.35 }}>
          Realizado em: <strong>{studyDateFormatted || "—"}</strong>
          <span style={{ margin: "0 6px" }}>·</span>
          Nasc.: <strong>{birthDate || "—"}</strong>
          <span style={{ margin: "0 6px" }}>·</span>
          Sexo: <strong>{sexFormatted || "—"}</strong>
        </div>
      ),
      title: (
        <div style={{ width: "100%", textAlign: "center", fontWeight: 700, fontSize: "13pt", textTransform: "uppercase", letterSpacing: "0.05em", paddingBottom: 6, borderBottom: "1px solid #e0e0e0" }}>
          {examTitle || "—"}
        </div>
      ),
      body: printBody,
      footer: (
        <div style={{ width: "100%" }} dangerouslySetInnerHTML={{ __html: doctorFooterHtml || '<div style="height:4mm;"></div>' }} />
      ),
    });
  })()}
  <!-- P5: rodapé via tfoot (renderiza em todas as páginas, compatível com PDF) -->
<script>
  window.onload = function() {
    var pages = document.querySelectorAll('.print-page');
    var total = pages.length || 1;
    var counters = document.querySelectorAll('.page-number-fixed');
    counters.forEach(function(el, i) {
      el.textContent = 'Página ' + (i + 1) + ' de ' + total;
    });
    window.print();
    window.onafterprint = function() { window.close(); };
  };
<\/script>
</body></html>`;
    const win = window.open('', '_blank', 'width=850,height=1100');
    if (!win) {
      toast.error('Bloqueador de pop-up impediu a abertura da janela de impressão. Por favor, permita pop-ups para este site.');
      return;
    }
    win.document.write(html);
    win.document.close();
  }, [medCtx, patientName, studyInfo, examTitle, docRef, existingReport, layoutPrefs, layoutLogos, layoutFooterUrl, layoutBgUrl, layoutBgOpacity, layoutBgSize, layoutBlockPos, sectionRefs, examNames, isMultiSection]);

  // FIX BUG-2: inserir imagem inline no contentEditable
  // A imagem faz parte do documento, é salva no laudo e arrastável pelo browser nativamente.
  const addInlineImage = useCallback((src: string | null, label: string) => {
    if (!src) { toast.error('Imagem não disponível.'); return; }

    const targetEl = isMultiSection
      ? sectionRefs.current[activeSectionRef.current]
      : docRef.current;
    if (!targetEl) { toast.error('Clique no texto do laudo antes de inserir.'); return; }

    targetEl.focus();
    if (savedSelection.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedSelection.current);
    }

    const html = `<img src="${src}" alt="${label}" title="${label} — arraste para reposicionar" style="max-height:110px;max-width:240px;object-fit:contain;cursor:move;display:inline-block;vertical-align:middle;margin:4px;" draggable="true" />`;
    document.execCommand('insertHTML', false, html);

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelection.current = sel.getRangeAt(0).cloneRange();
    }
  }, [isMultiSection]);
  // ── Render ─────────────────────────────────────────────────────────────────────────
  const examDesc = examTitle || studyInfo?.studyDescription || "";
  void editorContentVersion;
  const hasEditorContent = isMultiSection
    ? sectionRefs.current.some(section => Boolean(section?.innerText?.trim()))
    : Boolean(getVisibleDoc()?.innerText?.trim());
  const showBodyGuide = !hasEditorContent && !isPreview;
  return (
    <>
    {/* ── ESTILOS DO EDITOR─────────────────────────────────────────────────────────── */}
    <style>{`
      /* Restaura estilos semânticos dentro do editor — neutraliza Tailwind reset */
      /* Garante que o editor mostre o mesmo visual que será impresso          */
      [data-editor-content] h1,
      [data-editor-content] h2,
      [data-editor-content] h3,
      [data-editor-content] h4 {
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: 11pt !important;
        margin: 14pt 0 4pt 0;
        font-family: 'Times New Roman', Times, serif;
      }
      [data-editor-content] h1:first-child,
      [data-editor-content] h2:first-child,
      [data-editor-content] h3:first-child,
      [data-editor-content] h4:first-child {
        margin-top: 0;
      }
      [data-editor-content] p {
        margin-bottom: 6pt;
        margin-top: 0;
        line-height: 1.7;
      }
      [data-editor-content] strong,
      [data-editor-content] b {
        font-weight: 700;
      }
      [data-editor-content] em,
      [data-editor-content] i {
        font-style: italic;
      }
      [data-editor-content] u {
        text-decoration: underline;
      }
      [data-editor-content] ul,
      [data-editor-content] ol {
        padding-left: 1.5em;
        margin-bottom: 3pt;
      }
      [data-editor-content]:empty::before {
        content: attr(data-placeholder);
        color: #9ca3af;
        font-style: italic;
        pointer-events: none;
      }
    `}</style>
    <div className="flex flex-col h-screen bg-white overflow-hidden print:block">
      {/* ── HEADER DESKTOP ─────────────────────────────────────────────────────────── */}
      <header className="hidden md:flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0 print:hidden">
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
          {/* Botão Apagar — sempre visível quando há laudo salvo */}
          {existingReport?.id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteModal(true)}
              disabled={deleteReport.isPending}
              className="gap-1.5 text-xs border-red-300 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Apagar
            </Button>
          )}

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
                  onClick={() => {
                    // Bug fix B3: capturar body do DOM neste exato momento
                    setPendingReviseBody(collectBody());
                    setShowReviseModal(true);
                  }}
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
                className="gap-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Retificar
              </Button>
            )
          ) : (
            <>
              {/* Editar rascunho — só aparece quando já existe laudo não assinado */}
              {existingReport?.id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { /* já editável, apenas foca o documento */ docRef.current?.focus(); }}
                  className="gap-1.5 text-xs"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Editar
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSign}
                disabled={signReport.isPending || createReport.isPending || updateReport.isPending}
                className="gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                {(signReport.isPending || createReport.isPending || updateReport.isPending) ? "Assinando..." : "Assinar"}
              </Button>
            </>
          )}
        </div>
      </header>

      {/* ── HEADER MOBILE ─────────────────────────────────────────────────────────── */}
      <header className="flex md:hidden items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white shrink-0 print:hidden">
        <button
          onClick={() => navigate("/")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
          aria-label="Voltar para os estudos"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold uppercase text-gray-900">{patientName || "Carregando..."}</p>
          <p className="truncate text-[11px] uppercase text-gray-500">{examDesc || "Laudo radiológico"}</p>
        </div>
        <button
          onClick={handlePrint}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          aria-label="Imprimir laudo"
        >
          <Printer className="h-4 w-4" />
        </button>
        {isSigned ? (
          isRevising ? (
            <button
              onClick={() => {
                setPendingReviseBody(collectBody());
                setShowReviseModal(true);
              }}
              disabled={reviseReport.isPending}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-orange-600 px-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              Salvar
            </button>
          ) : (
            <button
              onClick={() => setIsRevising(true)}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-orange-600 px-2.5 text-xs font-semibold text-white"
            >
              <Edit2 className="h-4 w-4" />
              Retificar
            </button>
          )
        ) : (
          <button
            onClick={handleSign}
            disabled={signReport.isPending || createReport.isPending || updateReport.isPending}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-green-600 px-2.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            Assinar
          </button>
        )}
      </header>

      {/* ── CORPO DESKTOP ─────────────────────────────────────────────────────────── */}
      <div className="hidden md:flex flex-1 overflow-hidden print:block">
        {/* ── SIDEBAR ──────────────────────────────────────────────────── */}
        <aside className="hidden md:flex w-[340px] shrink-0 border-r border-gray-200 bg-gray-50 flex-col overflow-hidden print:hidden">
          {/* Abas */}
          <div className="flex border-b border-gray-200 bg-white">
            {([
              { id: "modelos", label: "Laudos Normal",  icon: <GripVertical className="h-3.5 w-3.5" /> },
              { id: "frases",  label: "Trechos",   icon: <MessageSquare className="h-3.5 w-3.5" /> },
              { id: "carimbo", label: "Carimbo",  icon: <Layers className="h-3.5 w-3.5" /> },
            ] as const).map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors
                  ${
                    activeTab === id
                      ? "text-blue-600 border-b-2 border-blue-600 bg-white"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* Conteúdo da aba — Redesign */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "modelos" && (
              <ModelosTab
                onApplyTemplate={(body, examTitle) => {
                  // FIX BUG-1: aplicar na seção ativa em multi-seção ou no editor único
                  if (isMultiSection) {
                    const activeEl = sectionRefs.current[activeSectionRef.current];
                    if (activeEl) {
                      activeEl.innerHTML = sanitizeHtmlForEditor(body);
                      activeEl.focus();
                    }
                  } else {
                    if (docRef.current) docRef.current.innerHTML = sanitizeHtmlForEditor(body);
                  }
                  if (examTitle) setExamTitle(examTitle);
                }}
                currentExamTitle={examTitle}
                currentModality={studyInfo?.modality || ""}
              />
            )}
            {activeTab === "frases" && (
              <FrasesTab
                onInsert={insertAtCursor}
                onFocus={saveSelection}
              />
            )}
            {activeTab === "carimbo" && (
              <CarimboTab
                signatureUrl={medCtx?.signatureUrl ?? null}
                stampUrl={medCtx?.stampUrl ?? null}
                doctorName={medCtx?.doctorName ?? ""}
                crm={medCtx?.crm ?? ""}
              />
            )}
          </div>

          {/* Bug fix B2: ocultar botão Salvar Rascunho quando laudo está assinado/retificado.
               Laudos nesse estado só podem ser salvos via fluxo de retificação (com histórico). */}
          {!isSigned && (
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
          )}
        </aside>

        {/* ── ÁREA DO DOCUMENTO ────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
        {/* MOD 8 — Campo de seleção de exame compacto acima do editor */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/50 print:hidden">
          <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <input
            value={examTitle}
            onChange={e => setExamTitle(e.target.value)}
            placeholder="Tipo de exame (ex: RM de Joelho)..."
            className="flex-1 text-xs bg-transparent focus:outline-none text-gray-700 placeholder:text-gray-300"
          />
          {examTitle && (
            <button onClick={() => setExamTitle("")} className="text-gray-300 hover:text-gray-500">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* ── TOOLBAR DE FORMATAÇÃO ─────────────────────────────────────────── */}
        {isEditable && (
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 bg-white print:hidden flex-wrap">
            {/* Desfazer / Refazer */}
            <button onMouseDown={e => { e.preventDefault(); document.execCommand('undo'); }} title="Desfazer" className="p-1.5 rounded hover:bg-gray-100 text-gray-600"><Undo2 className="h-3.5 w-3.5" /></button>
            <button onMouseDown={e => { e.preventDefault(); document.execCommand('redo'); }} title="Refazer" className="p-1.5 rounded hover:bg-gray-100 text-gray-600"><Redo2 className="h-3.5 w-3.5" /></button>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            {/* Tamanho de fonte */}
            <select
              value={fontSize}
              onChange={e => applyFontSize(e.target.value)}
              className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              title="Tamanho da fonte"
            >
              {[8,9,10,11,12,14,16,18,20,24].map(s => (
                <option key={s} value={String(s)}>{s}pt</option>
              ))}
            </select>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            {/* Negrito / Itálico / Sublinhado */}
            <button onMouseDown={e => { e.preventDefault(); document.execCommand('bold'); }} title="Negrito" className="p-1.5 rounded hover:bg-gray-100 text-gray-600 font-bold"><Bold className="h-3.5 w-3.5" /></button>
            <button onMouseDown={e => { e.preventDefault(); document.execCommand('italic'); }} title="Itálico" className="p-1.5 rounded hover:bg-gray-100 text-gray-600 italic"><Italic className="h-3.5 w-3.5" /></button>
            <button onMouseDown={e => { e.preventDefault(); document.execCommand('underline'); }} title="Sublinhado" className="p-1.5 rounded hover:bg-gray-100 text-gray-600 underline"><Underline className="h-3.5 w-3.5" /></button>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            {/* Cor vermelha */}
            <button onMouseDown={e => { e.preventDefault(); document.execCommand('foreColor', false, '#dc2626'); }} title="Texto vermelho" className="p-1.5 rounded hover:bg-gray-100">
              <span className="text-[11px] font-bold text-red-600">A</span>
            </button>
            {/* Realce amarelo */}
            <button onMouseDown={e => { e.preventDefault(); document.execCommand('hiliteColor', false, '#fef08a'); }} title="Realce amarelo" className="p-1.5 rounded hover:bg-gray-100 text-yellow-500"><Highlighter className="h-3.5 w-3.5" /></button>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            {/* Alinhamentos */}
            <button onMouseDown={e => { e.preventDefault(); document.execCommand('justifyLeft'); }} title="Alinhar à esquerda" className="p-1.5 rounded hover:bg-gray-100 text-gray-600"><AlignLeft className="h-3.5 w-3.5" /></button>
            <button onMouseDown={e => { e.preventDefault(); document.execCommand('justifyCenter'); }} title="Centralizar" className="p-1.5 rounded hover:bg-gray-100 text-gray-600"><AlignCenter className="h-3.5 w-3.5" /></button>
            <button onMouseDown={e => { e.preventDefault(); document.execCommand('justifyRight'); }} title="Alinhar à direita" className="p-1.5 rounded hover:bg-gray-100 text-gray-600"><AlignRight className="h-3.5 w-3.5" /></button>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            {/* Pré-visualização */}
            <button
              onClick={handleTogglePreview}
              title={isPreview ? "Voltar ao editor" : "Pré-visualizar"}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                isPreview ? "bg-blue-600 text-white" : "hover:bg-gray-100 text-gray-600"
              }`}
            >
              {isPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {isPreview ? "Editar" : "Pré-visualizar"}
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto bg-gray-100 flex justify-center py-8 print:bg-white print:p-0 print:block">
          <div
            className={`${isMultiSection ? "relative w-full md:w-[794px]" : "relative w-full md:w-[210mm] bg-white shadow-md print:shadow-none"}`}
            style={isMultiSection ? undefined : { minHeight: "297mm" }}
          >
            {/* FIX BUG-2: imagens agora são inline no contentEditable — overlay removido */}

            {/* ═══════════════════════════════════════════════════════════
                 DOCUMENTO LAUDO — Layout WYSIWYG
                 MULTI-PÁGINA: cada exame = folha A4 completa (cabeçalho + título + corpo + rodapé)
                 PÁGINA ÚNICA: layout original preservado
            ═══════════════════════════════════════════════════════════ */}
            {isMultiSection ? (
              /* MODO MULTI-PÁGINA: cada exame usa a mesma folha A4 compartilhada */
              <div style={{ display: "flex", flexDirection: "column", gap: 32, width: "100%" }}>
                {examNames.map((name, i) => {
                  const isLastPage = i === examNames.length - 1;
                  const sectionHasContent = Boolean(sectionRefs.current[i]?.innerText?.trim());
                  const showSectionBodyGuide = !sectionHasContent && !isPreview;
                  const previewSectionHtml = previewHtml.split("<hr/>")[i] || "";
                  return (
                    <SharedReportSheet
                      key={i}
                      className="report-page"
                      positions={layoutBlockPos}
                      logos={layoutLogos}
                      backgroundUrl={layoutBgUrl}
                      backgroundOpacity={layoutBgOpacity}
                      backgroundSize={layoutBgSize}
                      footerImageUrl={isLastPage ? layoutFooterUrl : null}
                      fontFamily={layoutPrefs?.fontFamily ? `'${layoutPrefs.fontFamily}', sans-serif` : "'Times New Roman', Times, serif"}
                      fontSize={layoutPrefs?.fontSize ?? 11}
                      lineHeight={layoutPrefs?.lineHeight ?? 1.6}
                      patientName={patientName}
                      patientInfo={
                        <div style={{ width: "100%", fontSize: "8pt", lineHeight: 1.35 }}>
                          Realizado em: <strong>{studyInfo?.studyDate ? formatDicomDate(studyInfo.studyDate) : "—"}</strong>
                          <span style={{ margin: "0 6px" }}>·</span>
                          Nasc.: <strong>{studyInfo?.birthDate ? formatDicomDate(studyInfo.birthDate) : "—"}</strong>
                          <span style={{ margin: "0 6px" }}>·</span>
                          Sexo: <strong>{studyInfo?.sex || "—"}</strong>
                        </div>
                      }
                      title={
                        <div style={{ width: "100%", textAlign: "center", fontWeight: 700, fontSize: "13pt", textTransform: "uppercase", letterSpacing: "0.05em", paddingBottom: 6, borderBottom: "1px solid #e0e0e0" }}>
                          {name}
                        </div>
                      }
                      body={
                        <>
                          {i === 0 && isSigned && !isRevising && (
                            <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 6, padding: "7px 12px", fontSize: "10pt", color: "#92400e", display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <CheckCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                              <span>Laudo <strong>{existingReport?.status === "revised" ? "retificado" : "assinado"}</strong> — clique em <strong>Retificar</strong> para editar.</span>
                            </div>
                          )}
                          {isPreview ? (
                            previewSectionHtml ? (
                              <div
                                data-editor-content
                                style={{ minHeight: "60mm", lineHeight: 1.6, fontSize: "11pt", color: "#111", textAlign: "left", whiteSpace: "pre-wrap", fontFamily: "Arial, Helvetica, sans-serif", pointerEvents: "none", userSelect: "none" }}
                                dangerouslySetInnerHTML={{ __html: previewSectionHtml }}
                              />
                            ) : <SharedReportBodyGuide />
                          ) : (
                            <div style={{ position: "relative", minHeight: "60mm" }}>
                              {showSectionBodyGuide && <div style={{ position: "absolute", inset: "0 0 auto", zIndex: 0, pointerEvents: "none" }}><SharedReportBodyGuide /></div>}
                              <div
                              ref={el => { sectionRefs.current[i] = el; }}
                              contentEditable={isEditable}
                              suppressContentEditableWarning
                              data-editor-content
                              onFocus={() => { activeSectionRef.current = i; }}
                              onMouseUp={isEditable ? saveSelection : undefined}
                              onKeyUp={isEditable ? saveSelection : undefined}
                              onInput={isEditable ? markEditorContentChanged : undefined}
                              data-placeholder={showSectionBodyGuide ? "" : `Digite o laudo de ${name}...`}
                              onDragOver={isEditable ? (e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "copy";
                                activeSectionRef.current = i;
                                setIsDragOver(true);
                              } : undefined}
                              onDragLeave={isEditable ? () => setIsDragOver(false) : undefined}
                              onDrop={isEditable ? (e) => {
                                e.preventDefault();
                                setIsDragOver(false);
                                activeSectionRef.current = i;
                                const jsonRaw = e.dataTransfer.getData("application/json");
                                if (jsonRaw) {
                                  try {
                                    const payload = JSON.parse(jsonRaw);
                                    if (payload.type === "template") {
                                      const el = sectionRefs.current[i];
                                      if (el) el.innerHTML = sanitizeHtmlForEditor(payload.data);
                                    } else if (payload.type === "phrase") {
                                      insertAtCursor(payload.data);
                                    } else if (payload.type === "signature" || payload.type === "stamp") {
                                      insertAtCursor(`<img src="${payload.data}" style="max-height:60px;display:block;margin:4px 0;" />`);
                                    }
                                  } catch (_) {}
                                  return;
                                }
                                const templateRaw = e.dataTransfer.getData("text/x-report-template");
                                if (templateRaw) {
                                  try {
                                    const parsed = JSON.parse(templateRaw);
                                    const el = sectionRefs.current[i];
                                    if (el) el.innerHTML = sanitizeHtmlForEditor(parsed.body ?? templateRaw);
                                  } catch (_) {}
                                  return;
                                }
                                const plainText = e.dataTransfer.getData("text/plain");
                                if (plainText) insertAtCursor(plainText);
                              } : undefined}
                                style={{ position: "relative", zIndex: 1, width: "100%", minHeight: "60mm", outline: isDragOver && activeSectionRef.current === i ? "2px dashed #3b82f6" : "none", borderRadius: 4, lineHeight: 1.6, fontSize: "11pt", color: "#111", textAlign: "left", whiteSpace: "pre-wrap", cursor: isEditable ? "text" : "default", fontFamily: "Arial, Helvetica, sans-serif", transition: "outline 0.1s ease" }}
                              />
                              </div>
                          )}
                        </>
                      }
                      footer={
                        isLastPage && isSigned && medCtx?.doctorName ? (
                          <div style={{ textAlign: "center", minWidth: 180, maxWidth: 260, margin: "0 auto" }}>
                            {medCtx.signatureUrl && <img src={medCtx.signatureUrl} alt="Assinatura" style={{ maxHeight: 55, maxWidth: 200, objectFit: "contain", display: "block", margin: "0 auto 2mm" }} />}
                            {medCtx.stampUrl && <img src={medCtx.stampUrl} alt="Carimbo" style={{ maxHeight: 110, maxWidth: 240, objectFit: "contain", display: "block", margin: "0 auto 2mm" }} />}
                            <div style={{ borderTop: "1.5px solid #333", width: "100%", marginBottom: "3mm" }} />
                            <div style={{ fontWeight: 700, fontSize: "10.5pt", textTransform: "uppercase", color: "#111", letterSpacing: "0.02em" }}>
                              {medCtx.doctorName}
                              {existingReport?.status === "revised" && <span style={{ background: "#f59e0b", color: "#fff", fontSize: "7pt", padding: "1px 6px", borderRadius: 3, fontWeight: 700, marginLeft: 6, verticalAlign: "middle" }}>RETIFICADO</span>}
                            </div>
                            <div style={{ fontSize: "9pt", color: "#444", marginTop: 2, letterSpacing: "0.04em" }}>MÉDICO RADIOLOGISTA</div>
                            {medCtx.crm && <div style={{ fontSize: "9pt", color: "#444", marginTop: 1 }}>CRM: {medCtx.crm}</div>}
                            {existingReport?.signedAt && <div style={{ fontSize: "8pt", color: "#666", marginTop: 3 }}>Assinado em: {new Date(existingReport.signedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>}
                          </div>
                        ) : <div />
                      }
                      style={{ width: "100%", minHeight: "1123px", boxShadow: "0 2px 12px rgba(0,0,0,0.10)", pageBreakAfter: isLastPage ? "auto" : "always", breakAfter: isLastPage ? "auto" : "page" }}
                    />
                  );
                })}
              </div>
            ) : (
              /* MODO PÁGINA Única: mesma folha A4 compartilhada com o LayoutEditorPage */
              <SharedReportSheet
                positions={layoutBlockPos}
                logos={layoutLogos}
                backgroundUrl={layoutBgUrl}
                backgroundOpacity={layoutBgOpacity}
                backgroundSize={layoutBgSize}
                footerImageUrl={layoutFooterUrl}
                fontFamily={layoutPrefs?.fontFamily ? `'${layoutPrefs.fontFamily}', sans-serif` : "Arial, Helvetica, sans-serif"}
                fontSize={layoutPrefs?.fontSize ?? 11}
                lineHeight={layoutPrefs?.lineHeight ?? 1.6}
                patientName={patientName}
                patientInfo={
                  <div style={{ width: "100%", fontSize: "8pt", lineHeight: 1.35 }}>
                    Realizado em: <strong>{studyInfo?.studyDate || new Date().toLocaleDateString("pt-BR")}</strong>
                    <span style={{ margin: "0 6px" }}>·</span>
                    Nasc.: <strong>{studyInfo?.birthDate || "—"}</strong>
                    <span style={{ margin: "0 6px" }}>·</span>
                    Sexo: <strong>{studyInfo?.sex || "—"}</strong>
                  </div>
                }
                title={
                  examTitle ? (
                    editingTitle ? (
                      <input
                        ref={titleInputRef}
                        value={examTitle}
                        onChange={e => setExamTitle(e.target.value)}
                        onBlur={() => setEditingTitle(false)}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false); }}
                        autoFocus
                        style={{ width: "100%", textAlign: "center", fontWeight: "bold", fontSize: "13pt", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "Arial, Helvetica, sans-serif", border: "2px solid #1a6b8a", borderRadius: 4, padding: "4px 8px", outline: "none", background: "#f0f8fb", boxSizing: "border-box", color: "#111" }}
                      />
                    ) : (
                      <div onClick={() => setEditingTitle(true)} title="Clique para editar o título" style={{ width: "100%", textAlign: "center", fontWeight: "bold", fontSize: "13pt", textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer", color: "#111", position: "relative", paddingBottom: 6, borderBottom: "1px solid #e0e0e0" }}>
                        {examTitle}
                        <span style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", fontSize: "9pt", color: "#1a6b8a", opacity: 0.4 }}>✏</span>
                      </div>
                    )
                  ) : <div style={{ width: "100%", textAlign: "center", color: "#aaa", fontStyle: "italic" }}>Selecione o tipo de exame na barra lateral</div>
                }
                body={
                  <>
                    {isSigned && !isRevising && (
                      <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 6, padding: "7px 12px", fontSize: "10pt", color: "#92400e", display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexShrink: 0 }}>
                        <CheckCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                        <span>Laudo <strong>{existingReport?.status === "revised" ? "retificado" : "assinado"}</strong> — clique em <strong>Retificar</strong> para editar.</span>
                      </div>
                    )}
                    {isPreview ? (
                      previewHtml ? (
                        <div data-editor-content style={{ flex: 1, minHeight: "60mm", lineHeight: 1.6, fontSize: "11pt", color: "#111", textAlign: "left", whiteSpace: "pre-wrap", fontFamily: "Arial, Helvetica, sans-serif", pointerEvents: "none", userSelect: "none" }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
                      ) : <SharedReportBodyGuide />
                    ) : (
                      <div style={{ position: "relative", flex: 1, minHeight: "60mm" }}>
                        {showBodyGuide && <div style={{ position: "absolute", inset: "0 0 auto", zIndex: 0, pointerEvents: "none" }}><SharedReportBodyGuide /></div>}
                        <div
                        ref={docRef}
                        contentEditable={isEditable}
                        suppressContentEditableWarning
                        data-editor-content
                        onMouseUp={isEditable ? saveSelection : undefined}
                        onKeyUp={isEditable ? saveSelection : undefined}
                        onInput={isEditable ? markEditorContentChanged : undefined}
                        data-placeholder={showBodyGuide ? "" : "Digite o laudo aqui..."}
                        onDragOver={isEditable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setIsDragOver(true); } : undefined}
                        onDragLeave={isEditable ? () => setIsDragOver(false) : undefined}
                        onDrop={isEditable ? (e) => {
                          e.preventDefault();
                          setIsDragOver(false);
                          const jsonRaw = e.dataTransfer.getData("application/json");
                          if (jsonRaw) {
                            try {
                              const payload = JSON.parse(jsonRaw);
                              if (payload.type === "template") {
                                if (docRef.current) docRef.current.innerHTML = sanitizeHtmlForEditor(payload.data);
                                if (payload.examTitle) setExamTitle(payload.examTitle);
                              } else if (payload.type === "phrase") {
                                insertAtCursor(payload.data);
                              } else if (payload.type === "signature" || payload.type === "stamp") {
                                insertAtCursor(`<img src="${payload.data}" style="max-height:60px;display:block;margin:4px 0;" />`);
                              }
                            } catch (_) {}
                            return;
                          }
                          const templateRaw = e.dataTransfer.getData("text/x-report-template");
                          if (templateRaw) {
                            try {
                              const parsed = JSON.parse(templateRaw);
                              if (docRef.current) docRef.current.innerHTML = sanitizeHtmlForEditor(parsed.body ?? templateRaw);
                              if (parsed.examTitle) setExamTitle(parsed.examTitle);
                            } catch (_) {
                              if (docRef.current) docRef.current.innerHTML = sanitizeHtmlForEditor(templateRaw);
                            }
                            return;
                          }
                          const plainText = e.dataTransfer.getData("text/plain");
                          if (plainText) insertAtCursor(plainText);
                        } : undefined}
                          style={{ position: "relative", zIndex: 1, width: "100%", minHeight: "60mm", outline: isDragOver ? "2px dashed #3b82f6" : "none", borderRadius: isDragOver ? 4 : undefined, backgroundColor: isDragOver ? "rgba(59,130,246,0.04)" : "transparent", lineHeight: 1.6, fontSize: "11pt", color: "#111", textAlign: "left", whiteSpace: "pre-wrap", cursor: isEditable ? "text" : "default", fontFamily: "Arial, Helvetica, sans-serif", transition: "outline 0.1s ease, background-color 0.1s ease" }}
                        />
                      </div>
                    )}
                  </>
                }
                footer={
                  isSigned && medCtx?.doctorName ? (
                    <div style={{ textAlign: "center", minWidth: 180, maxWidth: "90%", background: layoutFooterUrl ? "rgba(255,255,255,0.82)" : "transparent", padding: "4px 12px", margin: "0 auto" }}>
                      {medCtx.signatureUrl && <img src={medCtx.signatureUrl} alt="Assinatura" style={{ maxHeight: 45, maxWidth: 180, objectFit: "contain", display: "block", margin: "0 auto 2px" }} />}
                      {medCtx.stampUrl && <img src={medCtx.stampUrl} alt="Carimbo" style={{ maxHeight: 70, maxWidth: 200, objectFit: "contain", display: "block", margin: "0 auto 2px" }} />}
                      <div style={{ borderTop: "1.5px solid #333", width: "100%", marginBottom: 3 }} />
                      <div style={{ fontWeight: 700, fontSize: "9pt", textTransform: "uppercase", color: "#111" }}>{medCtx.doctorName}{existingReport?.status === "revised" && <span style={{ marginLeft: 6, color: "#92400e", fontSize: "7pt" }}>RETIFICADO</span>}</div>
                      <div style={{ fontSize: "8pt", color: "#444" }}>MÉDICO RADIOLOGISTA{medCtx.crm ? ` · CRM: ${medCtx.crm}` : ""}</div>
                    </div>
                  ) : <div />
                }
              />            )}
          </div>
        </main>
        </div>{/* fim div wrapper MOD 8 */}
      </div>
      {/* ── EDITOR MOBILE ─────────────────────────────────────────────────────────── */}
      <div className="relative flex md:hidden min-h-0 flex-1 flex-col bg-slate-50 print:hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
          <button
            type="button"
            onClick={() => setShowMobileTools(true)}
            className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700"
            aria-label="Abrir ferramentas do laudo"
          >
            <BookOpen className="h-4 w-4 shrink-0 text-blue-600" />
            <span className="truncate">{activeTab === "modelos" ? "Laudos normais" : activeTab === "frases" ? "Trechos" : "Carimbo"}</span>
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-gray-400" />
          </button>
          <button
            type="button"
            onClick={handleTogglePreview}
            className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${isPreview ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-700"}`}
            aria-label={isPreview ? "Voltar para edição" : "Pré-visualizar laudo"}
          >
            {isPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden min-[420px]:inline">{isPreview ? "Editar" : "Preview"}</span>
          </button>
        </div>

        {isEditable && !isPreview && (
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2 py-1.5">
            <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand('undo'); }} title="Desfazer" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"><Undo2 className="h-4 w-4" /></button>
            <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand('redo'); }} title="Refazer" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"><Redo2 className="h-4 w-4" /></button>
            <span className="mx-1 h-5 w-px shrink-0 bg-gray-200" />
            <select value={fontSize} onChange={e => applyFontSize(e.target.value)} className="h-8 shrink-0 rounded-md border border-gray-200 bg-white px-1 text-xs text-gray-700" aria-label="Tamanho da fonte">
              {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24].map(s => <option key={s} value={String(s)}>{s}pt</option>)}
            </select>
            <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand('bold'); }} title="Negrito" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-bold text-gray-700 hover:bg-gray-100"><Bold className="h-4 w-4" /></button>
            <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand('italic'); }} title="Itálico" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"><Italic className="h-4 w-4" /></button>
            <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand('underline'); }} title="Sublinhado" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"><Underline className="h-4 w-4" /></button>
            <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand('foreColor', false, '#dc2626'); }} title="Texto vermelho" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-bold text-red-600 hover:bg-gray-100">A</button>
            <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand('hiliteColor', false, '#fef08a'); }} title="Realce amarelo" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-yellow-500 hover:bg-gray-100"><Highlighter className="h-4 w-4" /></button>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-24">
          <div className="mx-auto w-full max-w-[794px] rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 flex flex-col font-serif text-xs text-gray-900 relative">
            {layoutBgUrl && (
              <img src={layoutBgUrl} alt="Fundo" className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-20 rounded-xl" style={{ zIndex: 0 }} />
            )}

            {/* Cabeçalho Institucional Mobile */}
            {bpLogo.visible && (
              <div className="flex items-center justify-between border-b-2 border-blue-600 pb-3 mb-3 relative z-10">
                <div className="flex items-center gap-2">
                  {layoutLogos.length > 0 ? (
                    layoutLogos.map((l, i) => (
                      <img key={i} src={l.url} alt={`Logo ${i + 1}`} className="h-8 object-contain" />
                    ))
                  ) : medCtx?.unitLogoUrl ? (
                    <img src={medCtx.unitLogoUrl} alt={medCtx.unitName || "Logo"} className="h-8 object-contain" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-blue-600 text-white font-sans font-bold flex items-center justify-center text-xs">
                      {(medCtx?.unitName || "U").charAt(0)}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-sans font-bold uppercase tracking-wide text-xs text-blue-900">{medCtx?.unitName || "PACS Principal"}</p>
                  <p className="font-sans text-[8px] text-gray-500">Laudo Radiológico Oficial</p>
                </div>
              </div>
            )}

            {/* Dados do Paciente e Exame */}
            <div className="rounded border border-gray-200 bg-gray-50/90 p-2.5 mb-3 relative z-10 font-sans">
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div>
                  <span className="text-gray-400 text-[9px] uppercase">Paciente:</span>
                  <p className="font-bold text-gray-900 truncate">{patientName || "ANTONIA DE SOUZA BATISTA"}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-[9px] uppercase">Nascimento:</span>
                  <p className="font-medium text-gray-800">{studyInfo?.birthDate || "15/05/1970"}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-400 text-[9px] uppercase">Exame Realizado:</span>
                  <input
                    value={examTitle}
                    onChange={e => setExamTitle(e.target.value)}
                    placeholder="Digite o tipo de exame..."
                    disabled={!isEditable}
                    className="w-full font-bold uppercase text-gray-900 bg-transparent border-0 p-0 text-xs focus:outline-none disabled:cursor-default"
                  />
                </div>
              </div>
            </div>

            {/* Título do Exame / Laudo */}
            {bpTitle.visible && (
              <div className="text-center font-bold uppercase text-xs tracking-wider text-gray-900 mb-3 relative z-10 border-b border-gray-200 pb-2">
                {examTitle || "LAUDO RADIOLÓGICO"}
              </div>
            )}

            {isSigned && !isRevising && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 relative z-10">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Laudo {existingReport?.status === "revised" ? "retificado" : "assinado"}.</span>
              </div>
            )}

            {/* Corpo do Editor Mobile */}
            <div className="flex-1 relative z-10 my-2">
              {isMultiSection ? (
                <div className="space-y-4">
                  {examNames.map((name, i) => (
                    <section key={name + i} className="rounded-lg border border-gray-200 p-3 bg-white/90">
                      <h2 className="mb-2 border-b border-gray-100 pb-2 text-center text-xs font-bold uppercase text-gray-800">{name}</h2>
                      {isPreview ? (
                        <div data-editor-content className="min-h-[180px] text-xs leading-relaxed text-gray-900" dangerouslySetInnerHTML={{ __html: previewHtml.split("<hr/>")[i] || "<p style='color:#9ca3af;font-style:italic'>Sem conteúdo.</p>" }} />
                      ) : (
                        <div
                          ref={el => { sectionRefs.current[i] = el; }}
                          contentEditable={isEditable}
                          suppressContentEditableWarning
                          data-editor-content
                          onFocus={() => { activeSectionRef.current = i; }}
                          onMouseUp={isEditable ? saveSelection : undefined}
                          onKeyUp={isEditable ? saveSelection : undefined}
                          data-placeholder={`Digite o laudo de ${name}...`}
                          className="min-h-[180px] text-xs leading-relaxed text-gray-900 outline-none"
                        />
                      )}
                    </section>
                  ))}
                </div>
              ) : isPreview ? (
                <div data-editor-content className="min-h-[350px] text-xs leading-relaxed text-gray-900" dangerouslySetInnerHTML={{ __html: previewHtml || "<p style='color:#9ca3af;font-style:italic'>Sem conteúdo para visualizar.</p>" }} />
              ) : (
                <div
                  ref={mobileDocRef}
                  contentEditable={isEditable}
                  suppressContentEditableWarning
                  data-editor-content
                  onMouseUp={isEditable ? saveSelection : undefined}
                  onKeyUp={isEditable ? saveSelection : undefined}
                  data-placeholder="Digite o laudo aqui (Técnica, Achados, Impressão)..."
                  className={`min-h-[350px] text-xs leading-relaxed text-gray-900 outline-none bg-white/90 p-2 rounded ${isDragOver ? "ring-2 ring-blue-400 bg-blue-50/50" : ""}`}
                />
              )}
            </div>

            {/* Rodapé e Assinatura Mobile */}
            {isSigned && medCtx?.doctorName && (
              <div className="mt-4 pt-3 border-t border-gray-200 text-center relative z-10 font-sans">
                {medCtx.signatureUrl && <img src={medCtx.signatureUrl} alt="Assinatura" className="h-10 mx-auto object-contain mb-1" />}
                {medCtx.stampUrl && <img src={medCtx.stampUrl} alt="Carimbo" className="h-16 mx-auto object-contain mb-1" />}
                <p className="font-bold uppercase text-[10px] text-gray-900">{medCtx.doctorName}</p>
                <p className="text-[9px] text-gray-600">CRM: {medCtx.crm || "12345"} | Médico Radiologista</p>
              </div>
            )}

            {bpFooter.visible && layoutFooterUrl && (
              <img src={layoutFooterUrl} alt="Rodapé" className="w-full object-cover mt-4 relative z-10 rounded-b-xl" style={{ maxHeight: 60 }} />
            )}
          </div>
        </main>

        <div className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-gray-200 bg-white/95 px-3 py-2 shadow-[0_-4px_14px_rgba(15,23,42,0.08)] backdrop-blur print:hidden">
          {isEditable && (
            <button
              type="button"
              onClick={handleSave}
              disabled={createReport.isPending || updateReport.isPending}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 disabled:opacity-50"
            >
              {(createReport.isPending || updateReport.isPending) ? "Salvando..." : "Salvar rascunho"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowMobileTools(true)}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <BookOpen className="h-4 w-4" />
            Ferramentas
          </button>
        </div>

        {showMobileTools && (
          <div className="absolute inset-x-0 bottom-0 z-50 flex max-h-[78dvh] flex-col rounded-t-2xl border-t border-gray-200 bg-white shadow-[0_-10px_30px_rgba(15,23,42,0.2)]">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-gray-900">Ferramentas do laudo</p>
                <p className="text-[11px] text-gray-500">Escolha um item sem sair do editor</p>
              </div>
              <button type="button" onClick={() => setShowMobileTools(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Fechar ferramentas"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-3 border-b border-gray-200">
              {([
                { id: "modelos" as const, label: "Modelos", icon: <GripVertical className="h-4 w-4" /> },
                { id: "frases" as const, label: "Trechos", icon: <MessageSquare className="h-4 w-4" /> },
                { id: "carimbo" as const, label: "Carimbo", icon: <Layers className="h-4 w-4" /> },
              ]).map(tab => (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-semibold ${activeTab === tab.id ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {activeTab === "modelos" && (
                <ModelosTab
                  onApplyTemplate={(body, nextExamTitle) => {
                    if (isMultiSection) {
                      const activeEl = sectionRefs.current[activeSectionRef.current];
                      if (activeEl) activeEl.innerHTML = sanitizeHtmlForEditor(body);
                    } else if (docRef.current) {
                      docRef.current.innerHTML = sanitizeHtmlForEditor(body);
                    }
                    if (nextExamTitle) setExamTitle(nextExamTitle);
                    setShowMobileTools(false);
                  }}
                  currentExamTitle={examTitle}
                  currentModality={studyInfo?.modality || ""}
                />
              )}
              {activeTab === "frases" && <FrasesTab onInsert={(text) => { insertAtCursor(text); setShowMobileTools(false); }} onFocus={saveSelection} />}
              {activeTab === "carimbo" && <CarimboTab signatureUrl={medCtx?.signatureUrl ?? null} stampUrl={medCtx?.stampUrl ?? null} doctorName={medCtx?.doctorName ?? ""} crm={medCtx?.crm ?? ""} />}
            </div>
          </div>
        )}
      </div>

      {/* ── BOTÃO FLUTUANTE DE MÁSCARAS / LAUDOS PRONTOS ──────────────────────────── */}
      {isEditable && (
        <>
          {/* Botão flutuante */}
          <button
            onClick={() => setShowMasksPanel(p => !p)}
            className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:bg-blue-700 md:bottom-6 md:right-6 print:hidden"
            title="Laudos Prontos / Máscaras"
          >
            <BookOpen className="h-4 w-4" />
            Laudos Prontos
          </button>

          {/* Painel lateral de máscaras */}
          {showMasksPanel && (
            <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[380px] flex-col bg-white shadow-2xl print:hidden" style={{ borderLeft: '1px solid #e5e7eb' }}>
              {/* Header do painel */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-gray-800">Laudos Prontos</span>
                  {masks && <span className="text-xs text-gray-400">({masks.length})</span>}
                </div>
                <div className="flex items-center gap-2">
                  {/* Importar JSON */}
                  <button
                    onClick={() => maskFileRef.current?.click()}
                    disabled={importMasks.isPending}
                    title="Importar máscaras (.json)"
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-medium"
                  >
                    <Upload className="h-3 w-3" />
                    Importar .json
                  </button>
                  <input ref={maskFileRef} type="file" accept=".json" className="hidden" onChange={handleMaskFileImport} />
                  <button onClick={() => setShowMasksPanel(false)} className="p-1 rounded hover:bg-gray-200 text-gray-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Busca */}
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                  <input
                    value={maskSearch}
                    onChange={e => setMaskSearch(e.target.value)}
                    placeholder="Buscar máscara..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>

              {/* Dica de formato JSON */}
              {(!masks || masks.length === 0) && (
                <div className="mx-3 mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                  <p className="font-semibold mb-1">Formato do arquivo .json:</p>
                  <pre className="text-[10px] bg-white p-2 rounded border border-blue-100 overflow-x-auto">{`[{\n  "name": "RX Tórax Normal",\n  "modality": "CR",\n  "exam_title": "RADIOGRAFIA DE TÓRAX",\n  "body": "<p>Laudo normal...</p>"\n}]`}</pre>
                  <p className="mt-2 text-[10px] text-blue-600">{isAdminMaster ? "Como admin, suas máscaras ficam visíveis para todos da unidade." : "Suas máscaras são pessoais."}</p>
                </div>
              )}

              {/* Lista de máscaras */}
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                {(masks ?? []).filter(m =>
                  !maskSearch || m.name.toLowerCase().includes(maskSearch.toLowerCase()) ||
                  (m.modality ?? "").toLowerCase().includes(maskSearch.toLowerCase())
                ).map(m => (
                  <div
                    key={m.id}
                    className="group flex items-start gap-2 p-2.5 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => applyMask(m.body, m.exam_title)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {m.modality && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">{m.modality}</span>
                        )}
                        <span className="text-xs font-medium text-gray-800 truncate">{m.name}</span>
                        {m.scope === 'unit' && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-green-100 text-green-700 font-medium">unidade</span>
                        )}
                      </div>
                      {m.exam_title && (
                        <p className="text-[10px] text-gray-500 truncate">{m.exam_title}</p>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); deleteMask.mutate({ id: m.id, unitId }); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 text-red-500 transition-opacity shrink-0"
                      title="Remover máscara"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Overlay para fechar o painel */}
          {showMasksPanel && (
            <div className="fixed inset-0 z-40 print:hidden" onClick={() => setShowMasksPanel(false)} />
          )}
        </>
      )}

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

      {/* Modal de confirmação de exclusão */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 420, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>Apagar laudo</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#374151', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px' }}>
              O laudo de <strong>{patientName}</strong> será permanentemente excluído, incluindo todo o histórico de versões.
            </p>
            {/* LOG-01: campo de motivo obrigatório para admin_master apagar laudo assinado/retificado */}
            {isAdminMaster && isSigned && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Motivo da exclusão <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  placeholder="Informe o motivo para excluir este laudo assinado..."
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteReason(""); }}
                style={{ padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteReport.isPending}
                style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: '#dc2626', color: '#fff', cursor: deleteReport.isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: deleteReport.isPending ? 0.7 : 1 }}
              >
                {deleteReport.isPending ? 'Apagando...' : 'Confirmar Exclusão'}
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
          /* FIX DnD: cursor e feedback nos itens arrastáveis da sidebar */
          [draggable="true"] { cursor: grab; user-select: none; }
          [draggable="true"]:active { cursor: grabbing; }
        }
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #bbb;
          pointer-events: none;
        }
        `}</style>
    </div>
    </>
  );
}
// ─── ModelosTab (Redesign) ────────────────────────────────────────────────────
function ModelosTab({
  onApplyTemplate,
  currentExamTitle,
  currentModality,
}: {
  onApplyTemplate: (body: string, examTitle?: string) => void;
  currentExamTitle: string;
  currentModality: string;
}) {
  const { data: rawPersonal = [] }  = trpc.templates.listMine.useQuery();
  const { data: rawGlobal = [] }    = trpc.templates.listGlobal.useQuery();
  const [search, setSearch]         = useState("");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const norm  = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const terms = norm(search.trim());

  const getCategory = (t: any): string => {
    if (t.category) return t.category;
    const title = t.exam_title || t.name || "";
    const words = title.split(/[\s\-\u2014]+/);
    const skip = new Set(["rm", "tc", "rx", "us", "ct", "mr", "cr", "dx",
      "ressonancia", "tomografia", "radiografia", "ultrassom",
      "ultrassonografia", "radiologia", "de", "do", "da", "dos", "das"]);
    const region = words.find((w: string) => w.length > 2 && !skip.has(w.toLowerCase()));
    return region ? region.charAt(0).toUpperCase() + region.slice(1) : "Geral";
  };

  const allTemplates = [...rawGlobal, ...rawPersonal].filter(Boolean);

  // Palavras genéricas que NÃO identificam a região anatômica do exame
  const STOP_WORDS = new Set([
    "radiografia", "tomografia", "ressonancia", "ecografia",
    "ultrassom", "ultrassonografia", "mamografia", "cintilografia",
    "rx", "rm", "tc", "mr", "ct", "us", "dx", "cr", "pet", "scan",
    "exame", "laudo", "de", "da", "do", "dos", "das", "em", "na",
    "no", "nos", "nas", "ap", "pa", "e", "com", "sem", "por",
    "para", "um", "uma", "normal", "simples", "bilateral",
  ]);

  const suggested = currentExamTitle
    ? allTemplates.filter(t => {
        const mod   = (t.modality || "").toLowerCase();
        const title = norm(t.exam_title || t.name || "");
        const dicomToLocal: Record<string, string> = { ct: "tc", mr: "rm", cr: "rx", dx: "rx", us: "us" };
        const localMod = dicomToLocal[currentModality.toLowerCase()] ?? currentModality.toLowerCase();
        // Extrair apenas palavras significativas do título digitado
        const examWords = norm(currentExamTitle)
          .split(/[\s\-\/]+/)
          .filter(w => w.length > 2 && !STOP_WORDS.has(w));
        if (examWords.length > 0) {
          // Palavras significativas encontradas → exigir match no título do template
          return examWords.some(w => title.includes(w));
        } else {
          // Só palavras genéricas (ex: "RX", "TC") → fallback por modalidade
          return mod === localMod;
        }
      })
    : [];

  const filtered = terms
    ? allTemplates.filter(t =>
        norm(t.name).includes(terms) ||
        norm(t.exam_title || "").includes(terms) ||
        norm(getCategory(t)).includes(terms)
      )
    : allTemplates;

  const grouped = filtered.reduce<Record<string, typeof allTemplates>>((acc, t) => {
    const cat = getCategory(t);
    (acc[cat] ||= []).push(t);
    return acc;
  }, {});

  const toggleCategory = (cat: string) =>
    setOpenCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  const TemplateCard = ({ t, highlighted = false }: { t: any; highlighted?: boolean }) => (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/json", JSON.stringify({
          type: "template",
          data: t.bodyTemplate,
          examTitle: t.exam_title || undefined,
        }));
        (e.currentTarget as HTMLElement).style.opacity = "0.5";
      }}
      onDragEnd={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
      onClick={() => onApplyTemplate(t.bodyTemplate, t.exam_title || undefined)}
      className={`flex items-start gap-2 p-3 border rounded-md cursor-grab active:cursor-grabbing transition-colors hover:border-blue-300 hover:bg-blue-50/60 group ${
        highlighted ? "border-blue-200 bg-blue-50/40" : "border-gray-200 bg-white"
      }`}
      title="Arraste para o laudo ou clique para aplicar"
    >
      <GripVertical className="h-4 w-4 text-gray-300 group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-800 truncate">{t.name}</p>
        {t.exam_title && (
          <p className="text-[10px] text-gray-400 truncate mt-0.5">{t.exam_title}</p>
        )}
      </div>
      {(t as any).owner_user_id && (
        <span className="text-[9px] bg-green-100 text-green-600 rounded px-1 py-0.5 shrink-0 font-medium">meu</span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar modelo..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">Arraste para o laudo ou clique para aplicar</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {!search && suggested.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-2">
              ✦ Sugeridos para este exame
            </p>
            <div className="space-y-2">
              {suggested.map(t => <TemplateCard key={`s-${t.id}`} t={t} highlighted />)}
            </div>
          </div>
        )}

        {Object.entries(grouped).map(([cat, items]) => {
          const isOpen = openCategories[cat] ?? true;
          return (
            <div key={cat}>
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center justify-between mb-2 group"
              >
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider group-hover:text-gray-700 transition-colors">
                  {cat}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">
                    {items.length}
                  </span>
                  {isOpen
                    ? <ChevronDown className="h-3 w-3 text-gray-400" />
                    : <ChevronRight className="h-3 w-3 text-gray-400" />
                  }
                </div>
              </button>
              {isOpen && (
                <div className="space-y-2">
                  {items.map(t => <TemplateCard key={t.id} t={t} />)}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-8 px-4">
            {search ? (
              <>
                <p className="text-xs text-gray-400 mb-2">Nenhum modelo encontrado para &quot;{search}&quot;</p>
                <button onClick={() => setSearch("")} className="text-xs text-blue-500 hover:underline">
                  Limpar busca
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-400 mb-1">Nenhum modelo disponível</p>
                <p className="text-xs text-gray-300 leading-relaxed">
                  O administrador pode criar modelos em{" "}
                  <span className="font-medium text-gray-400">Admin → Templates de Laudo</span>.
                  Você também pode criar seus próprios modelos pessoais.
                </p>
              </>
            )}
          </div>
        )}
      </div>
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
  const saveAsMyPhrase = trpc.phrases.saveAsMyPhrase.useMutation({ onSuccess: () => { refetchPhrases(); toast.success("Frase salva na sua biblioteca!"); } });

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
        <div className="text-center py-8 px-4">
          <p className="text-sm text-gray-400 mb-1">Nenhum grupo de frases</p>
          <p className="text-xs text-gray-300 leading-relaxed">
            Crie grupos e frases pessoais clicando em &quot;+ Grupo&quot; acima.
            As frases ficam salvas no seu login para uso futuro.
          </p>
        </div>
      )}

      {groups.map(group => {
        const groupPhrases = phrases.filter(p => p.group_id === group.id);
        const isOpen = openGroups[group.id] ?? false;
        const isGlobalGroup = (group as any).is_global === true || (group as any).is_global === 1;
        return (
          <div key={group.id} className="border border-gray-200 rounded overflow-hidden">
            <button
              onClick={() => toggleGroup(group.id)}
              className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 ${isGlobalGroup ? 'bg-blue-50' : 'bg-gray-50'}`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {isGlobalGroup && (
                  <span className="text-[9px] font-bold bg-blue-100 text-blue-600 rounded px-1 py-0.5 shrink-0">SISTEMA</span>
                )}
                <span className="truncate">{group.name}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-gray-400 text-[10px]">{groupPhrases.length}</span>
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </div>
            </button>
            {isOpen && (
              <div className="divide-y divide-gray-100">
                {groupPhrases.map(phrase => {
                  const isGlobalPhrase = (phrase as any).is_global === true || (phrase as any).is_global === 1;
                  return (
                    <div
                      key={phrase.id}
                      className="flex items-start gap-1 px-2 py-1.5 hover:bg-blue-50 group"
                      // FIX DnD: tornar a frase arrastável
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'copy';
                        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'phrase', data: phrase.content }));
                                        e.dataTransfer.setData('text/plain', phrase.content); // fallback
                        (e.currentTarget as HTMLDivElement).style.opacity = '0.5';
                      }}
                      onDragEnd={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
                    >
                      <button
                        onMouseDown={(e) => { e.preventDefault(); onFocus(); }}
                        onClick={() => { onInsert(phrase.content); }}
                        className="flex-1 text-left text-xs text-gray-700 leading-relaxed"
                      >
                        {phrase.content}
                      </button>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                        {isGlobalPhrase ? (
                          <button
                            onClick={() => saveAsMyPhrase.mutate({ phraseId: phrase.id })}
                            className="text-blue-400 hover:text-blue-600"
                            title="Salvar como minha frase"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        ) : (
                          <>
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
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
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

// ─── CarimboTab (Redesign) ────────────────────────────────────────────────────
function CarimboTab({
  signatureUrl,
  stampUrl,
  doctorName,
  crm,
}: {
  signatureUrl: string | null;
  stampUrl: string | null;
  doctorName: string;
  crm: string;
}) {
  const DraggableImage = ({
    src,
    type,
    label,
    hint,
  }: {
    src: string;
    type: "signature" | "stamp";
    label: string;
    hint: string;
  }) => (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "copy";
          e.dataTransfer.setData("application/json", JSON.stringify({ type, data: src }));
          (e.currentTarget as HTMLElement).style.opacity = "0.5";
        }}
        onDragEnd={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        className="border-2 border-dashed border-gray-200 rounded-lg p-3 flex items-center
                   justify-center min-h-[90px] cursor-grab active:cursor-grabbing
                   hover:border-blue-300 hover:bg-blue-50/40 transition-colors group"
        title={`Arraste para inserir ${label.toLowerCase()} no laudo`}
      >
        <img src={src} alt={label} className="max-h-16 max-w-full object-contain" />
      </div>
      <p className="text-[10px] text-gray-400">{hint}</p>
    </div>
  );

  const EmptySlot = ({ label, message }: { label: string; message: string }) => (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <div className="border-2 border-dashed border-gray-100 rounded-lg p-4 flex flex-col
                      items-center justify-center min-h-[90px] bg-gray-50/50">
        <p className="text-xs text-gray-400 text-center">{message}</p>
        <p className="text-[10px] text-gray-300 mt-1 text-center">
          Configure no perfil via Admin → Usuários
        </p>
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-5">
      {doctorName && (
        <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
          <p className="text-xs font-medium text-gray-700">{doctorName}</p>
          {crm && <p className="text-[10px] text-gray-400 mt-0.5">{crm}</p>}
        </div>
      )}
      {signatureUrl ? (
        <DraggableImage
          src={signatureUrl}
          type="signature"
          label="Assinatura"
          hint="Arraste para a área de assinatura do laudo"
        />
      ) : (
        <EmptySlot label="Assinatura" message="Sem assinatura cadastrada" />
      )}
      <div className="border-t border-gray-100" />
      {stampUrl ? (
        <DraggableImage
          src={stampUrl}
          type="stamp"
          label="Carimbo"
          hint="Arraste para a área de carimbo do laudo"
        />
      ) : (
        <EmptySlot label="Carimbo" message="Sem carimbo cadastrado" />
      )}
      <p className="text-[10px] text-gray-400 bg-blue-50 rounded p-2 leading-relaxed">
        Arraste a assinatura ou carimbo para a área correspondente no final do laudo.
        Ao assinar, eles serão incluídos automaticamente.
      </p>
    </div>
  );
}


