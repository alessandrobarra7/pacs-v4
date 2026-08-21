# Auditoria do Módulo Financeiro e das Legendas

**Data de referência:** 21 de agosto de 2026.  
**Base da análise:** leitura estática do código e do esquema do Portal PACS; nenhuma operação foi executada no banco de produção.  
**Objetivo:** mapear o que existe hoje e definir uma base segura para reconstruir o Financeiro orientado a eventos, sem apagar laudos, assinaturas ou histórico financeiro.

> **Conclusão executiva:** o Portal já possui componentes valiosos de catálogo clínico e financeiro, mas o Financeiro está híbrido. Ele combina uma cobrança legada por laudo assinado com uma cobrança nova por evento de legenda canônica. A reconstrução deve manter o catálogo clínico, congelar o legado como histórico e criar uma única razão de verdade para eventos, preços e liquidações.

## 1. O que já existe no catálogo de legendas

| Componente | Estado atual | Papel no fluxo |
|---|---|---|
| **Legenda canônica** | Implementado | Define nome clínico, modalidade, situação ativa e quantidade de eventos financeiros. |
| **Documentos clínicos** | Implementado | Cada legenda possui um ou mais documentos/laudos independentes. Uma composição pode, portanto, gerar diversos laudos. |
| **Disponibilidade por unidade** | Implementado | O administrador pode liberar ou ocultar uma legenda em cada unidade. A ausência de configuração mantém compatibilidade com o catálogo histórico. |
| **Seleção por estudo** | Implementado | Um estudo pode receber várias legendas; a seleção guarda instantâneos do nome, modalidade, documentos e número de eventos. |
| **Bloqueio clínico** | Implementado | Na primeira assinatura, a seleção fica bloqueada; antes disso, legendas podem ser removidas e substituídas. |
| **Auditoria** | Implementado | A confirmação da composição registra evento de auditoria e preserva os instantâneos necessários para o estudo. |

O catálogo clínico já atende ao princípio correto de separar **quantidade de laudos** de **quantidade de eventos financeiros**. Uma legenda pode exigir dois documentos clínicos e gerar somente um evento financeiro; outra pode gerar vários eventos após a conclusão clínica.[1]

## 2. Como o financeiro funciona hoje

### 2.1. Primeiro caminho: financeiro legado por laudo

O caminho legado cria **um evento para cada laudo assinado**. Ele usa tabelas próprias de eventos por laudo, preços de sistema por unidade, preços de médico por unidade e preços de médico por modalidade. Também possui ciclos, consolidados mensais, fechamento, reabertura, recebimento e cancelamento.[2] [3]

Esse caminho ainda é acionado quando o estudo não possui seleção de legenda canônica. A assinatura do laudo tenta criar o evento legado sem bloquear a assinatura caso a configuração financeira esteja ausente ou falhe.[4]

| Elemento legado | Regra atualmente implementada |
|---|---|
| Fato gerador | Um laudo assinado ou revisado. |
| Cobrança da unidade ao sistema | Preço por unidade/laudo, com vigência. |
| Pagamento ao médico | Preço padrão por unidade ou preço mais específico por modalidade. |
| Ciclos | Ciclos de médico e de sistema, com fechamento, reabertura e consolidados. |
| Contingência | Reprocessamento de eventos faltantes e reprecificação de eventos pendentes. |

### 2.2. Segundo caminho: eventos do catálogo clínico

O caminho novo usa a seleção de legendas do estudo. Na primeira assinatura, a composição é bloqueada. Somente quando **todos os documentos clínicos obrigatórios** daquela legenda estiverem assinados ou retificados, o sistema cria a quantidade de eventos indicada na legenda.[5]

O valor aplicado hoje é o preço do médico por **unidade + médico + legenda + vigência**. Se não houver preço aplicável na data da assinatura, o evento é criado como `pending_doctor_price`, sem impedir a assinatura clínica.[5]

| Elemento do catálogo | Regra atualmente implementada |
|---|---|
| Fato gerador | Conclusão de todos os documentos exigidos pela legenda. |
| Quantidade | `financial_event_count` da legenda. |
| Deduplicação | Uma chave única por seleção do estudo e índice do evento. |
| Preço aplicado | Somente valor de pagamento do médico, por legenda e vigência. |
| Sem preço | Evento persiste como pendente de precificação. |

## 3. Telas e funções financeiras disponíveis hoje

O módulo financeiro possui uma superfície ampla, porém fragmentada. O roteador financeiro concentra rotinas de responsáveis, preços, ciclos, pagamentos, resumos, extratos, auditoria, reprocessamento, prontidão e ativação financeira.[2]

