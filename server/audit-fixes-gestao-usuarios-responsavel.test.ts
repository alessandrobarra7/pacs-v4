/**
 * Regressão (claude/gestao-usuarios-responsavel-financeiro, 2026-09-18):
 * financeSimple.linkUser / unlinkUser existiam antes desta branch só como
 * INSERT/DELETE cru em financial_responsible_users, sem nenhuma das 4
 * garantias que o documento de requisitos
 * REQUISITOS_FUNCIONALIDADE_RESPONSAVEL_FINANCEIRO_2026-09-17 pede: (a) a
 * conta concedida precisa ter o perfil "responsavel_financeiro" — um vínculo
 * pra outro papel nunca aparece em tela nenhuma, é um vínculo morto; (b) uma
 * tentativa de vínculo duplicado (bloqueada só pela unique key do banco)
 * precisa virar uma mensagem compreensível, não um erro cru de driver; (c)
 * remover o único usuário com acesso a um responsável exige confirmação
 * explícita — nunca em silêncio, mesmo por chamada direta à API; (d) toda
 * concessão/revogação de acesso gera auditoria.
 *
 * Segue o mesmo padrão de audit-fixes-repasse-preco-externo.test.ts: mocka
 * "./db" com vi.doMock (spread do módulo original + overrides pontuais) e
 * chama os procedures reais via appRouter.createCaller — nunca reimplementa
 * a lógica da procedure no teste.
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
    role: overrides.role ?? "admin_master",
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

describe("financeSimple.linkUser — conceder acesso", () => {
  it("rejeita conta que não tem o perfil responsavel_financeiro, sem chamar linkUserToResponsible", async () => {
    vi.resetModules();
    const linkSpy = vi.fn(async () => { throw new Error("não deveria vincular — role errado"); });
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([{ id: 7, role: "medico", isActive: true }]),
        })),
        linkUserToResponsible: linkSpy,
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    await expect(
      caller.financeSimple.linkUser({ financialResponsibleId: 10, userId: 7 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(linkSpy).not.toHaveBeenCalled();

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("rejeita conta inativa, mesmo com o perfil correto", async () => {
    vi.resetModules();
    const linkSpy = vi.fn(async () => { throw new Error("não deveria vincular — conta inativa"); });
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([{ id: 7, role: "responsavel_financeiro", isActive: false }]),
        })),
        linkUserToResponsible: linkSpy,
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    await expect(
      caller.financeSimple.linkUser({ financialResponsibleId: 10, userId: 7 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(linkSpy).not.toHaveBeenCalled();

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("concede acesso a uma conta válida, grava o vínculo com os IDs exatos e audita GRANT_FINANCIAL_RESPONSIBLE_ACCESS", async () => {
    vi.resetModules();
    const linkSpy = vi.fn(async () => undefined);
    const auditSpy = vi.fn(async () => undefined);
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([{ id: 7, role: "responsavel_financeiro", isActive: true }]),
        })),
        linkUserToResponsible: linkSpy,
        createAuditLog: auditSpy,
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    const result = await caller.financeSimple.linkUser({ financialResponsibleId: 10, userId: 7 });

    expect(result).toEqual({ success: true });
    expect(linkSpy).toHaveBeenCalledWith(10, 7);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const auditCall = auditSpy.mock.calls[0][0];
    expect(auditCall.action).toBe("GRANT_FINANCIAL_RESPONSIBLE_ACCESS");
    expect(auditCall.target_id).toBe("10:7");

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("traduz erro de chave duplicada (uq_resp_user) em mensagem compreensível, sem mascarar outros erros", async () => {
    vi.resetModules();
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([{ id: 7, role: "responsavel_financeiro", isActive: true }]),
        })),
        linkUserToResponsible: vi.fn(async () => {
          throw new Error("Duplicate entry '10-7' for key 'uq_resp_user'");
        }),
        createAuditLog: vi.fn(async () => undefined),
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    await expect(
      caller.financeSimple.linkUser({ financialResponsibleId: 10, userId: 7 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("já tem acesso") });

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("não mascara um erro de banco não relacionado à chave duplicada", async () => {
    vi.resetModules();
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([{ id: 7, role: "responsavel_financeiro", isActive: true }]),
        })),
        linkUserToResponsible: vi.fn(async () => {
          throw new Error("ECONNRESET: conexão com o banco perdida");
        }),
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    await expect(
      caller.financeSimple.linkUser({ financialResponsibleId: 10, userId: 7 })
    ).rejects.toMatchObject({ message: expect.stringContaining("ECONNRESET") });

    vi.doUnmock("./db");
    vi.resetModules();
  });
});

describe("financeSimple.unlinkUser — revogar acesso", () => {
  it("exige confirmLastUser ao remover o único usuário com acesso, e não chama unlinkUserFromResponsible sem isso", async () => {
    vi.resetModules();
    const unlinkSpy = vi.fn(async () => { throw new Error("não deveria remover sem confirmação"); });
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        listUsersForResponsible: vi.fn(async () => [
          { id: 1, financial_responsible_id: 10, user_id: 7, createdAt: new Date(), name: "Fulano", username: "fulano", email: "f@x.com", role: "responsavel_financeiro", is_active: true, is_orphan: false },
        ]),
        unlinkUserFromResponsible: unlinkSpy,
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    await expect(
      caller.financeSimple.unlinkUser({ financialResponsibleId: 10, userId: 7 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("LAST_USER_CONFIRMATION_REQUIRED") });
    expect(unlinkSpy).not.toHaveBeenCalled();

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("remove o único usuário quando confirmLastUser=true, e audita was_last_user=true", async () => {
    vi.resetModules();
    const unlinkSpy = vi.fn(async () => undefined);
    const auditSpy = vi.fn(async () => undefined);
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        listUsersForResponsible: vi.fn(async () => [
          { id: 1, financial_responsible_id: 10, user_id: 7, createdAt: new Date(), name: "Fulano", username: "fulano", email: "f@x.com", role: "responsavel_financeiro", is_active: true, is_orphan: false },
        ]),
        unlinkUserFromResponsible: unlinkSpy,
        createAuditLog: auditSpy,
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    const result = await caller.financeSimple.unlinkUser({ financialResponsibleId: 10, userId: 7, confirmLastUser: true });

    expect(result).toEqual({ success: true, was_last_user: true });
    expect(unlinkSpy).toHaveBeenCalledWith(10, 7);
    const auditCall = auditSpy.mock.calls[0][0];
    expect(auditCall.action).toBe("REVOKE_FINANCIAL_RESPONSIBLE_ACCESS");
    expect(auditCall.metadata.was_last_user).toBe(true);

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("remove um usuário sem exigir confirmLastUser quando há mais de um com acesso", async () => {
    vi.resetModules();
    const unlinkSpy = vi.fn(async () => undefined);
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        listUsersForResponsible: vi.fn(async () => [
          { id: 1, financial_responsible_id: 10, user_id: 7, createdAt: new Date(), name: "Fulano", username: "fulano", email: "f@x.com", role: "responsavel_financeiro", is_active: true, is_orphan: false },
          { id: 2, financial_responsible_id: 10, user_id: 8, createdAt: new Date(), name: "Beltrano", username: "beltrano", email: "b@x.com", role: "responsavel_financeiro", is_active: true, is_orphan: false },
        ]),
        unlinkUserFromResponsible: unlinkSpy,
        createAuditLog: vi.fn(async () => undefined),
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    const result = await caller.financeSimple.unlinkUser({ financialResponsibleId: 10, userId: 7 });

    expect(result).toEqual({ success: true, was_last_user: false });
    expect(unlinkSpy).toHaveBeenCalledWith(10, 7);

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("papel diferente de admin_master recebe FORBIDDEN sem consultar o banco", async () => {
    vi.resetModules();
    const listSpy = vi.fn(async () => { throw new Error("não deveria consultar — FORBIDDEN é anterior"); });
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return { ...original, listUsersForResponsible: listSpy };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "responsavel_financeiro" }));

    await expect(
      caller.financeSimple.unlinkUser({ financialResponsibleId: 10, userId: 7 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(listSpy).not.toHaveBeenCalled();

    vi.doUnmock("./db");
    vi.resetModules();
  });
});

describe("listUsersForResponsible (db.ts) — vínculo órfão sinalizado explicitamente", () => {
  it("marca is_orphan=true quando o LEFT JOIN não encontra o user_id (conta removida)", async () => {
    vi.resetModules();
    const { financial_responsible_users, users } = await import("../drizzle/schema");
    vi.doMock("drizzle-orm/mysql2", () => ({
      drizzle: vi.fn(() => ({
        select: () => ({
          from: (table: unknown) => {
            const chain: any = {
              leftJoin: () => chain,
              where: () => chain,
              then: (resolve: (v: unknown[]) => void) => {
                if (table === financial_responsible_users) {
                  // LEFT JOIN sem match: os campos de `users` vêm todos null.
                  resolve([{
                    id: 1, financial_responsible_id: 10, user_id: 999, createdAt: new Date(),
                    name: null, username: null, email: null, role: null, is_active: null,
                  }]);
                } else {
                  resolve([]);
                }
              },
            };
            return chain;
          },
        }),
      })),
    }));
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";

    const { listUsersForResponsible } = await import("./db");
    const rows = await listUsersForResponsible(10);

    expect(rows).toHaveLength(1);
    expect(rows[0].is_orphan).toBe(true);
    expect(rows[0].user_id).toBe(999);

    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    vi.doUnmock("drizzle-orm/mysql2");
    vi.resetModules();
  });
});
