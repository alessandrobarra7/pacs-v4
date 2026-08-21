import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routerPath = path.resolve(__dirname, "routers", "anamnesisSimple.ts");

describe("segurança do status em lote de anamnese", () => {
  it("filtra a consulta pelos estudos com permissão view_anamnesis", async () => {
    const source = await fs.readFile(routerPath, "utf8");
    const routeStart = source.indexOf("getStatusBatch: protectedProcedure");
    const routeEnd = source.indexOf("}),\n\n});", routeStart);
    const batchRoute = source.slice(routeStart, routeEnd);

    expect(batchRoute).toContain("getStudyUnitId(studyInstanceUid)");
    expect(batchRoute).toContain("unitId: z.number().int().positive().optional()");
    expect(batchRoute).toContain("const accessUnitId = studyUnitId ?? input.unitId");
    expect(batchRoute).toContain('canAccessUnit(ctx.user, accessUnitId, "view_anamnesis")');
    expect(batchRoute).toContain("const allowedStudyUids");
    expect(batchRoute).toContain("inArray(anamnesis_simple.study_instance_uid, allowedStudyUids)");
    expect(batchRoute).not.toContain("inArray(anamnesis_simple.study_instance_uid, input.studyInstanceUids)");
  });
});
