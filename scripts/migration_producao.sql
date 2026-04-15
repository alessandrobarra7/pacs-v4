-- =============================================================================
-- SCRIPT DE MIGRAÇÃO PARA PRODUÇÃO — PACS Portal
-- Execute no banco: pacs_portal
-- Data: 2026-04-15
-- =============================================================================
-- ATENÇÃO: Execute cada bloco separadamente e verifique erros antes de prosseguir.
-- Faça backup antes de executar!
-- =============================================================================


-- =============================================================================
-- BLOCO 1: Renomear campos em billing_visit_events
-- O campo 'visit_key' foi renomeado para 'report_key' no schema atual
-- O índice único também foi renomeado
-- =============================================================================
-- Verificar se o campo 'visit_key' ainda existe antes de renomear:
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='billing_visit_events' AND COLUMN_NAME='visit_key';

ALTER TABLE `billing_visit_events`
  CHANGE COLUMN `visit_key` `report_key` VARCHAR(300) NOT NULL;

-- Renomear o índice único (se existir com nome antigo):
-- DROP INDEX uq_visit_event ON billing_visit_events;
-- CREATE UNIQUE INDEX uq_report_event ON billing_visit_events (report_key);
-- Nota: se o índice já se chama uq_report_event, pule as 2 linhas acima.


-- =============================================================================
-- BLOCO 2: Renomear campos em billing_cycles
-- O campo 'total_visits' foi renomeado para 'total_reports'
-- =============================================================================
-- Verificar se o campo 'total_visits' ainda existe:
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='billing_cycles' AND COLUMN_NAME='total_visits';

ALTER TABLE `billing_cycles`
  CHANGE COLUMN `total_visits` `total_reports` INT NOT NULL DEFAULT 0;


-- =============================================================================
-- BLOCO 3: Renomear campos em billing_cycle_doctor_summary e billing_cycle_system_summary
-- O campo 'visits_count' foi renomeado para 'reports_count'
-- =============================================================================
-- Verificar se o campo 'visits_count' ainda existe:
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='billing_cycle_doctor_summary' AND COLUMN_NAME='visits_count';

ALTER TABLE `billing_cycle_doctor_summary`
  CHANGE COLUMN `visits_count` `reports_count` INT NOT NULL DEFAULT 0;

ALTER TABLE `billing_cycle_system_summary`
  CHANGE COLUMN `visits_count` `reports_count` INT NOT NULL DEFAULT 0;


-- =============================================================================
-- BLOCO 4: Adicionar campos de controle de pagamento em billing_cycles
-- Estes campos foram adicionados na migration 0026
-- =============================================================================
-- Verificar se os campos já existem:
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='billing_cycles' AND COLUMN_NAME='paid_status';

ALTER TABLE `billing_cycles`
  ADD COLUMN `paid_status` ENUM('pending','paid') NOT NULL DEFAULT 'pending' AFTER `closedBy`,
  ADD COLUMN `paid_at` TIMESTAMP NULL AFTER `paid_status`,
  ADD COLUMN `paid_by_user_id` INT NULL AFTER `paid_at`,
  ADD COLUMN `paid_note` VARCHAR(500) NULL AFTER `paid_by_user_id`;


-- =============================================================================
-- BLOCO 5: Criar tabelas de resumo mensal (se não existirem)
-- billing_monthly_system_by_unit e billing_monthly_doctor_by_unit
-- =============================================================================
CREATE TABLE IF NOT EXISTS `billing_monthly_system_by_unit` (
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
  `closedAt` timestamp NULL,
  `closedBy` int NULL,
  CONSTRAINT `billing_monthly_system_by_unit_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_sys_resp_unit_comp` UNIQUE(`financial_responsible_id`,`unit_id`,`competence_year`,`competence_month`)
);

CREATE TABLE IF NOT EXISTS `billing_monthly_doctor_by_unit` (
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
  `closedAt` timestamp NULL,
  `closedBy` int NULL,
  CONSTRAINT `billing_monthly_doctor_by_unit_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_doc_resp_unit_comp` UNIQUE(`financial_responsible_id`,`unit_id`,`doctor_user_id`,`competence_year`,`competence_month`)
);


-- =============================================================================
-- BLOCO 6: Criar tabela billing_report_items (se não existir)
-- Gerada quando um laudo é assinado — usada pelo Dashboard financeiro
-- =============================================================================
CREATE TABLE IF NOT EXISTS `billing_report_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `report_id` int NOT NULL,
  `study_instance_uid` varchar(128) NULL,
  `financial_responsible_id` int NULL,
  `unit_id` int NOT NULL,
  `doctor_user_id` int NOT NULL,
  `competence_year` int NOT NULL,
  `competence_month` int NOT NULL,
  `report_status_snapshot` enum('signed','revised') NOT NULL,
  `report_signed_at` timestamp NOT NULL,
  `system_price_applied` decimal(10,2) NULL,
  `doctor_price_applied` decimal(10,2) NULL,
  `system_amount_due` decimal(10,2) NULL,
  `doctor_amount_due` decimal(10,2) NULL,
  `pricing_status` enum('ok','pending_system_price','pending_doctor_price','pending_both') NOT NULL DEFAULT 'pending_both',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `billing_report_items_id` PRIMARY KEY(`id`),
  CONSTRAINT `billing_report_items_report_id_unique` UNIQUE(`report_id`)
);


-- =============================================================================
-- BLOCO 7: Criar tabela billing_cycle_configs (se não existir)
-- Configuração do dia de corte dos ciclos por unidade
-- =============================================================================
CREATE TABLE IF NOT EXISTS `billing_cycle_configs` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `unit_id` int NOT NULL,
  `doctor_cycle_day` int NOT NULL DEFAULT 1,
  `system_cycle_day` int NOT NULL DEFAULT 1,
  `is_active` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `created_by` int NULL,
  CONSTRAINT `uq_unit_config` UNIQUE(`unit_id`)
);


-- =============================================================================
-- VERIFICAÇÃO FINAL
-- Execute para confirmar que todas as tabelas existem:
-- =============================================================================
-- SHOW TABLES;
-- DESCRIBE billing_cycles;
-- DESCRIBE billing_visit_events;
-- DESCRIBE billing_cycle_doctor_summary;
-- DESCRIBE billing_cycle_system_summary;
