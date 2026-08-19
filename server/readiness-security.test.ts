import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routerPath = path.resolve(__dirname, "routers", "sla.ts");

describe("segurança de readiness por estudo e unidade", () => {
  it("autoriza o estudo e confirma a unidade antes da consulta individual", async () => {
    const source = await fs.readFile(routerPath, "utf8");
    const routeStart = source.indexOf("getByStudy: protectedProcedure");
    const routeEnd = source.indexOf("/** Retorna readiness de múltiplos estudos", routeStart);
    const route = source.slice(routeStart, routeEnd);

    expect(route).toContain('assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies")');
    expect(route).toContain("authorizedUnitId !== input.unitId");
  });

  it("consulta readiness em lote somente para estudos autorizados na unidade solicitada", async () => {
    const source = await fs.readFile(routerPath, "utf8");
    const routeStart = source.indexOf("getBatchStatus: protectedProcedure");
    const routeEnd = source.indexOf("/** Invalida o readiness", routeStart);
    const route = source.slice(routeStart, routeEnd);

    expect(route).toContain('assertDicomFileAccess(ctx.user, studyInstanceUid, "view_studies")');
    expect(route).toContain("authorizedUnitId === input.unitId");
    expect(route).toContain("const allowedStudyUids");
    expect(route).toContain("inArray(report_readiness.study_instance_uid, allowedStudyUids)");
    expect(route).not.toContain("inArray(report_readiness.study_instance_uid, input.studyInstanceUids)");
  });
});
