/**
 * ExamPickerModal — Modal de seleção múltipla de exames radiológicos
 *
 * Permite ao operador selecionar um ou mais exames do catálogo (RX, TC, RM, US, Mamografia).
 * Texto livre também é aceito como "outro" (conta como 1 unidade).
 * A contagem de exames selecionados determina quantas folhas o médico terá no editor de laudos.
 * Importante: múltiplas folhas = 1 único laudo para fins financeiros.
 */

import { useState, useMemo } from "react";
import { X, Search, Check, Plus } from "lucide-react";

// ── Catálogo de exames por categoria ─────────────────────────────────────────

export const EXAM_CATALOG: Record<string, string[]> = {
  "Radiografia (RX)": [
    "RX TÓRAX PA E PERFIL",
    "RX TÓRAX PA",
    "RX ABDOME SIMPLES",
    "RX COLUNA CERVICAL AP E PERFIL",
    "RX COLUNA TORÁCICA AP E PERFIL",
    "RX COLUNA LOMBAR AP E PERFIL",
    "RX COLUNA LOMBOSSACRA AP E PERFIL",
    "RX PELVE AP",
    "RX BACIA AP",
    "RX CRÂNIO AP E PERFIL",
    "RX MÃO DIREITA",
    "RX MÃO ESQUERDA",
    "RX PÉ DIREITO",
    "RX PÉ ESQUERDO",
    "RX JOELHO DIREITO",
    "RX JOELHO ESQUERDO",
    "RX OMBRO DIREITO",
    "RX OMBRO ESQUERDO",
    "RX TORNOZELO DIREITO",
    "RX TORNOZELO ESQUERDO",
    "RX QUADRIL DIREITO",
    "RX QUADRIL ESQUERDO",
    "ESCANEOMETRIA DE MEMBROS INFERIORES",
    "RX PANORÂMICO COLUNA",
  ],
  "Tomografia (TC)": [
    "TC CRÂNIO SEM CONTRASTE",
    "TC CRÂNIO COM CONTRASTE",
    "TC TÓRAX SEM CONTRASTE",
    "TC TÓRAX COM CONTRASTE",
    "TC ABDOME TOTAL SEM CONTRASTE",
    "TC ABDOME TOTAL COM CONTRASTE",
    "TC PELVE SEM CONTRASTE",
    "TC PELVE COM CONTRASTE",
    "TC ABDOME E PELVE COM CONTRASTE",
    "TC COLUNA CERVICAL",
    "TC COLUNA TORÁCICA",
    "TC COLUNA LOMBAR",
    "TC SEIOS DA FACE",
    "TC PESCOÇO COM CONTRASTE",
    "TC TÓRAX E ABDOME COM CONTRASTE",
    "ANGIOTOMOGRAFIA DE TÓRAX",
    "ANGIOTOMOGRAFIA DE ABDOME",
  ],
  "Ressonância (RM)": [
    "RM CRÂNIO SEM CONTRASTE",
    "RM CRÂNIO COM CONTRASTE",
    "RM COLUNA CERVICAL",
    "RM COLUNA TORÁCICA",
    "RM COLUNA LOMBAR",
    "RM OMBRO DIREITO",
    "RM OMBRO ESQUERDO",
    "RM JOELHO DIREITO",
    "RM JOELHO ESQUERDO",
    "RM QUADRIL DIREITO",
    "RM QUADRIL ESQUERDO",
    "RM ABDOME",
    "RM PELVE",
    "RM MAMA BILATERAL",
    "RM TORNOZELO DIREITO",
    "RM TORNOZELO ESQUERDO",
  ],
  "Ultrassonografia (US)": [
    "US ABDOME TOTAL",
    "US ABDOME SUPERIOR",
    "US PÉLVICO",
    "US TRANSVAGINAL",
    "US MAMA BILATERAL",
    "US MAMA DIREITA",
    "US MAMA ESQUERDA",
    "US TIREOIDE",
    "US PESCOÇO",
    "US TESTICULAR",
    "US PRÓSTATA TRANSRETAL",
    "US OBSTÉTRICO",
    "US MORFOLÓGICO",
    "US DOPPLER VASCULAR",
    "US PARTES MOLES",
    "US ARTICULAR",
  ],
  "Mamografia": [
    "MAMOGRAFIA BILATERAL",
    "MAMOGRAFIA UNILATERAL DIREITA",
    "MAMOGRAFIA UNILATERAL ESQUERDA",
    "DENSITOMETRIA ÓSSEA COLUNA E FÊMUR",
  ],
};

