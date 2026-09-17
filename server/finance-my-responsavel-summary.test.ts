import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Regressão (revisão independente, 2026-09-16):
// myResponsavelSummary soma billing_visit_events (legado) + billing_catalog_study_events
// (catálogo de exames com múltiplos documentos/legendas) no mesmo ciclo. Antes desta
// correção, a consulta de billing_visit_events não excluía eventos com
// financial_status = 'cancelled', diferente de doctorSummaryByUnit e unitSummary, que já
// excluíam. Isso podia fazer o card principal do responsável financeiro mostrar um total
// maior do que o drill-down por médico da mesma unidade, para a mesma unidade e ciclo.

const state = vi.hoisted(() => ({
  responses: [] as unknown[][],
}));

function resultQuery(rows: unknown[]) {
  return Object.assign(Promise.resolve(rows), {
    orderBy: () => Promise.resolve(rows),
    limit: () => Promise.resolve(rows),
  });
}

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getResponsibleIdForUser: vi.fn(async () => 77),
    getDb: vi.fn(async () => ({
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.from = vi.fn(() => chain);
        chain.leftJoin = vi.fn(() => chain);
        chain.where = vi.fn(() => resultQuery(state.responses.shift() ?? []));
        return chain;
      }),
    })),
  };
});

import { financeSimpleRouter } from "./routers/financeSimple";

describe("myResponsavelSummary — soma legado + catálogo", () => {
  beforeEach(() => {
    state.responses = [];
  });

  it("soma billing_visit_events e billing_catalog_study_events da mesma unidade no mesmo ciclo", async () => {
    state.responses = [
      // linkedUnits (financial_responsible_units + units)
      [{ unit_id: 12, unit_name: "Unidade A", cycle_start_day: 1, cycle_end_day: 31 }],
      // legacy (billing_visit_events) — 1 laudo
      [{ total_laudos: 1, system_total: "3.50", system_paid: "0", doctor_total: "10.00", doctor_paid: "0" }],
      // catalog (billing_catalog_study_events) — 1 laudo com múltiplas legendas
      [{ total_laudos: 1, system_total: "3.50", system_paid: "3.50", doctor_total: "18.00", doctor_paid: "18.00" }],
    ];

    const caller = financeSimpleRouter.createCaller({
      user: { id: 5, role: "responsavel_financeiro" },
      req: {} as never,
      res: {} as never,
    });
    const result = await caller.myResponsavelSummary({
      reference_date: "2026-08-21T12:00:00.000Z",
    });

    expect(result.units).toHaveLength(1);
    expect(result.units[0]).toMatchObject({
      unit_id: 12,
      total_laudos: 2,
      system_total: 7,
      system_paid: 3.5,
      doctor_total: 28,
      doctor_paid: 18,
    });
  });
});

describe("myResponsavelSummary — exclusão de eventos cancelados (regressão)", () => {
  // A soma de billing_visit_events feita via SQL (COUNT/SUM agregados) não pode ser
  // verificada de ponta a ponta com um banco mockado em memória sem reimplementar o
  // otimizador de consultas do MySQL. Seguindo o padrão já usado neste repositório para
  // o mesmo tipo de garantia (ver server/doctor-finance-unit-isolation.test.ts), este
  // teste fixa no código-fonte que a consulta legada de myResponsavelSummary carrega a
  // mesma exclusão de cancelados que doctorSummaryByUnit e unitSummary já aplicam — se
  // alguém remover essa condição no futuro, este teste quebra.
  const routerSource = readFileSync(
    resolve(process.cwd(), "server/routers/financeSimple.ts"),
    "utf8",
  );

  function extractProcedure(name: string): string {
    const start = routerSource.indexOf(`${name}: protectedProcedure`);
    expect(start, `procedure ${name} não encontrada em financeSimple.ts`).toBeGreaterThan(-1);
    const nextProcedureMatch = routerSource.slice(start + 1).search(/\n {2}\w+: protectedProcedure/);
    const end = nextProcedureMatch === -1 ? routerSource.length : start + 1 + nextProcedureMatch;
    return routerSource.slice(start, end);
  }

  it("myResponsavelSummary exclui billing_visit_events cancelados, igual a doctorSummaryByUnit", () => {
    const myResponsavelSummarySrc = extractProcedure("myResponsavelSummary");
    expect(myResponsavelSummarySrc).toContain(
      "ne(billing_visit_events.financial_status, 'cancelled')",
    );

    const doctorSummaryByUnitSrc = extractProcedure("doctorSummaryByUnit");
    expect(doctorSummaryByUnitSrc).toContain(
      "ne(billing_visit_events.financial_status, 'cancelled')",
    );
  });

  it("myResponsavelSummary exclui billing_catalog_study_events inativos (financial_status != 'active')", () => {
    const myResponsavelSummarySrc = extractProcedure("myResponsavelSummary");
    expect(myResponsavelSummarySrc).toContain(
      "eq(billing_catalog_study_events.financial_status, 'active')",
    );
  });
});
