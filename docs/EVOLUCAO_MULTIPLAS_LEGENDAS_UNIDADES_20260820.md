# Evolução do Catálogo Clínico-Financeiro: Composição de Legendas e Unidades

**Data:** 20 de agosto de 2026  
**Status:** Implementado e validado no sandbox; **não aplicado na VM2 nem na VM1 de produção**.

## Objetivo aprovado

O Portal passa a aceitar uma **composição de várias legendas canônicas no mesmo estudo**. Cada legenda conserva a sua identidade clínica e financeira. Portanto, selecionar `CRÂNIO` e `TÓRAX` produz dois fluxos independentes de laudo e de evento, enquanto uma legenda administrativa única chamada, por exemplo, `CRÂNIO + TÓRAX`, continua obedecendo à quantidade de documentos e eventos definida especificamente nela.

| Situação | Laudos | Eventos financeiros |
|---|---:|---:|
| Duas legendas independentes selecionadas | Os documentos de cada legenda são separados | Eventos de cada legenda são separados e somados no extrato da unidade |
| Uma única legenda composta | Conforme os documentos configurados no catálogo | Conforme `financial_event_count` daquela legenda |
| Uma legenda após primeira assinatura | A legenda e seus documentos ficam preservados | Os eventos dela só surgem depois de todas as assinaturas exigidas |

## Garantias implementadas

Cada seleção agora é identificada por **estudo, unidade e legenda**, eliminando a antiga limitação de uma única legenda por estudo. Os documentos gerados para novas seleções recebem uma chave técnica exclusiva da legenda, o que impede colisão quando duas legendas distintas possuem um documento chamado `primary`.

O modal da página PACS permite marcar várias legendas e confirmar a composição em uma única ação auditável. Ao abrir o laudo, o médico recebe uma opção para cada documento de cada legenda, identificada pelo nome da legenda e do documento. Assim, dois exames não são unidos em um único laudo por engano.

O bloqueio é individual. A primeira assinatura de um documento bloqueia apenas a legenda proprietária daquele documento. A consolidação financeira continua aguardando todas as assinaturas obrigatórias daquela mesma legenda. O extrato financeiro do médico também passa a incluir os eventos do catálogo, com origem, legenda, unidade, valor aplicado e estado de precificação separados dos eventos legados.

## Disponibilidade por unidade

O cadastro administrativo da legenda contém a seção **Disponibilidade por unidade**. Uma legenda nova começa autorizada para todas as unidades. O administrador raiz pode desativar unidades específicas; a legenda deixa de aparecer apenas no modal clínico dessas unidades. A ausência de uma regra de bloqueio significa disponibilidade global, inclusive para unidades novas criadas no futuro.

Não são apagados preços, eventos, laudos ou seleções históricas quando uma unidade é desmarcada. Seleções já bloqueadas continuam preservadas, mesmo que a legenda seja posteriormente ocultada para novos usos naquela unidade.

## Migração 0051

O arquivo `drizzle/0051_multi_legend_selection_unit_availability.sql` realiza somente duas mudanças estruturais:

1. Substitui o índice único de `(study_instance_uid, unit_id)` por `(study_instance_uid, unit_id, exam_legend_id)` em `study_exam_legend_selections`.
2. Cria `exam_legend_unit_availability` para registrar apenas exceções de indisponibilidade por unidade.

> A migração não altera nem remove registros clínicos, eventos financeiros, preços, laudos ou seleções existentes. O `DROP INDEX` é necessário somente para ampliar a chave única; por isso a aplicação deve ocorrer após backup consistente e antes da atualização da VM1.

## Ordem obrigatória de implantação

| Ordem | Ambiente | Ação |
|---:|---|---|
| 1 | VM2 | Executar diagnóstico de índice e backup consistente do banco `pacs_portal`. |
| 2 | VM2 | Aplicar a migração 0051 e confirmar a chave composta e a nova tabela. |
| 3 | VM1 | Atualizar o código somente para o commit que contém a migração e o fluxo de composição. |
| 4 | VM1 | Validar build isolado, reiniciar o serviço e conferir HTTP local e logs. |
| 5 | Portal | Validar uma composição controlada com duas legendas antes de liberar o uso rotineiro. |

Nenhuma mudança deve ser aplicada na VM1 antes de a VM2 concluir a migração com êxito. O botão de reprocessamento financeiro permanece sob a proteção entregue na Auditoria V11 e não deve ser usado como mecanismo de migração ou correção de eventos do catálogo.

## Validação no sandbox

A migração 0051 foi aplicada e conferida no banco do sandbox. A validação de código incluiu TypeScript sem erros, 60 arquivos Vitest aprovados, 320 testes aprovados, 1 ignorado e build de produção concluído.
