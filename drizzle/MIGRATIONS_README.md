# Migrations — Documentação e Status

## Sequência Oficial (0000–0028)

Todas as migrations abaixo estão registradas no `_journal.json` e são reconhecidas pelo Drizzle Kit.

| Arquivo | Conteúdo | Status |
|---------|----------|--------|
| `0000_dapper_pixie.sql` | Schema inicial | ✅ |
| `0001_public_molecule_man.sql` | ... | ✅ |
| ... | ... | ✅ |
| `0022_mysterious_hitman.sql` | Módulo financeiro base | ✅ |
| `0023_sla_readiness.sql` | Tabelas `report_readiness`, `unit_report_sla_configs` | ✅ |
| `0024_exam_legends.sql` | Tabela `exam_legends` | ✅ |
| `0025_seed_phrases_templates.sql` | Seed de frases e templates globais | ✅ |
| `0026_billing_cycles_payment.sql` | Campos `paid_status`, `paid_at`, `paid_by_user_id`, `paid_note` em `billing_cycles` | ✅ |
| `0027_sch01_billing_visit_events_status_snapshot.sql` | Campo `report_status_snapshot` em `billing_visit_events` | ✅ |
| `0028_prg03_units_drop_logo_url_duplicate.sql` | DROP COLUMN `logoUrl` duplicada em `units` | ✅ |

## Arquivos Legados com Prefixo `manual_` (SCH-02)

Estes arquivos foram criados antes do padrão atual e **não estão no `_journal.json`**.
O conteúdo deles já está coberto pelas migrations oficiais acima ou pelo schema Drizzle.

| Arquivo | Conteúdo | Situação |
|---------|----------|----------|
| `manual_0007_add_anamnesis.sql` | Tabela `anamnesis` | Coberta por `0007_normal_kang.sql` |
| `manual_0017_wooden_hercules.sql` | Tabela `exam_catalog` (legada, não existe no schema atual) | Obsoleto — tabela removida |
| `manual_0022_reestruturacao_intuitiva.sql` | Tabelas `unit_doctor_scales`, `unit_doctor_compensation_rules`, `contract_revenues`, `contract_custom_expenses` | Coberta por `0022_mysterious_hitman.sql` |

> **Ação recomendada:** mover estes 3 arquivos para `drizzle/archive/` para evitar confusão.
> Não devem ser aplicados em novos ambientes — usar apenas a sequência oficial 0000–0028.

## Para Novos Ambientes

Aplicar as migrations em ordem usando o script abaixo (executar na VM1 com acesso ao banco da VM2):

```bash
cd /var/www/pacs-portal
for f in drizzle/0{000..028}_*.sql; do
  mysql -h 172.16.3.101 -u pacs_user -p'SENHA' pacs_portal < "$f"
done
```

Ou aplicar individualmente:

```bash
mysql -h 172.16.3.101 -u pacs_user -p'SENHA' pacs_portal < drizzle/0023_sla_readiness.sql
mysql -h 172.16.3.101 -u pacs_user -p'SENHA' pacs_portal < drizzle/0024_exam_legends.sql
mysql -h 172.16.3.101 -u pacs_user -p'SENHA' pacs_portal < drizzle/0025_seed_phrases_templates.sql
mysql -h 172.16.3.101 -u pacs_user -p'SENHA' pacs_portal < drizzle/0026_billing_cycles_payment.sql
mysql -h 172.16.3.101 -u pacs_user -p'SENHA' pacs_portal < drizzle/0027_sch01_billing_visit_events_status_snapshot.sql
mysql -h 172.16.3.101 -u pacs_user -p'SENHA' pacs_portal < drizzle/0028_prg03_units_drop_logo_url_duplicate.sql
```

> **Atenção:** os arquivos `manual_*` **não devem ser aplicados** em novos ambientes.
