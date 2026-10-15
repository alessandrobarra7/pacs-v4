/**
 * Regressão comportamental — server/db.ts createUserTransactional
 * (ACHADO_CRIACAO_USUARIOS_FUNCAO_E_APARENCIA_2026-10-15, parecer técnico
 * da Manus "correção da criação de usuários").
 *
 * Testa a função REAL (não mockada) contra um fake do driver
 * "drizzle-orm/mysql2" — mesma técnica já usada em
 * audit-fixes-gestao-usuarios-responsavel.test.ts para
 * linkUserToResponsible/unlinkUserFromResponsible: mocka `drizzle-orm/mysql2`
 * (não "./db"), seta DATABASE_URL e usa vi.resetModules() + import dinâmico
 * de "./db" a cada teste, para que getDb() real (sem mock) monte o driver
 * fake por baixo. Isso evita o problema de self-reference de ESM (getDb()
 * chamado DE DENTRO de db.ts não "vê" um vi.mock("./db") feito de fora).
 *
 * Modela de verdade: (a) transação com rollback real — se qualquer insert
 * dentro dela lançar, tudo que foi inserido antes nessa chamada é desfeito;
 * (b) violação de índice único (ER_DUP_ENTRY) no INSERT real de `users`,
 * não apenas a checagem prévia; (c) a cadeia financeira
 * (financial_responsibles / financial_responsible_units /
 * financial_responsible_users) sendo gravada como parte da MESMA transação.
 *
 * Cobre os testes 8, 9 (parcial — violação real do índice), 10 e 11 do
 * parecer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeState = {
  usersRows: Array<Record<string, unknown> & { id: number; username: string }>;
  uupRows: unknown[];
  auditRows: any[];
  frRows: Array<{ id: number }>;
  fruRows: Array<{ financial_responsible_id: number; unit_id: number; ends_at: Date | null }>;
  fruUsersRows: Array<{ financial_responsible_id: number; user_id: number }>;
  nextId: number;
};

function freshState(): FakeState {
  return { usersRows: [], uupRows: [], auditRows: [], frRows: [], fruRows: [], fruUsersRows: [], nextId: 1 };
}

/**
 * Fake de driver com transação real: cada `tx.insert(...).values(...)`
 * aplica a mutação imediatamente contra `state`, mas se o callback de
 * `db.transaction` lançar, o snapshot tirado antes do início é restaurado —
 * rollback de verdade (mesma técnica do fake de responsável financeiro).
 */
function makeFakeDb(
  tables: {
    users: unknown;
    user_unit_permissions: unknown;
    audit_log: unknown;
    financial_responsibles: unknown;
    financial_responsible_units: unknown;
    financial_responsible_users: unknown;
  },
  opts: {
    usernameShouldCollideOnInsert?: string;
    auditInsertShouldThrow?: boolean;
    financialUsersInsertShouldThrow?: boolean;
  } = {},
) {
  let state = freshState();

  function snapshot(): FakeState {
    return JSON.parse(JSON.stringify(state));
  }
  function restore(s: FakeState) {
    state = s;
  }

  function tableApi() {
    return {
      select: (_cols?: unknown) => ({
        from: (table: unknown) => ({
          where: (_cond: unknown) => ({
            limit: (_n: number) => {
              // A checagem prévia de username (select users where username=X)
              // é deliberadamente neutralizada aqui (sempre retorna []): este
              // arquivo testa o comportamento de INSERT (violação real do
              // índice único e rollback), não a checagem prévia — essa parte
              // já é coberta em admin-create-user-authorization.test.ts via
              // UsernameTakenError mockado. Sem isso, qualquer usuário já
              // inserido nesta mesma chamada de teste faria a checagem
              // prévia colidir com usernames completamente diferentes.
              if (table === tables.users) return Promise.resolve([]);
              if (table === tables.financial_responsible_units) {
                return Promise.resolve(state.fruRows.filter((r) => r.ends_at === null).slice(0, 1));
              }
              return Promise.resolve([]);
            },
            orderBy: () => ({
              limit: (_n: number) => {
                if (table === tables.financial_responsible_units) {
                  return Promise.resolve(state.fruRows.filter((r) => r.ends_at === null).slice(0, 1));
                }
                return Promise.resolve([]);
              },
            }),
          }),
        }),
      }),
      insert: (table: unknown) => ({
        values: async (vals: any) => {
          const rows = Array.isArray(vals) ? vals : [vals];
          if (table === tables.users) {
            const v = rows[0];
            if (opts.usernameShouldCollideOnInsert && v.username === opts.usernameShouldCollideOnInsert) {
              const err: any = new Error(`Duplicate entry '${v.username}' for key 'users.username'`);
              err.code = "ER_DUP_ENTRY";
              throw err;
            }
            const id = state.nextId++;
            state.usersRows.push({ ...v, id });
            return [{ insertId: id }];
          }
          if (table === tables.user_unit_permissions) {
            state.uupRows.push(...rows);
            return [{ insertId: state.nextId++ }];
          }
          if (table === tables.audit_log) {
            if (opts.auditInsertShouldThrow) throw new Error("Data truncated for column 'action' at row 1");
            state.auditRows.push(...rows);
            return [{ insertId: state.nextId++ }];
          }
          if (table === tables.financial_responsibles) {
            const id = state.nextId++;
            state.frRows.push({ id });
            return [{ insertId: id }];
          }
          if (table === tables.financial_responsible_units) {
            state.fruRows.push({
              financial_responsible_id: rows[0].financial_responsible_id,
              unit_id: rows[0].unit_id,
              ends_at: null,
            });
            return [{ insertId: state.nextId++ }];
          }
          if (table === tables.financial_responsible_users) {
            if (opts.financialUsersInsertShouldThrow) throw new Error("falha simulada ao vincular responsável financeiro");
            state.fruUsersRows.push(rows[0]);
            return [{ insertId: state.nextId++ }];
          }
          throw new Error("fake db: insert em tabela inesperada");
        },
      }),
    };
  }

  return {
    getState: () => state,
    build: () => ({
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const before = snapshot();
        try {
          return await fn(tableApi());
        } catch (err) {
          restore(before);
          throw err;
        }
      },
    }),
  };
}

