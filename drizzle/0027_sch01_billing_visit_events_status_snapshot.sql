-- SCH-01: Adicionar campo report_status_snapshot em billing_visit_events
-- Snapshot do status do laudo no momento do evento financeiro (signed ou revised)
-- Permite rastrear se o laudo foi retificado após o registro financeiro

ALTER TABLE `billing_visit_events` ADD COLUMN `report_status_snapshot` ENUM('signed','revised') DEFAULT 'signed' AFTER `system_paid_at`;
