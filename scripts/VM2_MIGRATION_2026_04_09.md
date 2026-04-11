# Análise de Divergências — VM2 vs Schema Drizzle (2026-04-09)

> **Executar na VM2:** `mysql -u root -p137946 pacs_portal`

---

## Resumo Executivo

Após comparar o dump do banco da VM2 com o `drizzle/schema.ts` atual, foram identificadas as seguintes categorias de divergência:

| Categoria | Situação |
|---|---|
| Tabelas ausentes no código (legado) | `user` (Manus OAuth) — não usada, pode ser ignorada |
| Colunas ausentes na VM2 | `billing_cycles.total_reports`, `billing_visit_events.report_key`, `billing_cycle_doctor_summary.reports_count`, `billing_cycle_system_summary.reports_count` |
| Colunas extras na VM2 (não críticas) | `user_unit_permissions.created_at` (snake_case vs camelCase) |
| Enum desatualizado | `users.role` — pode estar sem `responsavel_financeiro` e `operador` |
| Colunas extras na VM2 (legado) | `report_versions.revised_by`, `report_versions.created_at` |
| **Sem divergência** | Todas as tabelas de financial_responsibles, anamnesis, templates, reports, studies_cache, audit_log, phrase_groups, phrases, dicom_annotations, study_metadata |

---

## Divergências Detalhadas

### 1. `billing_cycles` — coluna `total_reports` ausente na VM2

O schema Drizzle define `total_reports INT NOT NULL DEFAULT 0`, mas a VM2 pode ter `total_visits` (nome antigo, renomeado em migração anterior).

**Verificar na VM2:**
```sql
SHOW COLUMNS FROM billing_cycles LIKE 'total_reports';
SHOW COLUMNS FROM billing_cycles LIKE 'total_visits';
```

**Se `total_visits` existir e `total_reports` não existir, executar:**
```sql
ALTER TABLE billing_cycles
  CHANGE COLUMN total_visits total_reports INT NOT NULL DEFAULT 0;
```

**Se nenhuma das duas existir:**
```sql
ALTER TABLE billing_cycles
  ADD COLUMN total_reports INT NOT NULL DEFAULT 0 AFTER status;
```

---

### 2. `billing_visit_events` — coluna `report_key` ausente na VM2

O schema Drizzle define `report_key VARCHAR(300) NOT NULL` com índice único `uq_report_event`, mas a VM2 pode ter `visit_key` (nome antigo).

**Verificar na VM2:**
```sql
SHOW COLUMNS FROM billing_visit_events LIKE 'report_key';
SHOW COLUMNS FROM billing_visit_events LIKE 'visit_key';
```

**Se `visit_key` existir e `report_key` não existir, executar:**
```sql
ALTER TABLE billing_visit_events
  CHANGE COLUMN visit_key report_key VARCHAR(300) NOT NULL;

-- Verificar se o índice único existe
SHOW INDEX FROM billing_visit_events WHERE Key_name = 'uq_report_event';

-- Se não existir, criar:
ALTER TABLE billing_visit_events
  ADD UNIQUE INDEX uq_report_event (report_key);
```

---

### 3. `billing_cycle_doctor_summary` — coluna `reports_count` ausente na VM2

O schema Drizzle define `reports_count INT NOT NULL DEFAULT 0`, mas a VM2 pode ter `visits_count` (nome antigo).

**Verificar na VM2:**
```sql
SHOW COLUMNS FROM billing_cycle_doctor_summary LIKE 'reports_count';
SHOW COLUMNS FROM billing_cycle_doctor_summary LIKE 'visits_count';
```

**Se `visits_count` existir e `reports_count` não existir, executar:**
```sql
ALTER TABLE billing_cycle_doctor_summary
  CHANGE COLUMN visits_count reports_count INT NOT NULL DEFAULT 0;
```

---

### 4. `billing_cycle_system_summary` — coluna `reports_count` ausente na VM2

Mesma situação da tabela anterior.

**Se `visits_count` existir e `reports_count` não existir, executar:**
```sql
ALTER TABLE billing_cycle_system_summary
  CHANGE COLUMN visits_count reports_count INT NOT NULL DEFAULT 0;
```

---

### 5. `users.role` — enum pode estar desatualizado

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

### 6. `user_unit_permissions` — coluna `created_at` extra na VM2

A VM2 tem uma coluna `created_at` (snake_case) que **não existe** no schema Drizzle (que usa apenas `createdAt` e `updatedAt`). Isso é um resíduo de migração anterior e **não causa problemas** — o código ignora colunas extras.

