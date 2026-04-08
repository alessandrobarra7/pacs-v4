-- Migration 0021: Módulo Financeiro Operacional V3
-- Novas tabelas: billing_cycle_configs, billing_cycles, billing_visit_events,
--                billing_cycle_doctor_summary, billing_cycle_system_summary

CREATE TABLE IF NOT EXISTS `billing_cycle_configs` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `unit_id` int NOT NULL,
  `doctor_cycle_day` int NOT NULL DEFAULT 1,
  `system_cycle_day` int NOT NULL DEFAULT 1,
  `is_active` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `created_by` int,
  CONSTRAINT `uq_unit_config` UNIQUE(`unit_id`)
);

CREATE TABLE IF NOT EXISTS `billing_cycles` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `unit_id` int NOT NULL,
  `financial_responsible_id` int,
  `cycle_type` enum('doctor','system') NOT NULL,
  `starts_at` date NOT NULL,
  `ends_at` date NOT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `total_visits` int NOT NULL DEFAULT 0,
  `total_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `closedAt` timestamp,
  `closedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `uq_cycle` UNIQUE(`unit_id`, `cycle_type`, `starts_at`)
);

CREATE TABLE IF NOT EXISTS `billing_visit_events` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `report_id` int NOT NULL,
  `study_instance_uid` varchar(128),
  `unit_id` int NOT NULL,
  `doctor_user_id` int NOT NULL,
  `financial_responsible_id` int,
  `visit_key` varchar(300) NOT NULL,
  `patient_name` varchar(200),
  `study_date` date,
  `doctor_cycle_id` int,
  `system_cycle_id` int,
  `system_price_applied` decimal(10,2),
  `doctor_price_applied` decimal(10,2),
  `system_amount_due` decimal(10,2),
  `doctor_amount_due` decimal(10,2),
  `pricing_status` enum('ok','pending_system_price','pending_doctor_price','pending_both') NOT NULL DEFAULT 'pending_both',
  `doctor_received_at` timestamp,
  `system_paid_at` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `uq_visit_event` UNIQUE(`visit_key`)
);

CREATE TABLE IF NOT EXISTS `billing_cycle_doctor_summary` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `doctor_cycle_id` int NOT NULL,
  `unit_id` int NOT NULL,
  `doctor_user_id` int NOT NULL,
  `financial_responsible_id` int,
  `visits_count` int NOT NULL DEFAULT 0,
  `amount_due` decimal(10,2) NOT NULL DEFAULT '0.00',
  `pending_pricing_count` int NOT NULL DEFAULT 0,
  `received_at` timestamp,
  `received_by` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `uq_cycle_doc_unit` UNIQUE(`doctor_cycle_id`, `unit_id`, `doctor_user_id`)
);

CREATE TABLE IF NOT EXISTS `billing_cycle_system_summary` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `system_cycle_id` int NOT NULL,
  `unit_id` int NOT NULL,
  `financial_responsible_id` int,
  `visits_count` int NOT NULL DEFAULT 0,
  `amount_due` decimal(10,2) NOT NULL DEFAULT '0.00',
  `pending_pricing_count` int NOT NULL DEFAULT 0,
  `paid_at` timestamp,
  `paid_by` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `uq_cycle_sys_unit` UNIQUE(`system_cycle_id`, `unit_id`)
);