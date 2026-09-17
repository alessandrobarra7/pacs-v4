-- CORREÇÃO (auditoria claude/modulo-repasse-preco-externo):
-- 1) Nova tabela de preço de venda externa por unidade + legenda de exame, usada
--    exclusivamente pelo módulo de lucro do responsável financeiro / unit_admin.
-- 2) Confirmação do médico sobre o repasse marcado como pago pela clínica, nas duas
--    tabelas de evento financeiro (legado e catálogo), para que o médico deixe de
--    depender só da palavra da clínica sobre o próprio repasse.
--
-- PRÉ-CONDIÇÕES ESTRUTURAIS (achado da revisão independente Manus, 2026-09-17):
-- este arquivo pressupõe que as migrations do catálogo clínico-financeiro já foram
-- aplicadas neste banco, em especial:
--   - tabela `billing_catalog_study_events` (criada em 0050_catalog_clinical_financial.sql)
--   - coluna `billing_catalog_study_events.doctor_payment_note` (criada em
--     0055_finance_catalog_payment_tracking.sql)
-- Em um ambiente sem essas migrations, este arquivo executa as 3 primeiras instruções
-- (tabela billing_external_sale_prices + colunas em billing_visit_events) e falha na
-- primeira ALTER TABLE de billing_catalog_study_events, deixando o banco num estado
-- parcial. NÃO aplique este arquivo diretamente com `mysql < 0060_....sql`.
--
-- APLICAÇÃO OBRIGATÓRIA POR SCRIPT COM PREFLIGHT:
--   DATABASE_URL=... node scripts/apply_migration_0060.mjs
-- O script verifica as pré-condições acima via INFORMATION_SCHEMA antes de executar
-- qualquer DDL, e valida os objetos criados depois de aplicar.

CREATE TABLE `billing_external_sale_prices` (
  `id` int AUTO_INCREMENT NOT NULL,
  `unit_id` int NOT NULL,
  `exam_legend_id` int NOT NULL,
  `price_external` decimal(10,2) NOT NULL,
  `starts_at` timestamp NOT NULL,
  `ends_at` timestamp NULL,
  `created_by` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `billing_external_sale_prices_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_external_sale_price_unit_legend_start` UNIQUE(`unit_id`,`exam_legend_id`,`starts_at`)
);

ALTER TABLE `billing_visit_events`
  ADD COLUMN `doctor_confirmation_status` enum('confirmed','disputed') NULL AFTER `doctor_received_by_user_id`;

ALTER TABLE `billing_visit_events`
  ADD COLUMN `doctor_confirmed_at` timestamp NULL AFTER `doctor_confirmation_status`;

ALTER TABLE `billing_visit_events`
  ADD COLUMN `doctor_confirmation_note` varchar(500) NULL AFTER `doctor_confirmed_at`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `doctor_confirmation_status` enum('confirmed','disputed') NULL AFTER `doctor_payment_note`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `doctor_confirmed_at` timestamp NULL AFTER `doctor_confirmation_status`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `doctor_confirmation_note` varchar(500) NULL AFTER `doctor_confirmed_at`;

-- Novos valores de audit_log.action usados pelas mutations acima.
ALTER TABLE `audit_log`
  MODIFY COLUMN `action` enum(
    'LOGIN','LOGOUT','VIEW_STUDY','OPEN_VIEWER','CREATE_REPORT','UPDATE_REPORT','SIGN_REPORT',
    'DELETE_REPORT','CANCEL_REPORT','REVISE_REPORT','CREATE_USER','UPDATE_USER','DELETE_USER',
    'ACTIVATE_USER','DEACTIVATE_USER','CREATE_UNIT','UPDATE_UNIT','DELETE_UNIT','PACS_QUERY',
    'PACS_DOWNLOAD','CREATE_ANAMNESIS','EDIT_STUDY_METADATA','SET_STUDY_PRIORITY',
    'UPDATE_STUDY_PRIORITY','CLEAR_STUDY_PRIORITY','RESET_DOCTOR_BILLING','CREATE_LAYOUT',
    'UPDATE_LAYOUT','DELETE_LAYOUT','BILLING_EVENT_FAILED','FINANCIAL_ENABLED','FINANCIAL_DISABLED',
    'BILLING_EVENT_WITHOUT_FINANCIAL_ENABLED','BILLING_EVENT_CANCELLED',
    'DOCTOR_PAYMENT_CONFIRMED','DOCTOR_PAYMENT_DISPUTED','SET_EXTERNAL_SALE_PRICE'
  ) NOT NULL;
