import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  responses: [] as unknown[][],
}));

function resultQuery(rows: unknown[]) {
  return Object.assign(Promise.resolve(rows), {
    orderBy: () => Promise.resolve(rows),
    limit: () => Promise.resolve(rows),
  });
}

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getDb: vi.fn(async () => ({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => resultQuery(state.responses.shift() ?? [])),
        })),
      })),
    })),
  };
});

import { financeSimpleRouter } from "./routers/financeSimple";

describe("Resumo financeiro unificado por unidade", () => {
  beforeEach(() => {
    state.responses = [];
  });

  it("agrega valores e baixas do legado e do catálogo sem considerar o catálogo já pago como pendente", async () => {
    state.responses = [
      [{ id: 12, name: "Unidade A", s: 1, e: 31 }],
      [{
        total_laudos: 2,
        system_total: "7.00",
        doctor_total: "20.00",
        system_paid: "3.50",
        doctor_paid: "10.00",
        system_pending_count: 1,
        doctor_pending_count: 1,
      }],
      [{
        total_laudos: 1,
        system_total: "3.50",
        doctor_total: "18.00",
        system_paid: "3.50",
        doctor_paid: "18.00",
        system_pending_count: 0,
        doctor_pending_count: 0,
      }],
    ];

    const caller = financeSimpleRouter.createCaller({
      user: { id: 1, role: "admin_master" },
      req: {} as never,
      res: {} as never,
    });
    const [summary] = await caller.unitSummary({
      reference_date: "2026-08-21T12:00:00.000Z",
    });

    expect(summary).toMatchObject({
      unit_id: 12,
      total_laudos: 3,
      system_total: 10.5,
      doctor_total: 38,
      system_paid: 7,
      doctor_paid: 28,
      system_pending: 3.5,
      doctor_pending: 10,
      system_pending_count: 1,
      doctor_pending_count: 1,
    });
  });
});
