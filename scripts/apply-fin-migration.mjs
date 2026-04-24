import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '/opt/pacs-portal/.env' });

const sql = `
ALTER TABLE \`billing_visit_events\`
  ADD COLUMN \`patient_price\` decimal(10,2),
  ADD COLUMN \`modality_snapshot\` varchar(20),
  ADD COLUMN \`exam_name_snapshot\` varchar(200);

CREATE TABLE IF NOT EXISTS \`unit_exam_prices\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`unit_id\` int NOT NULL,
  \`modality\` varchar(20) NOT NULL,
  \`exam_name\` varchar(200) NOT NULL,
  \`price_per_exam\` decimal(10,2) NOT NULL,
  \`is_active\` boolean NOT NULL DEFAULT true,
  \`created_by\` int NOT NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`unit_exam_prices_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`uq_unit_modality_exam\` UNIQUE(\`unit_id\`, \`modality\`, \`exam_name\`)
);
`;

const conn = await createConnection(process.env.DATABASE_URL);

const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

for (const stmt of statements) {
  try {
    console.log('Executing:', stmt.substring(0, 80) + '...');
    await conn.execute(stmt);
    console.log('  OK');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('  Already exists, skipping');
    } else {
      console.error('  ERROR:', e.message);
      process.exit(1);
    }
  }
}

await conn.end();
console.log('\nMigration applied successfully!');
