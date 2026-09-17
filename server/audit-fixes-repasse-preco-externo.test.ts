/**
 * Regressão (auditoria claude/modulo-repasse-preco-externo, 2026-09-17):
 * cobre as duas peças novas de RBAC do módulo de repasse ao médico e preço de
 * venda externa, seguindo a mesma lição já aplicada neste projeto em
 * audit-fixes-forbidden-regressions.test.ts — getDb() retorna null sem
 * DATABASE_URL, então qualquer procedure que chame getDb() antes de decidir
 * a autorização precisa de ./db mockado, senão o teste "passa" só pela
 * ausência de banco no sandbox, não porque a regra realmente barrou o acesso.
 *
 *   - assertCanManageExternalSalePrice: admin_master é deliberadamente
 *     excluído do módulo de preço de venda externa (decisão de produto, não
 *     falha de permissão) — unit_admin com vínculo é permitido e grava o
 *     preço com os dados exatos esperados.
 *   - confirmDoctorPayment: só o próprio médico dono do repasse pode
 *     confirmar/contestar; contestar sem observação é rejeitado pelo Zod
 *     antes de qualquer acesso a banco.
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
    groupBy: () => chain,
    then: (resolve: (value: T[]) => void) => resolve(rows),
  };
  return chain;
}

describe("setExternalSalePrice / listExternalSalePrices / unitProfitCalculator — escopo exclusivo", () => {
  it("admin_master recebe FORBIDDEN sem tocar banco (módulo não é dele, por decisão de produto)", async () => {
    vi.resetModules();
    const selectSpy = vi.fn(() => { throw new Error("não deveria consultar o banco para admin_master neste módulo"); });
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({ select: selectSpy, insert: selectSpy, update: selectSpy })),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 1, role: "admin_master" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.financeSimple.listExternalSalePrices({ unit_id: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.financeSimple.setExternalSalePrice({ unit_id: 1, exam_legend_id: 1, price_external: 40 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.financeSimple.unitProfitCalculator({ unit_id: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(selectSpy).not.toHaveBeenCalled();

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("unit_admin sem vínculo com a unidade recebe FORBIDDEN", async () => {
    vi.resetModules();
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({ select: () => selectChain([]) })), // nenhum vínculo encontrado
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 2, role: "unit_admin" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.financeSimple.listExternalSalePrices({ unit_id: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("unit_admin com vínculo grava o preço com os dados exatos (não aceita sucesso/erro indistintos)", async () => {
    vi.resetModules();
    const insertValuesSpy = vi.fn();
    const updateWhereSpy = vi.fn();
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          // Única consulta desta procedure: a checagem de vínculo unit_admin -> unidade.
          select: () => selectChain([{ unit_id: 1 }]),
          update: () => ({ set: () => ({ where: updateWhereSpy }) }),
          insert: () => ({ values: insertValuesSpy }),
        })),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 2, role: "unit_admin" });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.financeSimple.setExternalSalePrice({
      unit_id: 1,
      exam_legend_id: 7,
      price_external: 40,
    });

    expect(result).toEqual({ success: true });
    // Encerra a vigência anterior antes de gravar a nova — prova de que o padrão de
    // histórico auditável (igual a billing_unit_modality_prices) foi seguido de fato.
    expect(updateWhereSpy).toHaveBeenCalledTimes(1);
    expect(insertValuesSpy).toHaveBeenCalledTimes(1);
    const inserted = insertValuesSpy.mock.calls[0][0];
    expect(inserted.unit_id).toBe(1);
    expect(inserted.exam_legend_id).toBe(7);
    expect(inserted.price_external).toBe("40");
    expect(inserted.created_by).toBe(2);
    expect(inserted.starts_at).toBeInstanceOf(Date);

    vi.doUnmock("./db");
    vi.resetModules();
  });
});

describe("confirmDoctorPayment — só o próprio médico responde pelo próprio repasse", () => {
  it("papel diferente de médico recebe FORBIDDEN sem tocar banco", async () => {
    vi.resetModules();
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 1, role: "admin_master" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.financeSimple.confirmDoctorPayment({ event_type: "legacy", event_id: 1, status: "confirmed" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.resetModules();
  });

  it("contestar sem observação é rejeitado pelo Zod antes de qualquer acesso a banco", async () => {
    vi.resetModules();
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 5, role: "medico" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.financeSimple.confirmDoctorPayment({ event_type: "legacy", event_id: 1, status: "disputed" })
    ).rejects.toThrow();
    vi.resetModules();
  });

  it("médico não pode confirmar um repasse que pertence a outro médico", async () => {
    vi.resetModules();
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([{
            id: 1,
            doctor_user_id: 999, // outro médico, não o do ctx
            doctor_received_at: new Date(),
            doctor_confirmation_status: null,
          }]),
        })),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 5, role: "medico" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.financeSimple.confirmDoctorPayment({ event_type: "legacy", event_id: 1, status: "confirmed" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("médico não pode responder um repasse que a clínica ainda não marcou como pago", async () => {
    vi.resetModules();
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([{
            id: 1,
            doctor_user_id: 5,
            doctor_received_at: null, // clínica ainda não marcou como pago
            doctor_confirmation_status: null,
          }]),
        })),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 5, role: "medico" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.financeSimple.confirmDoctorPayment({ event_type: "legacy", event_id: 1, status: "confirmed" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    vi.doUnmock("./db");
    vi.resetModules();
  });
});
