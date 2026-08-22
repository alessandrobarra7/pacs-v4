# Prévia somente leitura do cancelamento em cascata

**Data:** 22/08/2026  
**Escopo:** transparência para `admin_master` antes de cancelar laudo assinado ou retificado em exame composto.  
**Alteração de dados:** nenhuma durante a prévia.  
**Migração:** não necessária.

## Decisão

> A prévia é estritamente de leitura. Ela não altera laudo, evento, versão, auditoria, preço, baixa ou estado clínico.

O cancelamento em cascata já era aplicado corretamente pelo servidor para preservar a consistência de uma seleção composta. Esta etapa adiciona informação antecipada à decisão administrativa: antes de confirmar, o administrador vê todos os laudos ainda assinados/retificados que serão atingidos e a quantidade de eventos financeiros ativos vinculados.

## Implementação

| Componente | Alteração |
|---|---|
| `reports.cancelPreview` | Nova consulta protegida e somente leitura. Reutiliza os critérios de seleção do cancelamento em cascata, retorna documentos, status, assinatura, médico e contagem de eventos legado/catálogo ativos. |
| Permissão | A prévia de laudo assinado é exclusiva de `admin_master` e ainda exige `edit_reports` na unidade. |
| Modal do editor | Mostra a prévia, lista os documentos afetados, identifica o laudo originalmente selecionado e exige uma caixa de confirmação explícita. |
| Mutação existente | Continua sendo a única operação que cancela registros. Ela recalcula seus próprios alvos dentro de transação; não confia nos dados da prévia. |

## Critérios de bloqueio

O botão de confirmação fica desabilitado enquanto a prévia estiver carregando, se a prévia falhar ou enquanto o administrador não declarar que leu os impactos. O motivo de cancelamento obrigatório permanece inalterado.

## Validação

Foi adicionada regressão comportamental que chama `reports.cancelPreview` para um exame composto e confirma os dois documentos, os médicos assinantes e os eventos afetados sem disponibilizar transação de banco à consulta.

Validações aprovadas no sandbox:

- `pnpm check`;
- regressões focadas: 4 arquivos, 17 testes aprovados;
- suíte completa: 77 arquivos, 363 testes aprovados e 1 ignorado;
- build de produção concluído.

## Limites

Esta alteração não cancela eventos por si só, não reativa eventos históricos e não modifica as regras de baixa ou preço. A atualização produtiva requer apenas código na VM1.
