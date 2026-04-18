-- Migration: Add anamnesis table for CID-Indicações feature
-- Created: 2026-02-24

CREATE TABLE IF NOT EXISTS `anamnesis` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `study_instance_uid` varchar(128) NOT NULL,
  `unit_id` int,
  `created_by_user_id` int,
  
  -- CAMADA 1: Área do exame
  `exam_area` varchar(50),  -- Tórax, Abdome, Coluna, Crânio, Membros
  
  -- CAMADA 2: Sintoma principal
  `main_symptom` varchar(100),  -- tosse, dor, febre, etc.
  
  -- CAMADA 3: Caracterização do sintoma
  `symptom_duration_days` int,  -- duração em dias
  `symptom_intensity` varchar(20),  -- leve, moderada, intensa
  
  -- CAMADA 4: Sintomas associados
  `has_fever` boolean DEFAULT false,
  `fever_temperature` decimal(4,1),  -- temperatura em °C
  `has_dyspnea` boolean DEFAULT false,  -- falta de ar
  `has_chest_pain` boolean DEFAULT false,  -- dor ao respirar
  `associated_symptoms` text,  -- outros sintomas (JSON ou texto)
  
  -- CAMADA 5: Histórico clínico
  `has_hypertension` boolean DEFAULT false,
  `has_diabetes` boolean DEFAULT false,
  `has_anxiety` boolean DEFAULT false,
  `has_previous_lung_disease` boolean DEFAULT false,
  `uses_continuous_medication` boolean DEFAULT false,
  `medications_list` text,
  
  -- CAMADA 6: Finalidade do exame
  `exam_purpose` varchar(50),  -- preventivo, sintomas
  
  -- CID sugerido automaticamente
  `suggested_cid` varchar(20),
  `suggested_cid_description` varchar(255),
  
  -- Metadados
  `anamnesis_data` json,  -- dados completos em JSON para flexibilidade
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  
  FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_study_instance_uid` (`study_instance_uid`),
  INDEX `idx_unit_id` (`unit_id`),
  INDEX `idx_created_by` (`created_by_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
