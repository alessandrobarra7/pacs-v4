import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  ssl: { rejectUnauthorized: false }
});

console.log('Conectado.');

// === ESTADO ATUAL ===
const [users] = await conn.execute('SELECT id, name, email, role FROM users');
console.log('\nUSUÁRIOS:', users.map(u => `[${u.id}] ${u.name} (${u.role})`).join(', '));

const [units] = await conn.execute('SELECT id, name FROM units');
console.log('UNIDADES:', units.map(u => `[${u.id}] ${u.name}`).join(', '));

const [resp] = await conn.execute('SELECT id, legal_name, trade_name, isActive FROM financial_responsibles');
console.log('RESPONSÁVEIS:', resp.map(r => `[${r.id}] ${r.legal_name} / ${r.trade_name}`).join(', '));

const [fru] = await conn.execute('SELECT * FROM financial_responsible_units LIMIT 10');
console.log('VÍNCULOS RESP-UNIDADE:', JSON.stringify(fru));

const [cycles] = await conn.execute('SELECT id, unit_id, starts_at, ends_at, status FROM billing_cycles LIMIT 10');
console.log('CICLOS:', cycles.map(c => `[${c.id}] unit=${c.unit_id} ${c.status}`).join(', '));

const [dp] = await conn.execute('SELECT * FROM billing_doctor_unit_prices LIMIT 10');
console.log('PREÇOS MÉDICO:', JSON.stringify(dp));

const [sp] = await conn.execute('SELECT * FROM billing_system_unit_prices LIMIT 10');
console.log('PREÇOS SISTEMA:', JSON.stringify(sp));

const [reports] = await conn.execute("SELECT id, doctor_user_id, unit_id, status FROM reports WHERE status='signed' LIMIT 10");
console.log('LAUDOS ASSINADOS:', JSON.stringify(reports));

const [items] = await conn.execute('SELECT * FROM billing_report_items LIMIT 10');
console.log('BILLING ITEMS:', JSON.stringify(items));

// === CONFIGURAÇÃO DEMO ===
console.log('\n=== INICIANDO CONFIGURAÇÃO DEMO ===');

// Usuário admin (id=1) = Studio Barra7
// Médico: gian (id=5520015)
// Unidade: PACS Principal (id=180001)
// Responsável: eu/alesasndro (id=1)

const adminId = 1;
const medicoId = 5520015;
const unitId = 180001;
const responsavelId = 1;

// 1. Vincular responsável à unidade PACS Principal (se não existir)
const [existingFRU] = await conn.execute(
  'SELECT id FROM financial_responsible_units WHERE financial_responsible_id = ? AND unit_id = ?',
  [responsavelId, unitId]
);
if (existingFRU.length === 0) {
  await conn.execute(
    'INSERT INTO financial_responsible_units (financial_responsible_id, unit_id, starts_at, created_by) VALUES (?, ?, NOW(), ?)',
    [responsavelId, unitId, adminId]
  );
  console.log(`✅ Responsável [${responsavelId}] vinculado à unidade [${unitId}]`);
} else {
  console.log(`ℹ️ Responsável já vinculado à unidade (id=${existingFRU[0].id})`);
}

// 2. Configurar preço do médico Gian na unidade PACS Principal
const [existingDP] = await conn.execute(
  'SELECT id FROM billing_doctor_unit_prices WHERE unit_id = ? AND doctor_user_id = ? AND ends_at IS NULL',
  [unitId, medicoId]
);
if (existingDP.length === 0) {
  await conn.execute(
    `INSERT INTO billing_doctor_unit_prices 
     (financial_responsible_id, unit_id, doctor_user_id, price_per_report, starts_at, ends_at, created_by)
     VALUES (?, ?, ?, ?, CURDATE(), NULL, ?)`,
    [responsavelId, unitId, medicoId, 25.00, adminId]
  );
  console.log(`✅ Preço médico configurado: Gian [${medicoId}] = R$25,00 por laudo na unidade [${unitId}]`);
} else {
  console.log(`ℹ️ Preço médico já configurado (id=${existingDP[0].id})`);
}

