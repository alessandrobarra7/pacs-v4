-- Permite nova laudagem e nova cobrança após cancelamento auditável,
-- preservando eventos e laudos das ocorrências anteriores.

ALTER TABLE `reports`
  ADD COLUMN `billing_occurrence` INT NOT NULL DEFAULT 1 AFTER `document_key`;

ALTER TABLE `reports`
  DROP INDEX `reports_uid_unit_document_idx`,
  ADD UNIQUE INDEX `reports_uid_unit_document_occurrence_idx` (`study_instance_uid`, `unit_id`, `document_key`, `billing_occurrence`);

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `billing_occurrence` INT NOT NULL DEFAULT 1 AFTER `study_selection_id`,
  ADD COLUMN `source_report_id` INT NULL AFTER `doctor_user_id`;

ALTER TABLE `billing_catalog_study_events`
  DROP INDEX `uq_catalog_selection_event`,
  ADD UNIQUE INDEX `uq_catalog_selection_occurrence_event` (`study_selection_id`, `billing_occurrence`, `event_index`);
