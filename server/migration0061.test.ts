import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';
import {
  allChecksPass,
  executeWholeMigration,
  getPostMigrationChecks,
  getPreflightChecks,
} from '../scripts/lib/migration0061.mjs';

function createInformationSchemaConnection(options: {
  hasAuditLog: boolean;
  auditEnum?: string;
}) {
  const execute = vi.fn(async (statement: string) => {
    if (statement.includes('INFORMATION_SCHEMA.TABLES')) {
      return [[{ n: options.hasAuditLog ? 1 : 0 }], []];
    }
    if (statement.includes("TABLE_NAME = 'audit_log'")) {
      return [[{ t: options.auditEnum ?? '' }], []];
    }
    throw new Error(`Consulta não prevista: ${statement}`);
  });
  return { execute, query: vi.fn(async () => [] as unknown[]) };
}

describe('migration 0061 — preflight e executor integral', () => {
  it('reprova quando audit_log não existe, sem tocar em DDL', async () => {
    const conn = createInformationSchemaConnection({ hasAuditLog: false });

    const checks = await getPreflightChecks(conn as never);

    expect(allChecksPass(checks)).toBe(false);
    expect(conn.query).not.toHaveBeenCalled();
  });

  it('reprova quando o enum já contém algum dos valores novos (migration já aplicada)', async () => {
    const conn = createInformationSchemaConnection({
      hasAuditLog: true,
      auditEnum: "enum('LOGIN','GRANT_FINANCIAL_RESPONSIBLE_ACCESS')",
    });

    const checks = await getPreflightChecks(conn as never);

    expect(allChecksPass(checks)).toBe(false);
    expect(conn.query).not.toHaveBeenCalled();
  });

  it('aprova preflight quando audit_log existe e nenhum valor novo está no enum ainda', async () => {
    const conn = createInformationSchemaConnection({
      hasAuditLog: true,
      auditEnum: "enum('LOGIN','LOGOUT')",
    });

    const checks = await getPreflightChecks(conn as never);

    expect(allChecksPass(checks)).toBe(true);
  });

  it('envia o arquivo SQL inteiro uma única vez, sem parsing manual por ponto e vírgula', async () => {
    const sql = await readFile('drizzle/0061_financial_responsible_user_access_audit.sql', 'utf8');
    const query = vi.fn(async () => [] as unknown[]);

    await executeWholeMigration({ query } as never, sql);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(sql);
    const sentSql = query.mock.calls[0][0] as string;
    expect(sentSql).toContain('ALTER TABLE `audit_log`');
    expect(sentSql).toContain('GRANT_FINANCIAL_RESPONSIBLE_ACCESS');
    expect(sentSql).toContain('REVOKE_FINANCIAL_RESPONSIBLE_ACCESS');
  });

  it('só aprova a pós-validação quando os dois valores novos existem no enum', async () => {
    const conn = createInformationSchemaConnection({
      hasAuditLog: true,
      auditEnum: "enum('LOGIN','GRANT_FINANCIAL_RESPONSIBLE_ACCESS','REVOKE_FINANCIAL_RESPONSIBLE_ACCESS')",
    });

    const checks = await getPostMigrationChecks(conn as never);

    expect(checks).toHaveLength(2);
    expect(allChecksPass(checks)).toBe(true);
  });

  it('reprova a pós-validação se algum dos dois valores não foi aplicado', async () => {
    const conn = createInformationSchemaConnection({
      hasAuditLog: true,
      auditEnum: "enum('LOGIN','GRANT_FINANCIAL_RESPONSIBLE_ACCESS')",
    });

    const checks = await getPostMigrationChecks(conn as never);

    expect(allChecksPass(checks)).toBe(false);
  });
});
