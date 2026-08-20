import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Cadastro de usuários sem precificação concorrente', () => {
  it('não consulta nem altera preços financeiros no formulário de usuário', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '..', 'client', 'src', 'components', 'UserFormDialog.tsx'),
      'utf-8',
    );

    expect(source).not.toContain('getDoctorFullContext');
    expect(source).not.toContain('setDoctorPriceDirect');
    expect(source).not.toContain('pendingPrices');
    expect(source).not.toContain('showFinancialTabs');
    expect(source).not.toContain('value="valores"');
    expect(source).not.toContain('value="resumo"');
  });
});
