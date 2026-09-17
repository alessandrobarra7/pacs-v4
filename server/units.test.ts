/**
 * Regressão (solicitação técnica "isolamento de testes VM1", 2026-09-17):
 * esta suíte importava `appRouter` sem nenhum mock de `./db`, então em qualquer
 * ambiente com DATABASE_URL configurado (como a VM1, diferente do sandbox) ela
 * deixava de ser um teste de contrato de autorização e virava, na prática, uma
 * integração contra o banco real — inclusive com um cenário de criação que, se o
 * banco estivesse disponível, inseria de verdade uma "Test Unit" em produção, e
 * escondia esse resultado (e qualquer outro erro, incluindo erro de schema) atrás
 * de um try/catch que aceitava sucesso OU falha como aprovação. Reescrita para
 * mockar toda a camada de banco e storage antes de importar o router, então os
 * três cenários testam só o contrato de `units.list`/`units.create` (quem pode
 * ver o quê, quem pode criar, com quais dados), sem tocar banco, storage ou rede
 * em nenhum ambiente.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const state = vi.hoisted(() => ({
  allUnits: [] as any[],
  unitById: new Map<number, any>(),
  userUnitPermissions: [] as { unit_id: number }[],
  createUnitCalls: [] as any[],
  createUnitResult: 0,
  createAuditLogCalls: [] as any[],
}));

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getAllUnits: vi.fn(async () => state.allUnits),
    getUnitById: vi.fn(async (id: number) => state.unitById.get(id)),
    getUserUnitPermissions: vi.fn(async () => state.userUnitPermissions),
    createUnit: vi.fn(async (unit: unknown) => {
      state.createUnitCalls.push(unit);
      return state.createUnitResult;
    }),
    createAuditLog: vi.fn(async (log: unknown) => {
      state.createAuditLogCalls.push(log);
    }),
  };
});

// units.list resolve a logo de cada unidade via storage; nenhum fixture deste
// arquivo usa logo_url, mas mockamos assim mesmo para garantir que nenhum
// cenário futuro passe a chamar storage/rede de verdade sem que o teste avise.
vi.mock("./storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("./storage")>();
  return {
    ...original,
    storageGetUrl: vi.fn(async () => {
      throw new Error("units.test.ts não deveria chamar storage — nenhum fixture usa logo_url.");
    }),
  };
});

function createContext(overrides: Partial<AuthenticatedUser> & { unit_id?: number | null }): TrpcContext {
  const user: AuthenticatedUser = {
    id: overrides.id ?? 1,
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
      headers: {},
      ip: "127.0.0.1",
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

describe("units router", () => {
  beforeEach(() => {
    state.allUnits = [];
    state.unitById = new Map();
    state.userUnitPermissions = [];
    state.createUnitCalls = [];
    state.createUnitResult = 0;
    state.createAuditLogCalls = [];
    vi.clearAllMocks();
  });

  it("admin_master can list all units", async () => {
    state.allUnits = [
      { id: 1, name: "Unidade A", slug: "unidade-a", isActive: true },
      { id: 2, name: "Unidade B", slug: "unidade-b", isActive: true },
    ];
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 1, role: "admin_master", unit_id: null });
    const caller = appRouter.createCaller(ctx);

    const units = await caller.units.list();
    expect(units).toHaveLength(2);
    expect(units.map((u) => u.id)).toEqual([1, 2]);
  });

  it("unit user sem permissão granular só vê a própria unidade (fallback legado por unit_id)", async () => {
    state.userUnitPermissions = []; // sem linha em user_unit_permissions: cai no fallback legado
    state.unitById.set(1, { id: 1, name: "Unidade A", slug: "unidade-a", isActive: true });
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 2, role: "medico", unit_id: 1 });
    const caller = appRouter.createCaller(ctx);

    const units = await caller.units.list();
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ id: 1, name: "Unidade A" });
  });

  it("unit user com permissões granulares vê exatamente as unidades vinculadas, não todas", async () => {
    state.userUnitPermissions = [{ unit_id: 3 }];
    state.allUnits = [
      { id: 1, name: "Unidade A", slug: "unidade-a", isActive: true },
      { id: 3, name: "Unidade C", slug: "unidade-c", isActive: true },
    ];
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 5, role: "medico", unit_id: 1 });
    const caller = appRouter.createCaller(ctx);

    const units = await caller.units.list();
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ id: 3, name: "Unidade C" });
  });

  it("admin_master pode criar unidade; createUnit é chamado com os dados enviados", async () => {
    state.createUnitResult = 42;
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 1, role: "admin_master", unit_id: null });
    const caller = appRouter.createCaller(ctx);

    const payload = {
      name: "Unidade Nova",
      slug: "unidade-nova",
      pacs_ip: "10.0.0.50",
      pacs_port: 104,
      pacs_ae_title: "LAUDS_NOVA",
    };
    const result = await caller.units.create(payload);

    expect(result).toEqual({ id: 42 });
    expect(state.createUnitCalls).toHaveLength(1);
    expect(state.createUnitCalls[0]).toMatchObject(payload);
    expect(state.createAuditLogCalls).toHaveLength(1);
    expect(state.createAuditLogCalls[0]).toMatchObject({ action: "CREATE_UNIT", unit_id: 42 });
  });

  it("não-admin_master recebe FORBIDDEN ao tentar criar unidade, e createUnit nunca é chamado", async () => {
    const { appRouter } = await import("./routers");
    const ctx = createContext({ id: 6, role: "medico", unit_id: 1 });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.units.create({
        name: "Unidade Intrusa",
        slug: "unidade-intrusa",
        pacs_ip: "10.0.0.51",
        pacs_port: 104,
        pacs_ae_title: "LAUDS_INTRUSA",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.createUnitCalls).toHaveLength(0);
  });
});

describe("RBAC validation", () => {
  it("validates user roles correctly", () => {
    const adminUser = createContext({ id: 1, role: "admin_master", unit_id: null }).user;
    const unitUser = createContext({ id: 2, role: "medico", unit_id: 1 }).user;

    expect(adminUser?.role).toBe("admin_master");
    expect(unitUser?.role).toBe("medico");
    expect(unitUser?.unit_id).toBe(1);
  });
});
