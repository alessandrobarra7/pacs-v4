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

export async function getPreflightChecks(conn) {
  const checks = [];
  const duplicates = await findDuplicateUserLinks(conn);
  checks.push({
    label: 'nenhum user_id vinculado a mais de um responsável',
    ok: duplicates.length === 0,
    duplicates,
  });

  const currentIndexCols = await getIndexColumns(conn, 'financial_responsible_users', 'uq_resp_user');
  const isComposite = currentIndexCols.length === 2 &&
    currentIndexCols.includes('financial_responsible_id') && currentIndexCols.includes('user_id');
  checks.push({
    label: 'índice uq_resp_user está no formato composto esperado antes da migration',
    ok: isComposite,
    currentIndexCols,
  });

  return checks;
}

export async function getPostMigrationChecks(conn) {
  const newIndexCols = await getIndexColumns(conn, 'financial_responsible_users', 'uq_resp_user');
  const isSingleColumn = newIndexCols.length === 1 && newIndexCols[0] === 'user_id';
  return [{
    label: 'índice uq_resp_user agora é (user_id) sozinho',
    ok: isSingleColumn,
    newIndexCols,
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
