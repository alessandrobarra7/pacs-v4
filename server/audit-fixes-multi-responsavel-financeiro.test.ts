/**
 * Regressão (decisão de produto — suporte a múltiplos responsáveis financeiros
 * por usuário, 2026-09-17, requisitos em
 * docs/auditoria-claude/REQUISITOS_FUNCIONALIDADE_RESPONSAVEL_FINANCEIRO_2026-09-17.txt):
 *
 * Antes desta mudança, getResponsibleIdForUser fazia .limit(1) — se a mesma
 * conta estivesse vinculada a mais de um responsável financeiro, a escolha de
 * qual usar dependia da ordem não determinística do banco. Isso é exatamente
 * o tipo de bug que causou o caso da erica (vínculo resolvido implicitamente
 * para o registro errado).
 *
 * Estes testes provam duas coisas que o bug antigo não garantia:
 *   1. Checagens de autorização por unidade (Grupo 1) consideram TODOS os
 *      responsáveis do usuário, não só um — via inArray, não eq.
 *   2. Telas que mostram "o responsável" no singular (Grupo 2) nunca "adivinham"
 *      qual responsável usar quando há mais de um vínculo — exigem seleção
 *      explícita (resolveResponsibleContext), e nunca aceitam um id que não
 *      pertença ao usuário.
 */
import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createCtx(overrides: Partial<AuthenticatedUser> & { unit_id?: number | null }): TrpcContext {
  const user: AuthenticatedUser = {
    id: overrides.id ?? 99,
    openId: overrides.openId ?? "test-user",
    email: overrides.email ?? "test@pacs.com",
    name: overrides.name ?? "Test User",
    loginMethod: "local",
    role: overrides.role ?? "responsavel_financeiro",
    unit_id: overrides.unit_id ?? null,
    isActive: overrides.isActive ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: {
      protocol: "https",
      headers: { "user-agent": "vitest" },
      ip: "127.0.0.1",
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

/**
 * Fake db roteado por tabela — a mesma estratégia já usada no teste de
 * vigência do preço externo (server/audit-fixes-repasse-preco-externo.test.ts):
 * cada .from(table) devolve as linhas cruas cadastradas para aquela tabela,
 * ignorando o WHERE real (que é comparado separadamente via spy do inArray
 * quando o teste precisa provar QUAIS ids entraram na consulta).
 */
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

describe("assertCanManageExternalSalePrice — considera TODOS os responsáveis do usuário (Grupo 1)", () => {
  it("usuário vinculado a 2 responsáveis: unidade que pertence só ao segundo ainda é autorizada", async () => {
    vi.resetModules();
    const { financial_responsible_users, financial_responsible_units, exam_legends, billing_external_sale_prices } =
      await import("../drizzle/schema");

    // Conta vinculada aos responsáveis 1 E 2. Se o código antigo (limit(1))
    // pegasse só o primeiro que o "banco" devolvesse, dependendo da ordem
    // poderia nunca considerar o 2 — a unidade 55 só pertence ao 2.
    const responsibleLinkRows = [{ id: 1 }, { id: 2 }];
    // Link unidade↔responsável: só existe vínculo ativo com o responsável 2.
    const unitLinkRows = [{ id: 999 }];
    const legendRows = [{ id: 7, exam_name: "Tórax", modality: "RX" }];
    const priceRows: unknown[] = [];

    const routes = new Map<unknown, unknown[]>([
      [financial_responsible_users, responsibleLinkRows],
      [financial_responsible_units, unitLinkRows],
      [exam_legends, legendRows],
      [billing_external_sale_prices, priceRows],
    ]);

    const capturedInArrayCalls: { column: unknown; values: unknown[] }[] = [];
    vi.doMock("drizzle-orm", async (importOriginal) => {
      const original = await importOriginal<typeof import("drizzle-orm")>();
      return {
        ...original,
        inArray: (column: unknown, values: unknown[]) => {
          capturedInArrayCalls.push({ column, values: values as unknown[] });
          return (original.inArray as any)(column, values);
        },
      };
    });
    vi.doMock("drizzle-orm/mysql2", () => ({
      drizzle: vi.fn(() => makeRoutedFakeDb(routes)),
    }));
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";

    const { appRouter } = await import("./routers");
    const { financial_responsible_units: fru2 } = await import("../drizzle/schema");
    const ctx = createCtx({ id: 7, role: "responsavel_financeiro" });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.financeSimple.listExternalSalePrices({ unit_id: 55 });

    // A prova de que o código usou TODOS os vínculos: inArray foi chamado na
    // coluna financial_responsible_id de financial_responsible_units com um
    // array que inclui o 2 (o responsável dono da unidade 55), não só o 1.
    const relevantCalls = capturedInArrayCalls.filter((c) => c.column === fru2.financial_responsible_id);
    expect(relevantCalls.length).toBeGreaterThan(0);
    expect(relevantCalls.some((c) => c.values.includes(2))).toBe(true);
    expect(relevantCalls.some((c) => c.values.includes(1))).toBe(true);
    expect(result).toHaveLength(1);

    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    vi.doUnmock("drizzle-orm/mysql2");
    vi.doUnmock("drizzle-orm");
    vi.resetModules();
  });
});

describe("resolveResponsibleContext — nunca escolhe implicitamente entre múltiplos vínculos (Grupo 2)", () => {
  async function setupWithLinks(responsibleIds: number[]) {
    vi.resetModules();
    const { financial_responsible_users, financial_responsible_units } = await import("../drizzle/schema");

    const routes = new Map<unknown, unknown[]>([
      [financial_responsible_users, responsibleIds.map((id) => ({ id }))],
      [financial_responsible_units, []],
    ]);

    vi.doMock("drizzle-orm/mysql2", () => ({
      drizzle: vi.fn(() => makeRoutedFakeDb(routes)),
    }));
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";

    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 8, role: "responsavel_financeiro" });
    const caller = appRouter.createCaller(ctx);

    return {
      caller,
      cleanup: () => {
        if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previousDatabaseUrl;
        vi.doUnmock("drizzle-orm/mysql2");
        vi.resetModules();
      },
    };
  }

  it("financialResponsibleId informado mas não pertence ao usuário → FORBIDDEN, nunca troca por outro", async () => {
    const { caller, cleanup } = await setupWithLinks([1]);
    await expect(
      caller.financeSimple.myResponsavelSummary({ financialResponsibleId: 99 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    cleanup();
  });

  it("2 vínculos e nenhum id informado → BAD_REQUEST pedindo seleção, nunca escolhe o primeiro em silêncio", async () => {
    const { caller, cleanup } = await setupWithLinks([1, 2]);
    await expect(
      caller.financeSimple.myResponsavelSummary({})
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    cleanup();
  });

  it("exatamente 1 vínculo e nenhum id informado → resolve sozinho, sem exigir seleção (UX de sempre preservada)", async () => {
    const { caller, cleanup } = await setupWithLinks([1]);
    const result = await caller.financeSimple.myResponsavelSummary({});
    expect(result.units).toEqual([]);
    expect(result.responsavelId).toBe(1);
    cleanup();
  });

  it("0 vínculos → estado vazio, sem erro (comportamento de sempre para quem não tem responsável)", async () => {
    const { caller, cleanup } = await setupWithLinks([]);
    const result = await caller.financeSimple.myResponsavelSummary({});
    expect(result).toEqual({ units: [], responsavelId: null });
    cleanup();
  });
});
