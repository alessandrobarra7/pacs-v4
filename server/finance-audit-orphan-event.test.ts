import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ responses: [] as unknown[][] }));

function resultQuery(rows: unknown[]) {
  return Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) });
}

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getDb: vi.fn(async () => ({
      select: vi.fn(() => {
        let hasInnerJoin = false;
        const chain: Record<string, unknown> = {};
        chain.from = vi.fn(() => chain);
        chain.leftJoin = vi.fn(() => chain);
        chain.innerJoin = vi.fn(() => { hasInnerJoin = true; return chain; });
        chain.where = vi.fn(() => resultQuery(hasInnerJoin ? [] : state.responses.shift() ?? []));
        return chain;
      }),
    })),
  };
});

import { financeSimpleRouter } from "./routers/financeSimple";

describe("Eventos financeiros sem vínculo clínico disponível", () => {
  beforeEach(() => { state.responses = []; });

  it("mantém o evento de catálogo no log mesmo quando a seleção clínica não é retornada", async () => {
    const signedAt = new Date("2026-08-21T20:05:37.000Z");
    state.responses = [
      [{ id: 20, billing_cycle_start_day: 24, billing_cycle_end_day: 23 }],
      [],
      [{ event_id: 2, study_instance_uid: null, report_id: null, patient_name: null, study_date: null, study_description: null, modality: null, clinical_label: "ABDOMEN TOTAL", doctor_name: "Médico", signed_at: signedAt, doctor_amount_due: null, system_amount_due: null, doctor_received_at: null, system_paid_at: null, pricing_status: "pending_doctor_price" }],
    ];
    const caller = financeSimpleRouter.createCaller({ user: { id: 1, role: "admin_master" }, req: {} as never, res: {} as never });
    const audit = await caller.auditEventsByUnit({ unit_id: 20, reference_date: "2026-08-22T12:00:00.000Z" });

    expect(audit.events).toEqual([
      expect.objectContaining({ id: "catalog-2", source: "catalog", clinical_label: "ABDOMEN TOTAL", patient_name: null }),
    ]);
  });
});
