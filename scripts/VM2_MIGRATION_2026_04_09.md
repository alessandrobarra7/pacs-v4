# Análise de Divergências — VM2 vs Schema Drizzle (2026-04-09)

> **Executar na VM2:** `mysql -u root -p137946 pacs_portal`

---

## Resumo Executivo

Após comparar o dump do banco da VM2 com o `drizzle/schema.ts` atual, foram identificadas as seguintes categorias de divergência:

| Categoria | Situação |
|---|---|
| Tabelas ausentes no código (legado) | `user` (Manus OAuth) — não usada, pode ser ignorada |
| Colunas ausentes na VM2 | `billing_cycles.total_reports`, `user_unit_permissions.created_at` |
| Colunas extras na VM2 (não críticas) | `user_unit_permissions.created_at` (snake_case vs camelCase) |
| Enum desatualizado | `users.role` — pode estar sem `responsavel_financeiro` e `operador` |
| Colunas extras na VM2 (legado) | `report_versions.revised_by`, `report_versions.created_at` |
| **Sem divergência** | Todas as tabelas de billing, financial_responsibles, anamnesis, templates, reports, studies_cache, audit_log, phrase_groups, phrases, dicom_annotations, study_metadata |

---

## Divergências Detalhadas

### 1. `billing_cycles` — coluna `total_reports` ausente na VM2

O schema Drizzle define `total_reports INT NOT NULL DEFAULT 0`, mas a VM2 mostra apenas `total_visits` (nome antigo, renomeado em migração anterior).

**Verificar na VM2:**
```sql
SHOW COLUMNS FROM billing_cycles LIKE 'total_reports';
SHOW COLUMNS FROM billing_cycles LIKE 'total_visits';
```

**Se `total_visits` existir e `total_reports` não existir, executar:**
```sql
ALTER TABLE billing_cycles
  RENAME COLUMN total_visits TO total_reports;
```

**Se nenhuma das duas existir:**
```sql
ALTER TABLE billing_cycles
  ADD COLUMN total_reports INT NOT NULL DEFAULT 0 AFTER status;
```

---

### 2. `users.role` — enum pode estar desatualizado

O schema atual define:
```
ENUM('admin_master','unit_admin','medico','viewer','operador','responsavel_financeiro')
```

A VM2 pode ainda ter o enum antigo sem `operador` e `responsavel_financeiro`.

**Verificar na VM2:**
```sql
SHOW COLUMNS FROM users LIKE 'role';
```

**Se o enum estiver desatualizado, executar:**
```sql
ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'admin_master','unit_admin','medico','viewer','operador','responsavel_financeiro'
  ) NOT NULL DEFAULT 'viewer';
```

---

### 3. `user_unit_permissions` — coluna `created_at` extra na VM2

A VM2 tem uma coluna `created_at` (snake_case) que **não existe** no schema Drizzle (que usa apenas `createdAt` e `updatedAt`). Isso é um resíduo de migração anterior e **não causa problemas** — o código ignora colunas extras.

**Nenhuma ação necessária.** A coluna extra não interfere no funcionamento.

---

### 4. `report_versions` — colunas `revised_by` e `created_at` extras na VM2

A VM2 tem `revised_by` e `created_at` que não constam no schema Drizzle atual. São resíduos de versões anteriores. **Não causam problemas** — o código ignora colunas extras.

**Nenhuma ação necessária.**

---

### 5. Tabela `user` (legada Manus OAuth)

A VM2 tem a tabela `user` (singular) que é o resíduo do sistema de autenticação Manus OAuth original. O código atual usa exclusivamente a tabela `users` (plural) com autenticação local. A tabela `user` **não é referenciada** pelo código.

**Nenhuma ação necessária.** Pode ser removida futuramente se desejar limpeza.

---

## SQL de Migração Completo (Seguro para Executar)

Execute este bloco completo na VM2. Todos os comandos são idempotentes ou verificados antes de executar:

```sql
-- ============================================================
-- MIGRAÇÃO VM2 — 2026-04-09
-- Executar em: root@pacs (VM2) — mysql -u root -p137946 pacs_portal
-- ============================================================

-- 1. Renomear total_visits → total_reports (se existir)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'pacs_portal'
    AND TABLE_NAME = 'billing_cycles'
    AND COLUMN_NAME = 'total_visits'
);

-- Execute manualmente se @col_exists = 1:
-- ALTER TABLE billing_cycles RENAME COLUMN total_visits TO total_reports;

-- 2. Adicionar total_reports se não existir nenhuma das duas
SET @has_total_reports = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'pacs_portal'
    AND TABLE_NAME = 'billing_cycles'
    AND COLUMN_NAME = 'total_reports'
);
-- Execute manualmente se @has_total_reports = 0:
-- ALTER TABLE billing_cycles ADD COLUMN total_reports INT NOT NULL DEFAULT 0 AFTER status;

-- 3. Atualizar enum role dos usuários
ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'admin_master','unit_admin','medico','viewer','operador','responsavel_financeiro'
  ) NOT NULL DEFAULT 'viewer';

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
```

---

## Verificação Pós-Migração

Execute na VM2 para confirmar:

```sql
-- Verificar enum role
SHOW COLUMNS FROM users LIKE 'role';

-- Verificar billing_cycles
SHOW COLUMNS FROM billing_cycles LIKE 'total%';

-- Verificar que todas as tabelas esperadas existem
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'pacs_portal'
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
```

---

## Tabelas em Conformidade (Sem Ação Necessária)

As seguintes tabelas estão **100% em conformidade** com o schema Drizzle:

- `anamnesis`, `anamnesis_simple`
- `audit_log`
- `billing_cycle_configs`, `billing_cycle_doctor_summary`, `billing_cycle_system_summary`
- `billing_doctor_unit_prices`, `billing_system_unit_prices`
- `billing_monthly_doctor_by_unit`, `billing_monthly_system_by_unit`
- `billing_report_items`
- `billing_visit_events`
- `dicom_annotations`
- `financial_responsibles`, `financial_responsible_units`, `financial_responsible_users`
- `phrase_groups`, `phrases`
- `reports`, `report_versions`
- `studies_cache`
- `study_metadata`
- `templates`
- `units`
- `users` (após migração do enum)
- `user_unit_permissions`
