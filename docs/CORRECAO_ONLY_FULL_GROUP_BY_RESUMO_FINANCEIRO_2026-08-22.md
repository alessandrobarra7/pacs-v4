# Correção de Compatibilidade SQL do Resumo Financeiro

**Data:** 22 de agosto de 2026

## Incidente

Após a atualização da correção de integridade financeira, o catálogo do Financeiro por unidade passou a exibir “Nenhuma unidade com eventos no ciclo”. A VM2 permaneceu íntegra: a unidade Hospital da Criança e os dois eventos financeiros continuaram persistidos.

A resposta tRPC capturada no navegador revelou erro SQL sob o modo MySQL `ONLY_FULL_GROUP_BY`. A fonte compartilhada de eventos havia introduzido junções clínicas no caminho usado pelo `unitSummary`. Esse caminho não precisa de paciente, estudo ou médico para calcular contador, valores e baixas, mas a junção passou a ativar uma incompatibilidade existente na base de produção.

## Correção aplicada

O resolvedor compartilhado passou a separar duas responsabilidades. Para o resumo, ele consulta exclusivamente os fatos financeiros legado e catálogo, sem junções clínicas. Para o log auditável, ele busca os eventos financeiros primeiro e recupera médico, seleção e estudo por consultas auxiliares separadas. Assim, o resumo permanece compatível com `ONLY_FULL_GROUP_BY` e o log mantém seus dados clínicos sem depender de uma junção que possa ocultar ou invalidar o evento financeiro.

## Garantias

| Cenário | Comportamento após a correção |
|---|---|
| Resumo da unidade | Usa somente eventos financeiros do ciclo, sem junções clínicas. |
| Log auditável | Enriquece os eventos com contexto clínico por consultas auxiliares. |
| Seleção ou estudo ausente | Preserva a linha financeira e informa campos clínicos indisponíveis. |
| Falha de consulta | A interface apresenta erro explícito e ação de nova tentativa. |

## Validação

Foi adicionada uma regressão que falha se o resumo financeiro voltar a executar junções clínicas. TypeScript, 74 arquivos de teste Vitest, 353 testes aprovados, build de produção e verificação de integridade do diff foram concluídos no sandbox. Não há migração, alteração de esquema, exclusão, reprocessamento ou modificação dos dois eventos existentes na VM2.
