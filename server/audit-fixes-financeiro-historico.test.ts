/**
 * Regressão — endpoints históricos novos da identidade visual do Financeiro
 * (2026-09-18): getDoctorCycleSummary (médico) e getResponsibleProfitHistory
 * (responsável). Ambos definidos em server/db.ts e chamam getDb() internamente
 * — por isso o mock tem que ser um nível abaixo (drizzle-orm/mysql2), não
 * "./db" diretamente, senão a chamada interna a getDb() continua batendo no
 * getDb() real (mesma armadilha documentada nos testes anteriores desta sessão).
 *
 * Cuidado de ordenação: vi.resetModules() tem que rodar ANTES do import de
 * "../drizzle/schema" usado para montar as rotas do fake db — senão esse
 * import de schema fica numa "época" de módulos diferente da que server/db.ts
 * vai usar internamente (ele reimporta schema sozinho, depois do
 * resetModules), e as referências de tabela nunca batem — o fake db sempre
 * devolve [] porque routes.get(table) nunca encontra a chave certa.
 */
import { describe, expect, it, vi } from "vitest";

/** Fake db roteado por tabela — mesma estratégia dos testes anteriores desta sessão. */
function makeRoutedFakeDb(routes: Map<unknown, unknown[]>) {
  return {
    select: (_proj?: unknown) => ({
      from: (table: unknown) => {
        const rows = routes.get(table) ?? [];
        const chain: any = {
          where: () => chain,
          limit: () => chain,
          orderBy: () => chain,
          leftJoin: () => chain,
          innerJoin: () => chain,
          groupBy: () => chain,
          then: (resolve: (v: unknown[]) => void) => resolve(rows),
        };
        return chain;
      },
    }),
  };
}

type Schema = typeof import("../drizzle/schema");

/**
 * Roda `fn` com getDb() apontando para um fake db roteado. `buildRoutes`
 * recebe o schema importado NA MESMA ÉPOCA que server/db.ts vai usar,
 * garantindo que as referências de tabela batem com as chaves do Map.
 */
async function withMockedDb<T>(
  buildRoutes: (schema: Schema) => Map<unknown, unknown[]>,
  fn: () => Promise<T>,
): Promise<T> {
  vi.resetModules();
  const schema = await import("../drizzle/schema");
  const routes = buildRoutes(schema);
  vi.doMock("drizzle-orm/mysql2", () => ({
    drizzle: vi.fn(() => makeRoutedFakeDb(routes)),
  }));
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
  try {
    return await fn();
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    vi.doUnmock("drizzle-orm/mysql2");
    vi.resetModules();
  }
}

describe("getResponsibleProfitHistory — lucro estimado do ciclo fechado", () => {
  it("receita estimada (preço atual) menos custo do sistema menos custo dos médicos", async () => {
    const periods = await withMockedDb(
      (schema) => new Map<unknown, unknown[]>([
        [schema.billing_cycle_system_summary, [{
          unit_id: 10, unit_name: "Unidade X", amount_due: "100.00",
          cycle_id: 501, starts_at: new Date("2026-06-24T00:00:00Z"), ends_at: new Date("2026-07-24T00:00:00Z"),
        }]],
        [schema.billing_cycle_doctor_summary, [{ unit_id: 10, amount_due: "60.00", doctor_cycle_id: 501 }]],
        [schema.billing_external_sale_prices, [{ unit_id: 10, exam_legend_id: 7, price_external: "50.00" }]],
        [schema.billing_catalog_study_events, [{ exam_legend_id: 7 }]],
      ]),
      async () => {
        const { getResponsibleProfitHistory } = await import("./db");
        const { periods } = await getResponsibleProfitHistory(999);
        return periods;
      },
    );

    expect(periods).toHaveLength(1);
    expect(periods[0].estimated_revenue).toBe(50);
    expect(periods[0].system_cost).toBe(100);
    expect(periods[0].doctor_cost).toBe(60);
    expect(periods[0].estimated_profit).toBe(50 - 100 - 60);
    expect(periods[0].price_basis).toBe("current");
  });
});

describe("getDoctorCycleSummary — ciclos fechados do médico", () => {
  it("traz reports_count e amount_due do snapshot do ciclo, filtrando por status fechado", async () => {
    // A prova de "só ciclos fechados" não dá pra fazer só com o fake db roteado
    // (ele ignora o WHERE de verdade — sempre devolve todas as linhas da rota,
    // aberto ou fechado). Por isso a prova real é um spy no `eq` do drizzle-orm,
    // confirmando que a query realmente incluiu eq(billing_cycles.status,
    // "closed") — mesma técnica usada no teste de Grupo 1 (inArray) desta sessão.
    vi.resetModules();
    const schema = await import("../drizzle/schema");
    const capturedEqCalls: { column: unknown; value: unknown }[] = [];
    vi.doMock("drizzle-orm", async (importOriginal) => {
      const original = await importOriginal<typeof import("drizzle-orm")>();
      return {
        ...original,
        eq: (column: unknown, value: unknown) => {
          capturedEqCalls.push({ column, value });
          return (original.eq as any)(column, value);
        },
      };
    });
    const routes = new Map<unknown, unknown[]>([
      [schema.billing_cycle_doctor_summary, [{
        id: 1, unit_id: 10, unit_name: "Unidade X",
        reports_count: 12, amount_due: "480.00", received_at: null,
        cycle_starts_at: new Date("2026-06-24T00:00:00Z"),
        cycle_ends_at: new Date("2026-07-24T00:00:00Z"),
        cycle_status: "closed",
      }]],
      [schema.billing_cycles, []],
      [schema.units, []],
    ]);
    vi.doMock("drizzle-orm/mysql2", () => ({
      drizzle: vi.fn(() => makeRoutedFakeDb(routes)),
    }));
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";

    const { getDoctorCycleSummary } = await import("./db");
    const { cycles } = await getDoctorCycleSummary(42);

    expect(cycles).toHaveLength(1);
    expect(cycles[0].reports_count).toBe(12);
    expect(cycles[0].amount_due).toBe("480.00");
    expect(cycles[0].unit_name).toBe("Unidade X");
    // prova de verdade: a query pediu explicitamente status = "closed"
    const statusFilterCalls = capturedEqCalls.filter((c) => c.column === schema.billing_cycles.status);
    expect(statusFilterCalls.some((c) => c.value === "closed")).toBe(true);
    // e nunca pediu "open" (não teria sentido, mas prova que não é um valor solto)
    expect(statusFilterCalls.some((c) => c.value === "open")).toBe(false);

    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    vi.doUnmock("drizzle-orm/mysql2");
    vi.doUnmock("drizzle-orm");
    vi.resetModules();
  });
});
