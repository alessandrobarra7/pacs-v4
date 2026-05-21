CREATE TABLE IF NOT EXISTS `group_permission_configs` (
  `id`               INT NOT NULL AUTO_INCREMENT,
  `group_key`        VARCHAR(50) NOT NULL,
  `view_studies`     TINYINT(1) NOT NULL DEFAULT 1,
  `edit_reports`     TINYINT(1) NOT NULL DEFAULT 0,
  `view_anamnesis`   TINYINT(1) NOT NULL DEFAULT 0,
  `edit_anamnesis`   TINYINT(1) NOT NULL DEFAULT 0,
  `edit_exam_legend` TINYINT(1) NOT NULL DEFAULT 0,
  `print_reports`    TINYINT(1) NOT NULL DEFAULT 0,
  `manage_templates` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by`       INT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_group_key` (`group_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `group_permission_configs`
  (`group_key`, `view_studies`, `edit_reports`, `view_anamnesis`, `edit_anamnesis`, `edit_exam_legend`, `print_reports`, `manage_templates`)
VALUES
  ('medicos',                 1, 1, 1, 1, 1, 1, 1),
  ('operadores',              1, 0, 1, 1, 1, 0, 0),
  ('visualizadores',          1, 0, 0, 0, 0, 1, 0),
  ('responsaveisFinanceiros', 0, 0, 0, 0, 0, 0, 0),
  ('administradoresUnidade',  1, 0, 0, 0, 0, 1, 0),
  ('adminsMaster',            1, 1, 1, 1, 1, 1, 1)
ON DUPLICATE KEY UPDATE `group_key` = `group_key`;
