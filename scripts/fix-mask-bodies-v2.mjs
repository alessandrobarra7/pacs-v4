/**
 * Script v2: força reconversão dos bodies usando os JSONs originais como fonte.
 * Aplica a lógica correta (linha a linha) independente do estado atual no banco.
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

function normalizeBodyToHtml(body) {
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
    const sectionMatch = trimmed.match(/^===\s*(.+?)\s*===$/);
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

// Carrega os JSONs originais
const jsonFiles = [
  "/home/ubuntu/upload/CRANIO_AVE_ISQUEMICO_MASK.json",
  "/home/ubuntu/upload/ABDOMEN_TOTAL_NORMAL.json",
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);

for (const filePath of jsonFiles) {
  let masks;
  try {
    masks = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    console.log(`  ⚠️  Não encontrado: ${filePath}`);
    continue;
  }

  for (const mask of masks) {
    const converted = normalizeBodyToHtml(mask.body);
    const [result] = await conn.execute(
      "UPDATE report_masks SET body = ? WHERE name = ?",
      [converted, mask.name]
    );
    if (result.affectedRows > 0) {
      console.log(`  ✅ "${mask.name}" reconvertido`);
    } else {
      console.log(`  ⚠️  "${mask.name}" não encontrado no banco`);
    }
  }
}

// Mostra resultado final
const [rows] = await conn.execute("SELECT id, name, LEFT(body, 200) as preview FROM report_masks ORDER BY id");
console.log("\n── Resultado final ──");
for (const r of rows) {
  console.log(`\nid=${r.id} | ${r.name}\n${r.preview}`);
}

await conn.end();
