import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Verificar estrutura atual
  const [cols] = await conn.execute('DESCRIBE billing_cycles');
  const hasTotalReports = cols.some(r => r.Field === 'total_reports');
  const hasTotalVisits = cols.some(r => r.Field === 'total_visits');
  
  console.log('Has total_reports:', hasTotalReports, '| Has total_visits:', hasTotalVisits);
  
  if (hasTotalReports) {
    console.log('Coluna total_reports já existe, nada a fazer');
    await conn.end();
    return;
  }
  
  if (hasTotalVisits) {
    await conn.execute('ALTER TABLE billing_cycles CHANGE COLUMN total_visits total_reports INT NOT NULL DEFAULT 0');
    console.log('Coluna renomeada: total_visits -> total_reports em billing_cycles');
    console.log('Migração concluída com sucesso!');
  } else {
    console.log('ERRO: Nenhuma das colunas encontrada em billing_cycles!');
  }
  
  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
