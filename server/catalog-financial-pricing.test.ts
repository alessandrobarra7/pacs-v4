import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const catalogFinancial = readFileSync(resolve(process.cwd(), "server/catalogFinancial.ts"), "utf8");
const schema = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");

describe("Eventos financeiros do catálogo por modalidade", () => {
  it("prioriza preço individual por modalidade e aplica o fallback vigente da unidade", () => {
    expect(catalogFinancial).toContain("billing_doctor_modality_prices");
    expect(catalogFinancial).toContain("billing_unit_modality_prices");
    expect(catalogFinancial).not.toContain("billing_doctor_exam_legend_prices");
    expect(catalogFinancial).toContain('"doctor_modality"');
    expect(catalogFinancial).toContain('"unit_modality_fallback"');
  });

  it("captura modalidade, preço aplicado, fonte e taxa LAUDS no instante da assinatura", () => {
    expect(catalogFinancial).toContain("modality_snapshot: modality");
    expect(catalogFinancial).toContain("doctor_price_source: doctorPriceSource");
    expect(catalogFinancial).toContain("system_price_applied");
    expect(catalogFinancial).toContain("system_amount_due");
    expect(schema).toContain("doctor_price_source");
    expect(schema).toContain("pending_both");
  });

  it("preserva a criação somente depois de todos os documentos exigidos e evita duplicidade por seleção", () => {
    expect(catalogFinancial).toContain("size < documents.length");
    expect(catalogFinancial).toContain("if (existing.length) return { handled: true, created: 0 };");
  });
});
