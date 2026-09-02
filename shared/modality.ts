/** Normaliza equivalências de rótulos locais para o código DICOM canônico. */
export function normalizeDicomModality(value: unknown): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "RM" ? "MR" : normalized;
}

/**
 * Retorna a modalidade única aceita pelo Portal para um estudo.
 * Estudos sem modalidade ou com múltiplas modalidades são negados para nova
 * composição, pois a regra de negócio atual exige uma única modalidade.
 */
export function getSingleStudyModality(value: unknown): string | null {
  const normalized = normalizeDicomModality(value);
  if (!normalized || /[\\,;|/]/.test(normalized)) return null;
  return normalized;
}
