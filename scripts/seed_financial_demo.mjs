/**
 * seed_financial_demo.mjs
 * 
 * Popula o banco com dados de simulação financeira para demonstrar
 * todas as visões de cada perfil de usuário:
 * - admin_master: visão completa (todas as unidades)
 * - responsavel_financeiro: visão das suas unidades
 * - medico: visão do próprio saldo
 * 
 * Execução: DATABASE_URL="..." node scripts/seed_financial_demo.mjs
 */

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('=== SEED FINANCEIRO DE DEMONSTRAÇÃO ===\n');

// ============================================================
// 1. VERIFICAR ESTADO ATUAL
// ============================================================
const [users] = await conn.execute('SELECT id, name, role FROM users ORDER BY id');
console.log('Usuários existentes:');
users.forEach(u => console.log(`  [${u.id}] ${u.name} (${u.role})`));

const [units] = await conn.execute('SELECT id, name FROM units ORDER BY id');
console.log('Unidades:', units.map(u => `[${u.id}] ${u.name}`).join(', '));

const [resp] = await conn.execute('SELECT id, legal_name FROM financial_responsibles');
console.log('Responsáveis:', resp.map(r => `[${r.id}] ${r.legal_name}`).join(', '));

// IDs conhecidos
const ADMIN_ID = 1;           // Studio Barra7 (admin_master)
const RESP_USER_ID = 5340188; // "eu" (responsavel_financeiro)
const DOCTOR_ID = 5520015;    // gian (medico)
const UNIT_PRINCIPAL = 180001;
const UNIT_PACSML = 210001;
const RESP_ID = 1;            // responsável "eu"
const RESP_SEM = 30001;       // "Sem Responsável"

// ============================================================
// 2. VINCULAR USUÁRIO "eu" AO RESPONSÁVEL FINANCEIRO
// ============================================================
console.log('\n--- Vinculando usuário responsavel_financeiro ao responsável cadastrado ---');
await conn.execute('DELETE FROM financial_responsible_users WHERE financial_responsible_id = ?', [RESP_ID]);
await conn.execute(
  'INSERT INTO financial_responsible_users (financial_responsible_id, user_id, createdAt) VALUES (?, ?, NOW())',
  [RESP_ID, RESP_USER_ID]
);
console.log(`  Vinculado: user_id=${RESP_USER_ID} → financial_responsible_id=${RESP_ID}`);

// ============================================================
// 3. GARANTIR PREÇO DO SISTEMA PARA PACSML
// ============================================================
console.log('\n--- Configurando preços do sistema ---');
const [existSysPrice] = await conn.execute(
  'SELECT id FROM billing_system_unit_prices WHERE unit_id = ? AND financial_responsible_id = ?',
  [UNIT_PACSML, RESP_SEM]
);
if (existSysPrice.length === 0) {
  await conn.execute(
    `INSERT INTO billing_system_unit_prices (financial_responsible_id, unit_id, price_per_report, starts_at, created_by, createdAt)
     VALUES (?, ?, 5.00, '2026-01-01 00:00:00', ?, NOW())`,
    [RESP_SEM, UNIT_PACSML, ADMIN_ID]
  );
  console.log(`  Criado: preço sistema PACSML = R$5,00`);
} else {
  console.log(`  Preço sistema PACSML já existe`);
}

// ============================================================
// 4. LIMPAR EVENTOS ANTIGOS SEM DADOS (study_date NULL)
// ============================================================
console.log('\n--- Limpando eventos sem study_date ---');
const [del] = await conn.execute('DELETE FROM billing_visit_events WHERE study_date IS NULL');
console.log(`  Removidos ${del.affectedRows} eventos sem data`);

// ============================================================
// 5. CRIAR CICLOS COMPLETOS COM DADOS REAIS
// ============================================================
console.log('\n--- Configurando ciclos ---');

// Deletar ciclos sem dados reais (total_reports = 0 e sem eventos)
// Manter apenas ciclos com dados
const [cyclesWithData] = await conn.execute(`
  SELECT DISTINCT doctor_cycle_id as cid FROM billing_visit_events WHERE doctor_cycle_id IS NOT NULL
  UNION
  SELECT DISTINCT system_cycle_id FROM billing_visit_events WHERE system_cycle_id IS NOT NULL
`);
const validCycleIds = cyclesWithData.map(r => r.cid).filter(Boolean);
console.log('  Ciclos com eventos:', validCycleIds.join(', '));

