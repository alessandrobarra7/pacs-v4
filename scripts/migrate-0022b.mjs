import { createConnection } from "mysql2/promise";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../../opt/pacs-portal/.env") });
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await createConnection(DATABASE_URL);

const statements = [
  `CREATE TABLE IF NOT EXISTS unit_doctor_scales (
    id int AUTO_INCREMENT PRIMARY KEY NOT NULL,
    unit_id int NOT NULL,
    doctor_user_id int NOT NULL,
    days_of_week varchar(50) NOT NULL DEFAULT '[]',
    start_time varchar(5),
    end_time varchar(5),
    is_active boolean NOT NULL DEFAULT true,
    starts_at date,
    ends_at date,
    notes text,
    created_by int NOT NULL,
    createdAt timestamp NOT NULL DEFAULT (now()),
    updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_unit_doctor_scale (unit_id, doctor_user_id)
  )`,
];

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log("✓ unit_doctor_scales created");
  } catch (err) {
    console.error("✗ Error:", err.message);
  }
}

// Verify all 4 tables exist
const [rows] = await conn.execute(
  `SELECT table_name FROM information_schema.tables 
   WHERE table_schema = DATABASE() 
   AND table_name IN ('unit_doctor_scales','unit_doctor_compensation_rules','contract_revenues','contract_custom_expenses')`
);
console.log("Tables present:", rows.map(r => r.table_name || r.TABLE_NAME));

await conn.end();
