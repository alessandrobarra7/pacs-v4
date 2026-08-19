import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routerPath = path.resolve(__dirname, "routers", "annotations.ts");

describe("segurança das anotações Cornerstone", () => {
  it("exige view_studies antes de ler ou salvar anotações de um estudo", async () => {
    const source = await fs.readFile(routerPath, "utf8");
    const getStart = source.indexOf("getByStudy: protectedProcedure");
    const getEnd = source.indexOf("save: protectedProcedure", getStart);
    const getRoute = source.slice(getStart, getEnd);
    const saveStart = getEnd;
    const saveEnd = source.indexOf("delete: protectedProcedure", saveStart);
    const saveRoute = source.slice(saveStart, saveEnd);

    expect(getRoute).toContain('assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies")');
    expect(saveRoute).toContain('assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies")');
  });
});
