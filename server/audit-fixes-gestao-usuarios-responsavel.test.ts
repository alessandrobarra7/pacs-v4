/**
 * Regressão (claude/gestao-usuarios-responsavel-financeiro).
 *
 * Duas rodadas:
 *
 * 2026-09-18 — primeira versão, cobrindo o que o documento de requisitos
 * REQUISITOS_FUNCIONALIDADE_RESPONSAVEL_FINANCEIRO_2026-09-17 pede: perfil
 * correto, mensagem de duplicidade, confirmação de último usuário, auditoria.
 *
 * 2026-09-20 — revisão do Manus encontrou 3 bloqueios reais nessa primeira
 * versão, todos corrigidos aqui:
 *   (1) o teste de duplicidade mockava linkUserToResponsible pra LANÇAR o
 *       erro manualmente — provava a tradução da mensagem, mas nada sobre o
 *       comportamento real do helper contra MySQL, que na versão anterior
 *       usava onDuplicateKeyUpdate (nunca lança em duplicidade real). Esta
 *       versão adiciona um describe à parte que roda o server/db.ts REAL
 *       (não mockado) contra um fake de banco que modela de verdade a
 *       semântica de uma unique key MySQL (ER_DUP_ENTRY na segunda inserção
 *       do mesmo user_id, incluindo rollback transacional quando a auditoria
 *       falha).
 *   (2) nada impedia vincular a mesma conta a um SEGUNDO responsável
 *       diferente — decisão de produto confirmada pelo Alessandro em
 *       2026-09-20: Opção A (uma conta, um responsável ativo por vez).
 *       Novos casos abaixo.
 *   (3) o caminho de acesso pós-login é resolvido em client/src/pages/
 *       Login.tsx e PacsQueryPage.tsx (fora do escopo de testes de servidor
 *       deste arquivo — verificado por leitura de código e pnpm check).
 *
 * Os testes de nível "router" (financeSimple.linkUser/unlinkUser) seguem o
 * padrão de audit-fixes-repasse-preco-externo.test.ts: mockam "./db" e
 * chamam os procedures reais via appRouter.createCaller, sem reimplementar
 * a lógica da procedure. Os testes de nível "db.ts" chamam as funções reais
 * (linkUserToResponsible / unlinkUserFromResponsible / listUsersForResponsible)
 * contra um fake de driver que modela affectedRows e unique key de verdade.
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

// ═══════════════════════════════════════════════════════════════════════
// Nível db.ts — comportamento real de banco (Bloqueio 1 do Manus)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fake de driver que modela de verdade: (a) a unique key uq_resp_user(user_id)
 * — Opção A, uma segunda inserção do mesmo user_id lança um erro no mesmo
 * formato que o driver mysql2 usa (code ER_DUP_ENTRY); (b) affectedRows de um
 * DELETE, pra provar a checagem de "vínculo não existe"; (c) rollback real de
 * transação — se o callback de db.transaction lançar (ex.: auditoria falhou
 * por causa do enum da migration 0061 ainda não aplicado), todas as
 * mutações feitas dentro dela são desfeitas, igual um COMMIT/ROLLBACK real.
 */
