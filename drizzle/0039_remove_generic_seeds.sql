-- ============================================================
-- Migration: 0039_remove_generic_seeds.sql
-- Remove templates e frases genéricos inseridos pelo seed 0025
-- Apenas dados globais sem proprietário (owner_user_id = NULL)
-- Laudos existentes NÃO são afetados
-- ============================================================

-- PASSO 1: Desvincular laudos que referenciam templates genéricos
-- (garante que o DELETE não falhe por FK constraint)
UPDATE `reports`
SET `template_id` = NULL
WHERE `template_id` IN (
  SELECT `id` FROM `templates`
  WHERE `isGlobal` = TRUE
    AND `owner_user_id` IS NULL
    AND `unit_id` IS NULL
);

-- PASSO 2: Deletar os 5 templates globais genéricos
-- Proteção: só apaga globais sem dono e sem unidade (os seeds)
DELETE FROM `templates`
WHERE `isGlobal` = TRUE
  AND `owner_user_id` IS NULL
  AND `unit_id` IS NULL;

-- PASSO 3: Deletar as ~70 frases dos grupos genéricos
DELETE FROM `phrases`
WHERE `group_id` IN (1000, 1001, 1002, 1003, 1004);

-- PASSO 4: Deletar os 5 grupos de frases genéricos
DELETE FROM `phrase_groups`
WHERE `id` IN (1000, 1001, 1002, 1003, 1004);
