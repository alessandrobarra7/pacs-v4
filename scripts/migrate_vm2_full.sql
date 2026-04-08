-- ============================================================
-- SCRIPT DE MIGRAÇÃO COMPLETA — VM2 (pacs_portal)
-- Compatível com MySQL 8.0 (sem ADD COLUMN IF NOT EXISTS)
-- Gerado em: 2026-04-08
-- Execute: mysql -u root -p137946 pacs_portal < migrate_vm2_full.sql
-- ============================================================

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

-- ============================================================
-- BLOCO 1 — units: adicionar logo_url
-- ============================================================
DROP PROCEDURE IF EXISTS _add_col;
DELIMITER //
CREATE PROCEDURE _add_col()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'units' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE `units` ADD COLUMN `logo_url` TEXT NULL;
  END IF;
END //
DELIMITER ;
CALL _add_col();
DROP PROCEDURE IF EXISTS _add_col;

-- ============================================================
-- BLOCO 2 — users: ENUM + colunas
-- ============================================================

-- 2a. Adicionar responsavel_financeiro ao ENUM role
ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM('admin_master','unit_admin','medico','viewer','operador','responsavel_financeiro') NOT NULL DEFAULT 'viewer';

-- 2b. Corrigir expiration_date de BIGINT para DATE
DROP PROCEDURE IF EXISTS _fix_expdate;
DELIMITER //
CREATE PROCEDURE _fix_expdate()
BEGIN
  DECLARE col_type VARCHAR(64);
  SELECT DATA_TYPE INTO col_type
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'expiration_date';
  IF col_type = 'bigint' THEN
    ALTER TABLE `users` MODIFY COLUMN `expiration_date` DATE NULL;
  END IF;
END //
DELIMITER ;
CALL _fix_expdate();
DROP PROCEDURE IF EXISTS _fix_expdate;

-- 2c. crm
DROP PROCEDURE IF EXISTS _add_col;
DELIMITER //
CREATE PROCEDURE _add_col()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='crm') THEN
    ALTER TABLE `users` ADD COLUMN `crm` VARCHAR(50) NULL;
  END IF;
END //
DELIMITER ;
CALL _add_col();
DROP PROCEDURE IF EXISTS _add_col;

-- 2d. signature_url
DROP PROCEDURE IF EXISTS _add_col;
DELIMITER //
CREATE PROCEDURE _add_col()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='signature_url') THEN
    ALTER TABLE `users` ADD COLUMN `signature_url` TEXT NULL;
  END IF;
END //
DELIMITER ;
CALL _add_col();
DROP PROCEDURE IF EXISTS _add_col;

-- 2e. stamp_url
DROP PROCEDURE IF EXISTS _add_col;
DELIMITER //
CREATE PROCEDURE _add_col()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='stamp_url') THEN
    ALTER TABLE `users` ADD COLUMN `stamp_url` TEXT NULL;
  END IF;
END //
DELIMITER ;
CALL _add_col();
DROP PROCEDURE IF EXISTS _add_col;

-- ============================================================
-- BLOCO 3 — user_unit_permissions: createdAt / updatedAt
-- ============================================================
DROP PROCEDURE IF EXISTS _add_col;
DELIMITER //
CREATE PROCEDURE _add_col()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='user_unit_permissions' AND column_name='createdAt') THEN
    ALTER TABLE `user_unit_permissions`
      ADD COLUMN `createdAt` TIMESTAMP NOT NULL DEFAULT (now()),
      ADD COLUMN `updatedAt` TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;
  END IF;
END //
DELIMITER ;
CALL _add_col();
DROP PROCEDURE IF EXISTS _add_col;

-- ============================================================
-- BLOCO 4 — templates: owner_user_id / exam_title
-- ============================================================
DROP PROCEDURE IF EXISTS _add_col;
DELIMITER //
CREATE PROCEDURE _add_col()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='templates' AND column_name='owner_user_id') THEN
    ALTER TABLE `templates` ADD COLUMN `owner_user_id` INT NULL;
  END IF;
END //
DELIMITER ;
CALL _add_col();
DROP PROCEDURE IF EXISTS _add_col;

DROP PROCEDURE IF EXISTS _add_col;
DELIMITER //
CREATE PROCEDURE _add_col()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='templates' AND column_name='exam_title') THEN
    ALTER TABLE `templates` ADD COLUMN `exam_title` VARCHAR(255) NULL;
  END IF;
END //
DELIMITER ;
CALL _add_col();
DROP PROCEDURE IF EXISTS _add_col;

-- ============================================================
-- BLOCO 5 — reports: unique index reports_uid_unit_idx
-- ============================================================
DROP PROCEDURE IF EXISTS _add_idx;
DELIMITER //
CREATE PROCEDURE _add_idx()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema=DATABASE() AND table_name='reports' AND index_name='reports_uid_unit_idx'
  ) THEN
    ALTER TABLE `reports` ADD UNIQUE INDEX `reports_uid_unit_idx` (`study_instance_uid`, `unit_id`);
  END IF;
END //
DELIMITER ;
CALL _add_idx();
DROP PROCEDURE IF EXISTS _add_idx;

