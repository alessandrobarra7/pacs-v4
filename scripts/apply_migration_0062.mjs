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
 */
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '../drizzle/0062_financial_responsible_single_active.sql');

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL não definido. Abortando sem tocar no banco.');
  process.exit(1);
}

async function getIndexColumns(conn, table, indexName) {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME AS col FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
       ORDER BY SEQ_IN_INDEX`,
    [table, indexName],
  );
  return rows.map((r) => r.col);
}

async function findDuplicateUserLinks(conn) {
  const [rows] = await conn.execute(
    `SELECT user_id, COUNT(*) AS n FROM financial_responsible_users
       GROUP BY user_id HAVING COUNT(*) > 1`,
  );
  return rows;
}

const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });

try {
  console.log('— Preflight: verificando estado antes de qualquer DDL —');

  const duplicates = await findDuplicateUserLinks(conn);
  const noDuplicates = duplicates.length === 0;
  console.log(`${noDuplicates ? '✓' : '✗'} nenhum user_id vinculado a mais de um responsável` +
    (noDuplicates ? '' : ` — encontrados: ${duplicates.map((d) => `user_id=${d.user_id} (${d.n} vínculos)`).join(', ')}`));

  const currentIndexCols = await getIndexColumns(conn, 'financial_responsible_users', 'uq_resp_user');
  const isComposite = currentIndexCols.length === 2 &&
    currentIndexCols.includes('financial_responsible_id') && currentIndexCols.includes('user_id');
  console.log(`${isComposite ? '✓' : '✗'} índice uq_resp_user está no formato composto esperado antes da migration (encontrado: ${currentIndexCols.join(', ') || '(nenhum)'})`);

  if (!noDuplicates) {
    console.error('\n✗ Preflight falhou: existem contas vinculadas a mais de um responsável financeiro.');
    console.error('  Decida manualmente qual vínculo prevalece pra cada conta listada acima (revogando os');
    console.error('  outros pela tela Financeiro → Configuração → Usuários com acesso financeiro, ou por');
    console.error('  DELETE direto e auditável) antes de rodar esta migration. Nenhuma instrução DDL foi executada.');
    process.exitCode = 1;
  } else if (!isComposite) {
    console.error('\n✗ Preflight falhou: o índice uq_resp_user não está no formato esperado antes da migration.');
    console.error('  Isso pode significar que a migration já foi aplicada, ou que o schema deste banco não');
    console.error('  corresponde ao esperado. Revise manualmente antes de tentar de novo. Nenhuma instrução DDL foi executada.');
    process.exitCode = 1;
  } else {
    const sql = await readFile(sqlPath, 'utf8');
    console.log('\n— Preflight aprovado. Aplicando migration 0062 —');
    // As duas instruções ALTER TABLE são enviadas em sequência (statement a
    // statement, sem multipleStatements) — mais simples e mais fácil de
    // auditar linha a linha que a migration 0060, que precisava enviar o
    // arquivo inteiro de uma vez por causa de instruções fora de ordem.
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));
    for (const statement of statements) {
      await conn.query(statement);
    }

    console.log('\n— Validação pós-migration —');
    const newIndexCols = await getIndexColumns(conn, 'financial_responsible_users', 'uq_resp_user');
    const isSingleColumn = newIndexCols.length === 1 && newIndexCols[0] === 'user_id';
    console.log(`${isSingleColumn ? '✓' : '✗'} índice uq_resp_user agora é (user_id) sozinho (encontrado: ${newIndexCols.join(', ') || '(nenhum)'})`);

    if (!isSingleColumn) {
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
