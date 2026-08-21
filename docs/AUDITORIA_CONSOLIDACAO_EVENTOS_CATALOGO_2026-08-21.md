# Auditoria — Consolidação dos Eventos Financeiros de Catálogo

**Data de referência:** 21 de agosto de 2026.  
**Escopo:** fluxo de assinatura, criação de eventos financeiros, aplicação de preços e métricas exibidas pelo Financeiro v2.

## Evidência do diagnóstico em produção

O laudo **ABDOMEN TOTAL** da unidade 20, assinado em 21 de agosto de 2026 às 20:05:37, produziu corretamente um registro em `billing_catalog_study_events`. O evento foi criado sob a seleção de legenda 2, com um evento esperado e um evento efetivamente persistido. Portanto, a assinatura não deixou de gerar o fato financeiro.

| Camada | Comportamento identificado | Efeito observado |
|---|---|---|
| Assinatura clínica | Chama `createCatalogEventsWhenComplete` e evita o fluxo legado quando a seleção de catálogo é reconhecida. | Evento de catálogo criado após a assinatura exigida. |
| Precificação anterior | Consultava `billing_doctor_exam_legend_prices`. | Evento novo ficava `pending_doctor_price`, apesar da regra aprovada ser por modalidade. |
| Painel Financeiro v2 | Agregava somente `billing_visit_events`. | Evento de catálogo existente não aparecia em eventos, soma do sistema nem total médico. |

## Correção implementada no sandbox

A função de catálogo passa a usar a regra financeira aprovada, na ordem abaixo, para a mesma unidade, médico, modalidade e instante de assinatura.

| Prioridade | Fonte | Resultado no evento |
|---|---|---|
| 1 | `billing_doctor_modality_prices` | Usa o valor individual vigente e registra `doctor_price_source = doctor_modality`. |
| 2 | `billing_unit_modality_prices` | Usa o valor padrão vigente da unidade e registra `doctor_price_source = unit_modality_fallback`. |
| 3 | Ausência das duas configurações | Mantém o evento criado, com valor nulo e status pendente para auditoria. |

A taxa LAUDS vigente é capturada de `billing_system_unit_prices` no mesmo instante. Cada evento de catálogo novo preserva modalidade, preço médico aplicado, fonte do preço, taxa LAUDS e soma devida ao sistema. Esses snapshots impedem que uma alteração futura de tabela reescreva a competência já registrada.

## Consolidação de métricas

As consultas `unitSummary` e `doctorSummaryByUnit` somam os dois conjuntos de eventos de forma separada antes da apresentação: eventos legados de `billing_visit_events` e eventos de catálogo de `billing_catalog_study_events`. O fluxo de assinatura é mutuamente exclusivo para estudos com seleção canônica; assim, uma assinatura reconhecida pelo catálogo não cria um segundo `billing_visit_event`. Não foi executado reprocessamento nem alteração dos eventos históricos.

## Migração 0054

A migração `0054_finance_catalog_event_snapshots.sql` é aditiva. Ela acrescenta campos de snapshot à tabela de eventos de catálogo e amplia o enum de status de precificação. Os registros existentes permanecem íntegros e podem exibir campos de snapshot nulos ou vazios porque foram criados antes desta regra. Não há deleção, alteração de relatórios, reprocessamento ou duplicação de eventos.

## Limites e validação operacional

O evento já registrado para ABDOMEN TOTAL permanece como histórico pendente e não deve ser recalculado automaticamente. Depois da publicação, a validação operacional deve consistir em configurar uma modalidade na unidade, assinar um novo estudo de catálogo com essa modalidade e confirmar: um evento novo, um preço médico individual ou fallback da unidade, uma taxa LAUDS registrada e a inclusão do evento nos cartões e no total do médico.
