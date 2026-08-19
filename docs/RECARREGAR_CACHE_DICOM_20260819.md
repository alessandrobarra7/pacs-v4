# Recarga Segura de Cache DICOM por Estudo

## Finalidade

O visualizador DICOM passou a disponibilizar o botão **Recarregar PACS**. A função permite ao usuário solicitar novamente ao PACS somente as imagens do estudo que está aberto, quando houver necessidade de atualizar o cache local do Portal. Não há limpeza global de cache e nenhum outro exame em uso é afetado.

## Fluxo operacional

| Etapa | Comportamento | Proteção aplicada |
|---|---|---|
| Confirmação | O Portal exibe uma confirmação explícita antes de iniciar a operação. | Evita remoção acidental do cache do estudo aberto. |
| Invalidação | O navegador chama `DELETE /api/dicom-files/:studyUid` exclusivamente para o `studyUid` exibido. | A rota valida o formato do identificador e exige `assertDicomFileAccess`. |
| Falha de autorização ou rede | A operação é interrompida e o visualizador atual permanece disponível. | A destruição do engine ocorre somente depois de resposta bem-sucedida da invalidação. |
| Reinicialização | Após a invalidação, o engine e os estados locais são reinicializados e o streaming SSE é iniciado novamente. | Impede que imagens anteriores sejam reutilizadas como se fossem atuais. |
| Restrição durante download | O botão permanece indisponível enquanto o download inicial ou em segundo plano está ativo. | Evita concorrência entre o streaming em andamento e a limpeza do mesmo estudo. |

## Isolamento e autorização

> A capacidade de visualizar um estudo não equivale à autorização irrestrita para manipular arquivos no servidor. A recarga utiliza a mesma verificação de acesso por estudo aplicada aos fluxos DICOM sensíveis.

A solicitação é limitada ao estudo aberto pelo `studyUid` presente na rota da página. No servidor, a rota de exclusão de cache exige autenticação e verifica `view_studies` na unidade efetiva do estudo antes de remover arquivos ou invalidar a ordenação em cache. Assim, uma tentativa de alterar manualmente o identificador na URL não deve autorizar a invalidação de estudo de outra unidade.

## Evidências de validação no sandbox

| Verificação | Resultado |
|---|---|
| Regressões de streaming e isolamento DICOM | **32 testes aprovados** em `dicom-streaming.test.ts` e `dicom-isolation.test.ts`. |
| Regressão completa | **42 arquivos, 261 testes aprovados e 1 ignorado**. |
| TypeScript | `tsc --noEmit` concluído sem erros. |
| Bundle isolado do servidor | `server/_core/index.ts` compilado com sucesso; `index.js` com 540.692 bytes. |
| Build completo do frontend no sandbox | Não concluído: o processo foi encerrado por limitação de memória durante a renderização de chunks. Isto não autoriza atualização da VM1. |

## Condição para atualização em produção

A atualização permanece bloqueada até a **VM1** executar, em worktree temporário e sem reiniciar o serviço ativo, a instalação com lockfile congelado e o build completo de produção. Somente após essa validação será apropriado realizar a atualização controlada do Portal e reiniciar o processo do PM2.
