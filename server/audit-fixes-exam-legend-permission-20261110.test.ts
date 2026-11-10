/**
 * Regressão (auditoria-seguranca-rbac-pacs-financeiro-storage-20261110):
 *
 * ACHADO 1 (MÉDIO) — studyExamLegend.confirmSelections e studyExamLegend.select
 * chamavam assertCanSelect(role) e assertDicomFileAccess(..., "view_studies"),
 * mas nunca checavam a permissão granular por unidade `edit_exam_legend`
 * (user_unit_permissions), diferente de studyMetadata.save (V14-P1 FIX). A
 * legenda selecionada determina financial_event_count, usado para criar
 * eventos de faturamento (server/catalogFinancial.ts) — ou seja, um usuário
 * com apenas view_studies conseguia alterar o que seria faturado. A correção
 * adiciona canAccessUnit(ctx.user, unitId, "edit_exam_legend") após resolver a
 * unidade via assertDicomFileAccess, em ambas as mutations.
 *
 * ACHADO 2 (BAIXO) — sla.setUnitSla fazia `new Date(input.effectiveFrom)` sem
 * checar Number.isNaN(...), diferente de setDoctorModalityPrice/
 * setDoctorLegendPrice (financeSimple.ts), que validam a data de início. Uma
 * string de data inválida gerava `Invalid Date` e era persistida sem erro.
 *
 * Padrão de mock seguido de server/audit-fixes-forbidden-regressions.test.ts
 * (mock direto de ./authorization, sem tocar banco) e de
 * server/audit-fixes-gestao-usuarios-responsavel.test.ts (selectChain mínimo
 * para simular getDb() sem banco real).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createCtx(overrides: Partial<AuthenticatedUser> & { unit_id?: number | null }): TrpcContext {
  const user: AuthenticatedUser = {
    id: overrides.id ?? 99,
    openId: overrides.openId ?? "test-user",
    email: overrides.email ?? "test@pacs.com",
    name: overrides.name ?? "Test User",
    loginMethod: "local",
    role: overrides.role ?? "medico",
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

/** Chain mínimo de select() que resolve para `rows`, sem depender de banco real. */
function selectChain<T>(rows: T[]) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    then: (resolve: (value: T[]) => void) => resolve(rows),
  };
  return chain;
}

describe("studyExamLegend.confirmSelections / select — exige edit_exam_legend além de view_studies", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("confirmSelections: view_studies=true mas edit_exam_legend=false recebe FORBIDDEN (sem tocar banco)", async () => {
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return {
        ...original,
        // assertDicomFileAccess resolve a unidade normalmente (confirma view_studies OK).
        assertDicomFileAccess: vi.fn(async () => 42),
        // edit_exam_legend negado para esta unidade.
        canAccessUnit: vi.fn(async () => false),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 50, role: "medico", unit_id: 42 });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.studyExamLegend.confirmSelections({
        studyInstanceUid: "1.2.3.4.5",
        examLegendIds: [1],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const authMod = await import("./authorization");
    expect(authMod.canAccessUnit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 50 }),
      42,
      "edit_exam_legend",
    );

    vi.doUnmock("./authorization");
  });

  it("select: view_studies=true mas edit_exam_legend=false recebe FORBIDDEN (sem tocar banco)", async () => {
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return {
        ...original,
        assertDicomFileAccess: vi.fn(async () => 42),
        canAccessUnit: vi.fn(async () => false),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 51, role: "operador", unit_id: 42 });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.studyExamLegend.select({
        studyInstanceUid: "1.2.3.4.5",
        examLegendId: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const authMod = await import("./authorization");
    expect(authMod.canAccessUnit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 51 }),
      42,
      "edit_exam_legend",
    );

    vi.doUnmock("./authorization");
  });

  it("confirmSelections: com edit_exam_legend concedido, a checagem não bloqueia o fluxo legítimo", async () => {
    // Garante que a correção não introduz um falso-negativo: com permissão
    // concedida, o fluxo segue adiante até o próximo passo real (banco), em
    // vez de parar em FORBIDDEN.
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return {
        ...original,
        assertDicomFileAccess: vi.fn(async () => 42),
        canAccessUnit: vi.fn(async () => true),
      };
    });
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        // Sem banco disponível: o próximo erro esperado é INTERNAL_SERVER_ERROR
        // (banco indisponível), não FORBIDDEN — prova que a checagem de
        // permissão foi superada normalmente.
        getDb: vi.fn(async () => null),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 52, role: "medico", unit_id: 42 });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.studyExamLegend.confirmSelections({
        studyInstanceUid: "1.2.3.4.5",
        examLegendIds: [1],
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    vi.doUnmock("./authorization");
    vi.doUnmock("./db");
  });
});

describe("sla.setUnitSla — valida effectiveFrom antes de persistir", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("effectiveFrom inválido (string que não é data) é rejeitado com BAD_REQUEST e nada é persistido", async () => {
    const insertValuesMock = vi.fn();
    const updateWhereMock = vi.fn();
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([]), // nenhuma config existente -> caminho insert
          insert: () => ({ values: insertValuesMock }),
          update: () => ({ set: () => ({ where: updateWhereMock }) }),
        })),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 60, role: "admin_master", unit_id: null });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.sla.setUnitSla({
        unitId: 1,
        enabled: false,
        effectiveFrom: "não-é-uma-data",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(updateWhereMock).not.toHaveBeenCalled();

    vi.doUnmock("./db");
  });

  it("effectiveFrom válido (ISO) continua sendo aceito normalmente (sem regressão)", async () => {
    const insertValuesMock = vi.fn(async () => {});
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([]),
          insert: () => ({ values: insertValuesMock }),
        })),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 61, role: "admin_master", unit_id: null });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sla.setUnitSla({
      unitId: 1,
      enabled: true,
      slaValue: 24,
      slaUnit: "hour",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toMatchObject({ success: true });
    expect(insertValuesMock).toHaveBeenCalled();

    vi.doUnmock("./db");
  });
});
