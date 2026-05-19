/**
 * Script de migração: converte bodies de report_masks de texto puro para HTML.
 * Roda uma vez — seguro de re-executar (detecta HTML e pula).
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

function normalizeBodyToHtml(body) {
  // Já é HTML — não mexe
  if (/<[a-zA-Z][^>]*>/.test(body)) return body;

  const lines = body.split('\n');
  const output = [];
  let paragraphLines = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      output.push(`<p>${paragraphLines.join('<br>')}</p>`);
      paragraphLines = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const sectionMatch = trimmed.match(/^===\s*(.+?)\s*===/);
    if (sectionMatch) {
      flushParagraph();
      output.push(`<h3>${sectionMatch[1]}</h3>`);
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  return output.join('');
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.execute("SELECT id, body FROM report_masks");

let updated = 0;
for (const row of rows) {
  const converted = normalizeBodyToHtml(row.body);
  if (converted !== row.body) {
    await conn.execute("UPDATE report_masks SET body = ? WHERE id = ?", [converted, row.id]);
    console.log(`  ✅ id=${row.id} convertido`);
    updated++;
  } else {
    console.log(`  ⏭  id=${row.id} já era HTML — pulado`);
  }
}

console.log(`\nConcluído: ${updated} registro(s) atualizado(s).`);
await conn.end();
