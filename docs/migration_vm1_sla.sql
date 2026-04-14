-- =============================================================================
-- MIGRAÇÃO VM1 — Sistema de SLA de Laudo
-- Banco: pacs_portal | Servidor: VM2 (172.16.3.101) | Senha: 137946
-- Data: 2026-04-14
-- Autor: Desenvolvimento StudioBarra7
-- =============================================================================
-- ANÁLISE DO BANCO ATUAL (extraída do SHOW TABLES + COLUMNS):
--
-- ✅ TABELAS EXISTENTES (não precisam ser criadas):
--   - units, users, reports, anamnesis_simple, billing_*, contract_*, etc.
--
-- ❌ TABELAS AUSENTES (precisam ser criadas):
--   - unit_report_sla_configs  → configuração de SLA por unidade
--   - report_readiness         → marco de prontidão + timer de laudo
--
-- ℹ️  OBSERVAÇÕES SOBRE O BANCO ATUAL:
--   - A tabela `users` possui a coluna `role` (enum) — verificar se inclui
--     'responsavel_financeiro'. Se não incluir, o ALTER abaixo é necessário.
--   - A tabela `units` não possui coluna `address` nem `equipment_info` —
--     já existem no banco (confirmado no SHOW COLUMNS).
--   - Nenhuma alteração destrutiva é necessária.
-- =============================================================================

USE pacs_portal;

-- -----------------------------------------------------------------------------
-- PASSO 1: Verificar e corrigir enum de roles (se necessário)
-- Execute este SELECT primeiro para ver os valores atuais do enum:
--   SELECT COLUMN_TYPE FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA='pacs_portal' AND TABLE_NAME='users' AND COLUMN_NAME='role';
--
-- Se o resultado NÃO incluir 'responsavel_financeiro', execute o ALTER abaixo:
-- -----------------------------------------------------------------------------
ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM(
    'admin_master',
    'unit_admin',
    'medico',
    'viewer',
    'operador',
    'responsavel_financeiro'
  ) NOT NULL DEFAULT 'viewer';

-- -----------------------------------------------------------------------------
-- PASSO 2: Criar tabela unit_report_sla_configs
-- Configuração de SLA de laudo por unidade (1 linha por unidade)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `unit_report_sla_configs` (
  `id`             INT          NOT NULL AUTO_INCREMENT,
  `unit_id`        INT          NOT NULL,
  `enabled`        BOOLEAN      NOT NULL DEFAULT FALSE,
  `sla_value`      INT          NULL,
  `sla_unit`       ENUM('hour','day') NULL,
  `effective_from` TIMESTAMP    NULL,
  `notes`          TEXT         NULL,
  `created_by`     INT          NOT NULL,
  `createdAt`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_unit_sla` (`unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- PASSO 3: Criar tabela report_readiness
-- Marco formal de prontidão do exame para laudo.
-- Criado quando a anamnese é salva pela primeira vez com texto válido.
-- O timer NÃO é reiniciado em edições posteriores da anamnese.
-- Fechado automaticamente ao assinar o laudo (reports.sign).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `report_readiness` (
  `id`                    INT           NOT NULL AUTO_INCREMENT,
  `study_instance_uid`    VARCHAR(128)  NOT NULL,
  `unit_id`               INT           NOT NULL,
  `readiness_status`      ENUM(
                            'pending',
                            'ready_for_reporting',
                            'reported',
                            'cancelled',
                            'invalidated'
                          ) NOT NULL DEFAULT 'ready_for_reporting',
  `became_ready_at`       TIMESTAMP     NOT NULL,
  `sla_value_snapshot`    INT           NULL,
  `sla_unit_snapshot`     ENUM('hour','day') NULL,
  `due_at`                TIMESTAMP     NULL,
  `readiness_source`      VARCHAR(50)   NULL DEFAULT 'anamnesis_simple',
  `readiness_note`        TEXT          NULL,
  `reported_at`           TIMESTAMP     NULL,
  `reported_by_user_id`   INT           NULL,
  `sla_met`               BOOLEAN       NULL,
  `delay_seconds`         INT           NULL,
  `created_by`            INT           NOT NULL,
  `createdAt`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_readiness_uid_unit` (`study_instance_uid`, `unit_id`),
  KEY `idx_readiness_status` (`readiness_status`),
  KEY `idx_readiness_unit` (`unit_id`),
  KEY `idx_readiness_due_at` (`due_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- VERIFICAÇÃO FINAL — execute após a migração para confirmar:
-- -----------------------------------------------------------------------------
-- SHOW TABLES LIKE 'unit_report_sla_configs';
-- SHOW TABLES LIKE 'report_readiness';
-- DESCRIBE unit_report_sla_configs;
-- DESCRIBE report_readiness;
-- =============================================================================
