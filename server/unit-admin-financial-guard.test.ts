/**
 * Regressão comportamental — guarda central contra unit_admin assumindo ou
 * restaurando acesso de responsável financeiro (Parecer técnico 2026-10-15,
 * Bloqueio 1 — "unit_admin ainda consegue assumir ou restaurar acesso de uma
 * conta financeira existente").
 *
 * O parecer exige, textualmente, 6 testes comportamentais com banco
 * simulado (não grep textual):
 *   1. unit_admin dentro do escopo não consegue atualizar senha/papel/status
 *      de uma conta cujo papel ATUAL é responsavel_financeiro;
 *   2. unit_admin não consegue promover uma conta comum PARA
 *      responsavel_financeiro;
 *   3. unit_admin não consegue administrar uma conta de papel comum que
 *      tenha vínculo em financial_responsible_users;
 *   4. cada negação ocorre ANTES de qualquer update/insert/delete/auditoria;
 *   5. admin_master continua podendo executar as alterações necessárias;
 *   6. conta clínica comum dentro do escopo continua editável por
 *      unit_admin.
 *
 * Este arquivo cobre esses 6 cenários diretamente contra as 5 rotas listadas
 * no parecer: admin.updateUser, admin.toggleUserActive,
 * admin.setUserPermissions, admin.removeUserUnitLink e
 * admin.linkExistingUserToUnitGroup — além de testes unitários da guarda
 * central (userHasFinancialResponsibleHistory /
 * assertUnitAdminCanManageTargetUser) em server/authorization.ts.
 *
 * `./db` é mockado por inteiro (nenhum acesso a banco real). getDb() devolve
 * um banco fake "table-aware": select/from reconhece a TABELA real importada
 * de drizzle/schema (comparação por referência, já que o schema não é
 * mockado) e devolve as linhas configuradas no estado do teste para aquela
 * tabela — a mesma simplificação (ignorar o conteúdo da condição WHERE) já
 * usada em admin-create-user-authorization.test.ts, documentada lá nos
 * mesmos termos. update/insert/delete e createAuditLog são espiados para
 * provar a ordem exigida pelo teste 4 do parecer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import {
  users as usersTable,
  financial_responsible_users as financialResponsibleUsersTable,
  audit_log as auditLogTable,
  user_unit_permissions as uupTable,
} from "../drizzle/schema";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const state = vi.hoisted(() => ({
  usersRows: [] as any[],
  financialLinkRows: [] as any[],
  auditLogRows: [] as any[],
  uupRows: [] as any[],
  updateCalls: [] as any[],
  insertCalls: [] as any[],
  deleteCalls: [] as any[],
  auditLogCalls: [] as any[],
  getUserUnitPermissionResult: null as unknown,
  groupPermissionsRows: [] as any[],
  setUserUnitPermissionsCalls: [] as any[],
}));

function resetState() {
  state.usersRows = [];
  state.financialLinkRows = [];
  state.auditLogRows = [];
  state.uupRows = [];
  state.updateCalls = [];
  state.insertCalls = [];
  state.deleteCalls = [];
  state.auditLogCalls = [];
  state.getUserUnitPermissionResult = null;
  state.groupPermissionsRows = [];
  state.setUserUnitPermissionsCalls = [];
}

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();

  function pickRows(table: unknown): any[] {
    if (table === usersTable) return state.usersRows;
    if (table === financialResponsibleUsersTable) return state.financialLinkRows;
    if (table === auditLogTable) return state.auditLogRows;
    if (table === uupTable) return state.uupRows;
    return [];
  }

  function makeAwaitableRows(rows: any[]) {
    const p: any = Promise.resolve(rows);
    p.limit = (_n: number) => Promise.resolve(rows.slice(0, _n));
    return p;
  }

  const fakeDb = {
    select: (_cols?: unknown) => ({
      from: (table: unknown) => ({
        where: (_cond: unknown) => makeAwaitableRows(pickRows(table)),
      }),
    }),
    update: (table: unknown) => ({
      set: (vals: unknown) => ({
        where: (_cond: unknown) => {
          state.updateCalls.push({ table, vals });
          return Promise.resolve();
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (vals: unknown) => {
        state.insertCalls.push({ table, vals });
        return Promise.resolve();
      },
    }),
    delete: (table: unknown) => ({
      where: (_cond: unknown) => {
        state.deleteCalls.push({ table });
        return Promise.resolve();
      },
    }),
    selectDistinct: (_cols?: unknown) => ({
      from: (table: unknown) => ({
        where: (_cond: unknown) => makeAwaitableRows(pickRows(table)),
      }),
    }),
  };

  return {
    ...original,
    getDb: vi.fn(async () => fakeDb),
    getUserUnitPermission: vi.fn(async (_userId: number, _unitId: number) => state.getUserUnitPermissionResult),
    getUserUnitPermissions: vi.fn(async (_userId: number) => state.uupRows),
    setUserUnitPermissions: vi.fn(async (userId: number, permissions: any[]) => {
      state.setUserUnitPermissionsCalls.push({ userId, permissions });
    }),
    getGroupPermissions: vi.fn(async () => state.groupPermissionsRows),
    createAuditLog: vi.fn(async (log: any) => {
      state.auditLogCalls.push(log);
    }),
  };
});

import { appRouter } from "./routers";
import { userHasFinancialResponsibleHistory, assertUnitAdminCanManageTargetUser } from "./authorization";

function createCtx(overrides: Partial<AuthenticatedUser> & { unit_id?: number | null }): TrpcContext {
  const user: AuthenticatedUser = {
    id: overrides.id ?? 10,
    openId: overrides.openId ?? "test-admin",
    email: overrides.email ?? "admin@pacs.com",
    name: overrides.name ?? "Admin Teste",
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
    req: { protocol: "https", headers: { "user-agent": "vitest" }, ip: "127.0.0.1" } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  };
}

const UNIT_A = 20;
const UNIT_ADMIN_ID = 50;
const TARGET_ID = 99;

function unitAdminCtx() {
  return createCtx({ id: UNIT_ADMIN_ID, role: "unit_admin", unit_id: UNIT_A });
}
function adminMasterCtx() {
  return createCtx({ id: 1, role: "admin_master", unit_id: null });
}

function expectNoWriteHappened() {
  expect(state.updateCalls).toHaveLength(0);
  expect(state.insertCalls).toHaveLength(0);
  expect(state.deleteCalls).toHaveLength(0);
  expect(state.auditLogCalls).toHaveLength(0);
  expect(state.setUserUnitPermissionsCalls).toHaveLength(0);
}

beforeEach(() => {
  resetState();
});

describe("server/authorization.ts — userHasFinancialResponsibleHistory", () => {
  it("retorna false quando não há vínculo ativo nem histórico", async () => {
    state.financialLinkRows = [];
    state.auditLogRows = [];
    await expect(userHasFinancialResponsibleHistory(TARGET_ID)).resolves.toBe(false);
  });

  it("retorna true quando há vínculo ATIVO em financial_responsible_users", async () => {
    state.financialLinkRows = [{ id: 1, financial_responsible_id: 7, user_id: TARGET_ID }];
    state.auditLogRows = [];
    await expect(userHasFinancialResponsibleHistory(TARGET_ID)).resolves.toBe(true);
  });

  // Parecer de revisão 2026-10-15 (2ª rodada): o formato real gravado por
  // createUserTransactional e linkUserToResponsible (server/db.ts) é
  // target_type='FINANCIAL_RESPONSIBLE_USER', target_id=`${responsibleId}:${userId}`
  // (dois IDs, nunca um) e metadata={ financial_responsible_id, user_id, ... }.
  // NUNCA target_type='USER'/target_id=String(userId) — esse formato não
  // existe em nenhuma gravação real do sistema.
  it("1. retorna true quando NÃO há vínculo ativo mas existe GRANT_FINANCIAL_RESPONSIBLE_ACCESS histórico real (target_type='FINANCIAL_RESPONSIBLE_USER', metadata.user_id=alvo) — vínculo revogado via DELETE", async () => {
    state.financialLinkRows = [];
    state.auditLogRows = [
      {
        id: 1,
        action: "GRANT_FINANCIAL_RESPONSIBLE_ACCESS",
        target_type: "FINANCIAL_RESPONSIBLE_USER",
        target_id: `7:${TARGET_ID}`,
        metadata: { financial_responsible_id: 7, user_id: TARGET_ID },
      },
    ];
    await expect(userHasFinancialResponsibleHistory(TARGET_ID)).resolves.toBe(true);
  });

  it("2. um registro com o formato real mas metadata.user_id de OUTRO usuário não bloqueia o alvo errado", async () => {
    const OTHER_USER_ID = TARGET_ID + 1;
    state.financialLinkRows = [];
    state.auditLogRows = [
      {
        id: 1,
        action: "GRANT_FINANCIAL_RESPONSIBLE_ACCESS",
        target_type: "FINANCIAL_RESPONSIBLE_USER",
        target_id: `7:${OTHER_USER_ID}`,
        metadata: { financial_responsible_id: 7, user_id: OTHER_USER_ID },
      },
    ];
    await expect(userHasFinancialResponsibleHistory(TARGET_ID)).resolves.toBe(false);
  });

  it("3. um registro LEGADO/incompatível (target_type='USER', target_id=String(userId), sem metadata.user_id) não é assumido como prova de vínculo financeiro — formato que nenhuma gravação real usa, sem decisão explícita de compatibilidade", async () => {
    state.financialLinkRows = [];
    state.auditLogRows = [
      { id: 1, action: "GRANT_FINANCIAL_RESPONSIBLE_ACCESS", target_type: "USER", target_id: String(TARGET_ID) },
    ];
    await expect(userHasFinancialResponsibleHistory(TARGET_ID)).resolves.toBe(false);
  });

  it("não usa o target_id composto (\"responsibleId:userId\") como string isolada — um target_id que meramente TERMINA com o id do alvo (ex.: id 7 dentro de 17) não pode combinar por coincidência de substring", async () => {
    // Vínculo histórico real pertence ao usuário 17, não ao usuário 7.
    state.financialLinkRows = [];
    state.auditLogRows = [
      {
        id: 1,
        action: "GRANT_FINANCIAL_RESPONSIBLE_ACCESS",
        target_type: "FINANCIAL_RESPONSIBLE_USER",
        target_id: "1:17",
        metadata: { financial_responsible_id: 1, user_id: 17 },
      },
    ];
    await expect(userHasFinancialResponsibleHistory(7)).resolves.toBe(false);
  });
});

describe("server/authorization.ts — assertUnitAdminCanManageTargetUser", () => {
  it("nunca bloqueia quando o ator é admin_master (no-op)", async () => {
    state.financialLinkRows = [{ id: 1, financial_responsible_id: 7, user_id: TARGET_ID }];
    await expect(
      assertUnitAdminCanManageTargetUser(
        { id: 1, role: "admin_master", unit_id: null },
        { id: TARGET_ID, role: "responsavel_financeiro" },
        { newRole: "responsavel_financeiro" }
      )
    ).resolves.toBeUndefined();
  });

  it("bloqueia unit_admin quando o papel ATUAL do alvo é responsavel_financeiro", async () => {
    await expect(
      assertUnitAdminCanManageTargetUser(
        { id: UNIT_ADMIN_ID, role: "unit_admin", unit_id: UNIT_A },
        { id: TARGET_ID, role: "responsavel_financeiro" }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("bloqueia unit_admin quando a mudança solicitada promove o alvo PARA responsavel_financeiro", async () => {
    await expect(
      assertUnitAdminCanManageTargetUser(
        { id: UNIT_ADMIN_ID, role: "unit_admin", unit_id: UNIT_A },
        { id: TARGET_ID, role: "medico" },
        { newRole: "responsavel_financeiro" }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("bloqueia unit_admin quando o alvo tem papel comum mas vínculo (ativo ou histórico) em financial_responsible_users", async () => {
    state.financialLinkRows = [{ id: 1, financial_responsible_id: 7, user_id: TARGET_ID }];
    await expect(
      assertUnitAdminCanManageTargetUser(
        { id: UNIT_ADMIN_ID, role: "unit_admin", unit_id: UNIT_A },
        { id: TARGET_ID, role: "medico" }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("permite unit_admin administrar uma conta clínica comum sem qualquer vínculo financeiro", async () => {
    state.financialLinkRows = [];
    state.auditLogRows = [];
    await expect(
      assertUnitAdminCanManageTargetUser(
        { id: UNIT_ADMIN_ID, role: "unit_admin", unit_id: UNIT_A },
        { id: TARGET_ID, role: "medico" }
      )
    ).resolves.toBeUndefined();
  });
});

describe("admin.updateUser — Bloqueio 1 (testes 1, 2, 4, 5, 6 do parecer)", () => {
  it("1. unit_admin dentro do escopo NÃO consegue atualizar senha/papel/status de conta cujo papel ATUAL é responsavel_financeiro", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "responsavel_financeiro", unit_id: UNIT_A, isActive: true }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.updateUser({ id: TARGET_ID, password: "novaSenha123" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWriteHappened();
  });

  it("2. unit_admin dentro do escopo NÃO consegue promover uma conta comum PARA responsavel_financeiro", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "medico", unit_id: UNIT_A, isActive: true }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.updateUser({ id: TARGET_ID, role: "responsavel_financeiro" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWriteHappened();
  });

  it("3. unit_admin NÃO consegue administrar conta de papel comum com vínculo em financial_responsible_users", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "medico", unit_id: UNIT_A, isActive: true }];
    state.financialLinkRows = [{ id: 1, financial_responsible_id: 7, user_id: TARGET_ID }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.updateUser({ id: TARGET_ID, name: "Novo Nome" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWriteHappened();
  });

  it("5. admin_master CONTINUA podendo promover/editar qualquer conta, incluindo responsavel_financeiro", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "responsavel_financeiro", unit_id: UNIT_A, isActive: true }];
    const caller = appRouter.createCaller(adminMasterCtx());
    await expect(
      caller.admin.updateUser({ id: TARGET_ID, name: "Atualizado" })
    ).resolves.toMatchObject({ success: true });
    expect(state.updateCalls).toHaveLength(1);
    expect(state.auditLogCalls).toHaveLength(1);
  });

  it("6. conta clínica comum dentro do escopo CONTINUA editável por unit_admin", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "medico", unit_id: UNIT_A, isActive: true }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.updateUser({ id: TARGET_ID, name: "Dr. Atualizado" })
    ).resolves.toMatchObject({ success: true });
    expect(state.updateCalls).toHaveLength(1);
    expect(state.auditLogCalls).toHaveLength(1);
  });
});

describe("admin.toggleUserActive — Bloqueio 1", () => {
  it("unit_admin NÃO consegue reativar/desativar conta cujo papel atual é responsavel_financeiro", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "responsavel_financeiro", unit_id: UNIT_A, isActive: false }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.toggleUserActive({ id: TARGET_ID, isActive: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWriteHappened();
  });

  it("unit_admin NÃO consegue alterar status de conta comum com vínculo financeiro HISTÓRICO (formato real: target_type='FINANCIAL_RESPONSIBLE_USER', metadata.user_id=alvo) — prova que nenhuma escrita ocorre antes do FORBIDDEN", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "viewer", unit_id: UNIT_A, isActive: true }];
    state.financialLinkRows = [];
    state.auditLogRows = [
      {
        id: 1,
        action: "GRANT_FINANCIAL_RESPONSIBLE_ACCESS",
        target_type: "FINANCIAL_RESPONSIBLE_USER",
        target_id: `7:${TARGET_ID}`,
        metadata: { financial_responsible_id: 7, user_id: TARGET_ID },
      },
    ];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.toggleUserActive({ id: TARGET_ID, isActive: false })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWriteHappened();
  });

  it("admin_master continua podendo reativar uma conta de responsável financeiro", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "responsavel_financeiro", unit_id: UNIT_A, isActive: false }];
    const caller = appRouter.createCaller(adminMasterCtx());
    await expect(
      caller.admin.toggleUserActive({ id: TARGET_ID, isActive: true })
    ).resolves.toMatchObject({ success: true });
    expect(state.updateCalls).toHaveLength(1);
  });

  it("conta clínica comum dentro do escopo continua tendo status editável por unit_admin", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "operador", unit_id: UNIT_A, isActive: true }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.toggleUserActive({ id: TARGET_ID, isActive: false })
    ).resolves.toMatchObject({ success: true });
    expect(state.updateCalls).toHaveLength(1);
  });
});

describe("admin.setUserPermissions — Bloqueio 1 (rota não carregava o papel do alvo)", () => {
  it("unit_admin NÃO consegue alterar permissões de uma conta cujo papel atual é responsavel_financeiro", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "responsavel_financeiro", unit_id: UNIT_A }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.setUserPermissions({
        userId: TARGET_ID,
        permissions: [{ unit_id: UNIT_A, view_studies: true, edit_reports: false, view_anamnesis: false, edit_anamnesis: false, edit_exam_legend: false, print_reports: false, manage_templates: false, view_financial: true }],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWriteHappened();
  });

  it("unit_admin NÃO consegue alterar permissões (inclusive view_financial) de conta comum com vínculo financeiro ativo", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "viewer", unit_id: UNIT_A }];
    state.financialLinkRows = [{ id: 1, financial_responsible_id: 7, user_id: TARGET_ID }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.setUserPermissions({
        userId: TARGET_ID,
        permissions: [{ unit_id: UNIT_A, view_studies: true, edit_reports: false, view_anamnesis: false, edit_anamnesis: false, edit_exam_legend: false, print_reports: false, manage_templates: false, view_financial: true }],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWriteHappened();
  });

  it("admin_master continua podendo alterar permissões de uma conta de responsável financeiro", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "responsavel_financeiro", unit_id: UNIT_A }];
    const caller = appRouter.createCaller(adminMasterCtx());
    await expect(
      caller.admin.setUserPermissions({
        userId: TARGET_ID,
        permissions: [{ unit_id: UNIT_A, view_studies: true, edit_reports: false, view_anamnesis: false, edit_anamnesis: false, edit_exam_legend: false, print_reports: false, manage_templates: false, view_financial: true }],
      })
    ).resolves.toMatchObject({ success: true });
    expect(state.setUserUnitPermissionsCalls).toHaveLength(1);
  });

  it("conta clínica comum dentro do escopo continua tendo permissões editáveis por unit_admin", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "medico", unit_id: UNIT_A }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.setUserPermissions({
        userId: TARGET_ID,
        permissions: [{ unit_id: UNIT_A, view_studies: true, edit_reports: true, view_anamnesis: true, edit_anamnesis: true, edit_exam_legend: false, print_reports: true, manage_templates: false, view_financial: false }],
      })
    ).resolves.toMatchObject({ success: true });
    expect(state.setUserUnitPermissionsCalls).toHaveLength(1);
  });
});

describe("admin.removeUserUnitLink — Bloqueio 1 (rota não carregava o papel do alvo)", () => {
  it("unit_admin NÃO consegue remover/reconstruir vínculo de unidade de uma conta cujo papel atual é responsavel_financeiro", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "responsavel_financeiro", unit_id: UNIT_A }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.removeUserUnitLink({ userId: TARGET_ID, unitId: UNIT_A })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWriteHappened();
  });

  it("unit_admin NÃO consegue remover vínculo de unidade de conta comum com histórico financeiro (formato real)", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "atendente", unit_id: UNIT_A }];
    state.auditLogRows = [
      {
        id: 1,
        action: "GRANT_FINANCIAL_RESPONSIBLE_ACCESS",
        target_type: "FINANCIAL_RESPONSIBLE_USER",
        target_id: `7:${TARGET_ID}`,
        metadata: { financial_responsible_id: 7, user_id: TARGET_ID },
      },
    ];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.removeUserUnitLink({ userId: TARGET_ID, unitId: UNIT_A })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWriteHappened();
  });

  it("admin_master continua podendo remover vínculo de unidade de uma conta de responsável financeiro", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "responsavel_financeiro", unit_id: UNIT_A }];
    const caller = appRouter.createCaller(adminMasterCtx());
    await expect(
      caller.admin.removeUserUnitLink({ userId: TARGET_ID, unitId: UNIT_A })
    ).resolves.toMatchObject({ success: true });
    expect(state.deleteCalls).toHaveLength(1);
  });

  it("conta clínica comum dentro do escopo continua tendo vínculo de unidade removível por unit_admin", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "operador", unit_id: UNIT_A }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.removeUserUnitLink({ userId: TARGET_ID, unitId: UNIT_A })
    ).resolves.toMatchObject({ success: true });
    expect(state.deleteCalls).toHaveLength(1);
  });
});

describe("admin.linkExistingUserToUnitGroup — Bloqueio 1", () => {
  it("unit_admin NÃO consegue conceder o groupKey 'responsaveisFinanceiros' a ninguém", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "medico", unit_id: UNIT_A }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.linkExistingUserToUnitGroup({ userId: TARGET_ID, unitId: UNIT_A, groupKey: "responsaveisFinanceiros" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWriteHappened();
  });

  it("unit_admin NÃO consegue alterar o groupKey de uma conta cujo papel atual é responsavel_financeiro, mesmo pedindo outro groupKey", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "responsavel_financeiro", unit_id: UNIT_A }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.linkExistingUserToUnitGroup({ userId: TARGET_ID, unitId: UNIT_A, groupKey: "medicos" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWriteHappened();
  });

  it("unit_admin NÃO consegue alterar o groupKey de uma conta comum com vínculo financeiro ativo", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "viewer", unit_id: UNIT_A }];
    state.financialLinkRows = [{ id: 1, financial_responsible_id: 7, user_id: TARGET_ID }];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.linkExistingUserToUnitGroup({ userId: TARGET_ID, unitId: UNIT_A, groupKey: "operadores" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWriteHappened();
  });

  it("admin_master continua podendo conceder 'responsaveisFinanceiros' normalmente", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "responsavel_financeiro", unit_id: UNIT_A }];
    state.uupRows = [];
    const caller = appRouter.createCaller(adminMasterCtx());
    await expect(
      caller.admin.linkExistingUserToUnitGroup({ userId: TARGET_ID, unitId: UNIT_A, groupKey: "responsaveisFinanceiros" })
    ).resolves.toMatchObject({ success: true });
    expect(state.insertCalls).toHaveLength(1);
  });

  it("conta clínica comum dentro do escopo continua tendo groupKey editável por unit_admin", async () => {
    state.usersRows = [{ id: TARGET_ID, role: "medico", unit_id: UNIT_A }];
    state.uupRows = [];
    const caller = appRouter.createCaller(unitAdminCtx());
    await expect(
      caller.admin.linkExistingUserToUnitGroup({ userId: TARGET_ID, unitId: UNIT_A, groupKey: "medicos" })
    ).resolves.toMatchObject({ success: true });
    expect(state.insertCalls).toHaveLength(1);
  });
});
