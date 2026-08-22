ALTER TABLE `reports`
  MODIFY COLUMN `status` enum('draft','signed','revised','cancelled') NOT NULL DEFAULT 'draft';

ALTER TABLE `audit_log`
  MODIFY COLUMN `action` enum('LOGIN','LOGOUT','VIEW_STUDY','OPEN_VIEWER','CREATE_REPORT','UPDATE_REPORT','SIGN_REPORT','DELETE_REPORT','CANCEL_REPORT','REVISE_REPORT','CREATE_USER','UPDATE_USER','DELETE_USER','ACTIVATE_USER','DEACTIVATE_USER','CREATE_UNIT','UPDATE_UNIT','DELETE_UNIT','PACS_QUERY','PACS_DOWNLOAD','CREATE_ANAMNESIS','EDIT_STUDY_METADATA','SET_STUDY_PRIORITY','UPDATE_STUDY_PRIORITY','CLEAR_STUDY_PRIORITY','RESET_DOCTOR_BILLING','CREATE_LAYOUT','UPDATE_LAYOUT','DELETE_LAYOUT','BILLING_EVENT_FAILED','FINANCIAL_ENABLED','FINANCIAL_DISABLED','BILLING_EVENT_WITHOUT_FINANCIAL_ENABLED','BILLING_EVENT_CANCELLED') NOT NULL;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `financial_status` enum('active','cancelled') NOT NULL DEFAULT 'active' AFTER `pricing_status`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `cancelled_at` timestamp NULL AFTER `financial_status`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `cancelled_by_user_id` int NULL AFTER `cancelled_at`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `cancellation_reason` varchar(500) NULL AFTER `cancelled_by_user_id`;

ALTER TABLE `billing_catalog_study_events`
  ADD COLUMN `cancellation_report_id` int NULL AFTER `cancellation_reason`;
