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
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.from = vi.fn(() => chain);
        chain.leftJoin = vi.fn(() => { throw new Error("O resumo financeiro não pode depender de junções clínicas."); });
        chain.where = vi.fn(() => resultQuery(state.responses.shift() ?? []));
        return chain;
      }),
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
      [
        { event_id: 1, study_instance_uid: "1.2.3", report_id: 1, patient_name: "ANA", study_date: null, study_description: null, modality: "CR", clinical_label: "CRÂNIO", doctor_name: "Dra Ana", signed_at: new Date("2026-08-10T10:00:00.000Z"), doctor_amount_due: "10.00", system_amount_due: "3.50", doctor_received_at: null, system_paid_at: null, pricing_status: "ok" },
        { event_id: 2, study_instance_uid: "1.2.4", report_id: 2, patient_name: "ANA", study_date: null, study_description: null, modality: "CR", clinical_label: "TÓRAX", doctor_name: "Dra Ana", signed_at: new Date("2026-08-11T10:00:00.000Z"), doctor_amount_due: "10.00", system_amount_due: "3.50", doctor_received_at: new Date("2026-08-12T10:00:00.000Z"), system_paid_at: new Date("2026-08-12T10:00:00.000Z"), pricing_status: "ok" },
      ],
      [
        { event_id: 3, study_instance_uid: "1.2.5", report_id: null, patient_name: "BRUNO", study_date: null, study_description: null, modality: "CR", clinical_label: "TÓRAX", doctor_name: "Dr Bruno", signed_at: new Date("2026-08-13T10:00:00.000Z"), doctor_amount_due: "18.00", system_amount_due: "3.50", doctor_received_at: new Date("2026-08-14T10:00:00.000Z"), system_paid_at: new Date("2026-08-14T10:00:00.000Z"), pricing_status: "ok" },
      ],
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
