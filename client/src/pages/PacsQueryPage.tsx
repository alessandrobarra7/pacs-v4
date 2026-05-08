import { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  Search, Eye, FileText, Printer,
  Clipboard, Settings, DollarSign,
  ChevronLeft, ChevronRight, Clock, Pencil, Check, X,
  Download, Loader2, CalendarDays,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { AnamnesisModal } from "@/components/AnamnesisModal";
import SlaCountdown, { type ReadinessData } from "@/components/SlaCountdown";
import { ExamPickerModal, ALL_CATALOG_EXAMS } from "@/components/ExamPickerModal";
import { canAccessAdmin, type UserRole } from "../../../shared/permissions";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// P1: converte URL de imagem para base64 — necessário para janela de print (popup about:blank)
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
    return null;
  }
}

const PAGE_SIZE = 20;
/** Converte data DICOM (YYYYMMDD) + hora (HHMMSS) em objeto Date */
function parseDicomDateTime(date: string, time?: string): Date | null {
  if (!date || date.length < 8) return null;
  const y = date.slice(0, 4), m = date.slice(4, 6), d = date.slice(6, 8);
  const h = time ? time.slice(0, 2) : '00';
  const mi = time ? time.slice(2, 4) : '00';
  const s = time ? time.slice(4, 6) : '00';
  return new Date(`${y}-${m}-${d}T${h}:${mi}:${s}`);
}

