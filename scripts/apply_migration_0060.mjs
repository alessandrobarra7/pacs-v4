/**
 * Aplicador da migration 0060 — preço de venda externa + confirmação do médico.
 *
 * CORREÇÃO (revisão independente Manus, 2026-09-17): a migration 0060 pressupõe que
 * billing_catalog_study_events e sua coluna doctor_payment_note já existem (foram
 * criadas por migrations anteriores do pipeline de catálogo clínico-financeiro). Um
 * ambiente sem essas migrations aplicadas executa as primeiras instruções da 0060 com
 * sucesso (billing_external_sale_prices, colunas em billing_visit_events) e só falha
 * na primeira ALTER TABLE de billing_catalog_study_events — deixando o banco num
 * estado parcial, nem antes nem depois da migration. Foi exatamente o que aconteceu
 * no sandbox da Manus.
 *
 * Este script faz um PREFLIGHT via INFORMATION_SCHEMA antes de executar qualquer DDL:
 * se as dependências não existirem, ele aborta com uma mensagem explícita e não altera
 * nada. Só corre a migration se o preflight passar. No final, valida que os objetos
 * esperados realmente existem (tabela nova, 6 colunas de confirmação, 3 valores de enum).
 *
 * Uso: DATABASE_URL=... node scripts/apply_migration_0060.mjs
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '../drizzle/0060_external_sale_price_doctor_confirmation.sql');
const sql = readFileSync(sqlPath, 'utf8');

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL não definido. Abortando sem tocar no banco.');
  process.exit(1);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

async function columnExists(table, column) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows[0].n > 0;
}

async function tableExists(table) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return rows[0].n > 0;
}

console.log('— Preflight: verificando dependências antes de qualquer DDL —');

const preflightChecks = [
  { label: 'tabela billing_catalog_study_events existe', ok: await tableExists('billing_catalog_study_events') },
  { label: 'coluna billing_catalog_study_events.doctor_payment_note existe', ok: await columnExists('billing_catalog_study_events', 'doctor_payment_note') },
  { label: 'tabela billing_visit_events existe', ok: await tableExists('billing_visit_events') },
  { label: 'tabela audit_log existe', ok: await tableExists('audit_log') },
  { label: 'tabela billing_external_sale_prices AINDA NÃO existe (idempotência)', ok: !(await tableExists('billing_external_sale_prices')) },
];

let preflightFailed = false;
for (const check of preflightChecks) {
  console.log(check.ok ? '  ✓' : '  ✗', check.label);
  if (!check.ok) preflightFailed = true;
}

if (preflightFailed) {
  console.error('\n✗ Preflight falhou. Nenhuma instrução DDL foi executada.');
  console.error('  Este ambiente não tem as migrations do catálogo clínico-financeiro (0050-0059)');
  console.error('  aplicadas, ou a migration 0060 já foi aplicada aqui antes. Aplique as migrations');
  console.error('  pendentes na ordem correta (ver drizzle/MIGRATIONS_README.md) antes de tentar de novo,');
  console.error('  ou confirme que este banco já está com a 0060 aplicada e pare aqui.');
  await conn.end();
  process.exit(1);
}

console.log('\n— Preflight aprovado. Aplicando migration 0060 —');

const statements = sql.split(';').map((s) => s.trim()).filter((s) => s && !s.startsWith('--'));
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('✓', stmt.slice(0, 70).replace(/\n/g, ' '));
  } catch (e) {
    console.error('✗ ERRO:', e.message, '\n  SQL:', stmt.slice(0, 120));
    console.error('\nAplicação interrompida. Revise o estado do banco manualmente antes de tentar de novo —');
    console.error('o preflight passou, então este erro não é sobre pré-condição ausente.');
    await conn.end();
    process.exit(1);
  }
}

console.log('\n— Validação pós-migration —');
const postChecks = [
  { label: 'tabela billing_external_sale_prices existe', ok: await tableExists('billing_external_sale_prices') },
  { label: 'billing_visit_events.doctor_confirmation_status existe', ok: await columnExists('billing_visit_events', 'doctor_confirmation_status') },
  { label: 'billing_visit_events.doctor_confirmed_at existe', ok: await columnExists('billing_visit_events', 'doctor_confirmed_at') },
  { label: 'billing_visit_events.doctor_confirmation_note existe', ok: await columnExists('billing_visit_events', 'doctor_confirmation_note') },
  { label: 'billing_catalog_study_events.doctor_confirmation_status existe', ok: await columnExists('billing_catalog_study_events', 'doctor_confirmation_status') },
  { label: 'billing_catalog_study_events.doctor_confirmed_at existe', ok: await columnExists('billing_catalog_study_events', 'doctor_confirmed_at') },
  { label: 'billing_catalog_study_events.doctor_confirmation_note existe', ok: await columnExists('billing_catalog_study_events', 'doctor_confirmation_note') },
];
const [enumRows] = await conn.execute(
  `SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_log' AND COLUMN_NAME = 'action'`,
);
const enumDef = enumRows[0]?.t ?? '';
postChecks.push(
  { label: "audit_log.action contém 'DOCTOR_PAYMENT_CONFIRMED'", ok: enumDef.includes('DOCTOR_PAYMENT_CONFIRMED') },
  { label: "audit_log.action contém 'DOCTOR_PAYMENT_DISPUTED'", ok: enumDef.includes('DOCTOR_PAYMENT_DISPUTED') },
  { label: "audit_log.action contém 'SET_EXTERNAL_SALE_PRICE'", ok: enumDef.includes('SET_EXTERNAL_SALE_PRICE') },
);

let postFailed = false;
for (const check of postChecks) {
  console.log(check.ok ? '  ✓' : '  ✗', check.label);
  if (!check.ok) postFailed = true;
}

await conn.end();

if (postFailed) {
  console.error('\n✗ Validação pós-migration encontrou item ausente. Não considere esta aplicação concluída.');
  process.exit(1);
}

console.log('\nMigration 0060 aplicada e validada com sucesso. Nenhum dado clínico foi lido ou alterado.');
