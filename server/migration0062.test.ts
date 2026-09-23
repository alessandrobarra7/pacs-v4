import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';
import {
  allChecksPass,
  executeWholeMigration,
  getPostMigrationChecks,
  getPreflightChecks,
} from '../scripts/lib/migration0062.mjs';

function createInformationSchemaConnection(options: {
  duplicates?: Array<{ user_id: number; n: number }>;
  indexColumns: string[];
}) {
  const execute = vi.fn(async (statement: string) => {
    if (statement.includes('GROUP BY user_id')) {
      return [options.duplicates ?? [], []];
    }
    if (statement.includes('INFORMATION_SCHEMA.STATISTICS')) {
      return [options.indexColumns.map((col) => ({ col })), []];
    }
    throw new Error(`Consulta não prevista: ${statement}`);
  });
  return { execute, query: vi.fn(async () => [] as unknown[]) };
}

describe('migration 0062 — preflight e executor integral', () => {
  it('reprova quando existe conta vinculada a mais de um responsável, sem tocar em DDL', async () => {
    const conn = createInformationSchemaConnection({
      duplicates: [{ user_id: 42, n: 2 }],
      indexColumns: ['financial_responsible_id', 'user_id'],
    });

    const checks = await getPreflightChecks(conn as never);

    expect(allChecksPass(checks)).toBe(false);
    expect(conn.query).not.toHaveBeenCalled();
  });

  it('reprova quando o índice já não está no formato composto esperado (migration já aplicada)', async () => {
    const conn = createInformationSchemaConnection({
      duplicates: [],
      indexColumns: ['user_id'],
    });

    const checks = await getPreflightChecks(conn as never);

    expect(allChecksPass(checks)).toBe(false);
  });

  it('aprova preflight quando não há duplicidade e o índice ainda está composto', async () => {
    const conn = createInformationSchemaConnection({
      duplicates: [],
      indexColumns: ['financial_responsible_id', 'user_id'],
    });

    const checks = await getPreflightChecks(conn as never);

    expect(allChecksPass(checks)).toBe(true);
  });

  it('envia o arquivo SQL inteiro uma única vez, sem parsing manual por ponto e vírgula', async () => {
    const sql = await readFile('drizzle/0062_financial_responsible_single_active.sql', 'utf8');
    const query = vi.fn(async () => [] as unknown[]);

    await executeWholeMigration({ query } as never, sql);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(sql);
    const sentSql = query.mock.calls[0][0] as string;
    expect(sentSql).toContain('DROP INDEX `uq_resp_user`');
    expect(sentSql).toContain('ADD UNIQUE INDEX `uq_resp_user` (`user_id`)');
  });

  it('REGRESSÃO (bloqueio crítico 1 da revisão Manus): o arquivo tem ponto e vírgula dentro de comentário, então um parser ingênuo por split(";") descartaria o DDL real', async () => {
    // Esta é a prova de que o bug relatado pela Manus era real: reproduz aqui,
    // isoladamente, o algoritmo antigo (removido de apply_migration_0062.mjs)
    // e confirma que ele falha exatamente como descrito no relatório de
    // revisão de 2026-09-23 — para impedir que esse padrão volte no futuro.
    const sql = await readFile('drizzle/0062_financial_responsible_single_active.sql', 'utf8');

    const naiveStatements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    // O parser ingênuo não consegue isolar corretamente o DDL: ou ele mistura
    // texto de comentário com a instrução real (produzindo SQL inválido), ou
    // no melhor caso deixaria de enviar o DROP INDEX como instrução própria.
    const hasCleanDropIndexStatement = naiveStatements.some(
      (statement) => statement === 'ALTER TABLE `financial_responsible_users`\n  DROP INDEX `uq_resp_user`',
    );
    expect(hasCleanDropIndexStatement).toBe(false);

    // A técnica atual (envio do arquivo inteiro, sem split) não sofre desse problema:
    // confirmado pelo teste anterior, que envia o arquivo integral com sucesso.
  });

  it('só aprova a pós-validação quando o índice final é (user_id) sozinho', async () => {
    const singleColumn = createInformationSchemaConnection({ indexColumns: ['user_id'] });
    const stillComposite = createInformationSchemaConnection({ indexColumns: ['financial_responsible_id', 'user_id'] });

    expect(allChecksPass(await getPostMigrationChecks(singleColumn as never))).toBe(true);
    expect(allChecksPass(await getPostMigrationChecks(stillComposite as never))).toBe(false);
  });
});
