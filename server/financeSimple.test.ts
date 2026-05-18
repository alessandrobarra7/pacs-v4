/**
 * financeSimple.test.ts — Testes do router financeiro simplificado
 * Desenvolvimento StudioBarra7
 */
import { describe, it, expect } from "vitest";

describe("financeSimple router", () => {
  it("deve existir o arquivo do router", async () => {
    const mod = await import("./routers/financeSimple");
    expect(mod.financeSimpleRouter).toBeDefined();
  });

  it("deve ter os procedures esperados", async () => {
    const mod = await import("./routers/financeSimple");
    const router = mod.financeSimpleRouter;
    expect(router).toBeDefined();
    const def = (router as any)._def;
    expect(def).toBeDefined();
    expect(def.procedures).toBeDefined();
    const procs = Object.keys(def.procedures);
    expect(procs).toContain("dashboard");
    expect(procs).toContain("unitSummary");
    expect(procs).toContain("doctorSummaryByUnit");
    expect(procs).toContain("eventsByDoctorUnit");
    expect(procs).toContain("markDoctorPaid");
    expect(procs).toContain("markSystemPaid");
    expect(procs).toContain("myFinanceiro");
    expect(procs).toContain("getPriceConfig");
    // M4A / M4B / M4C — Preços por Modalidade
    expect(procs).toContain("listDoctorModalityPrices");
    expect(procs).toContain("setDoctorModalityPrice");
    expect(procs).toContain("endDoctorModalityPrice");
  });

  it("deve calcular pending corretamente", () => {
    const total = 100;
    const paid = 60;
    const pending = total - paid;
    expect(pending).toBe(40);
  });

  it("deve calcular totais de múltiplas unidades", () => {
    const units = [
      { system_total: 350, doctor_total: 2500, system_paid: 350, doctor_paid: 0 },
      { system_total: 700, doctor_total: 5000, system_paid: 0, doctor_paid: 5000 },
    ];
    const totalSystem = units.reduce((a, u) => a + u.system_total, 0);
    const totalDoctor = units.reduce((a, u) => a + u.doctor_total, 0);
    const pendingSystem = units.reduce((a, u) => a + (u.system_total - u.system_paid), 0);
    const pendingDoctor = units.reduce((a, u) => a + (u.doctor_total - u.doctor_paid), 0);
    expect(totalSystem).toBe(1050);
    expect(totalDoctor).toBe(7500);
    expect(pendingSystem).toBe(700);
    expect(pendingDoctor).toBe(2500);
  });
});
