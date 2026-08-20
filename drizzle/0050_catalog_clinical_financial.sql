-- Catálogo clínico-financeiro por estudo. Migração somente aditiva; preserva
-- laudos, preços e eventos legados existentes.

ALTER TABLE `exam_legends`
  ADD COLUMN `financial_event_count` INT NOT NULL DEFAULT 1 AFTER `is_active`;

CREATE TABLE IF NOT EXISTS `study_exam_legend_selections` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `study_instance_uid` VARCHAR(128) NOT NULL,
  `unit_id` INT NOT NULL,
  `exam_legend_id` INT NOT NULL,
  `exam_name_snapshot` VARCHAR(255) NOT NULL,
  `modality_snapshot` VARCHAR(20) NOT NULL,
  `documents_snapshot` JSON NOT NULL,
  `financial_event_count` INT NOT NULL DEFAULT 1,
  `selected_by` INT NOT NULL,
  `selectedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lockedAt` TIMESTAMP NULL,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_study_unit_legend_selection` (`study_instance_uid`, `unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `billing_doctor_exam_legend_prices` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `unit_id` INT NOT NULL,
  `doctor_user_id` INT NOT NULL,
  `exam_legend_id` INT NOT NULL,
  `price_per_event` DECIMAL(10,2) NOT NULL,
  `starts_at` DATE NOT NULL,
  `ends_at` DATE NULL,
  `created_by` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_doctor_legend_price_start` (`unit_id`, `doctor_user_id`, `exam_legend_id`, `starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `billing_catalog_study_events` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `study_selection_id` INT NOT NULL,
  `event_index` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `doctor_user_id` INT NOT NULL,
  `exam_legend_id` INT NOT NULL,
  `exam_name_snapshot` VARCHAR(255) NOT NULL,
  `price_applied` DECIMAL(10,2) NULL,
  `pricing_status` ENUM('ok','pending_doctor_price') NOT NULL DEFAULT 'pending_doctor_price',
  `signed_at` TIMESTAMP NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_catalog_selection_event` (`study_selection_id`, `event_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
