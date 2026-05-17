-- Migration 0040: Módulo Financeiro — novos campos v49/v50
-- Aplicar em produção ANTES de qualquer deploy que use estes campos.
-- Campos adicionados via webdev_execute_sql em ambiente Manus (já aplicados no banco dev).

-- P4 (v49): auditoria de quem marcou pagamento
ALTER TABLE billing_visit_events
  ADD COLUMN IF NOT EXISTS doctor_received_by_user_id INT NULL
    AFTER doctor_received_at,
  ADD COLUMN IF NOT EXISTS system_paid_by_user_id INT NULL
    AFTER system_paid_at;

-- P5 (v49): ativar/desativar financeiro por unidade
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS financial_enabled BOOLEAN NOT NULL DEFAULT FALSE
    AFTER isActive;

-- P8 (v50): status financeiro do evento (active / cancelled / reversed / adjusted)
ALTER TABLE billing_visit_events
  ADD COLUMN IF NOT EXISTS financial_status ENUM('active','cancelled','reversed','adjusted')
    NOT NULL DEFAULT 'active'
    AFTER pricing_status;
