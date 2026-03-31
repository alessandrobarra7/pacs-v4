import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { ClipboardList, Loader2 } from 'lucide-react';

const PRESETS = [
  'Dor abdominal',
  'Cefaleia persistente',
  'Trauma recente',
  'Perda de peso inexplicável',
  'Febre prolongada',
  'Tosse crônica',
  'Dispneia aos esforços',
  'Dor torácica',
  'Controle pós-operatório',
  'Acompanhamento oncológico',
  'Dor lombar',
  'Investigação de nódulo',
];

interface AnamnesisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studyInstanceUid: string;
  patientName: string;
  onSaved?: () => void;
}

export default function AnamnesisDialog({
  open,
  onOpenChange,
  studyInstanceUid,
  patientName,
  onSaved,
}: AnamnesisDialogProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState(false);

  // Busca anamnese existente ao abrir o dialog
  const { data: existing, isLoading } = trpc.anamnesisSimple.getByStudy.useQuery(
    { studyInstanceUid },
    { enabled: open && !!studyInstanceUid }
  );

  // Preenche os campos com dados existentes ao carregar
  useEffect(() => {
    if (existing) {
      setSelected((existing.presets as string[]) ?? []);
      setManual(existing.manual_text ?? '');
    } else if (!isLoading) {
      setSelected([]);
      setManual('');
    }
  }, [existing, isLoading]);

  const utils = trpc.useUtils();
  const saveMutation = trpc.anamnesisSimple.save.useMutation({
    onSuccess: () => {
      toast.success('Anamnese salva com sucesso');
      utils.anamnesisSimple.getByStudy.invalidate({ studyInstanceUid });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message || 'Erro ao salvar anamnese');
    },
  });

  const togglePreset = (preset: string) => {
    setSelected(prev =>
      prev.includes(preset) ? prev.filter(p => p !== preset) : [...prev, preset]
    );
  };

  const handleSave = () => {
    if (!manual.trim()) {
      setManualError(true);
      return;
    }
    setManualError(false);
    saveMutation.mutate({
      studyInstanceUid,
      patientName,
      presets: selected,
      manualText: manual.trim(),
    });
  };

  const handleClose = () => {
    setManualError(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="w-5 h-5 text-primary" />
            Anamnese — <span className="text-primary">{patientName}</span>
          </DialogTitle>
          {existing && (
            <p className="text-xs text-muted-foreground mt-1">
              Última atualização: {new Date(existing.updatedAt).toLocaleString('pt-BR')}
            </p>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Presets */}
            <div>
              <p className="text-sm font-medium text-foreground mb-3">
                Indicações pré-definidas:
                {selected.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{selected.length} selecionada{selected.length > 1 ? 's' : ''}</Badge>
                )}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map(preset => (
                  <label
                    key={preset}
                    className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors text-sm ${
                      selected.includes(preset)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-accent text-foreground'
                    }`}
                  >
                    <Checkbox
                      checked={selected.includes(preset)}
                      onCheckedChange={() => togglePreset(preset)}
                    />
                    <span>{preset}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Campo manual obrigatório */}
            <div>
              <Label htmlFor="manual-anamnesis" className="text-sm font-medium">
                Indicação clínica / observações
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Textarea
                id="manual-anamnesis"
                placeholder="Descreva aqui a indicação clínica, motivo do exame, histórico relevante..."
                value={manual}
                onChange={(e) => {
                  setManual(e.target.value);
                  if (e.target.value.trim()) setManualError(false);
                }}
                className={`mt-1.5 min-h-[100px] ${manualError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              />
              {manualError && (
                <p className="text-xs text-destructive mt-1">
                  O campo de indicação clínica é obrigatório.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saveMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending || isLoading}
            className="bg-primary text-primary-foreground"
          >
            {saveMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
            ) : (
              'Salvar Anamnese'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
