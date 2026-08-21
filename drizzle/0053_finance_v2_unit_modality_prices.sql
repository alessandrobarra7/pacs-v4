-- Financeiro v2: valor padrão da unidade por modalidade, com histórico de vigência.
-- A migração é exclusivamente aditiva e não altera tabelas, preços ou eventos existentes.
CREATE TABLE `billing_unit_modality_prices` (
  `id` int AUTO_INCREMENT NOT NULL,
  `unit_id` int NOT NULL,
  `modality` varchar(10) NOT NULL,
  `price_per_event` decimal(10,2) NOT NULL DEFAULT '0.00',
  `starts_at` timestamp NOT NULL,
  `ends_at` timestamp NULL,
  `created_by` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `billing_unit_modality_prices_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_unit_modality_price_start` UNIQUE(`unit_id`,`modality`,`starts_at`)
);
