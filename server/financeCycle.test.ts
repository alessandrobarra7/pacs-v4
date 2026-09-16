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

  it("limita o fim do ciclo ao último dia real do mês quando endDay=31 (fallback padrão)", () => {
    // FIX: antes, new Date(year, month, 32) transbordava para o mês seguinte
    // em qualquer mês com menos de 31 dias.
    const fev2026 = calculateFinancialCycleDates(1, 31, new Date(2026, 1, 15, 12)); // fevereiro, 28 dias
    expect(fev2026.cycleEnd.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(fev2026.label).toBe("01/02/2026 – 28/02/2026");

    const fev2028 = calculateFinancialCycleDates(1, 31, new Date(2028, 1, 15, 12)); // fevereiro bissexto, 29 dias
    expect(fev2028.cycleEnd.toISOString()).toBe("2028-03-01T00:00:00.000Z");
    expect(fev2028.label).toBe("01/02/2028 – 29/02/2028");

    const abr2026 = calculateFinancialCycleDates(1, 31, new Date(2026, 3, 15, 12)); // abril, 30 dias
    expect(abr2026.cycleEnd.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(abr2026.label).toBe("01/04/2026 – 30/04/2026");

    const jun2026 = calculateFinancialCycleDates(1, 31, new Date(2026, 5, 15, 12)); // junho, 30 dias
    expect(jun2026.label).toBe("01/06/2026 – 30/06/2026");

    const set2026 = calculateFinancialCycleDates(1, 31, new Date(2026, 8, 15, 12)); // setembro, 30 dias
    expect(set2026.label).toBe("01/09/2026 – 30/09/2026");

    const nov2026 = calculateFinancialCycleDates(1, 31, new Date(2026, 10, 15, 12)); // novembro, 30 dias
    expect(nov2026.label).toBe("01/11/2026 – 30/11/2026");
  });

  it("mantém o ciclo completo em meses com 31 dias (sem regressão)", () => {
    const jul2026 = calculateFinancialCycleDates(1, 31, new Date(2026, 6, 15, 12));
    expect(jul2026.cycleEnd.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(jul2026.label).toBe("01/07/2026 – 31/07/2026");
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
