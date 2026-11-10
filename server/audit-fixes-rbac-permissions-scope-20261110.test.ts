/**
 * Regressão comportamental — correções RBAC (auditoria-seguranca-rbac-20261110):
 *
 *  1. server/db.ts setUserUnitPermissions: o DELETE (e, portanto, a
 *     "substituição") de user_unit_permissions passa a ser ESCOPADO às
 *     unidades presentes no array `permissions` recebido, nunca
 *     WHERE user_id = X sozinho. Antes, uma chamada tRPC
 *     admin.setUserPermissions enviando só a(s) unidade(s) do próprio
 *     escopo do chamador apagava SILENCIOSAMENTE as permissões do
 *     usuário-alvo em QUALQUER OUTRA unidade (inclusive de outros admins
 *     ou do admin_master), porque o DELETE em db.ts não era escopado
 *     pelas unidades do payload.
 *
 *  2. server/routers/admin.ts deleteUser / updateUser / toggleUserActive:
 *     o audit_log passa a gravar a unidade REAL do usuário-alvo
 *     (targetUser*.unit_id), não a unidade do ator (ctx.user.unit_id) —
 *     mesmo padrão já usado em removeUserUnitLink/linkExistingUserToUnitGroup.
 *
 *  3. server/routers/admin.ts setUserPermissions / removeUserUnitLink /
 *     linkExistingUserToUnitGroup: unit_admin passa a ser explicitamente
 *     bloqueado de afetar contas cujo papel é admin_master ou unit_admin —
 *     mesmo padrão já usado em updateUser/toggleUserActive. Antes, essas 3
 *     rotas dependiam só de assertUnitAdminCanManageTargetUser, que cobre
 *     apenas o cenário de responsavel_financeiro.
 *
 * TÉCNICA DE TESTE:
 *
 * O item 1 testa a função REAL de server/db.ts (não mockada) contra um
 * fake do DRIVER "drizzle-orm/mysql2" — mesma técnica já estabelecida em
 * server/create-user-transactional.test.ts e
 * server/audit-fixes-gestao-usuarios-responsavel.test.ts: mocka
 * "drizzle-orm/mysql2" (não "./db"), seta DATABASE_URL e importa "./db"
 * dinamicamente após vi.resetModules(), para que o getDb() REAL (sem mock)
 * monte o driver fake por baixo. Isso evita o problema de self-reference
 * de ESM: um vi.mock("./db") feito de fora não é "visto" por chamadas
 * internas de db.ts a getDb()/getUserUnitPermissions() (ambas definidas no
 * mesmo módulo).
 *
 * Os itens 2 e 3 são testes de "wiring" sobre a fonte real de
 * server/routers/admin.ts — mesmo estilo já usado em
 * server/report-editor-cancelled-reset-wiring.test.ts e outros
 * `*-wiring.test.ts` deste projeto. Não dá para reaproveitar aqui o mock
 * completo de "./db" (estilo server/unit-admin-financial-guard.test.ts)
 * porque vi.mock("./db") é hoisted para o arquivo INTEIRO e entraria em
 * conflito com o mock de driver usado no item 1 (que depende de importar
 * "./db" SEM mock) — por isso o item 2/3 usam leitura de código-fonte,
 * confirmando que a correção está de fato ligada character-by-character,
 * não apenas "existe uma função com esse nome".
 */
import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const dialect = new MySqlDialect();

/**
 * Evaluator mínimo para condições REAIS geradas por eq()/and()/inArray()
 * do drizzle-orm — as únicas formas usadas por
 * setUserUnitPermissions/getUserUnitPermissions. Renderiza a condição via
 * MySqlDialect.sqlToQuery (SQL com placeholders posicionais + params) e
 * interpreta clauses "`tabela`.`coluna` = ?" e
 * "`tabela`.`coluna` in (?, ?, ...)" unidas por " and ". Não é um
 * interpretador genérico de SQL: é deliberadamente restrito ao que as
 * funções testadas aqui realmente geram, o que é suficiente para provar,
 * com um "banco" mockado com estado real, que o DELETE ficou escopado.
 */
