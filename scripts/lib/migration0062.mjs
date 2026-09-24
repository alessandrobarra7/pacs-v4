import { readFile } from 'fs/promises';

export async function readMigrationSql(sqlPath) {
  return readFile(sqlPath, 'utf8');
}

export async function getIndexColumns(conn, table, indexName) {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME AS col FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
       ORDER BY SEQ_IN_INDEX`,
    [table, indexName],
  );
  return rows.map((r) => r.col);
}

export async function findDuplicateUserLinks(conn) {
  const [rows] = await conn.execute(
    `SELECT user_id, COUNT(*) AS n FROM financial_responsible_users
       GROUP BY user_id HAVING COUNT(*) > 1`,
  );
  return rows;
}

/**
 * FIX (2026-09-23, revisão Manus — bloqueio crítico 1 da 2ª rodada): o
 * índice final desta migration mudou de nome (uq_resp_user -> uq_resp_user_id,
 * ver comentário no .sql). O preflight/postcheck precisam reconhecer os DOIS
 * estados seguros do banco:
 *   - "before": ainda tem o índice antigo `uq_resp_user` composto
 *     (financial_responsible_id, user_id) — migration ainda não rodou aqui.
 *   - "after":  já tem o índice novo `uq_resp_user_id` em (user_id) sozinho e
 *     o antigo `uq_resp_user` não existe mais — migration já foi aplicada
 *     com sucesso neste banco, não é um erro, é sucesso idempotente.
 * Qualquer outra combinação é "unknown" e o script deve recusar mexer.
 */
export async function getMigrationState(conn) {
  const oldCols = await getIndexColumns(conn, 'financial_responsible_users', 'uq_resp_user');
  const newCols = await getIndexColumns(conn, 'financial_responsible_users', 'uq_resp_user_id');

  const oldIsComposite = oldCols.length === 2 &&
    oldCols.includes('financial_responsible_id') && oldCols.includes('user_id');
  const newIsSingleColumn = newCols.length === 1 && newCols[0] === 'user_id';

  if (oldIsComposite && newCols.length === 0) {
    return { state: 'before', oldCols, newCols };
  }
  if (newIsSingleColumn && oldCols.length === 0) {
    return { state: 'after', oldCols, newCols };
  }
  return { state: 'unknown', oldCols, newCols };
}

export async function getPreflightChecks(conn) {
  const checks = [];
  const duplicates = await findDuplicateUserLinks(conn);
  checks.push({
    label: 'nenhum user_id vinculado a mais de um responsável',
    ok: duplicates.length === 0,
    duplicates,
  });

  const migrationState = await getMigrationState(conn);
  checks.push({
    label: 'estado do índice reconhecido (antes da migration OU já aplicada com sucesso)',
    ok: migrationState.state === 'before' || migrationState.state === 'after',
    migrationState,
  });

  return checks;
}

export async function getPostMigrationChecks(conn) {
  const migrationState = await getMigrationState(conn);
  return [{
    label: 'índice uq_resp_user_id agora é (user_id) sozinho, e uq_resp_user antigo não existe mais',
    ok: migrationState.state === 'after',
    migrationState,
  }];
}

export async function executeWholeMigration(conn, sql) {
  await conn.query(sql);
}

export function allChecksPass(checks) {
  return checks.every((check) => check.ok);
}

export function formatChecks(checks) {
  return checks.map((check) => `${check.ok ? '  ✓' : '  ✗'} ${check.label}`);
}
