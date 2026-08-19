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
| P1 | Dependências | `pnpm audit --prod` reportou 119 vulnerabilidades: 10 baixas, 59 moderadas e 50 altas, concentradas em cadeias de visualização DICOM e bibliotecas transitivas. | Classificar por pacote, caminho de execução e atualização sem quebra clínica antes de atualizar dependências. |

## Fonte de dependências

O inventário foi coletado pelo comando `pnpm audit --prod --json` no repositório do Portal, usando o banco de avisos do registro npm. Entre os caminhos de atualização sugeridos, aparecem `@aws-sdk/core`, `express`/`path-to-regexp`, `axios`, `archiver`, `streamdown`/`mermaid` e múltiplos componentes transitivos do ecossistema Cornerstone/vtk.js. O relatório completo local foi preservado apenas no ambiente de auditoria; esta documentação não inclui *lockfile*, segredos ou dados clínicos.

## Itens ainda em revisão

O inventário identificou procedimentos adicionais que recebem `unitId` do cliente, sobretudo no módulo financeiro e de layout. Eles não devem ser alterados em massa durante a correção clínica atual: cada um precisa ser comparado à política de papel e unidade correspondente para evitar regressão administrativa. A atualização de dependências será tratada em lote separado, pois grande parte dos avisos de alta severidade pertence à árvore transitive do visualizador DICOM e exige validação de visualização antes de produção.

## Validação da primeira rodada

Os testes direcionados e a suíte completa foram aprovados no sandbox: 38 arquivos Vitest, 248 testes aprovados e 1 integração MinIO ignorada. A verificação TypeScript não encontrou erro, e o *bundle* isolado do servidor concluiu com sucesso.

O build completo Vite do frontend foi encerrado pelo ambiente de sandbox durante a transformação do conjunto Cornerstone, mesmo após liberar memória e ampliar o tempo de execução. Isso é uma limitação do recurso disponível no sandbox, não uma falha TypeScript ou de testes detectada nesta rodada. Por precaução, nenhuma atualização da VM1 está autorizada a partir deste checkpoint até que o build completo seja novamente validado em ambiente com recursos suficientes ou que a estratégia de compilação seja revisada.

## Referências de avisos selecionados

[1] [Babel runtime — GHSA-968p-4wvh-cqc8](https://github.com/advisories/GHSA-968p-4wvh-cqc8)  
[2] [js-yaml — GHSA-mh29-5h37-fv8m](https://github.com/advisories/GHSA-mh29-5h37-fv8m)  
[3] [minimatch — GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74)