-- ============================================================
-- BLOCO 6 — audit_log: atualizar ENUM action
-- ============================================================
ALTER TABLE `audit_log`
  MODIFY COLUMN `action` ENUM(
    'LOGIN','LOGOUT','VIEW_STUDY','OPEN_VIEWER',
    'CREATE_REPORT','UPDATE_REPORT','SIGN_REPORT','DELETE_REPORT',
    'CREATE_USER','UPDATE_USER','DELETE_USER',
    'CREATE_UNIT','UPDATE_UNIT','DELETE_UNIT',
    'PACS_QUERY','PACS_DOWNLOAD',
    'CREATE_ANAMNESIS','EDIT_STUDY_METADATA'
  ) NOT NULL;

-- ============================================================
-- BLOCO 7 — study_metadata: exam_count
-- ============================================================
DROP PROCEDURE IF EXISTS _add_col;
DELIMITER //
CREATE PROCEDURE _add_col()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='study_metadata' AND column_name='exam_count') THEN
    ALTER TABLE `study_metadata` ADD COLUMN `exam_count` INT DEFAULT 1;
  END IF;
END //
DELIMITER ;
CALL _add_col();
DROP PROCEDURE IF EXISTS _add_col;

-- ============================================================
-- BLOCO 8 — report_versions: colunas novas
-- ============================================================
DROP PROCEDURE IF EXISTS _add_col;
DELIMITER //
CREATE PROCEDURE _add_col()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='report_versions' AND column_name='version') THEN
    ALTER TABLE `report_versions`
      ADD COLUMN `version` INT NOT NULL DEFAULT 1,
      ADD COLUMN `status` ENUM('draft','signed','revised') NOT NULL DEFAULT 'signed',
      ADD COLUMN `saved_by_user_id` INT NOT NULL DEFAULT 0,
      ADD COLUMN `saved_at` TIMESTAMP NOT NULL DEFAULT (now());
  END IF;
END //
DELIMITER ;
CALL _add_col();
DROP PROCEDURE IF EXISTS _add_col;

-- ============================================================
-- BLOCO 9 — Remover tabelas antigas
-- ============================================================
DROP TABLE IF EXISTS `exam_catalog`;
DROP TABLE IF EXISTS `report_sections`;
DROP TABLE IF EXISTS `study_labels`;

