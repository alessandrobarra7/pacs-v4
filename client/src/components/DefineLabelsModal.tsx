import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Search, Plus, X, GripVertical, Tag } from "lucide-react";
import { toast } from "sonner";

interface LabelItem {
  title: string;
  modality: string;
  order: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  studyInstanceUid: string;
  studyModality?: string;
  patientName?: string;
  onSaved?: (labels: LabelItem[]) => void;
}

export function DefineLabelsModal({ open, onClose, studyInstanceUid, studyModality, patientName, onSaved }: Props) {
  const [search, setSearch] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<LabelItem[]>([]);

  // Load existing labels for this study
  const existingQuery = trpc.studyLabels.get.useQuery(
    { studyInstanceUid },
    { enabled: open && !!studyInstanceUid }
  );
  const existingData = existingQuery.data;

  // Load catalog suggestions based on search
  const { data: catalogData } = trpc.catalog.list.useQuery(
    { modality: studyModality, query: search || undefined },
    { enabled: open }
  );

  const saveStudyLabelsMutation = trpc.studyLabels.save.useMutation({
    onSuccess: () => {
      toast.success("Legendas salvas com sucesso");
      onSaved?.(selectedLabels);
      onClose();
    },
    onError: (err: { message: string }) => {
      toast.error("Erro ao salvar legendas: " + err.message);
    },
  });

  // Pre-fill with existing labels when modal opens
  useEffect(() => {
    if (open && existingData?.labels && existingData.labels.length > 0) {
      setSelectedLabels(existingData.labels);
    } else if (open) {
      setSelectedLabels([]);
    }
  }, [open, existingData]);

  const addLabel = (title: string, modality: string) => {
    if (selectedLabels.some((l) => l.title === title)) {
      toast.info("Este exame já foi adicionado");
      return;
    }
    setSelectedLabels((prev) => [
      ...prev,
      { title, modality, order: prev.length },
    ]);
    setSearch("");
  };

  const removeLabel = (index: number) => {
    setSelectedLabels((prev) => prev.filter((_, i) => i !== index).map((l, i) => ({ ...l, order: i })));
  };

  const handleSave = () => {
    if (selectedLabels.length === 0) {
      toast.error("Selecione pelo menos um exame");
      return;
    }
    saveStudyLabelsMutation.mutate({ studyInstanceUid, labels: selectedLabels });
  };

  const catalogItems = Array.isArray(catalogData) ? catalogData : [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            Definir Legendas de Exames
          </DialogTitle>
          {patientName && (
            <p className="text-sm text-muted-foreground mt-1">
              Paciente: <span className="font-medium text-foreground">{patientName.replace(/\^/g, " ")}</span>
            </p>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-4 flex-1 overflow-hidden">
          {/* Selected labels */}
          <div>
            <p className="text-sm font-medium mb-2">
              Exames selecionados{" "}
              <span className="text-muted-foreground font-normal">({selectedLabels.length})</span>
            </p>
            {selectedLabels.length === 0 ? (
              <div className="border border-dashed rounded-lg p-4 text-center text-sm text-muted-foreground">
                Nenhum exame selecionado. Busque e adicione exames abaixo.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedLabels.map((label, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2"
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{label.title}</p>
                      <p className="text-xs text-muted-foreground">{label.modality}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLabel(idx)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search catalog */}
          <div className="flex flex-col gap-2 flex-1 overflow-hidden">
            <p className="text-sm font-medium">Buscar no catálogo</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Digite o nome do exame (ex: Tórax, Coluna, Joelho...)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto border rounded-lg divide-y max-h-64">
              {catalogItems.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {search ? "Nenhum exame encontrado" : "Digite para buscar exames no catálogo"}
                </div>
              ) : (
                catalogItems.map((item: { id: number; title: string; modality: string; keywords?: string | null; active?: boolean; createdAt?: Date }) => {
                  const alreadyAdded = selectedLabels.some((l) => l.title === item.title);
                  return (
                    <button
                      key={item.id}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                        alreadyAdded
                          ? "bg-muted/50 text-muted-foreground cursor-default"
                          : "hover:bg-accent cursor-pointer"
                      }`}
                      onClick={() => !alreadyAdded && addLabel(item.title, item.modality)}
                      disabled={alreadyAdded}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <Badge variant="outline" className="text-xs">
                          {item.modality}
                        </Badge>
                        {alreadyAdded ? (
                          <span className="text-xs text-muted-foreground">Adicionado</span>
                        ) : (
                          <Plus className="w-4 h-4 text-primary" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveStudyLabelsMutation.isPending || selectedLabels.length === 0}
          >
            {saveStudyLabelsMutation.isPending ? "Salvando..." : `Salvar ${selectedLabels.length > 0 ? `(${selectedLabels.length} exame${selectedLabels.length > 1 ? "s" : ""})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
