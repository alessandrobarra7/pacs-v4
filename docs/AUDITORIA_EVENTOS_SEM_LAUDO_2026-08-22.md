# Auditoria de Eventos Financeiros sem Laudo Persistido

**Data:** 22 de agosto de 2026

## Evidência coletada na VM2

Uma reconciliação somente leitura da unidade Hospital da Criança confirmou dois eventos de catálogo ativos, ambos sem baixa e sem qualquer linha correspondente na tabela `reports`.

| Evento | Seleção | Paciente | Laudo | Sequência confirmada |
|---|---:|---|---:|---|
| 1 | 5 | Antonia de Souza Batista | 49 | Criado e assinado às 09:02:40; excluído pelo Administrador às 09:02:49. |
| 2 | 2 | Lenilson dos Santos Vidal | 50 | Criado e assinado pela Dra. Claudia às 20:05:37; excluído pelo Administrador às 21:58:36. |

Os eventos permaneceram com `pricing_status = pending_doctor_price` e sem `doctor_received_at` ou `system_paid_at`. Assim, não houve baixa financeira, porém os eventos continuaram integrando o ciclo apesar da exclusão dos respectivos laudos.

## Causa confirmada

O fluxo de exclusão em `reports.delete` remove versões e o laudo físico após remover somente o evento legado por `report_id`. Eventos de catálogo são vinculados a `study_selection_id`, não a `report_id`; portanto, sobrevivem à exclusão de um laudo assinado. A rotina de criação de catálogo exige documentos assinados, mas não há cancelamento correspondente quando o documento é excluído posteriormente.

## Decisão aprovada

Laudos assinados com evento financeiro ativo deixarão de ser apagados fisicamente. O sistema passará a aplicar cancelamento auditável com motivo, usuário e data, cancelando os eventos de catálogo afetados e excluindo-os de totais, cobranças e repasses, sem apagar sua trilha do log. Rascunhos sem evento financeiro poderão continuar sendo excluídos.

Os eventos históricos 1 e 2 não serão alterados automaticamente. Qualquer correção histórica exigirá ação administrativa explícita e registro auditável separado.
