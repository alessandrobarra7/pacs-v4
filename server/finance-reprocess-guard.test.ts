import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  missing: [] as unknown[],
  created: [] as unknown[],
}));

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getDb: vi.fn(async () => ({
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.from = vi.fn(() => chain);
        chain.leftJoin = vi.fn(() => chain);
        chain.where = vi.fn(() => chain);
        chain.orderBy = vi.fn(() => chain);
        chain.limit = vi.fn(async () => state.missing);
        return chain;
      }),
    })),
    createBillingVisitEvent: vi.fn(async (input: unknown) => {
      state.created.push(input);
      return { created: true };
    }),
  };
});

import { financeSimpleRouter } from "./routers/financeSimple";

function caller(role: "admin_master" | "unit_admin") {
  return financeSimpleRouter.createCaller({
    user: { id: 7, role },
    req: {} as never,
    res: {} as never,
  });
}

const legacyCandidate = {
  report_id: 501,
  unit_id: 12,
  author_user_id: 31,
  study_instance_uid: "1.2.3.4",
  signedAt: new Date("2026-08-21T12:00:00.000Z"),
  patient_name: "PACIENTE LEGADO",
  study_date: new Date("2026-08-21T00:00:00.000Z"),
  modality: "CR",
};

describe("Guarda comportamental do reprocessamento legado", () => {
  beforeEach(() => {
    state.missing = [];
    state.created = [];
  });

  it("não cria eventos no dry-run, mesmo quando a consulta retorna candidatos legados", async () => {
    state.missing = [legacyCandidate];

    const result = await caller("admin_master").reprocessBillingEvents({ dry_run: true });

    expect(result).toMatchObject({ dry_run: true, would_create: 1 });
    expect(state.created).toEqual([]);
  });

  it("cria somente os candidatos retornados pela consulta legada e rejeita perfil sem privilégio", async () => {
    await expect(caller("unit_admin").reprocessBillingEvents({ dry_run: true }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    state.missing = [legacyCandidate];
    const result = await caller("admin_master").reprocessBillingEvents({ dry_run: false });

    expect(result).toMatchObject({ dry_run: false, total_missing: 1, created: 1, failed: 0 });
    expect(state.created).toEqual([expect.objectContaining({
      report_id: 501,
      unit_id: 12,
      doctor_user_id: 31,
      study_instance_uid: "1.2.3.4",
    })]);
  });
});
