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
    cycleStart = new Date(year, month, sd);
    cycleEnd = new Date(year, month, ed + 1);
  } else if (day >= sd) {
    cycleStart = new Date(year, month, sd);
    cycleEnd = new Date(year, month + 1, ed + 1);
  } else {
    cycleStart = new Date(year, month - 1, sd);
    cycleEnd = new Date(year, month, ed + 1);
  }

  const inclusiveEnd = new Date(cycleEnd.getTime() - 1);
  return {
    cycleStart,
    cycleEnd,
    label: `${formatCycleDate(cycleStart)} – ${formatCycleDate(inclusiveEnd)}`,
  };
}
