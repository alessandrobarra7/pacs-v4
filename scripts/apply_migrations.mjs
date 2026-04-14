import mysql from 'mysql2/promise';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

// Parse DATABASE_URL para extrair host, user, password, db
const url = new URL(dbUrl);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  ssl: { rejectUnauthorized: false },
  multipleStatements: false,
});

const files = [
  path.join(__dirname, '../drizzle/0024_exam_legends.sql'),
  path.join(__dirname, '../drizzle/0025_seed_phrases_templates.sql'),
];

for (const file of files) {
  if (!fs.existsSync(file)) { console.log('SKIP (not found):', file); continue; }
  const content = fs.readFileSync(file, 'utf8');
  // Remove comments and split by semicolon
  const stmts = content
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  console.log(`\nApplying ${path.basename(file)} (${stmts.length} statements)...`);
  for (const stmt of stmts) {
    try {
      await conn.execute(stmt);
      console.log('  OK:', stmt.substring(0, 70).replace(/\n/g, ' '));
    } catch (e) {
      console.log('  SKIP:', e.message.substring(0, 100));
    }
  }
}

await conn.end();
console.log('\nDone!');
