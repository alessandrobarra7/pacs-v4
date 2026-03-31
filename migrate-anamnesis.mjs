import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('[migrate] Conectado ao banco de dados');

try {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`anamnesis_simple\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`study_instance_uid\` varchar(128) NOT NULL,
      \`unit_id\` int,
      \`created_by_user_id\` int,
      \`patient_name\` varchar(255),
      \`presets\` json NOT NULL,
      \`manual_text\` text NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`anamnesis_simple_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`anamnesis_simple_study_uid_unique\` UNIQUE(\`study_instance_uid\`)
    )
  `);
  console.log('[migrate] ✓ Tabela anamnesis_simple criada com sucesso');
} catch (err) {
  console.error('[migrate] Erro:', err.message);
  process.exit(1);
} finally {
  await conn.end();
}