const basePermissions = {
  view_studies: true,
  edit_reports: true,
  view_anamnesis: true,
  edit_anamnesis: true,
  edit_exam_legend: true,
  print_reports: true,
  manage_templates: true,
};

const baseActor = { user_id: 1, ip_address: "127.0.0.1", user_agent: "vitest" };

/**
 * Monta o driver real de db.ts (getDb() sem mock nenhum) sobre o fake acima
 * — mesma técnica de audit-fixes-gestao-usuarios-responsavel.test.ts.
 * vi.resetModules() roda antes do import do schema para garantir que as
 * referências de tabela usadas pelo fake batem com as que server/db.ts usa
 * internamente depois do reset.
 */
async function withRealDb<T>(
  opts: Parameters<typeof makeFakeDb>[1],
  fn: (fake: ReturnType<typeof makeFakeDb>, dbModule: typeof import("./db")) => Promise<T>,
): Promise<T> {
  vi.resetModules();
  const schema = await import("../drizzle/schema");
  const fake = makeFakeDb(
    {
      users: schema.users,
      user_unit_permissions: schema.user_unit_permissions,
      audit_log: schema.audit_log,
      financial_responsibles: schema.financial_responsibles,
      financial_responsible_units: schema.financial_responsible_units,
      financial_responsible_users: schema.financial_responsible_users,
    },
    opts,
  );
  vi.doMock("drizzle-orm/mysql2", () => ({
    drizzle: vi.fn(() => fake.build()),
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

afterEach(() => {
  vi.doUnmock("drizzle-orm/mysql2");
});

describe("createUserTransactional (server/db.ts) — testes 8, 9, 10, 11 do parecer Manus", () => {
  it("8. falha ao inserir o audit log reverte o usuário e os vínculos principais (rollback real)", async () => {
    await withRealDb({ auditInsertShouldThrow: true }, async (fake, { createUserTransactional }) => {
      await expect(
        createUserTransactional({
          username: "falha.audit",
          name: "Falha Audit",
          password_hash: "hash",
          role: "medico",
          groupKey: "medicos",
          unitIds: [20],
          isActive: true,
          permissions: basePermissions,
          actor: baseActor,
        }),
      ).rejects.toThrow();

      const state = fake.getState();
      expect(state.usersRows).toHaveLength(0);
      expect(state.uupRows).toHaveLength(0);
      expect(state.auditRows).toHaveLength(0);
    });
  });

  it("8b. falha ao vincular a cadeia financeira reverte TAMBÉM o usuário e os vínculos de unidade já inseridos", async () => {
    await withRealDb({ financialUsersInsertShouldThrow: true }, async (fake, { createUserTransactional }) => {
      await expect(
        createUserTransactional({
          username: "falha.financeiro",
          name: "Falha Financeiro",
          password_hash: "hash",
          role: "responsavel_financeiro",
          groupKey: "responsaveisFinanceiros",
          unitIds: [20],
          isActive: true,
          permissions: basePermissions,
          actor: baseActor,
        }),
      ).rejects.toThrow();

      const state = fake.getState();
      // Nada sobrevive: nem o usuário, nem o vínculo de unidade, nem o
      // responsável financeiro criado no meio do caminho.
      expect(state.usersRows).toHaveLength(0);
      expect(state.uupRows).toHaveLength(0);
      expect(state.frRows).toHaveLength(0);
      expect(state.fruRows).toHaveLength(0);
    });
  });

  it("9. violação REAL do índice único no INSERT de users (não a checagem prévia) também vira UsernameTakenError", async () => {
    await withRealDb({ usernameShouldCollideOnInsert: "jacorrida" }, async (fake, { createUserTransactional, UsernameTakenError }) => {
      // Simula uma corrida: a checagem prévia (select) não encontra nada
      // porque outra requisição inseriu o mesmo username entre o SELECT e o
      // INSERT desta chamada — só o INSERT real detecta o conflito.
      await expect(
        createUserTransactional({
          username: "jacorrida",
          name: "Corrida",
          password_hash: "hash",
          role: "medico",
          groupKey: "medicos",
          unitIds: [20],
          isActive: true,
          permissions: basePermissions,
          actor: baseActor,
        }),
      ).rejects.toBeInstanceOf(UsernameTakenError);

      expect(fake.getState().usersRows).toHaveLength(0);
    });
  });

  it("10. criação de responsavel_financeiro deixa usuário, responsável, vínculo usuário-responsável e vínculo responsável-unidade consistentes", async () => {
    await withRealDb({}, async (fake, { createUserTransactional }) => {
      const { id } = await createUserTransactional({
        username: "resp.financeiro",
        name: "Resp Financeiro",
        password_hash: "hash",
        role: "responsavel_financeiro",
        groupKey: "responsaveisFinanceiros",
        unitIds: [20],
        isActive: true,
        permissions: basePermissions,
        actor: baseActor,
      });

      const state = fake.getState();
      expect(state.usersRows).toHaveLength(1);
      expect(state.usersRows[0].id).toBe(id);
      expect(state.uupRows).toHaveLength(1);
      expect(state.frRows).toHaveLength(1);
      expect(state.fruRows).toHaveLength(1);
      expect(state.fruRows[0].unit_id).toBe(20);
      expect(state.fruUsersRows).toHaveLength(1);
      expect(state.fruUsersRows[0].user_id).toBe(id);
      expect(state.fruUsersRows[0].financial_responsible_id).toBe(state.frRows[0].id);
      // Dois audit logs: CREATE_USER + GRANT_FINANCIAL_RESPONSIBLE_ACCESS.
      expect(state.auditRows).toHaveLength(2);
    });
  });

  it("10b. reaproveita o responsável financeiro já ativo da unidade em vez de criar um duplicado", async () => {
    await withRealDb({}, async (fake, { createUserTransactional }) => {
      const first = await createUserTransactional({
        username: "resp.um",
        name: "Resp Um",
        password_hash: "hash",
        role: "responsavel_financeiro",
        groupKey: "responsaveisFinanceiros",
        unitIds: [30],
        isActive: true,
        permissions: basePermissions,
        actor: baseActor,
      });
      expect(fake.getState().frRows).toHaveLength(1);

      const second = await createUserTransactional({
        username: "resp.dois",
        name: "Resp Dois",
        password_hash: "hash",
        role: "responsavel_financeiro",
        groupKey: "responsaveisFinanceiros",
        unitIds: [30], // mesma unidade — já tem responsável ativo
        isActive: true,
        permissions: basePermissions,
        actor: baseActor,
      });

      const state = fake.getState();
      // Nenhum financial_responsibles novo foi criado — reaproveitou o existente.
      expect(state.frRows).toHaveLength(1);
      expect(state.fruUsersRows).toHaveLength(2);
      expect(state.fruUsersRows.map((r) => r.user_id)).toEqual(expect.arrayContaining([first.id, second.id]));
      expect(state.fruUsersRows[0].financial_responsible_id).toBe(state.frRows[0].id);
      expect(state.fruUsersRows[1].financial_responsible_id).toBe(state.frRows[0].id);
    });
  });

  it("11. isActive e expiration_date são persistidos exatamente como enviados", async () => {
    await withRealDb({}, async (fake, { createUserTransactional }) => {
      const expiration = new Date("2027-01-31T00:00:00.000Z");

      await createUserTransactional({
        username: "inativo.expira",
        name: "Inativo Expira",
        password_hash: "hash",
        role: "viewer",
        groupKey: "visualizadores",
        unitIds: [20],
        isActive: false,
        expiration_date: expiration,
        permissions: basePermissions,
        actor: baseActor,
      });

      const state = fake.getState();
      expect(state.usersRows).toHaveLength(1);
      expect(state.usersRows[0].isActive).toBe(false);
      expect(state.usersRows[0].expiration_date).toEqual(expiration);
    });
  });
});
