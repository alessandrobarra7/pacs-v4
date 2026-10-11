import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regressões comportamentais do banner financeiro da worklist.
 *
 * O fluxo de catálogo grava eventos diretamente em
 * billing_catalog_study_events e não materializa billing_cycles. Estes testes
 * exercitam as funções reais de server/db.ts contra um driver Drizzle simulado:
 * a resposta precisa continuar correta sem nenhuma rota para billing_cycles.
 */
type Schema = typeof import("../drizzle/schema");

type SqlCapture = {
  text: string;
};

function makeRoutedFakeDb(routes: Map<unknown, unknown[]>, fromCalls: unknown[]) {
  return {
    select: (_projection?: unknown) => ({
      from: (table: unknown) => {
        fromCalls.push(table);
        const rows = routes.get(table) ?? [];
        const chain: any = {
          where: () => chain,
          limit: () => chain,
          orderBy: () => chain,
          leftJoin: () => chain,
          innerJoin: () => chain,
          groupBy: () => chain,
          then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
        };
        return chain;
      },
    }),
  };
}

async function withMockedDb<T>(
  buildRoutes: (schema: Schema) => Map<unknown, unknown[]>,
  fn: (args: { schema: Schema; sqlCaptures: SqlCapture[]; neCalls: Array<{ column: unknown; value: unknown }>; fromCalls: unknown[] }) => Promise<T>,
): Promise<T> {
  vi.resetModules();
  const sqlCaptures: SqlCapture[] = [];
  const neCalls: Array<{ column: unknown; value: unknown }> = [];
  const fromCalls: unknown[] = [];
  vi.doMock("drizzle-orm", async (importOriginal) => {
    const original = await importOriginal<typeof import("drizzle-orm")>();
    return {
      ...original,
      ne: (column: unknown, value: unknown) => {
        neCalls.push({ column, value });
        return (original.ne as any)(column, value);
      },
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
        sqlCaptures.push({ text: strings.join("?") });
        return (original.sql as any)(strings, ...values);
      },
    };
  });
  const schema = await import("../drizzle/schema");
  const routes = buildRoutes(schema);
  vi.doMock("drizzle-orm/mysql2", () => ({
    drizzle: vi.fn(() => makeRoutedFakeDb(routes, fromCalls)),
  }));
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
  try {
    return await fn({ schema, sqlCaptures, neCalls, fromCalls });
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    vi.doUnmock("drizzle-orm/mysql2");
    vi.doUnmock("drizzle-orm");
    vi.resetModules();
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe("getDoctorUnitFinancialInfo — ciclo de catálogo da worklist", () => {
  it("soma legado e catálogo sem ciclo materializado, exclui cancelado/revertido e respeita a janela [início, fim)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));

    await withMockedDb(
      (schema) => new Map<unknown, unknown[]>([
        [schema.financial_responsible_units, [{ financial_responsible_id: 7 }]],
        [schema.billing_doctor_unit_prices, [{ price_per_report: "30.00" }]],
        [schema.units, [{ s: 24, e: 23 }]],
        // As linhas já representam o resultado da agregação filtrada pelo banco.
        // Não há rota para billing_cycles: a função deve funcionar mesmo assim.
        [schema.billing_visit_events, [{ events: 1, amount: "30.00" }]],
        [schema.billing_catalog_study_events, [{ events: 2, amount: "60.00" }]],
      ]),
      async ({ schema, sqlCaptures, neCalls, fromCalls }) => {
        const { getDoctorUnitFinancialInfo } = await import("./db");
        const result = await getDoctorUnitFinancialInfo(268, 20);

        expect(result).toMatchObject({
          price_per_report: "30.00",
          cycle_visits: 3,
          cycle_amount: "90.00",
          has_open_cycle: true,
        });
        expect(result?.cycle_period?.starts_at.toISOString()).toBe("2026-09-24T00:00:00.000Z");
        // O fim que vai ao cliente é inclusivo; a SQL interna usa 24/10 exclusivo.
        expect(result?.cycle_period?.ends_at.toISOString()).toBe("2026-10-23T23:59:59.999Z");

        const legacyStatusExclusions = neCalls
          .filter((call) => call.column === schema.billing_visit_events.financial_status)
          .map((call) => call.value);
        expect(legacyStatusExclusions).toEqual(expect.arrayContaining(["cancelled", "reversed"]));
        const catalogStatusExclusions = neCalls
          .filter((call) => call.column === schema.billing_catalog_study_events.financial_status)
          .map((call) => call.value);
        expect(catalogStatusExclusions).toContain("cancelled");
        expect(sqlCaptures.some((capture) => capture.text.includes(" >= "))).toBe(true);
        expect(sqlCaptures.some((capture) => capture.text.includes(" < "))).toBe(true);
        // Um ciclo legado fechado pode existir como histórico, mas não governa
        // a janela operacional nem os eventos de catálogo da worklist.
        expect(fromCalls).not.toContain(schema.billing_cycles);
      },
    );
  });

  it("mantém ciclo aberto de calendário e total zero quando não existem eventos", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));

    await withMockedDb(
      (schema) => new Map<unknown, unknown[]>([
        [schema.financial_responsible_units, [{ financial_responsible_id: 7 }]],
        [schema.billing_doctor_unit_prices, [{ price_per_report: "30.00" }]],
        [schema.units, [{ s: 24, e: 23 }]],
        [schema.billing_visit_events, [{ events: 0, amount: 0 }]],
        [schema.billing_catalog_study_events, [{ events: 0, amount: 0 }]],
      ]),
      async () => {
        const { getDoctorUnitFinancialInfo } = await import("./db");
        await expect(getDoctorUnitFinancialInfo(268, 20)).resolves.toMatchObject({
          cycle_visits: 0,
          cycle_amount: "0.00",
          has_open_cycle: true,
        });
      },
    );
  });
});

