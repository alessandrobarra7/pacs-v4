CREATE TABLE IF NOT EXISTS `report_masks` (
  `id`              INT NOT NULL AUTO_INCREMENT,
  `unit_id`         INT NOT NULL,
  `owner_user_id`   INT NOT NULL,
  `scope`           ENUM('personal','unit') NOT NULL DEFAULT 'personal',
  `name`            VARCHAR(255) NOT NULL,
  `modality`        VARCHAR(10) NULL,
  `exam_title`      VARCHAR(255) NULL,
  `body`            LONGTEXT NOT NULL,
  `created_by`      INT NOT NULL,
  `createdAt`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_masks_unit_scope` (`unit_id`, `scope`),
  KEY `idx_masks_owner` (`owner_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
