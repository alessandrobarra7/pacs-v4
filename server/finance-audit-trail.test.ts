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

describe("Trilha auditável de eventos financeiros por unidade", () => {
  beforeEach(() => { state.responses = []; });

  it("reúne origem, paciente, estudo, médico, data e valores do legado e do catálogo", async () => {
    const studyDate = new Date("2026-08-20T00:00:00.000Z");
    const signedAt = new Date("2026-08-21T12:00:00.000Z");
    state.responses = [
      [{ id: 12, billing_cycle_start_day: 1, billing_cycle_end_day: 31 }],
      [{ event_id: 5, billing_occurrence: null, source_report_id: null, study_instance_uid: "1.2.3", report_id: 41, modality: "CR", clinical_label: "CRÂNIO – CONTROLE", doctor_user_id: 1, signed_at: signedAt, doctor_amount_due: "18.00", system_amount_due: "3.50", doctor_received_at: null, system_paid_at: null, pricing_status: "ok" }],
      [{ event_id: 6, study_selection_id: 21, billing_occurrence: 2, source_report_id: 73, report_id: null, modality: "CR", clinical_label: "TÓRAX", doctor_user_id: 2, signed_at: new Date("2026-08-21T13:00:00.000Z"), doctor_amount_due: "20.00", system_amount_due: "3.50", doctor_received_at: signedAt, system_paid_at: null, pricing_status: "ok" }],
      [{ id: 1, name: "Dra Ana" }, { id: 2, name: "Dr Bruno" }],
      [{ id: 21, study_instance_uid: "1.2.4" }],
      [{ study_instance_uid: "1.2.3", patient_name: "ANA^SILVA", study_date: studyDate, study_description: null }, { study_instance_uid: "1.2.4", patient_name: "BRUNO^SOUZA", study_date: studyDate, study_description: "TÓRAX" }],
    ];
    const caller = financeSimpleRouter.createCaller({ user: { id: 1, role: "admin_master" }, req: {} as never, res: {} as never });
    const result = await caller.auditEventsByUnit({ unit_id: 12, reference_date: "2026-08-21T12:00:00.000Z" });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "legacy-5", source: "legacy", billing_occurrence: null, source_report_id: null, patient_name: "ANA^SILVA", study_description: null, clinical_label: "CRÂNIO – CONTROLE", doctor_name: "Dra Ana", doctor_amount_due: "18.00" }),
      expect.objectContaining({ id: "catalog-6", source: "catalog", billing_occurrence: 2, source_report_id: 73, patient_name: "BRUNO^SOUZA", clinical_label: "TÓRAX", doctor_name: "Dr Bruno", doctor_received_at: signedAt }),
    ]));
  });
});
