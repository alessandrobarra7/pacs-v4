import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Guarda do reprocessamento financeiro legado', () => {
  it('exclui qualquer estudo que já possua seleção de legenda canônica', async () => {
    const source = await fs.readFile(path.resolve(__dirname, 'routers', 'financeSimple.ts'), 'utf-8');
    const start = source.indexOf('reprocessBillingEvents: protectedProcedure');
    const end = source.indexOf('// ─── Procedimentos migrados de billing.ts', start);
    const reprocessProcedure = source.slice(start, end);

    expect(reprocessProcedure).toContain('study_exam_legend_selections');
    expect(reprocessProcedure).toContain('eq(study_exam_legend_selections.study_instance_uid, reports.study_instance_uid)');
    expect(reprocessProcedure).toContain('eq(study_exam_legend_selections.unit_id, reports.unit_id)');
    expect(reprocessProcedure).toContain('isNull(study_exam_legend_selections.id)');
  });

  it('mantém a procura limitada a eventos legados ausentes', async () => {
    const source = await fs.readFile(path.resolve(__dirname, 'routers', 'financeSimple.ts'), 'utf-8');
    const start = source.indexOf('reprocessBillingEvents: protectedProcedure');
    const end = source.indexOf('// ─── Procedimentos migrados de billing.ts', start);
    const reprocessProcedure = source.slice(start, end);

    expect(reprocessProcedure).toContain('isNull(billing_visit_events.id)');
    expect(reprocessProcedure).toContain('createBillingVisitEvent');
  });
});
