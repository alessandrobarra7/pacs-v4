# Auditoria Defensiva de Código — Evidências Iniciais

**Data:** 19/08/2026  
**Escopo inicial:** sessões, autorização de rotas clínicas e dependências de produção.  
**Estado:** achados em validação no sandbox; nenhuma alteração foi aplicada na VM1 nesta etapa.

## Achados confirmados

| Prioridade | Área | Evidência | Encaminhamento |
|---|---|---|---|
| P0 | Streaming DICOM | A rota SSE autenticava a sessão, mas não chamava a autorização por estudo antes de consultar cache ou iniciar C-GET. | **Corrigido no sandbox:** `assertDicomFileAccess(..., 'view_studies')` ocorre antes de qualquer acesso ao estudo. |
| P1 | Sessão OAuth | O callback OAuth emitia JWT e cookie com duração fixa de um ano, divergente da duração configurável usada no login local. | **Corrigido no sandbox:** JWT e cookie usam a duração central `SESSION_DURATION_HOURS`. |
| P1 | Metadados clínicos em lote | O status em lote de anamnese retornava presença de dados sem autorização por estudo. Áudio e anexos já filtravam por estudo autorizado. | **Corrigido no sandbox:** anamnese filtra por `view_anamnesis` na unidade real do estudo. |
| P1 | Readiness de laudo | As rotas individual e em lote aceitavam unidade informada pelo cliente sem confirmar acesso ao estudo. | **Corrigido no sandbox:** exigem `view_studies` e confirmam a unidade real de cada estudo. |
| P1 | Financeiro por unidade | Consultas de médicos, preços, ciclos e equipe aceitavam unidade do cliente sem aplicar a política financeira de forma uniforme. | **Corrigido no sandbox:** procedimentos sensíveis usam `assertCanAccessFinancialUnit`; equipe de unidade exige escopo autorizado; dashboards agregados respeitam as unidades do responsável logado. |
| P1 | Painel de responsável | Um responsável financeiro podia solicitar o identificador de outro responsável no painel detalhado. | **Corrigido no sandbox:** o identificador solicitado deve corresponder ao vínculo do usuário autenticado. |
| P1 | Layout de laudo | `layouts.getByUnit` retornava o layout de qualquer unidade a todo usuário autenticado. | **Corrigido no sandbox:** leitura exige `view_studies` na unidade solicitada. |
| P1 | Anotações Cornerstone | As rotas de leitura e gravação de anotações usavam o usuário como escopo de persistência, mas não confirmavam acesso ao estudo informado. | **Corrigido no sandbox:** ambas exigem `assertDicomFileAccess(..., 'view_studies')`. |
| Preventivo | Superfície legada | O módulo `storageProxy` não era registrado, mas continha uma rota sem autenticação explícita caso fosse reativada. | **Removido do sandbox** após confirmar que não possuía consumidores ativos. A rota financeira legada de criação direta de evento de cobrança, também sem consumidores, foi removida; a reconciliação administrativa legítima foi preservada. |
| P1 | Dependências | O inventário atualizado por `pnpm audit --prod --json` reportou 118 avisos: 10 baixos, 58 moderados e 50 altos, concentrados em cadeias de visualização DICOM e bibliotecas transitivas. | Classificação concluída; atualizações serão aplicadas por grupos compatíveis e validadas antes de produção. |

## Fonte de dependências

O inventário foi coletado pelo comando `pnpm audit --prod --json` no repositório do Portal, usando o banco de avisos do registro npm. Entre os caminhos de atualização sugeridos, aparecem `@aws-sdk/core`, `express`/`path-to-regexp`, `axios`, `archiver`, `streamdown`/`mermaid` e múltiplos componentes transitivos do ecossistema Cornerstone/vtk.js. O relatório completo local foi preservado apenas no ambiente de auditoria; esta documentação não inclui *lockfile*, segredos ou dados clínicos.

## Classificação de dependências atualizada

O resultado do inventário não deve ser interpretado como 118 vetores independentes de entrada no Portal. Há múltiplos avisos agrupados nas mesmas cadeias transitivas. A priorização abaixo considera a posição do pacote no fluxo do PACS, a exposição do processo e o risco de regressão clínica.

