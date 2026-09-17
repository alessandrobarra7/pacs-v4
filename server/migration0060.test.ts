import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';
import {
  allChecksPass,
  executeWholeMigration,
  getPostMigrationChecks,
  getPreflightChecks,
} from '../scripts/lib/migration0060.mjs';

type MysqlQueryResult = [[{ n?: number; t?: string }], unknown[]];

function createInformationSchemaConnection(options: {
  tables: Record<string, boolean>;
  columns: Record<string, boolean>;
  auditEnum?: string;
}) {
  const execute = vi.fn(async (statement: string, values?: string[]): Promise<MysqlQueryResult> => {
    if (statement.includes("TABLE_NAME = 'audit_log'")) {
      return [[{ t: options.auditEnum ?? '' }], []];
    }
    if (statement.includes('INFORMATION_SCHEMA.TABLES')) {
      return [[{ n: options.tables[values?.[0] ?? ''] ? 1 : 0 }], []];
    }
    if (statement.includes('INFORMATION_SCHEMA.COLUMNS') && values?.length === 2) {
      return [[{ n: options.columns[`${values[0]}.${values[1]}`] ? 1 : 0 }], []];
    }
    throw new Error(`Consulta não prevista: ${statement}`);
  });
  return { execute, query: vi.fn(async () => [] as unknown[]) };
}

describe('migration 0060 — preflight e executor integral', () => {
  it('reprova dependência ausente antes de qualquer DDL', async () => {
    const conn = createInformationSchemaConnection({
      tables: {
        billing_catalog_study_events: false,
        billing_visit_events: true,
        audit_log: true,
        billing_external_sale_prices: false,
      },
      columns: {
        'billing_catalog_study_events.doctor_payment_note': false,
      },
    });

    const checks = await getPreflightChecks(conn as never);

    expect(allChecksPass(checks)).toBe(false);
    expect(conn.query).not.toHaveBeenCalled();
  });

  it('reprova estado parcialmente aplicado antes de qualquer novo DDL', async () => {
    const conn = createInformationSchemaConnection({
      tables: {
        billing_catalog_study_events: true,
        billing_visit_events: true,
        audit_log: true,
        billing_external_sale_prices: false,
      },
      columns: {
        'billing_catalog_study_events.doctor_payment_note': true,
        'billing_visit_events.doctor_received_by_user_id': true,
        'audit_log.action': true,
        // Simula a primeira etapa de uma execução interrompida: apenas uma das
        // novas colunas já existe. O preflight precisa impedir uma nova tentativa.
        'billing_visit_events.doctor_confirmation_status': true,
      },
    });

    const checks = await getPreflightChecks(conn as never);

    expect(allChecksPass(checks)).toBe(false);
    expect(checks.find((check) => check.label.includes('doctor_confirmation_status'))?.ok).toBe(false);
    expect(conn.query).not.toHaveBeenCalled();
  });

  it('envia o arquivo SQL inteiro uma única vez, inclusive DDL precedido por comentário', async () => {
    const sql = await readFile('drizzle/0060_external_sale_price_doctor_confirmation.sql', 'utf8');
    const query = vi.fn(async () => [] as unknown[]);

    await executeWholeMigration({ query } as never, sql);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(sql);
    const sentSql = query.mock.calls[0][0] as string;
    expect(sentSql).toContain('CREATE TABLE `billing_external_sale_prices`');
    expect(sentSql).toContain('ALTER TABLE `audit_log`');
    expect(sentSql).toContain('DOCTOR_PAYMENT_CONFIRMED');
    expect(sentSql).toContain('DOCTOR_PAYMENT_DISPUTED');
    expect(sentSql).toContain('SET_EXTERNAL_SALE_PRICE');
  });

  it('só aprova a pós-validação quando todos os sete objetos e três valores de enum existem', async () => {
    const expectedColumns = [
      'billing_visit_events.doctor_confirmation_status',
      'billing_visit_events.doctor_confirmed_at',
      'billing_visit_events.doctor_confirmation_note',
      'billing_catalog_study_events.doctor_confirmation_status',
      'billing_catalog_study_events.doctor_confirmed_at',
      'billing_catalog_study_events.doctor_confirmation_note',
    ];
    const conn = createInformationSchemaConnection({
      tables: { billing_external_sale_prices: true },
      columns: Object.fromEntries(expectedColumns.map((column) => [column, true])),
      auditEnum: "enum('LOGIN','DOCTOR_PAYMENT_CONFIRMED','DOCTOR_PAYMENT_DISPUTED','SET_EXTERNAL_SALE_PRICE')",
    });

    const checks = await getPostMigrationChecks(conn as never);

    expect(checks).toHaveLength(10);
    expect(allChecksPass(checks)).toBe(true);
  });
});