| Área atual | Funções existentes |
|---|---|
| **Configuração por unidade** | Responsável financeiro, usuários vinculados ao responsável, ciclo, preço padrão do sistema, preço por médico/laudo, preço por modalidade e preço do médico por legenda/evento. |
| **Painel administrativo** | Resumo hierárquico por responsável, unidade e médico; consolidação e baixa de pagamentos. |
| **Painel do médico** | Ciclo da unidade, laudos assinados, valor a receber, recebido, pendências e preços por modalidade. |
| **Painel do responsável** | Unidades sob responsabilidade, totais do sistema e médicos, detalhe por médico e marcação de recebimento. |
| **Ciclos e liquidações** | Abrir, fechar, reabrir, criar manualmente, ajustar datas, anotar e marcar ciclos como pagos. |
| **Operação corretiva** | Reprocessar eventos legados, reprecificar pendências e cancelar evento financeiro. |
| **Aptidão financeira** | Checklist de unidade ativa, responsável, usuário do responsável, ciclo, preços e eventos pendentes ou faltantes. |

Na tela atual de configuração, essas responsabilidades aparecem juntas: preço do sistema por laudo, preço do médico por laudo, preço por modalidade, preço por legenda/evento, responsável, ciclo, checklist e reprocessamento.[6] Isso explica a sensação de que o módulo é difícil de compreender e de operar.

## 4. Pontos que precisam ser corrigidos na reformulação

| Achado | Impacto | Direção recomendada |
|---|---|---|
| **Dois fatos geradores coexistem**: laudo assinado e evento de legenda concluída. | Um mesmo conceito financeiro pode ser contado de modos diferentes. | Definir o evento do catálogo como o único fato gerador para novas operações. |
| **Cobrança da unidade ainda é legada por laudo.** | O preço do sistema não acompanha a regra já desejada de cobrança por evento. | Criar preço da unidade por legenda/evento e vigência. |
| **Três matrizes de preço do médico coexistem**: por laudo, modalidade e legenda. | Configuração ambígua e difícil de auditar. | Manter apenas preço por unidade + médico + legenda + evento; usar regra explícita de ausência de preço. |
| **Reprocessamento está exposto como ferramenta operacional.** | Pode produzir entendimento errado ou alterar eventos fora do fluxo normal. | Retirar da rotina diária; manter, se necessário, apenas como ferramenta técnica auditada do `admin_master`. |
| **Preço pendente não bloqueia assinatura.** | É clinicamente adequado, mas exige fila financeira clara para não perder cobrança. | Manter a assinatura não bloqueante e criar fila explícita de “eventos sem preço”. |
| **Crédito médico em legenda composta precisa de definição.** | Hoje, quando vários documentos são exigidos, o criador dos eventos é o médico ligado à assinatura que concluiu a composição. Se documentos forem assinados por médicos distintos, a regra econômica fica ambígua. | Definir antes da reconstrução se o valor pertence ao médico de cada documento, a um médico responsável pela legenda ou se a divisão será configurada. |

## 5. Arquitetura recomendada para o Financeiro v2

O ponto de partida não deve ser apagar tabelas. Deve ser uma **virada controlada**: preservar o legado em modo histórico, interromper sua geração para novos estudos e fazer o novo módulo trabalhar somente com o evento de catálogo.

### 5.1. Núcleo clínico que deve ser preservado

O catálogo canônico, os documentos clínicos, a visibilidade por unidade e a seleção auditável por estudo devem ser preservados. Eles já representam a linguagem clínica correta do produto: uma seleção pode ter vários laudos e uma quantidade independente de eventos financeiros.[1]

### 5.2. Novo contrato financeiro por unidade

Para cada unidade, o `admin_master` deve configurar um contrato financeiro composto por versões com vigência:

| Configuração | Administrador | Unidade de cobrança |
|---|---|---|
| **Preço da unidade para LAUDS** | `admin_master` | Valor por evento de cada legenda. |
| **Preço do médico** | `admin_master` e responsável financeiro vinculado | Valor por evento de cada legenda, médico e unidade. |
| **Ciclo de liquidação** | `admin_master` | Período que agrupa eventos já capturados. |
| **Responsável financeiro da unidade** | `admin_master` | Entidade que acompanha valores e pagamentos da unidade. |

A mensalidade, se houver, deve ser um componente comercial opcional separado e não substitui o evento como fato gerador principal.

### 5.3. Livro de eventos único

