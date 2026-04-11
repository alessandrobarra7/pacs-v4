# Análise de Divergências — VM2 vs Schema Drizzle (2026-04-11)

> **Baseado no dump real do banco da VM2 coletado em 11/04/2026.**
> Executar na VM2: `mysql -u root -p137946 pacs_portal`

---

## Resultado da Comparação

O banco da VM2 foi comparado coluna a coluna com o schema Drizzle atual (`drizzle/schema.ts`).

**Conclusão: o banco da VM2 está praticamente sincronizado com o schema Drizzle.**

As únicas divergências encontradas são **colunas extras de legado** — elas não causam nenhum erro no código, pois o Drizzle ignora colunas que não estão no schema. **Nenhuma coluna obrigatória está faltando na VM2.**

---

## Divergências Encontradas

| Tabela | Tipo | Coluna(s) | Impacto |
|---|---|---|---|
| `report_versions` | Extra na VM2 (legado) | `revised_by`, `created_at` | Nenhum — código ignora |
| `user_unit_permissions` | Extra na VM2 (legado) | `created_at` | Nenhum — código ignora |

Ambas as divergências são **colunas extras** que existem na VM2 mas não no schema Drizzle. Isso é um resíduo de migrações anteriores e **não afeta o funcionamento do sistema**.

---

## Tabelas em Conformidade Total

Todas as tabelas abaixo estão **100% sincronizadas** entre VM2 e Drizzle:

- `anamnesis`
- `anamnesis_simple`
- `audit_log`
- `billing_cycle_configs`
- `billing_cycle_doctor_summary` ✅ (já tem `reports_count`)
- `billing_cycle_system_summary` ✅ (já tem `reports_count`)
- `billing_cycles` ✅ (já tem `total_reports`)
- `billing_doctor_unit_prices`
- `billing_monthly_doctor_by_unit`
- `billing_monthly_system_by_unit`
- `billing_report_items`
- `billing_system_unit_prices`
- `billing_visit_events` ✅ (já tem `report_key`)
- `dicom_annotations`
- `financial_responsible_units`
- `financial_responsible_users`
- `financial_responsibles`
- `phrase_groups`
- `phrases`
- `reports`
- `studies_cache`
- `study_metadata`
- `templates`
- `units`
- `users`

---

## SQL de Migração Necessário

Como **não há colunas faltando** na VM2, **não é necessário executar nenhum ALTER TABLE**.

O único item pendente é a atualização do **enum `role`** na tabela `users`, caso a VM2 ainda não tenha os valores `operador` e `responsavel_financeiro`:

```sql
-- Executar na VM2: mysql -u root -p137946 pacs_portal
-- Verificar primeiro:
SHOW COLUMNS FROM users LIKE 'role';

-- Se o enum não incluir 'operador' e 'responsavel_financeiro', executar:
ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'admin_master',
    'unit_admin',
    'medico',
    'viewer',
    'operador',
    'responsavel_financeiro'
  ) NOT NULL DEFAULT 'viewer';
```

> **ATENÇÃO:** Verifique o resultado do `SHOW COLUMNS` antes de executar o ALTER. Se o enum já contiver todos os valores, não é necessário executar.

---

## Tabelas Extras na VM2 (Legado)

A VM2 possui a tabela `user` (singular) que é resíduo do sistema de autenticação Manus OAuth original. O código atual usa exclusivamente a tabela `users` (plural). Pode ser removida futuramente se desejar limpeza, mas **não causa nenhum problema**.

---

## Histórico de Migrações Anteriores Aplicadas

As seguintes migrações foram identificadas e aplicadas no banco de desenvolvimento (sandbox) durante os testes de 11/04/2026. Como o banco da VM2 já está sincronizado, **estas migrações NÃO precisam ser executadas na VM2**:

| Script | O que fazia | Status na VM2 |
|---|---|---|
| `migrate_rename_visit_key.mjs` | `visit_key → report_key` em `billing_visit_events` | Já aplicado ✅ |
| `migrate_rename_total_visits.mjs` | `total_visits → total_reports` em `billing_cycles` | Já aplicado ✅ |
| `migrate_rename_visits_count.mjs` | `visits_count → reports_count` em `billing_cycle_doctor_summary` e `billing_cycle_system_summary` | Já aplicado ✅ |

---

## Próximos Passos

1. **Verificar enum `role`** — executar o `SHOW COLUMNS FROM users LIKE 'role'` na VM2 e aplicar o ALTER TABLE se necessário.
2. **Configurar preços financeiros** — cadastrar preços por médico/unidade na tela Financeiro para que os eventos de laudo tenham `pricing_status: ok`.
3. **Testar o fluxo completo na VM2** — assinar um laudo e verificar se o evento financeiro é criado corretamente em `billing_visit_events`.
