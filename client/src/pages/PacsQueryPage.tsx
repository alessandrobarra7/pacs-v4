import { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  Search, Eye, FileText, Printer,
  Clipboard, Settings,
  ChevronLeft, ChevronRight, Clock, Pencil, Check, X,
  Download, Loader2,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { AnamnesisModal } from "@/components/AnamnesisModal";
import { canReport, canAccessAdmin, canFillAnamnesis, canViewDICOM, type UserRole } from "../../../shared/permissions";

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

// Componente para edição inline do nome do exame com sugestões + persistência no banco
function EditableExamName({
  value, studyUid, rawDescription, dbOverride, onSaved, canEdit
}: {
  value: string;
  studyUid: string;
  rawDescription?: string;
  dbOverride?: string | null;
  onSaved?: () => void;
  canEdit?: boolean;
}) {
  const storageKey = `exam_label_${studyUid}`;
  const [editing, setEditing] = useState(false);
  // Prioridade: banco > localStorage > PACS
  const [label, setLabel] = useState(() =>
    dbOverride || localStorage.getItem(storageKey) || value || 'Sem descrição'
  );
  const [draft, setDraft] = useState(label);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveMutation = trpc.studyMetadata.save.useMutation();

  // Sincroniza quando o banco retorna um override atualizado
  useEffect(() => {
    if (dbOverride) {
      setLabel(dbOverride);
      setDraft(dbOverride);
    }
  }, [dbOverride]);

  useEffect(() => {
    if (editing) { inputRef.current?.focus(); setShowSuggestions(true); }
  }, [editing]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allSuggestions = rawDescription && rawDescription.trim() && rawDescription.toUpperCase() !== label.toUpperCase()
    ? [rawDescription.toUpperCase(), ...EXAM_SUGGESTIONS.filter(s => s.toUpperCase() !== rawDescription.toUpperCase())]
    : EXAM_SUGGESTIONS;
  const filtered = draft.trim().length > 0
    ? allSuggestions.filter(s => s.toLowerCase().includes(draft.toLowerCase()))
    : allSuggestions;

  const save = async (val?: string) => {
    const trimmed = (val ?? draft).trim() || value || 'Sem descrição';
    setLabel(trimmed);
    setDraft(trimmed);
    localStorage.setItem(storageKey, trimmed);
    setEditing(false);
    setShowSuggestions(false);
    // Persiste no banco
    if (studyUid && studyUid.length > 5) {
      setSaving(true);
      try {
        await saveMutation.mutateAsync({
          studyInstanceUid: studyUid,
          descriptionOverride: trimmed,
        });
        onSaved?.();
      } catch {
        toast.error('Erro ao salvar descrição no banco');
      } finally {
        setSaving(false);
      }
    }
  };

  const cancel = () => {
    setDraft(label);
    setEditing(false);
    setShowSuggestions(false);
  };

  if (editing) {
    return (
      <div ref={containerRef} className="relative">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={draft}
            onChange={e => { setDraft(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
            className="text-sm border border-amber-400 rounded px-1.5 py-0.5 w-52 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white text-gray-800"
            placeholder="Buscar ou digitar exame..."
          />
          <button onClick={() => save()} disabled={saving} className="text-emerald-600 hover:text-emerald-700 shrink-0" title="Salvar">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={cancel} className="text-red-400 hover:text-red-500 shrink-0" title="Cancelar">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {showSuggestions && filtered.length > 0 && (
          <div className="absolute top-7 left-0 z-50 w-72 max-h-48 overflow-y-auto bg-white border border-amber-300 rounded shadow-lg">
            {filtered.slice(0, 25).map(s => (
              <button
                key={s}
                onMouseDown={() => save(s)}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-800 hover:bg-amber-50 border-b border-gray-100 last:border-0"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const isEdited = !!dbOverride;
  return (
    <div className="flex items-center gap-1 group">
      <span className={`text-sm ${isEdited ? 'text-amber-700 font-medium' : 'text-gray-800'}`}>{label}</span>
      {isEdited && <span className="text-xs text-amber-500" title="Editado pelo técnico">✏️</span>}
      {canEdit !== false && (
        <button
          onClick={() => { setDraft(label); setEditing(true); }}
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-gray-400 hover:text-amber-600 transition-opacity"
          title="Editar nome do exame"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function PacsQueryPage() {
  const [, navigate] = useLocation();
  const { data: user } = trpc.auth.me.useQuery();

  const userRole = (user?.role || 'viewer') as UserRole;
  const canLaudo = canReport(userRole);
  const canCID = canFillAnamnesis(userRole);
  const canViewer = canViewDICOM(userRole);
  const isAdmin = canAccessAdmin(userRole);
  const isAdminMaster = user?.role === 'admin_master';

  // Persistir unidade selecionada no localStorage para manter a seleção ao navegar entre páginas
  const SELECTED_UNIT_KEY = 'pacs_selected_unit_id';
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(() => {
    const saved = localStorage.getItem(SELECTED_UNIT_KEY);
    return saved ? parseInt(saved, 10) : null;
  });
  const effectiveUnitId = isAdminMaster ? selectedUnitId : (user?.unit_id || null);

  const { data: allUnits = [] } = trpc.units.list.useQuery(undefined, { enabled: isAdminMaster });
  const { data: unitData } = trpc.units.getById.useQuery(
    { id: effectiveUnitId || 0 },
    { enabled: !!effectiveUnitId }
  );

  // Wrapper que persiste a troca de unidade no localStorage
  const handleSelectUnit = (unitId: number) => {
    setSelectedUnitId(unitId);
    localStorage.setItem(SELECTED_UNIT_KEY, String(unitId));
  };

  useEffect(() => {
    if (isAdminMaster && allUnits.length > 0) {
      if (selectedUnitId === null) {
        // Primeira visita: selecionar a primeira unidade e persistir
        const firstId = allUnits[0].id;
        setSelectedUnitId(firstId);
        localStorage.setItem(SELECTED_UNIT_KEY, String(firstId));
      } else {
        // Verificar se a unidade salva ainda existe (pode ter sido deletada)
        const exists = allUnits.some(u => u.id === selectedUnitId);
        if (!exists) {
          const firstId = allUnits[0].id;
          setSelectedUnitId(firstId);
          localStorage.setItem(SELECTED_UNIT_KEY, String(firstId));
        }
      }
    }
  }, [isAdminMaster, allUnits, selectedUnitId]);

  const unitName = unitData?.name || (effectiveUnitId ? 'Carregando...' : 'Sem unidade');
  const cacheKey = `pacs_query_results_unit_${effectiveUnitId || 'none'}`;

  const [filters, setFilters] = useState({ patientName: "", studyDate: "", period: "today" });
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [showCustomDate, setShowCustomDate] = useState(false);
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

    const sse = new EventSource(`/api/dicom-stream/${uid}`);

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
  }, [cacheKey]);

  useEffect(() => {
    if (queryResults.length > 0) localStorage.setItem(cacheKey, JSON.stringify(queryResults));
  }, [queryResults, cacheKey]);

  // Ordenar por data mais recente primeiro
  const sortedResults = useMemo(() => sortByDateDesc(queryResults), [queryResults]);

  // Filtro "Não Laudados" aplicado sobre os resultados ordenados
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const filteredResults = useMemo(() => {
    if (!showPendingOnly) return sortedResults;
    return sortedResults.filter(s => {
      const uid = s.studyInstanceUid;
      const status = uid ? (reportStatusMap[uid] || 'Pendente') : 'Pendente';
      return status === 'Pendente';
    });
  }, [sortedResults, showPendingOnly, reportStatusMap]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const pagedResults = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredResults.slice(start, start + PAGE_SIZE);
  }, [filteredResults, currentPage]);

  // Busca status real dos laudos
  const studyUids = useMemo(() => queryResults.map(s => s.studyInstanceUid).filter(Boolean), [queryResults]);
  const { data: statusData } = trpc.reports.statusByStudyUids.useQuery(
    { studyUids },
    { enabled: studyUids.length > 0 }
  );
  useEffect(() => {
    if (statusData) setReportStatusMap(statusData);
  }, [statusData]);

  // Busca metadados editados pelo técnico para todos os estudos da página
  const { data: metadataBatch, refetch: refetchMetadata } = trpc.studyMetadata.getBatch.useQuery(
    { studyInstanceUids: studyUids },
    { enabled: studyUids.length > 0 }
  );
  // Mapa de studyUid → metadados editados (compartilhado por toda a unidade)
  const metadataMap = useMemo(() => {
    if (!metadataBatch) return {} as Record<string, any>;
    return Object.fromEntries((metadataBatch as any[]).map((m: any) => [m.study_instance_uid, m]));
  }, [metadataBatch]);

  // logout handled by AppHeader

  const queryPacs = trpc.pacs.query.useMutation({
    onSuccess: (data: any) => {
      setQueryResults(data.studies || []);
      setCurrentPage(1);
      toast.success(`${data.studies?.length || 0} estudos encontrados`);
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
    if (studyDate && studyDate.includes('-') && studyDate.length === 8) {
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
    setShowPendingOnly(false);
    if (period === 'custom') {
      setShowCustomDate(true);
      setFilters(f => ({ ...f, period: 'custom', studyDate: '' }));
      return;
    }
    setShowCustomDate(false);
    let studyDate = '';
    if (period === 'today') studyDate = 'TODAY';
    else if (period === 'yesterday') {
      const d = new Date(); d.setDate(d.getDate() - 1);
      studyDate = d.toISOString().slice(0, 10).replace(/-/g, '');
    } else if (period === 'all') {
      studyDate = '';
    }
    setFilters(f => ({ ...f, period, studyDate }));
    runQuery({ period, studyDate });
  };

  const handlePendingOnly = () => {
    setShowPendingOnly(true);
    setFilters(f => ({ ...f, period: 'pending' }));
    setShowCustomDate(false);
    // Busca todos os estudos para filtrar localmente por status
    setIsQuerying(true);
    queryPacs.mutate({
      patientName: filters.patientName,
      patientId: "",
      modality: "",
      studyDate: 'LAST_30_DAYS',
      accessionNumber: "",
      unit_id: effectiveUnitId || undefined,
    });
  };

  const handleCustomDateSearch = () => {
    if (!customDateFrom && !customDateTo) { toast.error('Informe ao menos uma data'); return; }
    const from = customDateFrom ? customDateFrom.replace(/-/g, '') : '';
    const to = customDateTo ? customDateTo.replace(/-/g, '') : '';
    let studyDate = '';
    if (from && to) studyDate = `${from}-${to}`;
    else if (from) studyDate = from;
    else studyDate = to;
    setFilters(f => ({ ...f, period: 'custom', studyDate }));
    runQuery({ period: 'custom', studyDate });
  };

  const handleVisualize = async (study: any) => {
    if (!study.studyInstanceUid) { toast.error('UID do estudo não disponível'); return; }
    const unitParam = isAdminMaster && effectiveUnitId ? `?unit_id=${effectiveUnitId}` : '';
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
    sessionStorage.setItem(`study_${study.studyInstanceUid}`, JSON.stringify({
      patientName: study.patientName || '',
      patientID: study.patientID || '',
      patientBirthDate: study.patientBirthDate || '',
      patientSex: study.patientSex || '',
      studyDate: study.studyDate || '',
      studyTime: study.studyTime || '',
      modality: study.modality || '',
      studyDescription: study.studyDescription || '',
      accessionNumber: study.accessionNumber || '',
      numberOfInstances: study.numberOfInstances || 0,
      unitName: unitName,
      unitId: effectiveUnitId || '',
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
    const modality = study.modality || '';
    const unitLabel = unitName || '';
    // Buscar laudo salvo no banco
    const reportData = reportStatusMap[study.studyInstanceUid];
    const reportStatus = reportData || 'Pendente';
    // Montar HTML de impressão
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) { toast.error('Bloqueador de pop-up ativo. Permita pop-ups para imprimir.'); return; }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Laudo - ${patientName}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #222; background: #fff; padding: 20mm; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #2c2420; padding-bottom: 10px; margin-bottom: 16px; }
          .header h1 { font-size: 18px; color: #2c2420; font-weight: bold; }
          .header .unit { font-size: 11px; color: #666; }
          .patient-card { background: #f9f5f0; border: 1px solid #e5d9cc; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
          .patient-card .field label { font-size: 10px; color: #888; text-transform: uppercase; }
          .patient-card .field span { font-size: 12px; font-weight: 600; color: #222; display: block; }
          .section-title { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #2c2420; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; }
          .report-body { min-height: 200px; line-height: 1.7; font-size: 12px; white-space: pre-wrap; }
          .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #888; }
          .status-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 10px; font-weight: bold; background: ${reportStatus === 'Assinado' ? '#d1fae5' : '#fef3c7'}; color: ${reportStatus === 'Assinado' ? '#065f46' : '#92400e'}; border: 1px solid ${reportStatus === 'Assinado' ? '#6ee7b7' : '#fcd34d'}; }
          @media print { body { padding: 15mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>Gestão de Laudos Radiológicos</h1>
            <div class="unit">${unitLabel}</div>
          </div>
          <div style="text-align:right">
            <div class="status-badge">${reportStatus}</div>
            <div style="font-size:10px;color:#888;margin-top:4px">Impresso em: ${new Date().toLocaleString('pt-BR')}</div>
          </div>
        </div>
        <div class="patient-card">
          <div class="field"><label>Paciente</label><span>${patientName}</span></div>
          <div class="field"><label>Exame</label><span>${examLabel} (${modality})</span></div>
          <div class="field"><label>Data do Exame</label><span>${studyDate}</span></div>
          <div class="field"><label>Número de Acesso</label><span>${studyData.accessionNumber || study.accessionNumber || '-'}</span></div>
        </div>
        <div class="section-title">Laudo</div>
        <div class="report-body" id="report-body">Carregando laudo...</div>
        <div class="footer">
          <span>Desenvolvimento StudioBarra7</span>
          <span>${unitLabel}</span>
        </div>
        <script>
          // Buscar laudo via API
          fetch('/api/trpc/reports.getByStudyUid?input=' + encodeURIComponent(JSON.stringify({"0":{"json":{"studyUid":"${study.studyInstanceUid}"}}})))
            .then(r => r.json())
            .then(data => {
              const body = data?.[0]?.result?.data?.json?.body || '';
              document.getElementById('report-body').textContent = body || '(Laudo não encontrado ou ainda não elaborado)';
              setTimeout(() => window.print(), 500);
            })
            .catch(() => {
              document.getElementById('report-body').textContent = '(Erro ao carregar laudo)';
              setTimeout(() => window.print(), 500);
            });
        <\/script>
      </body>
      </html>
    `);
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
          isAdminMaster && allUnits.length > 0 ? (
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
          </>
        }
      />

      {/* ── FILTROS ── */}
      <div className="bg-white border-b border-gray-200 px-5 py-2.5 flex items-center gap-2 flex-wrap shrink-0">
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

        {/* Períodos */}
        <div className="flex items-center gap-1 flex-wrap">
          {periodBtn('today', 'Hoje')}
          {periodBtn('yesterday', 'Ontem')}
          {/* Data customizada */}
          <button
            onClick={() => handlePeriodChange('custom')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border flex items-center gap-1 ${
              activePeriod === 'custom'
                ? 'bg-amber-700 text-white border-amber-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Clock className="h-3 w-3" />
            Data
          </button>
          {/* Não Laudados */}
          <button
            onClick={handlePendingOnly}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
              activePeriod === 'pending'
                ? 'bg-amber-700 text-white border-amber-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Não Laudados
          </button>
          {periodBtn('all', 'Todos')}
        </div>

        {/* Inputs de data customizada */}
        {showCustomDate && (
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={customDateFrom}
              onChange={e => setCustomDateFrom(e.target.value)}
              className="h-7 px-2 text-xs border border-gray-300 rounded bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-600"
            />
            <span className="text-xs text-gray-400">até</span>
            <input
              type="date"
              value={customDateTo}
              onChange={e => setCustomDateTo(e.target.value)}
              className="h-7 px-2 text-xs border border-gray-300 rounded bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-600"
            />
            <button
              onClick={handleCustomDateSearch}
              disabled={isQuerying}
              className="px-2 py-1 rounded text-xs font-medium bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-60"
            >
              Buscar
            </button>
          </div>
        )}

        {/* Toggle pré-download automático */}
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

        {/* Contador de pacientes */}
        <span className="ml-auto text-xs text-gray-500 font-medium">
          {filteredResults.length > 0
            ? `${filteredResults.length} paciente${filteredResults.length !== 1 ? 's' : ''}`
            : isQuerying ? 'Buscando...' : ''}
        </span>
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
                          onSaved={() => refetchMetadata()}
                          canEdit={canCID}
                        />
                      </div>
                    </td>

                    {/* Anamnese */}
                    <td className="px-4 py-3 text-center">
                      {canCID ? (
                        <button
                          onClick={() => { setSelectedStudy(study); setIsAnamnesisModalOpen(true); }}
                          title="CID / Anamnese"
                          className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-amber-50 text-gray-500 hover:text-amber-700 inline-flex items-center justify-center transition-colors"
                        >
                          <Clipboard className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
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

                     {/* Imprimir */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handlePrintReport(study)}
                        title="Imprimir laudo"
                        className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 inline-flex items-center justify-center transition-colors"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap min-w-[100px] inline-block ${statusCls}`}>
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
          onSave={() => { setIsAnamnesisModalOpen(false); setSelectedStudy(null); }}
        />
      )}
    </div>
  );
}