// Recalcular totais dos ciclos existentes
for (const cycleId of validCycleIds) {
  const [cycleInfo] = await conn.execute('SELECT id, cycle_type FROM billing_cycles WHERE id = ?', [cycleId]);
  if (cycleInfo.length === 0) continue;
  const ct = cycleInfo[0].cycle_type;
  
  if (ct === 'doctor') {
    const [agg] = await conn.execute(
      'SELECT COUNT(*) as cnt, SUM(doctor_amount_due) as total FROM billing_visit_events WHERE doctor_cycle_id = ? AND doctor_amount_due IS NOT NULL',
      [cycleId]
    );
    await conn.execute(
      'UPDATE billing_cycles SET total_reports = ?, total_amount = ? WHERE id = ?',
      [agg[0].cnt || 0, agg[0].total || 0, cycleId]
    );
    console.log(`  Ciclo ${cycleId} (doctor): ${agg[0].cnt} laudos, R$${agg[0].total || 0}`);
  } else {
    const [agg] = await conn.execute(
      'SELECT COUNT(*) as cnt, SUM(system_amount_due) as total FROM billing_visit_events WHERE system_cycle_id = ? AND system_amount_due IS NOT NULL',
      [cycleId]
    );
    await conn.execute(
      'UPDATE billing_cycles SET total_reports = ?, total_amount = ? WHERE id = ?',
      [agg[0].cnt || 0, agg[0].total || 0, cycleId]
    );
    console.log(`  Ciclo ${cycleId} (system): ${agg[0].cnt} laudos, R$${agg[0].total || 0}`);
  }
}

// ============================================================
// 6. CRIAR NOVOS EVENTOS DE BILLING PARA SIMULAÇÃO RICA
// ============================================================
console.log('\n--- Criando eventos de billing para simulação ---');

// Buscar ciclos abertos para vincular
const [openCycles] = await conn.execute(
  'SELECT id, unit_id, cycle_type, financial_responsible_id FROM billing_cycles WHERE status = "open" ORDER BY id'
);
console.log('  Ciclos abertos:', openCycles.map(c => `[${c.id}] unit=${c.unit_id} ${c.cycle_type}`).join(', '));

// Encontrar ciclos por unidade e tipo
const findCycle = (unitId, type) => openCycles.find(c => c.unit_id === unitId && c.cycle_type === type);

const cyclePrincipalDoc = findCycle(UNIT_PRINCIPAL, 'doctor');
const cyclePrincipalSys = findCycle(UNIT_PRINCIPAL, 'system');
const cyclePacsmlDoc = findCycle(UNIT_PACSML, 'doctor');
const cyclePacsmlSys = findCycle(UNIT_PACSML, 'system');

console.log('  Ciclo Principal Doctor:', cyclePrincipalDoc?.id);
console.log('  Ciclo Principal System:', cyclePrincipalSys?.id);
console.log('  Ciclo PACSML Doctor:', cyclePacsmlDoc?.id);
console.log('  Ciclo PACSML System:', cyclePacsmlSys?.id);

// Criar ciclos faltantes se necessário
if (!cyclePacsmlDoc) {
  console.log('  Criando ciclo doctor para PACSML...');
  const [res] = await conn.execute(
    `INSERT INTO billing_cycles (unit_id, financial_responsible_id, cycle_type, starts_at, ends_at, status, total_reports, total_amount, createdAt, updatedAt)
     VALUES (?, ?, 'doctor', '2026-04-01', '2026-04-30', 'open', 0, 0.00, NOW(), NOW())`,
    [UNIT_PACSML, RESP_SEM]
  );
  openCycles.push({ id: res.insertId, unit_id: UNIT_PACSML, cycle_type: 'doctor', financial_responsible_id: RESP_SEM });
  console.log(`  Ciclo PACSML doctor criado: id=${res.insertId}`);
}

if (!cyclePacsmlSys) {
  console.log('  Criando ciclo system para PACSML...');
  const [res] = await conn.execute(
    `INSERT INTO billing_cycles (unit_id, financial_responsible_id, cycle_type, starts_at, ends_at, status, total_reports, total_amount, createdAt, updatedAt)
     VALUES (?, ?, 'system', '2026-04-01', '2026-04-30', 'open', 0, 0.00, NOW(), NOW())`,
    [UNIT_PACSML, RESP_SEM]
  );
  openCycles.push({ id: res.insertId, unit_id: UNIT_PACSML, cycle_type: 'system', financial_responsible_id: RESP_SEM });
  console.log(`  Ciclo PACSML system criado: id=${res.insertId}`);
}

// Recarregar ciclos abertos
const [allOpenCycles] = await conn.execute(
  'SELECT id, unit_id, cycle_type, financial_responsible_id FROM billing_cycles WHERE status = "open" ORDER BY id'
);

const getDocCycle = (unitId) => allOpenCycles.find(c => c.unit_id === unitId && c.cycle_type === 'doctor');
const getSysCycle = (unitId) => allOpenCycles.find(c => c.unit_id === unitId && c.cycle_type === 'system');

