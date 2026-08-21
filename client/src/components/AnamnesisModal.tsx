import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2, MapPin, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Modality = "CT" | "RM" | "CR" | "US";
type Question = { id: string; label: string; kind: "text" | "yesno" | "choice"; choices?: string[] };

const QUESTIONNAIRES: Record<Modality, { title: string; questions: Question[] }> = {
  RM: { title: "Ressonância Magnética", questions: [
    { id: "complaint", label: "Qual é a queixa ou motivo principal do exame?", kind: "text" },
    { id: "duration", label: "Há quanto tempo os sintomas estão presentes?", kind: "text" },
    { id: "pain", label: "O paciente sente dor ou desconforto?", kind: "yesno" },
    { id: "surgery", label: "Já realizou cirurgia na região examinada?", kind: "yesno" },
    { id: "implants", label: "Possui implante, prótese, clipe, marcapasso ou metal no corpo?", kind: "yesno" },
    { id: "metalEye", label: "Já sofreu acidente com fragmento metálico nos olhos?", kind: "yesno" },
    { id: "claustrophobia", label: "Tem claustrofobia ou dificuldade em permanecer em local fechado?", kind: "yesno" },
    { id: "contrast", label: "Possui alergia conhecida a contraste ou outra informação relevante?", kind: "text" },
  ] },
  CT: { title: "Tomografia Computadorizada", questions: [
    { id: "complaint", label: "Qual é a indicação ou queixa principal?", kind: "text" },
    { id: "duration", label: "Há quanto tempo os sintomas estão presentes?", kind: "text" },
    { id: "pain", label: "O paciente sente dor ou desconforto?", kind: "yesno" },
    { id: "traumaSurgery", label: "Houve trauma recente ou cirurgia na região?", kind: "yesno" },
    { id: "contrastAllergy", label: "Possui alergia conhecida a contraste iodado?", kind: "yesno" },
    { id: "renal", label: "Possui doença renal, insuficiência renal ou faz diálise?", kind: "yesno" },
    { id: "metformin", label: "Usa metformina?", kind: "yesno" },
    { id: "pregnancy", label: "Há possibilidade de gestação?", kind: "choice", choices: ["Não se aplica", "Não", "Sim", "Não sabe"] },
  ] },
  CR: { title: "Radiografia", questions: [
    { id: "complaint", label: "Qual é a indicação ou queixa principal?", kind: "text" },
    { id: "duration", label: "Há quanto tempo os sintomas estão presentes?", kind: "text" },
    { id: "pain", label: "O paciente sente dor ou desconforto?", kind: "yesno" },
    { id: "trauma", label: "Houve trauma? Se sim, informe quando ocorreu.", kind: "text" },
    { id: "swelling", label: "Há edema, deformidade ou hematoma?", kind: "yesno" },
    { id: "limitation", label: "Há limitação de movimento, dormência ou formigamento?", kind: "yesno" },
    { id: "history", label: "Já teve fratura ou cirurgia prévia na região?", kind: "yesno" },
    { id: "pregnancy", label: "Há possibilidade de gestação?", kind: "choice", choices: ["Não se aplica", "Não", "Sim", "Não sabe"] },
  ] },
  US: { title: "Ultrassonografia", questions: [
    { id: "complaint", label: "Qual é a indicação ou queixa principal?", kind: "text" },
    { id: "duration", label: "Há quanto tempo os sintomas estão presentes?", kind: "text" },
    { id: "pain", label: "O paciente sente dor ou desconforto?", kind: "yesno" },
    { id: "associated", label: "Há febre, náusea, vômitos ou outro sintoma associado?", kind: "text" },
    { id: "surgery", label: "Já realizou cirurgia na região examinada?", kind: "yesno" },
    { id: "previousExams", label: "Possui exame anterior relevante?", kind: "yesno" },
    { id: "medications", label: "Usa alguma medicação relevante para esta queixa?", kind: "yesno" },
    { id: "pregnancy", label: "Há possibilidade de gestação?", kind: "choice", choices: ["Não se aplica", "Não", "Sim", "Não sabe"] },
  ] },
};

const BODY_AREAS = [
  ["Cabeça", "left-[47%] top-[7%]"], ["Pescoço", "left-[47%] top-[19%]"], ["Ombro direito", "left-[32%] top-[25%]"],
  ["Ombro esquerdo", "left-[62%] top-[25%]"], ["Tórax direito", "left-[38%] top-[32%]"], ["Tórax esquerdo", "left-[57%] top-[32%]"],
  ["Abdômen", "left-[47%] top-[43%]"], ["Pelve", "left-[47%] top-[54%]"], ["Braço direito", "left-[23%] top-[38%]"],
  ["Braço esquerdo", "left-[72%] top-[38%]"], ["Perna direita", "left-[39%] top-[76%]"], ["Perna esquerda", "left-[56%] top-[76%]"],
] as const;

export interface AnamnesisData { presets: string[]; manual: string; }
interface Props { open: boolean; onClose: () => void; studyInstanceUid: string; patientName?: string; onSave?: (data: AnamnesisData) => void; }

