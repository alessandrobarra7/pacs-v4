import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  ArrowLeft, Printer, Save, CheckCircle, PenLine, ChevronDown,
  Plus, Star, StarOff, Trash2, Upload, FileText, BookOpen,
  Search, X, Check
} from "lucide-react";

const EXAM_SUGGESTIONS = [
  "RX TÓRAX PA E PERFIL","RX TÓRAX PA","RX ABDOME SIMPLES",
  "RX COLUNA CERVICAL AP E PERFIL","RX COLUNA TORÁCICA AP E PERFIL",
  "RX COLUNA LOMBAR AP E PERFIL","RX COLUNA LOMBOSSACRA AP E PERFIL",
  "RX PELVE AP","RX BACIA AP","RX CRÂNIO AP E PERFIL",
  "RX MÃO DIREITA","RX MÃO ESQUERDA","RX PÉ DIREITO","RX PÉ ESQUERDO",
  "RX JOELHO DIREITO","RX JOELHO ESQUERDO","RX OMBRO DIREITO","RX OMBRO ESQUERDO",
  "RX TORNOZELO DIREITO","RX TORNOZELO ESQUERDO",
  "RX QUADRIL DIREITO","RX QUADRIL ESQUERDO",
  "ESCANEOMETRIA DE MEMBROS INFERIORES","RX PANORÂMICO COLUNA",
  "TC CRÂNIO SEM CONTRASTE","TC CRÂNIO COM CONTRASTE",
  "TC TÓRAX SEM CONTRASTE","TC TÓRAX COM CONTRASTE",
  "TC ABDOME TOTAL SEM CONTRASTE","TC ABDOME TOTAL COM CONTRASTE",
  "TC PELVE SEM CONTRASTE","TC PELVE COM CONTRASTE",
  "TC ABDOME E PELVE COM CONTRASTE","TC COLUNA CERVICAL",
  "TC COLUNA TORÁCICA","TC COLUNA LOMBAR","TC SEIOS DA FACE",
  "TC PESCOÇO COM CONTRASTE","TC TÓRAX E ABDOME COM CONTRASTE",
  "ANGIOTOMOGRAFIA DE TÓRAX","ANGIOTOMOGRAFIA DE ABDOME",
  "RM CRÂNIO SEM CONTRASTE","RM CRÂNIO COM CONTRASTE",
  "RM COLUNA CERVICAL","RM COLUNA TORÁCICA","RM COLUNA LOMBAR",
  "RM OMBRO DIREITO","RM OMBRO ESQUERDO",
  "RM JOELHO DIREITO","RM JOELHO ESQUERDO",
  "RM QUADRIL DIREITO","RM QUADRIL ESQUERDO",
  "RM ABDOME","RM PELVE","RM MAMA BILATERAL",
  "RM TORNOZELO DIREITO","RM TORNOZELO ESQUERDO",
  "US ABDOME TOTAL","US ABDOME SUPERIOR","US PÉLVICO",
  "US TRANSVAGINAL","US MAMA BILATERAL","US MAMA DIREITA","US MAMA ESQUERDA",
  "US TIREOIDE","US PESCOÇO","US TESTICULAR","US PRÓSTATA TRANSRETAL",
  "US OBSTÉTRICO","US MORFOLÓGICO","US DOPPLER VASCULAR",
  "US PARTES MOLES","US ARTICULAR",
  "MAMOGRAFIA BILATERAL","MAMOGRAFIA UNILATERAL DIREITA","MAMOGRAFIA UNILATERAL ESQUERDA",
  "DENSITOMETRIA ÓSSEA COLUNA E FÊMUR",
];