| Grupo | Estado efetivo observado | Impacto e prioridade | Próxima ação controlada |
|---|---|---|---|
| `express` → `path-to-regexp` | O Portal usa `path-to-regexp` 0.1.12 via Express 4.22.1. A versão 0.1.13 corrige ReDoS em rotas com múltiplos parâmetros no mesmo segmento. [4] | **P0 de dependência:** processo Node exposto pela aplicação. Embora as rotas atuais não usem o padrão exemplificado no aviso, a correção é de baixo risco e deve ser isolada. | Aplicar somente a resolução 0.1.13 em alteração de *lockfile* controlada, executar regressão de rotas e verificar novamente o inventário. |
| `streamdown` → `mermaid` | A resolução instalada é Mermaid 11.12.3. A faixa afetada inclui versões anteriores a 11.16.1 para o cenário de diagrama radar. [5] | **P1:** risco de indisponibilidade no navegador quando conteúdo não confiável alcança o renderizador. | Atualizar em ramo separado para uma versão compatível de Streamdown/Mermaid e testar renderização de Markdown, relatórios e páginas administrativas. |
| `@aws-sdk/client-s3` → `fast-xml-parser` | A árvore efetiva contém `fast-xml-parser` 5.3.6, versão indicada como corrigida no caso analisado pelo SDK. [6] | **Monitorar:** o aviso agregado ainda sugere atualizar `@aws-sdk/core`, mas o componente vulnerável do caminho observado já está corrigido. | Não forçar atualização ampla do SDK agora; confirmar novamente após a alteração pontual de `path-to-regexp`. |
| Cornerstone → vtk.js e ferramentas legadas | A maior concentração de avisos está no conjunto usado pelo visualizador DICOM, incluindo ferramentas de construção e bibliotecas transitivas. | **P1 de compatibilidade clínica:** atualização não deve ocorrer por *override* cego, pois pode alterar carregamento de workers, codecs ou renderização. | Planejar atualização do conjunto Cornerstone/vtk.js como lote próprio, com validação visual de imagens, cine, medições, exportação Horos e Assistente RadiAnt. |
| `archiver`, `axios`, `sanitize-html`, `dompurify` e demais transitivas | Há cadeias de atualização sugeridas; algumas já estão em versões diretas recentes e outras são dependências indiretas. | **P2:** dependem de análise por caminho e teste de ZIP, upload, sanitização e requisições HTTP. | Tratar após as correções P0/P1, sem combinar com mudanças do visualizador. |

Uma tentativa de atualização com comando genérico foi revertida integralmente no sandbox, porque ela promoveu diversas dependências não relacionadas. O repositório mantém o conjunto de versões previamente validado; nenhuma atualização de dependências foi incluída neste checkpoint de auditoria.

## Itens ainda em revisão

Os procedimentos prioritários que recebem `unitId` do cliente, sobretudo no módulo financeiro e de layout, foram revisados nesta rodada e tiveram os controles confirmados adicionados. A atualização de dependências continua deliberadamente separada: grande parte dos avisos de alta severidade pertence à árvore transitiva do visualizador DICOM e exige validação de visualização antes de produção.

## Validação da primeira rodada

Na primeira rodada, os testes direcionados e a suíte completa foram aprovados no sandbox: 38 arquivos Vitest, 248 testes aprovados e 1 integração MinIO ignorada. Após as correções de escopo financeiro, layout e remoção de rotas legadas, a regressão completa também foi aprovada: 39 arquivos Vitest, 253 testes aprovados e 1 integração MinIO ignorada. A verificação TypeScript não encontrou erro, e o *bundle* isolado do servidor concluiu com sucesso.

O build completo Vite do frontend foi encerrado pelo ambiente de sandbox durante a transformação do conjunto Cornerstone, mesmo após liberar memória e ampliar o tempo de execução. Isso é uma limitação do recurso disponível no sandbox, não uma falha TypeScript ou de testes detectada nesta rodada. A validação isolada posterior na VM1 concluiu o build do commit auditado `0af226d` com sucesso, preservando o processo de produção sem reinício. A atualização real da VM1 continua como etapa separada e controlada.

