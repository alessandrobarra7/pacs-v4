import { describe, expect, it } from "vitest";
import { calculateFinancialCycleDates } from "./financeCycle";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const financeRouterSource = readFileSync(resolve(root, "server/routers/financeSimple.ts"), "utf8");
const financeDashboardSource = readFileSync(resolve(root, "client/src/pages/finance/FinanceDashboard.tsx"), "utf8");

describe("ciclo financeiro e valores históricos", () => {
  it("identifica o ciclo que contém a data de referência e mostra o intervalo completo", () => {
    const cycle = calculateFinancialCycleDates(24, 23, new Date(2026, 7, 15, 12));

    expect(cycle.cycleStart.toISOString()).toBe("2026-07-24T00:00:00.000Z");
    expect(cycle.cycleEnd.toISOString()).toBe("2026-08-24T00:00:00.000Z");
    expect(cycle.label).toBe("24/07/2026 – 23/08/2026");
  });

  it("abre o ciclo seguinte sem transportar valores do período anterior", () => {
    const cycle = calculateFinancialCycleDates(24, 23, new Date(2026, 7, 26, 12));

    expect(cycle.cycleStart.toISOString()).toBe("2026-08-24T00:00:00.000Z");
    expect(cycle.cycleEnd.toISOString()).toBe("2026-09-24T00:00:00.000Z");
    expect(cycle.label).toBe("24/08/2026 – 23/09/2026");
  });

  it("formata corretamente ciclos que cruzam a virada do ano", () => {
    const cycle = calculateFinancialCycleDates(15, 14, new Date(2026, 0, 10, 12));

    expect(cycle.label).toBe("15/12/2025 – 14/01/2026");
  });

  it("transporta a taxa aplicada no evento e a expõe como composição histórica", () => {
    expect(financeRouterSource).toContain("system_rate_applied: billing_catalog_study_events.system_price_applied");
    expect(financeRouterSource).toContain("historical_system_rates");
    expect(financeDashboardSource).toContain("Valor configurado por evento");
    expect(financeDashboardSource).toContain("Eventos do ciclo atual");
    expect(financeDashboardSource).toContain("Rendimento atual do ciclo");
    expect(financeDashboardSource).toContain("Ciclo atual");
    expect(financeDashboardSource).toContain("Consulta histórica");
  });
});
