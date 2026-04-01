ALTER TABLE `audit_log` MODIFY COLUMN `action` enum('LOGIN','LOGOUT','VIEW_STUDY','OPEN_VIEWER','CREATE_REPORT','UPDATE_REPORT','SIGN_REPORT','CREATE_USER','UPDATE_USER','DELETE_USER','CREATE_UNIT','UPDATE_UNIT','DELETE_UNIT','PACS_QUERY','PACS_DOWNLOAD','CREATE_ANAMNESIS','EDIT_STUDY_METADATA') NOT NULL;--> statement-breakpoint
ALTER TABLE `units` ADD `address` varchar(500);--> statement-breakpoint
ALTER TABLE `units` ADD `equipment_info` text;--> statement-breakpoint
ALTER TABLE `users` ADD `expiration_date` date;