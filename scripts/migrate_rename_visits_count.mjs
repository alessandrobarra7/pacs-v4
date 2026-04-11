import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  const tablesToMigrate = [
    'billing_cycle_doctor_summary',
    'billing_cycle_system_summary',
  ];
  
  for (const table of tablesToMigrate) {
    const [cols] = await conn.execute(`DESCRIBE ${table}`);
    const hasReportsCount = cols.some(r => r.Field === 'reports_count');
    const hasVisitsCount = cols.some(r => r.Field === 'visits_count');
    
    console.log(`${table}: has_reports_count=${hasReportsCount}, has_visits_count=${hasVisitsCount}`);
    
    if (hasReportsCount) {
      console.log(`  → reports_count já existe, nada a fazer`);
    } else if (hasVisitsCount) {
      await conn.execute(`ALTER TABLE ${table} CHANGE COLUMN visits_count reports_count INT NOT NULL DEFAULT 0`);
      console.log(`  → Renomeado: visits_count → reports_count`);
    } else {
      console.log(`  → AVISO: nenhuma das colunas encontrada!`);
    }
  }
  
  console.log('\nMigração concluída!');
  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
