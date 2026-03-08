-- ============================================================
-- LAUDS - Script completo de criação do banco de dados
-- Banco: pacs_portal | Usuário: pacs_user
-- Executar na VM1: mysql -h 172.16.3.101 -u pacs_user -pPacsPortal2025 pacs_portal < /tmp/lauds_setup.sql
-- ============================================================

USE pacs_portal;

-- 1. Tabela: units
CREATE TABLE IF NOT EXISTS `units` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(100) NOT NULL UNIQUE,
  `isActive` BOOLEAN DEFAULT TRUE NOT NULL,
  `orthanc_base_url` VARCHAR(500),
  `orthanc_public_url` VARCHAR(500),
  `orthanc_basic_user` VARCHAR(100),
  `orthanc_basic_pass` VARCHAR(255),
  `pacs_ip` VARCHAR(45),
  `pacs_port` INT,
  `pacs_ae_title` VARCHAR(16),
  `pacs_local_ae_title` VARCHAR(16) DEFAULT 'PACSMANUS',
  `logoUrl` VARCHAR(500),
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Tabela: users
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `openId` VARCHAR(64) NOT NULL UNIQUE,
  `unit_id` INT,
  `name` TEXT,
  `email` VARCHAR(320),
  `username` VARCHAR(64) UNIQUE,
  `password_hash` VARCHAR(255),
  `loginMethod` VARCHAR(64),
  `role` ENUM('admin_master','unit_admin','medico','viewer') DEFAULT 'viewer' NOT NULL,
  `isActive` BOOLEAN DEFAULT TRUE NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  `lastSignedIn` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. Tabela: studies_cache
CREATE TABLE IF NOT EXISTS `studies_cache` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `unit_id` INT NOT NULL,
  `orthanc_study_id` VARCHAR(64),
  `study_instance_uid` VARCHAR(128),
  `patient_name` VARCHAR(255),
  `patient_id` VARCHAR(64),
  `accession_number` VARCHAR(64),
  `study_date` DATE,
  `modality` VARCHAR(50),
  `description` TEXT,
  `studyMetadata` JSON,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. Tabela: templates
CREATE TABLE IF NOT EXISTS `templates` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `unit_id` INT,
  `name` VARCHAR(255) NOT NULL,
  `modality` VARCHAR(50),
  `bodyTemplate` TEXT NOT NULL,
  `fields` JSON,
  `isGlobal` BOOLEAN DEFAULT FALSE NOT NULL,
  `isActive` BOOLEAN DEFAULT TRUE NOT NULL,
  `createdBy` INT,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5. Tabela: reports
CREATE TABLE IF NOT EXISTS `reports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `unit_id` INT NOT NULL,
  `study_id` INT,
  `study_instance_uid` VARCHAR(128),
  `template_id` INT,
  `author_user_id` INT NOT NULL,
  `body` TEXT NOT NULL,
  `status` ENUM('draft','signed','revised') DEFAULT 'draft' NOT NULL,
  `version` INT DEFAULT 1 NOT NULL,
  `previousVersionId` INT,
  `signedAt` TIMESTAMP NULL,
  `signedBy` INT,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 6. Tabela: audit_log
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT,
  `unit_id` INT,
  `action` ENUM('LOGIN','LOGOUT','VIEW_STUDY','OPEN_VIEWER','CREATE_REPORT','UPDATE_REPORT','SIGN_REPORT','CREATE_USER','UPDATE_USER','DELETE_USER','CREATE_UNIT','UPDATE_UNIT','DELETE_UNIT','PACS_QUERY','PACS_DOWNLOAD','CREATE_ANAMNESIS') NOT NULL,
  `target_type` VARCHAR(50),
  `target_id` VARCHAR(100),
  `ip_address` VARCHAR(45),
  `user_agent` TEXT,
  `metadata` JSON,
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 7. Tabela: anamnesis
CREATE TABLE IF NOT EXISTS `anamnesis` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `study_instance_uid` VARCHAR(128) NOT NULL,
  `unit_id` INT,
  `created_by_user_id` INT,
  `exam_area` VARCHAR(50),
  `main_symptom` VARCHAR(100),
  `symptom_duration_days` INT,
  `symptom_intensity` VARCHAR(20),
  `has_fever` BOOLEAN DEFAULT FALSE,
  `fever_temperature` DECIMAL(4,1),
  `has_dyspnea` BOOLEAN DEFAULT FALSE,
  `has_chest_pain` BOOLEAN DEFAULT FALSE,
  `associated_symptoms` TEXT,
  `has_hypertension` BOOLEAN DEFAULT FALSE,
  `has_diabetes` BOOLEAN DEFAULT FALSE,
  `has_anxiety` BOOLEAN DEFAULT FALSE,
  `has_previous_lung_disease` BOOLEAN DEFAULT FALSE,
  `uses_continuous_medication` BOOLEAN DEFAULT FALSE,
  `medications_list` TEXT,
  `exam_purpose` VARCHAR(50),
  `suggested_cid` VARCHAR(20),
  `suggested_cid_description` VARCHAR(255),
  `anamnesis_data` JSON,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `idx_study_instance_uid` (`study_instance_uid`),
  INDEX `idx_unit_id` (`unit_id`),
  INDEX `idx_created_by` (`created_by_user_id`)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================
-- DADOS INICIAIS
-- ============================================================

-- 5 unidades Orthanc (Mikrotik NAT)
INSERT IGNORE INTO `units` (name, slug, orthanc_base_url, orthanc_public_url, pacs_ip, pacs_port, pacs_ae_title, isActive)
VALUES
  ('LAUDS Principal', 'lauds-principal', 'http://172.16.3.241:8042', 'http://45.189.160.17:8042', '172.16.3.241', 8042, 'PACS', TRUE),
  ('Unidade 2', 'unidade-2', 'http://172.16.3.242:8042', 'http://45.189.160.17:4006', '172.16.3.242', 8042, 'PACS2', TRUE),
  ('Unidade 3', 'unidade-3', 'http://172.16.3.243:8042', 'http://45.189.160.17:4007', '172.16.3.243', 8042, 'PACS3', TRUE),
  ('Unidade 4', 'unidade-4', 'http://172.16.3.244:8042', 'http://45.189.160.17:4008', '172.16.3.244', 8042, 'PACS4', TRUE),
  ('Unidade 5', 'unidade-5', 'http://172.16.3.245:8042', 'http://45.189.160.17:4009', '172.16.3.245', 8042, 'PACS5', TRUE);

-- Usuário admin_master (senha: Admin@2025)
INSERT IGNORE INTO `users` (openId, username, name, password_hash, role, loginMethod, isActive, unit_id, lastSignedIn)
VALUES (
  'local_admin_lauds',
  'admin',
  'Administrador',
  '$2b$12$H5QdhpOxK294bzLLSPysYuKCNJcnoKomFpfsML03gCxDxaf8QeLjC',
  'admin_master',
  'local',
  TRUE,
  1,
  NOW()
);

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================
SELECT 'Tabelas:' AS resultado;
SHOW TABLES;
SELECT 'Unidades:' AS resultado;
SELECT id, name, pacs_ip, pacs_port FROM units;
SELECT 'Usuários:' AS resultado;
SELECT id, username, name, role, isActive FROM users;
