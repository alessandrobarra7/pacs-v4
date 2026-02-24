import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save, FileText, Check, Plus } from "lucide-react";

// Predefined phrases by category
const PREDEFINED_PHRASES = {
  normal: [
    "Exame dentro dos limites da normalidade.",
    "Não foram identificadas alterações significativas.",
    "Estruturas anatômicas preservadas.",
    "Ausência de lesões expansivas.",
  ],
  leve: [
    "Discreta alteração inflamatória.",
    "Sinais de processo inflamatório leve.",
    "Pequena área de densificação.",
    "Alterações degenerativas leves.",
  ],
  moderado: [
    "Processo inflamatório moderado.",
    "Alterações inflamatórias de intensidade moderada.",
    "Sinais de processo infeccioso em atividade.",
    "Alterações degenerativas moderadas.",
  ],
  grave: [
    "Processo inflamatório intenso.",
    "Alterações significativas.",
    "Lesão expansiva.",
    "Necessita correlação clínica e acompanhamento.",
  ],
};

const EXAM_NAMES = [
  "RX Tórax PA e Perfil",
  "TC Crânio sem contraste",
  "TC Crânio com contraste",
  "RM Coluna Lombar",
  "RM Coluna Cervical",
  "TC Abdome Total",
  "RX Coluna Lombar",
  "RX Coluna Cervical",
  "US Abdome Total",
  "US Transvaginal",
];

