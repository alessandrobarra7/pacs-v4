import { readFile } from 'fs/promises';

export const REQUIRED_ENUM_VALUES = [
  'DOCTOR_PAYMENT_CONFIRMED',
  'DOCTOR_PAYMENT_DISPUTED',
  'SET_EXTERNAL_SALE_PRICE',
];

const PRECHECKS = [
  ['tabela billing_catalog_study_events existe', 'table', 'billing_catalog_study_events'],
  ['coluna billing_catalog_study_events.doctor_payment_note existe', 'column', 'billing_catalog_study_events', 'doctor_payment_note'],
  ['tabela billing_visit_events existe', 'table', 'billing_visit_events'],
  ['coluna billing_visit_events.doctor_received_by_user_id existe', 'column', 'billing_visit_events', 'doctor_received_by_user_id'],
  ['tabela audit_log existe', 'table', 'audit_log'],
  ['coluna audit_log.action existe', 'column', 'audit_log', 'action'],
];

const NEW_CONFIRMATION_COLUMNS = [
  ['billing_visit_events', 'doctor_confirmation_status'],
  ['billing_visit_events', 'doctor_confirmed_at'],
  ['billing_visit_events', 'doctor_confirmation_note'],
  ['billing_catalog_study_events', 'doctor_confirmation_status'],
  ['billing_catalog_study_events', 'doctor_confirmed_at'],
  ['billing_catalog_study_events', 'doctor_confirmation_note'],
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

export async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
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

export async function getPreflightChecks(conn) {
  const checks = [];
  for (const [label, kind, table, column] of PRECHECKS) {
    checks.push({
      label,
      ok: kind === 'table'
        ? await tableExists(conn, table)
        : await columnExists(conn, table, column),
    });
  }
  checks.push({
    label: 'tabela billing_external_sale_prices AINDA NÃO existe (idempotência)',
    ok: !(await tableExists(conn, 'billing_external_sale_prices')),
  });
  for (const [table, column] of NEW_CONFIRMATION_COLUMNS) {
    checks.push({
      label: `${table}.${column} AINDA NÃO existe (estado não parcial)`,
      ok: !(await columnExists(conn, table, column)),
    });
  }
  const auditActionEnum = await getAuditActionEnum(conn);
  checks.push({
    label: 'audit_log.action ainda não contém valores da 0060 (estado não parcial)',
    ok: REQUIRED_ENUM_VALUES.every((value) => !auditActionEnum.includes(value)),
  });
  return checks;
}

export async function getPostMigrationChecks(conn) {
  const checks = [
    { label: 'tabela billing_external_sale_prices existe', ok: await tableExists(conn, 'billing_external_sale_prices') },
    { label: 'billing_visit_events.doctor_confirmation_status existe', ok: await columnExists(conn, 'billing_visit_events', 'doctor_confirmation_status') },
    { label: 'billing_visit_events.doctor_confirmed_at existe', ok: await columnExists(conn, 'billing_visit_events', 'doctor_confirmed_at') },
    { label: 'billing_visit_events.doctor_confirmation_note existe', ok: await columnExists(conn, 'billing_visit_events', 'doctor_confirmation_note') },
    { label: 'billing_catalog_study_events.doctor_confirmation_status existe', ok: await columnExists(conn, 'billing_catalog_study_events', 'doctor_confirmation_status') },
    { label: 'billing_catalog_study_events.doctor_confirmed_at existe', ok: await columnExists(conn, 'billing_catalog_study_events', 'doctor_confirmed_at') },
    { label: 'billing_catalog_study_events.doctor_confirmation_note existe', ok: await columnExists(conn, 'billing_catalog_study_events', 'doctor_confirmation_note') },
  ];
  const enumDefinition = await getAuditActionEnum(conn);
  for (const value of REQUIRED_ENUM_VALUES) {
    checks.push({
      label: `audit_log.action contém '${value}'`,
      ok: enumDefinition.includes(value),
    });
  }
  return checks;
}

/**
 * Envia o arquivo SQL inteiro uma única vez para o driver com MULTI_STATEMENTS
 * habilitado exclusivamente nesta conexão de migration. Não faz split por ';':
 * comentários e SQL permanecem intactos, incluindo DDL precedido de comentários.
 */
export async function executeWholeMigration(conn, sql) {
  await conn.query(sql);
}

export function allChecksPass(checks) {
  return checks.every((check) => check.ok);
}

export function formatChecks(checks) {
  return checks.map((check) => `${check.ok ? '  ✓' : '  ✗'} ${check.label}`);
}
