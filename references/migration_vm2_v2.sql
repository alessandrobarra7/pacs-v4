-- ============================================================
-- MIGRAÇÃO VM2 → Novo código PACS Portal
-- Gerado em: 2026-05-12
-- Desenvolvimento StudioBarra7
-- ============================================================
-- RESUMO DA ANÁLISE:
--   • Todas as tabelas já existem na VM2 ✅
--   • Apenas 1 mudança estrutural necessária:
--     tabela `units` precisa de 2 novas colunas para o ciclo de faturamento
--   • Nenhuma tabela precisa ser criada do zero
--   • Índices únicos (uq_unit_config, uq_resp_user, uq_unit_sla) já existem
--     na VM2 — o script de comparação os detectou como "colunas" por engano
--     (são índices, não colunas)
-- ============================================================

USE pacs_portal;

-- ============================================================
-- 1. TABELA: units
--    Adicionar colunas de ciclo de faturamento por unidade
--    Usadas pela procedure financeSimple.setUnitCycle
--    e pela tela de configuração de ciclo no módulo financeiro
-- ============================================================

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS billing_cycle_start_day INT NULL DEFAULT 1
    COMMENT 'Dia do mês de início do ciclo de faturamento (1-31)',
  ADD COLUMN IF NOT EXISTS billing_cycle_end_day   INT NULL DEFAULT 31
    COMMENT 'Dia do mês de fim do ciclo de faturamento (1-31)';

-- Verificação após migração:
-- SELECT id, name, billing_cycle_start_day, billing_cycle_end_day FROM units LIMIT 10;

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
-- NOTAS IMPORTANTES:
--
-- ✅ Tabelas OK (sem alteração necessária):
--    billing_visit_events, users, financial_responsibles,
--    financial_responsible_units, financial_responsible_users,
--    billing_cycle_configs, reports, billing_cycles,
--    billing_doctor_unit_prices, billing_system_unit_prices,
--    billing_report_items, billing_monthly_doctor_by_unit,
--    billing_monthly_system_by_unit, billing_cycle_doctor_summary,
--    billing_cycle_system_summary, contract_custom_expenses,
--    contract_revenues, dicom_annotations, exam_legends,
--    model_layouts, phrase_groups, phrases, report_readiness,
--    report_versions, studies_cache, study_metadata, templates,
--    unit_doctor_compensation_rules, unit_doctor_scales,
--    unit_exam_prices, unit_report_sla_configs, user_unit_permissions,
--    anamnesis, anamnesis_simple, audit_log
--
-- 🟡 Colunas extras na VM2 (legado — o novo código não usa, mas não causam erro):
--    user_unit_permissions.created_at (duplicata de createdAt)
--    units.* (colunas de config PACS como pacs_ip, pacs_port, etc — usadas pelo backend legado)
--
-- ⚠ NÃO REMOVA colunas extras — elas podem ser usadas pelo backend legado ainda em produção.
-- ============================================================
