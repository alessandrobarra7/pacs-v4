# Cancelamento Auditável de Laudo e Evento Financeiro

**Data:** 22 de agosto de 2026
**Motivação:** Impedir que a exclusão de um laudo assinado deixe evento financeiro ativo sem lastro clínico verificável.

## Regra implementada

Laudos em rascunho continuam removíveis fisicamente. Laudos assinados ou retificados passam a ser cancelados, jamais apagados. O cancelamento exige motivo e é exclusivo do `admin_master`.

Em uma única transação, o sistema preserva uma versão do laudo, muda seu estado para `cancelled`, cancela eventos legados associados ao `report_id`, cancela eventos de catálogo ligados à seleção que contém o documento e registra a ação `CANCEL_REPORT` no `audit_log`.

Caso qualquer evento vinculado já tenha baixa de médico ou de sistema, o cancelamento é bloqueado. Nesse cenário, uma regularização financeira auditável deve ser implementada e autorizada separadamente.

## Dados e exibição financeira

| Registro | Tratamento após cancelamento |
|---|---|
| Laudo | Permanece persistido com status `cancelled`; não pode ser editado, assinado novamente ou apagado fisicamente. |
| Evento legado | `financial_status = cancelled`; não integra totais ou baixas. |
| Evento de catálogo | Recebe status, data, usuário, motivo e `report_id` de cancelamento; não integra totais, cobranças ou repasses. |
| Log auditável | Mantém a linha com identificação visual de cancelamento e a indicação de que está fora dos totais. |

## Migração 0056

A migração aditiva `0056_finance_report_cancellation_audit.sql` amplia o enum de status de `reports`, adiciona a ação de auditoria `CANCEL_REPORT` e inclui os campos de cancelamento em `billing_catalog_study_events`. Ela foi aplicada apenas ao banco de desenvolvimento. A VM2 de produção não foi alterada por esta implementação.

## Regressões e validação

`server/reports.cancellation.test.ts` cobre o cancelamento transacional e o bloqueio quando houver baixa. `server/finance-unit-summary-behavior.test.ts` garante que eventos cancelados não entram em totais nem pendências. TypeScript, 75 arquivos Vitest, 356 testes aprovados, 1 ignorado e o build de produção foram concluídos no sandbox.

## Limite histórico

Os eventos históricos 1 e 2 da unidade Hospital da Criança continuam inalterados. Sua regularização requer uma ação administrativa explícita e auditável; a nova regra protege somente cancelamentos futuros após a migração de produção.