O novo livro financeiro deve gravar, para cada evento criado, os dois lados econômicos e seus instantâneos: unidade, legenda, estudo, documento(s), médico beneficiário, preço que a unidade deve à LAUDS, preço que a LAUDS deve ao médico, vigência aplicada, estado e auditoria.

> Um evento financeiro não deve recalcular valores antigos. A alteração de uma tabela de preços cria uma nova vigência; o evento preserva o valor aplicado no momento em que foi gerado.

### 5.4. Liquidações separadas e claras

O módulo deve gerar duas visões a partir do mesmo livro de eventos: **conta a receber da unidade para LAUDS** e **conta a pagar da LAUDS para o médico**. A quitação da obrigação da unidade com a LAUDS permanece exclusiva do `admin_master`; o responsável financeiro pode acompanhar e registrar pagamentos de médicos dentro de sua unidade, conforme a regra já definida para o Portal.

## 6. Fluxo proposto para novos estudos

1. O administrador master cadastra a legenda canônica, os documentos clínicos e a quantidade de eventos.
2. O administrador master define em quais unidades a legenda estará disponível.
3. A unidade é cadastrada no módulo financeiro e recebe contrato por evento, ciclo e responsável financeiro.
4. Para cada médico vinculado à unidade, é configurado o valor por evento de cada legenda que ele pode laudar.
5. Operador, atendente, médico ou administrador selecionam uma ou mais legendas no estudo antes da primeira assinatura.
6. A primeira assinatura bloqueia a composição clínica.
7. Quando todos os documentos exigidos por uma legenda forem assinados, o sistema cria os eventos financeiros imutáveis daquela legenda.
8. Os eventos entram no ciclo vigente e aparecem nas visões da unidade, do responsável e do médico com estados separados de preço pendente, aberto, pago, cancelado ou ajustado.

## 7. Decisões que precisam de aprovação antes de implementar

| Decisão | Opções a definir |
|---|---|
| **Beneficiário em legenda com vários documentos** | Um único médico responsável; valor dividido entre médicos; ou um evento por documento. |
| **Preço da LAUDS** | Sempre por legenda/evento; permitir valor padrão por modalidade como fallback; ou exigir preço explícito em cada legenda. |
| **Eventos sem preço** | Gerar pendente e entrar em fila; impedir ativação financeira da unidade; ou permitir ajuste manual somente pelo admin_master. |
| **Dados antigos** | Somente leitura em relatório “Legado”; migração parcial para o novo livro; ou ambos com corte de competência claramente identificado. |
| **Mensalidade opcional** | Sem mensalidade no primeiro lançamento; mensalidade por unidade; ou mensalidade por contrato com vigência. |
| **Responsável financeiro** | Mantém o direito de configurar apenas preços de médicos, sem alterar contrato da unidade com a LAUDS. |

## 8. Roteiro seguro de reconstrução

1. Aprovar as decisões da seção anterior e o desenho visual do Financeiro v2.
2. Criar tabelas novas de contrato, preços por evento, livro de eventos e liquidações, sem apagar estruturas antigas.
3. Criar uma tela inicial única por unidade: contrato da unidade, preços dos médicos e prontidão de configuração.
4. Direcionar somente novos eventos de catálogo ao novo livro a partir de uma data de corte registrada.
5. Criar painéis simplificados para `admin_master`, responsável financeiro e médico.
6. Transformar o legado em consulta histórica de leitura, sem “Reprocessar” disponível na operação normal.
7. Validar com uma unidade piloto e uma composição clínica real antes de liberar para todas as unidades.

## Declaração de base e limites

Esta análise usa definições do código atual: **evento financeiro** é o fato econômico registrado após a conclusão da legenda; **laudo** é um documento clínico assinado; e **ciclo** é a janela de liquidação de eventos. A referência é 21 de agosto de 2026, sem consulta ou alteração de dados de produção. A confiança é alta para o comportamento estrutural descrito, pois a análise foi feita diretamente nas rotas, no esquema e nas telas; valores e quantidades reais do banco não foram avaliados.

## Referências

[1] `server/routers/studyExamLegend.ts` — composição, snapshots, disponibilidade e bloqueio clínico.  
[2] `server/routers/financeSimple.ts` — rotas, preços, ciclos, resumos, pagamentos e ações operacionais.  
[3] `drizzle/schema.ts` — tabelas de responsáveis, preços, eventos, ciclos e consolidados.  
[4] `server/routers/reports.ts` — geração legada após assinatura e comportamento não bloqueante.  
[5] `server/catalogFinancial.ts` — bloqueio na primeira assinatura e criação dos eventos do catálogo.  
[6] `client/src/pages/finance/FinanceConfiguracao.tsx` — tela atual de configuração por unidade.
