# Migrations — Documentação e Status

## Arquivos de Migration

### Sequência Drizzle Kit (0000–0022)
Gerenciados automaticamente pelo Drizzle Kit via `pnpm drizzle-kit generate`.
O `_journal.json` rastreia estas migrations e o Drizzle ORM as aplica via `drizzle-kit push` ou `migrate()`.

### Migrations Manuais Aplicadas (0023–0028)
Estas migrations foram criadas manualmente e aplicadas diretamente no banco via SQL.
**Estão no banco mas NÃO estão no `_journal.json`** — o Drizzle Kit as ignora.

| Arquivo | Conteúdo | Status |
|---------|----------|--------|
| `0023_sla_readiness.sql` | Tabela `study_readiness` para SLA | ✅ Aplicado |
| `0024_exam_legends.sql` | Tabela `exam_legends` | ✅ Aplicado |
| `0025_seed_phrases_templates.sql` | Seed de frases e templates | ✅ Aplicado |
| `0026_billing_cycles_payment.sql` | Campos `paid_status`, `paid_at`, `paid_by_user_id`, `paid_note` em `billing_cycles` | ✅ Aplicado |
| `0027_sch01_billing_visit_events_status_snapshot.sql` | Campo `report_status_snapshot` em `billing_visit_events` | ✅ Aplicado |
| `0028_prg03_units_drop_logo_url_duplicate.sql` | DROP COLUMN `logoUrl` duplicada em `units` | ✅ Aplicado |

### Migrations Legadas com Prefixo `manual_` (SCH-02/N-02)
Estes arquivos foram criados em sessões anteriores com prefixo `manual_` para evitar conflito com o Drizzle Kit.
**Estão no banco mas NÃO estão no `_journal.json`**.

| Arquivo | Conteúdo | Status |
|---------|----------|--------|
| `manual_0007_add_anamnesis.sql` | Tabela `anamnesis` | ✅ Aplicado |
| `manual_0017_wooden_hercules.sql` | Tabela `exam_catalog` | ✅ Aplicado |
| `manual_0022_reestruturacao_intuitiva.sql` | Tabelas `unit_doctor_scales`, `unit_doctor_compensation_rules`, `contract_revenues`, `contract_custom_expenses` | ✅ Aplicado |

## Estratégia de Integração (SCH-02/N-02)

O Drizzle Kit usa `_journal.json` + snapshots para rastrear o estado do schema.
Como as migrations manuais já foram aplicadas ao banco, **não é seguro adicioná-las ao journal retroativamente** sem regenerar todos os snapshots intermediários.

**Decisão adotada:** Manter os arquivos `manual_*` e `0023+` como documentação histórica.
O `_journal.json` reflete o estado até `0022`. O schema TypeScript (`schema.ts`) é a fonte de verdade.
Para novos ambientes (VM2, staging), usar o script `scripts/setup-vm1.sh` que aplica todas as migrations em ordem.

## Para Novos Ambientes

Execute na ordem:
```bash
# 1. Migrations Drizzle Kit (0000–0022)
pnpm drizzle-kit push

# 2. Migrations manuais legadas
mysql -u pacs_user -p pacs_portal < drizzle/manual_0007_add_anamnesis.sql
mysql -u pacs_user -p pacs_portal < drizzle/manual_0017_wooden_hercules.sql
mysql -u pacs_user -p pacs_portal < drizzle/manual_0022_reestruturacao_intuitiva.sql

# 3. Migrations manuais recentes (0023+)
mysql -u pacs_user -p pacs_portal < drizzle/0023_sla_readiness.sql
mysql -u pacs_user -p pacs_portal < drizzle/0024_exam_legends.sql
mysql -u pacs_user -p pacs_portal < drizzle/0025_seed_phrases_templates.sql
mysql -u pacs_user -p pacs_portal < drizzle/0026_billing_cycles_payment.sql
mysql -u pacs_user -p pacs_portal < drizzle/0027_sch01_billing_visit_events_status_snapshot.sql
mysql -u pacs_user -p pacs_portal < drizzle/0028_prg03_units_drop_logo_url_duplicate.sql
```
