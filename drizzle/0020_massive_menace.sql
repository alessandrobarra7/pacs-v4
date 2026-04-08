-- Módulo Financeiro V2: dropar tabelas antigas e criar novas corretas
-- Etapa 1: remover tabelas antigas (sem dados relevantes)
DROP TABLE IF EXISTS `billing_report_items`;
DROP TABLE IF EXISTS `billing_monthly_doctor`;
DROP TABLE IF EXISTS `billing_monthly_unit`;
DROP TABLE IF EXISTS `billing_doctor_prices`;
DROP TABLE IF EXISTS `billing_unit_prices`;

-- Etapa 2: adicionar role responsavel_financeiro no enum
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin_master','unit_admin','medico','viewer','operador','responsavel_financeiro') NOT NULL DEFAULT 'viewer';

-- Etapa 3: criar tabelas novas

CREATE TABLE `financial_responsibles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `person_type` enum('PF','PJ') NOT NULL DEFAULT 'PJ',
  `legal_name` varchar(255) NOT NULL,
  `trade_name` varchar(255),
  `cpf_cnpj` varchar(18),
  `email` varchar(320),
  `phone` varchar(30),
  `notes` text,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `financial_responsibles_id` PRIMARY KEY(`id`),
  CONSTRAINT `financial_responsibles_cpf_cnpj_unique` UNIQUE(`cpf_cnpj`)
);

CREATE TABLE `financial_responsible_users` (
  `id` int AUTO_INCREMENT NOT NULL,
  `financial_responsible_id` int NOT NULL,
  `user_id` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `financial_responsible_users_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_resp_user` UNIQUE(`financial_responsible_id`,`user_id`)
);

CREATE TABLE `financial_responsible_units` (
  `id` int AUTO_INCREMENT NOT NULL,
  `financial_responsible_id` int NOT NULL,
  `unit_id` int NOT NULL,
  `starts_at` timestamp NOT NULL,
  `ends_at` timestamp,
  `created_by` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `financial_responsible_units_id` PRIMARY KEY(`id`)
);

CREATE TABLE `billing_system_unit_prices` (
  `id` int AUTO_INCREMENT NOT NULL,
  `financial_responsible_id` int NOT NULL,
  `unit_id` int NOT NULL,
  `price_per_report` decimal(10,2) NOT NULL,
  `starts_at` timestamp NOT NULL,
  `ends_at` timestamp,
  `created_by` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `billing_system_unit_prices_id` PRIMARY KEY(`id`)
);

CREATE TABLE `billing_doctor_unit_prices` (
  `id` int AUTO_INCREMENT NOT NULL,
  `financial_responsible_id` int NOT NULL,
  `unit_id` int NOT NULL,
  `doctor_user_id` int NOT NULL,
  `price_per_report` decimal(10,2) NOT NULL,
  `starts_at` timestamp NOT NULL,
  `ends_at` timestamp,
  `created_by` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `billing_doctor_unit_prices_id` PRIMARY KEY(`id`)
);

CREATE TABLE `billing_report_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `report_id` int NOT NULL,
  `study_instance_uid` varchar(128),
  `financial_responsible_id` int,
  `unit_id` int NOT NULL,
  `doctor_user_id` int NOT NULL,
  `competence_year` int NOT NULL,
  `competence_month` int NOT NULL,
  `report_status_snapshot` enum('signed','revised') NOT NULL,
  `report_signed_at` timestamp NOT NULL,
  `system_price_applied` decimal(10,2),
  `doctor_price_applied` decimal(10,2),
  `system_amount_due` decimal(10,2),
  `doctor_amount_due` decimal(10,2),
  `pricing_status` enum('ok','pending_system_price','pending_doctor_price','pending_both') NOT NULL DEFAULT 'pending_both',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `billing_report_items_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_report_item` UNIQUE(`report_id`)
);

CREATE TABLE `billing_monthly_system_by_unit` (
  `id` int AUTO_INCREMENT NOT NULL,
  `financial_responsible_id` int NOT NULL,
  `unit_id` int NOT NULL,
  `competence_year` int NOT NULL,
  `competence_month` int NOT NULL,
  `reports_count` int NOT NULL DEFAULT 0,
  `amount_due` decimal(10,2) NOT NULL DEFAULT '0.00',
  `pending_items_count` int NOT NULL DEFAULT 0,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `generatedAt` timestamp NOT NULL DEFAULT (now()),
  `closedAt` timestamp,
  `closedBy` int,
  CONSTRAINT `billing_monthly_system_by_unit_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_sys_resp_unit_comp` UNIQUE(`financial_responsible_id`,`unit_id`,`competence_year`,`competence_month`)
);

CREATE TABLE `billing_monthly_doctor_by_unit` (
  `id` int AUTO_INCREMENT NOT NULL,
  `financial_responsible_id` int NOT NULL,
  `unit_id` int NOT NULL,
  `doctor_user_id` int NOT NULL,
  `competence_year` int NOT NULL,
  `competence_month` int NOT NULL,
  `reports_count` int NOT NULL DEFAULT 0,
  `amount_due` decimal(10,2) NOT NULL DEFAULT '0.00',
  `pending_items_count` int NOT NULL DEFAULT 0,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `generatedAt` timestamp NOT NULL DEFAULT (now()),
  `closedAt` timestamp,
  `closedBy` int,
  CONSTRAINT `billing_monthly_doctor_by_unit_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_doc_resp_unit_comp` UNIQUE(`financial_responsible_id`,`unit_id`,`doctor_user_id`,`competence_year`,`competence_month`)
);