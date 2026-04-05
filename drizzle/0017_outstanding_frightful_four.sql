DROP TABLE `exam_catalog`;--> statement-breakpoint
DROP TABLE `report_sections`;--> statement-breakpoint
DROP TABLE `study_labels`;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_uid_unit_idx` UNIQUE(`study_instance_uid`,`unit_id`);