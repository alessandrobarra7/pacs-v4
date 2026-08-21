import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pacsSource = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");
const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
const reportsSource = readFileSync(resolve(process.cwd(), "server/routers/reports.ts"), "utf8");

describe("Assinatura na listagem PACS", () => {
  it("retorna o nome do assinante junto do estado agregado do estudo", () => {
    expect(dbSource).toContain("export type StudyReportStatus");
    expect(dbSource).toContain("signerNames: string[]");
    expect(dbSource).toContain("signedAt: Date | null");
    expect(dbSource).toContain("signerNameById");
  });

  it("consulta e apresenta a assinatura no escopo da unidade selecionada", () => {
    expect(reportsSource).toContain("statusByStudyUids");
    expect(reportsSource).toContain("unit_id: z.number().int().positive().optional()");
    expect(pacsSource).toContain("unit_id: effectiveUnitId ?? undefined");
    expect(pacsSource).toContain("const getReportSignerLabel");
    expect(pacsSource).toContain("Assinado por ${signerNames[0]}");
    expect(pacsSource).toContain("reportSignerLabel");
  });
});
