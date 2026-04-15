import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const dbUrl = process.env.DATABASE_URL;
// Parse DATABASE_URL para extrair host, user, password, database
const url = new URL(dbUrl);

const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  ssl: { rejectUnauthorized: false }
});

console.log('Conectado ao banco de dados');

// 1. Ver usuários existentes
const [users] = await conn.execute('SELECT id, name, email, role FROM users LIMIT 10');
console.log('\n=== USUÁRIOS ===');
users.forEach(u => console.log(`  [${u.id}] ${u.name} (${u.role}) - ${u.email}`));

// 2. Ver unidades existentes
const [units] = await conn.execute('SELECT id, name FROM units LIMIT 10');
console.log('\n=== UNIDADES ===');
units.forEach(u => console.log(`  [${u.id}] ${u.name}`));

// 3. Ver responsáveis financeiros
const [resp] = await conn.execute('SELECT id, name, email FROM financial_responsibles LIMIT 10');
console.log('\n=== RESPONSÁVEIS FINANCEIROS ===');
resp.forEach(r => console.log(`  [${r.id}] ${r.name} - ${r.email}`));

// 4. Ver ciclos de billing
const [cycles] = await conn.execute('SELECT id, unit_id, starts_at, ends_at, status FROM billing_cycles LIMIT 10');
console.log('\n=== CICLOS DE BILLING ===');
cycles.forEach(c => console.log(`  [${c.id}] unit_id=${c.unit_id} ${c.starts_at} → ${c.ends_at} (${c.status})`));

// 5. Ver preços de médicos
const [prices] = await conn.execute('SELECT id, unit_id, doctor_user_id, price_per_report FROM unit_doctor_prices LIMIT 10');
console.log('\n=== PREÇOS MÉDICOS ===');
prices.forEach(p => console.log(`  unit=${p.unit_id} doctor=${p.doctor_user_id} R$${p.price_per_report}`));

// 6. Ver preços do sistema
const [sysprices] = await conn.execute('SELECT id, unit_id, price_per_report FROM unit_system_prices LIMIT 10');
console.log('\n=== PREÇOS SISTEMA ===');
sysprices.forEach(p => console.log(`  unit=${p.unit_id} R$${p.price_per_report}`));

// 7. Ver billing_report_items
const [items] = await conn.execute('SELECT id, unit_id, doctor_user_id, report_id, amount_doctor, amount_system FROM billing_report_items LIMIT 10');
console.log('\n=== BILLING REPORT ITEMS ===');
items.forEach(i => console.log(`  [${i.id}] unit=${i.unit_id} doctor=${i.doctor_user_id} report=${i.report_id} doc=R$${i.amount_doctor} sys=R$${i.amount_system}`));

// 8. Ver laudos assinados
const [reports] = await conn.execute("SELECT id, study_instance_uid, doctor_user_id, unit_id, status, signed_at FROM reports WHERE status='signed' LIMIT 10");
console.log('\n=== LAUDOS ASSINADOS ===');
reports.forEach(r => console.log(`  [${r.id}] unit=${r.unit_id} doctor=${r.doctor_user_id} signed=${r.signed_at}`));

await conn.end();
console.log('\nConcluído.');
