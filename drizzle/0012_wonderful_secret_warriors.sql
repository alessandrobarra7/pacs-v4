CREATE TABLE `user_unit_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`unit_id` int NOT NULL,
	`view_studies` boolean NOT NULL DEFAULT true,
	`edit_reports` boolean NOT NULL DEFAULT false,
	`view_anamnesis` boolean NOT NULL DEFAULT false,
	`print_reports` boolean NOT NULL DEFAULT false,
	`manage_templates` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_unit_permissions_id` PRIMARY KEY(`id`)
);
