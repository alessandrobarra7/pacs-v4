import { beforeEach, describe, expect, it, vi } from "vitest";
import { billing_catalog_study_events, billing_visit_events } from "../drizzle/schema";

const state = vi.hoisted(() => ({
  updates: [] as Array<{ table: unknown; values: Record<string, unknown> }> ,
}));

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getDb: vi.fn(async () => ({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ s: 1, e: 31 }]),
          })),
        })),
      })),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((values: Record<string, unknown>) => ({
          where: vi.fn(async () => {
            state.updates.push({ table, values });
            return [];
          }),
        })),
      })),
    })),
  };
});

import { financeSimpleRouter } from "./routers/financeSimple";

function caller(role: "admin_master" | "unit_admin" | "responsavel_financeiro") {
  return financeSimpleRouter.createCaller({
    user: { id: 77, role },
    req: {} as never,
    res: {} as never,
  });
}

describe("Baixa operacional dos eventos de catálogo", () => {
  beforeEach(() => {
    state.updates.length = 0;
  });

  it("marca no mesmo ciclo os eventos legados e de catálogo pagos ao médico", async () => {
    const result = await caller("admin_master").markDoctorPaid({
      unit_id: 12,
      doctor_user_id: 31,
      reference_date: "2026-08-15T12:00:00.000Z",
      note: "Repasse confirmado",
    });

    expect(result.success).toBe(true);
    expect(state.updates.map((update) => update.table)).toEqual([
      billing_visit_events,
      billing_catalog_study_events,
    ]);
    expect(state.updates[1].values).toMatchObject({
      doctor_received_by_user_id: 77,
      doctor_payment_note: "Repasse confirmado",
    });
    expect(state.updates[1].values.doctor_received_at).toBeInstanceOf(Date);
  });

  it("permite somente ao admin_master confirmar a obrigação da unidade com a LAUDS", async () => {
    await expect(caller("unit_admin").markSystemPaid({
      unit_id: 12,
      reference_date: "2026-08-15T12:00:00.000Z",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const result = await caller("admin_master").markSystemPaid({
      unit_id: 12,
      reference_date: "2026-08-15T12:00:00.000Z",
      note: "Recebimento LAUDS conciliado",
    });

    expect(result.success).toBe(true);
    expect(state.updates.map((update) => update.table)).toEqual([
      billing_visit_events,
      billing_catalog_study_events,
    ]);
    expect(state.updates[1].values).toMatchObject({
      system_paid_by_user_id: 77,
      system_payment_note: "Recebimento LAUDS conciliado",
    });
    expect(state.updates[1].values.system_paid_at).toBeInstanceOf(Date);
  });
});
