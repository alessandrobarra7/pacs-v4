# Correção de Integridade da Tela de Pagamentos

**Data:** 22 de agosto de 2026
**Escopo:** Detalhe de eventos por médico usado para conferência e baixa de pagamentos.

## Achado corrigido

O procedimento `eventsByDoctorUnit` mantinha uma consulta própria para eventos de catálogo. Ela exigia a existência da seleção clínica por meio de `INNER JOIN`, o que podia ocultar um evento financeiro do detalhe de pagamentos quando o vínculo clínico estivesse indisponível. O modal `LaudosModal` também não distinguia falha da consulta de uma lista realmente vazia.

## Implementação

O detalhe de pagamentos passou a reutilizar `listUnitCycleFinancialEvents`, a mesma fonte de eventos que alimenta o resumo e o log auditável. A consulta agora filtra a lista por médico e por evento ativo, sem exigir seleção clínica ou estudo disponíveis. Se o contexto clínico não puder ser recuperado, os snapshots financeiros e a linha do evento continuam disponíveis para conferência.

O modal passou a tratar `isError` e `error` da consulta tRPC. Em caso de falha, apresenta mensagem explícita e o botão **Tentar novamente**; uma falha não é mais apresentada como “Nenhum laudo encontrado”. Eventos cancelados permanecem fora do detalhe de pagamentos e das mutações de baixa.

## Regressões

| Arquivo | Cenário protegido |
|---|---|
| `server/finance-payment-event-detail.test.ts` | Evento de catálogo sem seleção clínica continua presente no detalhe do médico. |
| `server/finance-payments-modal.test.tsx` | Erro da consulta é exibido e a nova tentativa chama o recarregamento. |
| `server/catalog-event-identification.test.ts` | Contexto clínico é enriquecido pela fonte única quando estiver disponível. |

## Validação

TypeScript foi validado sem erros. A suíte completa executou 77 arquivos de teste, com 358 testes aprovados e 1 ignorado. O build de produção foi concluído. Não há migração, alteração de esquema ou modificação de dados nesta correção.

## Nota de auditoria

A hipótese histórica sobre `ONLY_FULL_GROUP_BY` foi mantida como hipótese técnica. A separação entre a consulta financeira e o enriquecimento clínico é preservada por reduzir acoplamento e evitar filtros clínicos obrigatórios no caminho financeiro, independentemente da causa exata do erro anterior em produção.
