CREATE TABLE `exam_catalog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modality` varchar(20) NOT NULL,
	`title` varchar(300) NOT NULL,
	`keywords` varchar(500),
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exam_catalog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_id` int NOT NULL,
	`study_instance_uid` varchar(128) NOT NULL,
	`exam_title` varchar(300) NOT NULL,
	`body` text,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `report_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `study_labels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`study_instance_uid` varchar(128) NOT NULL,
	`unit_id` int NOT NULL,
	`labels` text NOT NULL,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `study_labels_id` PRIMARY KEY(`id`)
);