function buildPredicate(cond: unknown): (row: Record<string, unknown>) => boolean {
  const { sql, params } = dialect.sqlToQuery(cond as any);
  const inner = sql.trim().replace(/^\(/, "").replace(/\)$/, "");
  const clauses = inner.split(/\s+and\s+/i);
  let paramIdx = 0;
  const checks: Array<(row: Record<string, unknown>) => boolean> = [];
  for (const clause of clauses) {
    const inMatch = clause.match(/`[^`]+`\.`(\w+)`\s+in\s*\(([^)]*)\)/i);
    const eqMatch = clause.match(/`[^`]+`\.`(\w+)`\s*=\s*\?/);
    if (inMatch) {
      const col = inMatch[1];
      const count = inMatch[2].split(",").length;
      const values = params.slice(paramIdx, paramIdx + count);
      paramIdx += count;
      checks.push((row) => values.includes(row[col]));
    } else if (eqMatch) {
      const col = eqMatch[1];
      const value = params[paramIdx];
      paramIdx += 1;
      checks.push((row) => row[col] === value);
    } else {
      throw new Error(`fake db (teste): clause WHERE não suportada pelo evaluator: ${clause}`);
    }
  }
  return (row) => checks.every((check) => check(row));
}

type FakeState = {
  usersRows: Array<Record<string, unknown> & { id: number }>;
  uupRows: Array<Record<string, unknown> & { user_id: number; unit_id: number }>;
};

function makeFakeDb(tables: { users: unknown; user_unit_permissions: unknown }) {
  const state: FakeState = { usersRows: [], uupRows: [] };

  function pickRows(table: unknown): Array<Record<string, unknown>> {
    if (table === tables.users) return state.usersRows;
    if (table === tables.user_unit_permissions) return state.uupRows;
    return [];
  }

  const build = () => ({
    select: (_cols?: unknown) => ({
      from: (table: unknown) => ({
        where: (cond: unknown) => Promise.resolve(pickRows(table).filter(buildPredicate(cond))),
      }),
    }),
    insert: (table: unknown) => ({
      values: (vals: unknown) => {
        const rows = Array.isArray(vals) ? vals : [vals];
        if (table === tables.user_unit_permissions) state.uupRows.push(...(rows as any[]));
        return Promise.resolve();
      },
    }),
    delete: (table: unknown) => ({
      where: (cond: unknown) => {
        if (table === tables.user_unit_permissions) {
          const predicate = buildPredicate(cond);
          state.uupRows = state.uupRows.filter((row) => !predicate(row));
        }
        return Promise.resolve();
      },
    }),
    update: (table: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: (cond: unknown) => {
          if (table === tables.users) {
            const predicate = buildPredicate(cond);
            state.usersRows = state.usersRows.map((row) => (predicate(row) ? { ...row, ...vals } : row));
          }
          return Promise.resolve();
        },
      }),
    }),
  });

  return { state, build };
}

/** Monta o driver real de db.ts (getDb() SEM mock) sobre o fake acima. */
async function withRealDb<T>(
  fn: (fake: ReturnType<typeof makeFakeDb>, dbModule: typeof import("./db")) => Promise<T>,
): Promise<T> {
  vi.resetModules();
  const schema = await import("../drizzle/schema");
  const fake = makeFakeDb({ users: schema.users, user_unit_permissions: schema.user_unit_permissions });
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
  vi.resetModules();
});

const PERM_BASE = {
  view_studies: true,
  edit_reports: false,
  view_anamnesis: false,
  edit_anamnesis: false,
  edit_exam_legend: false,
  print_reports: false,
  manage_templates: false,
  view_financial: false,
};