// Dados de simulação: laudos por data
const studyDates = [
  '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-07',
  '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-11', '2026-04-14',
];

const patients = [
  'JOAO SILVA', 'MARIA SANTOS', 'PEDRO OLIVEIRA', 'ANA COSTA', 'CARLOS LIMA',
  'LUCIA FERREIRA', 'MARCOS ALVES', 'PATRICIA SOUZA', 'ROBERTO NUNES', 'FERNANDA DIAS',
  'ANTONIO ROCHA', 'JULIANA MELO', 'PAULO CARVALHO', 'SANDRA RIBEIRO', 'LUCAS GOMES',
];

// Função para criar evento (cria report primeiro, depois evento)
async function createEvent(unitId, doctorId, respId, docCycleId, sysCycleId, docPrice, sysPrice, studyDate, patientName, studyUid) {
  const docAmt = docPrice;
  const sysAmt = sysPrice;
  const reportKey = `DEMO.${unitId}.${doctorId}.${studyDate}.${Math.random().toString(36).slice(2)}`;
  
  // Criar report simulado
  const [repRes] = await conn.execute(
    `INSERT INTO reports (unit_id, study_instance_uid, author_user_id, body, status, signedAt, signedBy, createdAt, updatedAt)
     VALUES (?, ?, ?, 'Laudo de demonstração gerado automaticamente.', 'signed', ?, ?, NOW(), NOW())`,
    [unitId, studyUid, doctorId, studyDate + ' 10:00:00', doctorId]
  );
  const reportId = repRes.insertId;
  
  await conn.execute(
    `INSERT INTO billing_visit_events 
     (report_id, unit_id, doctor_user_id, financial_responsible_id, study_instance_uid, report_key, patient_name, study_date,
      doctor_cycle_id, system_cycle_id, doctor_price_applied, system_price_applied,
      doctor_amount_due, system_amount_due, pricing_status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', NOW(), NOW())`,
    [reportId, unitId, doctorId, respId, studyUid, reportKey, patientName, studyDate,
     docCycleId, sysCycleId, docPrice, sysPrice, docAmt, sysAmt]
  );
}

// Criar eventos para PACS Principal (unidade 180001, responsável 1)
// Médico: gian (5520015) - preço R$8,00 médico, R$4,00 sistema
// Médico: admin (1) - preço R$25,00 médico, R$4,00 sistema
const docCyclePrincipal = getDocCycle(UNIT_PRINCIPAL);
const sysCyclePrincipal = getSysCycle(UNIT_PRINCIPAL);

if (docCyclePrincipal && sysCyclePrincipal) {
  console.log('\n  Criando eventos para PACS Principal...');
  let count = 0;
  for (let i = 0; i < 10; i++) {
    const date = studyDates[i % studyDates.length];
    const patient = patients[i % patients.length];
    const uid = `1.2.840.10008.5.1.4.1.1.4.DEMO.PRINCIPAL.${Date.now()}.${i}`;
    await createEvent(UNIT_PRINCIPAL, DOCTOR_ID, RESP_ID, docCyclePrincipal.id, sysCyclePrincipal.id, 8.00, 4.00, date, patient, uid);
    count++;
  }
  // Admin também laudou alguns
  for (let i = 0; i < 5; i++) {
    const date = studyDates[i % studyDates.length];
    const patient = patients[(i + 5) % patients.length];
    const uid = `1.2.840.10008.5.1.4.1.1.4.DEMO.PRINCIPAL.ADMIN.${Date.now()}.${i}`;
    await createEvent(UNIT_PRINCIPAL, ADMIN_ID, RESP_ID, docCyclePrincipal.id, sysCyclePrincipal.id, 25.00, 4.00, date, patient, uid);
    count++;
  }
  console.log(`  ${count} eventos criados para PACS Principal`);
}

// Criar eventos para PACSML (unidade 210001, responsável 30001)
// Médico: gian (5520015) - preço R$6,50 médico, R$5,00 sistema
const docCyclePacsml = getDocCycle(UNIT_PACSML);
const sysCyclePacsml = getSysCycle(UNIT_PACSML);

if (docCyclePacsml && sysCyclePacsml) {
  console.log('\n  Criando eventos para PACSML...');
  let count = 0;
  for (let i = 0; i < 8; i++) {
    const date = studyDates[i % studyDates.length];
    const patient = patients[(i + 3) % patients.length];
    const uid = `1.2.840.10008.5.1.4.1.1.4.DEMO.PACSML.${Date.now()}.${i}`;
    await createEvent(UNIT_PACSML, DOCTOR_ID, RESP_SEM, docCyclePacsml.id, sysCyclePacsml.id, 6.50, 5.00, date, patient, uid);
    count++;
  }
  console.log(`  ${count} eventos criados para PACSML`);
}

