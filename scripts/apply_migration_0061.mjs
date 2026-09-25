/**
 * Aplicador seguro da migration 0061 — adiciona GRANT_FINANCIAL_RESPONSIBLE_ACCESS
 * e REVOKE_FINANCIAL_RESPONSIBLE_ACCESS ao enum audit_log.action.
 *
 * Uso: DATABASE_URL=... node scripts/apply_migration_0061.mjs
 *
 * Segurança operacional:
 * - valida em INFORMATION_SCHEMA que os valores ainda não existem no enum
 *   antes de qualquer DDL (evita aplicar duas vezes);
 * - usa uma conexão exclusiva com multipleStatements habilitado somente para
 *   enviar o arquivo SQL versionado inteiro ao banco — não faz parsing manual
 *   por ponto e vírgula, então não corre o risco de descartar DDL que venha
 *   depois de um comentário com ponto e vírgula (mesma técnica de
 *   apply_migration_0060.mjs, adotada após o bloqueio crítico 1 encontrado
 *   pela Manus na revisão de 2026-09-23 do aplicador da migration 0062);
 * - valida o enum final após a aplicação;
 * - não lê ou altera nenhum dado clínico ou financeiro, só a definição da
 *   coluna audit_log.action.
 */
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  allChecksPass,
  executeWholeMigration,
  formatChecks,
  getPostMigrationChecks,
  getPreflightChecks,
  readMigrationSql,
} from './lib/migration0061.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '../drizzle/0061_financial_responsible_user_access_audit.sql');

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL não definido. Abortando sem tocar no banco.');
  process.exit(1);
}

const conn = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  // O SQL vem exclusivamente de drizzle/0061 versionado no repositório. Esta opção
  // fica limitada a esta conexão de migration e permite enviar o arquivo integral.
  multipleStatements: true,
});

try {
  console.log('— Preflight: verificando estado do enum antes de qualquer DDL —');
  const preflightChecks = await getPreflightChecks(conn);
  for (const line of formatChecks(preflightChecks)) console.log(line);

  if (!allChecksPass(preflightChecks)) {
    console.error('\n✗ Preflight falhou. Nenhuma instrução DDL foi executada.');
    console.error('  Ou a tabela audit_log não existe neste banco, ou o enum já contém algum dos');
    console.error('  valores novos — pode significar que esta migration já foi aplicada. Revise');
    console.error('  manualmente antes de tentar de novo.');
    process.exitCode = 1;
  } else {
    const sql = await readMigrationSql(sqlPath);
    console.log('\n— Preflight aprovado. Aplicando arquivo integral da migration 0061 —');
    await executeWholeMigration(conn, sql);

    console.log('\n— Validação pós-migration —');
    const postChecks = await getPostMigrationChecks(conn);
    for (const line of formatChecks(postChecks)) console.log(line);

    if (!allChecksPass(postChecks)) {
      console.error('\n✗ Validação pós-migration encontrou item ausente. Não considere esta aplicação concluída.');
      process.exitCode = 1;
    } else {
      console.log('\nMigration 0061 aplicada e validada com sucesso. Nenhum dado clínico ou financeiro foi lido ou alterado.');
    }
  }
} catch (error) {
  console.error('\n✗ Aplicação da migration falhou. Revise o estado do banco antes de qualquer nova tentativa.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await conn.end();
}
