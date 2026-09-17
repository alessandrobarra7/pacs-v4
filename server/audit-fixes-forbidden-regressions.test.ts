/**
 * Regressão (revisão independente, 2026-09-16, docs/auditoria-claude/):
 * cobre com FORBIDDEN explícito as quatro barreiras de autorização adicionadas em
 * claude/correcoes-setoriais-auditoria, que não tinham nenhum teste próprio até então:
 *   - sla.getUnitSla (antes: qualquer usuário autenticado lia o SLA de qualquer unidade)
 *   - studyExamLegend.getBatch (antes: unit_id do cliente não era validado)
 *   - anamnesis.getByStudyId sem unidade resolvida (antes: pulava a checagem e vazava
 *     anamnese de qualquer unidade)
 *   - units.update por papel não-administrativo (antes: qualquer papel com QUALQUER
 *     vínculo em user_unit_permissions — mesmo só view_studies — podia editar
 *     pacs_ip/pacs_port/pacs_ae_title/name/slug/isActive da unidade)
 *
 * CORREÇÃO (solicitação "isolamento de testes VM1", 2026-09-17): os dois primeiros
 * cenários (sla.getUnitSla, studyExamLegend.getBatch) chamavam canAccessUnit()
 * sem mock — no sandbox isso "funcionava" só porque getDb() retorna null
 * instantaneamente sem DATABASE_URL configurado, mas na VM1 (com banco real) a
 * mesma chamada abre uma conexão de verdade, e uma rede/conexão mais lenta
 * estourou o timeout padrão de 5s do Vitest. canAccessUnit agora é mockado
 * diretamente nos dois casos, então nenhum dos seis cenários deste arquivo toca
 * banco em nenhum ambiente.
 */
import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
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

describe("sla.getUnitSla — nega acesso sem vínculo com a unidade", () => {
  it("médico sem vínculo com a unidade recebe FORBIDDEN (sem tocar banco)", async () => {
    vi.resetModules();
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return {
        ...original,
        // Mocka a decisão em si, não o banco por trás dela: elimina qualquer
        // dependência de rede/conexão real, em qualquer ambiente.
        canAccessUnit: vi.fn(async () => false),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 10, role: "medico", unit_id: 1 });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.sla.getUnitSla({ unitId: 999 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.doUnmock("./authorization");
    vi.resetModules();
  });
});

describe("studyExamLegend.getBatch — nega acesso sem vínculo com a unidade", () => {
  it("médico sem vínculo com a unidade recebe FORBIDDEN para o lote inteiro (sem tocar banco)", async () => {
    vi.resetModules();
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return {
        ...original,
        canAccessUnit: vi.fn(async () => false),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 11, role: "medico", unit_id: 1 });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.studyExamLegend.getBatch({
        unit_id: 999,
        studyInstanceUids: ["1.2.3.4.5"],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.doUnmock("./authorization");
    vi.resetModules();
  });
});

describe("units.update — nega edição para papéis não-administrativos", () => {
  // getAdminManagedUnitIds, sem banco disponível neste ambiente de teste, já devolve
  // [] para qualquer não-admin_master — o que por si só bloquearia o update e
  // mascararia a falha original (bastava ter QUALQUER linha em
  // user_unit_permissions, mesmo só com view_studies, para editar pacs_ip/pacs_port/
  // pacs_ae_title/name/slug/isActive). Por isso simulamos explicitamente o cenário
  // que era o problema real: o usuário TEM um vínculo com a unidade (managedIds
  // inclui a unidade), e mesmo assim deve ser negado por não ser admin_master nem
  // unit_admin.
  it("médico com vínculo (view_studies) na unidade ainda recebe FORBIDDEN (antes bastava ter qualquer vínculo)", async () => {
    vi.resetModules();
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return {
        ...original,
        getAdminManagedUnitIds: vi.fn(async () => [1]),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 12, role: "medico", unit_id: 1 });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.units.update({ id: 1, name: "Unidade Alterada" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.doUnmock("./authorization");
    vi.resetModules();
  });

  it("operador com vínculo (view_studies) na unidade recebe FORBIDDEN ao tentar editar configuração PACS", async () => {
    vi.resetModules();
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return {
        ...original,
        getAdminManagedUnitIds: vi.fn(async () => [1]),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 13, role: "operador", unit_id: 1 });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.units.update({ id: 1, pacs_ip: "10.0.0.99" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.doUnmock("./authorization");
    vi.resetModules();
  });

  it("unit_admin com vínculo na unidade CONTINUA autorizado (a barreira é por papel, não remove o fluxo legítimo)", async () => {
    vi.resetModules();
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return {
        ...original,
        getAdminManagedUnitIds: vi.fn(async () => [1]),
      };
    });
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        updateUnit: vi.fn(async () => {}),
        createAuditLog: vi.fn(async () => {}),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 15, role: "unit_admin", unit_id: 1 });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.units.update({ id: 1, name: "Unidade Renomeada" });
    expect(result).toMatchObject({ success: true });
    vi.doUnmock("./authorization");
    vi.doUnmock("./db");
    vi.resetModules();
  });
});

describe("anamnesis.getByStudyId — nega acesso quando nenhuma unidade é resolvida", () => {
  it("usuário não-admin sem unit_id e sem permissões granulares recebe FORBIDDEN, não a anamnese de qualquer unidade", async () => {
    vi.resetModules();
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        // Isola exatamente o cenário do achado original: resolveEffectiveUnitId
        // não consegue resolver nenhuma unidade (sem user_unit_permissions e sem
        // users.unit_id legado) — sem depender de uma conexão real com o banco,
        // que este ambiente de teste não tem.
        resolveEffectiveUnitId: vi.fn(async () => null),
      };
    });
    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 14, role: "medico", unit_id: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.anamnesis.getByStudyId({ study_instance_uid: "1.2.3.4.5" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.doUnmock("./db");
    vi.resetModules();
  });
});
