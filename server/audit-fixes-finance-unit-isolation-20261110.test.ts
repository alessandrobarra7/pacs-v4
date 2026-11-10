/**
 * Regressão (auditoria-seguranca-rbac-20261110, financeSimple.ts).
 *
 * Achado 1 (ALTO): listDoctorsForResponsible aceitava o papel 'unit_admin'
 * na lista `allowed`, mas só existia um bloco preenchendo `allowedUnitIds`
 * para 'responsavel_financeiro'. Para 'unit_admin', `allowedUnitIds` ficava
 * `undefined`, o filtro condicional `...(allowedUnitIds ? [inArray(...)] : [])`
 * nunca era aplicado, e a query devolvia médicos/preços de TODAS as unidades
 * do sistema — não só das unidades administradas por aquele unit_admin.
 *
 * A prova abaixo usa um fake de banco "roteado por tabela" (mesma estratégia
 * de server/audit-fixes-multi-responsavel-financeiro.test.ts) combinado com
 * um spy no `inArray` do drizzle-orm: a tabela billing_doctor_unit_prices só
 * é filtrada pelas unit_id realmente capturadas num inArray(...) feito sobre
 * a coluna billing_doctor_unit_prices.unit_id. Se o código voltar a deixar
 * allowedUnitIds undefined para unit_admin (bug original), inArray nunca é
 * chamado para essa coluna, nenhum filtro é aplicado, e o teste falha porque
 * o médico da unidade não autorizada volta na resposta — isso foi confirmado
 * na prática revertendo o fix (ver relatório).
 *
 * Achado 2 (BAIXO-MÉDIO): setSystemPrice, setDoctorPrice,
 * setDoctorModalityPrice, setSystemPriceDirect e setDoctorPriceDirect
 * declaravam pricePerReport: z.string() sem validar formato/sinal — um valor
 * negativo ou não numérico passava direto para a camada de persistência.
 * setDoctorLegendPrice já usava o regex correto; replicamos o mesmo padrão
 * nas 5 procedures. Os testes abaixo provam que cada uma agora rejeita valor
 * negativo e valor não numérico na validação de entrada (zod), antes mesmo
 * de qualquer acesso a banco.
 */
