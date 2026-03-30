import { useState, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Eye, FileText, Clock, Printer, UserCircle,
  Clipboard, ExternalLink, LogOut, Settings,
  ChevronLeft, ChevronRight, Monitor,
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
  if (s === 'M') return 'Masculino';
  if (s === 'F') return 'Feminino';
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
  const unitAeTitle = (unitData as any)?.pacs_ae_title || '';
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
    else if (period === '7days') studyDate = 'LAST_7_DAYS';
    else if (period === '30days') studyDate = 'LAST_30_DAYS';
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
    navigate(`/dicom-viewer/${study.studyInstanceUid}`);
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

  const handleReport = (study: any) => navigate(`/reports/create/${study.studyInstanceUid}`);

  const getReportStatus = (study: any) => {
    if (!study.studyInstanceUid) return "Pendente";
    // Status real do banco, fallback para Pendente
    return reportStatusMap[study.studyInstanceUid] || "Pendente";
  };

  const statusColors: Record<string, string> = {
    "Pendente": "bg-yellow-100 text-yellow-800 border-yellow-300",
    "Em Andamento": "bg-blue-100 text-blue-800 border-blue-300",
    "Concluído": "bg-green-100 text-green-800 border-green-300",
  };

  const modalityColor: Record<string, string> = {
    CT: "bg-purple-100 text-purple-800",
    CR: "bg-sky-100 text-sky-800",
    MR: "bg-indigo-100 text-indigo-800",
    US: "bg-teal-100 text-teal-800",
    DX: "bg-cyan-100 text-cyan-800",
    PT: "bg-rose-100 text-rose-800",
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── HEADER ── */}
      <header className="bg-white border-b border-gray-200 px-5 h-13 flex items-center justify-between shrink-0" style={{ height: 52 }}>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900 tracking-tight">LAUDS</span>
          {isAdminMaster && allUnits.length > 0 ? (
            <select
              value={selectedUnitId || ''}
              onChange={(e) => setSelectedUnitId(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded px-2 py-1 text-gray-700 bg-white h-7"
            >
              {allUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-gray-500 font-medium">{unitName}</span>
          )}
          {unitAeTitle && (
            <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">
              AE: {unitAeTitle}
            </span>
          )}
        </div>

        <nav className="flex items-center gap-1">
          <button className="px-3 py-1.5 rounded text-sm font-medium bg-blue-600 text-white">Estudos</button>
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="px-3 py-1.5 rounded text-sm font-medium text-gray-600 hover:bg-gray-100 flex items-center gap-1"
            >
              <Settings className="h-3.5 w-3.5" />
              Administração
            </button>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">{user?.name || 'Usuário'}</span>
          <button
            onClick={() => logoutMutation.mutate()}
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── FILTROS ── */}
      <div className="bg-white border-b border-gray-200 px-5 py-2 flex items-center gap-2 flex-wrap shrink-0">
        <Input
          placeholder="Buscar paciente..."
          value={filters.patientName}
          onChange={(e) => setFilters(f => ({ ...f, patientName: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && runQuery()}
          className="h-8 w-48 text-sm bg-white border-gray-300"
        />
        <div className="flex items-center gap-1 flex-wrap">
          {[
            { key: 'today', label: 'Hoje' },
            { key: '7days', label: '7 Dias' },
            { key: '30days', label: '30 Dias' },
            { key: 'all', label: 'Todos' },
            { key: 'custom', label: 'Período' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handlePeriodChange(key)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
                filters.period === key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => { setFilters(f => ({ ...f, shift: !f.shift })); }}
            className={`px-3 py-1.5 rounded text-xs font-medium border flex items-center gap-1 ${
              filters.shift ? 'bg-orange-500 text-white border-orange-500' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Clock className="h-3 w-3" />
            Plantão
          </button>
          {/* Inputs de data customizada */}
          {showCustomDate && (
            <div className="flex items-center gap-1 ml-1">
              <input
                type="date"
                value={customDateFrom}
                onChange={e => setCustomDateFrom(e.target.value)}
                className="h-7 px-2 text-xs border border-gray-300 rounded bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                title="Data inicial"
              />
              <span className="text-xs text-gray-400">até</span>
              <input
                type="date"
                value={customDateTo}
                onChange={e => setCustomDateTo(e.target.value)}
                className="h-7 px-2 text-xs border border-gray-300 rounded bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                title="Data final"
              />
              <button
                onClick={handleCustomDateSearch}
                disabled={isQuerying}
                className="px-2 py-1 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1"
              >
                <Search className="h-3 w-3" />
                Buscar
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => runQuery()}
          disabled={isQuerying}
          className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1"
        >
          <Search className="h-3 w-3" />
          {isQuerying ? 'Buscando...' : 'Buscar'}
        </button>
        {/* Filtro por modalidade — aparece após busca */}
        {availableModalities.length > 0 && (
          <div className="flex items-center gap-1 ml-2">
            <span className="text-xs text-gray-400">Modalidade:</span>
            {['ALL', ...availableModalities].map(mod => (
              <button
                key={mod}
                onClick={() => { setModalityFilter(mod); setCurrentPage(1); }}
                className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                  modalityFilter === mod
                    ? 'bg-gray-700 text-white border-gray-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {mod === 'ALL' ? 'Todos' : mod}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {filteredResults.length > 0 ? `Total: ${filteredResults.length}${modalityFilter !== 'ALL' ? ` (${modalityFilter})` : ''}` : ''}
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
              <tr className="bg-gray-100 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-3 py-2 text-left font-semibold w-28">Ações</th>
                <th className="px-3 py-2 text-left font-semibold w-40">Paciente</th>
                <th className="px-3 py-2 text-left font-semibold">Exame</th>
                <th className="px-3 py-2 text-left font-semibold w-28">Unidade</th>
                <th className="px-3 py-2 text-center font-semibold w-24">Status</th>
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
                const statusCls = statusColors[status] || 'bg-gray-100 text-gray-700 border-gray-300';

                return (
                  <tr
                    key={idx}
                    className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors"
                  >
                    {/* Ações */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {canViewer && (
                          <button
                            onClick={() => handleVisualize(study)}
                            title="Visualizar DICOM"
                            className="w-7 h-7 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenOrthancViewer(study)}
                          title="Abrir no Orthanc"
                          className="w-7 h-7 rounded-full bg-gray-400 hover:bg-gray-500 text-white flex items-center justify-center transition-colors"
                        >
                          <Monitor className="h-3.5 w-3.5" />
                        </button>
                        {canLaudo && (
                          <button
                            onClick={() => handleReport(study)}
                            title="Laudar"
                            className="w-7 h-7 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center transition-colors"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => toast.info('Impressão em desenvolvimento')}
                          title="Imprimir laudo"
                          className="w-7 h-7 rounded-full bg-gray-300 hover:bg-gray-400 text-gray-700 flex items-center justify-center transition-colors"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        {canCID && (
                          <button
                            onClick={() => { setSelectedStudy(study); setIsAnamnesisModalOpen(true); }}
                            title="CID / Anamnese"
                            className="w-7 h-7 rounded-full bg-orange-400 hover:bg-orange-500 text-white flex items-center justify-center transition-colors"
                          >
                            <Clipboard className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenRadiant(study)}
                          title="Abrir no RadiAnt"
                          className="w-7 h-7 rounded-full bg-indigo-400 hover:bg-indigo-500 text-white flex items-center justify-center transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => toast.info('Atribuição de médico em desenvolvimento')}
                          title="Médico responsável"
                          className="w-7 h-7 rounded-full bg-teal-400 hover:bg-teal-500 text-white flex items-center justify-center transition-colors"
                        >
                          <UserCircle className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-xs text-gray-400 ml-0.5 whitespace-nowrap">{relative}</span>
                      </div>
                    </td>

                    {/* Paciente */}
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900 text-sm leading-tight">{patientName}</div>
                      {(age || sex) && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {[age, sex].filter(Boolean).join(' | ')}
                        </div>
                      )}
                    </td>

                    {/* Exame */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${modalityCls}`}>{modality}</span>
                        <span className="text-sm text-gray-800">{dateFormatted}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                        {study.studyDescription || 'Sem descrição'}
                      </div>
                    </td>

                    {/* Unidade */}
                    <td className="px-3 py-2">
                      <span className="text-xs text-gray-600">{unitName}</span>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded border ${statusCls}`}>
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
      {queryResults.length > PAGE_SIZE && (
        <div className="bg-white border-t border-gray-200 px-5 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs text-gray-500">
            Total de Exames: {queryResults.length} — Página {currentPage} de {totalPages}
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
                      ? 'bg-blue-600 text-white border-blue-600'
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