// ============================================================
// 7. RECALCULAR TOTAIS DOS CICLOS
// ============================================================
console.log('\n--- Recalculando totais dos ciclos ---');
const [allCycles] = await conn.execute('SELECT id, cycle_type FROM billing_cycles');
for (const cycle of allCycles) {
  if (cycle.cycle_type === 'doctor') {
    const [agg] = await conn.execute(
      'SELECT COUNT(*) as cnt, COALESCE(SUM(doctor_amount_due), 0) as total FROM billing_visit_events WHERE doctor_cycle_id = ?',
      [cycle.id]
    );
    await conn.execute(
      'UPDATE billing_cycles SET total_reports = ?, total_amount = ? WHERE id = ?',
      [agg[0].cnt, agg[0].total, cycle.id]
    );
    if (agg[0].cnt > 0) console.log(`  Ciclo ${cycle.id} (doctor): ${agg[0].cnt} laudos, R$${parseFloat(agg[0].total).toFixed(2)}`);
  } else {
    const [agg] = await conn.execute(
      'SELECT COUNT(*) as cnt, COALESCE(SUM(system_amount_due), 0) as total FROM billing_visit_events WHERE system_cycle_id = ?',
      [cycle.id]
    );
    await conn.execute(
      'UPDATE billing_cycles SET total_reports = ?, total_amount = ? WHERE id = ?',
      [agg[0].cnt, agg[0].total, cycle.id]
    );
    if (agg[0].cnt > 0) console.log(`  Ciclo ${cycle.id} (system): ${agg[0].cnt} laudos, R$${parseFloat(agg[0].total).toFixed(2)}`);
  }
}

// ============================================================
// 8. RESUMO FINAL
// ============================================================
console.log('\n=== RESUMO FINAL ===');

const [finalCycles] = await conn.execute(`
  SELECT bc.id, bc.unit_id, u.name as unit_name, bc.cycle_type, bc.status, bc.total_reports, bc.total_amount, bc.financial_responsible_id
  FROM billing_cycles bc
  JOIN units u ON u.id = bc.unit_id
  ORDER BY bc.unit_id, bc.cycle_type
`);

console.log('\nCICLOS:');
finalCycles.forEach(c => {
  if (c.total_reports > 0) {
    console.log(`  [${c.id}] ${c.unit_name} | ${c.cycle_type} | ${c.status} | ${c.total_reports} laudos | R$${parseFloat(c.total_amount).toFixed(2)}`);
  }
});

const [totalByUnit] = await conn.execute(`
  SELECT u.name, 
    SUM(CASE WHEN bve.system_amount_due IS NOT NULL THEN bve.system_amount_due ELSE 0 END) as sistema_total,
    SUM(CASE WHEN bve.doctor_amount_due IS NOT NULL THEN bve.doctor_amount_due ELSE 0 END) as medicos_total,
    COUNT(*) as laudos
  FROM billing_visit_events bve
  JOIN units u ON u.id = bve.unit_id
  GROUP BY u.id, u.name
`);

console.log('\nSALDOS POR UNIDADE:');
let totalSistema = 0, totalMedicos = 0;
totalByUnit.forEach(r => {
  console.log(`  ${r.name}: Sistema=R$${parseFloat(r.sistema_total).toFixed(2)} | Médicos=R$${parseFloat(r.medicos_total).toFixed(2)} | ${r.laudos} laudos`);
  totalSistema += parseFloat(r.sistema_total);
  totalMedicos += parseFloat(r.medicos_total);
});
console.log(`\nTOTAL GERAL: Sistema=R$${totalSistema.toFixed(2)} | Médicos=R$${totalMedicos.toFixed(2)}`);

const [byDoctor] = await conn.execute(`
  SELECT u2.name as doctor_name, u.name as unit_name,
    SUM(bve.doctor_amount_due) as total,
    COUNT(*) as laudos
  FROM billing_visit_events bve
  JOIN users u2 ON u2.id = bve.doctor_user_id
  JOIN units u ON u.id = bve.unit_id
  WHERE bve.doctor_amount_due IS NOT NULL
  GROUP BY bve.doctor_user_id, bve.unit_id
  ORDER BY u2.name, u.name
`);

console.log('\nSALDO POR MÉDICO/UNIDADE:');
byDoctor.forEach(r => {
  console.log(`  ${r.doctor_name} @ ${r.unit_name}: R$${parseFloat(r.total).toFixed(2)} (${r.laudos} laudos)`);
});

console.log('\n✅ Seed concluído com sucesso!');
await conn.end();
process.exit(0);
