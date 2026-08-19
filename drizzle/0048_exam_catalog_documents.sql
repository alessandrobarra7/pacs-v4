-- Catálogo central de exames, mapeamento PACS explícito e documentos independentes.
-- Preserva todos os laudos e eventos existentes. A troca do índice de reports
-- apenas amplia a unicidade para incluir document_key, preenchida como 'primary'
-- nos registros legados pelo DEFAULT da nova coluna.

ALTER TABLE `exam_legends`
  ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT TRUE AFTER `sort_order`;

ALTER TABLE `exam_legends`
  ADD COLUMN `created_by` INT NULL AFTER `is_active`;

CREATE TABLE IF NOT EXISTS `exam_legend_documents` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `exam_legend_id` INT NOT NULL,
  `document_key` VARCHAR(80) NOT NULL,
  `document_label` VARCHAR(255) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_by` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_exam_legend_document` (`exam_legend_id`, `document_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `exam_legend_pacs_mappings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `pacs_description` VARCHAR(255) NOT NULL,
  `modality` VARCHAR(20) NOT NULL DEFAULT '',
  `exam_legend_id` INT NOT NULL,
  `created_by` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pacs_description_modality` (`pacs_description`, `modality`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `reports`
  ADD COLUMN `exam_legend_id` INT NULL AFTER `study_instance_uid`;

ALTER TABLE `reports`
  ADD COLUMN `document_key` VARCHAR(80) NOT NULL DEFAULT 'primary' AFTER `exam_legend_id`;

ALTER TABLE `reports`
  ADD COLUMN `document_label_snapshot` VARCHAR(255) NULL AFTER `document_key`;

ALTER TABLE `reports`
  DROP INDEX `reports_uid_unit_idx`,
  ADD UNIQUE INDEX `reports_uid_unit_document_idx` (`study_instance_uid`, `unit_id`, `document_key`);
