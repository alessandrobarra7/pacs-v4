/**
 * ExamSelectionModal — Modal de seleção múltipla de exames por paciente.
 *
 * Fluxo:
 * 1. O buscador detecta que um paciente tem múltiplos estudos disponíveis.
 * 2. Abre este modal com a lista de estudos do paciente.
 * 3. O médico seleciona quais estudos incluir no laudo (1 ou mais).
 * 4. Ao confirmar, o modal chama onConfirm com os estudos selecionados.
 * 5. O buscador salva os dados no sessionStorage e navega para o editor.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { FileText, Check, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface StudyForSelection {
  studyInstanceUid: string;
  modality: string;
  studyDescription: string;
  studyDate: string;
  numberOfInstances?: number;
  accessionNumber?: string;
}

interface ExamSelectionModalProps {
  open: boolean;
  patientName: string;
  patientID: string;
  studies: StudyForSelection[];
  onConfirm: (selectedStudies: StudyForSelection[]) => void;
  onCancel: () => void;
}

/** Formata data DICOM YYYYMMDD → DD/MM/YYYY */
function formatDicomDate(d: string): string {
  if (!d || d.length < 8) return d || "—";
  return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
}

/** Cor do badge por modalidade */
const MODALITY_COLORS: Record<string, string> = {
  CR: "bg-blue-100 text-blue-800",
  DX: "bg-blue-100 text-blue-800",
  CT: "bg-orange-100 text-orange-800",
  MR: "bg-purple-100 text-purple-800",
  US: "bg-teal-100 text-teal-800",
  MG: "bg-pink-100 text-pink-800",
  RF: "bg-yellow-100 text-yellow-800",
  PT: "bg-red-100 text-red-800",
  NM: "bg-green-100 text-green-800",
};

function ModalityBadge({ modality }: { modality: string }) {
  const cls = MODALITY_COLORS[modality?.toUpperCase()] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${cls}`}>
      {modality || "—"}
    </span>
  );
}

/**
 * Hook que busca o título padronizado do catálogo para um estudo.
 * Retorna o título original como fallback enquanto carrega.
 */
function useExamTitle(modality: string, studyDescription: string) {
  const { data } = trpc.catalog.mapTitle.useQuery(
    { modality, studyDescription },
    { enabled: !!modality && !!studyDescription, staleTime: 60_000 }
  );
  return data?.title ?? studyDescription ?? modality;
}

function StudyRow({
  study,
  selected,
  onToggle,
}: {
  study: StudyForSelection;
  selected: boolean;
  onToggle: () => void;
}) {
  const title = useExamTitle(study.modality, study.studyDescription);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left
        ${selected
          ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
        }`}
    >
      {/* Checkbox visual */}
      <div
        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
          ${selected ? "border-emerald-500 bg-emerald-500" : "border-gray-300 bg-white"}`}
      >
        {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>

      {/* Info do exame */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <ModalityBadge modality={study.modality} />
          <span className="text-xs text-gray-400">{formatDicomDate(study.studyDate)}</span>
          {study.numberOfInstances != null && study.numberOfInstances > 0 && (
            <span className="text-xs text-gray-400">· {study.numberOfInstances} imagens</span>
          )}
        </div>
        <p className="text-sm font-medium text-gray-800 truncate" title={title}>
          {title}
        </p>
        {study.accessionNumber && (
          <p className="text-xs text-gray-400 mt-0.5">Acesso: {study.accessionNumber}</p>
        )}
      </div>
    </button>
  );
}

export function ExamSelectionModal({
  open,
  patientName,
  patientID,
  studies,
  onConfirm,
  onCancel,
}: ExamSelectionModalProps) {
  const [selected, setSelected] = useState<Set<string>>(
    // Pré-selecionar todos os estudos por padrão
    () => new Set(studies.map((s) => s.studyInstanceUid))
  );

  const toggleStudy = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const selectedStudies = useMemo(
    () => studies.filter((s) => selected.has(s.studyInstanceUid)),
    [studies, selected]
  );

  const handleConfirm = () => {
    if (selectedStudies.length === 0) return;
    onConfirm(selectedStudies);
  };

  if (!open) return null;

  const displayName = patientName.replace(/\^+/g, " ").replace(/\s{2,}/g, " ").trim().toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              Selecionar Exames para Laudo
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              <span className="font-medium text-gray-700">{displayName}</span>
              {patientID && <span className="ml-2 text-gray-400">· {patientID}</span>}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors ml-4 flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instrução */}
        <div className="px-6 pt-3 pb-1">
          <p className="text-xs text-gray-500">
            Selecione os exames que farão parte deste laudo. Cada exame terá sua própria seção.
            Seções não preenchidas serão omitidas na impressão.
          </p>
        </div>

        {/* Lista de estudos */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
          {studies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p className="text-sm">Nenhum estudo disponível para este paciente.</p>
            </div>
          ) : (
            studies.map((study) => (
              <StudyRow
                key={study.studyInstanceUid}
                study={study}
                selected={selected.has(study.studyInstanceUid)}
                onToggle={() => toggleStudy(study.studyInstanceUid)}
              />
            ))
          )}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            {selected.size} de {studies.length} exame{studies.length !== 1 ? "s" : ""} selecionado{selected.size !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Iniciar Laudo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