function cleanName(name: string) {
  return (name || "").replace(/\^/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}
function fmtDicom(d: string) {
  if (!d || d.length < 8) return "";
  return `${d.slice(6,8)}/${d.slice(4,6)}/${d.slice(0,4)}`;
}
function calcAge(bd: string) {
  if (!bd || bd.length < 8) return "";
  const birth = new Date(`${bd.slice(0,4)}-${bd.slice(4,6)}-${bd.slice(6,8)}`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  if (age < 0 || age > 130) return "";
  if (age < 1) return `${Math.floor((now.getTime()-birth.getTime())/(1000*60*60*24*30))}M`;
  return `${age}A`;
}
function fmtSex(s: string) {
  const u = (s||"").toUpperCase().trim();
  return u === "M" ? "M" : u === "F" ? "F" : s||"";
}

export default function ReportEditorPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdminMaster = user?.role === "admin_master";
  const studyUid = window.location.pathname.split("/").pop() || "";

  const [studyData] = useState(() => {
    try { const r = sessionStorage.getItem(`study_${studyUid}`); return r ? JSON.parse(r) : {}; }
    catch { return {}; }
  });

  const patientName = cleanName(studyData.patientName || "");
  const studyDate = fmtDicom(studyData.studyDate || "");
  const studyTime = studyData.studyTime ? `${(studyData.studyTime||"").slice(0,2)}:${(studyData.studyTime||"").slice(2,4)}` : "";
  const age = calcAge(studyData.patientBirthDate || "");
  const sex = fmtSex(studyData.patientSex || "");
  const unitId: number | null = studyData.unitId ? Number(studyData.unitId) : null;

  const [examTitle, setExamTitle] = useState(
    () => localStorage.getItem(`exam_label_${studyUid}`) || studyData.studyDescription || ""
  );
  const [showExamDropdown, setShowExamDropdown] = useState(false);
  const [examSearch, setExamSearch] = useState("");
  const examDropRef = useRef<HTMLDivElement>(null);

  const [reportId, setReportId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isSigned, setIsSigned] = useState(false);

  const savedRange = useRef<Range | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"templates"|"frases"|"exames">("templates");

  const { data: existingReport } = trpc.reports.getByStudyUid.useQuery(
    { studyInstanceUid: studyUid }, { enabled: !!studyUid }
  );
  const { data: templates } = trpc.templates.list.useQuery();
  const { data: phraseGroups } = trpc.phrases.listGroups.useQuery();
  const { data: phrases } = trpc.phrases.list.useQuery();
  const { data: medCtx } = trpc.medicalData.getReportContext.useQuery(
    { unitId: unitId ?? 0 }, { enabled: !!unitId }
  );

  const createMut = trpc.reports.create.useMutation();
  const updateMut = trpc.reports.update.useMutation();
  const signMut = trpc.reports.sign.useMutation();
  const updateMedical = trpc.medicalData.updateUserMedical.useMutation();
  const updateLogo = trpc.medicalData.updateUnitLogo.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (existingReport && editorRef.current) {
      setReportId(existingReport.id);
      setIsSigned(existingReport.status === "signed");
      if (existingReport.body) {
        editorRef.current.innerHTML = existingReport.body.includes("<")
          ? existingReport.body
          : existingReport.body.split("\n\n").map((p: string) => `<p>${p.replace(/\n/g,"<br>")}</p>`).join("");
      }
    }
  }, [existingReport]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (examDropRef.current && !examDropRef.current.contains(e.target as Node))
        setShowExamDropdown(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current) {
      const r = sel.getRangeAt(0);
      if (editorRef.current.contains(r.startContainer)) savedRange.current = r.cloneRange();
    }
  }, []);

  const insertAtCursor = useCallback((text: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    let range: Range | null = null;
    if (savedRange.current && ed.contains(savedRange.current.startContainer)) range = savedRange.current;
    else {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && ed.contains(sel.getRangeAt(0).startContainer)) range = sel.getRangeAt(0);
    }
    if (range) {
      range.deleteContents();
      const tn = document.createTextNode(text);
      range.insertNode(tn);
      range.setStartAfter(tn); range.collapse(true);
      const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
      savedRange.current = range.cloneRange();
    } else {
      const p = document.createElement("p"); p.textContent = text; ed.appendChild(p);
    }
  }, []);

  const insertSignature = useCallback(() => {
    const sigUrl = medCtx?.signatureUrl;
    if (!sigUrl) { toast.error("Nenhuma assinatura cadastrada para este médico."); return; }
    const ed = editorRef.current; if (!ed) return;
    ed.focus();
    let range: Range | null = null;
    if (savedRange.current && ed.contains(savedRange.current.startContainer)) range = savedRange.current;
    const img = document.createElement("img");
    img.src = sigUrl; img.alt = "Assinatura";
    img.style.cssText = "max-height:60px;max-width:200px;display:block;margin:8px 0;";
    if (range) {
      range.deleteContents(); range.insertNode(img);
      range.setStartAfter(img); range.collapse(true);
      const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    } else { ed.appendChild(img); }
  }, [medCtx]);

  const applyTemplate = useCallback((t: { bodyTemplate: string; name: string }) => {
    if (!editorRef.current) return;
    let body = t.bodyTemplate
      .replace(/\{\{patientName\}\}/g, patientName)
      .replace(/\{\{studyDate\}\}/g, studyDate)
      .replace(/\{\{modality\}\}/g, studyData.modality || "")
      .replace(/\{\{examTitle\}\}/g, examTitle)
      .replace(/\{\{doctorName\}\}/g, medCtx?.doctorName || "")
      .replace(/\{\{crm\}\}/g, medCtx?.crm || "");
    editorRef.current.innerHTML = body.includes("<")
      ? body : body.split("\n\n").map(p => `<p>${p.replace(/\n/g,"<br>")}</p>`).join("");
    toast.success(`Template "${t.name}" aplicado`);
  }, [patientName, studyDate, studyData.modality, examTitle, medCtx]);

  const handleSave = async () => {
    const body = editorRef.current?.innerHTML || "";
    setIsSaving(true);
    try {
      if (reportId) { await updateMut.mutateAsync({ id: reportId, body }); }
      else { const r = await createMut.mutateAsync({ study_id: 0, study_instance_uid: studyUid, body }); setReportId(r.id); }
      await utils.reports.getByStudyUid.invalidate({ studyInstanceUid: studyUid });
      toast.success("Rascunho salvo com sucesso");
    } catch (e: any) { toast.error(e?.message || "Erro ao salvar laudo"); }
    finally { setIsSaving(false); }
  };

  const handleSign = async () => {
    const body = editorRef.current?.innerHTML || "";
    setIsSigning(true);
    try {
      let id = reportId;
      if (!id) { const r = await createMut.mutateAsync({ study_id: 0, study_instance_uid: studyUid, body }); id = r.id; setReportId(id); }
      else { await updateMut.mutateAsync({ id, body }); }
      await signMut.mutateAsync({ id: id! });
      setIsSigned(true);
      await utils.reports.getByStudyUid.invalidate({ studyInstanceUid: studyUid });
      toast.success("Laudo assinado e finalizado com sucesso!");
    } catch (e: any) { toast.error(e?.message || "Erro ao assinar laudo"); }
    finally { setIsSigning(false); }
  };

  const handleUploadSignature = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await updateMedical.mutateAsync({ userId: user.id, signatureFile: reader.result as string });
        await utils.medicalData.getReportContext.invalidate();
        toast.success("Assinatura atualizada com sucesso");
      } catch (err: any) { toast.error(err?.message || "Erro no upload da assinatura"); }
    };
    reader.readAsDataURL(file); e.target.value = "";
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !unitId) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await updateLogo.mutateAsync({ unitId, logoFile: reader.result as string });
        await utils.medicalData.getReportContext.invalidate();
        toast.success("Logo da unidade atualizado com sucesso");
      } catch (err: any) { toast.error(err?.message || "Erro no upload do logo"); }
    };
    reader.readAsDataURL(file); e.target.value = "";
  };

  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [newPhraseContent, setNewPhraseContent] = useState("");
  const [showNewPhrase, setShowNewPhrase] = useState(false);

  const createGroupMut = trpc.phrases.createGroup.useMutation({
    onSuccess: () => { utils.phrases.listGroups.invalidate(); setNewGroupName(""); setShowNewGroup(false); },
  });
  const createPhraseMut = trpc.phrases.create.useMutation({
    onSuccess: () => { utils.phrases.list.invalidate(); setNewPhraseContent(""); setShowNewPhrase(false); },
  });
  const deletePhraseMut = trpc.phrases.delete.useMutation({ onSuccess: () => utils.phrases.list.invalidate() });
  const toggleFavMut = trpc.phrases.toggleFavorite.useMutation({ onSuccess: () => utils.phrases.list.invalidate() });

  const filteredExams = examSearch.trim()
    ? EXAM_SUGGESTIONS.filter(s => s.toLowerCase().includes(examSearch.toLowerCase()))
    : EXAM_SUGGESTIONS;

  return (
    <div className="flex flex-col h-screen bg-white" style={{ fontFamily: "Inter, Arial, sans-serif" }}>
      {/* HEADER */}
      <header className="flex items-center gap-3 px-4 border-b border-gray-200 bg-white shrink-0" style={{ height: 52 }}>
        <button onClick={() => navigate("/studies")}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm font-medium transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4" /><span>Voltar</span>
        </button>
        <div className="flex flex-col leading-tight shrink-0">
          <span className="font-semibold text-gray-900 text-sm">Editor de Laudo</span>
          <span className="text-xs text-gray-400">{patientName || "Paciente"} · {examTitle || studyData.modality || "Exame"}</span>
        </div>
        <div className="flex-1" />

        {/* Seletor de exame */}
        <div className="relative" ref={examDropRef}>
          <button onClick={() => { setShowExamDropdown(v => !v); setExamSearch(""); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors" style={{ maxWidth: 260 }}>
            <FileText className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="truncate">{examTitle || "Selecionar exame"}</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          </button>
          {showExamDropdown && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-80">
              <div className="p-2 border-b border-gray-100">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded border border-gray-200">
                  <Search className="w-3.5 h-3.5 text-gray-400" />
                  <input autoFocus value={examSearch} onChange={e => setExamSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && examSearch.trim()) {
                      const v = examSearch.trim().toUpperCase(); setExamTitle(v);
                      localStorage.setItem(`exam_label_${studyUid}`, v); setShowExamDropdown(false);
                    }}}
                    placeholder="Buscar ou digitar nome do exame..."
                    className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400" />
                  {examSearch && <button onClick={() => setExamSearch("")} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>}
                </div>
                {examSearch.trim() && (
                  <button onClick={() => { const v = examSearch.trim().toUpperCase(); setExamTitle(v); localStorage.setItem(`exam_label_${studyUid}`, v); setShowExamDropdown(false); }}
                    className="mt-1.5 w-full text-left text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1">
                    <Check className="w-3 h-3" />Usar: "{examSearch.trim().toUpperCase()}"
                  </button>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto">
                {filteredExams.slice(0, 30).map(s => (
                  <button key={s} onClick={() => { setExamTitle(s); localStorage.setItem(`exam_label_${studyUid}`, s); setShowExamDropdown(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-50 last:border-0">{s}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button onClick={insertSignature}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors shrink-0">
          <PenLine className="w-4 h-4 text-gray-500" /><span>Inserir Assinatura</span>
        </button>
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors shrink-0">
          <Printer className="w-4 h-4 text-gray-500" /><span>Imprimir</span>
        </button>
        <button onClick={handleSave} disabled={isSaving || isSigned}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors disabled:opacity-50 shrink-0">
          <Save className="w-4 h-4 text-gray-500" /><span>{isSaving ? "Salvando..." : "Salvar"}</span>
        </button>
        <button onClick={handleSign} disabled={isSigning || isSigned}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-semibold text-white transition-colors disabled:opacity-60 shrink-0"
          style={{ background: isSigned ? "#16a34a" : "#15803d" }}>
          <CheckCircle className="w-4 h-4" />
          <span>{isSigned ? "Assinado" : isSigning ? "Assinando..." : "Assinar"}</span>
        </button>
      </header>

      {/* CORPO */}
      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className="flex flex-col border-r border-gray-200 bg-white shrink-0 overflow-y-auto" style={{ width: 260 }}>
          {/* Abas */}
          <div className="flex border-b border-gray-200 shrink-0">
            {(["templates","frases","exames"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors border-b-2 ${activeTab===tab ? "border-gray-800 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {tab==="templates"?"Templates":tab==="frases"?"Frases":"Exames"}
              </button>
            ))}
          </div>

          {/* Aba Templates */}
          {activeTab==="templates" && (
            <div className="flex-1 p-3 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Meus Templates</span>
                <button onClick={() => navigate("/templates")}
                  className="flex items-center gap-0.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
                  <Plus className="w-3.5 h-3.5" /><span>Novo</span>
                </button>
              </div>
              {!templates || templates.length===0 ? (
                <div className="text-xs text-gray-400 text-center py-6">
                  Nenhum template cadastrado.<br />
                  <button onClick={() => navigate("/templates")} className="text-blue-500 hover:underline mt-1">Criar template</button>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {templates.map((t: any) => (
                    <button key={t.id} onClick={() => applyTemplate(t)}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-50 text-left transition-colors">
                      <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-700 truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Aba Frases */}
          {activeTab==="frases" && (
            <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-3">
              {!phraseGroups || phraseGroups.length===0 ? (
                <div className="text-xs text-gray-400 text-center py-4">Nenhum grupo de frases.</div>
              ) : phraseGroups.map((group: any) => {
                const gPhrases = (phrases||[]).filter((p: any) => p.group_id===group.id);
                const isOpen = selectedGroupId===group.id;
                return (
                  <div key={group.id}>
                    <button className="flex items-center justify-between w-full mb-1"
                      onClick={() => setSelectedGroupId(isOpen ? null : group.id)}>
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{group.name}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen?"rotate-180":""}`} />
                    </button>
                    {isOpen && (
                      <div className="space-y-0.5 pl-1">
                        {gPhrases.length===0 ? (
                          <p className="text-xs text-gray-400 py-1">Sem frases neste grupo.</p>
                        ) : gPhrases.map((phrase: any) => (
                          <div key={phrase.id} className="flex items-start gap-1 group">
                            <button onClick={() => insertAtCursor(phrase.content)}
                              className="flex-1 text-left text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-50 px-2 py-1.5 rounded transition-colors leading-snug">
                              {phrase.content}
                            </button>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-1">
                              <button onClick={() => toggleFavMut.mutate({ phraseId: phrase.id, isFavorite: !phrase.is_favorite })}
                                className="text-gray-300 hover:text-amber-400 transition-colors">
                                {phrase.is_favorite ? <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> : <StarOff className="w-3 h-3" />}
                              </button>
                              <button onClick={() => { if(confirm("Excluir frase?")) deletePhraseMut.mutate({ phraseId: phrase.id }); }}
                                className="text-gray-300 hover:text-red-400 transition-colors">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {showNewPhrase && selectedGroupId===group.id ? (
                          <div className="mt-1">
                            <textarea autoFocus value={newPhraseContent} onChange={e => setNewPhraseContent(e.target.value)}
                              placeholder="Digite a frase..." rows={2}
                              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
                            <div className="flex gap-1 mt-1">
                              <button onClick={() => { if(newPhraseContent.trim()) createPhraseMut.mutate({ groupId: group.id, content: newPhraseContent.trim() }); }}
                                className="text-xs px-2 py-1 bg-gray-800 text-white rounded hover:bg-gray-700">Salvar</button>
                              <button onClick={() => setShowNewPhrase(false)}
                                className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setShowNewPhrase(true); setSelectedGroupId(group.id); }}
                            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1 mt-0.5">
                            <Plus className="w-3 h-3" />Adicionar frase
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {showNewGroup ? (
                <div className="mt-1">
                  <input autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                    onKeyDown={e => { if(e.key==="Enter"&&newGroupName.trim()) createGroupMut.mutate({ name: newGroupName.trim() }); }}
                    placeholder="Nome do grupo..."
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400" />
                  <div className="flex gap-1 mt-1">
                    <button onClick={() => { if(newGroupName.trim()) createGroupMut.mutate({ name: newGroupName.trim() }); }}
                      className="text-xs px-2 py-1 bg-gray-800 text-white rounded hover:bg-gray-700">Criar</button>
                    <button onClick={() => setShowNewGroup(false)}
                      className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowNewGroup(true)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
                  <Plus className="w-3.5 h-3.5" />Novo grupo
                </button>
              )}
            </div>
          )}

          {/* Aba Exames */}
          {activeTab==="exames" && (
            <div className="flex-1 p-3 overflow-y-auto">
              <p className="text-xs text-gray-500 mb-2">Clique para definir o título do laudo:</p>
              <div className="space-y-0.5">
                {EXAM_SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => { setExamTitle(s); localStorage.setItem(`exam_label_${studyUid}`, s); toast.success("Título atualizado"); }}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-50 transition-colors ${examTitle===s?"bg-gray-100 font-medium text-gray-900":"text-gray-600"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Upload (admin_master) */}
          {isAdminMaster && (
            <div className="border-t border-gray-200 p-3 space-y-3 shrink-0">
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <PenLine className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs font-semibold text-gray-700">Assinatura</span>
                </div>
                {medCtx?.signatureUrl && (
                  <img src={medCtx.signatureUrl} alt="Assinatura" className="h-10 object-contain mb-1.5 border border-gray-100 rounded p-1" />
                )}
                <label className="flex items-center gap-1.5 cursor-pointer w-full justify-center py-1.5 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                  <Upload className="w-3.5 h-3.5" /><span>Upload Assinatura</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadSignature} />
                </label>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs font-semibold text-gray-700">Logo da Unidade</span>
                </div>
                {medCtx?.unitLogoUrl && (
                  <img src={medCtx.unitLogoUrl} alt="Logo" className="h-10 object-contain mb-1.5 border border-gray-100 rounded p-1" />
                )}
                <label className="flex items-center gap-1.5 cursor-pointer w-full justify-center py-1.5 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                  <Upload className="w-3.5 h-3.5" /><span>Upload Logo</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadLogo} />
                </label>
              </div>
            </div>
          )}
        </aside>

        {/* DOCUMENTO A4 */}
        <main className="flex-1 overflow-y-auto bg-gray-100 flex justify-center py-8 px-4" id="print-area">
          <div id="report-document" className="bg-white shadow-md"
            style={{ width:"210mm", minHeight:"297mm", padding:"20mm 25mm 25mm 25mm",
              fontFamily:"Arial, sans-serif", fontSize:"11pt", lineHeight:"1.6",
              boxSizing:"border-box" }}>

            {/* Cabeçalho */}
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
              {medCtx?.unitLogoUrl ? (
                <img src={medCtx.unitLogoUrl} alt="Logo" style={{ height:60, objectFit:"contain" }} />
              ) : (
                <div style={{ width:80, height:60, border:"1px dashed #ccc", display:"flex",
                  alignItems:"center", justifyContent:"center", fontSize:"8pt", color:"#aaa", borderRadius:4 }}>
                  Logo da unidade
                </div>
              )}
            </div>

            {/* Dados do paciente */}
            <div style={{ marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontWeight:"bold", fontSize:"11pt" }}>Paciente: {patientName||"—"}</div>
                  <div style={{ fontSize:"10pt", color:"#444", marginTop:2 }}>
                    Realizado em: {studyDate}{studyTime?` ${studyTime}`:""}
                  </div>
                </div>
                <div style={{ textAlign:"right", fontSize:"10pt", color:"#444" }}>
                  {studyData.patientBirthDate && <div>Data Nasc: {fmtDicom(studyData.patientBirthDate)}</div>}
                  {age && <div>Idade: {age}</div>}
                  {sex && <div>Sexo: {sex}</div>}
                </div>
              </div>
              <hr style={{ border:"none", borderTop:"1px solid #e0e0e0", marginTop:12 }} />
            </div>

            {/* Título do exame */}
            <div style={{ textAlign:"center", fontWeight:"bold", fontSize:"13pt", marginBottom:20, letterSpacing:"0.5px" }}>
              {examTitle||studyData.modality||""}
            </div>

            {/* Corpo editável */}
            <div ref={editorRef} contentEditable={!isSigned} suppressContentEditableWarning spellCheck
              onMouseUp={saveSelection} onKeyUp={saveSelection} onFocus={saveSelection}
              data-placeholder="Clique aqui para começar a digitar o laudo..."
              style={{ minHeight:300, outline:"none", fontSize:"11pt", lineHeight:"1.8",
                color:"#222", whiteSpace:"pre-wrap", wordBreak:"break-word" }} />

            {/* Rodapé */}
            <div style={{ marginTop:40, fontSize:"10pt", color:"#444" }}>
              {medCtx?.doctorName && (
                <div>Radiologista: {medCtx.doctorName}{medCtx.crm?` — CRM: ${medCtx.crm}`:""}</div>
              )}
              <div style={{ marginTop:20, fontSize:"8pt", color:"#aaa" }}>Com os cumprimentos</div>
            </div>
          </div>
        </main>
      </div>

      <style>{`
        @media print {
          body > *:not(#print-area) { display: none !important; }
          #print-area { display: block !important; background: white !important; padding: 0 !important; }
          #report-document { box-shadow: none !important; width: 100% !important; min-height: auto !important; }
          header, aside { display: none !important; }
        }
        [data-placeholder]:empty:before { content: attr(data-placeholder); color: #bbb; pointer-events: none; }
      `}</style>
    </div>
  );
}
