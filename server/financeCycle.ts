export type FinancialCycleDates = {
  cycleStart: Date;
  cycleEnd: Date;
  label: string;
};

function formatCycleDate(value: Date): string {
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${value.getFullYear()}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampedDate(year: number, monthIndex: number, day: number): Date {
  const clampedDay = Math.min(Math.max(day, 1), daysInMonth(year, monthIndex));
  return new Date(year, monthIndex, clampedDay);
}

function dayAfterClamped(year: number, monthIndex: number, day: number): Date {
  const clampedDay = Math.min(Math.max(day, 1), daysInMonth(year, monthIndex));
  return new Date(year, monthIndex, clampedDay + 1);
}

/**
 * Retorna o ciclo que contém a data de referência. O fim é exclusivo para uso
 * em consultas SQL; o rótulo apresenta o último dia efetivo do intervalo.
 */
export function calculateFinancialCycleDates(
  startDay: number | null | undefined,
  endDay: number | null | undefined,
  referenceDate: Date,
): FinancialCycleDates {
  const sd = startDay ?? 1;
  const ed = endDay ?? 31;
  const day = referenceDate.getDate();
  const month = referenceDate.getMonth();
  const year = referenceDate.getFullYear();
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
