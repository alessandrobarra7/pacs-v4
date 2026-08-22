import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  responses: [] as unknown[][],
  updates: [] as unknown[],
  inserts: [] as unknown[],
}));

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getDb: vi.fn(async () => ({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(state.responses.shift() ?? [])),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => ({
          where: vi.fn(async () => state.updates.push(value)),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async (value: unknown) => state.inserts.push(value)),
      })),
    })),
  };
});

import { createCatalogEventsWhenComplete } from "./catalogFinancial";

const signedAt = new Date("2026-08-21T12:00:00.000Z");
const twoDocumentsSelection = {
  id: 64,
  unit_id: 12,
  exam_legend_id: 9,
  exam_name_snapshot: "COLUNA TOTAL",
  modality_snapshot: "MR",
  financial_event_count: 1,
  documents_snapshot: [{ key: "cervical" }, { key: "lombar" }],
  lockedAt: null,
};

describe("Bloqueio clínico e eventos financeiros do catálogo", () => {
  beforeEach(() => {
    state.responses = [];
    state.updates = [];
    state.inserts = [];
  });

  it("bloqueia a seleção na primeira assinatura mesmo quando ainda faltam documentos", async () => {
    state.responses = [
      [twoDocumentsSelection],
      [{ document_key: "cervical" }],
    ];

    const result = await createCatalogEventsWhenComplete({
      studyUid: "1.2.840", unitId: 12, doctorUserId: 31, documentKey: "cervical", reportId: 91, billingOccurrence: 1, signedAt,
    });

    expect(result).toEqual({ handled: true, created: 0 });
    expect(state.updates).toEqual([{ lockedAt: signedAt }]);
    expect(state.inserts).toEqual([]);
  });

  it("cria os eventos somente quando todos os documentos exigidos estão assinados", async () => {
    const current = { starts_at: new Date("2026-08-01T00:00:00.000Z"), ends_at: null };
    state.responses = [
      [twoDocumentsSelection],
      [{ document_key: "cervical" }, { document_key: "lombar" }],
      [],
      [],
      [{ ...current, price_per_event: "90.00" }],
      [{ ...current, price_per_report: "3.50" }],
    ];

    const result = await createCatalogEventsWhenComplete({
      studyUid: "1.2.840", unitId: 12, doctorUserId: 31, documentKey: "lombar", reportId: 91, billingOccurrence: 1, signedAt,
    });

    expect(result).toEqual({ handled: true, created: 1 });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toEqual([expect.objectContaining({
      exam_name_snapshot: "COLUNA TOTAL",
      billing_occurrence: 1,
      source_report_id: 91,
      doctor_price_source: "unit_modality_fallback",
      pricing_status: "ok",
    })]);
  });

  it("cria nova ocorrência após o cancelamento da cobrança anterior", async () => {
    const current = { starts_at: new Date("2026-08-01T00:00:00.000Z"), ends_at: null };
    state.responses = [
      [twoDocumentsSelection],
      [{ document_key: "cervical" }, { document_key: "lombar" }],
      [],
      [],
      [{ ...current, price_per_event: "90.00" }],
      [{ ...current, price_per_report: "3.50" }],
    ];

    const result = await createCatalogEventsWhenComplete({
      studyUid: "1.2.840", unitId: 12, doctorUserId: 31, documentKey: "lombar", reportId: 102, billingOccurrence: 2, signedAt,
    });

    expect(result).toEqual({ handled: true, created: 1 });
    expect(state.inserts[0]).toEqual([expect.objectContaining({
      billing_occurrence: 2,
      source_report_id: 102,
      event_index: 1,
    })]);
  });
});
