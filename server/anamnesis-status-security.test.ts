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

    expect(batchRoute).toContain("resolveStudyUnitIdForStatusBatch(studyInstanceUid)");
    expect(batchRoute).toContain("unitId: z.number().int().positive().optional()");
    // CORREÇÃO (auditoria-seguranca-rbac-20261110): este teste antes afirmava
    // "const accessUnitId = studyUnitId ?? input.unitId" como comportamento
    // ESPERADO — exatamente o Achado 1 da auditoria de 2026-11-10 (fallback de
    // autorização para unidade fornecida pelo CLIENTE em estudos órfãos, com
    // vazamento booleano cross-unidade). A asserção foi invertida: agora o teste
    // garante que esse fallback NÃO existe mais na rota.
    expect(batchRoute).not.toContain("studyUnitId ?? input.unitId");
    expect(batchRoute).not.toContain("resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id)");
    expect(batchRoute).toContain('canAccessUnit(ctx.user, accessUnitId, "view_anamnesis")');
    expect(batchRoute).toContain("const allowedStudyUids");
    expect(batchRoute).toContain("inArray(anamnesis_simple.study_instance_uid, allowedStudyUids)");
    expect(batchRoute).not.toContain("inArray(anamnesis_simple.study_instance_uid, input.studyInstanceUids)");
  });

  it("resolveStudyUnitIdForStatusBatch consulta studies_cache antes de study_metadata (mesma ordem de assertDicomFileAccess)", async () => {
    const source = await fs.readFile(routerPath, "utf8");
    const fnStart = source.indexOf("async function resolveStudyUnitIdForStatusBatch");
    const fnEnd = source.indexOf("\n}", source.indexOf("return null;", fnStart)) ;
    const fn = source.slice(fnStart, fnEnd);

    const cacheIdx = fn.indexOf("studies_cache");
    const metadataIdx = fn.indexOf("study_metadata");
    expect(cacheIdx).toBeGreaterThan(-1);
    expect(metadataIdx).toBeGreaterThan(-1);
    expect(cacheIdx).toBeLessThan(metadataIdx);
  });
});
