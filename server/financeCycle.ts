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
 * Quantidade real de dias de um mês (0-indexado, mesma convenção do Date nativo).
 * new Date(year, monthIndex + 1, 0) é o "dia 0" do mês seguinte, ou seja, o
 * último dia válido de `monthIndex`.
 */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Constrói uma data no dia informado dentro do mês, limitando ao último dia
 * real do mês quando `day` for maior (ex.: dia 31 em fevereiro/abril/junho/
 * setembro/novembro). Sem esse limite, `new Date(year, monthIndex, 32)`
 * transborda silenciosamente para o mês seguinte.
 */
function clampedDate(year: number, monthIndex: number, day: number): Date {
  const cappedDay = Math.min(Math.max(day, 1), daysInMonth(year, monthIndex));
  return new Date(year, monthIndex, cappedDay);
}

/**
 * Retorna o primeiro instante do dia seguinte ao `day` informado, limitado ao
 * mês real (ex.: dia 31 “+1” em fevereiro vira 1º de março, não 4 de março).
 * Usado para o limite exclusivo (`cycleEnd`) de uma janela de ciclo.
 */
function dayAfterClamped(year: number, monthIndex: number, day: number): Date {
  const cappedDay = Math.min(Math.max(day, 1), daysInMonth(year, monthIndex));
  return new Date(year, monthIndex, cappedDay + 1);
}

/**
 * Retorna o ciclo que contém a data de referência. O fim é exclusivo para uso
 * em consultas SQL; o rótulo apresenta o último dia efetivo do intervalo.
 *
 * FIX (setor financeiro): startDay/endDay são limitados aos dias reais do mês
 * aplicável. Antes, um endDay=31 (padrão/fallback quando a unidade não
 * configura ciclo próprio) fazia o ciclo de fevereiro, abril, junho, setembro
 * e novembro "vazar" de 1 a 4 dias para o mês seguinte, pois
 * new Date(year, month, 32) transborda em qualquer mês com menos de 31 dias.
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
