# Auditoria — Log de Eventos Financeiros por Unidade

**Data de referência:** 21 de agosto de 2026.  
**Escopo:** explicação auditável dos eventos que compõem os indicadores do ciclo financeiro de cada unidade.

## Objetivo

O indicador **Eventos no ciclo** passou a poder ser conferido diretamente no detalhe da unidade. O botão **Ver log do ciclo**, localizado na seção de configuração financeira vigente, abre uma tabela auditável e pesquisável. O log não cria, recalcula, reprocessa ou altera eventos; ele somente expõe os fatos que já compõem o ciclo.

## Dados exibidos por evento

| Informação | Fonte do fluxo legado | Fonte do fluxo de catálogo |
|---|---|---|
| Paciente, estudo e data | `billing_visit_events` com `studies_cache` | `billing_catalog_study_events → study_exam_legend_selections → studies_cache` |
| Médico que laudou | `billing_visit_events.doctor_user_id → users` | `billing_catalog_study_events.doctor_user_id → users` |
| Modalidade e descrição | Snapshot do evento e cache do estudo | Snapshot do catálogo, legenda e cache do estudo |
| Valores e baixa | Valor médico, taxa LAUDS e datas de baixa do evento legado | Preço aplicado, valor do sistema e datas de baixa auditáveis do catálogo |
| Origem | `legacy` | `catalog` |

## Acesso e escopo

A consulta `financeSimple.auditEventsByUnit` aplica o mesmo escopo financeiro por unidade já utilizado no módulo. `admin_master` pode consultar as unidades; `unit_admin` e `responsavel_financeiro` recebem somente as unidades vinculadas. O cliente não recebe nem calcula eventos fora desse escopo.

## Validação

O teste comportamental `finance-audit-trail.test.ts` chama o procedimento real com adaptador de banco controlado e confirma a presença de paciente, estudo, médico, data, origem, valores e estado de baixa para um evento legado e outro de catálogo. A trilha não exige migração de banco e permanece em sandbox até a publicação e a validação de produção.
