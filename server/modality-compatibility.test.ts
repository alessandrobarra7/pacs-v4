import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getSingleStudyModality, normalizeDicomModality } from "../shared/modality";

describe("compatibilidade entre modalidade DICOM, legenda e composição", () => {
  it("normaliza o rótulo clínico RM para o código DICOM MR", () => {
    expect(normalizeDicomModality(" rm ")).toBe("MR");
    expect(getSingleStudyModality("MR")).toBe("MR");
  });

  it("nega uma modalidade ausente ou múltipla quando a regra de negócio exige estudo único", () => {
    expect(getSingleStudyModality("")).toBeNull();
    expect(getSingleStudyModality("CT\\MR")).toBeNull();
    expect(getSingleStudyModality("CT,MR")).toBeNull();
  });

  it("resolve a modalidade no servidor e impede confirmar legenda incompatível", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers/studyExamLegend.ts"), "utf8");
    expect(source).toContain("const studyModality = await resolveStudyModality(db, input.studyInstanceUid, unitId);");
    expect(source).toContain("const incompatibleLegend = legends.find");
    expect(source).toContain('code: "BAD_REQUEST"');
    expect(source).toContain("incompatível com a modalidade do estudo");
  });
});