export function AnamnesisModal({ open, onClose, studyInstanceUid, patientName = "", onSave }: Props) {
  const [modality, setModality] = useState<Modality | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [painLocations, setPainLocations] = useState<string[]>([]);
  const structuredQuery = trpc.anamnesisSimple.getStructuredByStudy.useQuery({ studyInstanceUid }, { enabled: open && !!studyInstanceUid });
  const utils = trpc.useUtils();
  const questionnaire = modality ? QUESTIONNAIRES[modality] : null;

  useEffect(() => {
    const saved = structuredQuery.data;
    if (!saved) return;
    const savedModality = saved.modality as Modality;
    if (QUESTIONNAIRES[savedModality]) {
      setModality(savedModality);
      setAnswers((saved.answers as Record<string, string>) ?? {});
      setPainLocations((saved.pain_locations as string[]) ?? []);
    }
  }, [structuredQuery.data]);

  const summary = useMemo(() => {
    if (!questionnaire || !modality) return "";
    const values = questionnaire.questions
      .map((q) => answers[q.id]?.trim() ? `${q.label} ${answers[q.id].trim()}` : null)
      .filter((value): value is string => Boolean(value));
    if (painLocations.length) values.push(`Localização da dor: ${painLocations.join(", ")}`);
    return `${modality} — ${values.join(". ")}.`;
  }, [answers, modality, painLocations, questionnaire]);

  const saveMutation = trpc.anamnesisSimple.saveStructured.useMutation({
    onSuccess: () => {
      toast.success("Anamnese estruturada salva");
      utils.anamnesisSimple.getStructuredByStudy.invalidate({ studyInstanceUid });
      utils.anamnesisSimple.getByStudy.invalidate({ studyInstanceUid });
      onSave?.({ presets: [`Anamnese estruturada — ${modality}`], manual: summary });
      onClose();
    },
    onError: (error) => toast.error(error.message || "Não foi possível salvar a anamnese"),
  });

  const togglePainArea = (area: string) => setPainLocations((current) => current.includes(area) ? current.filter((item) => item !== area) : [...current, area]);
  const setAnswer = (id: string, value: string) => setAnswers((current) => ({ ...current, [id]: value }));
  const complete = Boolean(questionnaire && questionnaire.questions.every((question) => answers[question.id]?.trim()));
  const displayName = patientName.replace(/\^+/g, " ").replace(/\s{2,}/g, " ").trim() || "Paciente";

  const handleSave = () => {
    if (!modality || !complete) return;
    saveMutation.mutate({ studyInstanceUid, patientName: patientName || undefined, modality, answers, painLocations, summary });
  };

  return <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
    <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5 text-primary" />Anamnese — <span className="text-primary">{displayName}</span></DialogTitle>
      </DialogHeader>
      {structuredQuery.isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin" /></div> : !modality ? <div className="grid grid-cols-2 gap-3 py-4 md:grid-cols-4">
        {(Object.keys(QUESTIONNAIRES) as Modality[]).map((key) => <button key={key} type="button" onClick={() => setModality(key)} className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm transition hover:border-primary hover:bg-primary/5">
          <span className="block text-2xl font-bold text-slate-900">{key}</span><span className="mt-2 block text-xs text-slate-500">{QUESTIONNAIRES[key].title}</span>
        </button>)}
      </div> : <div className="space-y-5 py-2">
        <div className="flex items-center gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => { setModality(null); setAnswers({}); setPainLocations([]); }}><ArrowLeft className="mr-1 h-4 w-4" />Modalidades</Button><span className="text-sm font-semibold text-slate-700">{modality} · {questionnaire?.title}</span></div>
        <p className="text-xs text-muted-foreground">Responda as oito perguntas. O questionário registra informações fornecidas, sem gerar diagnóstico automático.</p>
        <div className="space-y-4">{questionnaire?.questions.map((question, index) => <div key={question.id} className="rounded-lg border border-slate-200 p-3">
          <Label className="text-sm font-medium"><span className="mr-1 text-primary">{index + 1}.</span>{question.label}</Label>
          {question.kind === "text" ? <Textarea value={answers[question.id] ?? ""} onChange={(event) => setAnswer(question.id, event.target.value)} className="mt-2 min-h-16" /> : <div className="mt-2 flex flex-wrap gap-2">{(question.kind === "yesno" ? ["Não", "Sim"] : question.choices ?? []).map((choice) => <Button key={choice} type="button" size="sm" variant={answers[question.id] === choice ? "default" : "outline"} onClick={() => setAnswer(question.id, choice)}>{choice}</Button>)}</div>}
          {question.id === "pain" && answers.pain === "Sim" && <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3"><div className="mb-2 flex items-center gap-1 text-xs font-semibold text-primary"><MapPin className="h-3.5 w-3.5" />Marque a região informada pelo paciente</div><p className="mb-3 text-[11px] text-slate-500">Toque nos marcadores sobre a anatomia para registrar a localização relatada.</p><div className="relative mx-auto max-w-[260px] overflow-hidden rounded-md border border-slate-200 bg-white"><img src="/manus-storage/anatomical-body-pain-map_f4c4497b.png" alt="Mapa anatômico frontal do corpo humano" className="h-[430px] w-full object-contain" />{BODY_AREAS.map(([area, position]) => <button key={area} type="button" onClick={() => togglePainArea(area)} aria-label={`Selecionar ${area}`} aria-pressed={painLocations.includes(area)} className={`absolute ${position} h-5 w-5 rounded-full border-2 shadow-sm transition-transform hover:scale-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${painLocations.includes(area) ? "border-primary bg-primary" : "border-white bg-slate-700/75"}`} title={area}><span className="sr-only">{area}</span></button>)}</div><div className="mt-2 flex flex-wrap gap-1">{painLocations.map((area) => <span key={area} className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{area}</span>)}</div></div>}
        </div>)}</div>
      </div>}
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>Cancelar</Button>{modality && <Button onClick={handleSave} disabled={!complete || saveMutation.isPending}>{saveMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando</> : "Salvar Anamnese"}</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
