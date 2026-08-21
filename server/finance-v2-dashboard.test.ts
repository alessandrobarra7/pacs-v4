import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dashboard = readFileSync(resolve(process.cwd(), "client/src/pages/finance/FinanceDashboard.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");

describe("Financeiro v2 visual", () => {
  it("inicia o admin no catálogo financeiro por unidade", () => {
    expect(app).toContain("navigate('/financeiro/dashboard', { replace: true })");
    expect(dashboard).toContain("Financeiro por unidade");
    expect(dashboard).toContain("Abrir financeiro");
  });

  it("mantém separados taxa LAUDS, eventos, soma do sistema e repasses médicos", () => {
    expect(dashboard).toContain("Taxa LAUDS por evento");
    expect(dashboard).toContain("Eventos no ciclo");
    expect(dashboard).toContain("Soma para o sistema");
    expect(dashboard).toContain("Total de repasses médicos");
  });

  it("expõe a matriz de modalidades e a soma individual por médico", () => {
    expect(dashboard).toContain('const MODALITIES = ["CT", "CR", "MR", "US"]');
    expect(dashboard).toContain("Médicos envolvidos — preços por modalidade");
    expect(dashboard).toContain("Soma individual por médico");
  });
});
