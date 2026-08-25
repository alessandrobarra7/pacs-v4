import { describe, expect, it } from "vitest";
import { normalizeStudyDate, studyDateToUtcDate } from "./studyDate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const reportSource = readFileSync(resolve(root, "server/routers/reports.ts"), "utf8");
const financeSource = readFileSync(resolve(root, "server/routers/financeSimple.ts"), "utf8");
const pacsSource = readFileSync(resolve(root, "server/routers/pacs.ts"), "utf8");

describe("snapshot da data clínica do estudo", () => {
  it("normaliza data DICOM e ISO sem alterar o dia", () => {
    expect(normalizeStudyDate("20260824")).toBe("2026-08-24");
    expect(normalizeStudyDate("2026-08-24")).toBe("2026-08-24");
    expect(studyDateToUtcDate("20260824")?.toISOString()).toBe("2026-08-24T00:00:00.000Z");
  });

  it("recusa valores inválidos em vez de usar uma data clínica incorreta", () => {
    expect(normalizeStudyDate("24/08/2026")).toBeNull();
    expect(normalizeStudyDate("")).toBeNull();
  });

  it("persiste o snapshot ao assinar e o PDF financeiro o prioriza", () => {
    expect(reportSource).toContain("study_date_snapshot: studyDateToUtcDate(studyDateSnapshot)");
    expect(financeSource).toContain("COALESCE(${reports.study_date_snapshot}, ${studies_cache.study_date})");
  });

  it("aguarda o cache PACS antes de liberar a resposta da consulta", () => {
    expect(pacsSource).toContain("await Promise.allSettled(upsertPromises)");
  });
});
