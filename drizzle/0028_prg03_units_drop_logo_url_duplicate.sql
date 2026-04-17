-- PRG-03: Remover coluna logoUrl duplicada da tabela units
-- Manter apenas logo_url como campo canônico para URL do logo da unidade
-- Não há dados em logoUrl (confirmado antes da remoção)

ALTER TABLE `units` DROP COLUMN `logoUrl`;
