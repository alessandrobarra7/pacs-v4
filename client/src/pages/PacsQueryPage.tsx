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
  Clipboard
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { AnamnesisModal } from "@/components/AnamnesisModal";



export function PacsQueryPage() {
  const [, navigate] = useLocation();
  const { data: user } = trpc.auth.me.useQuery();
  const [unitName, setUnitName] = useState("Carregando...");
  
  const [filters, setFilters] = useState({
    patientName: "",
    studyDate: "",
    period: "today", // today, 7days, 30days, all
    shift: false, // plantão
  });

  const [queryResults, setQueryResults] = useState<any[]>(() => {
    // Restore previous search results from localStorage
    const saved = localStorage.getItem('pacs_query_results');
    return saved ? JSON.parse(saved) : [];
  });
  const [isQuerying, setIsQuerying] = useState(false);
  const [isAnamnesisModalOpen, setIsAnamnesisModalOpen] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState<any>(null);

  // Save query results to localStorage whenever they change
  useEffect(() => {
    if (queryResults.length > 0) {
      localStorage.setItem('pacs_query_results', JSON.stringify(queryResults));
      localStorage.setItem('pacs_last_period', filters.period);
    }
  }, [queryResults, filters.period]);

  // Get unit info
  const { data: unitData } = trpc.units.getById.useQuery(
    { id: user?.unit_id || 0 },
    { enabled: !!user?.unit_id }
  );

  useEffect(() => {
    if (unitData) {
      setUnitName(unitData.name || "Unidade");
    }
  }, [unitData]);

  // Query PACS mutation
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
    console.log('[Frontend] filters.studyDate:', filters.studyDate);
    setIsQuerying(true);
    // Convert date from YYYY-MM-DD to YYYYMMDD format for backend
    let studyDate = filters.studyDate;
    if (studyDate && studyDate.includes('-')) {
      studyDate = studyDate.replace(/-/g, '');
    }
    console.log('[Frontend] Converted studyDate:', studyDate);
    // Keep the original format in state for display
    queryPacs.mutate({
      patientName: filters.patientName,
      patientId: "",
      modality: "ALL",
      studyDate: studyDate,
      accessionNumber: "",
    });
  };

  const handleTodayExams = () => {
    // Send special value 'TODAY' to let backend calculate server's date
    setFilters({ ...filters, studyDate: 'TODAY', period: "today" });
    setIsQuerying(true);
    queryPacs.mutate({
      patientName: "",
      patientId: "",
      modality: "ALL",
      studyDate: "TODAY",
      accessionNumber: "",
    });
  };

  const handlePeriodChange = (period: string) => {
    setFilters({ ...filters, period, studyDate: '' });
    setIsQuerying(true);
    
    let studyDate = '';
    if (period === 'today') {
      studyDate = 'TODAY';
    } else if (period === '7days') {
      studyDate = 'LAST_7_DAYS';
    } else if (period === '30days') {
      studyDate = 'LAST_30_DAYS';
    } else if (period === 'all') {
      studyDate = ''; // Empty means no date filter
    }
    
    queryPacs.mutate({
      patientName: filters.patientName,
      patientId: "",
      modality: "ALL",
      studyDate: studyDate,
      accessionNumber: "",
    });
  };

  const handleVisualize = (study: any) => {
    toast.info(`Visualizador em desenvolvimento para: ${study.patientName}`);
  };

  const handleReport = (study: any) => {
    // Navigate to report editor with study instance UID
    navigate(`/reports/create/${study.studyInstanceUid}`);
  };

  const getReportStatus = (study: any) => {
    // Mock status - será implementado com dados reais
    const statuses = ["Pendente", "Em Andamento", "Concluído"];
    return statuses[Math.floor(Math.random() * statuses.length)];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Pendente":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "Em Andamento":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "Concluído":
        return "bg-green-100 text-green-800 border-green-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Exames</h1>
            <p className="text-xs text-gray-600 mt-0.5">
              Bem-vindo à {unitName}
            </p>
          </div>
          <div className="text-sm font-medium text-gray-900">
            {queryResults.length} estudo(s) encontrado(s)
          </div>
        </div>
      </div>

      {/* Simplified Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-end gap-3 mb-3">
          {/* Patient Name */}
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              Nome do Paciente
            </label>
            <Input
              placeholder="Digite o nome do paciente..."
              value={filters.patientName}
              onChange={(e) => setFilters({ ...filters, patientName: e.target.value })}
              className="h-9 text-sm"
            />
          </div>

          {/* Quick Period Filters */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-700">
              Período:
            </label>
            <Button 
              variant={filters.period === 'today' ? 'default' : 'outline'}
              onClick={() => handlePeriodChange('today')}
              className="h-9 px-3 text-sm"
            >
              <Calendar className="h-4 w-4 mr-1" />
              Hoje
            </Button>
            <Button 
              variant={filters.period === '7days' ? 'default' : 'outline'}
              onClick={() => handlePeriodChange('7days')}
              className="h-9 px-3 text-sm"
            >
              7 Dias
            </Button>
            <Button 
              variant={filters.period === '30days' ? 'default' : 'outline'}
              onClick={() => handlePeriodChange('30days')}
              className="h-9 px-3 text-sm"
            >
              30 Dias
            </Button>
            <Button 
              variant={filters.period === 'all' ? 'default' : 'outline'}
              onClick={() => handlePeriodChange('all')}
              className="h-9 px-3 text-sm"
            >
              Todos
            </Button>
          </div>

          {/* Shift Button */}
          <Button 
            variant={filters.shift ? "default" : "outline"}
            onClick={() => setFilters({ ...filters, shift: !filters.shift })}
            className="h-9 px-4 text-sm"
          >
            <Clock className="h-4 w-4 mr-2" />
            Plantão
          </Button>

          {/* Search Button */}
          <Button 
            type="button"
            onClick={handleSearch} 
            disabled={isQuerying}
            className="h-9 px-6 text-sm"
          >
            {isQuerying ? (
              <>
                <Search className="h-4 w-4 mr-2 animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Buscar
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Results Table */}
      <div className="px-6 py-4">
        {queryResults.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
            <Search className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-base font-medium">Nenhum estudo encontrado</p>
            <p className="text-gray-400 text-sm mt-2">Use os filtros acima para buscar estudos</p>
            <Button 
              onClick={handleTodayExams}
              variant="outline"
              className="mt-4"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Ver Exames de Hoje
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="py-3 text-xs font-semibold text-gray-700 w-[140px]">
                    Data de Realização
                  </TableHead>
                  <TableHead className="py-3 text-xs font-semibold text-gray-700">
                    Nome do Paciente
                  </TableHead>
                  <TableHead className="py-3 text-xs font-semibold text-gray-700 w-[400px] text-center">
                    Ações
                  </TableHead>
                  <TableHead className="py-3 text-xs font-semibold text-gray-700 w-[180px]">
                    Médico
                  </TableHead>
                  <TableHead className="py-3 text-xs font-semibold text-gray-700 w-[140px]">
                    Status de Laudo
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queryResults.map((study, index) => {
                  const status = getReportStatus(study);
                  return (
                    <TableRow key={index} className="hover:bg-gray-50 border-b border-gray-100">
                      {/* Date Column */}
                      <TableCell className="py-3">
                        <div className="text-sm font-medium text-gray-900">
                          {study.studyDate ? 
                            new Date(study.studyDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).toLocaleDateString('pt-BR') 
                            : "-"}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {study.studyTime || ""}
                        </div>
                      </TableCell>

                      {/* Patient Name Column */}
                      <TableCell className="py-3">
                        <div className="text-sm font-medium text-gray-900">
                          {study.patientName ? study.patientName.replace(/\^/g, ' ').replace(/\s+\d{10,}$/g, '') : "-"}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500">
                            {study.studyDescription || "Sem descrição"} • {study.modality || "-"}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 hover:bg-gray-100"
                            onClick={() => toast.info('Edição de descrição em desenvolvimento')}
                          >
                            <Edit2 className="h-3 w-3 text-gray-400" />
                          </Button>
                        </div>
                      </TableCell>

                      {/* Actions Column */}
                      <TableCell className="py-3">
                        <div className="flex items-center justify-center gap-2">
                          {/* CID-Indicações Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 hover:bg-orange-50 hover:border-orange-300"
                            onClick={() => {
                              setSelectedStudy(study);
                              setShowAnamnesisModal(true);
                            }}
                          >
                            <Clipboard className="h-4 w-4 mr-1.5 text-orange-600" />
                            <span className="text-xs">CID</span>
                          </Button>
                          
                          {/* Ver Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 hover:bg-purple-50 hover:border-purple-300"
                            onClick={() => handleVisualize(study)}
                          >
                            <Eye className="h-4 w-4 mr-1.5 text-purple-600" />
                            <span className="text-xs">Ver</span>
                          </Button>
                          
                          {/* Laudar Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 hover:bg-pink-50 hover:border-pink-300"
                            onClick={() => handleReport(study)}
                          >
                            <FileText className="h-4 w-4 mr-1.5 text-pink-600" />
                            <span className="text-xs">Laudar</span>
                          </Button>
                          
                          {/* Impressão de Laudo Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 hover:bg-blue-50 hover:border-blue-300"
                            onClick={() => toast.info('Impressão de laudo em desenvolvimento')}
                          >
                            <Printer className="h-4 w-4 mr-1.5 text-blue-600" />
                            <span className="text-xs">Imprimir</span>
                          </Button>
                          
                          {/* Escolha de Médico Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 hover:bg-green-50 hover:border-green-300"
                            onClick={() => toast.info('Escolha de médico em desenvolvimento')}
                          >
                            <UserCircle className="h-4 w-4 mr-1.5 text-green-600" />
                            <span className="text-xs">Médico</span>
                          </Button>
                        </div>
                      </TableCell>

                      {/* Doctor Column */}
                      <TableCell className="py-3">
                        <div className="text-sm text-gray-900">
                          {user?.name || "-"}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          CRM: {user?.id || "-"}
                        </div>
                      </TableCell>

                      {/* Report Status Column */}
                      <TableCell className="py-3">
                        <Badge 
                          variant="outline" 
                          className={`text-xs px-2.5 py-1 font-medium ${getStatusColor(status)}`}
                        >
                          {status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Anamnesis Modal */}
      {showAnamnesisModal && selectedStudy && (
        <AnamnesisModal
          isOpen={showAnamnesisModal}
          onClose={() => {
            setShowAnamnesisModal(false);
            setSelectedStudy(null);
          }}
          studyInstanceUid={selectedStudy.studyInstanceUid}
          patientName={selectedStudy.patientName?.replace(/\^/g, ' ').replace(/\s+\d{10,}$/g, '') || ""}
          modality={selectedStudy.modality || ""}
        />
      )}
    </div>
  );
}
