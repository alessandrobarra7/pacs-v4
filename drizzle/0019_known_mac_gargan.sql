CREATE TABLE `billing_doctor_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unit_id` int NOT NULL,
	`doctor_user_id` int NOT NULL,
	`price_per_report` decimal(10,2) NOT NULL,
	`starts_at` int NOT NULL,
	`ends_at` int,
	`created_by` int NOT NULL,
	`created_at` int NOT NULL,
	CONSTRAINT `billing_doctor_prices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `billing_monthly_doctor` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unit_id` int NOT NULL,
	`doctor_user_id` int NOT NULL,
	`competence_year` int NOT NULL,
	`competence_month` int NOT NULL,
	`reports_count` int NOT NULL DEFAULT 0,
	`doctor_price_applied` decimal(10,2),
	`doctor_total_due` decimal(10,2),
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`generated_at` int NOT NULL,
	`closed_at` int,
	`closed_by` int,
	CONSTRAINT `billing_monthly_doctor_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_doctor_unit_competence` UNIQUE(`unit_id`,`doctor_user_id`,`competence_year`,`competence_month`)
);
--> statement-breakpoint
CREATE TABLE `billing_monthly_unit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unit_id` int NOT NULL,
	`competence_year` int NOT NULL,
	`competence_month` int NOT NULL,
	`reports_count` int NOT NULL DEFAULT 0,
	`unit_price_applied` decimal(10,2),
	`system_total_due` decimal(10,2),
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`generated_at` int NOT NULL,
	`closed_at` int,
	`closed_by` int,
	CONSTRAINT `billing_monthly_unit_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_unit_competence` UNIQUE(`unit_id`,`competence_year`,`competence_month`)
);
--> statement-breakpoint
CREATE TABLE `billing_report_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_id` int NOT NULL,
	`unit_id` int NOT NULL,
	`doctor_user_id` int NOT NULL,
	`competence_year` int NOT NULL,
	`competence_month` int NOT NULL,
	`system_price_applied` decimal(10,2),
	`doctor_price_applied` decimal(10,2),
	`report_signed_at` int NOT NULL,
	`created_at` int NOT NULL,
	CONSTRAINT `billing_report_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_report_item` UNIQUE(`report_id`)
);
--> statement-breakpoint
CREATE TABLE `billing_unit_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unit_id` int NOT NULL,
	`price_per_report` decimal(10,2) NOT NULL,
	`starts_at` int NOT NULL,
	`ends_at` int,
	`created_by` int NOT NULL,
	`created_at` int NOT NULL,
	CONSTRAINT `billing_unit_prices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `study_metadata` ADD `exam_count` int DEFAULT 1;