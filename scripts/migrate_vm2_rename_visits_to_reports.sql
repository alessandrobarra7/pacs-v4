-- ============================================================
-- MIGRAÇÃO: Renomear colunas visit → report nas tabelas billing
-- VM2 (pacs_portal) — MySQL 8.0
-- Execute: mysql -u root -p137946 pacs_portal < migrate_vm2_rename_visits_to_reports.sql
-- ============================================================

SET NAMES utf8mb4;

-- 1. billing_visit_events: renomear visit_key → report_key
-- (apenas se a coluna visit_key ainda existir)
DROP PROCEDURE IF EXISTS _rename_col;
DELIMITER //
CREATE PROCEDURE _rename_col()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'billing_visit_events' AND column_name = 'visit_key'
  ) THEN
    ALTER TABLE `billing_visit_events`
      RENAME COLUMN `visit_key` TO `report_key`;
  END IF;
END //
DELIMITER ;
CALL _rename_col();
DROP PROCEDURE IF EXISTS _rename_col;

-- 2. billing_cycle_doctor_summary: renomear visits_count → reports_count
DROP PROCEDURE IF EXISTS _rename_col;
DELIMITER //
CREATE PROCEDURE _rename_col()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'billing_cycle_doctor_summary' AND column_name = 'visits_count'
  ) THEN
    ALTER TABLE `billing_cycle_doctor_summary`
      RENAME COLUMN `visits_count` TO `reports_count`;
  END IF;
END //
DELIMITER ;
CALL _rename_col();
DROP PROCEDURE IF EXISTS _rename_col;

-- 3. billing_cycle_system_summary: renomear visits_count → reports_count
DROP PROCEDURE IF EXISTS _rename_col;
DELIMITER //
CREATE PROCEDURE _rename_col()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'billing_cycle_system_summary' AND column_name = 'visits_count'
  ) THEN
    ALTER TABLE `billing_cycle_system_summary`
      RENAME COLUMN `visits_count` TO `reports_count`;
  END IF;
END //
DELIMITER ;
CALL _rename_col();
DROP PROCEDURE IF EXISTS _rename_col;

-- 4. billing_monthly_doctor_by_unit: renomear total_visits → total_reports
DROP PROCEDURE IF EXISTS _rename_col;
DELIMITER //
CREATE PROCEDURE _rename_col()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'billing_monthly_doctor_by_unit' AND column_name = 'total_visits'
  ) THEN
    ALTER TABLE `billing_monthly_doctor_by_unit`
      RENAME COLUMN `total_visits` TO `total_reports`;
  END IF;
END //
DELIMITER ;
CALL _rename_col();
DROP PROCEDURE IF EXISTS _rename_col;

-- 5. billing_monthly_system_by_unit: renomear total_visits → total_reports
DROP PROCEDURE IF EXISTS _rename_col;
DELIMITER //
CREATE PROCEDURE _rename_col()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'billing_monthly_system_by_unit' AND column_name = 'total_visits'
  ) THEN
    ALTER TABLE `billing_monthly_system_by_unit`
      RENAME COLUMN `total_visits` TO `total_reports`;
  END IF;
END //
DELIMITER ;
CALL _rename_col();
DROP PROCEDURE IF EXISTS _rename_col;

-- Verificação final
SELECT 'Migração concluída!' AS status;
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name IN ('billing_visit_events','billing_cycle_doctor_summary','billing_cycle_system_summary','billing_monthly_doctor_by_unit','billing_monthly_system_by_unit')
  AND column_name IN ('report_key','reports_count','total_reports','visit_key','visits_count','total_visits')
ORDER BY table_name, column_name;
