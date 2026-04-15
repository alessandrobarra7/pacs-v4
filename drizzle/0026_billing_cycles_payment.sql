-- Migration: P2 - Adicionar campos de controle de pagamento ao billing_cycles
-- paid_status: 'pending' | 'paid'
-- paid_at: timestamp do pagamento
-- paid_by_user_id: quem marcou como pago
-- paid_note: observação de pagamento

ALTER TABLE `billing_cycles`
  ADD COLUMN `paid_status` ENUM('pending','paid') NOT NULL DEFAULT 'pending' AFTER `closedBy`,
  ADD COLUMN `paid_at` TIMESTAMP NULL AFTER `paid_status`,
  ADD COLUMN `paid_by_user_id` INT NULL AFTER `paid_at`,
  ADD COLUMN `paid_note` VARCHAR(500) NULL AFTER `paid_by_user_id`;
