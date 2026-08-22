# Implementação: nova ocorrência de cobrança após cancelamento auditável

**Data:** 22/08/2026  
**Escopo:** laudos de catálogo, eventos financeiros e resumo por unidade.

## Decisão de negócio aplicada

O cancelamento de um laudo assinado ou retificado continua restrito ao `admin_master`. Ele preserva o laudo e a auditoria, altera o estado clínico para `cancelled` e cancela os eventos financeiros ativos relacionados. A retificação continua sendo um fluxo separado: preserva a cobrança existente e não cria uma nova.

Quando um novo laudo é iniciado e assinado após esse cancelamento, o sistema cria uma **nova ocorrência clínica e financeira**. O laudo e os eventos cancelados anteriores não são reativados, apagados ou modificados.

| Ação | Resultado financeiro |
|---|---|
| Assinatura inicial completa | Cria a ocorrência `1` e seus eventos configurados. |
| Retificação do mesmo laudo | Mantém a ocorrência e os eventos existentes. |
| Cancelamento pelo `admin_master` | Mantém o histórico e marca os eventos ativos da ocorrência como `cancelled`. |
| Nova laudagem completa após cancelamento | Cria ocorrência `2` e novos eventos, com novo snapshot de preços. |
| Reimpressão, consulta ou visualização | Não cria ocorrência nem evento. |

## Alterações técnicas

A migração aditiva `0057_catalog_billing_occurrences.sql` introduz `billing_occurrence` em `reports` e em `billing_catalog_study_events`. A chave de unicidade dos laudos passa a incluir a ocorrência, e a dos eventos passa a ser `study_selection_id + billing_occurrence + event_index`.

Cada novo evento registra também `source_report_id`, isto é, o laudo cuja assinatura final disparou a geração daquele conjunto de eventos. Assim, ocorrências sucessivas podem ser auditadas sem confundir a cobrança cancelada com a cobrança da nova laudagem.

`createCatalogEventsWhenComplete` agora exige que todos os documentos obrigatórios estejam assinados dentro da **mesma ocorrência**. A existência de evento ativo só bloqueia duplicidade naquela ocorrência; eventos cancelados de ocorrência anterior não impedem a cobrança nova.

No editor, um laudo cancelado é imutável. Em vez de reativá-lo, o usuário autorizado encontra a ação **Nova laudagem**, que inicia um novo rascunho com uma ocorrência incrementada. A regra de cancelamento existente não foi revertida.

## Correção de apresentação

O subtítulo de **Soma para o sistema** passou de “Taxa LAUDS × eventos do ciclo” para **“Soma dos valores registrados nos eventos do ciclo”**. A alteração evita sugerir aplicação retroativa da taxa vigente quando um evento histórico não contém `system_amount_due` congelado.

## Migração e segurança

A migração 0057 foi aplicada apenas ao banco de desenvolvimento. Ela é estrutural: não atualiza, recria, precifica, cancela ou dá baixa em eventos existentes. Antes de qualquer aplicação na VM2, será obrigatório diagnóstico de índices/colunas, backup lógico e comparação preservando os eventos históricos.

## Regressões executadas

As regressões cobrem o cancelamento auditável existente, a criação de ocorrência `2` no catálogo, a captura de `source_report_id` e da ocorrência no evento, a precificação de catálogo e a legenda correta do resumo financeiro.
