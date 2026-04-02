import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save, FileText, Check, ArrowLeft, Download, Eye, EyeOff, Printer } from "lucide-react";
import ReportDocument, { ReportDocumentHandle } from "@/components/ReportDocument";
import ReportSidebar from "@/components/ReportSidebar";

function formatDate(date: string): string {
  if (!date || date.length < 8) return date || "-";
  return date.slice(6, 8) + "/" + date.slice(4, 6) + "/" + date.slice(0, 4);
}

function calcAge(birthDate: string): string {
  if (!birthDate || birthDate.length < 8) return "";
  const birth = new Date(
    birthDate.slice(0, 4) + "-" + birthDate.slice(4, 6) + "-" + birthDate.slice(6, 8)
  );
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  if (age < 0 || age > 130) return "";
  if (age < 1) {
    const months = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 30));
    return months + " meses";
  }
  return age + " anos";
}

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
  unitId: number | null;
  unitName: string;
}

export default function ReportEditorPage() {
  const { studyInstanceUid } = useParams<{ studyInstanceUid: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const documentRef = useRef<ReportDocumentHandle>(null);

  const [studyData, setStudyData] = useState<StudyData>({
    patientName: "", patientID: "", patientBirthDate: "", patientSex: "",
    studyDate: "", studyTime: "", modality: "", studyDescription: "",
    accessionNumber: "", unitId: null, unitName: "",
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [examTitle, setExamTitle] = useState("");
  const [showSignature, setShowSignature] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [existingReportId, setExistingReportId] = useState<number | null>(null);
  const [reportStatus, setReportStatus] = useState<"draft" | "signed" | null>(null);
  const [contentLoaded, setContentLoaded] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("study_" + studyInstanceUid);
    if (raw) {
      try { setStudyData(JSON.parse(raw)); } catch {}
    }
  }, [studyInstanceUid]);

  const { data: existingReport } = trpc.reports.getByStudyUid.useQuery(
    { studyInstanceUid: studyInstanceUid ?? "" },
    { enabled: !!studyInstanceUid }
  );

  useEffect(() => {
    if (existingReport && !contentLoaded) {
      setExistingReportId(existingReport.id);
      setReportStatus(existingReport.status as "draft" | "signed");
      setTimeout(() => {
        documentRef.current?.setContent(existingReport.body ?? "");
        setContentLoaded(true);
      }, 200);
    }
  }, [existingReport, contentLoaded]);

  const { data: templates } = trpc.templates.list.useQuery();

  const { data: medicalContext } = trpc.medicalData.getReportContext.useQuery(
    { unitId: studyData.unitId ?? 0 },
    { enabled: !!studyData.unitId }
  );

  const replaceVariables = useCallback((template: string): string => {
    const currentDate = new Date().toLocaleDateString("pt-BR");
    const currentTime = new Date().toLocaleTimeString("pt-BR");
    const vars: Record<string, string> = {
      patientName: studyData.patientName.replace(/\^/g, " ") || "{{patientName}}",
      patientId: studyData.patientID || "{{patientId}}",
      patientBirthDate: formatDate(studyData.patientBirthDate),
      patientAge: calcAge(studyData.patientBirthDate),
      studyDate: formatDate(studyData.studyDate),
      modality: studyData.modality || "{{modality}}",
      studyDescription: studyData.studyDescription || "",
      accessionNumber: studyData.accessionNumber || "",
      unitName: studyData.unitName || "",
      radiologist: medicalContext?.doctorName || "{{radiologist}}",
      crm: medicalContext?.crm || "",
      currentDate, currentTime,
    };
    let result = template;
    Object.entries(vars).forEach(([key, value]) => {
      result = result.replace(new RegExp("\\{\\{" + key + "\\}\\}", "g"), value);
    });
    return result;
  }, [studyData, medicalContext]);

  const handleTemplateSelect = (templateId: string) => {
    const id = parseInt(templateId);
    setSelectedTemplateId(id);
    const template = templates?.find((t) => t.id === id);
    if (template) documentRef.current?.setContent(replaceVariables(template.bodyTemplate));
  };

  const handleInsertText = useCallback((text: string) => {
    documentRef.current?.insertAtCursor(text);
  }, []);

  const createMutation = trpc.reports.create.useMutation();
  const updateMutation = trpc.reports.update.useMutation();
  const signMutation = trpc.reports.sign.useMutation();

  const getContent = () => documentRef.current?.getContent() ?? "";

  const handleSaveDraft = async () => {
    const body = getContent();
    if (!body.trim()) {
      toast({ title: "Erro", description: "O corpo do laudo nao pode estar vazio.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      if (existingReportId) {
        await updateMutation.mutateAsync({ id: existingReportId, body });
      } else {
        const r = await createMutation.mutateAsync({
          study_id: 0, study_instance_uid: studyInstanceUid,
          template_id: selectedTemplateId ?? undefined, body,
        });
        setExistingReportId(r.id);
        setReportStatus("draft");
      }
      toast({ title: "Rascunho salvo", description: "Laudo salvo com sucesso." });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally { setIsSaving(false); }
  };

  const handleSignReport = async () => {
    const body = getContent();
    if (!body.trim()) {
      toast({ title: "Erro", description: "O corpo do laudo nao pode estar vazio.", variant: "destructive" });
      return;
    }
    setIsSigning(true);
    try {
      let reportId = existingReportId;
      if (!reportId) {
        const r = await createMutation.mutateAsync({
          study_id: 0, study_instance_uid: studyInstanceUid,
          template_id: selectedTemplateId ?? undefined, body,
        });
        reportId = r.id;
        setExistingReportId(reportId);
      } else {
        await updateMutation.mutateAsync({ id: reportId, body });
      }
      await signMutation.mutateAsync({ id: reportId! });
      setReportStatus("signed");
      toast({ title: "Laudo assinado", description: "Laudo finalizado e assinado com sucesso." });
    } catch (err: any) {
      toast({ title: "Erro ao assinar", description: err.message, variant: "destructive" });
    } finally { setIsSigning(false); }
  };

  const handleDownloadPdf = async () => {
    const element = documentRef.current?.getElement();
    if (!element) return;
    toast({ title: "Gerando PDF...", description: "Aguarde um momento." });
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(element, {
        scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      const pName = studyData.patientName.replace(/\^/g, "_").replace(/\s+/g, "_") || "laudo";
      pdf.save("laudo_" + pName + "_" + (studyData.studyDate || "sem_data") + ".pdf");
    } catch (err: any) {
      toast({ title: "Erro ao gerar PDF", description: err.message, variant: "destructive" });
    }
  };

  const patientDisplayName = studyData.patientName
    ? studyData.patientName.replace(/\^/g, " ").trim()
    : "Paciente nao identificado";

  const isAlreadySigned = reportStatus === "signed";

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="px-5 flex items-center justify-between sticky top-0 z-10 print:hidden"
        style={{ background: "#2c2420", height: 56 }}>
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate("/pacs-query")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity focus:outline-none flex-shrink-0">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310419663028509564/cTdrattvNQ95XCgX9zeyNM/lauds_logo_branco_final_c960f283.png"
              alt="Lauds" className="object-contain" style={{ height: 36 }} />
          </button>
          <div className="h-5 w-px bg-white/20 flex-shrink-0" />
          <Button variant="ghost" size="sm" onClick={() => navigate("/pacs-query")}
            className="text-white/70 hover:text-white hover:bg-white/10 flex-shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div className="h-5 w-px bg-white/20 flex-shrink-0" />
          <div className="min-w-0 hidden sm:block">
            <h1 className="text-sm font-bold text-white leading-tight">Editor de Laudo</h1>
            <p className="text-xs text-white/50 truncate">{patientDisplayName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAlreadySigned && (
            <span className="text-xs text-green-400 font-medium px-2 py-1 bg-green-900/40 rounded">
              Assinado
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowSignature(v => !v)}
            className="text-white/70 hover:text-white hover:bg-white/10"
            title={showSignature ? "Ocultar assinatura" : "Mostrar assinatura"}>
            {showSignature ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.print()}
            className="text-white/70 hover:text-white hover:bg-white/10" title="Imprimir">
            <Printer className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDownloadPdf}
            className="text-white/70 hover:text-white hover:bg-white/10" title="Baixar PDF">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleSaveDraft}
            disabled={isSaving || isAlreadySigned}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20">
            <Save className="h-4 w-4 mr-1.5" />
            {isSaving ? "Salvando..." : "Salvar Rascunho"}
          </Button>
          <Button size="sm" onClick={handleSignReport}
            disabled={isSigning || isAlreadySigned}
            className="bg-green-600 hover:bg-green-700 text-white">
            <Check className="h-4 w-4 mr-1.5" />
            {isSigning ? "Assinando..." : isAlreadySigned ? "Assinado" : "Assinar e Finalizar"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto print:hidden">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Template</p>
            <Select onValueChange={handleTemplateSelect} disabled={isAlreadySigned}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecionar template..." />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)} className="text-xs">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3 w-3" />
                      <span>{t.name}</span>
                      {t.modality && <span className="text-gray-400">({t.modality})</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Titulo do Exame</p>
            <input type="text" value={examTitle} onChange={(e) => setExamTitle(e.target.value)}
              placeholder="Ex: RX Torax PA e Perfil" disabled={isAlreadySigned}
              className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <ReportSidebar onInsertText={handleInsertText} disabled={isAlreadySigned} />
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-200 p-6 print:p-0 print:bg-white">
          <div className="max-w-[210mm] mx-auto print:max-w-none print:mx-0">
            <ReportDocument
              ref={documentRef}
              unitLogoUrl={medicalContext?.unitLogoUrl}
              unitName={studyData.unitName || medicalContext?.unitName}
              patientName={studyData.patientName.replace(/\^/g, " ")}
              studyDate={formatDate(studyData.studyDate)}
              modality={studyData.modality}
              examTitle={examTitle}
              doctorName={medicalContext?.doctorName}
              crm={medicalContext?.crm}
              signatureUrl={medicalContext?.signatureUrl}
              showSignature={showSignature}
              readOnly={isAlreadySigned}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
