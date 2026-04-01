import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save, FileText, Check, Plus, ArrowLeft, User, Calendar, Hash, Stethoscope, Building2, Layers, ClipboardList } from "lucide-react";

// Frases pré-definidas por categoria
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

/** Formata data DICOM YYYYMMDD → DD/MM/YYYY */
function formatDate(date: string): string {
  if (!date || date.length < 8) return date || "-";
  return `${date.slice(6, 8)}/${date.slice(4, 6)}/${date.slice(0, 4)}`;
}

/** Formata hora DICOM HHMMSS → HH:MM */
function formatTime(time: string): string {
  if (!time || time.length < 4) return time || "-";
  return `${time.slice(0, 2)}:${time.slice(2, 4)}`;
}

/** Calcula idade a partir de data de nascimento DICOM */
function calcAge(birthDate: string): string {
  if (!birthDate || birthDate.length < 8) return "";
  const birth = new Date(
    `${birthDate.slice(0, 4)}-${birthDate.slice(4, 6)}-${birthDate.slice(6, 8)}`
  );
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  if (age < 0 || age > 130) return "";
  if (age < 1) {
    const months = Math.floor(
      (now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    return `${months} meses`;
  }
  return `${age} anos`;
}

/** Normaliza sexo DICOM */
function formatSex(sex: string): string {
  if (!sex) return "-";
  const s = sex.toUpperCase().trim();
  if (s === "M") return "Masculino";
  if (s === "F") return "Feminino";
  return sex;
}

/** Cor do badge de modalidade */
const modalityColor: Record<string, string> = {
  CT: "bg-purple-100 text-purple-800 border-purple-300",
  CR: "bg-sky-100 text-sky-800 border-sky-300",
  MR: "bg-indigo-100 text-indigo-800 border-indigo-300",
  US: "bg-teal-100 text-teal-800 border-teal-300",
  DX: "bg-cyan-100 text-cyan-800 border-cyan-300",
  PT: "bg-rose-100 text-rose-800 border-rose-300",
};

interface StudyData {
  patientName: string;
  patientID: string;
  patientBirthDate: string;
  patientSex: string;
  studyDate: string;
  studyTime: string;
  modality: string;
  studyDescription: string;
  accessionNumber: string;
  numberOfInstances: number;
  unitName: string;
  unitId: string;
}

export default function ReportEditorPage() {
  const { studyInstanceUid } = useParams<{ studyInstanceUid: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [reportBody, setReportBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Carrega dados reais do estudo do sessionStorage (salvos ao clicar em Laudar)
  const [studyData, setStudyData] = useState<StudyData>({
    patientName: "",
    patientID: "",
    patientBirthDate: "",
    patientSex: "",
    studyDate: "",
    studyTime: "",
    modality: "",
    studyDescription: "",
    accessionNumber: "",
    numberOfInstances: 0,
    unitName: "",
    unitId: "",
  });

  useEffect(() => {
    if (!studyInstanceUid) return;
    const raw = sessionStorage.getItem(`study_${studyInstanceUid}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setStudyData(parsed);
      } catch {
        // sessionStorage corrompido — mantém estado vazio
      }
    }
  }, [studyInstanceUid]);

  // Busca anamnese do estudo
  const { data: anamnesisData } = trpc.anamnesisSimple.getByStudy.useQuery(
    { studyInstanceUid: studyInstanceUid ?? "" },
    { enabled: !!studyInstanceUid }
  );
  // Busca metadados editados pelo técnico
  const { data: studyMetaRaw } = trpc.studyMetadata.get.useQuery(
    { studyInstanceUid: studyInstanceUid ?? "" },
    { enabled: !!studyInstanceUid }
  );
  const studyMeta = studyMetaRaw as any;

  // Busca templates
  const { data: templates } = trpc.templates.list.useQuery();

  // Busca usuário logado (para nome do radiologista)
  const { data: user } = trpc.auth.me.useQuery();

  // Substitui variáveis no template
  const replaceVariables = (template: string): string => {
    const currentDate = new Date().toLocaleDateString("pt-BR");
    const currentTime = new Date().toLocaleTimeString("pt-BR");
    const age = calcAge(studyData.patientBirthDate);

    const variables: Record<string, string> = {
      patientName: studyData.patientName.replace(/\^/g, " ") || "{{patientName}}",
      patientId: studyData.patientID || "{{patientId}}",
      patientBirthDate: formatDate(studyData.patientBirthDate),
      patientAge: age,
      patientSex: formatSex(studyData.patientSex),
      studyDate: formatDate(studyData.studyDate),
      studyTime: formatTime(studyData.studyTime),
      modality: studyData.modality || "{{modality}}",
      studyDescription: studyData.studyDescription || "{{studyDescription}}",
      accessionNumber: studyData.accessionNumber || "{{accessionNumber}}",
      unitName: studyData.unitName || "{{unitName}}",
      radiologist: user?.name || user?.username || "{{radiologist}}",
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

  // Seleção de template
  const handleTemplateSelect = (templateId: string) => {
    const id = parseInt(templateId);
    setSelectedTemplateId(id);
    const template = templates?.find((t) => t.id === id);
    if (template) {
      setReportBody(replaceVariables(template.bodyTemplate));
    }
  };

  // Mutation de criação de laudo
  const createReportMutation = trpc.reports.create.useMutation({
    onSuccess: () => {
      toast({ title: "Laudo salvo", description: "Rascunho salvo com sucesso." });
      setIsSaving(false);
    },
    onError: (error) => {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      setIsSaving(false);
    },
  });

  const handleSaveDraft = () => {
    if (!reportBody.trim()) {
      toast({ title: "Erro", description: "O corpo do laudo não pode estar vazio.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    createReportMutation.mutate({
      study_id: 0,
      study_instance_uid: studyInstanceUid,
      template_id: selectedTemplateId || undefined,
      body: reportBody,
    });
  };

  const handleSignReport = () => {
    toast({ title: "Funcionalidade em desenvolvimento", description: "Assinatura digital será implementada em breve." });
  };

  const patientDisplayName = studyData.patientName
    ? studyData.patientName.replace(/\^/g, " ").trim()
    : "Paciente não identificado";

  const age = calcAge(studyData.patientBirthDate);
  const modBadgeClass = modalityColor[studyData.modality?.toUpperCase()] || "bg-gray-100 text-gray-700 border-gray-300";

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── HEADER ── */}
      <div
        className="px-5 flex items-center justify-between sticky top-0 z-10"
        style={{ background: '#2c2420', height: 56 }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Logo clicável */}
          <button
            onClick={() => navigate("/pacs-query")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity focus:outline-none flex-shrink-0"
            title="Voltar para listagem de exames"
          >
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310419663028509564/cTdrattvNQ95XCgX9zeyNM/lauds_logo_branco_final_c960f283.png"
              alt="Lauds"
              className="object-contain"
              style={{ height: 36 }}
            />
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-white font-bold text-sm tracking-tight">lauds</span>
              <span className="text-white/40 text-xs">Gestão de Laudos Radiológicos</span>
            </div>
          </button>
          <div className="h-5 w-px bg-white/20 flex-shrink-0" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/pacs-query")}
            className="text-white/70 hover:text-white hover:bg-white/10 flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div className="h-5 w-px bg-white/20 flex-shrink-0" />
          <div className="min-w-0 hidden sm:block">
            <h1 className="text-sm font-bold text-white leading-tight">Editor de Laudo</h1>
            <p className="text-xs text-white/50 truncate">
              {patientDisplayName}
              {studyData.studyDescription ? ` · ${studyData.studyDescription}` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={!reportBody || isSaving}
            className="border-white/30 text-white/80 hover:bg-white/10 hover:text-white bg-transparent"
          >
            <Save className="h-4 w-4 mr-1.5" />
            Salvar Rascunho
          </Button>
          <Button size="sm" onClick={handleSignReport} disabled={!reportBody} className="bg-green-600 hover:bg-green-700 text-white">
            <Check className="h-4 w-4 mr-1.5" />
            Assinar e Finalizar
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">

        {/* ── CARD DE IDENTIFICAÇÃO DO PACIENTE ── */}
        <Card className="p-0 overflow-hidden border-gray-200">
          {/* Faixa colorida no topo */}
          <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-400" />
          <div className="p-4">
            {/* Nome do paciente em destaque */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                  <User className="h-4.5 w-4.5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-bold text-gray-900 leading-tight truncate">
                    {patientDisplayName}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {studyData.patientID && (
                      <span className="text-xs text-gray-500 font-mono">ID: {studyData.patientID}</span>
                    )}
                    {studyData.patientSex && (
                      <span className="text-xs text-gray-500">{formatSex(studyData.patientSex)}</span>
                    )}
                    {age && (
                      <span className="text-xs text-gray-500">{age}</span>
                    )}
                    {studyData.patientBirthDate && (
                      <span className="text-xs text-gray-400">
                        (Nasc: {formatDate(studyData.patientBirthDate)})
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {studyData.modality && (
                  <Badge variant="outline" className={`text-xs font-bold px-2 py-0.5 ${modBadgeClass}`}>
                    {studyData.modality}
                  </Badge>
                )}
              </div>
            </div>

            {/* Grid de informações do exame */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-gray-100">
              <div className="flex items-start gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Data do Exame</p>
                  <p className="text-sm font-semibold text-gray-800">{formatDate(studyData.studyDate) || "-"}</p>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Hora</p>
                  <p className="text-sm font-semibold text-gray-800">{formatTime(studyData.studyTime) || "-"}</p>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <Stethoscope className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Exame</p>
                  <p className="text-sm font-semibold text-gray-800 truncate" title={studyData.studyDescription}>
                    {studyData.studyDescription || "-"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <Hash className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Acesso</p>
                  <p className="text-sm font-semibold text-gray-800 font-mono">
                    {studyData.accessionNumber || "-"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <Layers className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Imagens</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {studyData.numberOfInstances || "-"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Unidade</p>
                  <p className="text-sm font-semibold text-gray-800 truncate" title={studyData.unitName}>
                    {studyData.unitName || "-"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ── METADADOS EDITADOS PELO TÉCNICO ── */}
        {studyMeta && (studyMeta.patient_name_override || studyMeta.description_override || studyMeta.notes) && (
          <Card className="p-4 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-2">
              <span className="text-amber-600 mt-0.5 shrink-0 text-sm">✏️</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide">Informações Editadas pelo Técnico</p>
                <div className="space-y-1">
                  {studyMeta.patient_name_override && (
                    <p className="text-sm text-gray-800">
                      <span className="font-medium text-amber-700">Paciente:</span> {studyMeta.patient_name_override}
                    </p>
                  )}
                  {studyMeta.description_override && (
                    <p className="text-sm text-gray-800">
                      <span className="font-medium text-amber-700">Exame:</span> {studyMeta.description_override}
                    </p>
                  )}
                  {studyMeta.notes && (
                    <p className="text-sm text-gray-800">
                      <span className="font-medium text-amber-700">Observações:</span> {studyMeta.notes}
                    </p>
                  )}
                  {studyMeta.edited_by_name && (
                    <p className="text-xs text-gray-500 mt-1">
                      Editado por {studyMeta.edited_by_name} • {studyMeta.updatedAt ? new Date(studyMeta.updatedAt).toLocaleString('pt-BR') : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ── ANAMNESE ── */}
        {anamnesisData && (
          <Card className="p-4 border-emerald-200 bg-emerald-50">
            <div className="flex items-start gap-2">
              <ClipboardList className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-700 mb-1 uppercase tracking-wide">Indicação Clínica / Anamnese</p>
                {(anamnesisData.presets as string[])?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {(anamnesisData.presets as string[]).map((p: string) => (
                      <span key={p} className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 rounded px-1.5 py-0.5">{p}</span>
                    ))}
                  </div>
                )}
                <p className="text-sm text-gray-800 leading-relaxed">{anamnesisData.manual_text}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Registrado em: {new Date(anamnesisData.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* ── SELEÇÃO DE TEMPLATE ── */}
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

        {/* ── EDITOR + SIDEBAR ── */}
        <div className="grid grid-cols-12 gap-4">
          {/* Sidebar */}
          <div className="col-span-3 space-y-4">
            {/* Nomes de Exame */}
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-3">Nome do Exame</h3>
              <div className="space-y-1">
                {EXAM_NAMES.map((name, idx) => (
                  <Button
                    key={idx}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs h-auto py-2"
                    onClick={() => setReportBody((prev) => prev + (prev ? "\n\n" : "") + name)}
                  >
                    <Plus className="h-3 w-3 mr-2 flex-shrink-0" />
                    {name}
                  </Button>
                ))}
              </div>
            </Card>

            {/* Frases Pré-definidas */}
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-3">Frases Pré-definidas</h3>
              <div className="space-y-3">
                {(
                  [
                    { key: "normal", label: "Normal", color: "text-green-700" },
                    { key: "leve", label: "Alterações Leves", color: "text-yellow-700" },
                    { key: "moderado", label: "Moderado", color: "text-orange-700" },
                    { key: "grave", label: "Grave", color: "text-red-700" },
                  ] as const
                ).map(({ key, label, color }) => (
                  <div key={key}>
                    <h4 className={`text-xs font-medium ${color} mb-1`}>{label}</h4>
                    <div className="space-y-1">
                      {PREDEFINED_PHRASES[key].map((phrase, idx) => (
                        <Button
                          key={idx}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-xs h-auto py-2 text-left"
                          onClick={() =>
                            setReportBody((prev) => prev + (prev ? " " : "") + phrase)
                          }
                        >
                          <Plus className="h-3 w-3 mr-2 flex-shrink-0" />
                          <span className="line-clamp-2">{phrase}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Área principal do laudo */}
          <div className="col-span-9">
            <Card className="p-4 h-full flex flex-col">
              <Label className="text-sm font-medium mb-2 block">Corpo do Laudo</Label>
              <Textarea
                value={reportBody}
                onChange={(e) => setReportBody(e.target.value)}
                placeholder="Digite o laudo ou selecione um template acima..."
                className="flex-1 min-h-[420px] resize-none font-mono text-sm leading-relaxed"
              />
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">
                  {reportBody.length} caracteres · {reportBody.split(/\s+/).filter(Boolean).length} palavras
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={!reportBody || isSaving}>
                    <Save className="h-4 w-4 mr-1.5" />
                    Salvar Rascunho
                  </Button>
                  <Button size="sm" onClick={handleSignReport} disabled={!reportBody} className="bg-green-600 hover:bg-green-700 text-white">
                    <Check className="h-4 w-4 mr-1.5" />
                    Assinar e Finalizar
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