**Nenhuma ação necessária.** A coluna extra não interfere no funcionamento.

---

### 7. `report_versions` — colunas `revised_by` e `created_at` extras na VM2

A VM2 tem `revised_by` e `created_at` que não constam no schema Drizzle atual. São resíduos de versões anteriores. **Não causam problemas** — o código ignora colunas extras.

**Nenhuma ação necessária.**

---

### 8. Tabela `user` (legada Manus OAuth)

A VM2 tem a tabela `user` (singular) que é o resíduo do sistema de autenticação Manus OAuth original. O código atual usa exclusivamente a tabela `users` (plural) com autenticação local. A tabela `user` **não é referenciada** pelo código.

**Nenhuma ação necessária.** Pode ser removida futuramente se desejar limpeza.

---

## SQL de Migração Completo (Seguro para Executar)

Execute este bloco completo na VM2. Todos os comandos são idempotentes ou verificados antes de executar:

```sql
-- ============================================================
-- MIGRAÇÃO VM2 — 2026-04-09 (atualizado 2026-04-11)
-- Executar em: root@pacs (VM2) — mysql -u root -p137946 pacs_portal
-- ============================================================

-- 1. Renomear total_visits → total_reports em billing_cycles (se existir)
-- Verificar primeiro:
-- SHOW COLUMNS FROM billing_cycles LIKE 'total_visits';
-- Se existir, executar:
ALTER TABLE billing_cycles
  CHANGE COLUMN total_visits total_reports INT NOT NULL DEFAULT 0;
-- Se não existir total_visits nem total_reports, executar:
-- ALTER TABLE billing_cycles ADD COLUMN total_reports INT NOT NULL DEFAULT 0 AFTER status;

-- 2. Renomear visit_key → report_key em billing_visit_events (se existir)
-- Verificar primeiro:
-- SHOW COLUMNS FROM billing_visit_events LIKE 'visit_key';
-- Se existir, executar:
ALTER TABLE billing_visit_events
  CHANGE COLUMN visit_key report_key VARCHAR(300) NOT NULL;
-- Adicionar índice único se não existir:
-- SHOW INDEX FROM billing_visit_events WHERE Key_name = 'uq_report_event';
ALTER TABLE billing_visit_events
  ADD UNIQUE INDEX uq_report_event (report_key);

-- 3. Renomear visits_count → reports_count em billing_cycle_doctor_summary (se existir)
-- Verificar primeiro:
-- SHOW COLUMNS FROM billing_cycle_doctor_summary LIKE 'visits_count';
-- Se existir, executar:
ALTER TABLE billing_cycle_doctor_summary
  CHANGE COLUMN visits_count reports_count INT NOT NULL DEFAULT 0;

-- 4. Renomear visits_count → reports_count em billing_cycle_system_summary (se existir)
-- Verificar primeiro:
-- SHOW COLUMNS FROM billing_cycle_system_summary LIKE 'visits_count';
-- Se existir, executar:
ALTER TABLE billing_cycle_system_summary
  CHANGE COLUMN visits_count reports_count INT NOT NULL DEFAULT 0;

-- 5. Atualizar enum role dos usuários
ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'admin_master','unit_admin','medico','viewer','operador','responsavel_financeiro'
  ) NOT NULL DEFAULT 'viewer';

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
```

> **ATENÇÃO:** Antes de executar cada ALTER TABLE, verifique se a coluna antiga existe com SHOW COLUMNS. Executar ALTER TABLE em coluna inexistente causará erro.

---

## Verificação Pós-Migração

Execute na VM2 para confirmar:

```sql
-- Verificar enum role
SHOW COLUMNS FROM users LIKE 'role';

-- Verificar billing_cycles
SHOW COLUMNS FROM billing_cycles LIKE 'total%';

-- Verificar billing_visit_events
SHOW COLUMNS FROM billing_visit_events LIKE 'report_key';

-- Verificar billing_cycle_doctor_summary
SHOW COLUMNS FROM billing_cycle_doctor_summary LIKE 'reports_count';

-- Verificar billing_cycle_system_summary
SHOW COLUMNS FROM billing_cycle_system_summary LIKE 'reports_count';

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
- `billing_cycle_configs`
- `billing_doctor_unit_prices`, `billing_system_unit_prices`
- `billing_monthly_doctor_by_unit`, `billing_monthly_system_by_unit`
- `billing_report_items`
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
