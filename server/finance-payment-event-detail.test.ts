import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ responses: [] as unknown[][] }));

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
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.from = vi.fn(() => chain);
        chain.leftJoin = vi.fn(() => { throw new Error("O detalhe de pagamentos não pode depender de junção clínica obrigatória."); });
        chain.where = vi.fn(() => resultQuery(state.responses.shift() ?? []));
        return chain;
      }),
    })),
  };
});

import { financeSimpleRouter } from "./routers/financeSimple";

describe("detalhe de pagamentos por médico", () => {
  beforeEach(() => {
    state.responses = [];
  });

  it("mantém o evento de catálogo quando a seleção clínica não está disponível", async () => {
    state.responses = [
      [{ s: 1, e: 31 }],
      [],
      [{ event_id: 9, study_selection_id: 77, report_id: null, modality: "CR", clinical_label: "CRÂNIO", doctor_user_id: 5, signed_at: new Date("2026-08-21T10:00:00.000Z"), doctor_amount_due: "18.00", system_amount_due: "3.50", doctor_received_at: null, system_paid_at: null, pricing_status: "ok", financial_status: "active" }],
      [{ id: 5, name: "Dra. Ana" }],
      [],
    ];

    const caller = financeSimpleRouter.createCaller({
      user: { id: 1, role: "admin_master" },
      req: {} as never,
      res: {} as never,
    });
    const events = await caller.eventsByDoctorUnit({
      unit_id: 12,
      doctor_user_id: 5,
      reference_date: "2026-08-21T12:00:00.000Z",
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "catalog-9",
      source: "catalog",
      patient_name: null,
      modality_snapshot: "CR",
      exam_name_snapshot: "CRÂNIO",
      doctor_amount_due: "18.00",
    });
  });
});
