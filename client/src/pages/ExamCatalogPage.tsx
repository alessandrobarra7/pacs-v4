import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Plus, Pencil, Trash2, ArrowLeft, FileText, Link2, AlertTriangle, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type CatalogDocument = { id?: number; document_key: string; document_label: string; sort_order: number };
type CatalogMapping = { id?: number; pacs_description: string; modality: string };
type CatalogEntry = {
  id: number;
  exam_name: string;
  modality: string;
  bilateral: boolean;
  sort_order: number;
  is_active: boolean;
  financial_event_count: number;
  documents: CatalogDocument[];
  pacsMappings: CatalogMapping[];
};

type CatalogDraft = Omit<CatalogEntry, "id"> & { id?: number };

const modalities = ["CT", "CR", "DX", "MR", "US", "MG", "NM", "OT"];
const emptyDraft = (): CatalogDraft => ({
  exam_name: "",
  modality: "CT",
  bilateral: false,
  sort_order: 0,
  is_active: true,
  financial_event_count: 1,
  documents: [{ document_key: "primary", document_label: "Laudo principal", sort_order: 0 }],
  pacsMappings: [],
});

export default function ExamCatalogPage({ embedded = false }: { embedded?: boolean }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: entries = [], isLoading } = trpc.examCatalog.list.useQuery();
  const save = trpc.examCatalog.save.useMutation({
    onSuccess: async () => {
      toast.success("Exame do catálogo salvo");
      utils.examCatalog.list.invalidate();
      await utils.studyExamLegend.listForStudy.invalidate();
      setOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });
  const removeMapping = trpc.examCatalog.removePacsMapping.useMutation({
    onSuccess: () => utils.examCatalog.list.invalidate(),
    onError: (error) => toast.error(error.message),
  });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CatalogDraft>(emptyDraft);
  const [search, setSearch] = useState("");
  const [modalityFilter, setModalityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const activeCount = useMemo(() => entries.filter((entry: CatalogEntry) => entry.is_active).length, [entries]);
  const mappingCount = useMemo(() => entries.reduce((total: number, entry: CatalogEntry) => total + entry.pacsMappings.length, 0), [entries]);
  const filteredEntries = useMemo(() => entries.filter((entry: CatalogEntry) => {
    const matchesText = entry.exam_name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"));
    const matchesModality = modalityFilter === "all" || entry.modality === modalityFilter;
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? entry.is_active : !entry.is_active);
    return matchesText && matchesModality && matchesStatus;
  }), [entries, search, modalityFilter, statusFilter]);

  const startCreate = () => {
    setDraft(emptyDraft());
    setOpen(true);
  };
  const startEdit = (entry: CatalogEntry) => {
    setDraft({
      ...entry,
      documents: entry.documents.length ? entry.documents.map(({ document_key, document_label, sort_order }) => ({ document_key, document_label, sort_order })) : [emptyDraft().documents[0]],
      pacsMappings: entry.pacsMappings.map(({ id, pacs_description, modality }) => ({ id, pacs_description, modality })),
    });
    setOpen(true);
  };
  const saveDraft = () => {
    const documents = draft.documents.filter((document) => document.document_key.trim() && document.document_label.trim());
    if (!draft.exam_name.trim() || !documents.length) {
      toast.error("Informe o nome do exame e pelo menos um documento clínico.");
      return;
    }
    save.mutate({
      id: draft.id,
      exam_name: draft.exam_name.trim(),
      modality: draft.modality,
      bilateral: draft.bilateral,
      sort_order: Number(draft.sort_order) || 0,
      is_active: draft.is_active,
      financial_event_count: Number(draft.financial_event_count) || 1,
      documents: documents.map((document, index) => ({
        document_key: document.document_key.trim().toLowerCase(),
        document_label: document.document_label.trim(),
        sort_order: index,
      })),
      pacsMappings: draft.pacsMappings.filter((mapping) => mapping.pacs_description.trim()).map((mapping) => ({
        pacs_description: mapping.pacs_description.trim(),
        modality: mapping.modality.trim().toUpperCase(),
      })),
    });
  };

  return (
    <main className={embedded ? "space-y-5" : "min-h-screen bg-slate-950 text-slate-100"}>
      {!embedded && <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex min-w-0 items-center gap-4">
            <Button variant="ghost" size="icon" className="text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => navigate("/admin")} aria-label="Voltar à administração">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Administração raiz</p>
              <h1 className="text-xl font-semibold text-white">Catálogo central de exames</h1>
            </div>
          </div>
          <Button className="bg-cyan-600 hover:bg-cyan-500" onClick={startCreate}>
            <Plus className="mr-2 h-4 w-4" /> Novo exame
          </Button>
        </div>
      </header>}

      <section className={embedded ? "space-y-5" : "mx-auto max-w-6xl space-y-6 px-6 py-8"}>
        {embedded && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Administração central</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">Catálogo de exames</h2>
            <p className="text-sm text-gray-500">Legendas canônicas, documentos independentes e correspondências recebidas do PACS.</p>
          </div>
          <Button className="w-full bg-cyan-700 hover:bg-cyan-600 sm:w-auto" onClick={startCreate}><Plus className="mr-2 h-4 w-4" /> Novo exame</Button>
        </div>}

        <section className={embedded ? "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" : "overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"}>
          <div className={embedded ? "border-b border-slate-100 bg-gradient-to-r from-cyan-50 via-white to-white px-5 py-4" : "border-b border-slate-800 px-5 py-4"}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className={embedded ? "text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700" : "text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300"}>Fluxo do catálogo</p>
                <h3 className={embedded ? "mt-1 text-lg font-semibold text-slate-900" : "mt-1 text-lg font-semibold text-white"}>Crie uma legenda, defina os laudos e vincule a descrição do PACS</h3>
                <p className={embedded ? "mt-1 text-sm text-slate-600" : "mt-1 text-sm text-slate-400"}>A legenda é selecionada pelo usuário na página principal; os documentos e eventos determinam o que acontece depois.</p>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:flex sm:items-center sm:gap-6">
                <SummaryMetric label="Cadastrados" value={entries.length} />
                <SummaryMetric label="Ativos" value={activeCount} accent="text-emerald-700" />
                <SummaryMetric label="Documentos" value={entries.reduce((total: number, entry: CatalogEntry) => total + entry.documents.length, 0)} />
                <SummaryMetric label="Mapeamentos" value={mappingCount} />
              </div>
            </div>
          </div>

          <div className="border-b border-slate-100 px-5 py-3">
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_160px_170px]">
              <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 border-slate-300 bg-white pl-9" placeholder="Buscar legenda canônica" /></label>
              <select value={modalityFilter} onChange={(event) => setModalityFilter(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"><option value="all">Modalidade: todas</option>{modalities.map((modality) => <option key={modality} value={modality}>Modalidade: {modality}</option>)}</select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"><option value="active">Status: ativos</option><option value="inactive">Status: inativos</option><option value="all">Status: todos</option></select>
            </div>
            <div className="mt-3 flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
              <p className="text-slate-500"><strong className="text-slate-700">{filteredEntries.length}</strong> exame{filteredEntries.length === 1 ? "" : "s"} encontrado{filteredEntries.length === 1 ? "" : "s"}.</p>
              <p className="flex items-center gap-1.5 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Sem mapeamento, o Portal conserva a descrição original recebida do PACS.</p>
            </div>
          </div>

          <div className="space-y-2 bg-slate-50/70 p-3 sm:p-4">
            {isLoading ? <p className="py-10 text-center text-sm text-slate-400">Carregando catálogo…</p> : null}
            {!isLoading && !filteredEntries.length ? <p className="py-10 text-center text-sm text-slate-400">Nenhum exame corresponde aos filtros selecionados.</p> : null}
            {filteredEntries.map((entry: CatalogEntry) => (
              <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-900">{entry.exam_name}</h2>
                      <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">{entry.modality}</Badge>
                      <Badge variant="outline" className={entry.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-slate-100 text-slate-500"}>{entry.is_active ? "Ativo" : "Inativo"}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-slate-600"><FileText className="h-3.5 w-3.5 text-cyan-700" /><strong className="text-slate-800">{entry.documents.length}</strong> documento{entry.documents.length === 1 ? "" : "s"}</span>
                      <span className="inline-flex items-center gap-1.5 text-slate-600"><span className="font-semibold text-violet-700">$</span><strong className="text-slate-800">{entry.financial_event_count}</strong> evento{entry.financial_event_count === 1 ? "" : "s"} financeiro{entry.financial_event_count === 1 ? "" : "s"}</span>
                      <span className="inline-flex items-center gap-1.5 text-slate-600"><Link2 className="h-3.5 w-3.5 text-slate-500" /><strong className="text-slate-800">{entry.pacsMappings.length}</strong> mapeamento{entry.pacsMappings.length === 1 ? "" : "s"} PACS</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {entry.documents.length ? entry.documents.map((document) => <span key={document.document_key} className="inline-flex items-center gap-1 rounded-md bg-cyan-50 px-2 py-1 text-xs text-cyan-900"><FileText className="h-3 w-3 text-cyan-700" />{document.document_label}</span>) : <span className="text-xs text-amber-700">Sem documento clínico configurado</span>}
                      {entry.pacsMappings.slice(0, 2).map((mapping) => <span key={mapping.id} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"><Link2 className="h-3 w-3" />{mapping.modality || "Qualquer"}: {mapping.pacs_description}</span>)}
                      {entry.pacsMappings.length > 2 && <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">+{entry.pacsMappings.length - 2} mapeamento{entry.pacsMappings.length - 2 === 1 ? "" : "s"}</span>}
                      {!entry.pacsMappings.length ? <span className="text-xs text-slate-500">Sem descrição PACS mapeada.</span> : null}
                    </div>
                  </div>
                  <Button variant="outline" className="shrink-0 border-slate-300 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800" onClick={() => startEdit(entry)}>
                    <Pencil className="mr-2 h-4 w-4" /> Configurar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-700 bg-slate-950 text-slate-100 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Editar exame canônico" : "Novo exame canônico"}</DialogTitle>
            <DialogDescription className="text-slate-400">A alteração afeta somente futuros documentos e mapeamentos; assinaturas anteriores preservam seus snapshots.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_110px_120px_100px]">
              <Field label="Legenda canônica"><Input value={draft.exam_name} onChange={(event) => setDraft({ ...draft, exam_name: event.target.value })} className="border-slate-700 bg-slate-900" placeholder="Ex.: Tomografia de Abdômen Total" /></Field>
              <Field label="Modalidade"><select value={draft.modality} onChange={(event) => setDraft({ ...draft, modality: event.target.value })} className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm">{modalities.map((modality) => <option key={modality}>{modality}</option>)}</select></Field>
              <Field label="Eventos"><Input type="number" min="1" max="20" value={draft.financial_event_count} onChange={(event) => setDraft({ ...draft, financial_event_count: Number(event.target.value) || 1 })} className="border-slate-700 bg-slate-900" title="Eventos criados após todas as assinaturas" /></Field>
              <Field label="Ordem"><Input type="number" min="0" value={draft.sort_order} onChange={(event) => setDraft({ ...draft, sort_order: Number(event.target.value) })} className="border-slate-700 bg-slate-900" /></Field>
            </div>
            <p className="-mt-2 text-xs text-slate-400">Defina quantos eventos financeiros esta legenda gera após todos os documentos clínicos serem assinados. O número de documentos e o número de eventos são regras independentes.</p>
            <div className="flex flex-wrap gap-6 rounded-lg border border-slate-800 p-3">
              <ToggleField label="Exame bilateral" checked={draft.bilateral} onChange={(checked) => setDraft({ ...draft, bilateral: checked })} />
              <ToggleField label="Disponível para novos mapeamentos" checked={draft.is_active} onChange={(checked) => setDraft({ ...draft, is_active: checked })} />
            </div>

            <SectionHeader title="Documentos clínicos" description="Cada linha representa um documento e uma assinatura independentes." onAdd={() => setDraft({ ...draft, documents: [...draft.documents, { document_key: `documento_${draft.documents.length + 1}`, document_label: "", sort_order: draft.documents.length }] })} />
            <div className="space-y-2">
              {draft.documents.map((document, index) => <div key={`${document.document_key}-${index}`} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] gap-2">
                <Input value={document.document_key} onChange={(event) => setDraft({ ...draft, documents: draft.documents.map((current, currentIndex) => currentIndex === index ? { ...current, document_key: event.target.value } : current) })} className="border-slate-700 bg-slate-900" placeholder="chave" />
                <Input value={document.document_label} onChange={(event) => setDraft({ ...draft, documents: draft.documents.map((current, currentIndex) => currentIndex === index ? { ...current, document_label: event.target.value } : current) })} className="border-slate-700 bg-slate-900" placeholder="Título do documento" />
                <Button variant="ghost" size="icon" className="text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" disabled={draft.documents.length === 1} onClick={() => setDraft({ ...draft, documents: draft.documents.filter((_, currentIndex) => currentIndex !== index) })}><Trash2 className="h-4 w-4" /></Button>
              </div>)}
            </div>

            <SectionHeader title="Descrições recebidas do PACS" description="Use a descrição exata e a modalidade recebidas pelo PACS para vincular a legenda canônica." onAdd={() => setDraft({ ...draft, pacsMappings: [...draft.pacsMappings, { pacs_description: "", modality: draft.modality }] })} />
            <div className="space-y-2">
              {draft.pacsMappings.map((mapping, index) => <div key={`${mapping.id ?? "new"}-${index}`} className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2">
                <Input value={mapping.modality} onChange={(event) => setDraft({ ...draft, pacsMappings: draft.pacsMappings.map((current, currentIndex) => currentIndex === index ? { ...current, modality: event.target.value.toUpperCase() } : current) })} className="border-slate-700 bg-slate-900" placeholder="CT" />
                <Input value={mapping.pacs_description} onChange={(event) => setDraft({ ...draft, pacsMappings: draft.pacsMappings.map((current, currentIndex) => currentIndex === index ? { ...current, pacs_description: event.target.value } : current) })} className="border-slate-700 bg-slate-900" placeholder="Descrição original PACS" />
                <Button variant="ghost" size="icon" className="text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" onClick={() => {
                  if (mapping.id) removeMapping.mutate({ id: mapping.id });
                  setDraft({ ...draft, pacsMappings: draft.pacsMappings.filter((_, currentIndex) => currentIndex !== index) });
                }}><Trash2 className="h-4 w-4" /></Button>
              </div>)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-slate-300" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="bg-cyan-600 hover:bg-cyan-500" disabled={save.isPending} onClick={saveDraft}>{save.isPending ? "Salvando…" : "Salvar catálogo"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function SummaryMetric({ label, value, accent = "text-slate-900" }: { label: string; value: number; accent?: string }) {
  return <div className="min-w-[68px]"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className={`text-lg font-semibold ${accent}`}>{value}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label className="text-slate-300">{label}</Label>{children}</div>;
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center gap-3"><Switch checked={checked} onCheckedChange={onChange} /><Label className="text-sm text-slate-300">{label}</Label></div>;
}

function SectionHeader({ title, description, onAdd }: { title: string; description: string; onAdd: () => void }) {
  return <div className="flex items-end justify-between gap-3"><div><h3 className="font-medium text-white">{title}</h3><p className="text-xs text-slate-400">{description}</p></div><Button type="button" size="sm" variant="outline" className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white" onClick={onAdd}><Plus className="mr-1 h-3.5 w-3.5" />Adicionar</Button></div>;
}
