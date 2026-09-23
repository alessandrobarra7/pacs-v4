/**
 * Aplicador seguro da migration 0062 — troca a unique key de
 * financial_responsible_users pra (user_id) sozinho (Opção A: uma conta, um
 * responsável financeiro ativo por vez).
 *
 * Uso: DATABASE_URL=... node scripts/apply_migration_0062.mjs
 *
 * Segurança operacional:
 * - recusa aplicar se já existir qualquer user_id vinculado a mais de um
 *   responsável neste banco — isso exigiria uma decisão manual de qual
 *   vínculo prevalece, que não cabe a este script tomar sozinho;
 * - valida o formato atual do índice uq_resp_user antes de tocar em DDL
 *   (evita aplicar duas vezes ou aplicar num banco já migrado);
 * - valida o formato final do índice depois de aplicar;
 * - não lê nem altera nenhum dado clínico ou financeiro além do índice.
 *
 * FIX (2026-09-23, revisão Manus — bloqueio crítico 1): a versão anterior
 * deste script fazia `sql.split(';')` e descartava blocos que começassem
 * com '--', o que é incorreto para um arquivo SQL com ponto e vírgula
 * dentro de comentários explicativos (este arquivo tinha um, na explicação
 * da regra de negócio). Isso fazia o DROP INDEX nunca ser enviado ao MySQL
 * (engolido dentro de um bloco que dava erro de sintaxe antes de chegar
 * nele). A migration em si também foi reescrita para combinar DROP INDEX +
 * ADD UNIQUE INDEX num único ALTER TABLE atômico. Este script agora envia o
 * arquivo inteiro numa única chamada, sem nenhum parsing manual por ponto e
 * vírgula — mesma técnica já usada em apply_migration_0060.mjs e
 * apply_migration_0061.mjs.
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
} from './lib/migration0062.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '../drizzle/0062_financial_responsible_single_active.sql');

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL não definido. Abortando sem tocar no banco.');
  process.exit(1);
}

const conn = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  // O SQL vem exclusivamente de drizzle/0062 versionado no repositório. Esta opção
  // fica limitada a esta conexão de migration e permite enviar o arquivo integral
  // sem nenhum parsing manual por ponto e vírgula (ver nota FIX acima).
  multipleStatements: true,
});

try {
  console.log('— Preflight: verificando estado antes de qualquer DDL —');
  const preflightChecks = await getPreflightChecks(conn);
  for (const line of formatChecks(preflightChecks)) console.log(line);

  const duplicatesCheck = preflightChecks.find((c) => c.duplicates);
  const compositeCheck = preflightChecks.find((c) => c.currentIndexCols);

  if (!allChecksPass(preflightChecks)) {
    if (duplicatesCheck && !duplicatesCheck.ok) {
      console.error('\n✗ Preflight falhou: existem contas vinculadas a mais de um responsável financeiro.');
      console.error(`  Encontrados: ${duplicatesCheck.duplicates.map((d) => `user_id=${d.user_id} (${d.n} vínculos)`).join(', ')}`);
      console.error('  Decida manualmente qual vínculo prevalece pra cada conta listada acima (revogando os');
      console.error('  outros pela tela Financeiro → Configuração → Usuários com acesso financeiro, ou por');
      console.error('  DELETE direto e auditável) antes de rodar esta migration. Nenhuma instrução DDL foi executada.');
    } else if (compositeCheck && !compositeCheck.ok) {
      console.error('\n✗ Preflight falhou: o índice uq_resp_user não está no formato esperado antes da migration.');
      console.error(`  Encontrado: ${compositeCheck.currentIndexCols.join(', ') || '(nenhum)'}`);
      console.error('  Isso pode significar que a migration já foi aplicada, ou que o schema deste banco não');
      console.error('  corresponde ao esperado. Revise manualmente antes de tentar de novo. Nenhuma instrução DDL foi executada.');
    }
    process.exitCode = 1;
  } else {
    const sql = await readMigrationSql(sqlPath);
    console.log('\n— Preflight aprovado. Aplicando arquivo integral da migration 0062 —');
    await executeWholeMigration(conn, sql);

    console.log('\n— Validação pós-migration —');
    const postChecks = await getPostMigrationChecks(conn);
    for (const line of formatChecks(postChecks)) console.log(line);

    if (!allChecksPass(postChecks)) {
      console.error('\n✗ Validação pós-migration encontrou um estado inesperado. Não considere esta aplicação concluída.');
      process.exitCode = 1;
    } else {
      console.log('\nMigration 0062 aplicada e validada com sucesso.');
    }
  }
} catch (error) {
  console.error('\n✗ Aplicação da migration falhou. Revise o estado do banco antes de qualquer nova tentativa.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await conn.end();
}
