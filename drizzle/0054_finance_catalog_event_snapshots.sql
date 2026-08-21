ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `modality_snapshot` varchar(20) NOT NULL DEFAULT '' AFTER `exam_name_snapshot`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `doctor_price_source` varchar(40) NULL AFTER `price_applied`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `system_price_applied` decimal(10,2) NULL AFTER `doctor_price_source`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `system_amount_due` decimal(10,2) NULL AFTER `system_price_applied`;

ALTER TABLE `billing_catalog_study_events`
  MODIFY COLUMN `pricing_status` enum('ok','pending_system_price','pending_doctor_price','pending_both') NOT NULL DEFAULT 'pending_both';
