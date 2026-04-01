import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);

try {
  const sql = `CREATE TABLE IF NOT EXISTS \`study_metadata\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`study_instance_uid\` varchar(128) NOT NULL,
    \`unit_id\` int NOT NULL,
    \`patient_name_override\` varchar(255),
    \`description_override\` varchar(255),
    \`notes\` text,
    \`edited_by_user_id\` int NOT NULL,
    \`edited_by_name\` varchar(255),
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`study_metadata_id\` PRIMARY KEY(\`id\`),
    UNIQUE KEY \`study_metadata_uid_unit\` (\`study_instance_uid\`, \`unit_id\`)
  )`;

  await connection.execute(sql);
  console.log("✅ Tabela study_metadata criada com sucesso");
} catch (err) {
  if (err.code === "ER_TABLE_EXISTS_ERROR") {
    console.log("ℹ️  Tabela study_metadata já existe — adicionando índice único se necessário");
    try {
      await connection.execute(
        "ALTER TABLE study_metadata ADD UNIQUE KEY `study_metadata_uid_unit` (`study_instance_uid`, `unit_id`)"
      );
      console.log("✅ Índice único adicionado");
    } catch {
      console.log("ℹ️  Índice já existe");
    }
  } else {
    console.error("❌ Erro:", err.message);
    process.exit(1);
  }
} finally {
  await connection.end();
}