describe("getResponsibleUnitFinancialInfo — banner A pagar", () => {
  it("agrega os eventos ativos de todos os médicos da unidade, inclusive catálogo, sem exigir preço próprio ou ciclo materializado", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));

    await withMockedDb(
      (schema) => new Map<unknown, unknown[]>([
        [schema.units, [{ s: 24, e: 23 }]],
        [schema.billing_visit_events, [{ events: 1, amount: "18.00" }]],
        [schema.billing_catalog_study_events, [{ events: 2, amount: "40.00" }]],
      ]),
      async ({ schema, neCalls }) => {
        const { getResponsibleUnitFinancialInfo } = await import("./db");
        const result = await getResponsibleUnitFinancialInfo(20);

        expect(result).toMatchObject({
          price_per_report: null,
          cycle_visits: 3,
          cycle_amount: "58.00",
          has_open_cycle: true,
        });
        // Esta função não recebe doctorUserId e, portanto, não pode usar a
        // conta do responsável como filtro de evento de médico.
        expect(neCalls.some((call) => call.column === schema.billing_visit_events.financial_status && call.value === "cancelled")).toBe(true);
        expect(neCalls.some((call) => call.column === schema.billing_catalog_study_events.financial_status && call.value === "cancelled")).toBe(true);
      },
    );
  });
});

describe("financeSimple.getUnitFinancialInfo — autorização do responsável", () => {
  it("permite o responsável vinculado sem exigir user_unit_permissions clínico", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));

    await withMockedDb(
      (schema) => new Map<unknown, unknown[]>([
        [schema.financial_responsible_users, [{ id: 7 }]],
        [schema.financial_responsible_units, [{ id: 50 }]],
        [schema.units, [{ s: 24, e: 23 }]],
        [schema.billing_visit_events, [{ events: 1, amount: "18.00" }]],
        [schema.billing_catalog_study_events, [{ events: 0, amount: 0 }]],
      ]),
      async () => {
        const { financeSimpleRouter } = await import("./routers/financeSimple");
        const caller = financeSimpleRouter.createCaller({
          user: { id: 9, role: "responsavel_financeiro" },
          req: {} as never,
          res: {} as never,
        });

        await expect(caller.getUnitFinancialInfo({ unit_id: 20 })).resolves.toMatchObject({
          status: "ok",
          cycle_visits: 1,
          cycle_amount: "18.00",
        });
      },
    );
  });

  it("não agrega uma unidade que não esteja vinculada ao responsável", async () => {
    await withMockedDb(
      (schema) => new Map<unknown, unknown[]>([
        // Não depende de user_unit_permissions: o perfil dedicado do
        // responsável é autorizado pelo seu vínculo econômico com a unidade.
        // Sem este vínculo, o endpoint deve negar antes de consultar eventos.
        [schema.financial_responsible_users, [{ id: 7 }]],
        [schema.financial_responsible_units, []],
      ]),
      async () => {
        const { financeSimpleRouter } = await import("./routers/financeSimple");
        const caller = financeSimpleRouter.createCaller({
          user: { id: 9, role: "responsavel_financeiro" },
          req: {} as never,
          res: {} as never,
        });

        await expect(caller.getUnitFinancialInfo({ unit_id: 20 })).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
      },
    );
  });
});
