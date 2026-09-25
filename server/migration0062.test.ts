import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';
import {
  allChecksPass,
  executeWholeMigration,
  getMigrationState,
  getPostMigrationChecks,
  getPreflightChecks,
} from '../scripts/lib/migration0062.mjs';

/**
 * Fake de conexão que responde por nome de índice: a query real de
 * getIndexColumns manda [table, indexName] como parâmetros, então o fake
 * decide o retorno pelo indexName pedido — exatamente como o banco real
 * responderia perguntas separadas para uq_resp_user (antigo, composto) e
 * uq_resp_user_id (novo, só em user_id).
 */
function createInformationSchemaConnection(options: {
  duplicates?: Array<{ user_id: number; n: number }>;
  oldIndexCols?: string[];
  newIndexCols?: string[];
}) {
  const execute = vi.fn(async (statement: string, params?: unknown[]) => {
    if (statement.includes('GROUP BY user_id')) {
      return [options.duplicates ?? [], []];
    }
    if (statement.includes('INFORMATION_SCHEMA.STATISTICS')) {
      const indexName = params?.[1];
      if (indexName === 'uq_resp_user') return [(options.oldIndexCols ?? []).map((col) => ({ col })), []];
      if (indexName === 'uq_resp_user_id') return [(options.newIndexCols ?? []).map((col) => ({ col })), []];
      throw new Error(`Índice não previsto no fake: ${String(indexName)}`);
    }
    throw new Error(`Consulta não prevista: ${statement}`);
  });
  return { execute, query: vi.fn(async () => [] as unknown[]) };
}

describe('migration 0062 — preflight e executor integral', () => {
  it('reprova quando existe conta vinculada a mais de um responsável, sem tocar em DDL', async () => {
    const conn = createInformationSchemaConnection({
      duplicates: [{ user_id: 42, n: 2 }],
      oldIndexCols: ['financial_responsible_id', 'user_id'],
    });

    const checks = await getPreflightChecks(conn as never);

    expect(allChecksPass(checks)).toBe(false);
    expect(conn.query).not.toHaveBeenCalled();
  });

  it('reconhece o estado "antes": índice antigo composto presente, novo ainda não existe', async () => {
    const conn = createInformationSchemaConnection({
      oldIndexCols: ['financial_responsible_id', 'user_id'],
      newIndexCols: [],
    });

    const state = await getMigrationState(conn as never);
    expect(state.state).toBe('before');

    const checks = await getPreflightChecks(conn as never);
    expect(allChecksPass(checks)).toBe(true);
  });

  it('FIX (2026-09-23, revisão Manus — bloqueio crítico 1 da 2ª rodada): reconhece o estado "depois" (já aplicada) como seguro, não como erro', async () => {
    const conn = createInformationSchemaConnection({
      oldIndexCols: [],
      newIndexCols: ['user_id'],
    });

    const state = await getMigrationState(conn as never);
    expect(state.state).toBe('after');

    // Antes desta correção, o preflight só reconhecia o nome antigo
    // (uq_resp_user) e bloqueava aqui achando que o schema era desconhecido,
    // mesmo com a migration já aplicada com sucesso.
    const checks = await getPreflightChecks(conn as never);
    expect(allChecksPass(checks)).toBe(true);
  });

  it('reprova (estado desconhecido) quando nem o índice antigo nem o novo batem com o esperado', async () => {
    const conn = createInformationSchemaConnection({
      oldIndexCols: ['user_id'], // formato estranho: velho nome, mas já só com 1 coluna
      newIndexCols: [],
    });

    const state = await getMigrationState(conn as never);
    expect(state.state).toBe('unknown');

    const checks = await getPreflightChecks(conn as never);
    expect(allChecksPass(checks)).toBe(false);
  });

  it('envia o arquivo SQL inteiro uma única vez, sem parsing manual por ponto e vírgula, e usa uq_resp_user_id como índice final', async () => {
    const sql = await readFile('drizzle/0062_financial_responsible_single_active.sql', 'utf8');
    const query = vi.fn(async () => [] as unknown[]);

    await executeWholeMigration({ query } as never, sql);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(sql);
    const sentSql = query.mock.calls[0][0] as string;
    expect(sentSql).toContain('DROP INDEX `uq_resp_user`');
    expect(sentSql).toContain('ADD UNIQUE INDEX `uq_resp_user_id` (`user_id`)');
    // O nome final não pode ser igual ao antigo: é justamente essa
    // igualdade de nomes que o TiDB rejeitava (bloqueio 1 da 2ª rodada).
    expect(sentSql).not.toContain('ADD UNIQUE INDEX `uq_resp_user` (`user_id`)');
  });

  it('REGRESSÃO (bloqueio crítico 1 da 1ª rodada): o arquivo tem ponto e vírgula dentro de comentário, então um parser ingênuo por split(";") descartaria o DDL real', async () => {
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

  it('só aprova a pós-validação quando uq_resp_user_id é (user_id) sozinho e o índice antigo uq_resp_user já não existe', async () => {
    const finalState = createInformationSchemaConnection({ oldIndexCols: [], newIndexCols: ['user_id'] });
    const stillComposite = createInformationSchemaConnection({ oldIndexCols: ['financial_responsible_id', 'user_id'], newIndexCols: [] });
    const bothPresent = createInformationSchemaConnection({ oldIndexCols: ['financial_responsible_id', 'user_id'], newIndexCols: ['user_id'] });

    expect(allChecksPass(await getPostMigrationChecks(finalState as never))).toBe(true);
    expect(allChecksPass(await getPostMigrationChecks(stillComposite as never))).toBe(false);
    // Estado intermediário/inesperado (os dois índices presentes ao mesmo tempo)
    // também não deve ser aprovado como "concluído com sucesso".
    expect(allChecksPass(await getPostMigrationChecks(bothPresent as never))).toBe(false);
  });
});
