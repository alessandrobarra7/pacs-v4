import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dashboard = readFileSync(resolve(process.cwd(), "client/src/pages/finance/FinanceDashboard.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const pacsQuery = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");
const financeRouter = readFileSync(resolve(process.cwd(), "server/routers/financeSimple.ts"), "utf8");
const schema = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");

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

  it("mantém taxa LAUDS, eventos e soma do sistema sem métricas descartadas", () => {
    expect(dashboard).toContain("Taxa LAUDS por evento");
    expect(dashboard).toContain("Eventos no ciclo");
    expect(dashboard).toContain("Soma para o sistema");
    expect(dashboard).not.toContain("Margem atual");
    expect(dashboard).not.toContain("Soma individual por médico");
    expect(dashboard).not.toContain("Total de repasses médicos");
  });

  it("expõe a matriz persistida por modalidade e a edição direta dos médicos", () => {
    expect(dashboard).toContain('const MODALITIES = ["CT", "CR", "MR", "US"]');
    expect(dashboard).toContain("Valor vigente por modalidade");
    expect(dashboard).toContain("UnitModalityPrices");
    expect(dashboard).toContain("DoctorModalityCells");
    expect(dashboard).toContain("Médicos envolvidos — preços por modalidade");
    expect(dashboard).not.toContain("Editar preços");
  });

  it("mantém preços padrão por modalidade em tabela auditável e publica nova vigência", () => {
    expect(schema).toContain('billing_unit_modality_prices');
    expect(schema).toContain('uq_unit_modality_price_start');
    expect(financeRouter).toContain('getUnitModalityPrices');
    expect(financeRouter).toContain('setUnitModalityPrice');
    expect(financeRouter).toContain('getUnitSystemRate');
    expect(financeRouter).toContain('setUnitSystemRate');
    expect(financeRouter).toContain('assertCycleAlignedPriceStart');
    expect(financeRouter).toContain('if (startsAt.getTime() < currentCycle.endDate.getTime()) startsAt = currentCycle.endDate');
    expect(financeRouter).toContain('ends_at: new Date(now.getTime() - 1000)');
  });

  it("inclui eventos de catálogo nas métricas da unidade e usa o total auditável do sistema", () => {
    expect(financeRouter).toContain('const [legacyRows, catalogRows] = await Promise.all([');
    expect(financeRouter).toContain('billing_catalog_study_events.system_amount_due');
    expect(financeRouter).toContain('billing_catalog_study_events.price_applied');
    expect(dashboard).toContain('const systemCycleTotal = asMoney(unit.system_total);');
  });
});