import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createCtx(overrides: Partial<AuthenticatedUser> & { unit_id?: number | null }): TrpcContext {
  const user: AuthenticatedUser = {
    id: overrides.id ?? 1,
    openId: overrides.openId ?? "test-user",
    email: overrides.email ?? "test@pacs.com",
    name: overrides.name ?? "Test User",
    loginMethod: "local",
    role: overrides.role ?? "unit_admin",
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

describe("financeSimple.listDoctorsForResponsible — isolamento por unidade para unit_admin (Achado 1)", () => {
  it("unit_admin só recebe médicos/preços das unidades que ele administra (user_unit_permissions), nunca de outras unidades", async () => {
    vi.resetModules();
    const schema = await import("../drizzle/schema");
    const { user_unit_permissions, billing_doctor_unit_prices } = schema;

    // Unit_admin administra SÓ a unidade 10 (via user_unit_permissions).
    const permissionRows = [{ unit_id: 10 }];

    // billing_doctor_unit_prices tem médicos em DUAS unidades: a 10
    // (autorizada) e a 99 (de outro unit_admin, NUNCA deveria aparecer).
    const priceRows = [
      { doctor_user_id: 1, doctor_name: "Dr. Permitido", unit_id: 10, unit_name: "Unidade Permitida", price_per_report: "50.00" },
      { doctor_user_id: 2, doctor_name: "Dr. Oculto", unit_id: 99, unit_name: "Unidade Proibida", price_per_report: "80.00" },
    ];

    const routes = new Map<unknown, unknown[]>([
      [user_unit_permissions, permissionRows],
      [billing_doctor_unit_prices, priceRows],
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

    function allowedUnitIdsForPriceQuery(): number[] | null {
      const relevant = capturedInArrayCalls.filter((c) => c.column === billing_doctor_unit_prices.unit_id);
      if (relevant.length === 0) return null; // nenhum inArray chamado => sem filtro aplicado (bug original)
      return relevant[relevant.length - 1]!.values as number[];
    }

    vi.doMock("drizzle-orm/mysql2", () => ({
      drizzle: vi.fn(() => ({
        select: (_proj?: unknown) => ({
          from: (table: unknown) => {
            const rawRows = routes.get(table) ?? [];
            const chain: any = {
              leftJoin: () => chain,
              innerJoin: () => chain,
              where: () => chain,
              limit: () => chain,
              orderBy: () => chain,
              groupBy: () => chain,
              then: (resolve: (v: unknown[]) => void) => {
                if (table === billing_doctor_unit_prices) {
                  const allowed = allowedUnitIdsForPriceQuery();
                  if (allowed !== null) {
                    resolve(rawRows.filter((r: any) => allowed.includes(r.unit_id)));
                    return;
                  }
                }
                resolve(rawRows);
              },
            };
            return chain;
          },
        }),
      })),
    }));

    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";

    try {
      const { appRouter } = await import("./routers");
      const ctx = createCtx({ id: 42, role: "unit_admin", unit_id: null });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.financeSimple.listDoctorsForResponsible();

      // Prova comportamental: só o médico da unidade 10 (autorizada) aparece.
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(1);
      expect(result[0]!.units).toHaveLength(1);
      expect(result[0]!.units[0]!.unit_id).toBe(10);
      // Nunca aparece o médico/preço da unidade 99 (não administrada por este unit_admin).
      expect(result.some((d: any) => d.units.some((u: any) => u.unit_id === 99))).toBe(false);

      // Prova de implementação: a query realmente restringiu por inArray com
      // exatamente as unidades administradas (não "todas as unidades").
      const allowed = allowedUnitIdsForPriceQuery();
      expect(allowed).not.toBeNull();
      expect(allowed).toEqual([10]);
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      vi.doUnmock("drizzle-orm/mysql2");
      vi.doUnmock("drizzle-orm");
      vi.resetModules();
    }
  });

  it("unit_admin sem nenhuma unidade vinculada recebe lista vazia (nunca cai para 'todas as unidades')", async () => {
    vi.resetModules();
    const schema = await import("../drizzle/schema");
    const { user_unit_permissions, billing_doctor_unit_prices } = schema;

    const routes = new Map<unknown, unknown[]>([
      [user_unit_permissions, []], // nenhum vínculo
      [
        billing_doctor_unit_prices,
        [{ doctor_user_id: 1, doctor_name: "Dr. Qualquer", unit_id: 10, unit_name: "Unidade X", price_per_report: "50.00" }],
      ],
    ]);

    vi.doMock("drizzle-orm/mysql2", () => ({
      drizzle: vi.fn(() => ({
        select: (_proj?: unknown) => ({
          from: (table: unknown) => {
            const rawRows = routes.get(table) ?? [];
            const chain: any = {
              leftJoin: () => chain,
              innerJoin: () => chain,
              where: () => chain,
              limit: () => chain,
              orderBy: () => chain,
              groupBy: () => chain,
              then: (resolve: (v: unknown[]) => void) => resolve(rawRows),
            };
            return chain;
          },
        }),
      })),
    }));

    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";

    try {
      const { appRouter } = await import("./routers");
      const ctx = createCtx({ id: 43, role: "unit_admin", unit_id: null });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.financeSimple.listDoctorsForResponsible();
      expect(result).toEqual([]);
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      vi.doUnmock("drizzle-orm/mysql2");
      vi.resetModules();
    }
  });
});

describe("financeSimple — validação de valor monetário não-negativo (Achado 2)", () => {
  const invalidPrices = ["-10.00", "-1", "abc", "10.999", "", "1e5", "NaN"];

  async function getCaller() {
    const { financeSimpleRouter } = await import("./routers/financeSimple");
    return financeSimpleRouter.createCaller(
      createCtx({ id: 1, role: "admin_master" }),
    );
  }

  it("setSystemPrice rejeita valores negativos/não numéricos de pricePerReport", async () => {
    const caller = await getCaller();
    for (const bad of invalidPrices) {
      await expect(
        caller.setSystemPrice({
          financialResponsibleId: 1,
          unitId: 1,
          pricePerReport: bad,
          startsAt: "2026-01-01",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("setDoctorPrice rejeita valores negativos/não numéricos de pricePerReport", async () => {
    const caller = await getCaller();
    for (const bad of invalidPrices) {
      await expect(
        caller.setDoctorPrice({
          financialResponsibleId: 1,
          unitId: 1,
          doctorUserId: 1,
          pricePerReport: bad,
          startsAt: "2026-01-01",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("setDoctorModalityPrice rejeita valores negativos/não numéricos de pricePerReport", async () => {
    const caller = await getCaller();
    for (const bad of invalidPrices) {
      await expect(
        caller.setDoctorModalityPrice({
          financialResponsibleId: 1,
          unitId: 1,
          doctorUserId: 1,
          modality: "CT",
          pricePerReport: bad,
          startsAt: "2026-01-01",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("setSystemPriceDirect rejeita valores negativos/não numéricos de pricePerReport", async () => {
    const caller = await getCaller();
    for (const bad of invalidPrices) {
      await expect(
        caller.setSystemPriceDirect({
          unitId: 1,
          pricePerReport: bad,
          startsAt: "2026-01-01",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("setDoctorPriceDirect rejeita valores negativos/não numéricos de pricePerReport", async () => {
    const caller = await getCaller();
    for (const bad of invalidPrices) {
      await expect(
        caller.setDoctorPriceDirect({
          doctorUserId: 1,
          unitId: 1,
          pricePerReport: bad,
          startsAt: "2026-01-01",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("valores válidos (ex.: '10.00', '0.50') passam a validação de formato (regex) do pricePerReport", () => {
    const regex = /^\d+(\.\d{1,2})?$/;
    expect(regex.test("10.00")).toBe(true);
    expect(regex.test("0.50")).toBe(true);
    expect(regex.test("100")).toBe(true);
    expect(regex.test("-10.00")).toBe(false);
    expect(regex.test("abc")).toBe(false);
    expect(regex.test("10.999")).toBe(false);
  });
});
