import { describe, expect, it } from "vitest";
import { calculateFinancialCycleDates } from "./financeCycle";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const financeRouterSource = readFileSync(resolve(root, "server/routers/financeSimple.ts"), "utf8");
const financeDashboardSource = readFileSync(resolve(root, "client/src/pages/finance/FinanceDashboard.tsx"), "utf8");

function expectLocalDate(value: Date, year: number, monthIndex: number, day: number) {
  expect(value.getFullYear()).toBe(year);
  expect(value.getMonth()).toBe(monthIndex);
  expect(value.getDate()).toBe(day);
  expect(value.getHours()).toBe(0);
  expect(value.getMinutes()).toBe(0);
}

describe("ciclo financeiro e valores históricos", () => {
  it("identifica o ciclo que contém a data de referência e mostra o intervalo completo", () => {
    const cycle = calculateFinancialCycleDates(24, 23, new Date(2026, 7, 15, 12));

    expectLocalDate(cycle.cycleStart, 2026, 6, 24);
    expectLocalDate(cycle.cycleEnd, 2026, 7, 24);
    expect(cycle.label).toBe("24/07/2026 – 23/08/2026");
  });

  it("abre o ciclo seguinte sem transportar valores do período anterior", () => {
    const cycle = calculateFinancialCycleDates(24, 23, new Date(2026, 7, 26, 12));

    expectLocalDate(cycle.cycleStart, 2026, 7, 24);
    expectLocalDate(cycle.cycleEnd, 2026, 8, 24);
    expect(cycle.label).toBe("24/08/2026 – 23/09/2026");
  });

  it("formata corretamente ciclos que cruzam a virada do ano", () => {
    const cycle = calculateFinancialCycleDates(15, 14, new Date(2026, 0, 10, 12));

    expect(cycle.label).toBe("15/12/2025 – 14/01/2026");
  });

  it("encerra o ciclo mensal no último dia real de fevereiro e meses de 30 dias", () => {
    const cases = [
      { reference: new Date(2026, 1, 15, 12), end: [2026, 2, 1] as const, label: "01/02/2026 – 28/02/2026" },
      { reference: new Date(2028, 1, 15, 12), end: [2028, 2, 1] as const, label: "01/02/2028 – 29/02/2028" },
      { reference: new Date(2026, 3, 15, 12), end: [2026, 4, 1] as const, label: "01/04/2026 – 30/04/2026" },
      { reference: new Date(2026, 5, 15, 12), end: [2026, 6, 1] as const, label: "01/06/2026 – 30/06/2026" },
      { reference: new Date(2026, 8, 15, 12), end: [2026, 9, 1] as const, label: "01/09/2026 – 30/09/2026" },
      { reference: new Date(2026, 10, 15, 12), end: [2026, 11, 1] as const, label: "01/11/2026 – 30/11/2026" },
    ];

    for (const item of cases) {
      const cycle = calculateFinancialCycleDates(1, 31, item.reference);
      expectLocalDate(cycle.cycleEnd, ...item.end);
      expect(cycle.label).toBe(item.label);
    }
  });

  it("limita corretamente o início de um ciclo atravessado quando o mês anterior não tem o dia configurado", () => {
    const cycle = calculateFinancialCycleDates(31, 30, new Date(2026, 2, 5, 12));

    expectLocalDate(cycle.cycleStart, 2026, 1, 28);
    expectLocalDate(cycle.cycleEnd, 2026, 2, 31);
    expect(cycle.label).toBe("28/02/2026 – 30/03/2026");
  });

  it("transporta a taxa aplicada no evento e a expõe como composição histórica", () => {
    expect(financeRouterSource).toContain("system_rate_applied: billing_catalog_study_events.system_price_applied");
    expect(financeRouterSource).toContain("historical_system_rates");
    expect(financeDashboardSource).toContain("Valor configurado por evento");
    expect(financeDashboardSource).toContain("Eventos do ciclo atual");
    expect(financeDashboardSource).toContain("Rendimento atual do ciclo");
    expect(financeDashboardSource).toContain("Ciclo atual");
    expect(financeDashboardSource).toContain("Consulta histórica");
    expect(financeDashboardSource).toContain("Fechamento histórico do período");
    expect(financeDashboardSource).toContain("Fechamento por médico");
    expect(financeDashboardSource).toContain("Sistema · eventos");
    expect(financeDashboardSource).toContain("Exportar CSV");
  });
});
