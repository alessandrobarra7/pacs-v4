-- Migration 0023: SLA de Laudo + Report Readiness
-- Criado manualmente para evitar prompts interativos do drizzle-kit

-- Tabela de configuração de SLA por unidade
CREATE TABLE IF NOT EXISTS `unit_report_sla_configs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `unit_id` int NOT NULL,
  `enabled` boolean NOT NULL DEFAULT false,
  `sla_value` int,
  `sla_unit` enum('hour','day'),
  `effective_from` timestamp,
  `notes` text,
  `created_by` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `unit_report_sla_configs_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_unit_sla` UNIQUE(`unit_id`)
);

-- Tabela de prontidão formal do exame para laudo
CREATE TABLE IF NOT EXISTS `report_readiness` (
  `id` int AUTO_INCREMENT NOT NULL,
  `study_instance_uid` varchar(128) NOT NULL,
  `unit_id` int NOT NULL,
  `readiness_status` enum('pending','ready_for_reporting','reported','cancelled','invalidated') NOT NULL DEFAULT 'ready_for_reporting',
  `became_ready_at` timestamp NOT NULL,
  `sla_value_snapshot` int,
  `sla_unit_snapshot` enum('hour','day'),
  `due_at` timestamp,
  `readiness_source` varchar(50) DEFAULT 'anamnesis_simple',
  `readiness_note` text,
  `reported_at` timestamp,
  `reported_by_user_id` int,
  `sla_met` boolean,
  `delay_seconds` int,
  `created_by` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `report_readiness_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_readiness_uid_unit` UNIQUE(`study_instance_uid`, `unit_id`)
);
