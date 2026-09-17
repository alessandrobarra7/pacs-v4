/**
 * Aplicador seguro da migration 0060 — preço de venda externa + confirmação do médico.
 *
 * Uso: DATABASE_URL=... node scripts/apply_migration_0060.mjs
 *
 * Segurança operacional:
 * - valida todas as dependências em INFORMATION_SCHEMA antes de qualquer DDL;
 * - usa uma conexão exclusiva com multipleStatements habilitado somente para enviar
 *   o arquivo SQL versionado inteiro ao banco;
 * - não faz parsing manual por ponto e vírgula, portanto não descarta DDL que venha
 *   depois de comentários SQL;
 * - valida os objetos estruturais esperados após a aplicação;
 * - não lê ou altera dados clínicos.
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
} from './lib/migration0060.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '../drizzle/0060_external_sale_price_doctor_confirmation.sql');

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL não definido. Abortando sem tocar no banco.');
  process.exit(1);
}

const conn = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  // O SQL vem exclusivamente de drizzle/0060 versionado no repositório. Esta opção
  // fica limitada a esta conexão de migration e permite enviar o arquivo integral.
  multipleStatements: true,
});

try {
  console.log('— Preflight: verificando dependências antes de qualquer DDL —');
  const preflightChecks = await getPreflightChecks(conn);
  for (const line of formatChecks(preflightChecks)) console.log(line);

  if (!allChecksPass(preflightChecks)) {
    console.error('\n✗ Preflight falhou. Nenhuma instrução DDL foi executada.');
    console.error('  Este ambiente não tem as migrations do catálogo clínico-financeiro (0050-0059)');
    console.error('  aplicadas, já tem a migration 0060 aplicada, ou está parcialmente alterado. Aplique as migrations');
    console.error('  pendentes na ordem correta (ver drizzle/MIGRATIONS_README.md) antes de tentar de novo,');
    console.error('  ou revise manualmente o estado parcial antes de tentar novamente.');
    process.exitCode = 1;
  } else {
    const sql = await readMigrationSql(sqlPath);
    console.log('\n— Preflight aprovado. Aplicando arquivo integral da migration 0060 —');
    await executeWholeMigration(conn, sql);

    console.log('\n— Validação pós-migration —');
    const postChecks = await getPostMigrationChecks(conn);
    for (const line of formatChecks(postChecks)) console.log(line);

    if (!allChecksPass(postChecks)) {
      console.error('\n✗ Validação pós-migration encontrou item ausente. Não considere esta aplicação concluída.');
      process.exitCode = 1;
    } else {
      console.log('\nMigration 0060 aplicada e validada com sucesso. Nenhum dado clínico foi lido ou alterado.');
    }
  }
} catch (error) {
  console.error('\n✗ Aplicação da migration falhou. Revise o estado do banco antes de qualquer nova tentativa.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await conn.end();
}
