import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dashboard = readFileSync(resolve(process.cwd(), "client/src/pages/finance/FinanceDashboard.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const pacsQuery = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");

describe("Financeiro v2 visual", () => {
  it("inicia o admin no catálogo financeiro por unidade", () => {
    expect(app).toContain("navigate('/financeiro/dashboard', { replace: true })");
    expect(app).toContain('allowedRoles={[\'admin_master\', \'unit_admin\', \'medico\', \'responsavel_financeiro\']}');
    expect(app).toContain("Abrindo financeiro...");
    expect(dashboard).toContain("Financeiro por unidade");
    expect(dashboard).toContain("Abrir financeiro");
  });

  it("leva o botão Financeiro do cabeçalho PACS para o catálogo novo", () => {
    expect(pacsQuery).toContain("navigate('/financeiro/dashboard');");
    expect(pacsQuery).not.toContain("navigate('/financeiro/pagamentos');");
  });

  it("expõe uma rota financeira estável para cada unidade", () => {
    expect(app).toContain('path="/financeiro/dashboard/:unitSlug"');
    expect(dashboard).toContain('useRoute("/financeiro/dashboard/:unitSlug")');
    expect(dashboard).toContain('navigate(`/financeiro/dashboard/${unitSlug(unit.unit_name)}`)');
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
