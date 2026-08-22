# Correção de Integridade do Log Financeiro

**Data:** 22 de agosto de 2026
**Escopo:** Financeiro v2, resumo por unidade e log auditável por ciclo.

## Contexto do incidente

Na unidade Hospital da Criança, o indicador financeiro exibiu dois eventos no ciclo de 24/07 a 24/08, enquanto o modal do log auditável não exibiu linhas. A reconciliação somente leitura da VM2 confirmou que os dois eventos de catálogo existiam, estavam dentro do ciclo e possuíam vínculos de seleção clínica válidos. O problema não justificava reprocessamento, exclusão ou recriação dos eventos.

## Correção aplicada

O router financeiro passou a usar `listUnitCycleFinancialEvents` como fonte única para os eventos do ciclo. O `unitSummary` deriva contador, valores e estados de baixa da lista retornada por esse resolvedor; `auditEventsByUnit` retorna exatamente a mesma lista para a tabela auditável. Dessa forma, não existem mais duas consultas independentes que possam formar conjuntos diferentes de eventos para o mesmo ciclo.

O fluxo de catálogo passou a usar `LEFT JOIN` para `study_exam_legend_selections`. Caso uma seleção clínica ou o estudo associado esteja indisponível, o evento financeiro continua sendo retornado com seus snapshots de preço, assinatura, médico e legenda. A interface exibe os campos clínicos ausentes como indisponíveis, sem omitir a obrigação financeira.

O componente `AuditTrailLauncher` agora trata `isError` e `error` da consulta tRPC. Uma falha deixa de ser apresentada como “Não há eventos no ciclo consultado”; o modal informa a falha e oferece uma ação de nova tentativa.

## Cobertura de regressão

| Arquivo | Proteção exercitada |
|---|---|
| `server/finance-unit-summary-behavior.test.ts` | O resumo deriva a contagem, valores e baixas da lista de eventos do ciclo. |
| `server/finance-audit-parity.test.ts` | A quantidade de linhas do log é igual à contagem unificada do resumo. |
| `server/finance-audit-orphan-event.test.ts` | Um evento de catálogo sem seleção clínica retornada permanece visível no log. |
| `server/finance-v2-dashboard.test.tsx` | A falha da consulta é mostrada explicitamente e o usuário pode tentar novamente. |

## Validação realizada no sandbox

TypeScript foi validado sem erros. As regressões financeiras focadas foram aprovadas. A suíte completa executou 74 arquivos de teste, com 353 testes aprovados e 1 ignorado. O build de produção foi concluído. Não há migração, alteração de esquema, reprocessamento ou mudança dos eventos existentes da VM2 nesta correção.

## Próxima etapa obrigatória

A atualização da VM1 somente poderá ocorrer após a publicação versionada desta correção e deverá validar em worktree isolada os testes financeiros, a tipagem e o build. Após a atualização, a unidade Hospital da Criança deve mostrar duas linhas no log do ciclo, correspondentes aos eventos já confirmados na VM2.
