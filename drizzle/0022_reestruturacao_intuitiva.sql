-- Migration 0022: Reestruturação Intuitiva — novas tabelas
-- unit_doctor_scales, unit_doctor_compensation_rules, contract_revenues, contract_custom_expenses

CREATE TABLE IF NOT EXISTS `unit_doctor_scales` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `unit_id` int NOT NULL,
  `doctor_user_id` int NOT NULL,
  `days_of_week` varchar(50) NOT NULL DEFAULT '[]',
  `start_time` varchar(5),
  `end_time` varchar(5),
  `is_active` boolean NOT NULL DEFAULT true,
  `starts_at` date,
  `ends_at` date,
  `notes` text,
  `created_by` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `uq_unit_doctor_scale` UNIQUE (`unit_id`, `doctor_user_id`)
);

CREATE TABLE IF NOT EXISTS `unit_doctor_compensation_rules` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `unit_id` int NOT NULL,
  `doctor_user_id` int,
  `compensation_type` enum('per_report','per_patient','per_shift','other') NOT NULL DEFAULT 'per_report',
  `amount` decimal(10,2) NOT NULL,
  `starts_at` date NOT NULL,
  `ends_at` date,
  `notes` text,
  `created_by` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `contract_revenues` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `financial_responsible_id` int NOT NULL,
  `unit_id` int,
  `amount` decimal(10,2) NOT NULL,
  `periodicity` enum('monthly','quarterly','yearly','one_time') NOT NULL DEFAULT 'monthly',
  `starts_at` date NOT NULL,
  `ends_at` date,
  `description` varchar(500),
  `notes` text,
  `created_by` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `contract_custom_expenses` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `financial_responsible_id` int NOT NULL,
  `unit_id` int,
  `category` varchar(100) NOT NULL,
  `description` varchar(500),
  `amount` decimal(10,2) NOT NULL,
  `competence_month` int NOT NULL,
  `competence_year` int NOT NULL,
  `notes` text,
  `created_by` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
