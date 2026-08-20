import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("composição de legendas clínicas por estudo", () => {
  it("permite uma seleção auditável por legenda no mesmo estudo e unidade", () => {
    const schema = read("drizzle/schema.ts");
    const migration = read("drizzle/0051_multi_legend_selection_unit_availability.sql");

    expect(schema).toContain(".on(t.study_instance_uid, t.unit_id, t.exam_legend_id)");
    expect(migration).toContain("ADD UNIQUE INDEX `uq_study_unit_legend_selection` (`study_instance_uid`, `unit_id`, `exam_legend_id`)");
  });

  it("confirma o conjunto de legendas e usa chaves de documento próprias para evitar colisões entre laudos", () => {
    const router = read("server/routers/studyExamLegend.ts");

    expect(router).toContain("confirmSelections");
    expect(router).toContain("examLegendIds: z.array(z.number().int().positive()).min(1).max(20)");
    expect(router).toContain("return `legend_${legendId}_document_${documentId}`");
    expect(router).toContain("não pode ser removida após a primeira assinatura");
  });

  it("bloqueia e consolida somente a legenda que possui o documento assinado", () => {
    const coordinator = read("server/catalogFinancial.ts");
    const reports = read("server/routers/reports.ts");

    expect(coordinator).toContain("documentKey: string");
    expect(coordinator).toContain("document.key === input.documentKey");
    expect(reports).toContain("documentKey: report.document_key");
  });
});

describe("disponibilidade de legenda por unidade e financeiro", () => {
  it("mantém a disponibilidade global como padrão e salva somente exceções bloqueadas", () => {
    const db = read("server/db.ts");
    const catalog = read("server/routers/examCatalog.ts");
    const page = read("client/src/pages/ExamCatalogPage.tsx");

    expect(db).toContain("replaceExamLegendUnitAvailability");
    expect(db).toContain("is_available: false");
    expect(catalog).toContain("unavailableUnitIds");
    expect(page).toContain("Disponibilidade por unidade");
    expect(page).toContain("Autorizar todas");
  });

  it("inclui eventos do catálogo no extrato e no total financeiro da unidade", () => {
    const finance = read("server/routers/financeSimple.ts");

    expect(finance).toContain("billing_catalog_study_events");
    expect(finance).toContain("total_eventos");
    expect(finance).toContain('source: "catalog" as const');
  });
});
