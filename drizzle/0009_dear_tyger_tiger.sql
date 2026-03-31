CREATE TABLE `anamnesis_simple` (
	`id` int AUTO_INCREMENT NOT NULL,
	`study_instance_uid` varchar(128) NOT NULL,
	`unit_id` int,
	`created_by_user_id` int,
	`patient_name` varchar(255),
	`presets` json NOT NULL DEFAULT ('[]'),
	`manual_text` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `anamnesis_simple_id` PRIMARY KEY(`id`),
	CONSTRAINT `anamnesis_simple_study_instance_uid_unique` UNIQUE(`study_instance_uid`)
);
