# Migrations — Documentação e Status

## Sequência registrada pelo Drizzle (0000–0029)

As migrations abaixo estão registradas no `_journal.json` e são reconhecidas pelo Drizzle Kit.

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
| `0029_ordinary_outlaw_kid.sql` | Campos de precificação por modalidade | ✅ |

## Reconciliação de Storage VM3 (0047)

O arquivo `0047_storage_vm3_reconciliation.sql` é uma migration SQL **idempotente e auditável** para o conjunto de objetos que foi criado inicialmente por DDL operacional: `study_audio_reports`, `study_attachments`, os índices `idx_study_audio_uid` e `idx_study_attachments_uid`, e as colunas `reports.export_file_key` e `reports.export_file_url`.

Ele pode ser aplicado com segurança após backup no banco da VM2 tanto em bancos novos quanto no banco de produção já regularizado: tabelas existentes não são recriadas e as duas colunas em `reports` só são acrescentadas quando ausentes. A migration não inclui dados clínicos, credenciais nem comandos destrutivos.

> **Transparência de histórico:** o `_journal.json` ainda termina em `0029`. Os arquivos `0030` a `0047` são rastreáveis no Git, mas não devem ser declarados como executados automaticamente pelo Drizzle até uma futura normalização integral de snapshots e journal. A aplicação da `0047` deve ser registrada no procedimento operacional da VM2.

## Arquivos Legados com Prefixo `manual_` (SCH-02)

Estes arquivos foram criados antes do padrão atual e **não estão no `_journal.json`**.
O conteúdo deles já está coberto pelas migrations oficiais acima ou pelo schema Drizzle.

| Arquivo | Conteúdo | Situação |
|---------|----------|----------|
| `manual_0007_add_anamnesis.sql` | Tabela `anamnesis` | Coberta por `0007_normal_kang.sql` |
| `manual_0017_wooden_hercules.sql` | Tabela `exam_catalog` (legada, não existe no schema atual) | Obsoleto — tabela removida |
| `manual_0022_reestruturacao_intuitiva.sql` | Tabelas `unit_doctor_scales`, `unit_doctor_compensation_rules`, `contract_revenues`, `contract_custom_expenses` | Coberta por `0022_mysterious_hitman.sql` |

> **Ação recomendada:** mover estes 3 arquivos para `drizzle/archive/` para evitar confusão.
> Não devem ser aplicados em novos ambientes — usar apenas a sequência registrada pelo Drizzle e as migrations de reconciliação explicitamente documentadas.

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
