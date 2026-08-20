# Implantação do Catálogo Clínico-Financeiro — 20/08/2026

## Escopo implantado

Foi implantado o catálogo clínico-financeiro com seleção obrigatória de legenda canônica por estudo, documentos clínicos independentes, quantidade configurável de eventos financeiros e matriz de preço por **legenda, unidade, médico e início de ciclo**. A descrição recebida do PACS permanece somente como referência; ela não cria documentos nem eventos financeiros sem uma legenda canônica selecionada.

## Ordem e resultado da implantação

| Ambiente | Ação executada | Resultado validado |
|---|---|---|
| Sandbox | Migração 0050, testes e build | 54 arquivos Vitest aprovados, 299 testes aprovados e 1 ignorado; build de produção aprovado |
| VM2 — Banco | Backup consistente e migração aditiva 0050 | Backup comprimido validado; três tabelas criadas; coluna `exam_legends.financial_event_count` criada |
| GitHub | Publicação do código validado | Branch `main` disponível no commit `bb11b49` |
| VM1 — Portal | Build isolado, avanço fast-forward e reinício controlado | PM2 online, HTTP local 200 e nenhum erro-alvo encontrado nos logs |

## Banco de dados — VM2

O backup pré-migração foi criado em `/var/backups/pacs-portal/pacs_portal_before_0050_20260820T165348Z.sql.gz` e passou em `gzip -t`. A migração adicionou somente estruturas novas, sem remover ou alterar registros legados:

| Estrutura | Finalidade |
|---|---|
| `exam_legends.financial_event_count` | Quantidade de eventos financeiros liberados após todas as assinaturas exigidas |
| `study_exam_legend_selections` | Seleção auditável da legenda canônica e snapshots de documentos por estudo e unidade |
| `billing_doctor_exam_legend_prices` | Preço por evento isolado por legenda, unidade, médico e vigência |
| `billing_catalog_study_events` | Eventos consolidados criados somente após a conclusão dos documentos exigidos |

As tabelas novas iniciaram sem registros, como esperado. A alteração é aditiva e não reprocessa nem muda laudos, preços ou eventos históricos.

## Portal — VM1

O Portal foi atualizado de `af0d6f9` para `bb11b49`. Antes do avanço do código ativo, uma worktree isolada recebeu as dependências e concluiu o build. Após o reinício, o processo `pacs-portal` permaneceu online em modo fork, consumindo aproximadamente 195 MiB após estabilização, e `http://127.0.0.1:3000/` respondeu com HTTP 200.

Não foram encontrados os seguintes erros-alvo no recorte de logs pós-reinício: indisponibilidade de banco, coluna ou tabela ausente, falta de memória JavaScript, `ECONNRESET` ou `ECONNREFUSED`.

## Regra operacional pós-implantação

1. O administrador raiz cria a legenda canônica, seus documentos e a quantidade de eventos financeiros.
2. Operador, atendente, médico ou administrador raiz seleciona a legenda do estudo antes da geração de laudos.
3. A seleção fica bloqueada após a primeira assinatura.
4. Todos os documentos da legenda precisam estar assinados para os eventos do catálogo serem criados.
5. Sem preço específico vigente, a assinatura é permitida e o evento fica com status `pending_doctor_price`.
6. Administrador raiz e responsável financeiro autorizado configuram o preço por médico, unidade, legenda e ciclo, preservando o histórico de vigências anteriores.
