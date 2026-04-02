CREATE TABLE `phrase_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`color` varchar(30) DEFAULT 'blue',
	`sort_order` int DEFAULT 0,
	`is_global` boolean NOT NULL DEFAULT true,
	`created_by_user_id` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `phrase_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `phrases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`group_id` int NOT NULL,
	`user_id` int,
	`content` text NOT NULL,
	`is_global` boolean NOT NULL DEFAULT false,
	`is_favorite` boolean NOT NULL DEFAULT false,
	`sort_order` int DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `phrases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `units` ADD `logo_url` text;--> statement-breakpoint
ALTER TABLE `users` ADD `crm` varchar(50);--> statement-breakpoint
ALTER TABLE `users` ADD `signature_url` text;