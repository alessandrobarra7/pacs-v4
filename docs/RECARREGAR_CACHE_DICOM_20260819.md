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

## Evidência de validação isolada na VM1

Em **19/08/2026**, a validação foi executada na **VM1** por meio de um *worktree* temporário, sem alteração do diretório ativo do Portal e sem reinício do PM2.

| Verificação | Resultado |
|---|---|
| Commit candidato | **`1bc7d0e`** |
| Instalação | Lockfile congelado aprovado com pnpm 10.30.1. |
| Build Vite | **4.803 módulos transformados** e concluído em **35,84 s**. |
| Artefatos | `dist/public/index.html` com 367.349 bytes e `dist/index.js` com 540.692 bytes. |
| Serviço ativo | PM2 permaneceu online, sem reinício, com aproximadamente 196 MiB de memória. |

O Vite emitiu avisos conhecidos de módulos Node externalizados em codecs Cornerstone e de chunk principal acima de 500 kB. Como o build foi concluído e tais avisos não foram introduzidos por esta mudança, eles ficam registrados para acompanhamento de desempenho, sem bloquear a atualização deste recurso pontual.

## Condição para atualização em produção

A validação isolada obrigatória foi aprovada. A atualização controlada da **VM1** permanece uma etapa separada: exige autorização explícita, novo build no diretório ativo e reinício do PM2 somente depois que os artefatos forem validados.

## Atualização controlada da VM1

Em **19/08/2026**, a atualização controlada foi executada na **VM1**. A verificação de alterações rastreadas e de colisões com arquivos locais não versionados foi aprovada antes da compilação; os backups de ambiente, arquivos de diagnóstico e o áudio clínico existente foram preservados.

| Verificação pós-deploy | Resultado |
|---|---|
| Commit ativo | **`cbd5db0`** |
| Build no diretório ativo | Vite concluiu 4.803 módulos em **34,00 s**. |
| Artefatos | `dist/public/index.html` com 367.349 bytes e `dist/index.js` com 540.692 bytes. |
| PM2 | Reiniciado somente após o build; processo `pacs-portal` online após 15 segundos, com aproximadamente 184 MiB. |
| Saúde local | `HTTP_LOCAL=200`. |
| Registros-alvo | Nenhum erro de memória, conexão, streaming DICOMweb ou `global is not defined` identificado. |

O Portal em produção está, portanto, na versão que inclui a recarga autorizada e isolada de cache para o estudo aberto.
