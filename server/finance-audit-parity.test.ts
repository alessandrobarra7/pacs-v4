import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ responses: [] as unknown[][] }));

function resultQuery(rows: unknown[]) {
  return Object.assign(Promise.resolve(rows), {
    limit: () => Promise.resolve(rows),
    orderBy: () => Promise.resolve(rows),
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
        chain.leftJoin = vi.fn(() => chain);
        chain.innerJoin = vi.fn(() => chain);
        chain.where = vi.fn(() => resultQuery(state.responses.shift() ?? []));
        return chain;
      }),
    })),
  };
});

import { financeSimpleRouter } from "./routers/financeSimple";

describe("Paridade entre indicador e log financeiro", () => {
  beforeEach(() => {
    state.responses = [];
  });

  it("retorna no log cada evento que compõe a contagem unificada do ciclo", async () => {
    const signedAt = new Date("2026-08-21T12:00:00.000Z");
    state.responses = [
      [{ id: 12, name: "Unidade A", s: 1, e: 31 }],
      [{ total_laudos: 1, system_total: "3.50", doctor_total: "18.00", system_paid: "0", doctor_paid: "0", system_pending_count: 1, doctor_pending_count: 1 }],
      [{ total_laudos: 1, system_total: "3.50", doctor_total: "20.00", system_paid: "0", doctor_paid: "0", system_pending_count: 1, doctor_pending_count: 1 }],
      [{ id: 12, billing_cycle_start_day: 1, billing_cycle_end_day: 31 }],
      [{ event_id: 5, study_instance_uid: "1.2.3", report_id: 41, patient_name: "ANA^SILVA", study_date: signedAt, study_description: "CRÂNIO", modality: "CR", clinical_label: "CRÂNIO", doctor_name: "Dra Ana", signed_at: signedAt, doctor_amount_due: "18.00", system_amount_due: "3.50", doctor_received_at: null, system_paid_at: null, pricing_status: "ok" }],
      [{ event_id: 6, study_instance_uid: "1.2.4", report_id: null, patient_name: "BRUNO^SOUZA", study_date: signedAt, study_description: "TÓRAX", modality: "CR", clinical_label: "TÓRAX", doctor_name: "Dr Bruno", signed_at: signedAt, doctor_amount_due: "20.00", system_amount_due: "3.50", doctor_received_at: null, system_paid_at: null, pricing_status: "ok" }],
    ];
    const caller = financeSimpleRouter.createCaller({ user: { id: 1, role: "admin_master" }, req: {} as never, res: {} as never });
    const referenceDate = "2026-08-15T12:00:00.000Z";

    const [summary] = await caller.unitSummary({ reference_date: referenceDate });
    const audit = await caller.auditEventsByUnit({ unit_id: 12, reference_date: referenceDate });

    expect(summary?.total_laudos).toBe(2);
    expect(audit.events).toHaveLength(summary?.total_laudos ?? 0);
    expect(audit.events.map((event) => event.source).sort()).toEqual(["catalog", "legacy"]);
  });
});
