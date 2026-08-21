import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  responses: [] as unknown[][],
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
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
      insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => state.inserts.push(value)) })),
    })),
  };
});

import { createCatalogEventsWhenComplete } from "./catalogFinancial";

describe("Composição de legendas clínicas por estudo", () => {
  beforeEach(() => {
    state.responses = [];
    state.inserts = [];
  });

  it("cria evento somente para a seleção cujo documento foi assinado, sem colidir com outra legenda do mesmo estudo", async () => {
    const current = { starts_at: new Date("2026-08-01T00:00:00.000Z"), ends_at: null };
    const selectionA = {
      id: 101, unit_id: 12, exam_legend_id: 1, exam_name_snapshot: "CRÂNIO", modality_snapshot: "CR",
      financial_event_count: 1, documents_snapshot: [{ key: "legend_1_document_1" }], lockedAt: null,
    };
    const selectionB = {
      id: 102, unit_id: 12, exam_legend_id: 2, exam_name_snapshot: "TÓRAX", modality_snapshot: "CR",
      financial_event_count: 1, documents_snapshot: [{ key: "legend_2_document_1" }], lockedAt: null,
    };
    state.responses = [
      [selectionA, selectionB],
      [{ document_key: "legend_1_document_1" }],
      [],
      [],
      [{ ...current, price_per_event: "18.00" }],
      [{ ...current, price_per_report: "3.50" }],
    ];

    const result = await createCatalogEventsWhenComplete({
      studyUid: "1.2.840", unitId: 12, doctorUserId: 31,
      documentKey: "legend_1_document_1", signedAt: new Date("2026-08-21T12:00:00.000Z"),
    });

    expect(result).toEqual({ handled: true, created: 1 });
    expect(state.inserts).toEqual([[
      expect.objectContaining({ study_selection_id: 101, exam_name_snapshot: "CRÂNIO" }),
    ]]);
  });
});
