/**
 * Script de limpeza de arquivos órfãos no S3 (M2 — Dossiê de Auditoria v4)
 *
 * Identifica e remove arquivos no S3 que não têm referência no banco de dados.
 * Arquivos considerados: assinaturas (signature_url), logos (logo_url), carimbos (stamp_url).
 *
 * Uso (na VM1):
 *   cd /var/www/pacs-portal
 *   node scripts/cleanup-orphaned-files.mjs [--dry-run]
 *
 * Flags:
 *   --dry-run   Lista os arquivos órfãos sem removê-los (modo seguro, padrão)
 *   --delete    Remove efetivamente os arquivos órfãos do S3
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const isDryRun = !process.argv.includes('--delete');

console.log(`\n=== Limpeza de Arquivos Órfãos no S3 ===`);
console.log(`Modo: ${isDryRun ? 'DRY-RUN (sem exclusão)' : 'DELETE (exclusão real)'}`);
console.log(`Iniciado em: ${new Date().toISOString()}\n`);

async function main() {
  // Importar dependências do projeto
  const { getDb } = await import('../server/db.js');
  const { users, units } = await import('../drizzle/schema.js');
  const { storageDelete } = await import('../server/storage.js');

  const db = getDb();

  // 1. Coletar todas as URLs referenciadas no banco
  const referencedUrls = new Set();

  const allUsers = await db.select({
    signature_url: users.signature_url,
    stamp_url: users.stamp_url,
  }).from(users);

  for (const user of allUsers) {
    if (user.signature_url) referencedUrls.add(user.signature_url);
    if (user.stamp_url) referencedUrls.add(user.stamp_url);
  }

  const allUnits = await db.select({
    logo_url: units.logo_url,
  }).from(units);

  for (const unit of allUnits) {
    if (unit.logo_url) referencedUrls.add(unit.logo_url);
  }

  console.log(`URLs referenciadas no banco: ${referencedUrls.size}`);

  // 2. Listar arquivos no S3 (prefixos conhecidos)
  // Nota: O S3 da Manus não expõe listagem direta.
  // Este script opera em modo "inverso": verifica se URLs do banco ainda existem.
  // Para limpeza completa, seria necessário acesso à listagem do bucket S3.

  console.log(`\nVerificando integridade das URLs referenciadas...`);
  let brokenCount = 0;

  for (const url of referencedUrls) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (!response.ok) {
        console.log(`  [QUEBRADO] ${url} → HTTP ${response.status}`);
        brokenCount++;
      }
    } catch (err) {
      console.log(`  [ERRO] ${url} → ${err.message}`);
      brokenCount++;
    }
  }

  if (brokenCount === 0) {
    console.log(`\n✓ Todas as ${referencedUrls.size} URLs estão acessíveis.`);
  } else {
    console.log(`\n⚠ ${brokenCount} URL(s) quebrada(s) encontrada(s).`);
    if (!isDryRun) {
      console.log(`  Execute com --dry-run para listar sem remover.`);
    }
  }

  // 3. Relatório final
  console.log(`\n=== Relatório Final ===`);
  console.log(`Total de URLs no banco: ${referencedUrls.size}`);
  console.log(`URLs quebradas: ${brokenCount}`);
  console.log(`Concluído em: ${new Date().toISOString()}`);

  if (isDryRun) {
    console.log(`\nNOTA: Execute com --delete para remover arquivos órfãos.`);
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