describe("server/db.ts setUserUnitPermissions — DELETE escopado às unidades do payload (Achado 1)", () => {
  it("chamar só com unit_id=A preserva INTACTA a permissão existente do mesmo usuário em unit_id=B", async () => {
    const USER_ID = 42;
    const UNIT_A = 10;
    const UNIT_B = 20;

    await withRealDb(async (fake, dbModule) => {
      fake.state.usersRows = [{ id: USER_ID, unit_id: null }];
      fake.state.uupRows = [
        { user_id: USER_ID, unit_id: UNIT_B, group_key: "medicos", ...PERM_BASE, edit_reports: true },
      ];

      await dbModule.setUserUnitPermissions(USER_ID, [{ unit_id: UNIT_A, group_key: "operadores", ...PERM_BASE }]);

      // PROVA CENTRAL do Achado 1: a linha de unit_id=B não foi tocada —
      // nem removida, nem alterada — mesmo a chamada não a mencionando.
      const rowsForB = fake.state.uupRows.filter((r) => r.unit_id === UNIT_B);
      expect(rowsForB).toHaveLength(1);
      expect(rowsForB[0]).toMatchObject({
        user_id: USER_ID,
        unit_id: UNIT_B,
        group_key: "medicos",
        edit_reports: true,
      });

      // A unidade A (mencionada no payload) foi upsertada normalmente.
      const rowsForA = fake.state.uupRows.filter((r) => r.unit_id === UNIT_A);
      expect(rowsForA).toHaveLength(1);
      expect(rowsForA[0]).toMatchObject({ user_id: USER_ID, unit_id: UNIT_A, group_key: "operadores" });

      // Nenhuma linha extra/perdida: exatamente as 2 (A nova + B preservada).
      expect(fake.state.uupRows).toHaveLength(2);
    });
  });

  it("chamar com array vazio NÃO remove nenhuma unidade existente (upsert escopado, não wipe total)", async () => {
    const USER_ID = 43;
    const UNIT_A = 11;

    await withRealDb(async (fake, dbModule) => {
      fake.state.usersRows = [{ id: USER_ID, unit_id: UNIT_A }];
      fake.state.uupRows = [{ user_id: USER_ID, unit_id: UNIT_A, group_key: "medicos", ...PERM_BASE }];

      await dbModule.setUserUnitPermissions(USER_ID, []);

      expect(fake.state.uupRows).toHaveLength(1);
      expect(fake.state.uupRows[0]).toMatchObject({ user_id: USER_ID, unit_id: UNIT_A });
    });
  });

  it("substitui normalmente as permissões DENTRO da unidade mencionada (upsert, não apenas preservação)", async () => {
    const USER_ID = 45;
    const UNIT_A = 13;

    await withRealDb(async (fake, dbModule) => {
      fake.state.usersRows = [{ id: USER_ID, unit_id: UNIT_A }];
      fake.state.uupRows = [
        { user_id: USER_ID, unit_id: UNIT_A, group_key: "medicos", ...PERM_BASE, edit_reports: true },
      ];

      await dbModule.setUserUnitPermissions(USER_ID, [
        { unit_id: UNIT_A, group_key: "operadores", ...PERM_BASE, edit_reports: false, print_reports: true },
      ]);

      const rowsForA = fake.state.uupRows.filter((r) => r.unit_id === UNIT_A);
      expect(rowsForA).toHaveLength(1);
      expect(rowsForA[0]).toMatchObject({
        group_key: "operadores",
        edit_reports: false,
        print_reports: true,
      });
    });
  });

  it("sincroniza users.unit_id usando o conjunto COMPLETO real pós-chamada, não só o array recebido nesta chamada", async () => {
    const USER_ID = 44;
    const UNIT_A = 12;
    const UNIT_B = 22;

    await withRealDb(async (fake, dbModule) => {
      fake.state.usersRows = [{ id: USER_ID, unit_id: UNIT_B }];
      fake.state.uupRows = [{ user_id: USER_ID, unit_id: UNIT_B, group_key: "medicos", ...PERM_BASE }];

      // Chamada parcial, só da unidade A — a unidade B (fora do payload)
      // permanece intacta, então o usuário passa a ter DUAS unidades reais.
      await dbModule.setUserUnitPermissions(USER_ID, [{ unit_id: UNIT_A, group_key: "operadores", ...PERM_BASE }]);

      // users.unit_id deve refletir "múltiplas unidades" (null), nunca a
      // unidade A isolada vinda do payload desta chamada — se o código
      // decidisse só com base no array recebido (regressão possível ao
      // escopar o DELETE), gravaria unit_id=A errado, escondendo a unidade B.
      const updatedUser = fake.state.usersRows.find((u) => u.id === USER_ID);
      expect(updatedUser?.unit_id).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Itens 2 e 3 — testes de "wiring" sobre a fonte real de admin.ts
// ─────────────────────────────────────────────────────────────────────────
const adminSource = readFileSync(join(__dirname, "routers", "admin.ts"), "utf-8");

function sliceProcedure(name: string, approxLen = 2200): string {
  const idx = adminSource.indexOf(`${name}: protectedProcedure`);
  expect(idx, `procedure ${name} não encontrada em server/routers/admin.ts`).toBeGreaterThan(-1);
  return adminSource.slice(idx, idx + approxLen);
}

describe("server/routers/admin.ts — audit_log grava a unidade do ALVO, não do ATOR (Achado 2)", () => {
  it("deleteUser: createAuditLog usa targetUserForAudit?.unit_id, não ctx.user.unit_id", () => {
    const body = sliceProcedure("deleteUser");
    expect(body).toContain("const [targetUserForAudit] = await db.select().from(users).where(eqOp(users.id, input.id));");
    expect(body).toContain("unit_id:     targetUserForAudit?.unit_id ?? undefined,");
    // Garante que a linha antiga (bug) não existe mais dentro do bloco de
    // createAuditLog desta procedure especificamente.
    const auditBlockIdx = body.indexOf("await createAuditLog({");
    const auditBlock = body.slice(auditBlockIdx, auditBlockIdx + 300);
    expect(auditBlock).not.toContain("unit_id:     ctx.user.unit_id ?? undefined,");
  });

  it("updateUser: createAuditLog usa targetUser.unit_id, não ctx.user.unit_id", () => {
    const body = sliceProcedure("updateUser", 6300);
    const auditBlockIdx = body.indexOf("await createAuditLog({");
    expect(auditBlockIdx).toBeGreaterThan(-1);
    const auditBlock = body.slice(auditBlockIdx, auditBlockIdx + 250);
    expect(auditBlock).toContain("unit_id: targetUser.unit_id ?? undefined,");
    expect(auditBlock).not.toContain("unit_id: ctx.user.unit_id ?? undefined,");
  });

  it("toggleUserActive: createAuditLog usa targetUserToggle.unit_id, não ctx.user.unit_id", () => {
    const body = sliceProcedure("toggleUserActive", 3200);
    const auditBlockIdx = body.indexOf("await createAuditLog({");
    expect(auditBlockIdx).toBeGreaterThan(-1);
    const auditBlock = body.slice(auditBlockIdx, auditBlockIdx + 350);
    expect(auditBlock).toContain("unit_id:     targetUserToggle.unit_id ?? undefined,");
    expect(auditBlock).not.toContain("unit_id:     ctx.user.unit_id ?? undefined,");
  });

  it("setUserPermissions: grava UMA entrada de audit_log POR unidade afetada (loop sobre unit_id únicos do payload), não uma entrada genérica com a unidade do ator", () => {
    const body = sliceProcedure("setUserPermissions", 4600);
    expect(body).toContain("const affectedUnitIds = Array.from(new Set(input.permissions.map((p) => p.unit_id)));");
    expect(body).toContain("for (const affectedUnitId of affectedUnitIds) {");
    const loopIdx = body.indexOf("for (const affectedUnitId of affectedUnitIds) {");
    const loopBody = body.slice(loopIdx, loopIdx + 300);
    expect(loopBody).toContain("unit_id: affectedUnitId,");
    expect(loopBody).not.toContain("unit_id: ctx.user.unit_id ?? undefined,");
  });
});

describe("server/routers/admin.ts — bloqueio explícito de papel-alvo admin_master/unit_admin (Achado 5)", () => {
  const FORBIDDEN_MESSAGE = "Unit admin não pode gerenciar contas de administradores (master ou unit_admin)";

  it("setUserPermissions bloqueia explicitamente alvo admin_master/unit_admin (não depende só de assertUnitAdminCanManageTargetUser)", () => {
    const body = sliceProcedure("setUserPermissions", 4000);
    expect(body).toContain("if (targetUserSUP.role === 'admin_master' || targetUserSUP.role === 'unit_admin') {");
    const blockIdx = body.indexOf("if (targetUserSUP.role === 'admin_master' || targetUserSUP.role === 'unit_admin') {");
    const block = body.slice(blockIdx, blockIdx + 300);
    expect(block).toContain(FORBIDDEN_MESSAGE);
    // A checagem explícita precisa vir ANTES (ou pelo menos estar presente
    // além d)e assertUnitAdminCanManageTargetUser, que por si só não cobre
    // este caso.
    expect(body.indexOf("if (targetUserSUP.role === 'admin_master'")).toBeLessThan(
      body.indexOf("await assertUnitAdminCanManageTargetUser("),
    );
  });

  it("removeUserUnitLink bloqueia explicitamente alvo admin_master/unit_admin", () => {
    const body = sliceProcedure("removeUserUnitLink", 2400);
    expect(body).toContain("if (targetUserRUL.role === 'admin_master' || targetUserRUL.role === 'unit_admin') {");
    const blockIdx = body.indexOf("if (targetUserRUL.role === 'admin_master' || targetUserRUL.role === 'unit_admin') {");
    const block = body.slice(blockIdx, blockIdx + 300);
    expect(block).toContain(FORBIDDEN_MESSAGE);
  });

  it("linkExistingUserToUnitGroup bloqueia explicitamente alvo admin_master/unit_admin", () => {
    const body = sliceProcedure("linkExistingUserToUnitGroup", 2800);
    expect(body).toContain("if (targetUser.role === 'admin_master' || targetUser.role === 'unit_admin') {");
    const blockIdx = body.indexOf("if (targetUser.role === 'admin_master' || targetUser.role === 'unit_admin') {");
    const block = body.slice(blockIdx, blockIdx + 300);
    expect(block).toContain(FORBIDDEN_MESSAGE);
  });
});
