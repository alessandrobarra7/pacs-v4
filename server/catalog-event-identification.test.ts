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
        chain.innerJoin = vi.fn(() => chain);
        chain.leftJoin = vi.fn(() => chain);
        chain.where = vi.fn(() => resultQuery(state.responses.shift() ?? []));
        return chain;
      }),
    })),
  };
});

import { financeSimpleRouter } from "./routers/financeSimple";

describe("Identificação clínica dos eventos de catálogo", () => {
  beforeEach(() => {
    state.responses = [];
  });

  it("retorna paciente e data do estudo no evento de catálogo do drill-down financeiro", async () => {
    const studyDate = new Date("2026-08-20T00:00:00.000Z");
    state.responses = [
      [{ s: 1, e: 31 }],
      [],
      [{
        event_id: 71,
        study_selection_id: 15,
        report_id: null,
        modality: "CR",
        clinical_label: "CRÂNIO",
        doctor_user_id: 31,
        system_amount_due: "3.50",
        doctor_amount_due: "18.00",
        doctor_received_at: null,
        system_paid_at: null,
        signed_at: new Date("2026-08-21T12:00:00.000Z"),
        pricing_status: "ok",
        financial_status: "active",
      }],
      [{ id: 31, name: "Dra. Ana" }],
      [{ id: 15, study_instance_uid: "1.2.3" }],
      [{ study_instance_uid: "1.2.3", patient_name: "MARIA DE SOUZA", study_date: studyDate, study_description: "CRÂNIO" }],
    ];

    const caller = financeSimpleRouter.createCaller({
      user: { id: 1, role: "admin_master" },
      req: {} as never,
      res: {} as never,
    });
    const events = await caller.eventsByDoctorUnit({
      unit_id: 12,
      doctor_user_id: 31,
      reference_date: "2026-08-21T12:00:00.000Z",
    });

    expect(events).toEqual([expect.objectContaining({
      id: "catalog-71",
      source: "catalog",
      patient_name: "MARIA DE SOUZA",
      study_date: studyDate,
      modality_snapshot: "CR",
    })]);
  });
});
