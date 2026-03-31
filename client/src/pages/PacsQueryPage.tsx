import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Search, Eye, FileText, Printer,
  Clipboard, ExternalLink, LogOut, Settings,
  ChevronLeft, ChevronRight, Monitor, Clock,
} from "lucide-react";
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

  const [filters, setFilters] = useState({ patientName: "", studyDate: "", period: "today", shift: false });
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
  const [modalityFilter, setModalityFilter] = useState('ALL');
  const [reportStatusMap, setReportStatusMap] = useState<Record<string, string>>({});

  useEffect(() => {
    try { setQueryResults(JSON.parse(localStorage.getItem(cacheKey) || '[]')); } catch { setQueryResults([]); }
    setCurrentPage(1);
  }, [cacheKey]);

  useEffect(() => {
    if (queryResults.length > 0) localStorage.setItem(cacheKey, JSON.stringify(queryResults));
  }, [queryResults, cacheKey]);

  // Filtro por modalidade aplicado antes da paginação
  const filteredResults = useMemo(() => {
    if (modalityFilter === 'ALL') return queryResults;
    return queryResults.filter(s => (s.modality || '').toUpperCase() === modalityFilter);
  }, [queryResults, modalityFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const pagedResults = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredResults.slice(start, start + PAGE_SIZE);
  }, [filteredResults, currentPage]);

  // Busca status real dos laudos quando os resultados mudam
  const studyUids = useMemo(
    () => queryResults.map(s => s.studyInstanceUid).filter(Boolean),
    [queryResults]
  );
  const { data: statusData } = trpc.reports.statusByStudyUids.useQuery(
    { studyUids },
    { enabled: studyUids.length > 0 }
  );
  useEffect(() => {
    if (statusData) setReportStatusMap(statusData);
  }, [statusData]);

  // Modalidades únicas presentes nos resultados
  const availableModalities = useMemo(() => {
    const set = new Set(queryResults.map(s => (s.modality || '').toUpperCase()).filter(Boolean));
    return Array.from(set).sort();
  }, [queryResults]);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      Object.keys(localStorage).filter(k => k.startsWith('pacs_query_results')).forEach(k => localStorage.removeItem(k));
      navigate("/login");
    },
  });

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
    if (studyDate && studyDate.includes('-')) studyDate = studyDate.replace(/-/g, '');
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
    }
    else if (period === 'pending') studyDate = 'LAST_30_DAYS';
    else if (period === 'all') studyDate = '';
    setFilters(f => ({ ...f, period, studyDate }));
    runQuery({ period, studyDate });
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

  const handleOpenRadiant = (study: any) => {
    if (!study.studyInstanceUid) { toast.error('UID do estudo não disponível'); return; }
    window.location.href = `radiant://?n=1&v=0020000D&v=${study.studyInstanceUid}`;
    toast.info('Abrindo no RadiAnt DICOM Viewer...');
  };

  const handleOpenOrthancViewer = (study: any) => {
    const orthancBase = (unitData as any)?.orthanc_public_url || (unitData as any)?.orthanc_base_url || 'http://45.189.160.17:8042';
    const viewerUrl = study.orthancId
      ? `${orthancBase}/osimis-viewer/app/index.html?study=${study.orthancId}`
      : `${orthancBase}/osimis-viewer/app/index.html?studyInstanceUid=${study.studyInstanceUid}`;
    window.open(viewerUrl, '_blank');
  };

  const handleReport = (study: any) => {
    // Salva todos os dados do estudo no sessionStorage para o editor de laudo
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
      unitName: study.unitName || '',
      unitId: study.unitId || '',
    }));
    navigate(`/reports/create/${study.studyInstanceUid}`);
  };

  const getReportStatus = (study: any) => {
    if (!study.studyInstanceUid) return "Pendente";
    return reportStatusMap[study.studyInstanceUid] || "Pendente";
  };

  // Cores dos status — paleta terra quente
  const statusConfig: Record<string, { cls: string; label: string }> = {
    "Pendente":     { cls: "bg-amber-100 text-amber-800 border-amber-300",   label: "Pendente" },
    "Rascunho":     { cls: "bg-stone-100 text-stone-600 border-stone-300",   label: "Rascunho" },
    "Assinado":     { cls: "bg-emerald-100 text-emerald-700 border-emerald-300", label: "Assinado" },
    "Em Andamento": { cls: "bg-sky-100 text-sky-700 border-sky-300",         label: "Em Andamento" },
    "Concluído":    { cls: "bg-emerald-100 text-emerald-700 border-emerald-300", label: "Concluído" },
  };

  // Cores das modalidades
  const modalityColor: Record<string, string> = {
    CT: "bg-purple-100 text-purple-800",
    CR: "bg-sky-100 text-sky-800",
    MR: "bg-indigo-100 text-indigo-800",
    US: "bg-teal-100 text-teal-800",
    DX: "bg-cyan-100 text-cyan-800",
    PT: "bg-rose-100 text-rose-800",
  };

  // Botão de período ativo
  const periodBtn = (key: string, label: string) => (
    <button
      key={key}
      onClick={() => handlePeriodChange(key)}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
        filters.period === key
          ? 'bg-amber-700 text-white border-amber-700'
          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f5f3ef' }}>

      {/* ── HEADER ESCURO ── */}
      <header
        className="px-5 flex items-center justify-between shrink-0"
        style={{ background: '#2c2420', height: 56 }}
      >
        {/* Logo + unidade */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-red-700 flex items-center justify-center">
              <span className="text-white text-xs font-bold leading-none">L</span>
            </div>
            <span className="text-white text-base font-bold tracking-tight">lauds</span>
          </div>
          <div className="w-px h-5 bg-white/20" />
          {isAdminMaster && allUnits.length > 0 ? (
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
          )}
        </div>

        {/* Nav central */}
        <nav className="flex items-center gap-1">
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
        </nav>

        {/* Usuário + sair */}
        <div className="flex items-center gap-2">
          <span className="text-white/80 text-sm">{user?.name || 'Usuário'}</span>
          <button
            onClick={() => logoutMutation.mutate()}
            className="p-1.5 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── FILTROS ── */}
      <div className="bg-white border-b border-gray-200 px-5 py-2.5 flex items-center gap-2 flex-wrap shrink-0">
        {/* Busca */}
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
        <div className="flex items-center gap-1">
          {periodBtn('today', 'Hoje')}
          {periodBtn('yesterday', 'Ontem')}
          {periodBtn('pending', 'Não Laudados')}
          {periodBtn('all', 'Todos')}
          <button
            onClick={() => handlePeriodChange('custom')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border flex items-center gap-1 ${
              filters.period === 'custom'
                ? 'bg-amber-700 text-white border-amber-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Clock className="h-3 w-3" />
            Período
          </button>
        </div>

        {/* Datas customizadas */}
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

        {/* Filtro por modalidade */}
        {availableModalities.length > 0 && (
          <div className="flex items-center gap-1 ml-1">
            {['ALL', ...availableModalities].map(mod => (
              <button
                key={mod}
                onClick={() => { setModalityFilter(mod); setCurrentPage(1); }}
                className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                  modalityFilter === mod
                    ? 'bg-stone-700 text-white border-stone-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {mod === 'ALL' ? 'Todos' : mod}
              </button>
            ))}
          </div>
        )}

        {/* Contador */}
        <span className="ml-auto text-xs text-gray-400">
          {filteredResults.length > 0
            ? `${filteredResults.length} paciente${filteredResults.length !== 1 ? 's' : ''}`
            : ''}
        </span>
      </div>

      {/* ── TABELA ── */}
      <div className="flex-1 overflow-auto">
        {queryResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Search className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Nenhum estudo encontrado</p>
            <button
              onClick={() => handlePeriodChange('today')}
              className="mt-3 px-3 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              Ver exames de hoje
            </button>
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
                <th className="px-4 py-2.5 text-center font-semibold w-28">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold w-44">Ações</th>
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
                const { cls: statusCls, label: statusLabel } = statusConfig[status] || { cls: 'bg-gray-100 text-gray-600 border-gray-300', label: status };

                return (
                  <tr
                    key={idx}
                    className="border-b border-gray-200 hover:bg-amber-50/60 transition-colors bg-white"
                  >
                    {/* Data + tempo relativo */}
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{dateFormatted}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{relative}</div>
                    </td>

                    {/* Paciente */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 text-sm leading-tight uppercase">{patientName}</div>
                      {sex && (
                        <div className="text-xs text-gray-400 mt-0.5">{sex}</div>
                      )}
                    </td>

                    {/* Idade */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{age || '-'}</span>
                    </td>

                    {/* Exame */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${modalityCls}`}>{modality}</span>
                        <span className="text-sm text-gray-800">{study.studyDescription || 'Sem descrição'}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${statusCls}`}>
                        {statusLabel}
                      </span>
                    </td>

                    {/* Ações — 4 botões quadrados à direita */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Anamnese/CID */}
                        {canCID && (
                          <button
                            onClick={() => { setSelectedStudy(study); setIsAnamnesisModalOpen(true); }}
                            title="CID / Anamnese"
                            className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors"
                          >
                            <Clipboard className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* Visualizar DICOM */}
                        {canViewer && (
                          <button
                            onClick={() => handleVisualize(study)}
                            title="Visualizar DICOM"
                            className="w-8 h-8 rounded-lg bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* Laudar */}
                        {canLaudo && (
                          <button
                            onClick={() => handleReport(study)}
                            title="Laudar"
                            className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* Imprimir */}
                        <button
                          onClick={() => toast.info('Impressão em desenvolvimento')}
                          title="Imprimir laudo"
                          className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        {/* Orthanc viewer */}
                        <button
                          onClick={() => handleOpenOrthancViewer(study)}
                          title="Abrir no Orthanc"
                          className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors"
                        >
                          <Monitor className="h-3.5 w-3.5" />
                        </button>
                        {/* RadiAnt */}
                        <button
                          onClick={() => handleOpenRadiant(study)}
                          title="Abrir no RadiAnt"
                          className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
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
