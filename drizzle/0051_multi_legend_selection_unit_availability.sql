-- Evolução aditiva do catálogo clínico-financeiro.
-- Preserva seleções, laudos e eventos existentes; apenas permite composições
-- com mais de uma legenda e registra a disponibilidade administrativa por unidade.

ALTER TABLE `study_exam_legend_selections`
  DROP INDEX `uq_study_unit_legend_selection`;

ALTER TABLE `study_exam_legend_selections`
  ADD UNIQUE INDEX `uq_study_unit_legend_selection` (`study_instance_uid`, `unit_id`, `exam_legend_id`);

CREATE TABLE IF NOT EXISTS `exam_legend_unit_availability` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `exam_legend_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `is_available` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_exam_legend_unit_availability` (`exam_legend_id`, `unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
