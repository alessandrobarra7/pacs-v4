# Auditoria de Paridade entre Indicadores e Log Financeiro

**Data:** 22 de agosto de 2026
**Escopo:** Financeiro v2 por unidade
**Natureza:** Correção somente de leitura e de referência temporal. Não altera eventos, valores, baixas ou vigências.

## Achado

Na tela de detalhe da unidade, o indicador **Eventos no ciclo** era calculado a partir da referência mensal selecionada no painel. Porém, o botão **Ver log do ciclo** recebia uma nova data correspondente ao instante do clique. Assim, ao consultar um mês diferente do mês corrente, o resumo e o log podiam representar ciclos distintos.

> O contrato do módulo é que cada linha do log representa um evento que já compõe os indicadores exibidos para a mesma unidade e o mesmo ciclo.

| Área | Antes da correção | Depois da correção |
|---|---|---|
| Referência do resumo | `monthReference(year, month)` | `monthReference(year, month)` |
| Referência do log | Data corrente no clique | A mesma referência mensal do resumo |
| Eventos legados | Filtra unidade, intervalo de assinatura e exclusão de cancelados | Mantido, com o mesmo ciclo do painel |
| Eventos de catálogo | Filtra unidade e intervalo de assinatura | Mantido, com o mesmo ciclo do painel |

## Causa raiz

`UnitFinancialDetail` calcula uma referência estável com base no mês selecionado. Essa referência já era usada por `unitSummary` e `doctorSummaryByUnit`. Entretanto, `UnitModalityPrices` criava a chamada do componente de log com `new Date().toISOString()`, rompendo a consistência temporal quando o usuário navegava por outro mês.

## Correção aplicada

`UnitModalityPrices` passou a receber `referenceDate` como propriedade. `UnitFinancialDetail` encaminha sua referência mensal para esse componente, que a repassa sem transformação a `AuditTrailLauncher`. A consulta `auditEventsByUnit` continua sendo somente leitura e mantém os filtros financeiros já equivalentes ao `unitSummary` para os fluxos legado e catálogo.

## Controles de regressão

Foram adicionados dois controles automatizados.

| Teste | Garantia |
|---|---|
| `server/finance-v2-dashboard.test.ts` | Confirma que a referência mensal é propagada do detalhe da unidade ao lançador do log e impede o retorno à data corrente no clique. |
| `server/finance-audit-parity.test.ts` | Simula um evento legado e um evento de catálogo no mesmo ciclo, exige contador unificado igual a 2 e exige duas linhas correspondentes no log. |

## Critério de aceite

Para qualquer unidade e mês selecionado, a quantidade de linhas não filtradas do log deve ser igual ao indicador **Eventos no ciclo**. A busca textual do modal pode reduzir apenas a quantidade visível de linhas, sem alterar a consulta original nem os indicadores.