// Lista plana de todos os exames do catálogo
export const ALL_CATALOG_EXAMS = Object.values(EXAM_CATALOG).flat();

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ExamPickerModalProps {
  /** Exames já selecionados (array de strings) */
  initialExams: string[];
  /** Callback ao confirmar a seleção */
  onConfirm: (exams: string[], examCount: number) => void;
  /** Callback ao fechar/cancelar */
  onClose: () => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ExamPickerModal({ initialExams, onConfirm, onClose }: ExamPickerModalProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(initialExams.length > 0 ? initialExams : []);
  const [freeText, setFreeText] = useState("");

  // Filtra o catálogo conforme o texto de busca
  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return EXAM_CATALOG;
    const q = search.toLowerCase();
    const result: Record<string, string[]> = {};
    for (const [cat, exams] of Object.entries(EXAM_CATALOG)) {
      const filtered = exams.filter(e => e.toLowerCase().includes(q));
      if (filtered.length > 0) result[cat] = filtered;
    }
    return result;
  }, [search]);

  const toggleExam = (exam: string) => {
    setSelected(prev =>
      prev.includes(exam) ? prev.filter(e => e !== exam) : [...prev, exam]
    );
  };

  const addFreeText = () => {
    const trimmed = freeText.trim().toUpperCase();
    if (!trimmed) return;
    if (!selected.includes(trimmed)) {
      setSelected(prev => [...prev, trimmed]);
    }
    setFreeText("");
  };

  const removeSelected = (exam: string) => {
    setSelected(prev => prev.filter(e => e !== exam));
  };

  const handleConfirm = () => {
    if (selected.length === 0) return;
    // Texto composto: exames separados por " + "
    const description = selected.join(" + ");
    // Contagem: número de itens selecionados
    const count = selected.length;
    onConfirm(selected, count);
    // Passa o texto composto e a contagem para o callback
    void description;
    void count;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Selecionar Exames</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Selecione um ou mais exames. Cada item gera uma folha de laudo separada (conta como 1 laudo).
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Selecionados */}
        {selected.length > 0 && (
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-100">
            <p className="text-xs font-medium text-blue-700 mb-2">
              Selecionados ({selected.length} {selected.length === 1 ? "exame" : "exames"}):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selected.map(exam => (
                <span
                  key={exam}
                  className="inline-flex items-center gap-1 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full"
                >
                  {exam}
                  <button
                    onClick={() => removeSelected(exam)}
                    className="hover:text-blue-200 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Buscador */}
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar exame no catálogo..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Catálogo */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {Object.entries(filteredCatalog).map(([category, exams]) => (
            <div key={category}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{category}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {exams.map(exam => {
                  const isSelected = selected.includes(exam);
                  return (
                    <button
                      key={exam}
                      onClick={() => toggleExam(exam)}
                      className={`flex items-center gap-2 text-left text-xs px-3 py-2 rounded-lg border transition-all ${
                        isSelected
                          ? "bg-blue-50 border-blue-300 text-blue-800 font-medium"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300"
                      }`}
                    >
                      <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                        isSelected ? "bg-blue-600 border-blue-600" : "border-gray-300"
                      }`}>
                        {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                      </span>
                      {exam}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {Object.keys(filteredCatalog).length === 0 && search.trim() && (
            <p className="text-sm text-gray-400 text-center py-4">
              Nenhum exame encontrado para "{search}". Use o campo abaixo para adicionar manualmente.
            </p>
          )}

          {/* Texto livre */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Outro (texto livre)</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={freeText}
                onChange={e => setFreeText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addFreeText(); }}
                placeholder="Digite o nome do exame e pressione Enter..."
                className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addFreeText}
                disabled={!freeText.trim()}
                className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg disabled:opacity-40 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected.length === 0}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Confirmar {selected.length > 0 ? `(${selected.length} ${selected.length === 1 ? "exame" : "exames"})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