## Atualização controlada da VM1

Após a aprovação do build isolado, a atualização controlada foi executada na **VM1**. O diretório ativo avançou de `042b6e1` para `94e0a50` por *fast-forward*, usando o commit publicado no GitHub. O build de produção transformou 4.803 módulos e concluiu em 34,51 segundos; os artefatos `dist/public/index.html` e `dist/index.js` foram gerados com 367.349 e 538.774 bytes, respectivamente.

O processo `pacs-portal` foi reiniciado somente após a verificação dos artefatos, permaneceu **online** após 15 segundos e respondeu `HTTP_LOCAL=200`. A verificação dos registros não encontrou os erros-alvo de streaming DICOM, memória ou conexão. Os avisos Vite sobre módulos Node externalizados pelos codecs Cornerstone e sobre *chunk* acima de 500 KiB permaneceram não bloqueantes, devendo ser tratados como melhoria de desempenho separada.

## Revisão de mídia privada, upload e origem

As rotas de áudio e anexo validam o estudo antes de listar, enviar ou remover objetos; o upload limita tamanho, verifica a assinatura binária do tipo aceito e armazena anexos e áudios na VM3. A rota `/api/media/*` exige sessão, rejeita tentativa de *path traversal*, associa chaves de anexos e áudio ao estudo e aplica autorização antes de transmitir o objeto. Os laudos, logos de unidade, assinaturas e carimbos seguem controles específicos de unidade ou usuário.

O CORS permite somente as origens institucionais e locais de desenvolvimento explicitamente declaradas; as solicitações de origem diferente não recebem `Access-Control-Allow-Origin`. O CSP do aplicativo permanece desabilitado por compatibilidade com OHIF/Cornerstone, compensado parcialmente pelos cabeçalhos da borda Nginx já aplicados.

### Política clínica definida

Por decisão operacional registrada, o módulo de áudios e anexos é visível exclusivamente para os papéis `medico` e `operador`. O operador pode listar, abrir anexos e reproduzir áudios, mas não consegue enviar nem remover arquivos. O médico pode consultar, enviar e excluir **somente** os itens dos quais é autor. Os papéis `viewer`, administrativo, financeiro e demais perfis não recebem os controles na interface e são bloqueados pelas rotas do servidor.

Esta política foi aplicada tanto na interface quanto nas procedures de áudio e anexos. O servidor ainda confirma a autorização no estudo antes de cada operação, de forma que alterar a interface do navegador não amplia permissões. A validação completa posterior aprovou 41 arquivos Vitest, 257 testes e uma integração MinIO deliberadamente ignorada; a verificação TypeScript não encontrou erro.

### Validação e atualização da VM1

O commit `50fe25b`, que contém a política clínica de mídia, foi compilado inicialmente em um *worktree* isolado na VM1. A compilação gerou `dist/public/index.html` com 367.349 bytes e `dist/index.js` com 540.429 bytes, enquanto o processo de produção permaneceu online e sem reinício.

Após autorização explícita, a atualização controlada foi aplicada na VM1. O PM2 reiniciou somente depois da compilação concluída, permaneceu online após 15 segundos e o Portal respondeu `HTTP_LOCAL=200`. A checagem de registros não encontrou erros-alvo de streaming, memória, conexão ou bloqueio de papel inesperado. A VM1 está no commit `50fe25b`.

## Referências de avisos selecionados

- [1] [Babel runtime — GHSA-968p-4wvh-cqc8](https://github.com/advisories/GHSA-968p-4wvh-cqc8)
- [2] [js-yaml — GHSA-mh29-5h37-fv8m](https://github.com/advisories/GHSA-mh29-5h37-fv8m)
- [3] [minimatch — GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74)
- [4] [Express — March 2026 Security Releases](https://expressjs.com/en/blog/2026-03-30-security-releases/)
- [5] [Mermaid — GHSA-rhh3-jpg6-66xh](https://github.com/mermaid-js/mermaid/security/advisories/GHSA-rhh3-jpg6-66xh)
- [6] [AWS SDK for JavaScript v3 — issue #7743](https://github.com/aws/aws-sdk-js-v3/issues/7743)