function makeRealisticResponsibleUsersDb(opts: { auditInsertShouldThrow?: boolean } = {}) {
  const state = {
    links: [] as { financial_responsible_id: number; user_id: number }[],
    auditRows: [] as any[],
  };

  function snapshot() {
    return { links: [...state.links], auditRows: [...state.auditRows] };
  }
  function restore(s: ReturnType<typeof snapshot>) {
    state.links = s.links;
    state.auditRows = s.auditRows;
  }

  function tableApi(financial_responsible_users: unknown, audit_log: unknown) {
    return {
      insert: (table: unknown) => ({
        values: async (v: any) => {
          if (table === financial_responsible_users) {
            const dup = state.links.some((l) => l.user_id === v.user_id);
            if (dup) {
              const err: any = new Error(
                `Duplicate entry '${v.user_id}' for key 'financial_responsible_users.uq_resp_user'`,
              );
              err.code = "ER_DUP_ENTRY";
              err.errno = 1062;
              throw err;
            }
            state.links.push({ financial_responsible_id: v.financial_responsible_id, user_id: v.user_id });
            return [{ insertId: state.links.length }];
          }
          if (table === audit_log) {
            if (opts.auditInsertShouldThrow) {
              const err: any = new Error("Data truncated for column 'action' at row 1");
              err.code = "WARN_DATA_TRUNCATED";
              throw err;
            }
            state.auditRows.push(v);
            return [{ insertId: state.auditRows.length }];
          }
          throw new Error("fake db: insert em tabela inesperada");
        },
      }),
      delete: (table: unknown) => ({
        where: () => ({
          then: (resolve: (v: unknown[]) => void) => {
            if (table !== financial_responsible_users) {
              resolve([{ affectedRows: 0 }]);
              return;
            }
            // Simplificação deliberada: o fake não reavalia a árvore SQL do
            // .where() (mesma limitação documentada nos outros testes desta
            // suíte). O que importa aqui é o efeito de affectedRows sobre o
            // fluxo, não reprovar a construção do predicado — isso é uma
            // chamada única e conhecida (financial_responsible_id + user_id)
            // em toda a base de código, sem risco de string interpolada.
            const before = state.links.length;
            state.links = state.links.filter(
              (l) => !(l.financial_responsible_id === deleteTarget!.frId && l.user_id === deleteTarget!.userId),
            );
            const affectedRows = before - state.links.length;
            resolve([{ affectedRows }]);
          },
        }),
      }),
    };
  }

  // O alvo do próximo DELETE é setado explicitamente pelo teste antes de
  // chamar unlinkUserFromResponsible — ver comentário acima sobre o .where().
  let deleteTarget: { frId: number; userId: number } | null = null;

  return {
    setDeleteTarget: (frId: number, userId: number) => { deleteTarget = { frId, userId }; },
    hasLink: (userId: number) => state.links.some((l) => l.user_id === userId),
    auditRows: state.auditRows,
    links: state.links,
    build: (financial_responsible_users: unknown, audit_log: unknown) => ({
      ...tableApi(financial_responsible_users, audit_log),
      transaction: async (fn: (tx: unknown) => Promise<void>) => {
        const before = snapshot();
        try {
          return await fn(tableApi(financial_responsible_users, audit_log));
        } catch (err) {
          restore(before);
          throw err;
        }
      },
    }),
  };
}

