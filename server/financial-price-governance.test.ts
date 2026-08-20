import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Governança de preço por assinatura', () => {
  it('mantém evento pendente quando não existe preço médico vigente, sem usar preço padrão da unidade', async () => {
    const db = await fs.readFile(path.resolve(__dirname, 'db.ts'), 'utf-8');
    const start = db.indexOf('export async function createBillingVisitEvent');
    const end = db.indexOf('// P9 (v50)', start);
    const billing = db.slice(start, end);

    expect(billing).toContain('cada assinatura sem preço médico vigente permanece');
    expect(billing).not.toContain('default_doctor_price');
    expect(billing).toContain('pending_doctor_price');
    expect(billing).toContain('reportKey = `report_${data.report_id}`');
  });

  it('autoriza preços apenas para admin_master ou responsável financeiro vinculado à unidade', async () => {
    const finance = await fs.readFile(path.resolve(__dirname, 'routers', 'financeSimple.ts'), 'utf-8');
    expect(finance).toContain('async function assertCanManageFinancialPrices');
    expect(finance).toContain("user.role !== 'responsavel_financeiro'");
    expect(finance).toContain('await assertCanAccessFinancialUnit(db, user, unitId);');
    expect(finance).toContain('await assertCanManageFinancialPrices(db, ctx.user, input.unitId, input.financialResponsibleId);');
  });

  it('exige ciclo futuro para alterar preço já vigente por modalidade e preserva a vigência anterior', async () => {
    const finance = await fs.readFile(path.resolve(__dirname, 'routers', 'financeSimple.ts'), 'utf-8');
    expect(finance).toContain('async function assertCycleAlignedPriceStart');
    expect(finance).toContain('alteração de preço já vigente deve iniciar somente em um novo ciclo financeiro');
    expect(finance).toContain('await assertCycleAlignedPriceStart(db, input.unitId, startsAt, activeRows.length > 0);');
    expect(finance).toContain('.set({ ends_at: new Date(startsAt.getTime() - 1000) })');
  });

  it('mantém o painel do médico separado por unidade e exibe preço pendente', async () => {
    const page = await fs.readFile(path.resolve(__dirname, '..', 'client', 'src', 'pages', 'finance', 'FinanceMeuFinanceiro.tsx'), 'utf-8');
    expect(page).toContain('Dados exclusivos de');
    expect(page).toContain('Nenhum valor de outra unidade é somado nesta tela.');
    expect(page).toContain('unit_id: unitId ?? 0');
    expect(page).toContain('Preço pendente');
  });

  it('permite ao responsável financeiro abrir a gestão de preços sem administrar ciclos ou vínculos', async () => {
    const app = await fs.readFile(path.resolve(__dirname, '..', 'client', 'src', 'App.tsx'), 'utf-8');
    expect(app).toContain("/financeiro/configuracao\" component={() => <ProtectedRoute component={FinanceConfiguracao} allowedRoles={['admin_master', 'responsavel_financeiro']} />}");

    const responsible = await fs.readFile(path.resolve(__dirname, '..', 'client', 'src', 'pages', 'finance', 'FinanceMeuResponsavel.tsx'), 'utf-8');
    expect(responsible).toContain("navigate('/financeiro/configuracao')");

    const configuration = await fs.readFile(path.resolve(__dirname, '..', 'client', 'src', 'pages', 'finance', 'FinanceConfiguracao.tsx'), 'utf-8');
    expect(configuration).toContain("const isAdminMaster = currentUser?.role === 'admin_master';");
    expect(configuration).toContain('{isAdminMaster && (\n              <ResponsavelPanel');
  });
});