// 3. Configurar preço do sistema na unidade PACS Principal
const [existingSP] = await conn.execute(
  'SELECT id FROM billing_system_unit_prices WHERE unit_id = ? AND ends_at IS NULL',
  [unitId]
);
if (existingSP.length === 0) {
  await conn.execute(
    `INSERT INTO billing_system_unit_prices 
     (financial_responsible_id, unit_id, price_per_report, starts_at, ends_at, created_by)
     VALUES (?, ?, ?, CURDATE(), NULL, ?)`,
    [responsavelId, unitId, 45.00, adminId]
  );
  console.log(`✅ Preço sistema configurado: R$45,00 por laudo na unidade [${unitId}]`);
} else {
  console.log(`ℹ️ Preço sistema já configurado (id=${existingSP[0].id})`);
}

// 4. Verificar se há ciclo aberto para a unidade
const [openCycle] = await conn.execute(
  "SELECT id FROM billing_cycles WHERE unit_id = ? AND status = 'open' LIMIT 1",
  [unitId]
);
if (openCycle.length === 0) {
  // Criar ciclo para abril 2026
  await conn.execute(
    `INSERT INTO billing_cycles (financial_responsible_id, unit_id, starts_at, ends_at, status, created_by)
     VALUES (?, ?, '2026-04-01', '2026-04-30', 'open', ?)`,
    [responsavelId, unitId, adminId]
  );
  console.log(`✅ Ciclo de billing criado para abril 2026 na unidade [${unitId}]`);
} else {
  console.log(`ℹ️ Ciclo já aberto para unidade [${unitId}] (id=${openCycle[0].id})`);
}

// 5. Verificar se o laudo assinado já tem billing_report_item
if (reports.length > 0) {
  const report = reports[0];
  console.log(`\nVerificando laudo [${report.id}] para billing...`);
  
  // Buscar ciclo ativo
  const [cycle] = await conn.execute(
    "SELECT id FROM billing_cycles WHERE unit_id = ? AND status = 'open' LIMIT 1",
    [report.unit_id]
  );
  
  if (cycle.length > 0) {
    const [existingItem] = await conn.execute(
      'SELECT id FROM billing_report_items WHERE report_id = ?',
      [report.id]
    );
    
    if (existingItem.length === 0) {
      // Buscar preços vigentes
      const [docPrice] = await conn.execute(
        'SELECT price_per_report FROM billing_doctor_unit_prices WHERE unit_id = ? AND doctor_user_id = ? AND ends_at IS NULL LIMIT 1',
        [report.unit_id, report.doctor_user_id]
      );
      const [sysPrice] = await conn.execute(
        'SELECT price_per_report FROM billing_system_unit_prices WHERE unit_id = ? AND ends_at IS NULL LIMIT 1',
        [report.unit_id]
      );
      
      const amtDoc = docPrice.length > 0 ? parseFloat(docPrice[0].price_per_report) : 0;
      const amtSys = sysPrice.length > 0 ? parseFloat(sysPrice[0].price_per_report) : 0;
      
      await conn.execute(
        `INSERT INTO billing_report_items 
         (billing_cycle_id, financial_responsible_id, unit_id, doctor_user_id, report_id, amount_doctor, amount_system, report_status_snapshot, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'signed', ?)`,
        [cycle[0].id, responsavelId, report.unit_id, report.doctor_user_id, report.id, amtDoc, amtSys, adminId]
      );
      console.log(`✅ billing_report_item criado para laudo [${report.id}]: médico=R$${amtDoc} sistema=R$${amtSys}`);
    } else {
      console.log(`ℹ️ Laudo [${report.id}] já tem billing_report_item`);
    }
  }
}

// === ESTADO FINAL ===
console.log('\n=== ESTADO FINAL ===');
const [finalDP] = await conn.execute('SELECT * FROM billing_doctor_unit_prices WHERE unit_id = 180001');
console.log('Preços médico PACS Principal:', JSON.stringify(finalDP));
const [finalSP] = await conn.execute('SELECT * FROM billing_system_unit_prices WHERE unit_id = 180001');
console.log('Preços sistema PACS Principal:', JSON.stringify(finalSP));
const [finalItems] = await conn.execute('SELECT * FROM billing_report_items LIMIT 5');
console.log('Billing items:', JSON.stringify(finalItems));

await conn.end();
console.log('\n✅ Configuração demo concluída!');
