CREATE TABLE `study_anamnesis_structured` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `study_instance_uid` VARCHAR(128) NOT NULL,
  `unit_id` INT NOT NULL,
  `modality` VARCHAR(8) NOT NULL,
  `patient_name` VARCHAR(255) NULL,
  `answers` JSON NOT NULL,
  `pain_locations` JSON NOT NULL,
  `summary` TEXT NOT NULL,
  `created_by_user_id` INT NOT NULL,
  `updated_by_user_id` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `study_anamnesis_structured_uid_unit_unique` (`study_instance_uid`, `unit_id`),
  KEY `study_anamnesis_structured_unit_updated_idx` (`unit_id`, `updatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
