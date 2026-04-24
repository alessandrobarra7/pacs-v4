-- Custom SQL migration file, put your code below! --
ALTER TABLE `billing_visit_events`
  ADD COLUMN `patient_price` decimal(10,2),
  ADD COLUMN `modality_snapshot` varchar(20),
  ADD COLUMN `exam_name_snapshot` varchar(200);

CREATE TABLE `unit_exam_prices` (
  `id` int AUTO_INCREMENT NOT NULL,
  `unit_id` int NOT NULL,
  `modality` varchar(20) NOT NULL,
  `exam_name` varchar(200) NOT NULL,
  `price_per_exam` decimal(10,2) NOT NULL,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_by` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `unit_exam_prices_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_unit_modality_exam` UNIQUE(`unit_id`, `modality`, `exam_name`)
);