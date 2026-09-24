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
 * FIX (2026-09-23, revisão Manus — bloqueio crítico 1 da 1ª rodada): a
 * versão anterior deste script fazia `sql.split(';')` e descartava blocos
 * que começassem com '--', o que é incorreto para um arquivo SQL com ponto
 * e vírgula dentro de comentários explicativos (este arquivo tinha um, na
 * explicação da regra de negócio). Isso fazia o DROP INDEX nunca ser
 * enviado ao MySQL (engolido dentro de um bloco que dava erro de sintaxe
 * antes de chegar nele). A migration em si também foi reescrita para
 * combinar DROP INDEX + ADD UNIQUE INDEX num único ALTER TABLE atômico.
 * Este script agora envia o arquivo inteiro numa única chamada, sem nenhum
 * parsing manual por ponto e vírgula — mesma técnica já usada em
 * apply_migration_0060.mjs e apply_migration_0061.mjs.
 *
 * FIX (2026-09-23, revisão Manus — bloqueio crítico 1 da 2ª rodada): mesmo
 * com um único ALTER TABLE, usar o MESMO nome pro índice antigo e pro novo
 * (`uq_resp_user` pros dois lados) falha no dialeto real do banco (TiDB)
 * com "Duplicate key name". O índice final agora se chama `uq_resp_user_id`
 * (nome diferente do antigo `uq_resp_user`), e este script passou a
 * reconhecer dois estados seguros no preflight: o estado anterior (índice
 * composto ainda presente) e o estado final já aplicado (tratado como
 * sucesso idempotente, não como erro) — ver migration0062.mjs.
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
  const stateCheck = preflightChecks.find((c) => c.migrationState);

  if (!allChecksPass(preflightChecks)) {
    if (duplicatesCheck && !duplicatesCheck.ok) {
      console.error('\n✗ Preflight falhou: existem contas vinculadas a mais de um responsável financeiro.');
      console.error(`  Encontrados: ${duplicatesCheck.duplicates.map((d) => `user_id=${d.user_id} (${d.n} vínculos)`).join(', ')}`);
      console.error('  Decida manualmente qual vínculo prevalece pra cada conta listada acima (revogando os');
      console.error('  outros pela tela Financeiro → Configuração → Usuários com acesso financeiro, ou por');
      console.error('  DELETE direto e auditável) antes de rodar esta migration. Nenhuma instrução DDL foi executada.');
    } else if (stateCheck && !stateCheck.ok) {
      console.error('\n✗ Preflight falhou: o estado do índice não é nem o esperado antes da migration, nem o');
      console.error('  estado final já aplicado.');
      console.error(`  uq_resp_user (antigo): ${stateCheck.migrationState.oldCols.join(', ') || '(não existe)'}`);
      console.error(`  uq_resp_user_id (novo): ${stateCheck.migrationState.newCols.join(', ') || '(não existe)'}`);
      console.error('  O schema deste banco não corresponde a nenhum estado seguro conhecido. Revise manualmente');
      console.error('  antes de tentar de novo. Nenhuma instrução DDL foi executada.');
    }
    process.exitCode = 1;
  } else if (stateCheck.migrationState.state === 'after') {
    // Idempotência: o banco já está no estado final (uq_resp_user_id em
    // user_id, uq_resp_user antigo removido). Não há DDL a rodar — reportar
    // sucesso sem tocar no banco de novo, em vez de tentar reaplicar e
    // quebrar num "Duplicate key name" ou similar.
    console.log('\n— Migration 0062 já está aplicada neste banco (estado final confirmado) —');
    console.log('  Nenhuma instrução DDL foi executada nesta chamada. Nada a fazer.');
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
