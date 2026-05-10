import { useState, useEffect, useRef, useCallback } from "react";
import DOMPurify from 'dompurify';
import type { LayoutPreferences, LayoutSnapshot } from '../../../shared/types';
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

  // Aba ativa da sidebar
  // Redesign: 3 abas diretas conforme REDESIGN_EDITOR_LAUDOS.txt
  const [activeTab, setActiveTab] = useState<"modelos" | "frases" | "carimbo">("modelos");
  // DnD: controla o highlight do editor quando um item está sendo arrastado sobre ele
  const [isDragOver, setIsDragOver] = useState(false);

  // Referência ao documento editável (seção única)
  const docRef = useRef<HTMLDivElement>(null);
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
  const { data: unitLayout } = trpc.layouts.getByUnit.useQuery(
    { unitId },
    { enabled: unitId > 0 }
  );

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
  }, [existingReport, isMultiSection]);// ── Salvar seleção antes de interagir com sidebar ────────────────────────
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
    if (isMultiSection && sectionRefs.current.length > 0) {
      const pages = examNames.map((name, i) => ({
        title: name,
        body: sectionRefs.current[i]?.innerHTML || "",
      }));
      return JSON.stringify(pages);
    }
    return docRef.current?.innerHTML || "";
  }, [isMultiSection, examNames]);

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
        capturedAt:   new Date().toISOString(),
      } : null;

      const signResult = await signReport.mutateAsync({
        id: reportId,
        unit_id: studyInfo?.unitId ?? undefined,
        study_instance_uid: studyUid || undefined,
        patient_name: studyInfo?.patientName || undefined,
        study_date: studyInfo?.studyDate || undefined,
        layout_snapshot: layoutSnapshot,  // FIX GAP-1: snapshot do layout
      });

      // Invalidar queries financeiras para atualizar saldo imediatamente
      void utils.billing.getUnitFinancialInfo.invalidate();
      void utils.billing.getDoctorSummary.invalidate();
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
  // GAP-BACKGROUND: imagem de fundo e posições dos blocos do layout da unidade
  type BlockPos = { x: number; y: number; w: number; h: number; visible: boolean };
  const rawLayout = unitLayout as Record<string, unknown> | null | undefined;
  const toAbsUrl = (u: string | null | undefined) => u && u.startsWith('/') ? `${window.location.origin}${u}` : (u || null);
  const layoutBgUrl: string | null = toAbsUrl((rawLayout?.["background_image_url"] as string | null) ?? null);
  const layoutBgOpacity: number = parseFloat((rawLayout?.["background_opacity"] as string | null) ?? '1.0');
  const layoutBgSize: string = (rawLayout?.["background_size"] as string | null) ?? 'cover';
  const layoutBlockPos: Record<string, BlockPos> | null =
    (rawLayout?.["block_positions"] as Record<string, BlockPos> | null) ?? null;
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

    const doctorFooterHtml = isSignedOrRevised && medCtx?.doctorName ? `
      <div class="doctor-footer">
        ${medCtx.signatureUrl ? `<img src="${medCtx.signatureUrl}" alt="Assinatura" class="sig-img" />` : ''}
        ${medCtx.stampUrl ? `<img src="${medCtx.stampUrl}" alt="Carimbo" class="stamp-img" />` : ''}
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
    /* FIX: padding simula as margens do layout */
    padding-top:    ${lMT}mm;
    padding-right:  ${lMR}mm;
    padding-bottom: ${lMB}mm;
    padding-left:   ${lML}mm;
    /* FIX: min-height garante que body preenche ao menos uma folha inteira */
    min-height: ${paperH};
    font-family: ${fontStack};
    font-size: ${lSize}pt;
    color: #111;
    line-height: ${lLine};
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    /* FIX: fundo com dimensões físicas exatas da folha */
    ${bgBase64 ? `
    background-image: url('${bgBase64}');
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
    background-attachment: fixed;
    ` : ''}
  }
  /* Número de página via div position:fixed (substitui @bottom-right que requer @page margin) */
  .page-number-fixed {
    position: fixed;
    z-index: 3;                              /* FIX: acima de tudo */
    bottom: ${Math.max(lMB - 8, 4)}mm;
    right: ${lMR}mm;
    font-size: 8pt;
    color: #888;
    font-family: Arial, sans-serif;
  }
  /* P4: cabeçalho repetível em múltiplas páginas via thead */
  table.print-layout {
    position: relative;                      /* FIX: cria stacking context */
    z-index: 2;                              /* FIX: acima do overlay branco (z:0) */
    width: 100%;
    border-collapse: collapse;
  }
  table.print-layout td, table.print-layout th { background: transparent !important; }
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
  .header-logo { flex-shrink: 0; }
  .header-title { flex: 1; text-align: center; }
  .clinic-name { font-size: 14pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
  .clinic-sub { font-size: 10pt; color: #444; margin-top: 2pt; }
  .patient-data { font-size: 10pt; line-height: 1.7; margin-bottom: 12pt; }
  .exam-title { text-align: center; font-weight: 700; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.05em; margin: 8pt 0 12pt 0; }
  .report-body { font-size: ${lSize}pt; line-height: ${lLine}; }
  .report-body > p,
  .report-body > div:not(.exam-section) { margin-bottom: 3pt; }
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
  <div class="page-number-fixed">Página 1</div>
  <!-- MULTI-EXAME: cada exame = div.print-page com height:297mm e page-break-after:always -->
  <!-- Abordagem div-por-página é mais confiável que múltiplas tabelas no Chrome -->
  ${(() => {
    const headerHtml = `
      <div class="header">
        <div class="header-logo">${logoHtml}</div>
        <div class="header-title">
          <div class="clinic-name">${unitName || ''}</div>
          <div class="clinic-sub">Laudo de Interpretação Radiológica</div>
        </div>
      </div>`;
    const footerHtml = layoutFooterUrl
      ? `<img src="${layoutFooterUrl}" alt="Rodapé" style="width:100%;display:block;max-height:30mm;object-fit:contain;" />`
      : `<div style="height:4mm;"></div>`;
    const makePage = (content: string, isLast: boolean) => `
      <div class="print-page" style="
        width: ${paperW};
        min-height: ${paperH};
        padding: ${lMT}mm ${lMR}mm ${lMB}mm ${lML}mm;
        box-sizing: border-box;
        position: relative;
        ${isLast ? '' : 'page-break-after: always; break-after: page;'}
        display: flex;
        flex-direction: column;
      ">
        ${headerHtml}
        <div style="flex:1;">
          <div class="patient-data">${patientDataHtml}</div>
          ${content}
        </div>
        <div style="margin-top:auto;">${footerHtml}</div>
      </div>`;
    // Tentar parsear seções multi-exame
    try {
      const rawBodyForSplit = collectBody();
      const secs: { title: string; body: string }[] = JSON.parse(rawBodyForSplit);
      if (secs && secs.length > 1) {
        return secs.map((sec, i) => {
          const isLast = i === secs.length - 1;
          const secContent = `
            <div class="exam-title">${sec.title}</div>
            <div class="report-body">${sec.body}</div>
            ${isLast ? doctorFooterHtml : ''}`;
          return makePage(secContent, isLast);
        }).join('');
      }
    } catch {}
    // Fallback: página única com tabela (cabeçalho repetível em laudos longos)
    return `<table class="print-layout">
      <thead><tr><td>${headerHtml}</td></tr></thead>
      <tfoot><tr><td style="padding:0;">${footerHtml}</td></tr></tfoot>
      <tbody><tr><td>
        <div class="patient-data">${patientDataHtml}</div>
        ${examTitle ? `<div class="exam-title">${examTitle}</div>` : ''}
        <div class="report-body">${bodyHtml}</div>
        ${doctorFooterHtml}
      </td></tr></tbody>
    </table>`;
  })()}
  <!-- P5: rodapé via tfoot (renderiza em todas as páginas, compatível com PDF) -->
<script>
  window.onload = function() {
    // Opção D: contador de páginas via JS antes de imprimir
    var total = Math.ceil(document.body.scrollHeight / (297 * 96 / 25.4));
    var el = document.querySelector('.page-number-fixed');
    if (el) el.textContent = 'Página 1 de ' + (total || 1);
    window.print();
    window.onafterprint = function() { window.close(); };
  };
<\/script>
</body></html>`;
    const win = window.open('', '_blank', 'width=850,height=1100');
    if (win) { win.document.write(html); win.document.close(); }
  }, [medCtx, patientName, studyInfo, examTitle, docRef, existingReport, layoutPrefs, layoutLogos, layoutFooterUrl, layoutBgUrl, sectionRefs, examNames, isMultiSection]);

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

      {/* ── CORPO ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden print:block">
        {/* ── SIDEBAR ──────────────────────────────────────────────────── */}
        <aside className="w-[340px] shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden print:hidden">
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
                  if (docRef.current) docRef.current.innerHTML = sanitizeHtmlForEditor(body);
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
        <main className="flex-1 overflow-y-auto bg-gray-100 flex justify-center py-8 print:bg-white print:p-0 print:block">
          <div
            className={isMultiSection ? "relative" : "relative bg-white shadow-md print:shadow-none"}
            style={isMultiSection ? { width: "794px" } : { width: "210mm", minHeight: "297mm" }}
          >
            {/* FIX BUG-2: imagens agora são inline no contentEditable — overlay removido */}

            {/* ═══════════════════════════════════════════════════════════
                 DOCUMENTO LAUDO — Layout WYSIWYG
                 MULTI-PÁGINA: cada exame = folha A4 completa (cabeçalho + título + corpo + rodapé)
                 PÁGINA ÚNICA: layout original preservado
            ═══════════════════════════════════════════════════════════ */}
            {isMultiSection ? (
              /* MODO MULTI-PÁGINA: N folhas A4 independentes */
              <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                {examNames.map((name, i) => {
                  const isLastPage = i === examNames.length - 1;
                  return (
                    <div
                      key={i}
                      className="report-page"
                      style={{
                        width: "794px",
                        minHeight: "1123px",
                        background: "#fff",
                        fontFamily: "'Times New Roman', Times, serif",
                        fontSize: "11pt",
                        color: "#111",
                        boxSizing: "border-box",
                        position: "relative",
                        display: "flex",
                        flexDirection: "column",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
                      }}
                    >
                      {/* Cabeçalho completo por página */}
                      <div style={{ display: "flex", alignItems: "stretch", borderBottom: "2px solid #1a6b8a", minHeight: 90 }}>
                        <div style={{ width: 180, minHeight: 90, flexShrink: 0, borderRight: "1.5px solid #e0e0e0", display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 12px", background: "#fafafa" }}>
                          {layoutLogos.length > 0 ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", justifyContent: "center" }}>
                              {layoutLogos.map((l, i) => (
                                <img key={i} src={l.url} alt={l.label || "Logo"} style={{ maxHeight: l.height, maxWidth: l.width, objectFit: "contain", display: "inline-block" }} />
                              ))}
                            </div>
                          ) : medCtx?.unitLogoUrl ? (
                            <img src={medCtx.unitLogoUrl} alt={medCtx.unitName || "Logo"} style={{ maxHeight: 70, maxWidth: 155, objectFit: "contain", display: "block" }} />
                          ) : (
                            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #1a6b8a 0%, #6fb7c5 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "20pt", fontWeight: 700, fontFamily: "Arial, sans-serif" }}>
                              {(medCtx?.unitName || "U").charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div style={{ flex: 1, padding: "10px 20px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 5 }}>
                          <div style={{ fontSize: "12pt", fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "0.02em" }}>{patientName || "—"}</div>
                          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                            {studyInfo?.birthDate && <div style={{ fontSize: "9.5pt", color: "#444" }}>Nascimento: <strong style={{ color: "#111" }}>{studyInfo.birthDate}</strong></div>}
                            {studyInfo?.studyDate && <div style={{ fontSize: "9.5pt", color: "#444" }}>Realizado em: <strong style={{ color: "#111" }}>{formatDicomDate(studyInfo.studyDate)}</strong></div>}
                          </div>
                        </div>
                      </div>

                      {/* Corpo: título específico + editor */}
                      <div style={{ flex: 1, padding: "16px 24px 12px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ textAlign: "center", fontWeight: 700, fontSize: "13pt", textTransform: "uppercase", letterSpacing: "0.05em", color: "#111", paddingBottom: 6, borderBottom: "1px solid #e0e0e0" }}>
                          {name}
                        </div>
                        {i === 0 && isSigned && !isRevising && (
                          <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 6, padding: "7px 12px", fontSize: "10pt", color: "#92400e", display: "flex", alignItems: "center", gap: 8 }}>
                            <CheckCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                            <span>Laudo <strong>{existingReport?.status === "revised" ? "retificado" : "assinado"}</strong> — clique em <strong>Retificar</strong> para editar.</span>
                          </div>
                        )}
                        <div
                          ref={el => { sectionRefs.current[i] = el; }}
                          contentEditable={isEditable}
                          suppressContentEditableWarning
                          onFocus={() => { activeSectionRef.current = i; }}
                          onMouseUp={isEditable ? saveSelection : undefined}
                          onKeyUp={isEditable ? saveSelection : undefined}
                          data-placeholder={`Digite o laudo de ${name}...`}
                          // FIX DnD: drop nas seções do modo multi-exame
                          onDragOver={isEditable ? (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                            activeSectionRef.current = i;
                            setIsDragOver(true);
                          } : undefined}
                          onDragLeave={isEditable ? () => setIsDragOver(false) : undefined}
                          onDrop={isEditable ? (e) => {
                            e.preventDefault();
                            setIsDragOver(false);
                            activeSectionRef.current = i;
                            // Payload JSON unificado (ModelosTab, FrasesTab, CarimboTab)
                            const jsonRaw = e.dataTransfer.getData('application/json');
                            if (jsonRaw) {
                              try {
                                const payload = JSON.parse(jsonRaw);
                                if (payload.type === 'template') {
                                  const el = sectionRefs.current[i];
                                  if (el) el.innerHTML = sanitizeHtmlForEditor(payload.data);
                                } else if (payload.type === 'phrase') {
                                  insertAtCursor(payload.data);
                                } else if (payload.type === 'signature' || payload.type === 'stamp') {
                                  insertAtCursor(`<img src="${payload.data}" style="max-height:60px;display:block;margin:4px 0;" />`);
                                }
                              } catch (_) {}
                              return;
                            }
                            // Legado: text/x-report-template
                            const templateRaw = e.dataTransfer.getData('text/x-report-template');
                            if (templateRaw) {
                              try {
                                const { body } = JSON.parse(templateRaw);
                                const el = sectionRefs.current[i];
                                if (el) el.innerHTML = sanitizeHtmlForEditor(body);
                              } catch (_) {}
                              return;
                            }
                            const plainText = e.dataTransfer.getData('text/plain');
                            if (plainText) insertAtCursor(plainText);
                          } : undefined}
                          style={{
                            flex: 1, minHeight: "60mm",
                            outline: isDragOver && activeSectionRef.current === i ? "2px dashed #3b82f6" : "none",
                            borderRadius: "4px",
                            lineHeight: 1.6, fontSize: "11pt", color: "#111",
                            textAlign: "left", whiteSpace: "pre-wrap",
                            cursor: isEditable ? "text" : "default",
                            fontFamily: "'Times New Roman', Times, serif",
                            transition: "outline 0.1s ease",
                          }}
                        />
                      </div>

                      {/* Assinatura/carimbo apenas na última página */}
                      {isLastPage && isSigned && medCtx?.doctorName && (
                        <div style={{ padding: "8mm 18mm 6mm 18mm", display: "flex", justifyContent: "center" }}>
                          <div style={{ textAlign: "center", minWidth: 180, maxWidth: 260 }}>
                            {medCtx.signatureUrl && <img src={medCtx.signatureUrl} alt="Assinatura" style={{ maxHeight: 55, maxWidth: 200, objectFit: "contain", display: "block", margin: "0 auto 2mm", }} />}
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
                        </div>
                      )}

                      {/* Rodápé institucional removido a pedido do usuário */}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* MODO PÁGINA Única: layout original preservado */
              <div style={{
                width: "794px",
                minHeight: "1123px",
                background: layoutBgUrl ? `url('${layoutBgUrl}') center/cover no-repeat #fff` : "#fff",
                // FIX GAP-2: aplicar tipografia e margens do layout da unidade
                fontFamily: layoutPrefs?.fontFamily ? `'${layoutPrefs.fontFamily}', sans-serif` : "'Times New Roman', Times, serif",
                fontSize: layoutPrefs?.fontSize ? `${layoutPrefs.fontSize}pt` : "11pt",
                lineHeight: layoutPrefs?.lineHeight ?? 1.6,
                paddingTop: layoutPrefs?.marginTop ? `${layoutPrefs.marginTop}mm` : undefined,
                paddingRight: layoutPrefs?.marginRight ? `${layoutPrefs.marginRight}mm` : undefined,
                paddingBottom: layoutPrefs?.marginBottom ? `${layoutPrefs.marginBottom}mm` : undefined,
                paddingLeft: layoutPrefs?.marginLeft ? `${layoutPrefs.marginLeft}mm` : undefined,
                color: "#111",
                boxSizing: "border-box",
                position: "relative",
                display: "flex",
                flexDirection: "column",
              }}>
                {/* ══ CABEÇALHO ══ */}
                <div style={{ display: "flex", alignItems: "stretch", borderBottom: `2px solid ${layoutPrefs?.headerBorderColor ?? "#1a6b8a"}`, minHeight: 90 }}>
                  <div style={{ width: 180, minHeight: 90, flexShrink: 0, borderRight: "1.5px solid #e0e0e0", display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 12px", background: "#fafafa" }}>
                    {layoutLogos.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", justifyContent: "center" }}>
                        {layoutLogos.map((l, i) => (
                          <img key={i} src={l.url} alt={l.label || "Logo"} style={{ maxHeight: l.height, maxWidth: l.width, objectFit: "contain", display: "inline-block" }} />
                        ))}
                      </div>
                    ) : medCtx?.unitLogoUrl ? (
                      <img src={medCtx.unitLogoUrl} alt={medCtx.unitName || "Logo"} style={{ maxHeight: 70, maxWidth: 155, objectFit: "contain", display: "block" }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #1a6b8a 0%, #6fb7c5 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "20pt", fontWeight: 700, fontFamily: "Arial, sans-serif" }}>
                        {(medCtx?.unitName || "U").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, padding: "10px 20px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 5 }}>
                    <div style={{ fontSize: "12pt", fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "0.02em" }}>{patientName || "—"}</div>
                    <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                      {studyInfo?.birthDate && <div style={{ fontSize: "9.5pt", color: "#444" }}>Nascimento: <strong style={{ color: "#111" }}>{studyInfo.birthDate}</strong></div>}
                      {studyInfo?.studyDate && <div style={{ fontSize: "9.5pt", color: "#444" }}>Realizado em: <strong style={{ color: "#111" }}>{formatDicomDate(studyInfo.studyDate)}</strong></div>}
                    </div>
                  </div>
                </div>

                {/* ══ CORPO ══ */}
                <div style={{ flex: 1, padding: "16px 24px 12px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    {examTitle ? (
                      editingTitle ? (
                        <input
                          ref={titleInputRef}
                          value={examTitle}
                          onChange={e => setExamTitle(e.target.value)}
                          onBlur={() => setEditingTitle(false)}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false); }}
                          autoFocus
                          style={{ width: "100%", textAlign: "center", fontWeight: "bold", fontSize: "13pt", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'Times New Roman', Times, serif", border: "2px solid #1a6b8a", borderRadius: 4, padding: "4px 8px", outline: "none", background: "#f0f8fb", boxSizing: "border-box", color: "#111" }}
                        />
                      ) : (
                        <div onClick={() => setEditingTitle(true)} title="Clique para editar o título" style={{ textAlign: "center", fontWeight: "bold", fontSize: "13pt", textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer", color: "#111", position: "relative", paddingBottom: 6, borderBottom: "1px solid #e0e0e0" }}>
                          {examTitle}
                          <span style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", fontSize: "9pt", color: "#1a6b8a", opacity: 0.4 }}>✏</span>
                        </div>
                      )
                    ) : (
                      <div style={{ textAlign: "center", color: "#aaa", fontSize: "11pt", fontStyle: "italic", paddingBottom: 6, borderBottom: "1px solid #e0e0e0" }}>Selecione o tipo de exame na barra lateral</div>
                    )}
                  </div>
                  {isSigned && !isRevising && (
                    <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 6, padding: "7px 12px", fontSize: "10pt", color: "#92400e", display: "flex", alignItems: "center", gap: 8 }}>
                      <CheckCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                      <span>Laudo <strong>{existingReport?.status === "revised" ? "retificado" : "assinado"}</strong> — clique em <strong>Retificar</strong> para editar.</span>
                    </div>
                  )}
                  <div
                    ref={docRef}
                    contentEditable={isEditable}
                    suppressContentEditableWarning
                    onMouseUp={isEditable ? saveSelection : undefined}
                    onKeyUp={isEditable ? saveSelection : undefined}
                    data-placeholder="Digite o laudo aqui..."
                    // FIX DnD: receber drop de templates e frases da sidebar
                    onDragOver={isEditable ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                      setIsDragOver(true);
                    } : undefined}
                    onDragLeave={isEditable ? () => setIsDragOver(false) : undefined}
                    onDrop={isEditable ? (e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      // Payload JSON unificado (ModelosTab, FrasesTab, CarimboTab)
                      const jsonRaw = e.dataTransfer.getData('application/json');
                      if (jsonRaw) {
                        try {
                          const payload = JSON.parse(jsonRaw);
                          if (payload.type === 'template') {
                            if (docRef.current) docRef.current.innerHTML = sanitizeHtmlForEditor(payload.data);
                            if (payload.examTitle) setExamTitle(payload.examTitle);
                          } else if (payload.type === 'phrase') {
                            insertAtCursor(payload.data);
                          } else if (payload.type === 'signature' || payload.type === 'stamp') {
                            insertAtCursor(`<img src="${payload.data}" style="max-height:60px;display:block;margin:4px 0;" />`);
                          }
                        } catch (_) {}
                        return;
                      }
                      // Legado: text/x-report-template
                      const templateRaw = e.dataTransfer.getData('text/x-report-template');
                      if (templateRaw) {
                        try {
                          const { body, examTitle } = JSON.parse(templateRaw);
                          if (docRef.current) docRef.current.innerHTML = sanitizeHtmlForEditor(body);
                          if (examTitle) setExamTitle(examTitle);
                        } catch (_) {}
                        return;
                      }
                      const plainText = e.dataTransfer.getData('text/plain');
                      if (plainText) insertAtCursor(plainText);
                    } : undefined}
                    style={{
                      flex: 1, minHeight: "60mm",
                      outline: isDragOver ? "2px dashed #3b82f6" : "none",
                      borderRadius: isDragOver ? "4px" : undefined,
                      backgroundColor: isDragOver ? "rgba(59,130,246,0.04)" : undefined,
                      lineHeight: 1.6, fontSize: "11pt", color: "#111",
                      textAlign: "left", whiteSpace: "pre-wrap",
                      cursor: isEditable ? "text" : "default",
                      fontFamily: "'Times New Roman', Times, serif",
                      transition: "outline 0.1s ease, background-color 0.1s ease",
                    }}
                  />
                </div>

                {/* ══ ASSINATURA / CARIMBO ══ */}
                {isSigned && medCtx?.doctorName && (
                  <div style={{ padding: "8mm 18mm 6mm 18mm", display: "flex", justifyContent: "center" }}>
                    <div style={{ textAlign: "center", minWidth: 180, maxWidth: 260 }}>
                      {medCtx.signatureUrl && <img src={medCtx.signatureUrl} alt="Assinatura" style={{ maxHeight: 55, maxWidth: 200, objectFit: "contain", display: "block", margin: "0 auto 2mm",}} />}
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
                  </div>
                )}

                {/* ══ RODAPÉ INSTITUCIONAL removido a pedido do usuário ══ */}
                {/* ══ RODAPÉ DO LAYOUT DA UNIDADE ══ */}
                {layoutFooterUrl && (
                  <img src={layoutFooterUrl} alt="Rodapé" style={{ width: "100%", display: "block", marginTop: "auto" }} />
                )}
              </div>
            )}
          </div>

        </main>
        </div>{/* fim div wrapper MOD 8 */}
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
  );
}

// ─── Estrutura hierárquica de exames para a árvore ────────────────────────────
const EXAM_TREE: { label: string; color: string; icon: string; regions: { label: string; exams: string[] }[] }[] = [
  {
    label: "Radiografia (Raio-X)",
    color: "#f59e0b",
    icon: "RX",
    regions: [
      {
        label: "Tórax",
        exams: ["Radiografia de Tórax", "Radiografia de Tórax PA", "Radiografia de Tórax PA e Perfil"],
      },
      {
        label: "Abdome",
        exams: [
          "Radiografia de Abdome Superior",
          "Radiografia de Abdome Inferior",
          "Radiografia de Abdome Total",
          "Radiografia de Abdome sem Preparo",
        ],
      },
      {
        label: "Coluna",
        exams: [
          "Radiografia de Coluna Cervical",
          "Radiografia de Coluna Cervical Superior",
          "Radiografia de Coluna Cervical Inferior",
          "Radiografia de Coluna Dorsal",
          "Radiografia de Coluna Torácica",
          "Radiografia de Coluna Lombar",
          "Radiografia de Coluna Lombossacral",
          "Radiografia de Coluna Vertebral",
          "Escanometria",
        ],
      },
      {
        label: "Membros Superiores",
        exams: [
          "Radiografia de Ombro",
          "Radiografia de Braço Direito",
          "Radiografia de Braço Esquerdo",
          "Radiografia de Mão Direita",
          "Radiografia de Mão Esquerda",
          "Radiografia de Mão AP e Oblíqua",
        ],
      },
      {
        label: "Membros Inferiores",
        exams: [
          "Radiografia de Quadril",
          "Radiografia de Bacia AP",
          "Radiografia de Joelhos",
          "Radiografia de Joelho Direito",
          "Radiografia de Joelho Esquerdo",
          "Radiografia de Joelho AP e Perfil",
          "Radiografia de Perna Direita",
          "Radiografia de Perna Esquerda",
          "Radiografia de Pé Direito",
          "Radiografia de Pé Esquerdo",
          "Radiografia de Pé AP e Perfil",
          "Radiografia de Tornozelo AP e Perfil",
        ],
      },
      {
        label: "Crânio / Cabeça",
        exams: ["Radiografia de Crânio AP e Perfil"],
      },
      {
        label: "Mama",
        exams: ["Mamografia Bilateral"],
      },
      {
        label: "Outros",
        exams: ["Densitometria Óssea", "Cintilografia Óssea"],
      },
    ],
  },
  {
    label: "Tomografia (TC / CT)",
    color: "#3b82f6",
    icon: "TC",
    regions: [
      {
        label: "Cabeça",
        exams: [
          "Tomografia Computadorizada de Cabeça",
          "Tomografia Computadorizada de Crânio sem Contraste",
          "Tomografia Computadorizada de Crânio com Contraste",
          "Tomografia Computadorizada de Seios da Face",
          "Tomografia Computadorizada de Mastoides",
          "Tomografia Computadorizada de Órbitas",
          "Tomografia Computadorizada de Pescoço",
        ],
      },
      {
        label: "Tórax",
        exams: [
          "Tomografia Computadorizada de Tórax",
          "Tomografia Computadorizada de Tórax sem Contraste",
          "Tomografia Computadorizada de Tórax com Contraste",
        ],
      },
      {
        label: "Abdome",
        exams: [
          "Tomografia Computadorizada de Abdome Superior",
          "Tomografia Computadorizada de Abdome Inferior",
          "Tomografia Computadorizada de Abdome Total",
          "Tomografia Computadorizada de Abdome e Pelve sem Contraste",
          "Tomografia Computadorizada de Abdome e Pelve com Contraste",
          "Tomografia Computadorizada de Pelve",
        ],
      },
      {
        label: "Coluna",
        exams: [
          "Tomografia Computadorizada de Coluna Vertebral",
          "Tomografia Computadorizada de Coluna Cervical",
          "Tomografia Computadorizada de Coluna Torácica",
          "Tomografia Computadorizada de Coluna Lombar",
        ],
      },
      {
        label: "Extremidades",
        exams: [
          "Tomografia Computadorizada de Joelho",
          "Tomografia Computadorizada de Ombro",
        ],
      },
      {
        label: "Angio TC",
        exams: [
          "Angiotomografia de Coronárias",
          "Angiotomografia de Aorta",
          "Angiotomografia Cerebral",
        ],
      },
    ],
  },
  {
    label: "Ultrassom (US)",
    color: "#10b981",
    icon: "US",
    regions: [
      {
        label: "Abdome",
        exams: [
          "Ultrassonografia de Abdome",
          "Ultrassonografia de Abdome Superior",
          "Ultrassonografia de Abdome Inferior",
          "Ultrassonografia de Abdome Total",
        ],
      },
      {
        label: "Gestacional / Obstétrico",
        exams: [
          "Ultrassonografia Gestacional",
          "Ultrassonografia Obstétrica",
          "Ultrassonografia Morfológica",
        ],
      },
      {
        label: "Tireoide",
        exams: ["Ultrassonografia de Tireoide"],
      },
      {
        label: "Articulações",
        exams: [
          "Ultrassonografia de Joelhos",
          "Ultrassonografia de Articulações",
          "Ultrassonografia de Partes Moles",
        ],
      },
      {
        label: "Cardíaco",
        exams: [
          "Ultrassonografia Cardíaca",
          "Ecocardiograma Transtorácico",
        ],
      },
      {
        label: "Órgãos",
        exams: [
          "Ultrassonografia de Rins",
          "Ultrassonografia de Fígado",
          "Ultrassonografia de Baço",
          "Ultrassonografia de Próstata",
        ],
      },
      {
        label: "Pelve / Mama",
        exams: [
          "Ultrassonografia Pélvica Transvaginal",
          "Ultrassonografia Pélvica Suprapúbica",
          "Ultrassonografia de Mama Bilateral",
        ],
      },
      {
        label: "Doppler",
        exams: [
          "Ultrassonografia Doppler de Carótidas",
          "Ultrassonografia Doppler de Membros Inferiores",
          "Ultrassonografia Doppler de Membros Superiores",
        ],
      },
    ],
  },
  {
    label: "Ressonância (RM / MRI)",
    color: "#8b5cf6",
    icon: "RM",
    regions: [
      {
        label: "Crânio",
        exams: [
          "Ressonância Magnética de Crânio",
          "Ressonância Magnética de Crânio sem Contraste",
          "Ressonância Magnética de Crânio com Contraste",
        ],
      },
      {
        label: "Tórax",
        exams: ["Ressonância Magnética de Tórax"],
      },
      {
        label: "Abdome",
        exams: [
          "Ressonância Magnética de Abdome",
          "Ressonância Magnética de Pelve",
        ],
      },
      {
        label: "Coluna",
        exams: [
          "Ressonância Magnética de Coluna Cervical",
          "Ressonância Magnética de Coluna Torácica",
          "Ressonância Magnética de Coluna Lombar",
          "Ressonância Magnética de Coluna Vertebral",
        ],
      },
      {
        label: "Extremidades",
        exams: [
          "Ressonância Magnética de Joelho",
          "Ressonância Magnética de Joelhos",
          "Ressonância Magnética de Quadril",
          "Ressonância Magnética de Ombro",
        ],
      },
      {
        label: "Cardíaco",
        exams: ["Ressonância Magnética de Coração"],
      },
      {
        label: "Angio RM",
        exams: [
          "Angiorressonância Cerebral",
          "Angiorressonância de Carótidas",
        ],
      },
    ],
  },
];

// ─── Aba Exames ───────────────────────────────────────────────────────────────
function ExamesTab({ onSelectExam, currentTitle }: { onSelectExam: (name: string) => void; currentTitle: string }) {
  const [search, setSearch] = useState("");
  const [openModalities, setOpenModalities] = useState<Record<string, boolean>>({ Radiografias: true });
  const [openRegions, setOpenRegions] = useState<Record<string, boolean>>({});

  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const searchLower = normalize(search.trim());

  // Ao buscar, expande automaticamente os nós que têm resultados
  const getMatchingExams = (exams: string[]) =>
    searchLower ? exams.filter(e => normalize(e).includes(searchLower)) : exams;

  const toggleModality = (label: string) =>
    setOpenModalities(prev => ({ ...prev, [label]: !prev[label] }));
  const toggleRegion = (key: string) =>
    setOpenRegions(prev => ({ ...prev, [key]: !prev[key] }));

  // Ao digitar na busca, expande tudo que tem resultado
  const expandedModalities = searchLower
    ? Object.fromEntries(
        EXAM_TREE.map(m => [
          m.label,
          m.regions.some(r => getMatchingExams(r.exams).length > 0),
        ])
      )
    : openModalities;

  const expandedRegions = searchLower
    ? Object.fromEntries(
        EXAM_TREE.flatMap(m =>
          m.regions.map(r => [`${m.label}__${r.label}`, getMatchingExams(r.exams).length > 0])
        )
      )
    : openRegions;

  const allSearchResults = searchLower
    ? EXAM_TREE.flatMap(m => m.regions.flatMap(r => getMatchingExams(r.exams)))
    : [];

  return (
    <div className="flex flex-col h-full">
      {/* Campo de busca */}
      <div className="p-3 border-b border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Selecionar Exame</p>
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
      </div>

      {/* Árvore hierárquica */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Resultado de busca flat */}
        {searchLower && allSearchResults.length === 0 && (
          <div className="text-center py-6">
            <p className="text-xs text-gray-400">Nenhum exame encontrado</p>
            <button onClick={() => onSelectExam(search)} className="mt-1 text-xs text-blue-600 hover:underline">
              Usar "{search}" como título
            </button>
          </div>
        )}

        {/* Árvore */}
        {EXAM_TREE.map((modality, mIdx) => {
          const isModalityOpen = expandedModalities[modality.label];
          const visibleRegions = modality.regions.filter(r => !searchLower || getMatchingExams(r.exams).length > 0);
          if (searchLower && visibleRegions.length === 0) return null;

          const isLastModality = mIdx === EXAM_TREE.length - 1;

          return (
            <div key={modality.label} className="relative mb-1">
              {/* Linha vertical da modalidade (conecta ao pai imaginário) */}
              {!isLastModality && (
                <div
                  className="absolute left-[11px] top-[22px] w-px bg-gray-300"
                  style={{ bottom: isModalityOpen ? undefined : "-4px", height: isModalityOpen ? undefined : "4px" }}
                />
              )}

              {/* Nó de Modalidade (Nível 1) */}
              <button
                onClick={() => !searchLower && toggleModality(modality.label)}
                className="w-full flex items-center gap-2 py-1.5 px-1 rounded hover:bg-gray-100 transition-colors group"
              >
                {/* Ícone colorido da modalidade */}
                <span
                  className="flex-shrink-0 w-[22px] h-[22px] rounded flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ backgroundColor: modality.color }}
                >
                  {modality.icon}
                </span>
                <span className="flex-1 text-left text-xs font-semibold text-gray-700">{modality.label}</span>
                {!searchLower && (
                  isModalityOpen
                    ? <ChevronDown className="h-3 w-3 text-gray-400 flex-shrink-0" />
                    : <ChevronRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                )}
              </button>

              {/* Regiões (Nível 2) */}
              {isModalityOpen && (
                <div className="ml-[11px] border-l border-gray-300">
                  {visibleRegions.map((region, rIdx) => {
                    const regionKey = `${modality.label}__${region.label}`;
                    const isRegionOpen = expandedRegions[regionKey];
                    const matchingExams = getMatchingExams(region.exams);
                    const isLastRegion = rIdx === visibleRegions.length - 1;

                    return (
                      <div key={region.label} className="relative">
                        {/* Linha horizontal conectando ao pai */}
                        <div className="absolute left-0 top-[14px] w-3 h-px bg-gray-300" />

                        {/* Nó de Região (Nível 2) */}
                        <button
                          onClick={() => !searchLower && toggleRegion(regionKey)}
                          className="w-full flex items-center gap-1.5 py-1 pl-4 pr-2 rounded hover:bg-gray-100 transition-colors"
                        >
                          <span
                            className="flex-shrink-0 w-[14px] h-[14px] rounded-sm flex items-center justify-center"
                            style={{ backgroundColor: modality.color + "33", border: `1px solid ${modality.color}66` }}
                          >
                            <span className="w-[6px] h-[6px] rounded-sm" style={{ backgroundColor: modality.color }} />
                          </span>
                          <span className="flex-1 text-left text-xs text-gray-600 font-medium">{region.label}</span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{matchingExams.length}</span>
                          {!searchLower && (
                            isRegionOpen
                              ? <ChevronDown className="h-2.5 w-2.5 text-gray-400 flex-shrink-0" />
                              : <ChevronRight className="h-2.5 w-2.5 text-gray-400 flex-shrink-0" />
                          )}
                        </button>

                        {/* Exames (Nível 3) */}
                        {isRegionOpen && (
                          <div className="ml-4 border-l border-gray-200">
                            {matchingExams.map((exam, eIdx) => {
                              const isLastExam = eIdx === matchingExams.length - 1;
                              return (
                                <div key={exam} className="relative">
                                  {/* Linha horizontal para o exame */}
                                  <div className="absolute left-0 top-[13px] w-3 h-px bg-gray-200" />
                                  <button
                                    onClick={() => onSelectExam(exam)}
                                    className={`w-full flex items-center gap-1.5 py-1 pl-4 pr-2 rounded text-left transition-colors ${
                                      currentTitle === exam
                                        ? "bg-blue-100 text-blue-700 font-medium"
                                        : "text-gray-600 hover:bg-blue-50"
                                    }`}
                                  >
                                    {/* Bolinha folha */}
                                    <span
                                      className="flex-shrink-0 w-[8px] h-[8px] rounded-full border-2"
                                      style={{
                                        borderColor: currentTitle === exam ? "#3b82f6" : modality.color,
                                        backgroundColor: currentTitle === exam ? "#3b82f6" : "white",
                                      }}
                                    />
                                    <span className="text-[11px] leading-tight">{exam}</span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Aba Templates ────────────────────────────────────────────────────────────
// Estrutura de modalidades e regiões para navegação rápida
const MODALITY_TREE: { label: string; key: string; icon: string; regions: { label: string; key: string }[] }[] = [
  {
    label: "Radiografias",
    key: "RX",
    icon: "X",
    regions: [
      { label: "Tórax", key: "RX Tórax" },
      { label: "Seios da Face", key: "RX Seios da Face" },
      { label: "Abdome", key: "RX Abdome" },
      { label: "Coluna", key: "RX Coluna" },
      { label: "Extremidades", key: "RX Extremidades" },
    ],
  },
  {
    label: "Tomografias",
    key: "TC",
    icon: "CT",
    regions: [
      { label: "Tórax", key: "TC Tórax" },
      { label: "Seios da Face", key: "TC Seios da Face" },
      { label: "Abdome", key: "TC Abdome" },
      { label: "Crânio", key: "TC Crânio" },
      { label: "Coluna", key: "TC Coluna" },
    ],
  },
  {
    label: "Ultrassom",
    key: "US",
    icon: "US",
    regions: [
      { label: "Tórax", key: "US Tórax" },
      { label: "Seios da Face", key: "US Seios da Face" },
      { label: "Abdome", key: "US Abdome" },
      { label: "Pelve", key: "US Pelve" },
      { label: "Mama", key: "US Mama" },
    ],
  },
  {
    label: "Ressonância",
    key: "RM",
    icon: "MR",
    regions: [
      { label: "Tórax", key: "RM Tórax" },
      { label: "Seios da Face", key: "RM Seios da Face" },
      { label: "Abdome", key: "RM Abdome" },
      { label: "Crânio", key: "RM Crânio" },
      { label: "Coluna", key: "RM Coluna" },
    ],
  },
];

function TemplatesTab({ onApplyTemplate }: { onApplyTemplate: (body: string, examTitle?: string) => void }) {
  const { data: rawTemplates = [], refetch } = trpc.templates.listMine.useQuery();
  const { data: rawGlobalTemplates = [], refetch: refetchGlobal } = trpc.templates.listGlobal.useQuery();
  const myTemplates = rawTemplates.filter(Boolean);
  const globalTemplates = rawGlobalTemplates.filter(Boolean);

  const createTemplate = trpc.templates.createPersonal.useMutation({ onSuccess: () => { refetch(); toast.success("Template salvo!"); setShowForm(false); resetForm(); } });
  const updateTemplate = trpc.templates.updatePersonal.useMutation({ onSuccess: () => { refetch(); toast.success("Template atualizado!"); setEditingId(null); setShowForm(false); resetForm(); } });
  const deleteTemplate = trpc.templates.deletePersonal.useMutation({ onSuccess: () => { refetch(); toast.success("Template excluído"); } });
  const useAsBase = trpc.templates.useAsBase.useMutation({ onSuccess: () => { refetch(); refetchGlobal(); toast.success("Template copiado para sua biblioteca!"); } });

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formModality, setFormModality] = useState("");
  const [formExamTitle, setFormExamTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [search, setSearch] = useState("");
  const [openModalities, setOpenModalities] = useState<Record<string, boolean>>({});

  const resetForm = () => { setFormName(""); setFormModality(""); setFormExamTitle(""); setFormBody(""); };

  const openNew = () => { setEditingId(null); resetForm(); setShowForm(true); };

  const openEdit = (t: typeof myTemplates[0]) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormModality(t.modality || "");
    setFormExamTitle((t as any).exam_title || "");
    setFormBody(t.bodyTemplate);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formName.trim() || !formBody.trim()) { toast.error("Preencha nome e conteúdo"); return; }
    if (editingId) {
      updateTemplate.mutate({ id: editingId, name: formName.trim(), modality: formModality.trim() || undefined, exam_title: formExamTitle.trim() || undefined, bodyTemplate: formBody.trim() });
    } else {
      createTemplate.mutate({ name: formName.trim(), modality: formModality.trim() || undefined, exam_title: formExamTitle.trim() || undefined, bodyTemplate: formBody.trim() });
    }
  };

  const toggleModality = (k: string) => setOpenModalities(prev => ({ ...prev, [k]: !prev[k] }));

  // Filtro de busca sem acento
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const searchNorm = norm(search);
  const filteredTemplates = search
    ? myTemplates.filter(t => norm(t.name).includes(searchNorm) || norm(t.modality || '').includes(searchNorm) || norm((t as any).exam_title || '').includes(searchNorm))
    : [];

  // Agrupar por modalidade (usando campo modality)
  const MODALITY_KEYS: { key: string; label: string; icon: string; color: string }[] = [
    { key: 'rx', label: 'Radiografia (Raio-X)', icon: 'RX', color: '#f59e0b' },
    { key: 'tc', label: 'Tomografia (TC / CT)', icon: 'TC', color: '#3b82f6' },
    { key: 'us', label: 'Ultrassom (US)', icon: 'US', color: '#10b981' },
    { key: 'rm', label: 'Ressonância (RM / MRI)', icon: 'RM', color: '#8b5cf6' },
  ];

  // Mapeia o valor do select ("rx", "tc", "us", "rm") para o campo modality
  const getTemplatesForModality = (key: string) =>
    myTemplates.filter(t => {
      const m = norm(t.modality || '');
      return m === norm(key) || m.startsWith(norm(key) + ' ') || m.startsWith(norm(key) + '-');
    });

  const mappedIds = new Set(MODALITY_KEYS.flatMap(m => getTemplatesForModality(m.key).map(t => t.id)));
  const unmapped = myTemplates.filter(t => !mappedIds.has(t.id));

  const renderItem = (t: typeof myTemplates[0]) => (
    <div
      key={t.id}
      className="flex items-start gap-1 px-3 py-2 hover:bg-blue-50 group border-b border-gray-100 last:border-0"
      // FIX DnD: tornar o card de template arrastável
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/x-report-template', JSON.stringify({
          body:      t.bodyTemplate,
          examTitle: (t as any).exam_title || undefined,
        }));
        (e.currentTarget as HTMLDivElement).style.opacity = '0.5';
      }}
      onDragEnd={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
    >
      <button
        onClick={() => onApplyTemplate(t.bodyTemplate, (t as any).exam_title || undefined)}
        className="flex-1 text-left min-w-0"
      >
        <div className="text-xs font-medium text-gray-800 truncate">{t.name}</div>
        {(t as any).exam_title && (
          <div className="text-[10px] text-gray-400 truncate">{(t as any).exam_title}</div>
        )}
      </button>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
        <button
          onClick={() => openEdit(t)}
          className="text-blue-400 hover:text-blue-600"
          title="Editar"
        >
          <Edit2 className="h-3 w-3" />
        </button>
        <button
          onClick={() => { if (confirm('Excluir template "' + t.name + '"?')) deleteTemplate.mutate({ id: t.id }); }}
          className="text-red-400 hover:text-red-600"
          title="Excluir"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho */}
      <div className="p-3 border-b border-gray-200 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Meus Templates</p>
          <button onClick={openNew} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
            <Plus className="h-3.5 w-3.5" /> Novo
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar template..."
            className="w-full pl-6 pr-3 py-1.5 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Formulário criar/editar */}
      {showForm && (
        <div className="p-3 border-b border-gray-200 bg-blue-50/40 space-y-1.5">
          <p className="text-xs font-semibold text-gray-700">{editingId ? 'Editar Template' : 'Novo Template'}</p>
          <input
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="Nome do template *"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
          />
          <input
            value={formExamTitle}
            onChange={e => setFormExamTitle(e.target.value)}
            placeholder="Título do exame (ex: Radiografia de Tórax PA)"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
          />
          <select
            value={formModality}
            onChange={e => setFormModality(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
          >
            <option value="">Modalidade (opcional)</option>
            <option value="rx">Radiografia (RX)</option>
            <option value="tc">Tomografia (TC)</option>
            <option value="us">Ultrassom (US)</option>
            <option value="rm">Ressonância (RM)</option>
          </select>
          <textarea
            value={formBody}
            onChange={e => setFormBody(e.target.value)}
            placeholder="Conteúdo do laudo favorito..."
            rows={5}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white resize-none"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleSubmit}
              disabled={createTemplate.isPending || updateTemplate.isPending}
              className="flex-1 text-xs bg-blue-600 text-white rounded py-1.5 hover:bg-blue-700 disabled:opacity-60 font-medium"
            >
              {createTemplate.isPending || updateTemplate.isPending ? 'Salvando...' : (editingId ? 'Salvar Alterações' : 'Criar Template')}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}
              className="flex-1 text-xs border border-gray-200 rounded py-1.5 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {/* Resultados de busca */}
        {search && (
          <div className="p-2">
            {filteredTemplates.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">Nenhum resultado para "{search}"</p>
            ) : (
              <div className="border border-gray-200 rounded overflow-hidden">
                <div className="px-2 py-1.5 bg-blue-50 text-xs font-medium text-blue-700">
                  {filteredTemplates.length} resultado{filteredTemplates.length !== 1 ? 's' : ''}
                </div>
                {filteredTemplates.map(renderItem)}
              </div>
            )}
          </div>
        )}

        {/* Templates do Sistema */}
        {!search && globalTemplates.length > 0 && (
          <div className="p-2 pb-0">
            <div className="border border-blue-200 rounded overflow-hidden mb-2">
              <div className="px-3 py-2 bg-blue-50 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold bg-blue-500 text-white rounded px-1 py-0.5">SISTEMA</span>
                  <span className="text-xs font-semibold text-blue-700">Templates Padrão</span>
                </div>
                <span className="text-[10px] text-blue-500">{globalTemplates.length} templates</span>
              </div>
              {globalTemplates.map(t => (
                <div
                  key={t.id}
                  className="flex items-start gap-1 px-3 py-2 hover:bg-blue-50 group border-t border-blue-100"
                  // FIX DnD: tornar o card de template global arrastável
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('text/x-report-template', JSON.stringify({
                      body:      t.bodyTemplate,
                      examTitle: (t as any).exam_title || undefined,
                    }));
                    (e.currentTarget as HTMLDivElement).style.opacity = '0.5';
                  }}
                  onDragEnd={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
                >
                  <button
                    onClick={() => onApplyTemplate(t.bodyTemplate, (t as any).exam_title || undefined)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="text-xs font-medium text-gray-800 truncate">{t.name}</div>
                    {(t as any).exam_title && (
                      <div className="text-[10px] text-gray-400 truncate">{(t as any).exam_title}</div>
                    )}
                  </button>
                  <button
                    onClick={() => useAsBase.mutate({ id: t.id })}
                    className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-600 flex-shrink-0 mt-0.5"
                    title="Copiar para minha biblioteca"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Árvore por modalidade */}
        {!search && (
          <div className="p-2 space-y-1">
            {MODALITY_KEYS.map(mod => {
              const modTemplates = getTemplatesForModality(mod.key);
              const isOpen = openModalities[mod.key];
              return (
                <div key={mod.key} className="border border-gray-200 rounded overflow-hidden">
                  <button
                    onClick={() => toggleModality(mod.key)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-bold rounded px-1 py-0.5 leading-none text-white"
                        style={{ background: mod.color }}
                      >{mod.icon}</span>
                      <span className="text-xs font-semibold text-gray-700">{mod.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {modTemplates.length > 0 && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-medium">{modTemplates.length}</span>
                      )}
                      {isOpen ? <ChevronDown className="h-3 w-3 text-gray-500" /> : <ChevronRight className="h-3 w-3 text-gray-500" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="bg-white">
                      {modTemplates.length === 0 ? (
                        <p className="text-[11px] text-gray-400 px-4 py-2.5 italic">Nenhum template nesta modalidade</p>
                      ) : (
                        modTemplates.map(renderItem)
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Sem modalidade */}
            {unmapped.length > 0 && (
              <div className="border border-gray-200 rounded overflow-hidden">
                <button
                  onClick={() => toggleModality('__outros')}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  <span className="text-xs font-semibold text-gray-700">Outros</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-medium">{unmapped.length}</span>
                    {openModalities['__outros'] ? <ChevronDown className="h-3 w-3 text-gray-500" /> : <ChevronRight className="h-3 w-3 text-gray-500" />}
                  </div>
                </button>
                {openModalities['__outros'] && (
                  <div className="bg-white">{unmapped.map(renderItem)}</div>
                )}
              </div>
            )}

            {myTemplates.length === 0 && !showForm && (
              <div className="text-center py-8 px-3">
                <div className="text-gray-300 mb-2">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                </div>
                <p className="text-xs text-gray-400">Você ainda não tem templates.</p>
                <p className="text-xs text-gray-400">Clique em <strong>Novo</strong> para criar seu primeiro laudo favorito.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
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

  const suggested = currentExamTitle
    ? allTemplates.filter(t => {
        const mod   = (t.modality || "").toLowerCase();
        const title = (t.exam_title || t.name || "").toLowerCase();
        const dicomToLocal: Record<string, string> = { ct: "tc", mr: "rm", cr: "rx", dx: "rx", us: "us" };
        const localMod = dicomToLocal[currentModality.toLowerCase()] ?? currentModality.toLowerCase();
        return mod === localMod || title.includes(norm(currentExamTitle).split(" ")[0]);
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
          <div className="text-center py-8">
            <p className="text-xs text-gray-400">Nenhum modelo encontrado</p>
            {search && (
              <button onClick={() => setSearch("")} className="text-xs text-blue-500 mt-1 hover:underline">
                Limpar busca
              </button>
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
        <p className="text-xs text-gray-400 text-center py-4">Nenhum grupo criado</p>
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

// ─── Aba Conteúdo (Templates + Frases unificados) ────────────────────────────────────────────────────────────────────────────────
function ConteudoTab({
  onApplyTemplate,
  onInsert,
  onFocus,
}: {
  onApplyTemplate: (body: string, examTitle?: string) => void;
  onInsert: (text: string) => void;
  onFocus: () => void;
}) {
  const [openSection, setOpenSection] = useState<"templates" | "frases">("templates");

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-100 px-3 py-2 gap-1">
        <button
          onClick={() => setOpenSection("templates")}
          className={`flex-1 text-[11px] py-1.5 rounded-md font-medium transition-colors ${
            openSection === "templates" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Templates
        </button>
        <button
          onClick={() => setOpenSection("frases")}
          className={`flex-1 text-[11px] py-1.5 rounded-md font-medium transition-colors ${
            openSection === "frases" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Frases
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {openSection === "templates" && (
          <TemplatesTab onApplyTemplate={onApplyTemplate} />
        )}
        {openSection === "frases" && (
          <FrasesTab onInsert={onInsert} onFocus={onFocus} />
        )}
      </div>
    </div>
  );
}

// ─── Aba Imagens (ex-InserirTab) ────────────────────────────────────────────────────────────────────────────────
function ImagensTab({
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

      {/* Logo da Unidade — visível apenas para admin_master */}
      {unitLogoUrl && isAdmin && (
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
