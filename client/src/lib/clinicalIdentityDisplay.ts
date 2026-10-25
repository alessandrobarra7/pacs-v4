// Exibição de identidade clínica na TELA do editor de laudos.
//
// CORREÇÃO (claude/corrige-preview-layout-unidade-editor-mobile, commit 1):
// o cartão mobile do editor mostrava um nome e uma data de nascimento FICTÍCIOS
// quando o nome/nascimento não estavam disponíveis, e a folha desktop mostrava a
// DATA DE HOJE quando faltava a data do estudo. A tela nunca pode inventar dado
// clínico plausível: ausência vira um estado neutro, visualmente distinto.
//
// Estes textos são SÓ de exibição. Não entram no corpo do laudo (collectBody lê
// apenas o conteúdo editável), não são gravados e não vão para o PDF.

export const CLINICAL_EMPTY_VALUE = "—";

export type PatientNameDisplay = {
  text: string;
  /** true quando o texto é um estado (carregando/ausente), não o nome do paciente. */
  isPlaceholder: boolean;
};

/**
 * @param formattedName nome já formatado (pode ser vazio)
 * @param studyInfoResolved a tentativa de carregar os dados do estudo já terminou
 * @param hasStudyInfo os dados do estudo foram encontrados
 */
export function patientNameDisplay(formattedName: string | null | undefined, studyInfoResolved: boolean, hasStudyInfo: boolean): PatientNameDisplay {
  const name = (formattedName ?? "").trim();
  if (name) return { text: name, isPlaceholder: false };
  if (!studyInfoResolved) return { text: "Carregando…", isPlaceholder: true };
  if (!hasStudyInfo) return { text: "Dados do estudo indisponíveis", isPlaceholder: true };
  return { text: "Nome não informado", isPlaceholder: true };
}

/** Data clínica (nascimento, data do estudo) já formatada; ausente vira "—", nunca a data atual. */
export function clinicalDateDisplay(formattedDate: string | null | undefined): string {
  const value = (formattedDate ?? "").trim();
  return value || CLINICAL_EMPTY_VALUE;
}
