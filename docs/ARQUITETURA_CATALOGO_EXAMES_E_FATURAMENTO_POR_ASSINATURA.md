# Arquitetura do Catálogo de Exames e Faturamento por Assinatura

## Decisões confirmadas

O Portal passará a tratar a legenda do exame como uma regra operacional central, e não como texto livre por estudo ou por navegador. O **administrador raiz (`admin_master`)** será o único perfil capaz de criar exames disponíveis e mapear as descrições recebidas do PACS para uma legenda canônica. Quando não houver mapeamento, a interface exibirá a descrição original do PACS, sem inferir ou alterar o nome clínico.

Cada exame do catálogo poderá gerar um ou mais documentos de laudo independentes. Cada documento terá seu próprio rascunho, médico responsável, assinatura, histórico e evento financeiro. Um exame composto, como **Coluna Cervical + Dorsal + Lombar**, poderá gerar três documentos distintos; cada assinatura produzirá exatamente um evento financeiro.

| Elemento | Regra aprovada |
|---|---|
| Criação de exames e mapeamentos PACS | Exclusiva do `admin_master`. |
| Descrição sem mapeamento | Exibir o valor original recebido do PACS. |
| Exame composto | Um ou mais documentos de laudo, configurados individualmente no catálogo. |
| Assinatura | Cada documento assinado cria um evento financeiro próprio. |
| Preço aplicável | Valor vigente para **médico + unidade + modalidade**, congelado no evento no instante da assinatura. |
| Preço ausente | A assinatura clínica é permitida; o evento é registrado como pendente e sem valor. |
| Gestão de preços | `admin_master` para todas as unidades; responsável financeiro apenas nas unidades vinculadas. |
| Alteração de preço | Somente vigência futura, a partir do ciclo escolhido; nunca recalcula eventos históricos. |
| Visibilidade do médico | O médico consulta faturamento e pendências separados por unidade. |

## Limitações identificadas na estrutura atual

Atualmente, a tabela `reports` possui unicidade por `(study_instance_uid, unit_id)`, permitindo apenas um documento por estudo/unidade. O financeiro também possui uma regra de um evento por relatório assinado. A segunda regra é compatível com o modelo aprovado; a primeira deverá ser evoluída para permitir documentos independentes vinculados ao mesmo estudo.

O Portal já mantém preços por médico, unidade e modalidade com vigência, além de gravar valores aplicados nos eventos financeiros. A evolução deve reutilizar essa base, reforçando autorização por unidade e a apresentação de pendências, sem recalcular assinaturas passadas.

## Modelo de dados proposto

| Estrutura | Responsabilidade |
|---|---|
| `exam_catalog` | Exame canônico global, modalidade, status e metadados administrativos. |
| `exam_catalog_documents` | Definições dos documentos clínicos exigidos por exame, incluindo ordem e título de cada documento. |
| `exam_catalog_pacs_mappings` | Mapeamento explícito entre descrição recebida do PACS, modalidade e exame canônico. |
| `reports` evoluída | Documento independente por estudo/unidade/definição de documento, com snapshots do catálogo para auditoria. |
| `billing_visit_events` | Um evento por documento assinado, preservando preço, modalidade e legenda no instante da assinatura. |

## Regras de transição e auditoria

Nenhum laudo assinado, evento financeiro ou preço histórico será reescrito. Os valores já gravados permanecerão como snapshots auditáveis. As antigas legendas locais ou por estudo não serão usadas para inventar novos nomes; a descrição PACS original permanecerá como retorno seguro até que o `admin_master` crie um mapeamento explícito.

As alterações de preço deverão possuir início de vigência alinhado a um ciclo. Por exemplo, um preço de R$ 20,00 vigente em agosto continuará aplicado aos documentos assinados em agosto; um preço de R$ 30,00 iniciado no ciclo seguinte valerá somente para novas assinaturas nesse ciclo ou depois dele.

## Implementação no sandbox

A migração incremental `0048_exam_catalog_documents.sql` foi aplicada no ambiente de desenvolvimento sem remover tabelas, laudos ou eventos existentes. Ela acrescenta disponibilidade e autoria administrativa ao catálogo, mapeamentos PACS explícitos e definições de documentos, além de evoluir `reports` para diferenciar documentos pela chave clínica dentro do mesmo estudo e unidade.

| Entrega | Implementação |
|---|---|
| Catálogo central | Tela `/admin/exames`, protegida por `admin_master`, para manter exames canônicos, documentos ativos e mapeamentos PACS. |
| Legenda na lista | O servidor usa somente mapeamento ativo aprovado; sem correspondência, devolve a descrição original do PACS. A edição livre por navegador e por metadado foi removida do fluxo. |
| Exame composto | A lista abre um seletor de documentos; cada opção abre um rascunho, rota e assinatura independentes. |
| Status do estudo | Estudos com múltiplos documentos mostram conclusão somente quando todos estiverem assinados ou revisados. |
| Evento financeiro | Continua deduplicado por `report_id`: uma assinatura de documento gera um evento. Sem preço médico vigente, o evento permanece pendente sem valor. |
| Preços | `admin_master` possui escopo global; o responsável financeiro opera apenas em unidades vinculadas. Alterações de preço por modalidade com valor vigente devem iniciar em ciclo futuro e encerram a vigência anterior sem reprecificar eventos históricos. |
| Painéis | O médico já consulta faturamento e pendências por unidade. O responsável financeiro recebeu o atalho **Preços** e acesso controlado à configuração de preços, sem controles de responsável, ciclo, ativação ou reprocessamento. |

## Evidências de validação no sandbox

| Verificação | Resultado |
|---|---|
| TypeScript | `tsc --noEmit` concluído sem erros. |
| Regressões específicas | 9 testes aprovados para catálogo, documentos, preço, ciclo e permissões financeiras. |
| Suíte completa | 44 arquivos, **271 testes aprovados** e 1 ignorado, executados em processo único para respeitar a memória do sandbox. |

> A atualização da VM1 permanece bloqueada até que o commit seja validado por build completo em um *worktree* temporário. A migração da VM2 deverá ser executada somente após esse build e uma revisão final do SQL incremental.
