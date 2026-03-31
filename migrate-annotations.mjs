import mysql from "mysql2/promise";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found in .env");
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

const sql = `
CREATE TABLE IF NOT EXISTS \`dicom_annotations\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`study_instance_uid\` varchar(128) NOT NULL,
  \`series_instance_uid\` varchar(128),
  \`user_id\` int NOT NULL,
  \`tool_name\` varchar(64) NOT NULL DEFAULT 'Length',
  \`annotation_uid\` varchar(128) NOT NULL,
  \`annotation_data\` json NOT NULL,
  \`label\` varchar(255),
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`dicom_annotations_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`dicom_annotations_annotation_uid_unique\` UNIQUE(\`annotation_uid\`)
)
`;

try {
  await conn.execute(sql);
  console.log("✅ Tabela dicom_annotations criada com sucesso!");
} catch (err) {
  if (err.code === "ER_TABLE_EXISTS_ERROR") {
    console.log("ℹ️  Tabela dicom_annotations já existe.");
  } else {
    console.error("❌ Erro:", err.message);
    process.exit(1);
  }
} finally {
  await conn.end();
}
