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
    onSuccess: () => {
      toast.success("Exame do catálogo salvo");
      utils.examCatalog.list.invalidate();
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

        <Card className={embedded ? "border-amber-200 bg-amber-50 text-amber-950" : "border-amber-400/20 bg-amber-400/5 text-slate-100"}>
          <CardContent className={embedded ? "flex gap-3 p-4 text-sm text-amber-900" : "flex gap-3 p-4 text-sm text-amber-100"}>
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <p>Somente descrições PACS mapeadas aqui recebem legenda canônica. Quando não houver mapeamento, o Portal exibe a descrição original do PACS.</p>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Exames cadastrados" value={entries.length} />
          <Metric label="Exames ativos" value={activeCount} />
          <Metric label="Documentos configurados" value={entries.reduce((total: number, entry: CatalogEntry) => total + entry.documents.length, 0)} />
          <Metric label="Mapeamentos PACS" value={mappingCount} />
        </div>

        <Card className={embedded ? "border-gray-200 bg-white text-gray-900" : "border-slate-800 bg-slate-900/60 text-slate-100"}>
          <CardHeader>
            <CardTitle>Exames disponíveis</CardTitle>
            <CardDescription className={embedded ? "text-gray-500" : "text-slate-400"}>Cada documento exige assinatura própria; os eventos financeiros são liberados somente quando todas as assinaturas estiverem concluídas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_150px_160px]">
              <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="border-gray-300 bg-white pl-9" placeholder="Buscar por nome de exame" /></label>
              <select value={modalityFilter} onChange={(event) => setModalityFilter(event.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700"><option value="all">Todas as modalidades</option>{modalities.map((modality) => <option key={modality} value={modality}>{modality}</option>)}</select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700"><option value="active">Somente ativos</option><option value="inactive">Somente inativos</option><option value="all">Todos os status</option></select>
            </div>
            <p className={embedded ? "text-xs text-gray-500" : "text-xs text-slate-400"}>{filteredEntries.length} resultado(s) conforme os filtros administrativos.</p>
            {isLoading ? <p className="py-8 text-center text-sm text-slate-400">Carregando catálogo…</p> : null}
            {!isLoading && !filteredEntries.length ? <p className="py-8 text-center text-sm text-slate-400">Nenhum exame corresponde aos filtros selecionados.</p> : null}
            {filteredEntries.map((entry: CatalogEntry) => (
              <article key={entry.id} className={embedded ? "rounded-xl border border-gray-200 bg-gray-50 p-4" : "rounded-xl border border-slate-800 bg-slate-950/60 p-4"}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className={embedded ? "font-medium text-gray-900" : "font-medium text-white"}>{entry.exam_name}</h2>
                      <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">{entry.modality}</Badge>
                      <Badge variant="outline" className="border-violet-500/40 text-violet-300">{entry.financial_event_count} {entry.financial_event_count === 1 ? "evento financeiro" : "eventos financeiros"}</Badge>
                      <Badge variant="outline" className={entry.is_active ? "border-emerald-500/40 text-emerald-300" : "border-slate-600 text-slate-400"}>{entry.is_active ? "Ativo" : "Inativo"}</Badge>
                    </div>
                    <div className={embedded ? "flex flex-wrap gap-2 text-xs text-gray-700" : "flex flex-wrap gap-2 text-xs text-slate-300"}>
                      {entry.documents.length ? entry.documents.map((document) => <span key={document.document_key} className={embedded ? "inline-flex items-center gap-1 rounded-md bg-cyan-50 px-2 py-1 text-cyan-900" : "inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1"}><FileText className="h-3.5 w-3.5 text-cyan-600" />{document.document_label}</span>) : <span className="text-amber-600">Sem documento clínico configurado</span>}
                    </div>
                    <div className={embedded ? "flex flex-wrap gap-2 text-xs text-gray-500" : "flex flex-wrap gap-2 text-xs text-slate-400"}>
                      {entry.pacsMappings.map((mapping) => <span key={mapping.id} className={embedded ? "inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1" : "inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1"}><Link2 className="h-3.5 w-3.5" />{mapping.modality || "Qualquer"}: {mapping.pacs_description}</span>)}
                      {!entry.pacsMappings.length ? <span>Sem descrição PACS mapeada.</span> : null}
                    </div>
                  </div>
                  <Button variant="outline" className={embedded ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-100" : "border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white"} onClick={() => startEdit(entry)}>
                    <Pencil className="mr-2 h-4 w-4" /> Editar
                  </Button>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>
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

function Metric({ label, value }: { label: string; value: number }) {
  return <Card className="border-gray-200 bg-white text-gray-900"><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-gray-500">{label}</p><p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p></CardContent></Card>;
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
