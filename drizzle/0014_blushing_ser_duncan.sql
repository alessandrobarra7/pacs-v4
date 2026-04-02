CREATE TABLE `report_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_id` int NOT NULL,
	`version` int NOT NULL,
	`body` text NOT NULL,
	`status` enum('draft','signed','revised') NOT NULL,
	`reason` varchar(500),
	`saved_by_user_id` int NOT NULL,
	`saved_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `report_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `stamp_url` text;