export default function ReportEditorPage() {
  const { studyInstanceUid } = useParams<{ studyInstanceUid: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [reportBody, setReportBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Fetch templates
  const { data: templates } = trpc.templates.list.useQuery();

  // Fetch study data (we'll need to add this procedure)
  // For now, we'll use mock data
  const studyData = {
    patientName: "MARCELL JEAN SOUSA DOS SANTOS",
    patientId: "700800919172781",
    studyDate: "20260224",
    studyTime: "140000",
    modality: "CR",
    studyDescription: "RX TORAX PA E PERFIL",
    accessionNumber: "ACC123456",
    referringPhysician: "Dr. Silva",
    radiologist: "Dr. Santos",
  };

  // Create report mutation
  const createReportMutation = trpc.reports.create.useMutation({
    onSuccess: () => {
      toast({
        title: "Laudo salvo",
        description: "O laudo foi salvo como rascunho com sucesso.",
      });
      setIsSaving(false);
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
      setIsSaving(false);
    },
  });

  // Replace variables in template
  const replaceVariables = (template: string): string => {
    const currentDate = new Date().toLocaleDateString("pt-BR");
    const currentTime = new Date().toLocaleTimeString("pt-BR");

    const variables: Record<string, string> = {
      patientName: studyData.patientName.replace(/\^/g, " "),
      patientId: studyData.patientId,
      studyDate: formatDate(studyData.studyDate),
      studyTime: formatTime(studyData.studyTime),
      modality: studyData.modality,
      studyDescription: studyData.studyDescription,
      accessionNumber: studyData.accessionNumber,
      referringPhysician: studyData.referringPhysician,
      radiologist: studyData.radiologist,
      currentDate,
      currentTime,
    };

    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      result = result.replace(regex, value);
    });

    return result;
  };

  // Format date from YYYYMMDD to DD/MM/YYYY
  const formatDate = (date: string): string => {
    if (!date || date.length !== 8) return date;
    return `${date.slice(6, 8)}/${date.slice(4, 6)}/${date.slice(0, 4)}`;
  };

  // Format time from HHMMSS to HH:MM
  const formatTime = (time: string): string => {
    if (!time || time.length < 4) return time;
    return `${time.slice(0, 2)}:${time.slice(2, 4)}`;
  };

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    const id = parseInt(templateId);
    setSelectedTemplateId(id);

    const template = templates?.find((t) => t.id === id);
    if (template) {
      const bodyWithVariables = replaceVariables(template.bodyTemplate);
      setReportBody(bodyWithVariables);
    }
  };

  // Handle save draft
  const handleSaveDraft = () => {
    if (!reportBody.trim()) {
      toast({
        title: "Erro",
        description: "O corpo do laudo não pode estar vazio.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    createReportMutation.mutate({
      study_id: 0, // Optional - will be null in DB
      study_instance_uid: studyInstanceUid,
      template_id: selectedTemplateId || undefined,
      body: reportBody,
    });
  };

  // Handle sign report
  const handleSignReport = () => {
    // TODO: Implement signing logic
    toast({
      title: "Funcionalidade em desenvolvimento",
      description: "Assinatura digital será implementada em breve.",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Editor de Laudo</h1>
            <p className="text-sm text-gray-600 mt-1">
              Paciente: {studyData.patientName.replace(/\^/g, " ")} | Exame: {studyData.studyDescription}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate("/pacs-query")}
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={!reportBody || isSaving}
            >
              <Save className="h-4 w-4 mr-2" />
              Salvar Rascunho
            </Button>
            <Button
              onClick={handleSignReport}
              disabled={!reportBody}
            >
              <Check className="h-4 w-4 mr-2" />
              Assinar e Finalizar
            </Button>
          </div>
        </div>

        {/* Study Info Card */}
        <Card className="p-4">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <Label className="text-gray-600">Data do Exame</Label>
              <p className="font-medium">{formatDate(studyData.studyDate)}</p>
            </div>
            <div>
              <Label className="text-gray-600">Hora</Label>
              <p className="font-medium">{formatTime(studyData.studyTime)}</p>
            </div>
            <div>
              <Label className="text-gray-600">Modalidade</Label>
              <p className="font-medium">{studyData.modality}</p>
            </div>
            <div>
              <Label className="text-gray-600">Médico Solicitante</Label>
              <p className="font-medium">{studyData.referringPhysician}</p>
            </div>
          </div>
        </Card>

        {/* Template Selection */}
        <Card className="p-4">
          <Label className="text-sm font-medium mb-2 block">Selecionar Template</Label>
          <Select onValueChange={handleTemplateSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha um template ou comece do zero" />
            </SelectTrigger>
            <SelectContent>
              {templates?.map((template) => (
                <SelectItem key={template.id} value={template.id.toString()}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>{template.name}</span>
                    {template.modality && (
                      <span className="text-xs text-gray-500">({template.modality})</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        {/* Report Editor with Sidebar */}
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          <div className="col-span-3 space-y-4">
            {/* Exam Names */}
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-3">Nome do Exame</h3>
              <div className="space-y-1">
                {EXAM_NAMES.map((name, idx) => (
                  <Button
                    key={idx}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs h-auto py-2"
                    onClick={() => setReportBody(prev => prev + (prev ? "\n\n" : "") + name)}
                  >
                    <Plus className="h-3 w-3 mr-2" />
                    {name}
                  </Button>
                ))}
              </div>
            </Card>

            {/* Predefined Phrases */}
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-3">Frases Pré-definidas</h3>
              
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-medium text-green-700 mb-1">Normal</h4>
                  <div className="space-y-1">
                    {PREDEFINED_PHRASES.normal.map((phrase, idx) => (
                      <Button
                        key={idx}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs h-auto py-2 text-left"
                        onClick={() => setReportBody(prev => prev + (prev ? " " : "") + phrase)}
                      >
                        <Plus className="h-3 w-3 mr-2 flex-shrink-0" />
                        <span className="line-clamp-2">{phrase}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-yellow-700 mb-1">Alterações Leves</h4>
                  <div className="space-y-1">
                    {PREDEFINED_PHRASES.leve.map((phrase, idx) => (
                      <Button
                        key={idx}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs h-auto py-2 text-left"
                        onClick={() => setReportBody(prev => prev + (prev ? " " : "") + phrase)}
                      >
                        <Plus className="h-3 w-3 mr-2 flex-shrink-0" />
                        <span className="line-clamp-2">{phrase}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-orange-700 mb-1">Alterações Moderadas</h4>
                  <div className="space-y-1">
                    {PREDEFINED_PHRASES.moderado.map((phrase, idx) => (
                      <Button
                        key={idx}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs h-auto py-2 text-left"
                        onClick={() => setReportBody(prev => prev + (prev ? " " : "") + phrase)}
                      >
                        <Plus className="h-3 w-3 mr-2 flex-shrink-0" />
                        <span className="line-clamp-2">{phrase}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-red-700 mb-1">Alterações Graves</h4>
                  <div className="space-y-1">
                    {PREDEFINED_PHRASES.grave.map((phrase, idx) => (
                      <Button
                        key={idx}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs h-auto py-2 text-left"
                        onClick={() => setReportBody(prev => prev + (prev ? " " : "") + phrase)}
                      >
                        <Plus className="h-3 w-3 mr-2 flex-shrink-0" />
                        <span className="line-clamp-2">{phrase}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Main Editor */}
          <div className="col-span-9">
            <Card className="p-4">
              <Label className="text-sm font-medium mb-2 block">Corpo do Laudo</Label>
              <Textarea
                value={reportBody}
                onChange={(e) => setReportBody(e.target.value)}
                placeholder="Digite o laudo ou selecione um template acima..."
                className="min-h-[600px] font-mono text-sm"
              />
              <div className="mt-2 text-xs text-gray-500">
                {reportBody.length} caracteres
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
