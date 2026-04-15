import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('=== VERIFICANDO ESTADO ATUAL ===');

const [users] = await conn.execute('SELECT id, name, role, email FROM users ORDER BY id');
console.log('\nUSUÁRIOS EXISTENTES:');
users.forEach(u => console.log(`  [${u.id}] ${u.name} (${u.role}) - ${u.email}`));

const [units] = await conn.execute('SELECT id, name FROM units ORDER BY id');
console.log('\nUNIDADES:');
units.forEach(u => console.log(`  [${u.id}] ${u.name}`));

const [responsibles] = await conn.execute('SELECT id, legal_name, user_id FROM financial_responsibles');
console.log('\nRESPONSÁVEIS FINANCEIROS:');
responsibles.forEach(r => console.log(`  [${r.id}] ${r.legal_name} (user_id=${r.user_id})`));

const [cycles] = await conn.execute('SELECT id, unit_id, type, status, starts_at, ends_at FROM billing_cycles ORDER BY id');
console.log('\nCICLOS:');
cycles.forEach(c => console.log(`  [${c.id}] unit=${c.unit_id} type=${c.type} status=${c.status} ${c.starts_at?.toISOString().slice(0,10)} → ${c.ends_at?.toISOString().slice(0,10)}`));

const [events] = await conn.execute('SELECT id, unit_id, doctor_user_id, doctor_price_applied, system_price_applied FROM billing_visit_events ORDER BY id');
console.log('\nBILLING EVENTS:');
events.forEach(e => console.log(`  [${e.id}] unit=${e.unit_id} doctor=${e.doctor_user_id} doc_price=${e.doctor_price_applied} sys_price=${e.system_price_applied}`));

const [prices] = await conn.execute('SELECT id, unit_id, user_id, price_per_report, is_active FROM unit_doctor_prices ORDER BY id');
console.log('\nPREÇOS MÉDICO:');
prices.forEach(p => console.log(`  [${p.id}] unit=${p.unit_id} user=${p.user_id} R$${p.price_per_report} active=${p.is_active}`));

const [sysPrices] = await conn.execute('SELECT id, unit_id, price_per_report, is_active FROM unit_system_prices ORDER BY id');
console.log('\nPREÇOS SISTEMA:');
sysPrices.forEach(p => console.log(`  [${p.id}] unit=${p.unit_id} R$${p.price_per_report} active=${p.is_active}`));

await conn.end();
process.exit(0);
