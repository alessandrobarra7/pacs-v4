# Sincronização do Banco de Dados do VM2 com o Código

**Data da análise:** 2026-05-13  
**Versão do código:** `49d9c6ea` (checkpoint atual)  
**Fonte do schema VM2:** `Textocolado.txt` (fornecido pelo usuário)

---

## Resumo Executivo

O banco de dados do VM2 está **praticamente sincronizado** com o código. Todas as **36 tabelas** existem nos dois ambientes. As divergências são mínimas e de baixo risco:

| Tabela | Situação | Risco |
|--------|----------|-------|
| `billing_monthly_doctor_by_unit` | VM2 tem `closedAt`, `closedBy` extras (legado) | BAIXO — ignorado pelo Drizzle |
| `billing_monthly_system_by_unit` | VM2 tem `closedAt`, `closedBy` extras (legado) | BAIXO — ignorado pelo Drizzle |
| `user_unit_permissions` | VM2 tem `created_at` extra (legado) | BAIXO — ignorado pelo Drizzle |
| `anamnesis` | Script de extração incompleto — tabela OK | NENHUM |
| `audit_log` | Script de extração incompleto — tabela OK | NENHUM |

**Conclusão: O banco do VM2 está sincronizado com o código.** As 3 colunas extras (`closedAt`, `closedBy` em tabelas `billing_monthly_*` e `created_at` em `user_unit_permissions`) são legado inofensivo — o Drizzle ignora colunas extras na leitura e não as inclui nos INSERTs.

---

## Detalhamento das Divergências

### 1. `billing_monthly_doctor_by_unit` e `billing_monthly_system_by_unit` — Colunas extras no VM2

O VM2 tem `closedAt` e `closedBy` nessas tabelas, que foram removidas do schema do código em uma migração posterior. Essas colunas são **inofensivas**: o Drizzle não as inclui em queries geradas automaticamente.

**Ação necessária:** Nenhuma. Podem ser removidas futuramente com `ALTER TABLE ... DROP COLUMN` se desejado, mas não causam erros.

### 2. `user_unit_permissions` — Coluna `created_at` extra no VM2

O VM2 tem `created_at` (snake_case) além de `createdAt` (camelCase). A coluna `created_at` é legado de uma versão anterior. Inofensiva.

**Ação necessária:** Nenhuma.

### 3. `anamnesis` e `audit_log` — Falso positivo no script

O script de extração não capturou todas as colunas dessas tabelas por limitação do formato do arquivo. Verificação manual confirmou que ambas as tabelas estão completas no VM2.

---

## Ação Pendente: Corrigir ciclo corrompido

Existe um ciclo com data errada (2027 em vez de 2026) que causa falha na criação de `billing_visit_events`:

```sql
-- Executar no MySQL do VM2:
-- mysql -u root -p137946 pacs
UPDATE billing_cycles 
SET starts_at = '2026-04-12', ends_at = '2026-05-11' 
WHERE id = 60001 AND starts_at = '2027-04-12';
```

---

## Ação Pendente: Executar o Reprocessador de Billing Events

Após corrigir o ciclo corrompido, executar o reprocessador para popular `billing_visit_events` com os laudos históricos:

1. Acesse Admin → Diagnóstico Financeiro
2. Clique em "Simular Reprocessamento" (dry run) para ver quantos laudos serão criados
3. Desmarque "dry run" e clique em "Executar Reprocessamento"

---

## Verificação Completa das Tabelas

Todas as 36 tabelas existem em ambos os ambientes:

| Tabela | VM2 | Código |
|--------|-----|--------|
| anamnesis | ✅ | ✅ |
| anamnesis_simple | ✅ | ✅ |
| audit_log | ✅ | ✅ |
| billing_cycle_configs | ✅ | ✅ |
| billing_cycle_doctor_summary | ✅ | ✅ |
| billing_cycle_system_summary | ✅ | ✅ |
| billing_cycles | ✅ | ✅ |
| billing_doctor_unit_prices | ✅ | ✅ |
| billing_monthly_doctor_by_unit | ✅ | ✅ |
| billing_monthly_system_by_unit | ✅ | ✅ |
| billing_report_items | ✅ | ✅ |
| billing_system_unit_prices | ✅ | ✅ |
| billing_visit_events | ✅ | ✅ |
| contract_custom_expenses | ✅ | ✅ |
| contract_revenues | ✅ | ✅ |
| dicom_annotations | ✅ | ✅ |
| exam_legends | ✅ | ✅ |
| financial_responsible_units | ✅ | ✅ |
| financial_responsible_users | ✅ | ✅ |
| financial_responsibles | ✅ | ✅ |
| model_layouts | ✅ | ✅ |
| phrase_groups | ✅ | ✅ |
| phrases | ✅ | ✅ |
| report_readiness | ✅ | ✅ |
| report_versions | ✅ | ✅ |
| reports | ✅ | ✅ |
| studies_cache | ✅ | ✅ |
| study_metadata | ✅ | ✅ |
| templates | ✅ | ✅ |
| unit_doctor_compensation_rules | ✅ | ✅ |
| unit_doctor_scales | ✅ | ✅ |
| unit_exam_prices | ✅ | ✅ |
| unit_report_sla_configs | ✅ | ✅ |
| units | ✅ | ✅ |
| user_unit_permissions | ✅ | ✅ |
| users | ✅ | ✅ |

---

*Gerado automaticamente pela análise de schema em 2026-05-13.*
