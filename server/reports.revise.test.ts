/**
 * Testes de integração — Módulo de Retificação de Laudos
 * Auditoria PACS v4 — 04/04/2026
 *
 * Cobre os 4 cenários de erro identificados na auditoria:
 *   B1 — reports.update deve bloquear laudos assinados/revisados
 *   B2 — (comportamento de UI, coberto por inspeção; não testável via tRPC caller)
 *   B3 — reports.revise deve aceitar body enviado pelo cliente (não lê DOM)
 *   B4 — reports.revise deve atualizar signedAt e signedBy ao retificar
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "test-user-1",
    name: "Dr. Teste",
    email: "dr@teste.com",
    username: "drteste",
    password_hash: null,
    loginMethod: "local",
    role: "medico",
    unit_id: 10,
    isActive: true,
    expiration_date: null,
    crm: "12345-SP",
    signature_url: null,
    stamp_url: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function makeContext(userOverrides: Partial<User> = {}): TrpcContext {
  return {
    user: makeUser(userOverrides),
    req: {
      ip: "127.0.0.1",
      protocol: "https",
      headers: { "user-agent": "vitest" },
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// ── Mocks do banco de dados ───────────────────────────────────────────────────

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getReportById: vi.fn(),
    updateReport: vi.fn().mockResolvedValue(undefined),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
    assertUnitPermission: vi.fn().mockResolvedValue(true),
    getDb: vi.fn().mockResolvedValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };
});

import { getReportById, updateReport } from "./db";

// ── Testes ────────────────────────────────────────────────────────────────────

describe("B1 — reports.update: bloquear laudos assinados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve lançar BAD_REQUEST ao tentar atualizar laudo com status 'signed'", async () => {
    vi.mocked(getReportById).mockResolvedValue({
      id: 42,
      unit_id: 10,
      status: "signed",
      body: "<p>Conteúdo original</p>",
      version: 1,
      study_id: null,
      study_instance_uid: null,
      template_id: null,
      author_user_id: 1,
      previousVersionId: null,
      signedAt: new Date(),
      signedBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.reports.update({ id: 42, body: "<p>Conteúdo alterado sem histórico</p>" })
    ).rejects.toThrow("Laudos assinados só podem ser editados via retificação.");
  });

  it("deve lançar BAD_REQUEST ao tentar atualizar laudo com status 'revised'", async () => {
    vi.mocked(getReportById).mockResolvedValue({
      id: 43,
      unit_id: 10,
      status: "revised",
      body: "<p>Versão retificada</p>",
      version: 2,
      study_id: null,
      study_instance_uid: null,
      template_id: null,
      author_user_id: 1,
      previousVersionId: null,
      signedAt: new Date(),
      signedBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.reports.update({ id: 43, body: "<p>Bypass via update</p>" })
    ).rejects.toThrow("Laudos assinados só podem ser editados via retificação.");
  });

  it("deve permitir atualizar laudo com status 'draft'", async () => {
    vi.mocked(getReportById).mockResolvedValue({
      id: 44,
      unit_id: 10,
      status: "draft",
      body: "<p>Rascunho</p>",
      version: 1,
      study_id: null,
      study_instance_uid: null,
      template_id: null,
      author_user_id: 1,
      previousVersionId: null,
      signedAt: null,
      signedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.reports.update({ id: 44, body: "<p>Rascunho atualizado</p>" });
    expect(result).toEqual({ success: true });
    expect(updateReport).toHaveBeenCalledWith(44, { body: "<p>Rascunho atualizado</p>" });
  });
});

describe("B3 + B4 — reports.revise: body do cliente e atualização de signedAt/signedBy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve salvar o body exato enviado pelo cliente (não lê DOM)", async () => {
    const originalBody = "<p>Conteúdo original assinado</p>";
    const revisedBody = "<p>Conteúdo corrigido pelo médico</p>";

    vi.mocked(getReportById).mockResolvedValue({
      id: 50,
      unit_id: 10,
      status: "signed",
      body: originalBody,
      version: 1,
      study_id: null,
      study_instance_uid: null,
      template_id: null,
      author_user_id: 1,
      previousVersionId: null,
      signedAt: new Date("2026-01-01"),
      signedBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = makeContext({ id: 2 });
    const caller = appRouter.createCaller(ctx);

    await caller.reports.revise({
      id: 50,
      body: revisedBody,
      reason: "Correção de diagnóstico após revisão",
    });

    // B3: o body salvo deve ser o que o cliente enviou
    expect(updateReport).toHaveBeenCalledWith(
      50,
      expect.objectContaining({ body: revisedBody })
    );
  });

  it("deve atualizar signedAt e signedBy com os dados do retificador (B4)", async () => {
    const retificadorId = 7;
    const beforeRevise = new Date();

    vi.mocked(getReportById).mockResolvedValue({
      id: 51,
      unit_id: 10,
      status: "signed",
      body: "<p>Laudo original</p>",
      version: 1,
      study_id: null,
      study_instance_uid: null,
      template_id: null,
      author_user_id: 1,
      previousVersionId: null,
      signedAt: new Date("2026-01-01"),
      signedBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = makeContext({ id: retificadorId });
    const caller = appRouter.createCaller(ctx);

    await caller.reports.revise({
      id: 51,
      body: "<p>Laudo retificado</p>",
      reason: "Correção de erro tipográfico no diagnóstico",
    });

    // B4: signedBy deve ser o ID do retificador, não do assinante original
    expect(updateReport).toHaveBeenCalledWith(
      51,
      expect.objectContaining({
        signedBy: retificadorId,
        status: "revised",
        version: 2,
      })
    );

    // B4: signedAt deve ser uma data posterior ao início do teste
    const callArgs = vi.mocked(updateReport).mock.calls[0]?.[1] as any;
    expect(callArgs.signedAt).toBeInstanceOf(Date);
    expect(callArgs.signedAt.getTime()).toBeGreaterThanOrEqual(beforeRevise.getTime());
  });

  it("deve rejeitar retificação de laudo em rascunho", async () => {
    vi.mocked(getReportById).mockResolvedValue({
      id: 52,
      unit_id: 10,
      status: "draft",
      body: "<p>Rascunho</p>",
      version: 1,
      study_id: null,
      study_instance_uid: null,
      template_id: null,
      author_user_id: 1,
      previousVersionId: null,
      signedAt: null,
      signedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = makeContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.reports.revise({
        id: 52,
        body: "<p>Tentativa de retificar rascunho</p>",
        reason: "Motivo qualquer",
      })
    ).rejects.toThrow("Apenas laudos assinados podem ser retificados");
  });
});
