/**
 * Regressão comportamental (achado 2026-10-14, orientações da Manus em
 * ORIENTACOES_BRANCH_CORRECAO_ESCOPO_REMOVEDOCTOR_2026-10-14.txt).
 *
 * Cobre o cenário A–I pedido pela Manus: units.removeDoctor, units.listDoctors
 * e units.listAllDoctors agora exigem que um unit_admin tenha escopo
 * (unit_id legado OU vínculo em user_unit_permissions) sobre a unidade
 * informada no input, e nenhuma consulta adicional (select de médicos,
 * DELETE, INSERT, createAuditLog) é executada quando a guarda nega.
 *
 * Mocka toda a camada de banco (./db) e usa appRouter.createCaller, sem
 * tocar banco, storage ou rede em nenhum ambiente. As tabelas drizzle são
 * importadas aqui e comparadas por referência de módulo com as mesmas
 * tabelas importadas dinamicamente dentro de server/routers/units.ts —
 * ambas resolvem para a mesma instância de módulo ESM em runtime de teste.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { user_unit_permissions, users } from "../drizzle/schema";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const state = vi.hoisted(() => ({
  getUserUnitPermissionCalls: [] as { userId: number; unitId: number }[],
  getUserUnitPermissionResult: null as unknown,
  userUnitPermissionRows: [] as { user_id: number }[],
  medicoUsersRows: [] as any[],
  selectUserUnitPermissionsCalls: 0,
  selectUsersCalls: 0,
  deleteCalls: [] as { table: unknown; cond: unknown }[],
  insertCalls: [] as { table: unknown; vals: unknown }[],
  createAuditLogCalls: [] as any[],
}));

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getUserUnitPermission: vi.fn(async (userId: number, unitId: number) => {
      state.getUserUnitPermissionCalls.push({ userId, unitId });
      return state.getUserUnitPermissionResult;
    }),
    createAuditLog: vi.fn(async (log: unknown) => {
      state.createAuditLogCalls.push(log);
    }),
    getDb: vi.fn(async () => ({
      select: (_cols: unknown) => ({
        from: (table: unknown) => ({
          where: (_cond: unknown) => {
            if (table === user_unit_permissions) {
              state.selectUserUnitPermissionsCalls += 1;
              return Promise.resolve(state.userUnitPermissionRows);
            }
            if (table === users) {
              state.selectUsersCalls += 1;
              return Promise.resolve(state.medicoUsersRows);
            }
            return Promise.resolve([]);
          },
        }),
      }),
      delete: (table: unknown) => ({
        where: (cond: unknown) => {
          state.deleteCalls.push({ table, cond });
          return Promise.resolve();
        },
      }),
      insert: (table: unknown) => ({
        values: (vals: unknown) => {
          state.insertCalls.push({ table, vals });
          return Promise.resolve();
        },
      }),
    })),
  };
});

function createContext(overrides: Partial<AuthenticatedUser> & { unit_id?: number | null }): TrpcContext {
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
    } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  state.getUserUnitPermissionCalls = [];
  state.getUserUnitPermissionResult = null;
  state.userUnitPermissionRows = [];
  state.medicoUsersRows = [];
  state.selectUserUnitPermissionsCalls = 0;
  state.selectUsersCalls = 0;
  state.deleteCalls = [];
  state.insertCalls = [];
  state.createAuditLogCalls = [];
  vi.clearAllMocks();
});

describe("units — escopo administrativo de unit_admin para gestão de médicos", () => {
  // A — NEGATIVO: removeDoctor fora do escopo
  it("removeDoctor: unit_admin da Unidade 10 não pode remover médico da Unidade 20 sem vínculo", async () => {
    state.getUserUnitPermissionResult = null; // sem vínculo adicional na Unidade 20
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 7, role: "unit_admin", unit_id: 10 });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.units.removeDoctor({ unitId: 20, doctorUserId: 200 })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Unit admin não tem acesso a esta unidade",
    });

    expect(state.deleteCalls).toHaveLength(0);
    expect(state.createAuditLogCalls).toHaveLength(0);
  });

  // B — POSITIVO: removeDoctor na unidade própria legada
  it("removeDoctor: unit_admin remove vínculo na própria unidade legada (unit_id)", async () => {
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 7, role: "unit_admin", unit_id: 10 });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.units.removeDoctor({ unitId: 10, doctorUserId: 200 });

    expect(result).toEqual({ success: true });
    expect(state.deleteCalls).toHaveLength(1);
    expect(state.deleteCalls[0].table).toBe(user_unit_permissions);
    expect(state.createAuditLogCalls).toHaveLength(1);
    expect(state.createAuditLogCalls[0]).toMatchObject({ unit_id: 10, action: "UPDATE_UNIT", target_id: "200" });
    // unit_id legado bate com input.unitId: a guarda não precisa consultar user_unit_permissions
    expect(state.getUserUnitPermissionCalls).toHaveLength(0);
  });

  // C — POSITIVO: removeDoctor em unidade adicional permitida (multiunidade)
  it("removeDoctor: unit_admin sem unit_id legado na unidade, mas com vínculo multiunidade, consegue remover", async () => {
    state.getUserUnitPermissionResult = { id: 55, unit_id: 20 };
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 7, role: "unit_admin", unit_id: null });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.units.removeDoctor({ unitId: 20, doctorUserId: 200 });

    expect(result).toEqual({ success: true });
    expect(state.deleteCalls).toHaveLength(1);
    expect(state.getUserUnitPermissionCalls).toEqual([{ userId: 7, unitId: 20 }]);
  });

  // D — POSITIVO: admin_master
  it("removeDoctor: admin_master remove vínculo em qualquer unidade sem depender de getUserUnitPermission", async () => {
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 1, role: "admin_master", unit_id: null });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.units.removeDoctor({ unitId: 999, doctorUserId: 200 });

    expect(result).toEqual({ success: true });
    expect(state.deleteCalls).toHaveLength(1);
    expect(state.getUserUnitPermissionCalls).toHaveLength(0);
  });

  // E — NEGATIVO: listDoctors fora do escopo
  it("listDoctors: unit_admin sem vínculo com a Unidade 20 recebe FORBIDDEN e nenhuma consulta de médicos é iniciada", async () => {
    state.getUserUnitPermissionResult = null;
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 7, role: "unit_admin", unit_id: 10 });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.units.listDoctors({ unitId: 20 })
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Unit admin não tem acesso a esta unidade" });

    expect(state.selectUserUnitPermissionsCalls).toBe(0);
    expect(state.selectUsersCalls).toBe(0);
  });

  // F — NEGATIVO: listAllDoctors fora do escopo
  it("listAllDoctors: unit_admin sem vínculo com a Unidade 20 recebe FORBIDDEN e nenhuma consulta global é iniciada", async () => {
    state.getUserUnitPermissionResult = null;
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 7, role: "unit_admin", unit_id: 10 });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.units.listAllDoctors({ unitId: 20 })
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Unit admin não tem acesso a esta unidade" });

    expect(state.selectUsersCalls).toBe(0);
  });

  // G — POSITIVO: listAllDoctors no escopo, inclui médicos ainda não vinculados
  it("listAllDoctors: unit_admin autorizado para a Unidade 10 recebe a lista completa de médicos disponíveis", async () => {
    state.medicoUsersRows = [
      { id: 300, name: "Dra. Ana", username: "ana", role: "medico", isActive: true, crm: "CRM1" },
      { id: 301, name: "Dr. Bruno", username: "bruno", role: "medico", isActive: true, crm: "CRM2" },
    ];
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 7, role: "unit_admin", unit_id: 10 });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.units.listAllDoctors({ unitId: 10 });

    expect(result).toEqual(state.medicoUsersRows);
    expect(state.selectUsersCalls).toBe(1);
  });

  // I — REGRESSÃO addDoctor: continua recusando fora do escopo e permitindo próprio/multiunidade
  it("addDoctor: continua recusando unidade fora do escopo do unit_admin", async () => {
    state.getUserUnitPermissionResult = null;
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 7, role: "unit_admin", unit_id: 10 });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.units.addDoctor({ unitId: 20, doctorUserId: 200 })
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Unit admin não tem acesso a esta unidade" });

    expect(state.insertCalls).toHaveLength(0);
    expect(state.createAuditLogCalls).toHaveLength(0);
  });

  it("addDoctor: continua permitindo vincular médico na própria unidade legada", async () => {
    state.userUnitPermissionRows = []; // sem vínculo existente -> segue para insert
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 7, role: "unit_admin", unit_id: 10 });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.units.addDoctor({ unitId: 10, doctorUserId: 200 });

    expect(result).toEqual({ success: true, alreadyLinked: false });
    expect(state.insertCalls).toHaveLength(1);
    expect(state.insertCalls[0].table).toBe(user_unit_permissions);
  });

  it("addDoctor: continua permitindo vincular médico em unidade multiunidade autorizada", async () => {
    state.getUserUnitPermissionResult = { id: 55, unit_id: 20 };
    state.userUnitPermissionRows = [];
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 7, role: "unit_admin", unit_id: null });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.units.addDoctor({ unitId: 20, doctorUserId: 200 });

    expect(result).toEqual({ success: true, alreadyLinked: false });
    expect(state.insertCalls).toHaveLength(1);
  });

  it("não-admin_master/unit_admin recebe FORBIDDEN em removeDoctor/listDoctors/listAllDoctors, sem nenhuma consulta", async () => {
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 9, role: "medico", unit_id: 10 });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.units.removeDoctor({ unitId: 10, doctorUserId: 200 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.units.listDoctors({ unitId: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.units.listAllDoctors({ unitId: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(state.deleteCalls).toHaveLength(0);
    expect(state.selectUserUnitPermissionsCalls).toBe(0);
    expect(state.selectUsersCalls).toBe(0);
  });
});

describe("cliente — UnitDoctorsTab chama listAllDoctors com { unitId }", () => {
  it("H — a chamada trpc.units.listAllDoctors.useQuery recebe { unitId }, não mais vazia", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("../client/src/components/UnitDoctorsTab.tsx", import.meta.url),
      "utf-8",
    );
    expect(source).toContain("trpc.units.listAllDoctors.useQuery(");
    expect(source).not.toMatch(/trpc\.units\.listAllDoctors\.useQuery\(\s*\)/);
    expect(source).toMatch(/trpc\.units\.listAllDoctors\.useQuery\(\s*\{\s*unitId\s*\}/);
  });
});
