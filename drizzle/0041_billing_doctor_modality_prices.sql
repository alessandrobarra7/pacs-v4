-- Migration 0041: Tabela de preços por modalidade por médico
-- Hierarquia: billing_doctor_modality_prices → billing_doctor_unit_prices → null
-- Cada médico pode ter preço específico por modalidade (CT, MR, RX, US, etc.)
-- com vigência histórica (starts_at / ends_at)

CREATE TABLE IF NOT EXISTS `billing_doctor_modality_prices` (
  `id`                       INT NOT NULL AUTO_INCREMENT,
  `financial_responsible_id` INT NOT NULL,
  `unit_id`                  INT NOT NULL,
  `doctor_user_id`           INT NOT NULL,
  `modality`                 VARCHAR(10) NOT NULL
                             COMMENT 'CR, DX, CT, MR, US, MG, NM, PT, XA, RF, OTHER',
  `price_per_report`         DECIMAL(10,2) NOT NULL,
  `starts_at`                TIMESTAMP NOT NULL,
  `ends_at`                  TIMESTAMP NULL
                             COMMENT 'NULL = vigente',
  `created_by`               INT NOT NULL,
  `createdAt`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_modality_price_active`
    (`unit_id`, `doctor_user_id`, `modality`, `starts_at`),
  KEY `idx_lookup`
    (`unit_id`, `doctor_user_id`, `modality`, `ends_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Preços por modalidade de exame por médico por unidade com vigência histórica';
