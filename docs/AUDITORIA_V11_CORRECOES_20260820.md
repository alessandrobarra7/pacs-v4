# Correções da Auditoria V11 — Catálogo Clínico-Financeiro

**Data:** 20/08/2026  
**Escopo:** correções de integridade financeira e imutabilidade clínica identificadas na Auditoria V11.

## Decisões implementadas

| Item auditado | Correção aplicada | Resultado esperado |
|---|---|---|
| Reprocessamento legado | O procedimento `reprocessBillingEvents` passou a excluir qualquer estudo que tenha seleção de legenda canônica. | Um estudo gerido pelo catálogo não pode receber `billing_visit_events`, inclusive enquanto aguarda as demais assinaturas. |
| Precificação no cadastro | Foram removidas as abas, estados, consultas e mutações financeiras inativas de `UserFormDialog`. | O cadastro de usuário mantém somente dados, permissões e vínculos de unidade; preços permanecem centralizados no módulo Financeiro. |
| Bloqueio da legenda | A seleção é bloqueada de forma condicional na primeira chamada posterior a uma assinatura. | A legenda canônica não pode ser alterada após a primeira assinatura, enquanto os eventos continuam dependentes de todas as assinaturas exigidas. |

> A guarda de reprocessamento usa a existência de `study_exam_legend_selections`, e não apenas a existência de eventos consolidados. Esta decisão evita que um estudo parcialmente assinado receba indevidamente um evento legado antes da consolidação do catálogo.

## Preservação da regra clínica-financeira

O bloqueio clínico e a criação financeira foram separados. A primeira assinatura grava `lockedAt` apenas quando o campo ainda está nulo. A criação em `billing_catalog_study_events` permanece posterior à verificação de que todos os documentos configurados para a legenda foram assinados ou revisados. Não houve alteração de esquema, migração de banco ou modificação de dados existentes.

## Validação no sandbox

Foram adicionadas regressões específicas para a exclusão do reprocessamento legado, remoção da precificação concorrente no cadastro e ordem correta entre bloqueio e consolidação. A validação completa foi aprovada com TypeScript sem erros, **59 arquivos de teste aprovados**, **315 testes aprovados**, **1 ignorado** e build de produção concluído.

## Condição de implantação

Estas correções exigem apenas atualização da aplicação na **VM1** após o commit correspondente estar publicado no GitHub. A **VM2** não requer comandos nem migrações para esta etapa. O botão **Reprocessar** somente poderá ser considerado apto ao uso em produção após a VM1 estar no commit desta correção e a validação pós-atualização concluir com HTTP local 200 e processo PM2 online.
