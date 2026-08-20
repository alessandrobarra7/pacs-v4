# Especificação — Catálogo Clínico e Financeiro por Estudo

## Objetivo

O Catálogo de Exames passa a ser a fonte exclusiva de legendas que podem gerar laudos e eventos financeiros. A descrição recebida do PACS permanece como referência operacional, mas não cria nomes livres, documentos ou cobrança por si só.

## Papéis

| Ação | Perfis autorizados |
|---|---|
| Criar, editar, ativar e desativar uma legenda do catálogo | `admin_master` |
| Selecionar ou corrigir a legenda de um estudo | `operador`, `atendente`, `medico` |
| Criar uma legenda diretamente a partir da página de estudos | Nenhum perfil |
| Configurar preços por legenda dos médicos da própria unidade | `responsavel_financeiro`, `admin_master` |

## Regra da legenda selecionada

Cada estudo deve possuir uma legenda canônica escolhida do catálogo antes de gerar documentos de laudo ou evento financeiro. A seleção substitui a legenda operacional mostrada para o estudo e é gravada como um snapshot auditável, com usuário, data, unidade e versão da configuração clínica-financeira.

O PACS pode fornecer uma descrição sugerida. Essa descrição ajuda o usuário a encontrar a legenda correspondente, mas não cria correspondência automática obrigatória e não substitui a escolha humana.

## Definição administrativa

Cada item do catálogo contém:

| Campo | Finalidade |
|---|---|
| Legenda canônica | Nome único exibido ao usuário e usado como snapshot do estudo. |
| Modalidade | Contexto clínico permitido, como `CT` ou `CR`. |
| Documentos de laudo | Lista ordenada de laudos independentes necessários para aquele estudo. |
| Unidades de laudo | Quantidade clínica declarada pelo administrador. Deve corresponder aos documentos configurados. |
| Grupos de evento financeiro | Quantidade de eventos financeiros que o conjunto de documentos representa. |

Exemplos confirmados:

| Legenda | Modalidade | Laudos independentes | Eventos financeiros |
|---|---|---:|---:|
| ABD TOTAL | CT | 1 | 1 |
| COL CER+DOR+LOM | CT | 3 | 1 |
| RAIO X MÃOS + PUNHOS + TÓRAX | CR | 3 | 3 |

## Assinaturas e evento financeiro

Os documentos configurados geram laudos independentes, cada um com seu rascunho, assinatura e histórico. Um evento financeiro somente pode ser criado após a assinatura de **todos** os documentos exigidos pela legenda selecionada.

Para um catálogo com três laudos e um evento, a terceira assinatura libera um único evento. Para três laudos e três eventos, a terceira assinatura libera os três eventos definidos pelo catálogo. Em ambos os casos, o valor monetário de cada evento é resolvido pela tabela de preço vigente da **legenda canônica, unidade e médico**. A modalidade permanece como referência e filtro clínico, mas não é suficiente para decidir o preço.

## Matriz de preço detalhada

A precificação deve usar a chave lógica `(legenda canônica, unidade, médico, vigência)`. Assim, uma mesma legenda pode possuir preço diferente para médicos diferentes dentro da mesma unidade e também preço diferente para o mesmo médico em outra unidade.

O `responsavel_financeiro` somente poderá editar esses preços para médicos vinculados à própria unidade. Ele não poderá criar, editar, ativar ou inativar legendas, nem alterar preços de outra unidade. O `admin_master` conserva supervisão e edição global.

| Legenda | Modalidade | Unidade | Médico | Valor unitário por evento |
|---|---|---|---|---:|
| RAIO X MÃOS + PUNHOS + TÓRAX | CR | Unidade Exemplo | Médico A | Configurado no módulo Financeiro |
| RAIO X MÃOS + PUNHOS + TÓRAX | CR | Unidade Exemplo | Médico B | Configurado no módulo Financeiro |
| RAIO X MÃOS + PUNHOS + TÓRAX | CR | Outra unidade | Médico A | Configurado independentemente |

No exemplo de três laudos e três eventos, o total devido será `3 × valor unitário vigente dessa legenda para aquele médico naquela unidade`. No exemplo de três laudos e um evento, o total será `1 × valor unitário vigente`.

## Experiência no módulo Financeiro

O módulo Financeiro deve abrir sempre no contexto de uma unidade. Após selecionar a unidade, o usuário autorizado acessa a seção **Preços por Legenda**.

Cada linha da tabela representa uma legenda ativa do catálogo e mostra modalidade, quantidade de documentos, quantidade de eventos financeiros e situação de configuração. Ao abrir uma legenda, o usuário vê apenas os médicos vinculados à unidade selecionada e define o valor unitário e a vigência por ciclo para cada médico.

| Elemento da tela | Comportamento |
|---|---|
| Unidade | Contexto obrigatório; não há consolidação nem edição cruzada. |
| Legenda ativa | Vem exclusivamente do catálogo global e não pode ser criada pela tela financeira. |
| Médicos da unidade | Lista somente médicos que podem receber preço naquela unidade. |
| Valor unitário | Valor devido por evento financeiro para a combinação legenda, unidade e médico. |
| Vigência | Alteração segue a abertura de ciclo e preserva preços e eventos anteriores. |
| Situação | Informa se há preço vigente ou pendência de precificação. |

O `admin_master` acessa todas as unidades e conserva supervisão global. O `responsavel_financeiro` acessa somente suas unidades e somente configura preços de médicos vinculados nelas. Nenhum desses perfis cria legendas a partir do Financeiro.

O preço administrativo de obrigação da unidade com a LAUDS permanece uma configuração separada, definida pelo `admin_master`. A matriz aqui especificada trata o valor devido ao médico por evento financeiro da legenda.

## Experiência na página principal

1. A linha do estudo mostra a descrição original do PACS como referência.
2. Operador, Atendente ou Médico abre o seletor de legenda cadastrada, filtrado pela modalidade do estudo.
3. Após a confirmação, o Portal registra a seleção e mostra a legenda canônica no estudo.
4. O Portal cria ou disponibiliza os documentos exigidos para laudo conforme a legenda.
5. O módulo Financeiro permite configurar, por unidade, cada legenda disponível e o valor unitário específico de cada médico.
6. O evento financeiro fica bloqueado até que todos os documentos obrigatórios estejam assinados.

## Regras de proteção

- A seleção não pode ser substituída por texto livre.
- Uma legenda inativa não pode ser escolhida em novos estudos.
- Após existir assinatura, a legenda e a configuração de documentos devem ser imutáveis para preservar rastreabilidade financeira e clínica.
- Antes de qualquer assinatura, a legenda pode ser corrigida por um perfil autorizado; a mudança deve ser auditada.
- O faturamento existente não pode ser recalculado por edição futura do catálogo ou de preço; cada evento utiliza snapshots.
- Se não houver preço vigente para a combinação legenda, unidade e médico, a assinatura continua permitida conforme a política já aprovada, mas o evento é registrado como pendente de precificação e não integra o valor a pagar até a regularização.

## Impacto técnico previsto

Será necessária uma migração aditiva para registrar a seleção canônica no estudo, a versão/snapshot da configuração e os grupos de evento. O fluxo atual, que cria um evento por assinatura de relatório, deve ser substituído por um coordenador de eventos por estudo e por legenda. Nenhum dado histórico será apagado; estudos legados permanecem sem a nova obrigatoriedade até serem selecionados manualmente quando necessário.
