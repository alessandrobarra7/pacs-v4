/**
 * Regressão (branch claude/setor-laudos-masks-trechos-pdf, 2026-09-24):
 * cobre a nova procedure masks.update, criada para permitir editar um "Laudo
 * Pronto" (máscara) já importado sem precisar apagar e reimportar um JSON novo.
 *
 * Cenários:
 *  - usuário sem vínculo com a unidade -> FORBIDDEN (sem tocar banco: canAccessUnit mockado)
 *  - usuário comum tentando editar máscara que não é dele -> updateReportMask
 *    retorna false (linha WHERE não bate) -> router relança como NOT_FOUND
 *  - usuário comum editando a própria máscara pessoal -> sucesso, updateReportMask
 *    chamado com isAdmin=false e o unitId do usuário (não pode escalar para outra unidade)
 *  - admin_master editando máscara scope='unit' da própria unidade -> sucesso,
 *    updateReportMask chamado com isAdmin=true
 *  - body em texto puro é normalizado para HTML antes de persistir (mesma
 *    normalizeBodyToHtml usada no import), preservando o comportamento existente
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
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

describe("masks.update — controle de acesso e persistência", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("usuário sem vínculo com a unidade recebe FORBIDDEN (sem tocar banco)", async () => {
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return { ...original, canAccessUnit: vi.fn(async () => false) };
    });
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return { ...original, updateReportMask: vi.fn() };
    });

    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 10, role: "medico", unit_id: 1 });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.masks.update({ id: 1, unitId: 999, name: "X", body: "<p>x</p>" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const dbMod = await import("./db");
    expect(dbMod.updateReportMask).not.toHaveBeenCalled();

    vi.doUnmock("./authorization");
    vi.doUnmock("./db");
  });

  it("usuário comum tentando editar máscara que não é dele recebe NOT_FOUND", async () => {
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return { ...original, canAccessUnit: vi.fn(async () => true) };
    });
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return { ...original, updateReportMask: vi.fn(async () => false) };
    });

    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 20, role: "medico", unit_id: 5 });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.masks.update({ id: 77, unitId: 5, name: "Outra pessoa", body: "<p>x</p>" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    vi.doUnmock("./authorization");
    vi.doUnmock("./db");
  });

  it("usuário comum edita a própria máscara: updateReportMask chamado com isAdmin=false", async () => {
    const updateMock = vi.fn(async () => true);
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return { ...original, canAccessUnit: vi.fn(async () => true) };
    });
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return { ...original, updateReportMask: updateMock };
    });

    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 30, role: "medico", unit_id: 5 });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.masks.update({
      id: 5, unitId: 5, name: "RX Tórax — Ajustado", modality: "CR",
      exam_title: "RADIOGRAFIA DE TÓRAX", body: "Texto simples sem HTML",
    });

    expect(result).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [id, userId, isAdmin, unitId, fields] = updateMock.mock.calls[0];
    expect(id).toBe(5);
    expect(userId).toBe(30);
    expect(isAdmin).toBe(false);
    expect(unitId).toBe(5);
    expect(fields.name).toBe("RX Tórax — Ajustado");
    // corpo em texto puro deve ser normalizado para HTML (mesmo helper do import)
    expect(fields.body).toContain("<p>");

    vi.doUnmock("./authorization");
    vi.doUnmock("./db");
  });

  it("admin_master edita máscara scope='unit' da própria unidade: updateReportMask com isAdmin=true", async () => {
    const updateMock = vi.fn(async () => true);
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return { ...original, canAccessUnit: vi.fn(async () => true) };
    });
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return { ...original, updateReportMask: updateMock };
    });

    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 1, role: "admin_master", unit_id: 5 });
    const caller = appRouter.createCaller(ctx);

    await caller.masks.update({ id: 9, unitId: 5, name: "Padrão da unidade", body: "<p>ok</p>" });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [, , isAdmin] = updateMock.mock.calls[0];
    expect(isAdmin).toBe(true);

    vi.doUnmock("./authorization");
    vi.doUnmock("./db");
  });
});
