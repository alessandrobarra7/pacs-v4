-- Migration 0034: Adicionar layout_snapshot na tabela reports
-- Congela o layout no momento da assinatura para fidelidade histórica
-- Null para laudos criados antes desta migration

ALTER TABLE `reports`
ADD COLUMN `layout_snapshot` JSON AFTER `signedBy`;
