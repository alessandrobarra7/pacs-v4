import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  responses: [] as unknown[][],
  inserts: [] as unknown[],
  updates: [] as unknown[],
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
const current = { starts_at: new Date("2026-08-01T00:00:00.000Z"), ends_at: null };

function selection(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    unit_id: 12,
    exam_legend_id: 8,
    exam_name_snapshot: "CRÂNIO",
    modality_snapshot: "CR",
    financial_event_count: 1,
    documents_snapshot: [{ key: "primary" }],
    lockedAt: null,
    ...overrides,
  };
}

function preparePricing({
  doctor = [],
  unit = [],
  system = [{ ...current, price_per_report: "3.50" }],
}: {
  doctor?: unknown[];
  unit?: unknown[];
  system?: unknown[];
} = {}) {
  state.responses = [
    [selection()],
    [{ document_key: "primary" }],
    [],
    doctor,
    unit,
    system,
  ];
}

describe("Precificação comportamental dos eventos de catálogo", () => {
  beforeEach(() => {
    state.responses = [];
    state.inserts = [];
    state.updates = [];
  });

  it("prioriza o preço individual vigente por modalidade sobre o fallback da unidade", async () => {
    preparePricing({
      doctor: [{ ...current, price_per_report: "10.00" }],
      unit: [{ ...current, price_per_event: "18.00" }],
    });

    const result = await createCatalogEventsWhenComplete({
      studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
    });

    expect(result).toEqual({ handled: true, created: 1 });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toEqual([expect.objectContaining({
      modality_snapshot: "CR",
      price_applied: "10",
      doctor_price_source: "doctor_modality",
      system_price_applied: "3.5",
      system_amount_due: "3.5",
      pricing_status: "ok",
    })]);
  });

  it("usa o valor vigente da unidade quando o médico não tem preço individual", async () => {
    preparePricing({
      unit: [{ ...current, price_per_event: "18.00" }],
    });

    await createCatalogEventsWhenComplete({
      studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
    });

    expect(state.inserts[0]).toEqual([expect.objectContaining({
      price_applied: "18",
      doctor_price_source: "unit_modality_fallback",
      pricing_status: "ok",
    })]);
  });

  it("preserva o evento pendente quando nenhuma fonte de preço médico está vigente", async () => {
    preparePricing();

    await createCatalogEventsWhenComplete({
      studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
    });

    expect(state.inserts[0]).toEqual([expect.objectContaining({
      price_applied: null,
      doctor_price_source: null,
      system_amount_due: "3.5",
      pricing_status: "pending_doctor_price",
    })]);
  });
});
