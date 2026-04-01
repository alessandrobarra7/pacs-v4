import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

try {
  // Altera o ENUM da coluna action para incluir EDIT_STUDY_METADATA
  await conn.execute(`
    ALTER TABLE audit_log
    MODIFY COLUMN action ENUM(
      'LOGIN','LOGOUT','VIEW_STUDY','OPEN_VIEWER',
      'CREATE_REPORT','UPDATE_REPORT','SIGN_REPORT',
      'CREATE_USER','UPDATE_USER','DELETE_USER',
      'CREATE_UNIT','UPDATE_UNIT','DELETE_UNIT',
      'PACS_QUERY','PACS_DOWNLOAD',
      'CREATE_ANAMNESIS','EDIT_STUDY_METADATA'
    ) NOT NULL
  `);
  console.log("✅ ENUM do audit_log atualizado com EDIT_STUDY_METADATA");
} catch (err) {
  console.error("❌ Erro:", err.message);
} finally {
  await conn.end();
}
