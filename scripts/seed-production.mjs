/**
 * Script de seed para produção
 * Cria o usuário admin_master inicial e a unidade padrão
 * 
 * Uso: node scripts/seed-production.mjs
 * Requer: DATABASE_URL no ambiente
 */
import { createConnection } from 'mysql2/promise';
import { createHash, randomBytes } from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('❌ DATABASE_URL não definida. Configure o .env primeiro.');
  process.exit(1);
}

// Parse MySQL URL: mysql://user:pass@host:port/db
const url = new URL(DB_URL);
const conn = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  ssl: url.searchParams.get('ssl') === 'true' ? {} : undefined,
});

console.log('✅ Conectado ao banco de dados');

// 1. Criar tabelas se não existirem (schema completo)
await conn.execute(`
  CREATE TABLE IF NOT EXISTS units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    isActive BOOLEAN DEFAULT TRUE NOT NULL,
    orthanc_base_url VARCHAR(500),
    orthanc_basic_user VARCHAR(100),
    orthanc_basic_pass VARCHAR(255),
    pacs_ip VARCHAR(45),
    pacs_port INT,
    pacs_ae_title VARCHAR(16),
    pacs_local_ae_title VARCHAR(16) DEFAULT 'PACSMANUS',
    logoUrl VARCHAR(500),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
`);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    openId VARCHAR(64) NOT NULL UNIQUE,
    unit_id INT,
    name TEXT,
    email VARCHAR(320),
    username VARCHAR(64) UNIQUE,
    password_hash VARCHAR(255),
    loginMethod VARCHAR(64),
    role ENUM('admin_master','unit_admin','medico','viewer') DEFAULT 'viewer' NOT NULL,
    isActive BOOLEAN DEFAULT TRUE NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
    lastSignedIn TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
`);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS studies_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    unit_id INT NOT NULL,
    orthanc_study_id VARCHAR(64),
    study_instance_uid VARCHAR(128),
    patient_name VARCHAR(255),
    patient_id VARCHAR(64),
    accession_number VARCHAR(64),
    study_date DATE,
    modality VARCHAR(50),
    description TEXT,
    studyMetadata JSON,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
`);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    unit_id INT,
    name VARCHAR(255) NOT NULL,
    modality VARCHAR(50),
    bodyTemplate TEXT NOT NULL,
    fields JSON,
    isGlobal BOOLEAN DEFAULT FALSE NOT NULL,
    isActive BOOLEAN DEFAULT TRUE NOT NULL,
    createdBy INT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
`);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    unit_id INT NOT NULL,
    study_id INT,
    study_instance_uid VARCHAR(128),
    template_id INT,
    author_user_id INT NOT NULL,
    body TEXT NOT NULL,
    status ENUM('draft','signed','revised') DEFAULT 'draft' NOT NULL,
    version INT DEFAULT 1 NOT NULL,
    previousVersionId INT,
    signedAt TIMESTAMP NULL,
    signedBy INT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
`);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    unit_id INT,
    action ENUM('LOGIN','LOGOUT','VIEW_STUDY','OPEN_VIEWER','CREATE_REPORT','UPDATE_REPORT','SIGN_REPORT','CREATE_USER','UPDATE_USER','DELETE_USER','CREATE_UNIT','UPDATE_UNIT','DELETE_UNIT','PACS_QUERY','PACS_DOWNLOAD','CREATE_ANAMNESIS') NOT NULL,
    target_type VARCHAR(50),
    target_id VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSON,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
`);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS anamnesis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    study_instance_uid VARCHAR(128) NOT NULL,
    unit_id INT,
    created_by_user_id INT,
    exam_area VARCHAR(50),
    main_symptom VARCHAR(100),
    symptom_duration_days INT,
    symptom_intensity VARCHAR(20),
    has_fever BOOLEAN DEFAULT FALSE,
    fever_temperature DECIMAL(4,1),
    has_dyspnea BOOLEAN DEFAULT FALSE,
    has_chest_pain BOOLEAN DEFAULT FALSE,
    associated_symptoms TEXT,
    has_hypertension BOOLEAN DEFAULT FALSE,
    has_diabetes BOOLEAN DEFAULT FALSE,
    has_anxiety BOOLEAN DEFAULT FALSE,
    has_previous_lung_disease BOOLEAN DEFAULT FALSE,
    uses_continuous_medication BOOLEAN DEFAULT FALSE,
    medications_list TEXT,
    exam_purpose VARCHAR(50),
    suggested_cid VARCHAR(20),
    suggested_cid_description VARCHAR(255),
    anamnesis_data JSON,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
`);

console.log('✅ Tabelas criadas/verificadas');

// 2. Criar unidade padrão (Orthanc LAUDS)
const [existingUnits] = await conn.execute('SELECT id FROM units WHERE slug = ?', ['lauds-principal']);
if (existingUnits.length === 0) {
  await conn.execute(`
    INSERT INTO units (name, slug, orthanc_base_url, pacs_ip, pacs_port, pacs_ae_title, isActive)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['LAUDS Principal', 'lauds-principal', 'http://172.16.3.241:8042', '172.16.3.241', 8042, 'PACS', true]);
  console.log('✅ Unidade padrão criada: LAUDS Principal (172.16.3.241:8042)');
} else {
  console.log('ℹ️  Unidade padrão já existe');
}

// 3. Criar usuário admin_master inicial
const adminUsername = 'admin';
const adminPassword = 'Admin@2025';
const adminName = 'Administrador';

const [existingAdmin] = await conn.execute('SELECT id FROM users WHERE username = ?', [adminUsername]);
if (existingAdmin.length === 0) {
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const openId = `local_admin_${Date.now()}`;
  await conn.execute(`
    INSERT INTO users (openId, username, name, password_hash, role, loginMethod, isActive, lastSignedIn)
    VALUES (?, ?, ?, ?, 'admin_master', 'local', TRUE, NOW())
  `, [openId, adminUsername, adminName, passwordHash]);
  console.log('✅ Usuário admin criado:');
  console.log('   Username: admin');
  console.log('   Senha:    Admin@2025');
  console.log('   ⚠️  ALTERE A SENHA APÓS O PRIMEIRO LOGIN!');
} else {
  console.log('ℹ️  Usuário admin já existe');
}

await conn.end();
console.log('\n🚀 Seed de produção concluído com sucesso!');
