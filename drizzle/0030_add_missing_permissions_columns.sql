-- ERRO CRÍTICO 3 FIX: Add missing columns to user_unit_permissions table
-- These columns are defined in schema.ts but were missing from the original migration

ALTER TABLE `user_unit_permissions`
  ADD COLUMN `edit_anamnesis` boolean NOT NULL DEFAULT false AFTER `view_anamnesis`,
  ADD COLUMN `edit_exam_legend` boolean NOT NULL DEFAULT false AFTER `manage_templates`,
  ADD COLUMN `group_key` enum('responsaveisFinanceiros','medicos','operadores','visualizadores','administradoresUnidade','adminsMaster','outros') DEFAULT 'outros' AFTER `edit_exam_legend`;
