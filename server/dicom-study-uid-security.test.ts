import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidStudyInstanceUid, studyInstanceUidSchema } from "../server/routerUtils";

describe("contenção de traversal no download DICOM", () => {
  it("aceita somente UIDs DICOM numéricos pontuados e dentro do limite", () => {
    expect(studyInstanceUidSchema.safeParse("1.2.840.113619.2.55.3.604688119.868.1187175012.28").success).toBe(true);
    expect(studyInstanceUidSchema.safeParse("1").success).toBe(true);
  });

  it("rejeita entradas que não representam um UID DICOM sem acionar qualquer download", () => {
    for (const invalidValue of ["/etc", "..", ".", "1.2.3/../../etc", "1 2 3", "ABC.123", "1..2", ""]) {
      expect(studyInstanceUidSchema.safeParse(invalidValue).success).toBe(false);
      expect(isValidStudyInstanceUid(invalidValue)).toBe(false);
    }
  });

  it("reutiliza o schema nos routers que recebem identificador de estudo", () => {
    for (const file of ["pacs.ts", "reports.ts", "studyMetadata.ts", "annotations.ts", "anamnesis.ts", "anamnesisSimple.ts", "audioReports.ts", "financeSimple.ts", "sla.ts", "studyPriority.ts", "studyExamLegend.ts"]) {
      const source = readFileSync(resolve(process.cwd(), "server/routers", file), "utf8");
      expect(source).toContain("studyInstanceUidSchema");
    }
  });

  it("faz o auxiliar Python validar o UID e manter o caminho real dentro do cache antes de rmtree", () => {
    const source = readFileSync(resolve(process.cwd(), "server/dicom_move.py"), "utf8");
    expect(source).toContain('_STUDY_INSTANCE_UID_PATTERN = re.compile(r"^[0-9]+(?:\\.[0-9]+)*$")');
    expect(source).toContain("_STUDY_INSTANCE_UID_PATTERN.fullmatch(study_instance_uid)");
    expect(source).toContain("os.path.commonpath([cache_dir_real, study_cache_dir]) == cache_dir_real");
    expect(source.indexOf("path_is_within_cache")).toBeLessThan(source.indexOf("shutil.rmtree(study_cache_dir)"));
  });

  it("reutiliza a validação nas rotas HTTP de cache antes de qualquer remoção", () => {
    const source = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(source).toContain('import { isValidStudyInstanceUid } from "../routerUtils";');
    expect(source.match(/isValidStudyInstanceUid\(studyUid\)/g)?.length).toBeGreaterThanOrEqual(6);
    expect(source.indexOf("if (!isValidStudyInstanceUid(studyUid))", source.indexOf("app.delete('/api/dicom-files/:studyUid'")))
      .toBeLessThan(source.indexOf("fs.rm(studyDir, { recursive: true, force: true })"));
  });
});
