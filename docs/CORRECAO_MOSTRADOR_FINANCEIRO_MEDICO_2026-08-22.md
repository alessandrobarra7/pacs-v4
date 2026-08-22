# Correção do mostrador financeiro do médico

## Incidente

Foi observada divergência entre a worklist clínica e o mostrador financeiro exibido abaixo do cabeçalho: um laudo já assinado aparecia corretamente na lista clínica, mas o banner do médico informava zero assinaturas e valor zero no ciclo vigente.

## Diagnóstico somente leitura

O confronto sanitizado da unidade e do médico envolvidos confirmou um laudo assinado dentro do ciclo aberto, um evento financeiro de catálogo ativo com valor médico aplicado e nenhum evento legado dentro daquele mesmo ciclo. Um evento de catálogo cancelado permaneceu separado da contagem ativa, como esperado.

> Nenhum evento foi reativado, recriado, precificado, recalculado, baixado ou modificado durante o diagnóstico.

## Causa

O banner utilizava `getDoctorUnitFinancialInfo`, que somava apenas `billing_visit_events`, a fonte legada. Assinaturas pelo catálogo atual são registradas em `billing_catalog_study_events`; por isso a worklist clínica e o novo Financeiro reconheciam a assinatura, enquanto o banner antigo permanecia zerado.

## Correção

O helper passou a agregar as duas fontes dentro dos limites do ciclo aberto, considerando somente eventos ativos. Para a origem legada, cancelados e reversões são excluídos; para a origem de catálogo, cancelados são excluídos. Os valores exibidos são os valores já aplicados ao evento, sem consulta retroativa de preço vigente.

| Regra | Resultado |
|---|---|
| Evento legado ativo no ciclo | Entra na contagem e no valor do banner. |
| Evento de catálogo ativo no ciclo | Entra na mesma contagem e no mesmo valor do banner. |
| Evento cancelado ou revertido | Não entra no total, mas é preservado para auditoria. |
| Preço alterado após a assinatura | Não recalcula o valor já aplicado ao evento. |

## Validação

Foram adicionadas regressões para a soma de fontes legada e de catálogo e para agregados vazios. TypeScript, 81 arquivos Vitest (373 testes aprovados, 1 ignorado) e o build de produção foram concluídos antes da publicação. A entrega é somente de código; não requer migração de banco.
