import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Verificar se já existe report_key
  const [cols] = await conn.execute('DESCRIBE billing_visit_events');
  const hasReportKey = cols.some(r => r.Field === 'report_key');
  const hasVisitKey = cols.some(r => r.Field === 'visit_key');
  
  console.log('Has report_key:', hasReportKey, '| Has visit_key:', hasVisitKey);
  
  if (hasReportKey) {
    console.log('Coluna report_key já existe, nada a fazer');
    await conn.end();
    return;
  }
  
  if (hasVisitKey) {
    // Renomear visit_key para report_key
    await conn.execute('ALTER TABLE billing_visit_events CHANGE COLUMN visit_key report_key VARCHAR(300) NOT NULL');
    console.log('Coluna renomeada: visit_key -> report_key');
    
    // Verificar se existe índice único
    const [indexes] = await conn.execute('SHOW INDEX FROM billing_visit_events WHERE Key_name = "uq_report_event"');
    if (indexes.length === 0) {
      await conn.execute('ALTER TABLE billing_visit_events ADD UNIQUE INDEX uq_report_event (report_key)');
      console.log('Índice único adicionado: uq_report_event');
    }
    console.log('Migração concluída com sucesso!');
  } else {
    console.log('ERRO: Nenhuma das colunas encontrada!');
  }
  
  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
