/**
 * Regressão comportamental — admin.createUser (ACHADO_CRIACAO_USUARIOS_
 * FUNCAO_E_APARENCIA_2026-10-15, implementação do parecer técnico da Manus
 * "correção da criação de usuários").
 *
 * Cobre, no nível da PROCEDURE (autorização/escopo/coerência papel↔grupo),
 * os testes 1-6 e parte do 7 e do 9 do parecer:
 *   1. unit_admin cria médico na sua unidade legada.
 *   2. unit_admin cria operador em unidade concedida via user_unit_permissions.
 *   3. unit_admin tentando criar em unidade externa → FORBIDDEN, nenhuma
 *      escrita (createUserTransactional nunca chamado).
 *   4. unit_admin tentando criar unit_admin/admin_master → FORBIDDEN, nenhuma
 *      escrita.
 *   5. admin_master cria os papéis permitidos sem restrição de unidade,
 *      inclusive multiunidade.
 *   6. Combinação papel/grupo incoerente é rejeitada (BAD_REQUEST), nenhuma
 *      escrita.
 *   7. (parcial) as permissões enviadas para createUserTransactional vêm do
 *      banco (getGroupPermissions), não da constante hardcoded, quando o
 *      banco tem config para o grupo.
 *   9. (parcial) username duplicado detectado pela checagem prévia de
 *      createUserTransactional (UsernameTakenError) vira TRPCError CONFLICT
 *      com mensagem legível. O caso de violação REAL do índice único (sem
 *      passar pela checagem prévia) é coberto a nível de server/db.ts em
 *      create-user-transactional.test.ts.
 *
 * `./db` é mockado por inteiro — nada toca banco real. createUserTransactional
 * é espiado para provar tanto SUCESSO (payload exato enviado) quanto
 * ausência de chamada nos casos negados.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const { state, FakeUsernameTakenError, FakeMixedFinancialResponsiblesError } = vi.hoisted(() => {
  class FakeUsernameTakenError extends Error {
    constructor() {
      super("USERNAME_TAKEN");
      this.name = "UsernameTakenError";
    }
  }
  class FakeMixedFinancialResponsiblesError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "MixedFinancialResponsiblesError";
    }
  }
  return {
    FakeUsernameTakenError,
    FakeMixedFinancialResponsiblesError,
    state: {
      getUserUnitPermissionResult: null as unknown,
      groupPermissionsRows: [] as any[],
      createUserTransactionalCalls: [] as any[],
      createUserTransactionalResult: { id: 4242 } as { id: number },
      createUserTransactionalShouldThrow: null as Error | null,
      // Reforço 5.1 (parecer corretivo 2026-10-15): admin.createUser agora
      // confirma que toda unidade existe (select em `units`) antes de
      // prosseguir. Este fake NÃO reconstrói a condição WHERE (mesma
      // simplificação já documentada em outros testes desta suíte) — ele
      // apenas devolve esta lista canônica de unidades "existentes" para
      // qualquer chamada. Cobre os IDs usados por todos os testes deste
      // arquivo (1, 2, 3, 20, 30); o teste dedicado de NOT_FOUND troca esta
      // lista temporariamente para simular um ID ausente.
      existingUnitRows: [1, 2, 3, 20, 30].map((id) => ({ id })) as { id: number }[],
    },
  };
});

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    UsernameTakenError: FakeUsernameTakenError,
    MixedFinancialResponsiblesError: FakeMixedFinancialResponsiblesError,
    getUserUnitPermission: vi.fn(async (_userId: number, _unitId: number) => state.getUserUnitPermissionResult),
    getGroupPermissions: vi.fn(async () => state.groupPermissionsRows),
    createUserTransactional: vi.fn(async (input: any) => {
      state.createUserTransactionalCalls.push(input);
      if (state.createUserTransactionalShouldThrow) throw state.createUserTransactionalShouldThrow;
      return state.createUserTransactionalResult;
    }),
    getDb: vi.fn(async () => ({
      select: (_cols: unknown) => ({
        from: (_table: unknown) => ({
          where: (_cond: unknown) => Promise.resolve(state.existingUnitRows),
        }),
      }),
    })),
  };
});

import { appRouter } from "./routers";

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

const basePayload = {
  username: "novo.usuario",
  name: "Novo Usuário",
  password: "senha123456",
};

beforeEach(() => {
  state.getUserUnitPermissionResult = null;
  state.groupPermissionsRows = [];
  state.createUserTransactionalCalls = [];
  state.createUserTransactionalResult = { id: 4242 };
  state.createUserTransactionalShouldThrow = null;
  state.existingUnitRows = [1, 2, 3, 20, 30].map((id) => ({ id }));
});

describe("admin.createUser — autorização e escopo (testes 1-6 do parecer Manus)", () => {
  it("1. unit_admin cria médico na sua unidade legada (unit_id)", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "unit_admin", unit_id: 20 }));
    const result = await caller.admin.createUser({
      ...basePayload,
      role: "medico",
      groupKey: "medicos",
      unitIds: [20],
    } as any);
    expect(result).toEqual({ success: true, id: 4242 });
    expect(state.createUserTransactionalCalls).toHaveLength(1);
    expect(state.createUserTransactionalCalls[0]).toMatchObject({
      role: "medico",
      groupKey: "medicos",
      unitIds: [20],
    });
  });

  it("2. unit_admin cria operador em unidade concedida via user_unit_permissions (não a legada)", async () => {
    state.getUserUnitPermissionResult = { user_id: 10, unit_id: 30, view_studies: true };
    const caller = appRouter.createCaller(createCtx({ role: "unit_admin", unit_id: 20 }));
    const result = await caller.admin.createUser({
      ...basePayload,
      role: "operador",
      groupKey: "operadores",
      unitIds: [30],
    } as any);
    expect(result).toEqual({ success: true, id: 4242 });
    expect(state.createUserTransactionalCalls).toHaveLength(1);
  });

  it("3. unit_admin tentando criar em unidade externa recebe FORBIDDEN e não escreve nada", async () => {
    state.getUserUnitPermissionResult = null; // sem vínculo nenhum com a unidade 99
    const caller = appRouter.createCaller(createCtx({ role: "unit_admin", unit_id: 20 }));
    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "medico",
        groupKey: "medicos",
        unitIds: [99],
      } as any),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });

  it("4. unit_admin tentando criar unit_admin ou admin_master recebe FORBIDDEN e não escreve nada", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "unit_admin", unit_id: 20 }));

    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "unit_admin",
        groupKey: "administradoresUnidade",
        unitIds: [20],
      } as any),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "admin_master",
        groupKey: "adminsMaster",
        unitIds: [],
      } as any),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });

  it("5. admin_master cria os papéis permitidos sem restrição de unidade (inclusive multiunidade)", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    const result = await caller.admin.createUser({
      ...basePayload,
      role: "medico",
      groupKey: "medicos",
      unitIds: [1, 2, 3],
    } as any);
    expect(result).toEqual({ success: true, id: 4242 });
    expect(state.createUserTransactionalCalls[0]).toMatchObject({ unitIds: [1, 2, 3] });

    // admin_master pode inclusive criar outro admin_master, sem unidade nenhuma.
    await caller.admin.createUser({
      ...basePayload,
      username: "outro.master",
      role: "admin_master",
      groupKey: "adminsMaster",
      unitIds: [],
    } as any);
    expect(state.createUserTransactionalCalls).toHaveLength(2);
    expect(state.createUserTransactionalCalls[1]).toMatchObject({ role: "admin_master", unitIds: [] });
  });

  it("6. combinação de papel e grupo incoerente é rejeitada (BAD_REQUEST), sem escrever nada", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "medico",
        groupKey: "responsaveisFinanceiros", // incoerente: médico não é responsável financeiro
        unitIds: [1],
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });

  it("não-admin (ex.: médico) não pode chamar admin.createUser", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "medico", unit_id: 20 }));
    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "medico",
        groupKey: "medicos",
        unitIds: [20],
      } as any),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });
});

describe("admin.createUser — integridade (teste 7 parcial e teste 9 parcial do parecer Manus)", () => {
  it("7. permissões enviadas vêm do banco (group_permission_configs), não da constante hardcoded, quando o banco tem config", async () => {
    // Config deliberadamente DIFERENTE do GROUP_PERMISSIONS hardcoded para
    // o grupo "medicos" (que no hardcoded tem manage_templates: true).
    state.groupPermissionsRows = [{
      group_key: "medicos",
      view_studies: true,
      edit_reports: true,
      view_anamnesis: true,
      edit_anamnesis: true,
      edit_exam_legend: true,
      print_reports: true,
      manage_templates: false, // divergente do hardcoded de propósito
    }];
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await caller.admin.createUser({
      ...basePayload,
      role: "medico",
      groupKey: "medicos",
      unitIds: [1],
    } as any);
    expect(state.createUserTransactionalCalls[0].permissionsByUnit[1]).toMatchObject({ manage_templates: false });
  });

  it("9 (parcial). username já existente (checagem prévia de createUserTransactional) vira TRPCError CONFLICT legível", async () => {
    state.createUserTransactionalShouldThrow = new FakeUsernameTakenError();
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "medico",
        groupKey: "medicos",
        unitIds: [1],
      } as any),
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining(basePayload.username) });
  });

  it("Bloqueio 1 (parecer corretivo 2026-10-15): view_financial=true configurado no banco chega a createUserTransactional", async () => {
    state.groupPermissionsRows = [{
      group_key: "responsaveisFinanceiros",
      view_studies: false,
      edit_reports: false,
      view_anamnesis: false,
      edit_anamnesis: false,
      edit_exam_legend: false,
      print_reports: false,
      manage_templates: false,
      view_financial: true,
    }];
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await caller.admin.createUser({
      ...basePayload,
      role: "responsavel_financeiro",
      groupKey: "responsaveisFinanceiros",
      unitIds: [1],
    } as any);
    expect(state.createUserTransactionalCalls[0].permissionsByUnit[1]).toMatchObject({ view_financial: true });
  });

  it("Bloqueio 1 (parecer corretivo 2026-10-15): ausência de configuração no banco usa o fallback hardcoded (view_financial previsível)", async () => {
    state.groupPermissionsRows = []; // banco vazio -> fallback GROUP_PERMISSIONS
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await caller.admin.createUser({
      ...basePayload,
      role: "admin_master",
      groupKey: "adminsMaster",
      unitIds: [2],
    } as any);
    // Fallback hardcoded de adminsMaster tem view_financial: true (migration 0046).
    expect(state.createUserTransactionalCalls[0].permissionsByUnit[2]).toMatchObject({ view_financial: true });
  });

  it("Reforço 5.1 (parecer corretivo 2026-10-15): unidade inexistente recebe NOT_FOUND e não chama createUserTransactional", async () => {
    // 777 não está na lista canônica de unidades "existentes" do fake.
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "medico",
        groupKey: "medicos",
        unitIds: [777],
      } as any),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });

  it("Reforço 5.1 (parecer corretivo 2026-10-15): IDs de unidade duplicados são rejeitados (BAD_REQUEST) pelo próprio input", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "medico",
        groupKey: "medicos",
        unitIds: [20, 20],
      } as any),
    ).rejects.toThrow();
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });

  it("Bloqueio 3 (parecer corretivo 2026-10-15): política de responsável financeiro multiunidade violada vira BAD_REQUEST legível", async () => {
    state.createUserTransactionalShouldThrow = new FakeMixedFinancialResponsiblesError(
      "As unidades selecionadas pertencem a responsáveis financeiros diferentes.",
    );
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "responsavel_financeiro",
        groupKey: "responsaveisFinanceiros",
        unitIds: [1, 2],
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("responsáveis financeiros diferentes") });
  });
});

describe("admin.createUser — Bloqueio 1 do parecer de revisão 2026-10-15 (delegação financeira cross-unidade)", () => {
  it("unit_admin de A não pode criar/conceder acesso a responsavel_financeiro, mesmo dentro da própria unidade (A) — FORBIDDEN, zero escrita", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "unit_admin", unit_id: 20 }));
    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "responsavel_financeiro",
        groupKey: "responsaveisFinanceiros",
        unitIds: [20], // A própria unidade do unit_admin — nem isso é permitido.
      } as any),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });

  it("admin_master continua podendo criar responsavel_financeiro normalmente (a restrição é só para unit_admin)", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await caller.admin.createUser({
      ...basePayload,
      role: "responsavel_financeiro",
      groupKey: "responsaveisFinanceiros",
      unitIds: [20],
    } as any);
    expect(state.createUserTransactionalCalls).toHaveLength(1);
  });
});

describe("admin.createUser — Bloqueio 2 do parecer de revisão 2026-10-15 (permissões individuais descartadas)", () => {
  it("toggles individuais enviados pela tela sobrepõem a matriz do grupo campo a campo; manage_templates e view_financial (sem controle na tela) seguem vindo do grupo", async () => {
    state.groupPermissionsRows = [{
      group_key: "medicos",
      view_studies: true,
      edit_reports: true,
      view_anamnesis: true,
      edit_anamnesis: true,
      edit_exam_legend: true,
      print_reports: true,
      manage_templates: true,
      view_financial: false,
    }];
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await caller.admin.createUser({
      ...basePayload,
      role: "medico",
      groupKey: "medicos",
      unitIds: [1],
      // O administrador desmarcou "Ver Estudos" e "Imprimir Laudos" na tela
      // para esta unidade — isso precisa ser respeitado, não descartado.
      permissions: [{
        unit_id: 1,
        view_studies: false,
        edit_reports: true,
        view_anamnesis: true,
        edit_anamnesis: true,
        edit_exam_legend: true,
        print_reports: false,
      }],
    } as any);
    expect(state.createUserTransactionalCalls[0].permissionsByUnit[1]).toMatchObject({
      view_studies: false,
      print_reports: false,
      // Sem controle na tela: vêm da matriz do grupo (true/false acima), não do payload.
      manage_templates: true,
      view_financial: false,
    });
  });

  it("ausência de 'permissions' no payload preserva o comportamento anterior: a matriz do grupo é aplicada inteira (back-compat)", async () => {
    state.groupPermissionsRows = [];
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await caller.admin.createUser({
      ...basePayload,
      role: "medico",
      groupKey: "medicos",
      unitIds: [1],
    } as any);
    expect(state.createUserTransactionalCalls[0].permissionsByUnit[1]).toMatchObject({
      view_studies: true,
      edit_reports: true,
      manage_templates: true,
    });
  });

  it("'permissions' com unit_id fora de unitIds é rejeitado com BAD_REQUEST, nenhuma escrita", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "medico",
        groupKey: "medicos",
        unitIds: [1],
        permissions: [{
          unit_id: 2, // não está em unitIds
          view_studies: true, edit_reports: true, view_anamnesis: true,
          edit_anamnesis: true, edit_exam_legend: true, print_reports: true,
        }],
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });

  it("'permissions' faltando uma unidade de unitIds (cobertura parcial) é rejeitado com BAD_REQUEST, nenhuma escrita", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "medico",
        groupKey: "medicos",
        unitIds: [1, 2],
        permissions: [{
          unit_id: 1,
          view_studies: true, edit_reports: true, view_anamnesis: true,
          edit_anamnesis: true, edit_exam_legend: true, print_reports: true,
        }],
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });
});

describe("admin.createUserScoped — Bloqueio de arquitetura do parecer de revisão 2026-10-15 (delegação para a rotina nova)", () => {
  it("unit_admin não pode criar/conceder responsavel_financeiro por este endpoint legado — mesma restrição do Bloqueio 1", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "unit_admin", unit_id: 20 }));
    await expect(
      caller.admin.createUserScoped({
        ...basePayload,
        role: "responsavel_financeiro",
        groupKey: "responsaveisFinanceiros",
        unitId: 20,
      } as any),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });

  it("chamada válida delega para createUserTransactional (não mais para createLocalUser + inserts separados)", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await caller.admin.createUserScoped({
      ...basePayload,
      role: "medico",
      groupKey: "medicos",
      unitId: 1,
    } as any);
    expect(state.createUserTransactionalCalls).toHaveLength(1);
    expect(state.createUserTransactionalCalls[0]).toMatchObject({ unitIds: [1], groupKey: "medicos" });
  });

  it("papel e grupo incoerentes são rejeitados com BAD_REQUEST, nenhuma escrita", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await expect(
      caller.admin.createUserScoped({
        ...basePayload,
        role: "medico",
        groupKey: "operadores", // incoerente com role "medico"
        unitId: 1,
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });

  it("unidade inexistente retorna NOT_FOUND, nenhuma escrita", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await expect(
      caller.admin.createUserScoped({
        ...basePayload,
        role: "medico",
        groupKey: "medicos",
        unitId: 777, // fora de existingUnitRows
      } as any),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });

  it("username já existente vira CONFLICT legível (mesma tradução de erro de admin.createUser)", async () => {
    state.createUserTransactionalShouldThrow = new FakeUsernameTakenError();
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await expect(
      caller.admin.createUserScoped({
        ...basePayload,
        role: "medico",
        groupKey: "medicos",
        unitId: 1,
      } as any),
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining(basePayload.username) });
  });
});

describe("admin.createUser — validação calendarizada de expiration_date (seção 5 do parecer de revisão 2026-10-15)", () => {
  it("2024-02-29 (ano bissexto) é uma data válida e é persistida exatamente como enviada", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await caller.admin.createUser({
      ...basePayload,
      role: "medico",
      groupKey: "medicos",
      unitIds: [1],
      expiration_date: "2024-02-29",
    } as any);
    expect(state.createUserTransactionalCalls[0].expiration_date).toBe("2024-02-29");
  });

  it("2023-02-29 (2023 não é bissexto) é rejeitada com BAD_REQUEST, nenhuma escrita", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "medico",
        groupKey: "medicos",
        unitIds: [1],
        expiration_date: "2023-02-29",
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });

  it("2026-02-30 é rejeitada com BAD_REQUEST — NUNCA normalizada silenciosamente para 2 de março (prova central do parecer)", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "medico",
        groupKey: "medicos",
        unitIds: [1],
        expiration_date: "2026-02-30",
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });

  it("mês 13 é rejeitado com BAD_REQUEST, nenhuma escrita", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await expect(
      caller.admin.createUser({
        ...basePayload,
        role: "medico",
        groupKey: "medicos",
        unitIds: [1],
        expiration_date: "2026-13-01",
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.createUserTransactionalCalls).toHaveLength(0);
  });

  it("data válida sem deslocamento de fuso: a string enviada é persistida byte a byte, sem passar por new Date()", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await caller.admin.createUser({
      ...basePayload,
      role: "medico",
      groupKey: "medicos",
      unitIds: [1],
      expiration_date: "2027-01-31",
    } as any);
    expect(state.createUserTransactionalCalls[0].expiration_date).toBe("2027-01-31");
  });

  it("vazio/null em expiration_date não gera erro e é persistido como null", async () => {
    const caller = appRouter.createCaller(createCtx({ role: "admin_master" }));
    await caller.admin.createUser({
      ...basePayload,
      role: "medico",
      groupKey: "medicos",
      unitIds: [1],
      expiration_date: null,
    } as any);
    expect(state.createUserTransactionalCalls[0].expiration_date).toBeNull();
  });
});
