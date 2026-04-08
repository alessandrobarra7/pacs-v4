import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlFile = join(__dirname, '../drizzle/0020_massive_menace.sql');
const rawSql = readFileSync(sqlFile, 'utf8');

// Split on semicolons, skip comments and empty lines
const statements = rawSql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

const conn = await mysql.createConnection(process.env.DATABASE_URL);

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.substring(0, 80).replace(/\n/g, ' '));
  } catch (e) {
    console.error('ERR:', e.message, '|', stmt.substring(0, 60).replace(/\n/g, ' '));
  }
}

await conn.end();
console.log('Migration 0020 applied.');