-- ============================================================
-- BLOCO 10 — Módulo Financeiro V2
-- ============================================================
CREATE TABLE IF NOT EXISTS `financial_responsibles` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `person_type` ENUM('PF','PJ') NOT NULL DEFAULT 'PJ',
  `legal_name` VARCHAR(255) NOT NULL,
  `trade_name` VARCHAR(255) NULL,
  `cpf_cnpj` VARCHAR(18) NULL,
  `email` VARCHAR(320) NULL,
  `phone` VARCHAR(30) NULL,
  `notes` TEXT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT (now()),
  `updatedAt` TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `financial_responsibles_id` PRIMARY KEY(`id`),
  CONSTRAINT `financial_responsibles_cpf_cnpj_unique` UNIQUE(`cpf_cnpj`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `financial_responsible_users` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `financial_responsible_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT (now()),
  CONSTRAINT `financial_responsible_users_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_resp_user` UNIQUE(`financial_responsible_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `financial_responsible_units` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `financial_responsible_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `starts_at` TIMESTAMP NOT NULL,
  `ends_at` TIMESTAMP NULL,
  `created_by` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT (now()),
  CONSTRAINT `financial_responsible_units_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `billing_system_unit_prices` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `financial_responsible_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `price_per_report` DECIMAL(10,2) NOT NULL,
  `starts_at` TIMESTAMP NOT NULL,
  `ends_at` TIMESTAMP NULL,
  `created_by` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT (now()),
  CONSTRAINT `billing_system_unit_prices_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `billing_doctor_unit_prices` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `financial_responsible_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `doctor_user_id` INT NOT NULL,
  `price_per_report` DECIMAL(10,2) NOT NULL,
  `starts_at` TIMESTAMP NOT NULL,
  `ends_at` TIMESTAMP NULL,
  `created_by` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT (now()),
  CONSTRAINT `billing_doctor_unit_prices_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `billing_report_items` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `report_id` INT NOT NULL,
  `study_instance_uid` VARCHAR(128) NULL,
  `financial_responsible_id` INT NULL,
  `unit_id` INT NOT NULL,
  `doctor_user_id` INT NOT NULL,
  `competence_year` INT NOT NULL,
  `competence_month` INT NOT NULL,
  `report_status_snapshot` ENUM('signed','revised') NOT NULL,
  `report_signed_at` TIMESTAMP NOT NULL,
  `system_price_applied` DECIMAL(10,2) NULL,
  `doctor_price_applied` DECIMAL(10,2) NULL,
  `system_amount_due` DECIMAL(10,2) NULL,
  `doctor_amount_due` DECIMAL(10,2) NULL,
  `pricing_status` ENUM('ok','pending_system_price','pending_doctor_price','pending_both') NOT NULL DEFAULT 'pending_both',
  `createdAt` TIMESTAMP NOT NULL DEFAULT (now()),
  `updatedAt` TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `billing_report_items_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_report_item` UNIQUE(`report_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `billing_monthly_system_by_unit` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `financial_responsible_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `competence_year` INT NOT NULL,
  `competence_month` INT NOT NULL,
  `reports_count` INT NOT NULL DEFAULT 0,
  `amount_due` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  `pending_items_count` INT NOT NULL DEFAULT 0,
  `status` ENUM('open','closed') NOT NULL DEFAULT 'open',
  `generatedAt` TIMESTAMP NOT NULL DEFAULT (now()),
  `closedAt` TIMESTAMP NULL,
  `closedBy` INT NULL,
  CONSTRAINT `billing_monthly_system_by_unit_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_sys_resp_unit_comp` UNIQUE(`financial_responsible_id`,`unit_id`,`competence_year`,`competence_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `billing_monthly_doctor_by_unit` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `financial_responsible_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `doctor_user_id` INT NOT NULL,
  `competence_year` INT NOT NULL,
  `competence_month` INT NOT NULL,
  `reports_count` INT NOT NULL DEFAULT 0,
  `amount_due` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  `pending_items_count` INT NOT NULL DEFAULT 0,
  `status` ENUM('open','closed') NOT NULL DEFAULT 'open',
  `generatedAt` TIMESTAMP NOT NULL DEFAULT (now()),
  `closedAt` TIMESTAMP NULL,
  `closedBy` INT NULL,
  CONSTRAINT `billing_monthly_doctor_by_unit_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_doc_resp_unit_comp` UNIQUE(`financial_responsible_id`,`unit_id`,`doctor_user_id`,`competence_year`,`competence_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- BLOCO 11 — Módulo Financeiro V3: ciclos operacionais
-- ============================================================
CREATE TABLE IF NOT EXISTS `billing_cycle_configs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `unit_id` INT NOT NULL,
  `doctor_cycle_day` INT NOT NULL DEFAULT 1,
  `system_cycle_day` INT NOT NULL DEFAULT 1,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT (now()),
  `updatedAt` TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `created_by` INT NULL,
  CONSTRAINT `uq_unit_config` UNIQUE(`unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `billing_cycles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `unit_id` INT NOT NULL,
  `financial_responsible_id` INT NULL,
  `cycle_type` ENUM('doctor','system') NOT NULL,
  `starts_at` DATE NOT NULL,
  `ends_at` DATE NOT NULL,
  `status` ENUM('open','closed') NOT NULL DEFAULT 'open',
  `total_visits` INT NOT NULL DEFAULT 0,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  `closedAt` TIMESTAMP NULL,
  `closedBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT (now()),
  `updatedAt` TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `uq_cycle` UNIQUE(`unit_id`, `cycle_type`, `starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `billing_visit_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `report_id` INT NOT NULL,
  `study_instance_uid` VARCHAR(128) NULL,
  `unit_id` INT NOT NULL,
  `doctor_user_id` INT NOT NULL,
  `financial_responsible_id` INT NULL,
  `visit_key` VARCHAR(300) NOT NULL,
  `patient_name` VARCHAR(200) NULL,
  `study_date` DATE NULL,
  `doctor_cycle_id` INT NULL,
  `system_cycle_id` INT NULL,
  `system_price_applied` DECIMAL(10,2) NULL,
  `doctor_price_applied` DECIMAL(10,2) NULL,
  `system_amount_due` DECIMAL(10,2) NULL,
  `doctor_amount_due` DECIMAL(10,2) NULL,
  `pricing_status` ENUM('ok','pending_system_price','pending_doctor_price','pending_both') NOT NULL DEFAULT 'pending_both',
  `doctor_received_at` TIMESTAMP NULL,
  `system_paid_at` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT (now()),
  `updatedAt` TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `uq_visit_event` UNIQUE(`visit_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `billing_cycle_doctor_summary` (
  `id` INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `doctor_cycle_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `doctor_user_id` INT NOT NULL,
  `financial_responsible_id` INT NULL,
  `visits_count` INT NOT NULL DEFAULT 0,
  `amount_due` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  `pending_pricing_count` INT NOT NULL DEFAULT 0,
  `received_at` TIMESTAMP NULL,
  `received_by` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT (now()),
  `updatedAt` TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `uq_cycle_doc_unit` UNIQUE(`doctor_cycle_id`, `unit_id`, `doctor_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `billing_cycle_system_summary` (
  `id` INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `system_cycle_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `financial_responsible_id` INT NULL,
  `visits_count` INT NOT NULL DEFAULT 0,
  `amount_due` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  `pending_pricing_count` INT NOT NULL DEFAULT 0,
  `paid_at` TIMESTAMP NULL,
  `paid_by` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT (now()),
  `updatedAt` TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `uq_cycle_sys_unit` UNIQUE(`system_cycle_id`, `unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================
SET foreign_key_checks = 1;
SELECT 'Migracao concluida com sucesso!' AS status;
SHOW TABLES;
SHOW COLUMNS FROM users WHERE Field = 'role';
