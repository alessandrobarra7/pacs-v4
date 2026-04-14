import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../../opt/pacs-portal/.env") });
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = readFileSync(join(__dirname, "../drizzle/0022_reestruturacao_intuitiva.sql"), "utf8");

// Split into individual statements
const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

const conn = await createConnection(DATABASE_URL);

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    const tableName = stmt.match(/CREATE TABLE IF NOT EXISTS `(\w+)`/)?.[1];
    if (tableName) console.log(`✓ Table ${tableName} created (or already exists)`);
  } catch (err) {
    console.error(`✗ Error: ${err.message}`);
    console.error(`  Statement: ${stmt.substring(0, 80)}...`);
  }
}

await conn.end();
console.log("Migration 0022 complete.");
