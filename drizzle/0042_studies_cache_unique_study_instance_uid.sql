-- Migration 0042: Adiciona índice único em studies_cache.study_instance_uid
-- Necessário para suportar ON DUPLICATE KEY UPDATE no upsertStudyCache
-- Permite popular o cache local com modality após cada C-FIND do PACS

ALTER TABLE `studies_cache`
  ADD UNIQUE INDEX `uq_study_instance_uid` (`study_instance_uid`);
