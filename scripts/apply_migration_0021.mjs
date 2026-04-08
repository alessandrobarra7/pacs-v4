import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '../drizzle/0021_amusing_madame_masque.sql'), 'utf8');

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Split by semicolon and run each statement
const statements = sql.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'));
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('✓', stmt.slice(0, 60).replace(/\n/g, ' '));
  } catch (e) {
    if (e.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('⚠ already exists, skipping:', stmt.slice(0, 60));
    } else {
      console.error('✗ ERROR:', e.message, '\n  SQL:', stmt.slice(0, 80));
    }
  }
}

await conn.end();
console.log('\nMigration 0021 complete.');
