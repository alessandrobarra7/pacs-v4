export type FinancialCycleDates = {
  cycleStart: Date;
  cycleEnd: Date;
  label: string;
};

function formatCycleDate(value: Date): string {
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${value.getUTCFullYear()}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function clampedDate(year: number, monthIndex: number, day: number): Date {
  const clampedDay = Math.min(Math.max(day, 1), daysInMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, clampedDay));
}

function dayAfterClamped(year: number, monthIndex: number, day: number): Date {
  const clampedDay = Math.min(Math.max(day, 1), daysInMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, clampedDay + 1));
}

/**
 * Retorna o ciclo que contém a data de referência. O fim é exclusivo para uso
 * em consultas SQL; o rótulo apresenta o último dia efetivo do intervalo.
 *
 * A convenção financeira é UTC: `signed_at` e as vigências de preço usam essa
 * base. Aritmética em horário local faria o mesmo instante cair em ciclos
 * diferentes se o processo Node fosse iniciado em outro fuso horário.
 */
export function calculateFinancialCycleDates(
  startDay: number | null | undefined,
  endDay: number | null | undefined,
  referenceDate: Date,
): FinancialCycleDates {
  const sd = startDay ?? 1;
  const ed = endDay ?? 31;
  const day = referenceDate.getUTCDate();
  const month = referenceDate.getUTCMonth();
  const year = referenceDate.getUTCFullYear();
  let cycleStart: Date;
  let cycleEnd: Date;

  if (sd <= ed) {
    cycleStart = clampedDate(year, month, sd);
    cycleEnd = dayAfterClamped(year, month, ed);
  } else if (day >= sd) {
    cycleStart = clampedDate(year, month, sd);
    cycleEnd = dayAfterClamped(year, month + 1, ed);
  } else {
    cycleStart = clampedDate(year, month - 1, sd);
    cycleEnd = dayAfterClamped(year, month, ed);
  }

  const inclusiveEnd = new Date(cycleEnd.getTime() - 1);
  return {
    cycleStart,
    cycleEnd,
    label: `${formatCycleDate(cycleStart)} – ${formatCycleDate(inclusiveEnd)}`,
  };
}
