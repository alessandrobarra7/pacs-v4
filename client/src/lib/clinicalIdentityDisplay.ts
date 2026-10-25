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

// ── Leitura dos dados do estudo gravados pela worklist/viewer (sessionStorage) ──
//
// ADENDO (parecer Manus 50a9ef3, bloqueio 1): a leitura agora devolve um resultado
// explícito. O editor guarda o resultado JUNTO com o UID lido, e só considera os
// dados válidos para o UID atual — assim nada do Estudo A sobrevive no Estudo B,
// nem por um único render.

export type StudySessionRead<T> =
  | { status: "found"; info: T }
  | { status: "missing" }
  | { status: "invalid" };

type StorageLike = Pick<Storage, "getItem"> | null | undefined;

export function readStudySessionInfo<T extends Record<string, unknown>>(storage: StorageLike, studyUid: string): StudySessionRead<T> {
  if (!storage || !studyUid) return { status: "missing" };
  let raw: string | null;
  try {
    raw = storage.getItem(`study_${studyUid}`);
  } catch {
    return { status: "invalid" };
  }
  if (raw == null || raw === "") return { status: "missing" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "invalid" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { status: "invalid" };
  const info = parsed as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    status: "found",
    info: {
      ...info,
      birthDate: text(info.birthDate) || text(info.patientBirthDate),
      sex: text(info.sex) || text(info.patientSex),
    } as unknown as T,
  };
}

// ── Guarda das ações clínicas ──
// ADENDO (parecer Manus 50a9ef3, bloqueio 2): salvar, assinar, iniciar nova ocorrência,
// imprimir e baixar exigem os dados do estudo resolvidos para o UID atual.
export const CLINICAL_STUDY_UNAVAILABLE_MESSAGE =
  "Não é possível salvar ou assinar: os dados do estudo não estão disponíveis. Volte à lista e abra o estudo novamente.";
export const CLINICAL_STUDY_UNAVAILABLE_PRINT_MESSAGE =
  "Não é possível imprimir ou baixar: os dados do estudo não estão disponíveis. Volte à lista e abra o estudo novamente.";

export function hasResolvedClinicalStudy(studyInfoResolved: boolean, studyInfo: unknown): boolean {
  return studyInfoResolved && studyInfo !== null && studyInfo !== undefined;
}