/** Retorna string relativa: "5d14h32m", "2h15m", "45m" */
function relativeTime(dt: Date | null): string {
  if (!dt) return '-';
  const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (diff < 0) return 'agora';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d${h}h${m}m`;
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

/** Formata data DICOM para exibição: DD/MM/YYYY */
function formatDate(dicomDate: string): string {
  if (!dicomDate || dicomDate.length < 8) return '-';
  return `${dicomDate.slice(6, 8)}/${dicomDate.slice(4, 6)}/${dicomDate.slice(0, 4)}`;
}

/** Calcula idade a partir de data de nascimento DICOM */
function calcAge(birthDate: string): string {
  if (!birthDate || birthDate.length < 8) return '';
  const birth = new Date(`${birthDate.slice(0, 4)}-${birthDate.slice(4, 6)}-${birthDate.slice(6, 8)}`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  if (age < 0 || age > 130) return '';
  if (age < 1) {
    const months = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 30));
    return `${months}M`;
  }
  return `${age}A`;
}

/** Normaliza sexo DICOM */
function formatSex(sex: string): string {
  if (!sex) return '';
  const s = sex.toUpperCase().trim();
  if (s === 'M') return 'M';
  if (s === 'F') return 'F';
  return sex;
}

/** Componente: Banner financeiro discreto para médicos e responsáveis */
function FinancialBanner({ unitId, userRole }: { unitId: number | null | undefined; userRole: string }) {
  const { data: info, isLoading, isError } = trpc.billing.getUnitFinancialInfo.useQuery(
    { unit_id: unitId! },
    { staleTime: 0, enabled: !!unitId }
  );

  const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  // ESTADO 1: Sem unidade selecionada
  if (!unitId) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-5 py-1.5 flex items-center gap-2 text-xs text-amber-700">
        <span>⚠</span>
        <span>Selecione uma unidade para visualizar seu resumo financeiro</span>
      </div>
    );
  }

  // ESTADO 2: Carregando
  if (isLoading) {
    return (
      <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-1.5 flex items-center gap-4 text-xs text-emerald-600 animate-pulse">
        <span className="font-semibold">Carregando resumo financeiro...</span>
        <span className="bg-emerald-200 rounded h-3 w-16 inline-block" />
        <span className="bg-emerald-200 rounded h-3 w-24 inline-block" />
        <span className="bg-emerald-200 rounded h-3 w-20 inline-block" />
      </div>
    );
  }

  // ESTADO 3: Erro ao carregar
  if (isError) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-5 py-1.5 flex items-center gap-2 text-xs text-red-600">
        <span>⚠</span>
        <span>Erro ao carregar dados financeiros. Tente recarregar a página.</span>
      </div>
    );
  }

  // ESTADO 4: Sem configuração de preço para esta unidade
  // (info existe mas price_per_report é null — não há preço configurado)
  if (!info || info.price_per_report === null) {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-5 py-1.5 flex items-center gap-2 text-xs text-blue-600">
        <span>ℹ</span>
        <span>Esta unidade ainda não possui configuração de preço para laudos. Contate o administrador.</span>
      </div>
    );
  }

  // ESTADO 5: Pronto para exibir
  // Preço sempre visível; saldo do ciclo zero se não houver ciclo aberto
  const amount = parseFloat(info.cycle_amount ?? '0');
  const visits = info.cycle_visits ?? 0;
  const endsAt = info.cycle_period?.ends_at;
  const hasOpenCycle = info.has_open_cycle ?? false;

  if (userRole === 'medico') {
    return (
      <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-1.5 flex items-center gap-4 text-xs text-emerald-800">
        <span className="font-semibold text-emerald-700">
          R$ {parseFloat(info.price_per_report).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/laudo
        </span>
        <span className="text-emerald-600">•</span>
        {hasOpenCycle ? (
          <>
            <span>Laudos no ciclo: <strong>{visits}</strong></span>
            <span>A receber: <strong className="text-emerald-700">{fmtBRL(amount)}</strong></span>
            {endsAt && (
              <span className="text-emerald-600">Fecha em: {new Date(endsAt).toLocaleDateString('pt-BR')}</span>
            )}
          </>
        ) : (
          <span className="text-emerald-600">Nenhum ciclo aberto nesta unidade — saldo: {fmtBRL(0)}</span>
        )}
      </div>
    );
  }

  // PASSO 7: Responsável financeiro vê resumo da unidade
  if (userRole === 'responsavel_financeiro') {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-5 py-1.5 flex items-center gap-4 text-xs text-blue-800">
        <span className="font-semibold text-blue-700">Unidade</span>
        <span className="text-blue-600">•</span>
        {hasOpenCycle ? (
          <>
            <span>Laudos no ciclo: <strong>{visits}</strong></span>
            <span>Total a pagar médicos: <strong className="text-blue-700">{fmtBRL(amount)}</strong></span>
            {endsAt && (
              <span className="text-blue-600">Fecha em: {new Date(endsAt).toLocaleDateString('pt-BR')}</span>
            )}
          </>
        ) : (
          <span className="text-blue-600">Nenhum ciclo aberto nesta unidade</span>
        )}
      </div>
    );
  }

  return null;
}

/** Ordena estudos do mais recente para o mais antigo */
function sortByDateDesc(studies: any[]): any[] {
  return [...studies].sort((a, b) => {
    const da = parseDicomDateTime(a.studyDate, a.studyTime);
    const db = parseDicomDateTime(b.studyDate, b.studyTime);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db.getTime() - da.getTime();
  });
}

// Lista de sugestões de exames radiológicos
const EXAM_SUGGESTIONS = [
  // Radiografia (RX)
  "RX TÓRAX PA E PERFIL", "RX TÓRAX PA", "RX ABDOME SIMPLES",
  "RX COLUNA CERVICAL AP E PERFIL", "RX COLUNA TORÁCICA AP E PERFIL",
  "RX COLUNA LOMBAR AP E PERFIL", "RX COLUNA LOMBOSSACRA AP E PERFIL",
  "RX PELVE AP", "RX BACIA AP", "RX CRÂNIO AP E PERFIL",
  "RX MÃO DIREITA", "RX MÃO ESQUERDA", "RX PÉ DIREITO", "RX PÉ ESQUERDO",
  "RX JOELHO DIREITO", "RX JOELHO ESQUERDO", "RX OMBRO DIREITO", "RX OMBRO ESQUERDO",
  "RX TORNOZELO DIREITO", "RX TORNOZELO ESQUERDO",
  "RX QUADRIL DIREITO", "RX QUADRIL ESQUERDO",
  "ESCANEOMETRIA DE MEMBROS INFERIORES", "RX PANORÂMICO COLUNA",
  // Tomografia (TC)
  "TC CRÂNIO SEM CONTRASTE", "TC CRÂNIO COM CONTRASTE",
  "TC TÓRAX SEM CONTRASTE", "TC TÓRAX COM CONTRASTE",
  "TC ABDOME TOTAL SEM CONTRASTE", "TC ABDOME TOTAL COM CONTRASTE",
  "TC PELVE SEM CONTRASTE", "TC PELVE COM CONTRASTE",
  "TC ABDOME E PELVE COM CONTRASTE", "TC COLUNA CERVICAL",
  "TC COLUNA TORÁCICA", "TC COLUNA LOMBAR", "TC SEIOS DA FACE",
  "TC PESCOÇO COM CONTRASTE", "TC TÓRAX E ABDOME COM CONTRASTE",
  "ANGIOTOMOGRAFIA DE TÓRAX", "ANGIOTOMOGRAFIA DE ABDOME",
  // Ressonância (RM)
  "RM CRÂNIO SEM CONTRASTE", "RM CRÂNIO COM CONTRASTE",
  "RM COLUNA CERVICAL", "RM COLUNA TORÁCICA", "RM COLUNA LOMBAR",
  "RM OMBRO DIREITO", "RM OMBRO ESQUERDO",
  "RM JOELHO DIREITO", "RM JOELHO ESQUERDO",
  "RM QUADRIL DIREITO", "RM QUADRIL ESQUERDO",
  "RM ABDOME", "RM PELVE", "RM MAMA BILATERAL",
  "RM TORNOZELO DIREITO", "RM TORNOZELO ESQUERDO",
  // Ultrassonografia (US)
  "US ABDOME TOTAL", "US ABDOME SUPERIOR", "US PÉLVICO",
  "US TRANSVAGINAL", "US MAMA BILATERAL", "US MAMA DIREITA", "US MAMA ESQUERDA",
  "US TIREOIDE", "US PESCOÇO", "US TESTICULAR", "US PRÓSTATA TRANSRETAL",
  "US OBSTÉTRICO", "US MORFOLÓGICO", "US DOPPLER VASCULAR",
  "US PARTES MOLES", "US ARTICULAR",
  // Mamografia
  "MAMOGRAFIA BILATERAL", "MAMOGRAFIA UNILATERAL DIREITA", "MAMOGRAFIA UNILATERAL ESQUERDA",
  // Densitometria
  "DENSITOMETRIA ÓSSEA COLUNA E FÊMUR",
];

/** Ícone SVG representando a região anatômica detectada no texto do exame */
function AnatomicIcon({ label, className = '' }: { label: string; className?: string }) {
  const t = label.toUpperCase();
  if (/T[ÓO]RAX|PULM[ÃA]O|PULMAO|PLEURA|BR[ÔO]NQUIO|BRONQUIO|TRAQUEIA|TR[ÁA]QUEIA/.test(t)) {
    // Pulmão / Tórax
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v5" />
        <path d="M9 8C7 8 4 9.5 4 13c0 3 1.5 5 3.5 6 1.5.7 2.5 0 2.5-2V9" />
        <path d="M15 8c2 0 5 1.5 5 5 0 3-1.5 5-3.5 6-1.5.7-2.5 0-2.5-2V9" />
      </svg>
    );
  }
  if (/CR[ÂA]NIO|CRANIO|C[ÉE]REBRO|CEREBRO|SEIOS DA FACE|SEIO|MASTOID|SELA TURCICA|HIPOFISE|HIP[ÓO]FISE|ORBITA|[ÓO]RBITA/.test(t)) {
    // Crânio / Cabeça
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a7 7 0 0 1 7 7c0 3.2-1.8 5.8-4.5 6.8V19a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-2.2C6.8 15.8 5 13.2 5 10a7 7 0 0 1 7-7z" />
        <line x1="9" y1="20" x2="15" y2="20" />
      </svg>
    );
  }
  if (/COLUNA|V[ÉE]RTEBRA|VERTEBRA|LOMBAR|CERVICAL|TOR[ÁA]CICA|TORACICA|SACRO|C[ÓO]CCIX|COCCIX|DISCO/.test(t)) {
    // Coluna vertebral
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="3.5" rx="1" />
        <rect x="9" y="7.5" width="6" height="3.5" rx="1" />
        <rect x="9" y="13" width="6" height="3.5" rx="1" />
        <rect x="9" y="18.5" width="6" height="3.5" rx="1" />
        <line x1="12" y1="5.5" x2="12" y2="7.5" />
        <line x1="12" y1="11" x2="12" y2="13" />
        <line x1="12" y1="16.5" x2="12" y2="18.5" />
      </svg>
    );
  }
  if (/ABDOME|ABD[ÔO]MEN|ABDOMEN|F[ÍI]GADO|FIGADO|RIM|RINS|PELVE|BEXIGA|[ÚU]TERO|UTERO|OV[ÁA]RIO|OVARIO|P[ÂA]NCREAS|PANCREAS|BA[ÇC]O|BACO|VES[ÍI]CULA|VESICULA/.test(t)) {
    // Abdome / órgãos abdominais
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="13" rx="7" ry="8" />
        <path d="M8 8.5c1.2-2 6.8-2 8 0" />
        <path d="M9.5 13c0 2 1 3.5 2.5 3.5s2.5-1.5 2.5-3.5" />
      </svg>
    );
  }
  if (/CORA[ÇC][ÃA]O|CORACAO|CARD[ÍI]ACO|CARDIACO|AORTA|CORON[ÁA]RIA|CORONARIA/.test(t)) {
    // Coração
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21C12 21 4 14 4 8.5a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 8.5C20 14 12 21 12 21z" />
      </svg>
    );
  }
  if (/OMBRO|COTOVELO|PUNHO|M[ÃA]O|MAO|[ÚU]MERO|UMERO|R[ÁA]DIO|RADIO|ULNA|CARPO|METACARPO|FALANGES|MEMBRO SUPERIOR|BRACO|BRA[ÇC]O/.test(t)) {
    // Membro superior
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 4c0 0 .5 4 .5 8S9 20 9 20" />
        <path d="M15 4c0 0-.5 4-.5 8s.5 8 .5 8" />
        <path d="M9 12h6" />
        <path d="M7 20c1.5 1.5 9.5 1.5 10 0" />
      </svg>
    );
  }
  if (/QUADRIL|JOELHO|TORNOZELO|P[ÉE]|PE |F[ÊE]MUR|FEMUR|T[ÍI]BIA|TIBIA|F[ÍI]BULA|FIBULA|MEMBRO INFERIOR|PERNA|COXA/.test(t)) {
    // Membro inferior
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 3v8l-2.5 10" />
        <path d="M14 3v8l2.5 10" />
        <path d="M7.5 21h9" />
        <path d="M10 11h4" />
      </svg>
    );
  }
  if (/MAMA|MAMOGRAFIA|MAMOGR/.test(t)) {
    // Mama
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 14c0-4.5 3-8 7-8s7 3.5 7 8c0 3.5-2.5 6-7 6S5 17.5 5 14z" />
      </svg>
    );
  }
  if (/PESCO[ÇC]O|PESCOCO|TIREOIDE|TIR[ÓO]I|LARINGE|FARINGE/.test(t)) {
    // Pescoço / Tireoide
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 3h4v4a2 2 0 0 1-4 0V3z" />
        <path d="M8 7c-1.5 1-2.5 3-2.5 5h13C18.5 10 17.5 8 16 7" />
        <path d="M8 12v6h8v-6" />
      </svg>
    );
  }
  // Ícone genérico (imagem médica / raio-x)
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

// Componente para edição do nome do exame via modal de seleção múltipla
function EditableExamName({
  value, studyUid, rawDescription, dbOverride, dbExamCount, onSaved, canEdit, unitId
}: {
  value: string;
  studyUid: string;
  rawDescription?: string;
  dbOverride?: string | null;
  dbExamCount?: number | null;
  onSaved?: () => void;
  canEdit?: boolean;
  unitId?: number;  // V14-P2 FIX: unidade selecionada na tela
}) {
  const storageKey = `exam_label_${studyUid}`;
  // Prioridade: banco > localStorage > PACS
  const [label, setLabel] = useState(() =>
    dbOverride || localStorage.getItem(storageKey) || value || 'Sem descrição'
  );
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveMutation = trpc.studyMetadata.save.useMutation();

  // Sincroniza quando o banco retorna um override atualizado
  useEffect(() => {
    if (dbOverride) setLabel(dbOverride);
  }, [dbOverride]);

  // Converte o label atual em array de exames para pré-selecionar no modal
  const currentExams = label && label !== 'Sem descrição'
    ? label.split(' + ').map(e => e.trim()).filter(Boolean)
    : [];

  const handlePickerConfirm = async (exams: string[], examCount: number) => {
    const composed = exams.join(' + ');
    setLabel(composed);
    localStorage.setItem(storageKey, composed);
    setShowPicker(false);
    if (studyUid && studyUid.length > 5) {
      setSaving(true);
      try {
        await saveMutation.mutateAsync({
          studyInstanceUid: studyUid,
          unit_id: unitId,  // V14-P2 FIX: enviar unidade selecionada
          descriptionOverride: composed,
          examCount,
        });
        onSaved?.();
      } catch {
        toast.error('Erro ao salvar descrição no banco');
      } finally {
        setSaving(false);
      }
    }
  };

  const isEdited = !!dbOverride;
  return (
    <>
      <div className="flex items-center gap-2">
        {/* Ícone anatômico — clicável (técnico) ou apenas visual (outros perfis) */}
        {canEdit !== false ? (
          <button
            onClick={() => setShowPicker(true)}
            title="Clique para selecionar / alterar exames"
            className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
              isEdited
                ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200'
                : 'bg-blue-50 text-blue-500 hover:bg-blue-100 border border-blue-100'
            }`}
          >
            <AnatomicIcon label={label} className="w-4 h-4" />
          </button>
        ) : (
          <span className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-gray-50 text-gray-400 border border-gray-100">
            <AnatomicIcon label={label} className="w-4 h-4" />
          </span>
        )}
        {/* Nome do exame */}
        <div className="flex flex-col min-w-0">
          <span className={`text-sm leading-tight ${isEdited ? 'text-amber-700 font-medium' : 'text-gray-800'}`}>{label}</span>
          {saving && <Loader2 className="h-3 w-3 animate-spin text-gray-400 mt-0.5" />}
        </div>
      </div>
      {showPicker && (
        <ExamPickerModal
          initialExams={currentExams}
          onConfirm={handlePickerConfirm}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}

export function PacsQueryPage() {
  const [, navigate] = useLocation();
  const trpcUtils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();

  const userRole = (user?.role || 'viewer') as UserRole;
  const isAdmin = canAccessAdmin(userRole);
  const isAdminMaster = user?.role === 'admin_master';

  // Persistir unidade selecionada no localStorage para manter a seleção ao navegar entre páginas
  const SELECTED_UNIT_KEY = 'pacs_selected_unit_id';
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(() => {
    const saved = localStorage.getItem(SELECTED_UNIT_KEY);
    return saved ? parseInt(saved, 10) : null;
  });
  // Carregar unidades acessíveis pelo usuário (admin_master vê todas, outros vêem apenas as que têm permissão)
  const { data: allUnits = [] } = trpc.units.list.useQuery(undefined, { enabled: !!user });
  // Pode selecionar unidade: admin, unit_admin, ou qualquer usuário com acesso a múltiplas unidades
  const canSelectUnit = isAdminMaster || user?.role === 'unit_admin' || allUnits.length > 1;

  // Para usuários com múltiplas unidades (via permissões), usa selectedUnitId; caso contrário usa unit_id legado
  const effectiveUnitId = canSelectUnit
    ? selectedUnitId
    : (user?.unit_id || (allUnits.length > 0 ? allUnits[0].id : null));

  // V13-P3 FIX: Buscar permissões granulares da unidade selecionada
  // Todas as decisões de UI devem usar estas variáveis, não o role global
  const { data: myPerms } = trpc.units.myPermissions.useQuery(
    { unitId: effectiveUnitId || 0 },
    { enabled: !!effectiveUnitId && !!user }
  );
  // Permissões granulares por unidade selecionada — admin_master sempre tem tudo
  const canViewStudies = isAdminMaster ? true : (myPerms?.view_studies ?? false);
  const canViewer = canViewStudies;
  const canLaudo = isAdminMaster ? true : (myPerms?.edit_reports ?? false);
  const canViewAnamnesis = isAdminMaster ? true : (myPerms?.view_anamnesis ?? false);
  const canEditAnamnesis = isAdminMaster ? true : (myPerms?.edit_anamnesis ?? false);
  const canEditExamLegend = isAdminMaster ? true : (myPerms?.edit_exam_legend ?? false);
  const canPrint = isAdminMaster ? true : (myPerms?.print_reports ?? false);
  // canCID: alias de compatibilidade — editar anamnese requer edit_anamnesis
  const canCID = canEditAnamnesis;

  const { data: unitData } = trpc.units.getById.useQuery(
    { id: effectiveUnitId || 0 },
    { enabled: !!effectiveUnitId }
  );

  // Layout da unidade para impressão de laudos
  const { data: unitLayout } = trpc.layouts.getByUnit.useQuery(
    { unitId: effectiveUnitId || 0 },
    { enabled: !!effectiveUnitId }
  );

  // Wrapper que persiste a troca de unidade no localStorage
  const handleSelectUnit = (unitId: number) => {
    setSelectedUnitId(unitId);
    localStorage.setItem(SELECTED_UNIT_KEY, String(unitId));
  };

  useEffect(() => {
    if (allUnits.length > 0) {
      if (selectedUnitId === null) {
        // Primeira visita: selecionar a primeira unidade e persistir
        const firstId = allUnits[0].id;
        setSelectedUnitId(firstId);
        localStorage.setItem(SELECTED_UNIT_KEY, String(firstId));
      } else {
        // Verificar se a unidade salva ainda existe (pode ter sido deletada ou permissão removida)
        const exists = allUnits.some(u => u.id === selectedUnitId);
        if (!exists) {
          const firstId = allUnits[0].id;
          setSelectedUnitId(firstId);
          localStorage.setItem(SELECTED_UNIT_KEY, String(firstId));
        }
      }
    }
  }, [allUnits, selectedUnitId]);

  const unitName = unitData?.name || (effectiveUnitId ? 'Carregando...' : 'Sem unidade');
  const cacheKey = `pacs_query_results_unit_${effectiveUnitId || 'none'}`;

  const [filters, setFilters] = useState({ patientName: "", studyDate: "", period: "today" });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [queryResults, setQueryResults] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem(cacheKey) || '[]'); } catch { return []; }
  });
  const [isQuerying, setIsQuerying] = useState(false);
  const [isAnamnesisModalOpen, setIsAnamnesisModalOpen] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [reportStatusMap, setReportStatusMap] = useState<Record<string, string>>({});

  // Pré-download automático: configuração por unidade
  const autoDownloadKey = `pacs_auto_download_unit_${effectiveUnitId || 'none'}`;
  const [autoDownloadEnabled, setAutoDownloadEnabled] = useState<boolean>(() => {
    return localStorage.getItem(autoDownloadKey) === 'true';
  });

  const toggleAutoDownload = () => {
    const next = !autoDownloadEnabled;
    setAutoDownloadEnabled(next);
    localStorage.setItem(autoDownloadKey, String(next));
    toast.success(next ? 'Pré-download automático ativado' : 'Pré-download automático desativado');
  };

  // Pré-download: mapa de studyUid → { phase, received, total }
  const [preDownloadMap, setPreDownloadMap] = useState<Record<string, {
    phase: 'idle' | 'connecting' | 'downloading' | 'done' | 'error';
    received: number;
    total: number;
    error?: string;
  }>>({});

  // Ao montar ou ao mudar a lista de estudos, verifica quais já estão em cache no servidor
  // Isso garante que o botão verde persiste ao voltar do viewer
  useEffect(() => {
    if (queryResults.length === 0) return;
    const uids = queryResults.map((s: any) => s.studyInstanceUid).filter(Boolean);
    if (uids.length === 0) return;
    // Verifica em paralelo (sem bloquear a UI)
    Promise.all(
      uids.map(async (uid: string) => {
        try {
          const res = await fetch(`/api/dicom-cache-status/${uid}`);
          if (!res.ok) return null;
          const data = await res.json();
          return { uid, cached: data.cached, count: data.count };
        } catch {
          return null;
        }
      })
    ).then((results) => {
      const updates: Record<string, any> = {};
      const toAutoDownload: string[] = [];
      for (const r of results) {
        if (!r) continue;
        if (r.cached) {
          updates[r.uid] = { phase: 'done', received: r.count, total: r.count };
        } else {
          toAutoDownload.push(r.uid);
        }
      }
      if (Object.keys(updates).length > 0) {
        setPreDownloadMap(prev => ({ ...prev, ...updates }));
      }
      // Pré-download automático: inicia download dos que não estão em cache
      if (autoDownloadEnabled && toAutoDownload.length > 0) {
        const studiesNotCached = queryResults.filter((s: any) =>
          toAutoDownload.includes(s.studyInstanceUid)
        );
        // Dispara com delay de 500ms entre cada para não sobrecarregar
        studiesNotCached.forEach((study: any, i: number) => {
          setTimeout(() => handlePreDownload(study), i * 800);
        });
      }
    });
  }, [queryResults, autoDownloadEnabled]);

  const handlePreDownload = (study: any) => {
    const uid = study.studyInstanceUid;
    if (!uid) { toast.error('UID do estudo não disponível'); return; }
    const current = preDownloadMap[uid];
    if (current && (current.phase === 'connecting' || current.phase === 'downloading')) return; // já em andamento

    setPreDownloadMap(prev => ({ ...prev, [uid]: { phase: 'connecting', received: 0, total: 0 } }));
    toast.info('Iniciando pré-download das imagens...', { description: study.patientName?.replace(/\^/g, ' ') || '' });

    const unitParam = effectiveUnitId ? `?unitId=${effectiveUnitId}` : '';
    const sse = new EventSource(`/api/dicom-stream/${uid}${unitParam}`);

    // Timeout de segurança: se após 5 minutos ainda não concluiu, marca como erro
    const safetyTimeout = setTimeout(() => {
      sse.close();
      setPreDownloadMap(prev => {
        const cur = prev[uid];
        if (cur && (cur.phase === 'connecting' || cur.phase === 'downloading')) {
          toast.error('Timeout no download', { description: 'O download demorou mais de 5 minutos.' });
          return { ...prev, [uid]: { phase: 'error', received: cur.received, total: cur.total, error: 'Timeout' } };
        }
        return prev;
      });
    }, 5 * 60 * 1000);

    // Limpa o timeout quando o SSE fechar
    const cleanupSSE = () => clearTimeout(safetyTimeout);
    sse.addEventListener('complete', () => cleanupSSE(), { once: true });

    sse.addEventListener('status', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.phase === 'downloading' || data.phase === 'cached') {
          setPreDownloadMap(prev => ({
            ...prev,
            [uid]: { phase: 'downloading', received: 0, total: data.total || 0 },
          }));
        }
      } catch {}
    });

    sse.addEventListener('file', (e) => {
      try {
        const data = JSON.parse(e.data);
        setPreDownloadMap(prev => {
          const cur = prev[uid] || { phase: 'downloading', received: 0, total: 0 };
          return {
            ...prev,
            [uid]: {
              phase: 'downloading',
              received: (cur.received || 0) + 1,
              total: data.total || cur.total || 0,
            },
          };
        });
      } catch {}
    });

    sse.addEventListener('complete', (e) => {
      cleanupSSE();
      try {
        const data = JSON.parse(e.data);
        setPreDownloadMap(prev => ({ ...prev, [uid]: { phase: 'done', received: data.total, total: data.total } }));
        toast.success(`Download concluído: ${data.total} imagem(ns)`, {
          description: 'Clique em Visualizar para abrir o viewer instantaneamente.',
          action: { label: 'Visualizar', onClick: () => handleVisualize(study) },
        });
      } catch {}
      sse.close();
    });

    sse.addEventListener('error', (e) => {
      const msgData = (e as MessageEvent).data;
      if (msgData) {
        // Evento customizado 'error' com dados JSON do servidor
        cleanupSSE();
        try {
          const data = JSON.parse(msgData);
          setPreDownloadMap(prev => ({ ...prev, [uid]: { phase: 'error', received: 0, total: 0, error: data.message } }));
          toast.error('Erro no pré-download', { description: data.message || 'Erro desconhecido' });
        } catch {
          setPreDownloadMap(prev => ({ ...prev, [uid]: { phase: 'error', received: 0, total: 0, error: 'Erro no download' } }));
          toast.error('Erro no pré-download');
        }
        sse.close();
      } else {
        // Evento nativo do EventSource (reconexão ou fechamento de conexão)
        // Fecha o SSE para evitar reconexão automática
        sse.close();
        // Se ainda está em estado de connecting/downloading, marca como erro
        setPreDownloadMap(prev => {
          const cur = prev[uid];
          if (cur && (cur.phase === 'connecting' || cur.phase === 'downloading')) {
            return { ...prev, [uid]: { phase: 'error', received: cur.received, total: cur.total, error: 'Conexão interrompida' } };
          }
          return prev; // não sobrescreve se já está done ou error
        });
      }
    });
  };

  useEffect(() => {
    try { setQueryResults(JSON.parse(localStorage.getItem(cacheKey) || '[]')); } catch { setQueryResults([]); }
    setCurrentPage(1);
    // BUG-4 FIX: troca de unidade dispara nova busca automática
    if (effectiveUnitId) {
      handlePeriodChange('today');
    }
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // BUG-3 FIX: auto-busca ao montar a tela — evita exibir dados stale do localStorage
  useEffect(() => {
    if (effectiveUnitId) {
      handlePeriodChange('today');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (queryResults.length > 0) localStorage.setItem(cacheKey, JSON.stringify(queryResults));
  }, [queryResults, cacheKey]);

  // Ordenar por data mais recente primeiro
  const sortedResults = useMemo(() => sortByDateDesc(queryResults), [queryResults]);

  // Bug fix A1: filtro local de 7 dias removido — o servidor já resolve 'LAST_7_DAYS' corretamente.
  // Antes: enviava 'LAST_30_DAYS' e filtrava localmente, causando divergência entre toast e tela.
  const filteredResults = useMemo(() => sortedResults, [sortedResults]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const pagedResults = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredResults.slice(start, start + PAGE_SIZE);
  }, [filteredResults, currentPage]);

  // Busca status real dos laudos
  const studyUids = useMemo(() => queryResults.map(s => s.studyInstanceUid).filter(Boolean), [queryResults]);
  const { data: statusData, refetch: refetchStatus } = trpc.reports.statusByStudyUids.useQuery(
    { studyUids },
    { 
      enabled: studyUids.length > 0,
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchInterval: 30_000, // atualiza a cada 30s
    }
  );
  useEffect(() => {
    if (statusData) setReportStatusMap(statusData);
  }, [statusData]);

  // Busca metadados editados pelo técnico para todos os estudos da página
  // V14-P2 FIX: enviar effectiveUnitId para garantir metadados da unidade selecionada
  const { data: metadataBatch, refetch: refetchMetadata } = trpc.studyMetadata.getBatch.useQuery(
    { studyInstanceUids: studyUids, unit_id: effectiveUnitId ?? undefined },
    { enabled: studyUids.length > 0 && !!effectiveUnitId }
  );
  // Mapa de studyUid → metadados editados (compartilhado por toda a unidade)
  const metadataMap = useMemo(() => {
    if (!metadataBatch) return {} as Record<string, any>;
    return Object.fromEntries((metadataBatch as any[]).map((m: any) => [m.study_instance_uid, m]));
  }, [metadataBatch]);

  // Mapa de has_anamnesis independente de study_metadata (funciona mesmo sem linha de metadados)
  const { data: anamnesisStatusData, refetch: refetchAnamnesisStatus } = trpc.anamnesisSimple.getStatusBatch.useQuery(
    { studyInstanceUids: studyUids },
    { enabled: studyUids.length > 0 }
  );
  const anamnesisStatusMap = useMemo(() => anamnesisStatusData ?? {} as Record<string, boolean>, [anamnesisStatusData]);

  // Batch SLA readiness para todos os estudos da página atual
  const { data: slaReadinessData, refetch: refetchSlaReadiness } = trpc.sla.getBatchStatus.useQuery(
    { studyInstanceUids: studyUids, unitId: effectiveUnitId ?? 0 },
    { enabled: studyUids.length > 0 && !!effectiveUnitId, staleTime: 30_000, refetchInterval: 60_000 }
  );
  const slaReadinessMap = useMemo(() => slaReadinessData ?? {} as Record<string, ReadinessData>, [slaReadinessData]);

  // logout handled by AppHeader

  // Bug fix A2: estado para controlar exibição do toast após filtros serem aplicados
  const [pendingToastCount, setPendingToastCount] = useState<number | null>(null);
  const [pendingToastType, setPendingToastType] = useState<'success' | 'warning' | 'timeout'>('success');

  // Bug fix A2: toast disparado após filteredResults ser calculado (fonte única de contagem)
  useEffect(() => {
    if (pendingToastCount === null) return;
    if (pendingToastType === 'timeout') {
      toast.warning(`Busca interrompida por tempo limite. ${pendingToastCount} estudo${pendingToastCount !== 1 ? 's' : ''} exibido${pendingToastCount !== 1 ? 's' : ''} — resultado pode estar incompleto.`);
    } else if (pendingToastType === 'warning') {
      toast.warning(`Exibindo os primeiros ${pendingToastCount} estudo${pendingToastCount !== 1 ? 's' : ''}. Refine a busca para ver mais resultados.`);
    } else {
      toast.success(`${pendingToastCount} estudo${pendingToastCount !== 1 ? 's' : ''} encontrado${pendingToastCount !== 1 ? 's' : ''}`);
    }
    setPendingToastCount(null);
  }, [filteredResults, pendingToastCount, pendingToastType]);

  const queryPacs = trpc.pacs.query.useMutation({
    onSuccess: (data: any) => {
      setQueryResults(data.studies || []);
      setCurrentPage(1);
      // Bug fix A2: não usar data.studies.length (bruto) — aguardar filteredResults via useEffect
      const type = data.timedOut ? 'timeout' : data.truncated ? 'warning' : 'success';
      setPendingToastType(type);
      setPendingToastCount(data.studies?.length || 0);
      setIsQuerying(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao consultar PACS");
      setIsQuerying(false);
    },
  });

  const runQuery = (overrides: Partial<typeof filters> = {}) => {
    const f = { ...filters, ...overrides };
    setIsQuerying(true);
    let studyDate = f.studyDate;
    // BUG-6 FIX: datas do calendário têm formato yyyy-MM-dd (10 chars), não 8
    if (studyDate && studyDate.includes('-') && studyDate.length === 10) {
      studyDate = studyDate.replace(/-/g, '');
    }
    queryPacs.mutate({
      patientName: f.patientName,
      patientId: "",
      modality: "",
      studyDate,
      accessionNumber: "",
      unit_id: effectiveUnitId || undefined,
    });
  };

  const handlePeriodChange = (period: string) => {
    setSelectedDate(undefined);
    let studyDate = '';
    if (period === 'today') studyDate = 'TODAY';
    // BUG-5 FIX: usar token YESTERDAY resolvido no servidor (TZ correto)
    else if (period === 'yesterday') studyDate = 'YESTERDAY';
    else if (period === 'all') studyDate = '';
    setFilters(f => ({ ...f, period, studyDate }));
    runQuery({ period, studyDate });
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setCalendarOpen(false);
    if (!date) {
      // Limpar: volta para Hoje
      handlePeriodChange('today');
      return;
    }
    const studyDate = format(date, 'yyyyMMdd');
    setFilters(f => ({ ...f, period: 'custom', studyDate }));
    runQuery({ period: 'custom', studyDate });
  };

  const handleLast7Days = () => {
    // Bug fix A1: enviar 'LAST_7_DAYS' diretamente ao servidor (que já resolve o período correto).
    // Antes: enviava 'LAST_30_DAYS' e filtrava localmente, causando divergência entre toast e tela.
    setSelectedDate(undefined);
    setFilters(f => ({ ...f, period: 'last7days' }));
    setIsQuerying(true);
    queryPacs.mutate({
      patientName: filters.patientName,
      patientId: "",
      modality: "",
      studyDate: 'LAST_7_DAYS',
      accessionNumber: "",
      unit_id: effectiveUnitId || undefined,
    });
  };



  const handleVisualize = async (study: any) => {
    if (!study.studyInstanceUid) { toast.error('UID do estudo não disponível'); return; }
    const unitParam = effectiveUnitId ? `?unitId=${effectiveUnitId}` : '';
    const uid = study.studyInstanceUid;
    // Se já está em cache (botão verde), abre instantaneamente
    const pd = preDownloadMap[uid];
    if (pd && pd.phase === 'done') {
      navigate(`/dicom-viewer/${uid}${unitParam}`);
      return;
    }
    // Verifica no servidor se já há cache (caso o estado local não saiba)
    try {
      const res = await fetch(`/api/dicom-cache-status/${uid}`);
      if (res.ok) {
        const data = await res.json();
        if (data.cached && data.count > 0) {
          // Atualiza estado local e abre instantaneamente
          setPreDownloadMap(prev => ({ ...prev, [uid]: { phase: 'done', received: data.count, total: data.count } }));
          navigate(`/dicom-viewer/${uid}${unitParam}`);
          return;
        }
      }
    } catch {}
    // Sem cache: abre o viewer normalmente (fará C-GET interno)
    navigate(`/dicom-viewer/${uid}${unitParam}`);
  };

  const handleReport = (study: any) => {
    // Busca o exam_count do metadado em memória para passar ao editor de laudos
    const meta = metadataMap?.[study.studyInstanceUid];
    const examCount = meta?.exam_count ?? 1;
    // Monta o label composto (banco > localStorage > PACS)
    const examLabel = meta?.description_override
      || localStorage.getItem(`exam_label_${study.studyInstanceUid}`)
      || study.studyDescription
      || 'Sem descrição';
    // Decompoe em array de exames individuais
    const examNames = examLabel.split(' + ').map((e: string) => e.trim()).filter(Boolean);
    sessionStorage.setItem(`study_${study.studyInstanceUid}`, JSON.stringify({
      patientName: study.patientName || '',
      patientID: study.patientID || '',
      patientBirthDate: study.patientBirthDate || '',
      patientSex: study.patientSex || '',
      studyDate: study.studyDate || '',
      studyTime: study.studyTime || '',
      modality: study.modality || '',
      studyDescription: examLabel,
      accessionNumber: study.accessionNumber || '',
      numberOfInstances: study.numberOfInstances || 0,
      unitName: unitName,
      unitId: effectiveUnitId ? Number(effectiveUnitId) : null,
      examCount,
      examNames,
    }));
    navigate(`/reports/create/${study.studyInstanceUid}`);
  };

  const handlePrintReport = async (study: any) => {
    if (!study.studyInstanceUid) { toast.error('UID do estudo não disponível'); return; }
    const storedStudy = sessionStorage.getItem(`study_${study.studyInstanceUid}`);
    const studyData = storedStudy ? JSON.parse(storedStudy) : study;
    const patientName = (studyData.patientName || study.patientName || 'Não informado').replace(/\^/g, ' ').trim();
    const examLabel = localStorage.getItem(`exam_label_${study.studyInstanceUid}`) || study.studyDescription || 'Sem descrição';
    const studyDate = study.studyDate ? `${study.studyDate.slice(6,8)}/${study.studyDate.slice(4,6)}/${study.studyDate.slice(0,4)}` : '-';
    // Data de nascimento formatada
    const birthDateRaw = studyData.patientBirthDate || study.patientBirthDate || '';
    const birthDateFormatted = birthDateRaw.length >= 8
      ? `${birthDateRaw.slice(6,8)}/${birthDateRaw.slice(4,6)}/${birthDateRaw.slice(0,4)}`
      : '';
    const sex = formatSex(studyData.patientSex || study.patientSex || '');
    const logoUrl = unitData?.logo_url || '';

    // Buscar laudo + dados do médico via tRPC antes de abrir a janela
    toast.loading('Carregando laudo para impressão...', { id: 'print-loading' });
    let reportBody = '';
    let reportTitle = examLabel;
    let doctorName = '';
    let doctorCrm = '';
    let doctorStampUrl: string | null = null;
    let doctorSignatureUrl: string | null = null;
    let reportStatus = '';
    let signedAt: Date | null = null;
    try {
      const result = await trpcUtils.reports.getByStudyUidWithDoctor.fetch({ studyInstanceUid: study.studyInstanceUid });
      reportBody = result?.body || '';
      reportTitle = examLabel;
      doctorName = result?.doctorName || '';
      doctorCrm = result?.doctorCrm || '';
      doctorStampUrl = result?.doctorStampUrl || null;
      doctorSignatureUrl = result?.doctorSignatureUrl || null;
      reportStatus = result?.status || '';
      signedAt = result?.signedAt ? new Date(result.signedAt) : null;
    } catch (e) {
      // laudo não encontrado — imprime com mensagem
    }
    toast.dismiss('print-loading');

    // ── Layout da unidade ──
    const lPrefs = (unitLayout?.preferences as any) || {};
    // P8: mapeamento de fontes com fallback seguro
    const SAFE_FONTS_Q: Record<string, string> = {
      'Arial':           'Arial, Helvetica, sans-serif',
      'Calibri':         'Calibri, "Gill Sans", sans-serif',
      'Times New Roman': '"Times New Roman", Times, serif',
      'Georgia':         'Georgia, "Times New Roman", serif',
      'Helvetica':       '"Helvetica Neue", Helvetica, Arial, sans-serif',
      'Verdana':         'Verdana, Geneva, sans-serif',
    };
    const rawFontQ = lPrefs.fontFamily || 'Arial';
    const fontStackQ = SAFE_FONTS_Q[rawFontQ] ?? `${rawFontQ}, Arial, sans-serif`;
    const lSize = lPrefs.fontSize || 11;
    const lLine = lPrefs.lineHeight || 1.6;
    const lMT = lPrefs.marginTop ?? 20;
    // P5: reservar margem inferior para o rodapé
    const toAbsUrl = (u: string) => u && u.startsWith('/') ? `${window.location.origin}${u}` : u;
    const lFooterUrl = toAbsUrl((unitLayout as any)?.footer_image_url || '');
    const footerReservedMmQ = lFooterUrl ? 30 : 0;
    const lMB = (lPrefs.marginBottom ?? 20) + footerReservedMmQ;
    const lML = lPrefs.marginLeft ?? 20;
    const lMR = lPrefs.marginRight ?? 20;
    const lBorderColor = lPrefs.headerBorderColor || '#d0d0d0';
    const lBgUrl = toAbsUrl((unitLayout as any)?.background_image_url || '');
    const pageSizeQ = lPrefs.pageSize ?? 'A4';
    // P1: background via position:fixed (browsers ignoram background dentro de @page)
    const bgBase64Q = lBgUrl ? await fetchToBase64(lBgUrl) : null;
    const bgLayerQ = bgBase64Q ? `
      <div style="position:fixed;top:0;left:0;width:100%;height:100%;
                  background:url('${bgBase64Q}')center/cover no-repeat;
                  z-index:-1;pointer-events:none;
                  -webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>
    ` : '';
    const lLogos: Array<{url:string;width:number;height:number}> = (unitLayout as any)?.logos || [];
    // Logos HTML: até 3 logos lado a lado
    const logosHtml = lLogos.filter((l: any) => l.url).length > 0
      ? lLogos.filter((l: any) => l.url).map((l: any) => `<img src="${l.url}" alt="Logo" style="max-height:${l.height||60}px;max-width:${l.width||180}px;object-fit:contain;margin-right:6px;" />`).join('')
      : (logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height:60px;max-width:180px;object-fit:contain;" />` : `<p style="font-size:9pt;color:#888;">Logo da unidade</p>`);
    const logoHtml = logosHtml;

    // P7: converter imagens para base64
    const convertImgsQ = async (html: string): Promise<string> => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const imgs = doc.querySelectorAll('img');
      await Promise.all(Array.from(imgs).map(async (img) => {
        try {
          const res = await fetch(img.src, { credentials: 'include' });
          const blob = await res.blob();
          const b64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          img.src = b64;
        } catch { /* manter URL original se falhar */ }
      }));
      return doc.body.innerHTML;
    };

    // P1: detectar multi-seção e renderizar corretamente
    let bodyHtml = reportBody || '(Laudo não encontrado ou ainda não elaborado)';
    if (reportBody) {
      try {
        const parsed = JSON.parse(reportBody);
        if (Array.isArray(parsed) && parsed.length > 0 && 'body' in parsed[0]) {
          bodyHtml = parsed.map((section: { title: string; body: string }, i: number) => `
            <div class="exam-section" style="margin-bottom:18px;${i > 0 ? 'page-break-before:auto;' : ''}">
              <div class="section-title">${section.title || ''}</div>
              <div class="section-body">${section.body || ''}</div>
            </div>
          `).join('');
        }
      } catch {
        // Não é JSON — body é HTML puro, usar como está
      }
    }
    // P7: converter imagens do corpo para base64
    bodyHtml = await convertImgsQ(bodyHtml);

    // Rodapé do médico assinante
    const signedAtFormatted = signedAt
      ? signedAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    const isSignedOrRevised = reportStatus === 'signed' || reportStatus === 'revised';

    const unitName = unitData?.name || '';
    const sexFormatted = sex === 'M' ? 'Masculino' : sex === 'F' ? 'Feminino' : sex;

    // Bloco de dados do paciente em lista vertical
    const patientDataHtml = `
      <div style="margin-bottom:14px;font-size:9.5pt;line-height:1.8;">
        <div>Nome do paciente: ${patientName}</div>
        ${birthDateFormatted ? `<div>Data de nascimento: ${birthDateFormatted}</div>` : ''}
        ${sexFormatted ? `<div>Sexo: ${sexFormatted}</div>` : ''}
        ${studyDate !== '-' ? `<div>Data de realização do exame: ${studyDate}</div>` : ''}
      </div>
    `;

    // P9: marca d'água RASCUNHO para laudos não assinados
    const draftWatermarkQ = !isSignedOrRevised ? `
      <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:72pt;font-weight:900;color:rgba(200,50,50,0.10);pointer-events:none;user-select:none;white-space:nowrap;font-family:Arial,sans-serif;letter-spacing:0.1em;-webkit-print-color-adjust:exact;print-color-adjust:exact;">RASCUNHO</div>
      <div style="background:#fef3c7;border:1.5px solid #f59e0b;padding:6px 12px;border-radius:4px;margin-bottom:12px;font-size:9pt;color:#92400e;text-align:center;">⚠ LAUDO EM RASCUNHO — Não assinado — Não é um documento válido</div>
    ` : '';

    const printWindow = window.open('', '_blank', 'width=850,height=1100');
    if (!printWindow) { toast.error('Bloqueador de pop-up ativo. Permita pop-ups para imprimir.'); return; }
    printWindow.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Laudo - ${patientName}</title>
<style>
  /* P2: número de página via CSS counter nativo */
  @page {
    size: ${pageSizeQ} portrait;
    margin: ${lMT}mm ${lMR}mm ${lMB}mm ${lML}mm;
    @bottom-right {
      content: "Página " counter(page) " de " counter(pages);
      font-size: 8pt;
      color: #888;
      font-family: Arial, sans-serif;
    }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: ${fontStackQ};
    font-size: ${lSize}pt;
    color: #111;
    background: #fff;
    line-height: ${lLine};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* P4: cabeçalho repetível em múltiplas páginas via thead */
  table.print-layout { width: 100%; border-collapse: collapse; }
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
    font-size: 11pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    text-align: center;
    padding: 6px 0;
    border-bottom: 1px solid #e0e0e0;
    margin-bottom: 10px;
  }
  .section-body { font-size: ${lSize}pt; line-height: ${lLine}; }
  .doctor-footer { text-align: center; margin: 14mm auto 0; max-width: 240px; page-break-inside: avoid; }
  .sig-img { max-height: 48px; max-width: 170px; object-fit: contain; display: block; margin: 0 auto 2mm; }
  .stamp-img { max-height: 90px; max-width: 200px; object-fit: contain; display: block; margin: 0 auto 2mm; }
  .sig-line { border-top: 1px solid #333; width: 170px; margin: 0 auto 3mm; }
  .sig-name { font-weight: 700; font-size: 10pt; }
  .sig-role { font-size: 9pt; color: #444; margin-top: 1pt; letter-spacing: 0.03em; }
  .sig-crm { font-size: 9pt; color: #444; margin-top: 1pt; }
  .sig-date { font-size: 8pt; color: #666; margin-top: 3pt; }
  .revised-badge { background: #f59e0b; color: #fff; font-size: 7pt; padding: 1px 5px; border-radius: 3px; font-weight: 700; margin-left: 5px; vertical-align: middle; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doctor-footer { page-break-inside: avoid; }
  }
</style></head><body>
  ${bgLayerQ}
  ${draftWatermarkQ}
  <!-- P4: estrutura de tabela para cabeçalho repetível em múltiplas páginas -->
  <table class="print-layout">
    <thead>
      <tr><td>
        <div class="header">
          <div class="header-logo">${logoHtml}</div>
          <div class="header-title">
            <div class="clinic-name">${unitName}</div>
            <div class="clinic-sub">Laudo de Interpretação Radiológica</div>
          </div>
        </div>
      </td></tr>
    </thead>
    <tfoot>
      <tr><td style="padding:0;">
        ${lFooterUrl ? `<img src="${lFooterUrl}" alt="Rodapé" style="width:100%;display:block;max-height:30mm;object-fit:contain;" />` : `<div style="height:4mm;"></div>`}
      </td></tr>
    </tfoot>
    <tbody>
      <tr><td>
        <div class="patient-data">${patientDataHtml}</div>
        ${reportTitle ? `<div class="exam-title">${reportTitle}</div>` : ''}
        <div class="report-body">${bodyHtml}</div>
        ${isSignedOrRevised && doctorName ? `
        <div class="doctor-footer">
          ${doctorStampUrl ? `<img src="${doctorStampUrl}" alt="Carimbo" class="stamp-img" />` : ''}
          ${doctorSignatureUrl ? `<img src="${doctorSignatureUrl}" alt="Assinatura" class="sig-img" />` : ''}
          <div class="sig-line"></div>
          <div class="sig-name">${doctorName}${reportStatus === 'revised' ? '<span class="revised-badge">RETIFICADO</span>' : ''}</div>

          ${doctorCrm ? `<div class="sig-crm">CRM: ${doctorCrm}</div>` : ''}
          ${signedAtFormatted ? `<div class="sig-date">Assinado em: ${signedAtFormatted}</div>` : ''}
        </div>` : ''}
      </td></tr>
    </tbody>
  </table>
  <!-- P5: rodapé via tfoot (compatível com PDF) -->
<script>setTimeout(() => window.print(), 400);<\/script>
</body></html>`);
    printWindow.document.close();
  };

  const getReportStatus = (study: any) => {
    if (!study.studyInstanceUid) return "Pendente";
    return reportStatusMap[study.studyInstanceUid] || "Pendente";
  };

  const statusConfig: Record<string, { cls: string }> = {
    "Pendente":     { cls: "bg-amber-100 text-amber-800 border-amber-300" },
    "Rascunho":     { cls: "bg-stone-100 text-stone-600 border-stone-300" },
    "Assinado":     { cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
    "Em Andamento": { cls: "bg-sky-100 text-sky-700 border-sky-300" },
    "Concluído":    { cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
    "Revisado":     { cls: "bg-amber-100 text-amber-800 border-amber-400" },
  };

  const modalityColor: Record<string, string> = {
    CT: "bg-purple-100 text-purple-800",
    CR: "bg-sky-100 text-sky-800",
    MR: "bg-indigo-100 text-indigo-800",
    US: "bg-teal-100 text-teal-800",
    DX: "bg-cyan-100 text-cyan-800",
    PT: "bg-rose-100 text-rose-800",
  };

  const activePeriod = filters.period;

  const periodBtn = (key: string, label: string, onClick?: () => void) => (
    <button
      key={key}
      onClick={onClick || (() => handlePeriodChange(key))}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
        activePeriod === key
          ? 'bg-amber-700 text-white border-amber-700'
          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f5f3ef' }}>

      <AppHeader
        unitSlot={
          canSelectUnit && allUnits.length > 0 ? (
            <select
              value={selectedUnitId || ''}
              onChange={(e) => handleSelectUnit(Number(e.target.value))}
              className="text-sm border border-white/20 rounded px-2 py-1 text-white bg-white/10 h-7 focus:outline-none"
            >
              {allUnits.map((u) => (
                <option key={u.id} value={u.id} style={{ color: '#000' }}>{u.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-white/80 text-sm font-medium">{unitName}</span>
          )
        }
        nav={
          <>
            <button className="px-4 py-1.5 rounded text-sm font-semibold bg-amber-700 text-white">
              Estudos
            </button>
            {isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="px-4 py-1.5 rounded text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors"
              >
                <Settings className="h-3.5 w-3.5" />
                Administração
              </button>
            )}
            {isAdminMaster && (
              <button
                onClick={() => navigate('/financeiro')}
                className="px-4 py-1.5 rounded text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors"
              >
                <DollarSign className="h-3.5 w-3.5" />
                Financeiro
              </button>
            )}
            {(userRole === 'unit_admin' || userRole === 'responsavel_financeiro') && (
              <button
                onClick={() => navigate('/financeiro/unidades')}
                className="px-4 py-1.5 rounded text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors"
              >
                <DollarSign className="h-3.5 w-3.5" />
                Financeiro
              </button>
            )}
            {userRole === 'medico' && (
              <button
                onClick={() => navigate('/financeiro/meu-financeiro')}
                className="px-4 py-1.5 rounded text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors"
              >
                <DollarSign className="h-3.5 w-3.5" />
                Financeiro
              </button>
            )}
          </>
        }
      />

      {/* ── BLOCO FINANCEIRO DISCRETO ── */}
      {(userRole === 'medico' || userRole === 'responsavel_financeiro') && (
        <FinancialBanner unitId={effectiveUnitId} userRole={userRole} />
      )}

      {/* ── FILTROS ── */}
      <div className="bg-white border-b border-gray-200 px-5 py-2.5 flex items-center gap-3 shrink-0">
        {/* Busca por nome */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            placeholder="Buscar paciente..."
            value={filters.patientName}
            onChange={(e) => setFilters(f => ({ ...f, patientName: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && runQuery()}
            className="h-8 pl-8 pr-3 text-sm border border-gray-300 rounded bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-600 w-44"
          />
        </div>
        {/* Separador */}
        <div className="w-px h-5 bg-gray-200 shrink-0" />

        {/* Períodos — Hoje | Ontem | Não Laudados | Data */}
        <div className="flex items-center gap-2">
          {periodBtn('today', 'Hoje')}
          {periodBtn('yesterday', 'Ontem')}
          {/* Últimos 7 dias */}
          <button
            onClick={handleLast7Days}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
              activePeriod === 'last7days'
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Últimos 7 dias
          </button>
          {/* Calendário — Popover com seleção de data única */}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border flex items-center gap-1.5 ${
                  activePeriod === 'custom' && selectedDate
                    ? 'bg-amber-700 text-white border-amber-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <CalendarDays className="h-3 w-3" />
                {selectedDate
                  ? format(selectedDate, 'dd/MM/yyyy', { locale: ptBR })
                  : 'Data'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleCalendarSelect}
                locale={ptBR}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {selectedDate && (
            <button
              onClick={() => handleCalendarSelect(undefined)}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Espaço flex — empurra Auto-Download e contador para a direita */}
        <div className="flex-1" />

        {/* Auto-Download + Contador — agrupados à direita */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={toggleAutoDownload}
            title={autoDownloadEnabled ? 'Pré-download automático ativado — clique para desativar' : 'Ativar pré-download automático ao carregar a lista'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
              autoDownloadEnabled
                ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Download className="h-3 w-3" />
            {autoDownloadEnabled ? 'Auto-Download ON' : 'Auto-Download'}
          </button>
          <span className="text-xs text-gray-500 font-medium">
            {filteredResults.length > 0
              ? `${filteredResults.length} paciente${filteredResults.length !== 1 ? 's' : ''}`
              : isQuerying ? 'Buscando...' : ''}
          </span>
        </div>
      </div>

      {/* ── TABELA ── */}
      <div className="flex-1 overflow-auto">
        {queryResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Search className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">{isQuerying ? 'Buscando estudos...' : 'Nenhum estudo encontrado'}</p>
            {!isQuerying && (
              <button
                onClick={() => handlePeriodChange('today')}
                className="mt-3 px-3 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                Ver exames de hoje
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr
                className="text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 sticky top-0 z-10"
                style={{ background: '#f5f3ef' }}
              >
                <th className="px-4 py-2.5 text-left font-semibold w-28">Data</th>
                <th className="px-4 py-2.5 text-left font-semibold">Paciente</th>
                <th className="px-4 py-2.5 text-left font-semibold w-16">Idade</th>
                <th className="px-4 py-2.5 text-left font-semibold">Exame</th>
                <th className="px-4 py-2.5 text-center font-semibold w-10">Anam.</th>
                <th className="px-4 py-2.5 text-center font-semibold w-10">Ver</th>
                <th className="px-4 py-2.5 text-center font-semibold w-10">Laudar</th>
                <th className="px-4 py-2.5 text-center font-semibold w-10">Imp.</th>
                <th className="px-4 py-2.5 text-center font-semibold w-32">Status</th>
              </tr>
            </thead>
            <tbody>
              {pagedResults.map((study, idx) => {
                // Metadados editados pelo técnico (compartilhados por toda a unidade)
                const meta = metadataMap[study.studyInstanceUid] || null;
                const patientNameRaw = study.patientName
                  ? study.patientName.replace(/\^+/g, ' ').replace(/\s{2,}/g, ' ').trim()
                  : "Sem nome";
                // Override do banco prevalece sobre o dado do PACS
                const patientName = (meta?.patient_name_override || patientNameRaw).toUpperCase();
                const patientNameEdited = !!meta?.patient_name_override;
                const age = calcAge(study.patientBirthDate || '');
                const sex = formatSex(study.patientSex || '');
                const dt = parseDicomDateTime(study.studyDate, study.studyTime);
                const relative = relativeTime(dt);
                const dateFormatted = formatDate(study.studyDate || '');
                const modality = (study.modality || '-').toUpperCase();
                const modalityCls = modalityColor[modality] || 'bg-gray-100 text-gray-700';
                const status = getReportStatus(study);
                const { cls: statusCls } = statusConfig[status] || { cls: 'bg-gray-100 text-gray-600 border-gray-300' };

                return (
                  <tr
                    key={idx}
                    className="border-b border-gray-200 hover:bg-amber-50/60 transition-colors bg-white"
                  >
                    {/* Data */}
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{dateFormatted}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{relative}</div>
                    </td>

                    {/* Paciente */}
                    <td className="px-4 py-3">
                      <div className={`font-semibold text-sm leading-tight uppercase ${patientNameEdited ? 'text-amber-700' : 'text-gray-900'}`}>
                        {patientName}
                        {patientNameEdited && <span className="ml-1 text-xs text-amber-500" title="Nome editado pelo técnico">✏️</span>}
                      </div>
                      {sex && <div className="text-xs text-gray-400 mt-0.5">{sex}</div>}
                      {meta?.notes && (
                        <div className="text-xs text-blue-600 mt-0.5 truncate max-w-[160px]" title={meta.notes}>
                          📝 {meta.notes}
                        </div>
                      )}
                    </td>

                    {/* Idade */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{age || '-'}</span>
                    </td>

                    {/* Exame — editável (persiste no banco) */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${modalityCls}`}>{modality}</span>
                        <EditableExamName
                          value={study.studyDescription || ''}
                          studyUid={study.studyInstanceUid || `${idx}`}
                          rawDescription={study.studyDescription || ''}
                          dbOverride={meta?.description_override || null}
                          dbExamCount={meta?.exam_count ?? 1}
                          onSaved={() => refetchMetadata()}
                          canEdit={canEditExamLegend}
                          unitId={effectiveUnitId ?? undefined}  // V14-P2 FIX
                        />
                      </div>
                    </td>

                    {/* Anamnese + SLA */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* V13-P3 FIX: canViewAnamnesis=ver, canEditAnamnesis=editar */}
                        {canViewAnamnesis || canEditAnamnesis ? (
                          <button
                            onClick={() => { if (canEditAnamnesis) { setSelectedStudy(study); setIsAnamnesisModalOpen(true); } }}
                            title={
                              canEditAnamnesis
                                ? (anamnesisStatusMap[study.studyInstanceUid] ? 'Anamnese preenchida — clique para editar' : 'Sem anamnese — clique para preencher')
                                : (anamnesisStatusMap[study.studyInstanceUid] ? 'Anamnese preenchida (somente leitura)' : 'Sem anamnese')
                            }
                            className={`relative w-8 h-8 rounded-lg border inline-flex items-center justify-center transition-colors ${
                              anamnesisStatusMap[study.studyInstanceUid]
                                ? 'border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : canEditAnamnesis
                                  ? 'border-gray-200 bg-white text-gray-500 hover:bg-amber-50 hover:text-amber-700'
                                  : 'border-gray-200 bg-white text-gray-400 cursor-default'
                            }`}
                          >
                            <Clipboard className="h-3.5 w-3.5" />
                            {anamnesisStatusMap[study.studyInstanceUid] && (
                              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white" />
                            )}
                          </button>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                        {/* Badge de prazo SLA */}
                        <SlaCountdown
                          readiness={slaReadinessMap[study.studyInstanceUid]}
                          hasAnamnesis={!!anamnesisStatusMap[study.studyInstanceUid]}
                          compact={true}
                        />
                      </div>
                    </td>

                    {/* Visualizar + Pré-download */}
                    <td className="px-4 py-3 text-center">
                      {canViewer ? (
                        <div className="flex items-center justify-center gap-1">
                          {/* Botão Visualizar */}
                          <button
                            onClick={() => handleVisualize(study)}
                            title="Visualizar DICOM"
                            className="w-8 h-8 rounded-lg bg-amber-600 hover:bg-amber-700 text-white inline-flex items-center justify-center transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          {/* Botão Pré-download */}
                          {(() => {
                            const pd = preDownloadMap[study.studyInstanceUid];
                            if (!pd || pd.phase === 'idle' || pd.phase === 'error') {
                              return (
                                <button
                                  onClick={() => handlePreDownload(study)}
                                  title="Baixar imagens em background (abre o viewer instantaneamente depois)"
                                  className="w-8 h-8 rounded-lg border border-gray-300 bg-white hover:bg-blue-50 text-gray-500 hover:text-blue-600 inline-flex items-center justify-center transition-colors"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              );
                            }
                            if (pd.phase === 'connecting' || pd.phase === 'downloading') {
                              const pct = pd.total > 0 ? Math.round((pd.received / pd.total) * 100) : 0;
                              return (
                                <div className="flex flex-col items-center gap-0.5" title={`${pd.received}/${pd.total} imagens`}>
                                  <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                                  {pd.total > 0 && (
                                    <span className="text-[9px] text-blue-500 tabular-nums leading-none">{pct}%</span>
                                  )}
                                </div>
                              );
                            }
                            if (pd.phase === 'done') {
                              return (
                                <button
                                  onClick={() => handleVisualize(study)}
                                  title={`${pd.total} imagens prontas — clique para abrir instantaneamente`}
                                  className="w-8 h-8 rounded-lg bg-green-500 hover:bg-green-600 text-white inline-flex items-center justify-center transition-colors"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Laudar */}
                    <td className="px-4 py-3 text-center">
                      {canLaudo ? (
                        <button
                          onClick={() => handleReport(study)}
                          title="Laudar"
                          className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center justify-center transition-colors"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                     {/* Imprimir — V12-7 FIX: condicional a print_reports da unidade selecionada */}
                    <td className="px-4 py-3 text-center">
                      {canPrint ? (
                        <button
                          onClick={() => handlePrintReport(study)}
                          title="Imprimir laudo"
                          className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 inline-flex items-center justify-center transition-colors"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap inline-flex items-center gap-1 ${statusCls}`}>
                        {status === 'Revisado' && <span title="Laudo retificado">&#9888;</span>}
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── PAGINAÇÃO ── */}
      {filteredResults.length > PAGE_SIZE && (
        <div className="bg-white border-t border-gray-200 px-5 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs text-gray-500">
            Total: {filteredResults.length} — Página {currentPage} de {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let page = i + 1;
              if (totalPages > 7) {
                if (currentPage <= 4) page = i + 1;
                else if (currentPage >= totalPages - 3) page = totalPages - 6 + i;
                else page = currentPage - 3 + i;
              }
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-7 h-7 rounded border text-xs font-medium transition-colors ${
                    page === currentPage
                      ? 'bg-amber-700 text-white border-amber-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isAnamnesisModalOpen && selectedStudy && (
        <AnamnesisModal
          open={isAnamnesisModalOpen}
          onClose={() => { setIsAnamnesisModalOpen(false); setSelectedStudy(null); }}
          studyInstanceUid={selectedStudy?.studyInstanceUid || ''}
          patientName={selectedStudy?.patientName || ''}
          onSave={() => { setIsAnamnesisModalOpen(false); setSelectedStudy(null); refetchMetadata(); refetchAnamnesisStatus(); refetchSlaReadiness(); }}
        />
      )}
    </div>
  );
}
