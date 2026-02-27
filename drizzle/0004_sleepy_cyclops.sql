CREATE TABLE `anamnesis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`study_instance_uid` varchar(128) NOT NULL,
	`unit_id` int,
	`created_by_user_id` int,
	`exam_area` varchar(50),
	`main_symptom` varchar(100),
	`symptom_duration_days` int,
	`symptom_intensity` varchar(20),
	`has_fever` boolean DEFAULT false,
	`fever_temperature` decimal(4,1),
	`has_dyspnea` boolean DEFAULT false,
	`has_chest_pain` boolean DEFAULT false,
	`associated_symptoms` text,
	`has_hypertension` boolean DEFAULT false,
	`has_diabetes` boolean DEFAULT false,
	`has_anxiety` boolean DEFAULT false,
	`has_previous_lung_disease` boolean DEFAULT false,
	`uses_continuous_medication` boolean DEFAULT false,
	`medications_list` text,
	`exam_purpose` varchar(50),
	`suggested_cid` varchar(20),
	`suggested_cid_description` varchar(255),
	`anamnesis_data` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `anamnesis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `audit_log` MODIFY COLUMN `action` enum('LOGIN','LOGOUT','VIEW_STUDY','OPEN_VIEWER','CREATE_REPORT','UPDATE_REPORT','SIGN_REPORT','CREATE_USER','UPDATE_USER','DELETE_USER','CREATE_UNIT','UPDATE_UNIT','DELETE_UNIT','PACS_QUERY','PACS_DOWNLOAD','CREATE_ANAMNESIS') NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin_master','unit_admin','medico','viewer') NOT NULL DEFAULT 'viewer';