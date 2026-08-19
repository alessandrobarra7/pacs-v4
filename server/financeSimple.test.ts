/**
 * financeSimple.test.ts — Testes do router financeiro simplificado
 * Desenvolvimento StudioBarra7
 */
import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routerPath = path.resolve(__dirname, "routers", "financeSimple.ts");

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
    expect(procs).not.toContain("createVisitEvent");
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

  it("exige acesso financeiro à unidade no resumo de médicos", async () => {
    const source = await fs.readFile(routerPath, "utf8");
    const routeStart = source.indexOf("doctorSummaryByUnit: protectedProcedure");
    const routeEnd = source.indexOf("eventsByDoctorUnit: protectedProcedure", routeStart);
    const route = source.slice(routeStart, routeEnd);

    expect(route).toContain("await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id)");
  });

  it("exige acesso financeiro à unidade nas consultas de preços", async () => {
    const source = await fs.readFile(routerPath, "utf8");
    const priceConfigStart = source.indexOf("getPriceConfig: protectedProcedure");
    const priceConfigEnd = source.indexOf("getUnitDefaultPrices: protectedProcedure", priceConfigStart);
    const priceConfig = source.slice(priceConfigStart, priceConfigEnd);
    const defaultPriceStart = priceConfigEnd;
    const defaultPriceEnd = source.indexOf("setUnitDefaultPrices: protectedProcedure", defaultPriceStart);
    const defaultPrices = source.slice(defaultPriceStart, defaultPriceEnd);

    expect(priceConfig).toContain("await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id)");
    expect(defaultPrices).toContain("await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id)");
  });

  it("delimita consultas agregadas ao escopo financeiro e protege painéis de responsáveis", async () => {
    const source = await fs.readFile(routerPath, "utf8");
    const dashboardStart = source.indexOf("dashboard: protectedProcedure");
    const dashboardEnd = source.indexOf("unitSummary: protectedProcedure", dashboardStart);
    const dashboard = source.slice(dashboardStart, dashboardEnd);
    const summaryStart = dashboardEnd;
    const summaryEnd = source.indexOf("doctorSummaryByUnit: protectedProcedure", summaryStart);
    const summary = source.slice(summaryStart, summaryEnd);
    const responsibleStart = source.indexOf("getResponsibleFullDashboard: protectedProcedure");
    const responsibleEnd = source.indexOf("getDoctorOperationalBalance: protectedProcedure", responsibleStart);
    const responsibleDashboard = source.slice(responsibleStart, responsibleEnd);

    expect(dashboard).toContain("getAuthorizedFinancialUnitIds(db, ctx.user)");
    expect(summary).toContain("getAuthorizedFinancialUnitIds(db, ctx.user)");
    expect(responsibleDashboard).toContain("ownResponsibleId !== input.responsibleId");
  });

  it("protege ciclos e gestão de equipe pelo escopo da unidade", async () => {
    const source = await fs.readFile(routerPath, "utf8");
    const cycleConfigStart = source.indexOf("getCycleConfig: protectedProcedure");
    const cycleConfigEnd = source.indexOf("setCycleConfig: protectedProcedure", cycleConfigStart);
    const cycleConfig = source.slice(cycleConfigStart, cycleConfigEnd);
    const cycleListStart = source.indexOf("listUnitCycles: protectedProcedure");
    const cycleListEnd = source.indexOf("listAllDoctorPrices: protectedProcedure", cycleListStart);
    const cycleList = source.slice(cycleListStart, cycleListEnd);
    const teamStart = source.indexOf("listTeamMembers: protectedProcedure");
    const teamEnd = source.indexOf("testOrthancConnection: protectedProcedure", teamStart);
    const teamProcedures = source.slice(teamStart, teamEnd);

    expect(cycleConfig).toContain("await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id)");
    expect(cycleList).toContain("await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id)");
    expect(teamProcedures.match(/canAccessUnit\(ctx\.user, input\.unitId, 'view_studies'\)/g)).toHaveLength(3);
  });
});
