CREATE TABLE `study_metadata` (
	`id` int AUTO_INCREMENT NOT NULL,
	`study_instance_uid` varchar(128) NOT NULL,
	`unit_id` int NOT NULL,
	`patient_name_override` varchar(255),
	`description_override` varchar(255),
	`notes` text,
	`edited_by_user_id` int NOT NULL,
	`edited_by_name` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `study_metadata_id` PRIMARY KEY(`id`)
);
