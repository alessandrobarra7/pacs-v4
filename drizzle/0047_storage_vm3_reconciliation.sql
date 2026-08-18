-- Reconciliação auditável do schema do storage VM3.
-- Pode ser executada em bancos novos e em bancos que já receberam a DDL
-- manualmente: a criação de tabelas é idempotente e as colunas são adicionadas
-- somente quando ainda não existirem.

CREATE TABLE IF NOT EXISTS `study_audio_reports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `study_instance_uid` VARCHAR(128) NOT NULL,
  `unit_id` INT DEFAULT NULL,
  `user_id` INT NOT NULL,
  `file_url` TEXT NOT NULL,
  `file_key` TEXT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_size` INT DEFAULT NULL,
  `duration_seconds` INT DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_study_audio_uid` (`study_instance_uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `study_attachments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `study_instance_uid` VARCHAR(128) NOT NULL,
  `unit_id` INT DEFAULT NULL,
  `user_id` INT NOT NULL,
  `file_url` TEXT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_type` VARCHAR(100) DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_study_attachments_uid` (`study_instance_uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @schema_name = DATABASE();

SET @has_audio_study_index = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'study_audio_reports'
    AND index_name = 'idx_study_audio_uid'
);
SET @add_audio_study_index = IF(
  @has_audio_study_index = 0,
  'ALTER TABLE `study_audio_reports` ADD INDEX `idx_study_audio_uid` (`study_instance_uid`)',
  'SELECT 1'
);
PREPARE storage_schema_statement FROM @add_audio_study_index;
EXECUTE storage_schema_statement;
DEALLOCATE PREPARE storage_schema_statement;

SET @has_attachment_study_index = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'study_attachments'
    AND index_name = 'idx_study_attachments_uid'
);
SET @add_attachment_study_index = IF(
  @has_attachment_study_index = 0,
  'ALTER TABLE `study_attachments` ADD INDEX `idx_study_attachments_uid` (`study_instance_uid`)',
  'SELECT 1'
);
PREPARE storage_schema_statement FROM @add_attachment_study_index;
EXECUTE storage_schema_statement;
DEALLOCATE PREPARE storage_schema_statement;

SET @has_export_file_key = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema_name
    AND table_name = 'reports'
    AND column_name = 'export_file_key'
);
SET @add_export_file_key = IF(
  @has_export_file_key = 0,
  'ALTER TABLE `reports` ADD COLUMN `export_file_key` VARCHAR(500) NULL AFTER `signedBy`',
  'SELECT 1'
);
PREPARE storage_schema_statement FROM @add_export_file_key;
EXECUTE storage_schema_statement;
DEALLOCATE PREPARE storage_schema_statement;

SET @has_export_file_url = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema_name
    AND table_name = 'reports'
    AND column_name = 'export_file_url'
);
SET @add_export_file_url = IF(
  @has_export_file_url = 0,
  'ALTER TABLE `reports` ADD COLUMN `export_file_url` VARCHAR(500) NULL AFTER `export_file_key`',
  'SELECT 1'
);
PREPARE storage_schema_statement FROM @add_export_file_url;
EXECUTE storage_schema_statement;
DEALLOCATE PREPARE storage_schema_statement;
