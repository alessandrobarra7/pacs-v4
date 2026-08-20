import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Bloqueio clínico e eventos financeiros do catálogo', () => {
  it('bloqueia a legenda antes de verificar se todos os documentos foram assinados', async () => {
    const source = await fs.readFile(path.resolve(__dirname, 'catalogFinancial.ts'), 'utf-8');
    const lockIndex = source.indexOf('isNull(study_exam_legend_selections.lockedAt)');
    const completionCheckIndex = source.indexOf('new Set(signed.map((item) => item.document_key)).size < documents.length');

    expect(lockIndex).toBeGreaterThan(-1);
    expect(completionCheckIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeLessThan(completionCheckIndex);
  });

  it('preserva a criação de eventos somente após a assinatura de todos os documentos', async () => {
    const source = await fs.readFile(path.resolve(__dirname, 'catalogFinancial.ts'), 'utf-8');

    expect(source).toContain('if (new Set(signed.map((item) => item.document_key)).size < documents.length) return { handled: true, created: 0 };');
    expect(source).toContain('await db.insert(billing_catalog_study_events).values');
  });
});
