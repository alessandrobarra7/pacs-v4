/**
 * Regressão (auditoria-seguranca-rbac-pacs-financeiro-storage-20261110):
 * medicalData.getReportContext aceitava qualquer unitId informado pelo cliente
 * sem checar se o usuário autenticado tinha vínculo com aquela unidade — bastava
 * ser um usuário autenticado qualquer para obter unitName/unitLogoUrl de uma
 * unidade sem nenhuma relação com ele (IDOR de baixa severidade; não vaza PHI,
 * pois signatureUrl/stampUrl retornados são sempre do próprio ctx.user, não do
 * unitId informado). Este teste cobre a checagem de canAccessUnit adicionada
 * antes de getUnitById.
 *
 * Segue o mesmo padrão de mock de ./audit-fixes-forbidden-regressions.test.ts:
 * canAccessUnit é mockado diretamente (sem tocar banco em nenhum ambiente).
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

describe("medicalData.getReportContext — nega acesso sem vínculo com a unidade", () => {
  it("usuário sem vínculo com a unidade recebe FORBIDDEN ao informar unitId de outra unidade (sem tocar banco)", async () => {
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
    const ctx = createCtx({ id: 42, role: "medico", unit_id: 1 });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.medicalData.getReportContext({ unitId: 999 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.doUnmock("./authorization");
    vi.resetModules();
  });
});
