import { readFile } from 'fs/promises';

export const REQUIRED_ENUM_VALUES = [
  'GRANT_FINANCIAL_RESPONSIBLE_ACCESS',
  'REVOKE_FINANCIAL_RESPONSIBLE_ACCESS',
];

export async function readMigrationSql(sqlPath) {
  return readFile(sqlPath, 'utf8');
}

export async function tableExists(conn, table) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function getAuditActionEnum(conn) {
  const [rows] = await conn.execute(
    `SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_log' AND COLUMN_NAME = 'action'`,
  );
  return String(rows[0]?.t ?? '');
}

function enumHasValue(enumColumnType, value) {
  return enumColumnType.includes(`'${value}'`);
}

export async function getPreflightChecks(conn) {
  const checks = [];
  const hasAuditLog = await tableExists(conn, 'audit_log');
  checks.push({ label: 'tabela audit_log existe', ok: hasAuditLog });
  if (!hasAuditLog) return checks;

  const enumType = await getAuditActionEnum(conn);
  for (const value of REQUIRED_ENUM_VALUES) {
    checks.push({
      label: `audit_log.action ainda NÃO contém '${value}' (esperado antes da migration)`,
      ok: !enumHasValue(enumType, value),
    });
  }
  return checks;
}

export async function getPostMigrationChecks(conn) {
  const checks = [];
  const enumType = await getAuditActionEnum(conn);
  for (const value of REQUIRED_ENUM_VALUES) {
    checks.push({
      label: `audit_log.action agora contém '${value}'`,
      ok: enumHasValue(enumType, value),
    });
  }
  return checks;
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
