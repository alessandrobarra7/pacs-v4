ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `doctor_received_at` timestamp NULL AFTER `pricing_status`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `doctor_received_by_user_id` int NULL AFTER `doctor_received_at`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `doctor_payment_note` varchar(500) NULL AFTER `doctor_received_by_user_id`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `system_paid_at` timestamp NULL AFTER `doctor_payment_note`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `system_paid_by_user_id` int NULL AFTER `system_paid_at`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `system_payment_note` varchar(500) NULL AFTER `system_paid_by_user_id`;
