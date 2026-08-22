# Auditoria de Conversão do Teste do Painel Financeiro

**Data:** 22 de agosto de 2026
**Escopo:** Regressão de interface do Financeiro v2
**Motivação:** Tornar executável a proteção contra divergência entre o período selecionado no painel e a data usada pela trilha auditável.

## Achado confirmado

O arquivo anterior `server/finance-v2-dashboard.test.ts` verificava a presença de trechos de código-fonte por leitura de arquivo. Esse formato conseguia sinalizar alterações textuais, mas não montava o componente React, não executava a transição de estado do modal e não observava a entrada recebida pela consulta auditável.

O comportamento corrigido no produto estava correto, mas sua proteção específica não era comportamental. Portanto, o item de registro anterior que tratava a cobertura de painel como totalmente convertida era impreciso para este arquivo.

## Conversão aplicada

O teste foi convertido para `server/finance-v2-dashboard.test.tsx` e usa `react-test-renderer` para montar o componente real `FinanceDashboard`. As fronteiras externas são controladas por dublês de teste para autenticação, roteamento, componentes visuais e consultas tRPC; a lógica de estado, a composição React e o acionamento do botão permanecem reais.

| Cenário | Evidência observável |
|---|---|
| Detalhe da unidade | O componente montado exibe a unidade e as métricas retornadas pela consulta financeira, sem as métricas removidas. |
| Abertura do log | O clique real no botão `Ver log do ciclo` muda a consulta auditável para habilitada. |
| Paridade de referência | A entrada `reference_date` da consulta auditável é exatamente igual à entrada usada por `unitSummary` para o mesmo detalhe de unidade. |

## Limites intencionais

O teste não acessa banco, API HTTP ou navegador real. A responsabilidade dele é garantir o contrato de interface entre o mês selecionado pelo painel e a consulta tRPC do log. A igualdade entre o contador financeiro e a quantidade de eventos retornados pelo servidor permanece coberta separadamente por `server/finance-audit-parity.test.ts`.

## Validação

A conversão foi validada por TypeScript, regressões financeiras focadas, suíte completa de Vitest e build de produção. Não há migração de banco, alteração de preços, baixa, evento financeiro ou regra clínica nesta mudança.
