import { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  Search, Eye, FileText, Printer,
  Clipboard, Settings,
  ChevronLeft, ChevronRight, Clock, Pencil, Check, X,
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

// Componente para edição inline do nome do exame com sugestões
function EditableExamName({ value, studyUid }: { value: string; studyUid: string }) {
  const storageKey = `exam_label_${studyUid}`;
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(() => localStorage.getItem(storageKey) || value || 'Sem descrição');
  const [draft, setDraft] = useState(label);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const filtered = draft.trim().length > 0
    ? EXAM_SUGGESTIONS.filter(s => s.toLowerCase().includes(draft.toLowerCase()))
    : EXAM_SUGGESTIONS;

  const save = (val?: string) => {
    const trimmed = (val ?? draft).trim() || value || 'Sem descrição';
    setLabel(trimmed);
    setDraft(trimmed);
    localStorage.setItem(storageKey, trimmed);
    setEditing(false);
    setShowSuggestions(false);
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
          <button onClick={() => save()} className="text-emerald-600 hover:text-emerald-700 shrink-0" title="Salvar">
            <Check className="h-3.5 w-3.5" />
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

  return (
    <div className="flex items-center gap-1 group">
      <span className="text-sm text-gray-800">{label}</span>
      <button
        onClick={() => { setDraft(label); setEditing(true); }}
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-gray-400 hover:text-amber-600 transition-opacity"
        title="Editar nome do exame"
      >
        <Pencil className="h-3 w-3" />
      </button>
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

  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const effectiveUnitId = isAdminMaster ? selectedUnitId : (user?.unit_id || null);

  const { data: allUnits = [] } = trpc.units.list.useQuery(undefined, { enabled: isAdminMaster });
  const { data: unitData } = trpc.units.getById.useQuery(
    { id: effectiveUnitId || 0 },
    { enabled: !!effectiveUnitId }
  );

  useEffect(() => {
    if (isAdminMaster && allUnits.length > 0 && selectedUnitId === null) {
      setSelectedUnitId(allUnits[0].id);
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

  const handleVisualize = (study: any) => {
    if (!study.studyInstanceUid) { toast.error('UID do estudo não disponível'); return; }
    const unitParam = isAdminMaster && effectiveUnitId ? `?unit_id=${effectiveUnitId}` : '';
    navigate(`/dicom-viewer/${study.studyInstanceUid}${unitParam}`);
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
              onChange={(e) => setSelectedUnitId(Number(e.target.value))}
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
                <th className="px-4 py-2.5 text-center font-semibold w-28">Status</th>
                <th className="px-4 py-2.5 text-center font-semibold w-10">Imp.</th>
              </tr>
            </thead>
            <tbody>
              {pagedResults.map((study, idx) => {
                const patientName = study.patientName
                  ? study.patientName.replace(/\^+/g, ' ').replace(/\s{2,}/g, ' ').trim()
                  : "Sem nome";
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
                      <div className="font-semibold text-gray-900 text-sm leading-tight uppercase">{patientName}</div>
                      {sex && <div className="text-xs text-gray-400 mt-0.5">{sex}</div>}
                    </td>

                    {/* Idade */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{age || '-'}</span>
                    </td>

                    {/* Exame — editável */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${modalityCls}`}>{modality}</span>
                        <EditableExamName
                          value={study.studyDescription || ''}
                          studyUid={study.studyInstanceUid || `${idx}`}
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

                    {/* Visualizar */}
                    <td className="px-4 py-3 text-center">
                      {canViewer ? (
                        <button
                          onClick={() => handleVisualize(study)}
                          title="Visualizar DICOM"
                          className="w-8 h-8 rounded-lg bg-amber-600 hover:bg-amber-700 text-white inline-flex items-center justify-center transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
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

                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${statusCls}`}>
                        {status}
                      </span>
                    </td>

                    {/* Imprimir */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toast.info('Impressão em desenvolvimento')}
                        title="Imprimir laudo"
                        className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 inline-flex items-center justify-center transition-colors"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </button>
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
          onSave={() => { setIsAnamnesisModalOpen(false); setSelectedStudy(null); }}
        />
      )}
    </div>
  );
}