describe("server/db.ts — linkUserToResponsible/unlinkUserFromResponsible contra semântica real de MySQL", () => {
  /**
   * Monta o driver real de db.ts (getDb() sem mock nenhum) sobre um fake de
   * "drizzle-orm/mysql2" — mesma técnica de listUsersForResponsible mais
   * abaixo. resetModules() SEMPRE roda antes do import do schema (mesma
   * armadilha de "época de módulos" já documentada nesta suíte e em
   * audit-fixes-financeiro-historico.test.ts): senão as referências de
   * tabela usadas pelo fake nunca batem com as que server/db.ts usa
   * internamente depois do reset.
   */
  async function withRealDb<T>(
    opts: { auditInsertShouldThrow?: boolean },
    fn: (fake: ReturnType<typeof makeRealisticResponsibleUsersDb>, dbModule: typeof import("./db")) => Promise<T>,
  ): Promise<T> {
    vi.resetModules();
    const { financial_responsible_users, audit_log } = await import("../drizzle/schema");
    const fake = makeRealisticResponsibleUsersDb(opts);
    vi.doMock("drizzle-orm/mysql2", () => ({
      drizzle: vi.fn(() => fake.build(financial_responsible_users, audit_log)),
    }));
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
    try {
      const dbModule = await import("./db");
      return await fn(fake, dbModule);
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      vi.doUnmock("drizzle-orm/mysql2");
      vi.resetModules();
    }
  }

  it("a segunda tentativa de vincular o MESMO user_id (mesmo a um responsável diferente) lança ER_DUP_ENTRY — prova que onDuplicateKeyUpdate foi removido", async () => {
    await withRealDb({}, async (fake, { linkUserToResponsible }) => {
      const actor = { user_id: 1, ip_address: "127.0.0.1", user_agent: "vitest" };

      await linkUserToResponsible(10, 7, actor);
      expect(fake.hasLink(7)).toBe(true);

      // Opção A: mesma conta (user_id=7), responsável DIFERENTE (20) — deve
      // colidir do mesmo jeito que colidiria pro mesmo responsável, porque a
      // unique key agora é só em user_id.
      await expect(linkUserToResponsible(20, 7, actor)).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    });
  });

  it("grava o vínculo e a auditoria como uma operação atômica: se a auditoria falhar, o vínculo é revertido", async () => {
    await withRealDb({ auditInsertShouldThrow: true }, async (fake, { linkUserToResponsible }) => {
      const actor = { user_id: 1 };

      await expect(linkUserToResponsible(10, 7, actor)).rejects.toThrow();
      // Se a transação não tivesse revertido, o vínculo continuaria gravado
      // mesmo com a auditoria falhando.
      expect(fake.hasLink(7)).toBe(false);
    });
  });

  it("unlinkUserFromResponsible lança quando o vínculo não existe (affectedRows=0), sem gravar auditoria de revogação", async () => {
    await withRealDb({}, async (fake, { unlinkUserFromResponsible, FinancialResponsibleUserLinkNotFoundError }) => {
      fake.setDeleteTarget(10, 7); // nunca foi inserido — DELETE não afeta nenhuma linha
      await expect(unlinkUserFromResponsible(10, 7, { user_id: 1 })).rejects.toBeInstanceOf(
        FinancialResponsibleUserLinkNotFoundError,
      );
      expect(fake.auditRows).toHaveLength(0);
    });
  });

  it("unlinkUserFromResponsible remove o vínculo existente e grava a auditoria com o metadata passado", async () => {
    await withRealDb({}, async (fake, { linkUserToResponsible, unlinkUserFromResponsible }) => {
      await linkUserToResponsible(10, 7, { user_id: 1 });
      fake.setDeleteTarget(10, 7);

      await unlinkUserFromResponsible(10, 7, { user_id: 2 }, { was_last_user: true });

      expect(fake.hasLink(7)).toBe(false);
      // 2 linhas de auditoria: uma da concessão (linkUserToResponsible acima)
      // e uma da revogação — checamos especificamente a última.
      expect(fake.auditRows).toHaveLength(2);
      const revokeAudit = fake.auditRows[fake.auditRows.length - 1];
      expect(revokeAudit.action).toBe("REVOKE_FINANCIAL_RESPONSIBLE_ACCESS");
      expect(revokeAudit.metadata.was_last_user).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Nível router — financeSimple.linkUser
// ═══════════════════════════════════════════════════════════════════════

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

  it("rejeita responsável financeiro inexistente, sem chamar linkUserToResponsible", async () => {
    vi.resetModules();
    const linkSpy = vi.fn(async () => { throw new Error("não deveria vincular — responsável inexistente"); });
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([{ id: 7, role: "responsavel_financeiro", isActive: true }]),
        })),
        getFinancialResponsibleById: vi.fn(async () => undefined),
        linkUserToResponsible: linkSpy,
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    await expect(
      caller.financeSimple.linkUser({ financialResponsibleId: 999, userId: 7 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(linkSpy).not.toHaveBeenCalled();

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("Opção A: rejeita conceder acesso quando a conta já tem um responsável DIFERENTE, sem chamar linkUserToResponsible", async () => {
    vi.resetModules();
    const linkSpy = vi.fn(async () => { throw new Error("não deveria vincular — já tem outro responsável"); });
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([{ id: 7, role: "responsavel_financeiro", isActive: true }]),
        })),
        getFinancialResponsibleById: vi.fn(async () => ({ id: 10, legal_name: "Unidade X", isActive: true })),
        getResponsibleIdForUser: vi.fn(async () => 20), // já vinculado a OUTRO responsável (20 != 10)
        linkUserToResponsible: linkSpy,
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    await expect(
      caller.financeSimple.linkUser({ financialResponsibleId: 10, userId: 7 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("outro responsável") });
    expect(linkSpy).not.toHaveBeenCalled();

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("concede acesso a uma conta válida sem vínculo prévio, delegando pro db.ts com o ator correto", async () => {
    vi.resetModules();
    const linkSpy = vi.fn(async () => undefined);
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([{ id: 7, role: "responsavel_financeiro", isActive: true }]),
        })),
        getFinancialResponsibleById: vi.fn(async () => ({ id: 10, legal_name: "Unidade X", isActive: true })),
        getResponsibleIdForUser: vi.fn(async () => undefined), // sem vínculo prévio
        linkUserToResponsible: linkSpy,
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    const result = await caller.financeSimple.linkUser({ financialResponsibleId: 10, userId: 7 });

    expect(result).toEqual({ success: true });
    expect(linkSpy).toHaveBeenCalledWith(10, 7, expect.objectContaining({ user_id: 1 }));

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("FIX (2026-09-23, política 'bloquear tudo'): rejeita conceder acesso a um responsável INATIVO, sem chamar linkUserToResponsible", async () => {
    vi.resetModules();
    const linkSpy = vi.fn(async () => undefined);
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([{ id: 7, role: "responsavel_financeiro", isActive: true }]),
        })),
        getFinancialResponsibleById: vi.fn(async () => ({ id: 10, legal_name: "Unidade X", isActive: false })),
        getResponsibleIdForUser: vi.fn(async () => undefined),
        linkUserToResponsible: linkSpy,
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    await expect(
      caller.financeSimple.linkUser({ financialResponsibleId: 10, userId: 7 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(linkSpy).not.toHaveBeenCalled();

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("traduz um ER_DUP_ENTRY vindo do db.ts (corrida com a pré-checagem) em mensagem compreensível", async () => {
    vi.resetModules();
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          select: () => selectChain([{ id: 7, role: "responsavel_financeiro", isActive: true }]),
        })),
        getFinancialResponsibleById: vi.fn(async () => ({ id: 10, legal_name: "Unidade X", isActive: true })),
        getResponsibleIdForUser: vi.fn(async () => undefined),
        linkUserToResponsible: vi.fn(async () => {
          const err: any = new Error("Duplicate entry '7' for key 'financial_responsible_users.uq_resp_user'");
          err.code = "ER_DUP_ENTRY";
          throw err;
        }),
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
        getFinancialResponsibleById: vi.fn(async () => ({ id: 10, legal_name: "Unidade X", isActive: true })),
        getResponsibleIdForUser: vi.fn(async () => undefined),
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

// ═══════════════════════════════════════════════════════════════════════
// Nível router — financeSimple.unlinkUser
// ═══════════════════════════════════════════════════════════════════════

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

  it("remove o único usuário quando confirmLastUser=true, passando was_last_user=true como metadata pro db.ts", async () => {
    vi.resetModules();
    const unlinkSpy = vi.fn(async () => undefined);
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

    const result = await caller.financeSimple.unlinkUser({ financialResponsibleId: 10, userId: 7, confirmLastUser: true });

    expect(result).toEqual({ success: true, was_last_user: true });
    expect(unlinkSpy).toHaveBeenCalledWith(
      10, 7,
      expect.objectContaining({ user_id: 1 }),
      expect.objectContaining({ was_last_user: true }),
    );

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
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    const result = await caller.financeSimple.unlinkUser({ financialResponsibleId: 10, userId: 7 });

    expect(result).toEqual({ success: true, was_last_user: false });
    expect(unlinkSpy).toHaveBeenCalledWith(10, 7, expect.objectContaining({ user_id: 1 }), expect.objectContaining({ was_last_user: false }));

    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("traduz FinancialResponsibleUserLinkNotFoundError em NOT_FOUND, em vez de reportar sucesso falso", async () => {
    vi.resetModules();
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        listUsersForResponsible: vi.fn(async () => [
          { id: 1, financial_responsible_id: 10, user_id: 7, createdAt: new Date(), name: "Fulano", username: "fulano", email: "f@x.com", role: "responsavel_financeiro", is_active: true, is_orphan: false },
          { id: 2, financial_responsible_id: 10, user_id: 8, createdAt: new Date(), name: "Beltrano", username: "beltrano", email: "b@x.com", role: "responsavel_financeiro", is_active: true, is_orphan: false },
        ]),
        unlinkUserFromResponsible: vi.fn(async () => {
          throw new original.FinancialResponsibleUserLinkNotFoundError();
        }),
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    await expect(
      caller.financeSimple.unlinkUser({ financialResponsibleId: 10, userId: 999 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

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

// ═══════════════════════════════════════════════════════════════════════
// listEligibleUsersForResponsible — Opção A (Bloqueio 2 do Manus)
// ═══════════════════════════════════════════════════════════════════════

describe("financeSimple.listEligibleUsersForResponsible — Opção A", () => {
  it("exclui contas já vinculadas a QUALQUER responsável, não só ao atual", async () => {
    vi.resetModules();
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => ({
          selectDistinct: () => selectChain([{ user_id: 7 }, { user_id: 8 }]), // 7 e 8 já vinculados a QUALQUER responsável (7 a este, 8 a outro)
          select: () => selectChain([
            { id: 7, name: "Já vinculado a este", username: "u7", email: "u7@x.com" },
            { id: 8, name: "Já vinculado a outro responsável", username: "u8", email: "u8@x.com" },
            { id: 9, name: "Elegível", username: "u9", email: "u9@x.com" },
          ]),
        })),
      };
    });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createCtx({ id: 1, role: "admin_master" }));

    const result = await caller.financeSimple.listEligibleUsersForResponsible({ financialResponsibleId: 10 });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(9);

    vi.doUnmock("./db");
    vi.resetModules();
  });
});

// ═══════════════════════════════════════════════════════════════════════
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
