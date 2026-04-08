import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const statements = [
  `DROP TABLE IF EXISTS \`billing_report_items\``,
  `CREATE TABLE \`billing_report_items\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`report_id\` int NOT NULL,
    \`study_instance_uid\` varchar(128),
    \`financial_responsible_id\` int,
    \`unit_id\` int NOT NULL,
    \`doctor_user_id\` int NOT NULL,
    \`competence_year\` int NOT NULL,
    \`competence_month\` int NOT NULL,
    \`report_status_snapshot\` enum('signed','revised') NOT NULL,
    \`report_signed_at\` timestamp NOT NULL,
    \`system_price_applied\` decimal(10,2),
    \`doctor_price_applied\` decimal(10,2),
    \`system_amount_due\` decimal(10,2),
    \`doctor_amount_due\` decimal(10,2),
    \`pricing_status\` enum('ok','pending_system_price','pending_doctor_price','pending_both') NOT NULL DEFAULT 'pending_both',
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`billing_report_items_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`uq_report_item\` UNIQUE(\`report_id\`)
  )`,
  // Also ensure financial_responsibles exists (may have been skipped due to split issue)
  `CREATE TABLE IF NOT EXISTS \`financial_responsibles\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`person_type\` enum('PF','PJ') NOT NULL DEFAULT 'PJ',
    \`legal_name\` varchar(255) NOT NULL,
    \`trade_name\` varchar(255),
    \`cpf_cnpj\` varchar(18),
    \`email\` varchar(320),
    \`phone\` varchar(30),
    \`notes\` text,
    \`isActive\` boolean NOT NULL DEFAULT true,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`financial_responsibles_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`financial_responsibles_cpf_cnpj_unique\` UNIQUE(\`cpf_cnpj\`)
  )`,
  // Add responsavel_financeiro role
  `ALTER TABLE \`users\` MODIFY COLUMN \`role\` enum('admin_master','unit_admin','medico','viewer','operador','responsavel_financeiro') NOT NULL DEFAULT 'viewer'`,
];

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.substring(0, 60).replace(/\n/g, ' ').trim());
  } catch (e) {
    console.error('ERR:', e.message, '|', stmt.substring(0, 60).replace(/\n/g, ' ').trim());
  }
}

await conn.end();
console.log('Fix applied.');
