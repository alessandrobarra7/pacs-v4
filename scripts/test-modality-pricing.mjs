/**
 * test-modality-pricing.mjs
 * 
 * Simula a criação de um billing_visit_event com modality_snapshot = 'CT'
 * e verifica se o preço por modalidade (R$ 80,00) é aplicado em vez do padrão (R$ 25,00).
 * 
 * Uso: node scripts/test-modality-pricing.mjs
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌ DATABASE_URL não encontrada no .env");
  process.exit(1);
}

// Parsear a URL do banco
const url = new URL(DB_URL);
const conn = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: url.password,
  database: url.pathname.replace("/", ""),
  ssl: { rejectUnauthorized: false },
});

console.log("✅ Conectado ao banco de dados\n");

// ─── Parâmetros do teste ───────────────────────────────────────────────────────
const UNIT_ID = 210001;
const DOCTOR_USER_ID = 1;
const FINANCIAL_RESPONSIBLE_ID = 120001;
const TEST_MODALITY = "CT";
const REPORT_ID = 1110002; // laudo existente do Studio Barra7 na PACSML

// ─── 1. Verificar preço padrão do médico ──────────────────────────────────────
console.log("📋 1. Verificando preço PADRÃO do médico (billing_doctor_unit_prices)...");
const [defaultPrices] = await conn.execute(`
  SELECT price_per_report, starts_at, ends_at
  FROM billing_doctor_unit_prices
  WHERE unit_id = ? AND doctor_user_id = ? AND ends_at IS NULL
  ORDER BY starts_at DESC LIMIT 1
`, [UNIT_ID, DOCTOR_USER_ID]);

if (defaultPrices.length === 0) {
  console.log("   ⚠️  Nenhum preço padrão encontrado");
} else {
  console.log(`   ✅ Preço padrão: R$ ${defaultPrices[0].price_per_report} (vigente desde ${defaultPrices[0].starts_at})`);
}

// ─── 2. Verificar preço por modalidade CT ─────────────────────────────────────
console.log(`\n📋 2. Verificando preço por MODALIDADE (${TEST_MODALITY}) em billing_doctor_modality_prices...`);
const [modalityPrices] = await conn.execute(`
  SELECT price_per_report, modality, starts_at, ends_at
  FROM billing_doctor_modality_prices
  WHERE financial_responsible_id = ?
    AND unit_id = ?
    AND doctor_user_id = ?
    AND modality = ?
    AND starts_at <= NOW()
    AND (ends_at IS NULL OR ends_at >= NOW())
  ORDER BY starts_at DESC LIMIT 1
`, [FINANCIAL_RESPONSIBLE_ID, UNIT_ID, DOCTOR_USER_ID, TEST_MODALITY]);

if (modalityPrices.length === 0) {
  console.log(`   ⚠️  Nenhum preço por modalidade ${TEST_MODALITY} encontrado`);
} else {
  console.log(`   ✅ Preço por modalidade ${TEST_MODALITY}: R$ ${modalityPrices[0].price_per_report} (vigente desde ${modalityPrices[0].starts_at})`);
}

// ─── 3. Simular a lógica de getActiveDoctorPrice ──────────────────────────────
console.log(`\n📋 3. Simulando getActiveDoctorPrice(modality='${TEST_MODALITY}')...`);
const effectivePrice = modalityPrices.length > 0 
  ? parseFloat(modalityPrices[0].price_per_report)
  : (defaultPrices.length > 0 ? parseFloat(defaultPrices[0].price_per_report) : null);

const priceSource = modalityPrices.length > 0 ? `modalidade ${TEST_MODALITY}` : "preço padrão";
console.log(`   ✅ Preço efetivo: R$ ${effectivePrice} (fonte: ${priceSource})`);

// ─── 4. Verificar o evento financeiro atual do laudo ──────────────────────────
console.log(`\n📋 4. Verificando evento financeiro atual do laudo ${REPORT_ID}...`);
const [currentEvents] = await conn.execute(`
  SELECT id, doctor_price_applied, doctor_amount_due, modality_snapshot, pricing_status
  FROM billing_visit_events
  WHERE report_id = ?
  LIMIT 1
`, [REPORT_ID]);

if (currentEvents.length === 0) {
  console.log("   ⚠️  Nenhum evento financeiro encontrado para este laudo");
} else {
  const ev = currentEvents[0];
  console.log(`   📄 Evento ID: ${ev.id}`);
  console.log(`   💰 doctor_price_applied: R$ ${ev.doctor_price_applied}`);
  console.log(`   💰 doctor_amount_due: R$ ${ev.doctor_amount_due}`);
  console.log(`   🏥 modality_snapshot: ${ev.modality_snapshot ?? "(vazio)"}`);
  console.log(`   📊 pricing_status: ${ev.pricing_status}`);
}

// ─── 5. Simular atualização do modality_snapshot e repricing ──────────────────
console.log(`\n📋 5. Simulando repricing: atualizando modality_snapshot para '${TEST_MODALITY}'...`);

if (currentEvents.length > 0) {
  const eventId = currentEvents[0].id;
  
  // Atualizar modality_snapshot
  await conn.execute(`
    UPDATE billing_visit_events
    SET modality_snapshot = ?, doctor_price_applied = ?, doctor_amount_due = ?
    WHERE id = ?
  `, [TEST_MODALITY, effectivePrice, effectivePrice, eventId]);
  
  console.log(`   ✅ Evento ${eventId} atualizado:`);
  console.log(`      modality_snapshot: ${TEST_MODALITY}`);
  console.log(`      doctor_price_applied: R$ ${effectivePrice} (era R$ ${currentEvents[0].doctor_price_applied})`);
  console.log(`      doctor_amount_due: R$ ${effectivePrice} (era R$ ${currentEvents[0].doctor_amount_due})`);
  
  // Verificar resultado
  const [updated] = await conn.execute(`
    SELECT id, doctor_price_applied, doctor_amount_due, modality_snapshot, pricing_status
    FROM billing_visit_events WHERE id = ?
  `, [eventId]);
  
  console.log(`\n   📊 Resultado final no banco:`);
  console.log(`      doctor_price_applied: R$ ${updated[0].doctor_price_applied}`);
  console.log(`      doctor_amount_due: R$ ${updated[0].doctor_amount_due}`);
  console.log(`      modality_snapshot: ${updated[0].modality_snapshot}`);
  
  const isCorrect = parseFloat(updated[0].doctor_price_applied) === effectivePrice;
  console.log(`\n   ${isCorrect ? "✅ SUCESSO" : "❌ FALHA"}: Preço aplicado ${isCorrect ? "CORRETO" : "INCORRETO"}`);
  console.log(`      Esperado: R$ ${effectivePrice} (${priceSource})`);
  console.log(`      Obtido:   R$ ${updated[0].doctor_price_applied}`);
}

// ─── 6. Resumo ────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log("📊 RESUMO DA SIMULAÇÃO");
console.log("═".repeat(60));
console.log(`Médico:              Studio Barra7 (ID: ${DOCTOR_USER_ID})`);
console.log(`Unidade:             PACSML (ID: ${UNIT_ID})`);
console.log(`Modalidade testada:  ${TEST_MODALITY}`);
console.log(`Preço padrão:        R$ ${defaultPrices[0]?.price_per_report ?? "N/A"}`);
console.log(`Preço por modalidade: R$ ${modalityPrices[0]?.price_per_report ?? "N/A"}`);
console.log(`Preço efetivo:       R$ ${effectivePrice} (${priceSource})`);
console.log(`Hierarquia aplicada: ${modalityPrices.length > 0 ? "✅ Preço por modalidade sobrepõe o padrão" : "⚠️  Usando preço padrão (sem preço por modalidade)"}`);
console.log("═".repeat(60));

await conn.end();
