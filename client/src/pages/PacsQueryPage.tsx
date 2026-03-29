import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Eye,
  FileText,
  Calendar,
  Clock,
  Edit2,
  Printer,
  UserCircle,
  Clipboard,
  ExternalLink,
  LogOut,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { AnamnesisModal } from "@/components/AnamnesisModal";
import { canReport, canAccessAdmin, canFillAnamnesis, canViewDICOM, type UserRole } from "../../../shared/permissions";

export function PacsQueryPage() {
  const [, navigate] = useLocation();
  const { data: user } = trpc.auth.me.useQuery();

  const userRole = (user?.role || 'viewer') as UserRole;
  const canLaudo = canReport(userRole);
  const canCID = canFillAnamnesis(userRole);
  const canViewer = canViewDICOM(userRole);
  const isAdmin = canAccessAdmin(userRole);
  const isAdminMaster = user?.role === 'admin_master';

  // admin_master pode escolher qualquer unidade; outros usam a unidade do próprio perfil
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const effectiveUnitId = isAdminMaster ? selectedUnitId : (user?.unit_id || null);

  const { data: allUnits = [] } = trpc.units.list.useQuery(
    undefined,
    { enabled: isAdminMaster }
  );

  const { data: unitData } = trpc.units.getById.useQuery(
    { id: effectiveUnitId || 0 },
    { enabled: !!effectiveUnitId }
  );

  // Inicializa selectedUnitId para admin_master com a primeira unidade disponível
  useEffect(() => {
    if (isAdminMaster && allUnits.length > 0 && selectedUnitId === null) {
      setSelectedUnitId(allUnits[0].id);
    }
  }, [isAdminMaster, allUnits, selectedUnitId]);

  const unitName = unitData?.name || (effectiveUnitId ? 'Carregando...' : 'Sem unidade');
  const unitAeTitle = (unitData as any)?.pacs_ae_title || '';

  const cacheKey = `pacs_query_results_unit_${effectiveUnitId || 'none'}`;

  const [filters, setFilters] = useState({
    patientName: "",
    studyDate: "",
    period: "today",
    shift: false,
  });

  const [queryResults, setQueryResults] = useState<any[]>(() => {
    const saved = localStorage.getItem(cacheKey);
    return saved ? JSON.parse(saved) : [];
  });
  const [isQuerying, setIsQuerying] = useState(false);
  const [isAnamnesisModalOpen, setIsAnamnesisModalOpen] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState<any>(null);

  // Limpa resultados ao trocar de unidade
  useEffect(() => {
    const saved = localStorage.getItem(cacheKey);
    setQueryResults(saved ? JSON.parse(saved) : []);
  }, [cacheKey]);

  useEffect(() => {
    if (queryResults.length > 0) {
      localStorage.setItem(cacheKey, JSON.stringify(queryResults));
    }
  }, [queryResults, cacheKey]);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      Object.keys(localStorage).filter(k => k.startsWith('pacs_query_results')).forEach(k => localStorage.removeItem(k));
      navigate("/login");
    },
  });

  const queryPacs = trpc.pacs.query.useMutation({
    onSuccess: (data: any) => {
      setQueryResults(data.studies || []);
      toast.success(`${data.studies?.length || 0} estudos encontrados`);
      setIsQuerying(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao consultar PACS");
      setIsQuerying(false);
    },
  });

  const handleSearch = () => {
    setIsQuerying(true);
    let studyDate = filters.studyDate;
    if (studyDate && studyDate.includes('-')) {
      studyDate = studyDate.replace(/-/g, '');
    }
    queryPacs.mutate({
      patientName: filters.patientName,
      patientId: "",
      modality: "",
      studyDate: studyDate,
      accessionNumber: "",
      unit_id: effectiveUnitId || undefined,
    });
  };

  const handleTodayExams = () => {
    setFilters({ ...filters, studyDate: 'TODAY', period: "today" });
    setIsQuerying(true);
    queryPacs.mutate({
      patientName: "",
      patientId: "",
      modality: "",
      studyDate: "TODAY",
      accessionNumber: "",
      unit_id: effectiveUnitId || undefined,
    });
  };

  const handlePeriodChange = (period: string) => {
    setFilters({ ...filters, period, studyDate: '' });
    setIsQuerying(true);
    let studyDate = '';
    if (period === 'today') studyDate = 'TODAY';
    else if (period === '7days') studyDate = 'LAST_7_DAYS';
    else if (period === '30days') studyDate = 'LAST_30_DAYS';
    queryPacs.mutate({
      patientName: filters.patientName,
      patientId: "",
      modality: "",
      studyDate: studyDate,
      accessionNumber: "",
      unit_id: effectiveUnitId || undefined,
    });
  };

  const handleVisualize = (study: any) => {
    if (!study.studyInstanceUid) { toast.error('UID do estudo não disponível'); return; }
    navigate(`/dicom-viewer/${study.studyInstanceUid}`);
  };

  const handleOpenRadiant = (study: any) => {
    if (!study.studyInstanceUid) { toast.error('UID do estudo não disponível'); return; }
    const radiantUrl = `radiant://?n=1&v=0020000D&v=${study.studyInstanceUid}`;
    window.location.href = radiantUrl;
    toast.info('Abrindo no RadiAnt DICOM Viewer...');
  };

  const handleOpenOrthancViewer = (study: any) => {
    if (!study.orthancId && !study.studyInstanceUid) { toast.error('ID do estudo não disponível'); return; }
    const orthancBase = (unitData as any)?.orthanc_public_url || (unitData as any)?.orthanc_base_url || 'http://45.189.160.17:8042';
    const viewerUrl = study.orthancId
      ? `${orthancBase}/osimis-viewer/app/index.html?study=${study.orthancId}`
      : `${orthancBase}/osimis-viewer/app/index.html?studyInstanceUid=${study.studyInstanceUid}`;
    window.open(viewerUrl, '_blank');
  };

  const handleReport = (study: any) => {
    navigate(`/reports/create/${study.studyInstanceUid}`);
  };

  const getReportStatus = (study: any) => {
    if (!study.studyInstanceUid) return "Pendente";
    const hash = study.studyInstanceUid.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    const statuses = ["Pendente", "Pendente", "Pendente", "Em Andamento", "Concluído"];
    return statuses[hash % statuses.length];
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Pendente": return <Badge variant="outline" className="text-xs border-yellow-300 text-yellow-700 bg-yellow-50">{status}</Badge>;
      case "Em Andamento": return <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-blue-50">{status}</Badge>;
      case "Concluído": return <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">{status}</Badge>;
      default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* ── HEADER LAUDS ── */}
      <header className="bg-white border-b border-gray-200 px-6 h-14 flex items-center justify-between">
        {/* Logo + Unidade */}
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-gray-900 tracking-tight">LAUDS</span>
          {isAdminMaster && allUnits.length > 0 ? (
            <select
              value={selectedUnitId || ''}
              onChange={(e) => setSelectedUnitId(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded px-2 py-1 text-gray-700 bg-white h-8"
            >
              {allUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-gray-500">{unitName}</span>
          )}
          {unitAeTitle && (
            <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200">
              AE: {unitAeTitle}
            </span>
          )}
        </div>

        {/* Navegação central */}
        <nav className="flex items-center gap-1">
          <button className="px-4 py-1.5 rounded text-sm font-medium bg-blue-600 text-white">
            Estudos
          </button>
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="px-4 py-1.5 rounded text-sm font-medium text-gray-600 hover:bg-gray-100 flex items-center gap-1.5"
            >
              <Settings className="h-4 w-4" />
              Administração
            </button>
          )}
        </nav>

        {/* Usuário + Logout */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700">{user?.name || 'Usuário'}</span>
          <button
            onClick={() => logoutMutation.mutate()}
            className="p-1.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── FILTROS ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Input
            placeholder="Buscar paciente..."
            value={filters.patientName}
            onChange={(e) => setFilters({ ...filters, patientName: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="h-9 w-56 text-sm bg-white border-gray-300"
          />
          <div className="flex items-center gap-1">
            {[
              { key: 'today', label: 'Hoje' },
              { key: '7days', label: '7 Dias' },
              { key: '30days', label: '30 Dias' },
              { key: 'all', label: 'Todos' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handlePeriodChange(key)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  filters.period === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setFilters({ ...filters, shift: !filters.shift })}
            className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors flex items-center gap-1.5 ${
              filters.shift ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Plantão
          </button>
          <button
            onClick={handleSearch}
            disabled={isQuerying}
            className="px-4 py-1.5 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5"
          >
            <Search className="h-3.5 w-3.5" />
            {isQuerying ? 'Buscando...' : 'Buscar'}
          </button>
          <span className="ml-auto text-sm text-gray-500">{queryResults.length} estudo(s)</span>
        </div>
      </div>

      {/* ── TABELA ── */}
      <div className="px-6 py-4">
        {queryResults.length === 0 ? (
          <div className="text-center py-20 bg-white rounded border border-gray-200">
            <p className="text-gray-500 text-sm">Nenhum estudo encontrado</p>
            <button
              onClick={handleTodayExams}
              className="mt-3 px-4 py-1.5 rounded text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
            >
              <Calendar className="h-3.5 w-3.5" />
              Ver Exames de Hoje
            </button>
          </div>
        ) : (
          <div className="bg-white rounded border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 border-b border-gray-200">
                  <TableHead className="py-3 text-xs font-semibold text-gray-600 w-[130px]">Data</TableHead>
                  <TableHead className="py-3 text-xs font-semibold text-gray-600">Paciente</TableHead>
                  <TableHead className="py-3 text-xs font-semibold text-gray-600 w-[160px]">Unidade</TableHead>
                  <TableHead className="py-3 text-xs font-semibold text-gray-600 text-center w-[90px]">Visualizar</TableHead>
                  <TableHead className="py-3 text-xs font-semibold text-gray-600 text-center w-[90px]">Impressão</TableHead>
                  <TableHead className="py-3 text-xs font-semibold text-gray-600 text-center w-[280px]">Ações</TableHead>
                  <TableHead className="py-3 text-xs font-semibold text-gray-600 w-[120px]">Status Envio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queryResults.map((study, index) => {
                  const status = getReportStatus(study);
                  const patientName = study.patientName
                    ? study.patientName.replace(/\^/g, ' ').replace(/\s+\d{10,}.*$/g, '').trim()
                    : "-";
                  const studyDateFormatted = study.studyDate
                    ? new Date(study.studyDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).toLocaleDateString('pt-BR')
                    : "-";

                  return (
                    <TableRow key={index} className="hover:bg-gray-50 border-b border-gray-100 last:border-0">
                      {/* Data */}
                      <TableCell className="py-3">
                        <div className="text-sm text-gray-900">{studyDateFormatted}</div>
                        {study.studyTime && (
                          <div className="text-xs text-gray-400 mt-0.5">{study.studyTime}</div>
                        )}
                      </TableCell>

                      {/* Paciente */}
                      <TableCell className="py-3">
                        <div className="text-sm font-medium text-gray-900">{patientName}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {study.studyDescription || "Sem descrição"} · {study.modality || "-"}
                        </div>
                      </TableCell>

                      {/* Unidade */}
                      <TableCell className="py-3">
                        <div className="text-sm text-gray-700">{unitName}</div>
                      </TableCell>

                      {/* Visualizar */}
                      <TableCell className="py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={() => handleVisualize(study)}
                            className="px-2.5 py-1 rounded text-xs border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-1"
                            title="Visualizador DICOM (Cornerstone)"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Ver
                          </button>
                          <button
                            onClick={() => handleOpenOrthancViewer(study)}
                            className="px-2.5 py-1 rounded text-xs border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-1"
                            title="Orthanc Web Viewer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Orthanc
                          </button>
                        </div>
                      </TableCell>

                      {/* Impressão */}
                      <TableCell className="py-3 text-center">
                        <button
                          onClick={() => toast.info('Impressão de laudo em desenvolvimento')}
                          className="px-2.5 py-1 rounded text-xs border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-1 mx-auto"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Imprimir
                        </button>
                      </TableCell>

                      {/* Ações */}
                      <TableCell className="py-3">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {canCID && (
                            <button
                              onClick={() => { setSelectedStudy(study); setIsAnamnesisModalOpen(true); }}
                              className="px-2.5 py-1 rounded text-xs border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1"
                            >
                              <Clipboard className="h-3.5 w-3.5" />
                              CID
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenRadiant(study)}
                            className="px-2.5 py-1 rounded text-xs border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-1"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            RadiAnt
                          </button>
                          {canLaudo && (
                            <button
                              onClick={() => handleReport(study)}
                              className="px-2.5 py-1 rounded text-xs border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 flex items-center gap-1"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Laudar
                            </button>
                          )}
                          <button
                            onClick={() => toast.info('Escolha de médico em desenvolvimento')}
                            className="px-2.5 py-1 rounded text-xs border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-1"
                          >
                            <UserCircle className="h-3.5 w-3.5" />
                            Médico
                          </button>
                        </div>
                      </TableCell>

                      {/* Status Envio */}
                      <TableCell className="py-3">
                        {getStatusBadge(status)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {isAnamnesisModalOpen && selectedStudy && (
        <AnamnesisModal
          open={isAnamnesisModalOpen}
          onClose={() => { setIsAnamnesisModalOpen(false); setSelectedStudy(null); }}
          studyInstanceUid={selectedStudy.studyInstanceUid}
          onSave={() => { setIsAnamnesisModalOpen(false); setSelectedStudy(null); }}
        />
      )}
    </div>
  );
}
