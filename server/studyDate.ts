/**
 * Normaliza datas clínicas recebidas do DICOM (YYYYMMDD), de APIs (YYYY-MM-DD)
 * ou de colunas DATE para o formato ISO de data, sem deslocamento de fuso horário.
 */
export function normalizeStudyDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  const dicomMatch = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dicomMatch) return `${dicomMatch[1]}-${dicomMatch[2]}-${dicomMatch[3]}`;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  return null;
}

export function studyDateToUtcDate(value: string | Date | null | undefined): Date | null {
  const normalized = normalizeStudyDate(value);
  return normalized ? new Date(`${normalized}T00:00:00.000Z`) : null;
}
