# Plano de Ação — Reestruturação do Setor Financeiro do PACS

**Versão:** 1.0  
**Data:** Abril de 2026  
**Projeto:** pacs-portal  
**Referência:** prompt_detalhado_reestruturacao_financeiro_pacs.txt

---

## Diagnóstico do Estado Atual

### O que já existe (e está funcionando)

O sistema já possui uma modelagem financeira razoavelmente completa no banco de dados. As tabelas abaixo estão criadas e em uso:

| Tabela | Finalidade |
|---|---|
| `financial_responsibles` | Cadastro do responsável financeiro (PF/PJ) |
| `financial_responsible_users` | Vínculo responsável ↔ usuário do sistema |
| `financial_responsible_units` | Vínculo responsável ↔ unidade (com vigência) |
| `billing_system_unit_prices` | Custo do sistema por laudo por unidade (com vigência) |
| `billing_doctor_unit_prices` | Valor do médico por laudo por unidade (com vigência) |
| `billing_visit_events` | Evento financeiro por laudo assinado (deduplicado por `report_key`) |
| `billing_cycles` | Ciclos financeiros abertos/fechados por unidade e tipo |
| `billing_cycle_configs` | Configuração do dia de corte do ciclo por unidade |
| `billing_cycle_doctor_summary` | Consolidado do médico por ciclo e unidade |
| `billing_cycle_system_summary` | Consolidado do sistema por ciclo e unidade |
| `billing_monthly_system_by_unit` | Consolidado mensal: responsável deve ao sistema |
| `billing_monthly_doctor_by_unit` | Consolidado mensal: responsável deve ao médico |

O backend já possui **~45 procedures** no `billing.ts` cobrindo responsáveis, preços, eventos, ciclos, resumos e auditoria.

O frontend já possui **~4.700 linhas** distribuídas em 14 arquivos de páginas e componentes financeiros.

### Problemas identificados (gaps reais)

**Problema 1 — Fragmentação de contexto no cadastro do médico**
O `UserFormDialog.tsx` já tem a seção "Configuração Financeira" com preços inline, mas não tem abas separadas para Unidades Vinculadas, Preços por Unidade com histórico e Resumo Financeiro. Tudo está comprimido em um único formulário vertical.

**Problema 2 — Cadastro de unidade sem contexto financeiro**
O cadastro de unidade (`AdminPage.tsx`) é puramente técnico/operacional. Não há abas para Responsável Financeiro, Custo do Sistema, Médicos com preços e Resumo Financeiro da unidade.

**Problema 3 — Responsável financeiro sem visão de dívida clara**
`FinanceResponsavelDetalhe.tsx` existe mas não tem os 5 blocos definidos: Resumo Geral, Por Unidade, Por Médico, Extrato Detalhado e Fechamentos.

**Problema 4 — Fluxo do médico sem feedback financeiro pós-assinatura**
O `ReportEditorPage.tsx` assina o laudo mas não exibe feedback financeiro ("+R$ X adicionado ao saldo"). O `FinanceMeuFinanceiro.tsx` existe mas está desconectado do fluxo real.

**Problema 5 — Duplicidade de módulos (Billing* vs Finance*)**
Existem dois conjuntos de páginas: `BillingAdminPage`, `BillingDoctorPage`, `BillingUnitPage` (antigas) e `FinanceDashboard`, `FinanceMedicos`, etc. (novas). Há sobreposição e confusão de navegação.

**Problema 6 — Responsável "Sem Responsável" como gambiarra**
A solução temporária de criar um responsável padrão automático é funcional mas não é a arquitetura correta. O campo `financial_responsible_id` em `billing_doctor_unit_prices` deveria ser opcional (nullable) ou o fluxo deveria exigir configuração prévia.

---

## Regras de Negócio Consolidadas

### Perfis e o que cada um vê

| Perfil | Visão financeira |
|---|---|
| **Médico** | Valor por laudo por unidade, saldo por unidade, saldo total, extrato, fechamentos |
| **Responsável Financeiro** | Total devido ao sistema, total devido aos médicos, por unidade, por médico, extrato, fechamentos |
| **Admin / Root** | Configurar vínculos e preços, auditar, acompanhar pendências, fechar períodos |
| **Operador / Visualizador** | Sem acesso ao módulo financeiro |

### Duas camadas de dados financeiros

> **Camada A — Saldo Operacional:** sobe em tempo real a cada laudo assinado. É o acumulado do ciclo corrente. Feedback imediato para o médico e para o responsável.

> **Camada B — Fechamento Oficial:** consolida e congela o período. Gera visão oficial de conferência e cobrança. Não pode ser alterado após fechamento.

### Regras de integridade

1. Um laudo válido gera **exatamente um** `billing_visit_event` (deduplicado por `report_key`)
2. Uma unidade tem **um único** responsável financeiro ativo por vez
3. O preço vigente no momento do laudo é capturado e congelado no evento financeiro
4. Retificação de laudo **não** duplica faturamento automaticamente
5. Preços têm vigência (`starts_at` / `ends_at`) — sem sobreposição ativa incoerente

---

## Plano de Ação por Fases

### FASE 1 — Alinhamento e documentação ✅ (este documento)
**Entrega:** Documento formal de regras de negócio, diagnóstico do estado atual e plano de ação detalhado.

---

### FASE 2 — Auditoria do schema e migrações necessárias

**Objetivo:** Garantir que o banco suporte todas as funcionalidades planejadas sem quebrar dados existentes.

**Tarefas:**

| # | Tarefa | Tipo | Impacto |
|---|---|---|---|
| 2.1 | Tornar `financial_responsible_id` nullable em `billing_doctor_unit_prices` | ALTER TABLE | Baixo — remove gambiarra do "Sem Responsável" |
| 2.2 | Adicionar campo `notes` (text, nullable) em `financial_responsibles` | ALTER TABLE | Baixo |
| 2.3 | Verificar se `billing_visit_events.financial_responsible_id` está sendo preenchido corretamente | Auditoria SQL | Nenhum |
| 2.4 | Verificar integridade de `uq_report_event` — duplicatas existentes? | Auditoria SQL | Nenhum |
| 2.5 | Adicionar índice em `billing_visit_events(doctor_user_id, unit_id)` para queries de extrato | CREATE INDEX | Performance |

**Não são necessárias novas tabelas** — o schema atual já suporta todos os requisitos do documento.

---

### FASE 3 — Reestruturação do back-end

**Objetivo:** Criar serviços específicos por perfil, garantir separação saldo/fechamento e corrigir gaps de procedures.

**Tarefas:**

| # | Tarefa | Arquivo | Prioridade |
|---|---|---|---|
| 3.1 | Criar procedure `getUnitFullFinancialContext` — retorna responsável, custo do sistema, médicos com preços e resumo financeiro da unidade em uma única chamada | `billing.ts` | Alta |
| 3.2 | Criar procedure `getDoctorFullContext` — retorna unidades vinculadas com preços, histórico de preços e resumo financeiro do médico | `billing.ts` | Alta |
| 3.3 | Criar procedure `getResponsibleFullDashboard` — retorna os 5 blocos: resumo geral, por unidade, por médico, extrato paginado e fechamentos | `billing.ts` | Alta |
| 3.4 | Criar procedure `getDoctorOperationalBalance` — saldo operacional do ciclo corrente por unidade e total | `billing.ts` | Alta |
| 3.5 | Criar procedure `getPostSignatureFinancialFeedback` — retorna o evento financeiro recém-criado com valores formatados para feedback pós-assinatura | `billing.ts` | Média |
| 3.6 | Remover dependência do responsável "Sem Responsável" — tornar `financial_responsible_id` opcional nos procedures relevantes | `billing.ts` + `db.ts` | Média |
| 3.7 | Criar procedure `setSystemPriceDirect` — análogo ao `setDoctorPriceDirect`, para configurar custo do sistema diretamente no cadastro da unidade | `billing.ts` | Média |
| 3.8 | Criar procedure `linkResponsibleToUnitDirect` — para vincular responsável à unidade diretamente no cadastro da unidade | `billing.ts` | Média |

---

### FASE 4 — Cadastro de médico com abas

**Objetivo:** Transformar o `UserFormDialog.tsx` em um formulário com abas para médicos, resolvendo dados, unidades, preços e resumo no mesmo contexto.

**Estrutura das abas:**

```
ABA 1 — Dados do Médico
  - nome, login, email, senha, perfil, status, data de expiração
  - CRM, carimbo

ABA 2 — Unidades e Permissões
  - lista de unidades com checkbox
  - data de início do vínculo
  - status do vínculo (ativo/inativo)

ABA 3 — Preços por Unidade
  - unidade | responsável financeiro | valor por laudo | vigência | histórico
  - edição inline com confirmação
  - aviso quando sem responsável configurado

ABA 4 — Resumo Financeiro
  - total de unidades vinculadas
  - preços vigentes
  - saldo operacional atual (ciclo corrente)
  - atalho para extrato completo
```

**Tarefas:**

| # | Tarefa |
|---|---|
| 4.1 | Refatorar `UserFormDialog.tsx` para usar `<Tabs>` do shadcn/ui |
| 4.2 | Aba 1: mover dados atuais do formulário |
| 4.3 | Aba 2: extrair seção "Unidades e Permissões" com datas de vínculo |
| 4.4 | Aba 3: expandir "Configuração Financeira" com histórico de preços e responsável |
| 4.5 | Aba 4: implementar resumo financeiro usando `getDoctorFullContext` |

---

### FASE 5 — Cadastro de unidade com abas

**Objetivo:** Transformar o cadastro de unidade em um centro financeiro natural.

**Estrutura das abas:**

```
ABA 1 — Dados Gerais
  - nome, endereço, status, IP PACS, porta, AE Title

ABA 2 — Responsável Financeiro
  - responsável atual com nome, tipo, contato
  - vigência do vínculo
  - histórico de responsáveis anteriores
  - botão para vincular novo responsável

ABA 3 — Custo do Sistema
  - valor por laudo cobrado pelo sistema
  - vigência
  - histórico de preços
  - edição inline

ABA 4 — Médicos da Unidade
  - lista de médicos vinculados
  - valor que a unidade paga por laudo para cada médico
  - vigência e status
  - edição inline de preço

ABA 5 — Resumo Financeiro
  - total devido ao sistema (ciclo corrente)
  - total devido aos médicos (ciclo corrente)
  - total geral
  - quantidade de laudos no período
  - link para extrato completo
```

**Tarefas:**

| # | Tarefa |
|---|---|
| 5.1 | Criar componente `UnitFormDialog.tsx` com abas (ou refatorar o existente em `AdminPage.tsx`) |
| 5.2 | Aba 1: dados técnicos atuais |
| 5.3 | Aba 2: responsável financeiro com `linkResponsibleToUnitDirect` |
| 5.4 | Aba 3: custo do sistema com `setSystemPriceDirect` |
| 5.5 | Aba 4: médicos da unidade com preços usando `UnitDoctorsTab.tsx` como base |
| 5.6 | Aba 5: resumo financeiro usando `getUnitFullFinancialContext` |

---

### FASE 6 — Perfil do responsável financeiro

**Objetivo:** Criar visão clara de dívida e conferência para o responsável.

**Estrutura da página `FinanceResponsavelDetalhe.tsx`:**

```
BLOCO 1 — Resumo Geral (cards no topo)
  - Total devido ao sistema | Total devido aos médicos | Total geral | Período atual

BLOCO 2 — Por Unidade (tabela)
  - Unidade | Custo/laudo (sistema) | Total ao sistema | Total aos médicos | Total geral | Laudos

BLOCO 3 — Por Médico (tabela)
  - Médico | Total devido | Unidades | Laudos | Status

BLOCO 4 — Extrato Detalhado (tabela paginada com filtros)
  - Data | Paciente | Unidade | Médico | Valor sistema | Valor médico | Status

BLOCO 5 — Fechamentos (lista de ciclos fechados)
  - Período | Total consolidado | Situação | Ações (ver extrato, marcar pago)
```

**Tarefas:**

| # | Tarefa |
|---|---|
| 6.1 | Implementar `getResponsibleFullDashboard` no backend |
| 6.2 | Reestruturar `FinanceResponsavelDetalhe.tsx` com os 5 blocos |
| 6.3 | Adicionar filtros de período no extrato |
| 6.4 | Implementar ação "Marcar como pago" por ciclo |

---

### FASE 7 — Fluxo do médico

**Objetivo:** Fazer o financeiro nascer naturalmente do laudo, não de um painel separado.

**Tarefas:**

| # | Tarefa | Onde |
|---|---|---|
| 7.1 | Exibir valor por laudo e saldo atual discretamente na lista de unidades (seletor de unidade no topo) | `PacsQueryPage.tsx` |
| 7.2 | Exibir feedback financeiro pós-assinatura: "+R$ X adicionado ao saldo" com toast/modal discreto | `ReportEditorPage.tsx` |
| 7.3 | Reestruturar `FinanceMeuFinanceiro.tsx` com: ciclo atual, ganhos por unidade, total acumulado, extrato, histórico de fechamentos | `FinanceMeuFinanceiro.tsx` |
| 7.4 | Garantir que o saldo operacional seja atualizado em tempo real após assinatura | `getDoctorOperationalBalance` |

---

### FASE 8 — Unificação visual e layout

**Objetivo:** Eliminar a sensação de módulo separado e unificar a identidade visual.

**Tarefas:**

| # | Tarefa |
|---|---|
| 8.1 | Remover ou redirecionar as rotas antigas `/billing/*` para o novo `/financeiro/*` |
| 8.2 | Garantir que todas as páginas financeiras usem `FinanceLayout.tsx` como wrapper |
| 8.3 | Padronizar cards, tabelas e headers usando os mesmos componentes do restante do PACS |
| 8.4 | Implementar estados visuais claros em todas as páginas: carregando, erro, sem configuração, sem unidade, pronto |
| 8.5 | Revisar navegação do sidebar financeiro — garantir que todos os perfis vejam apenas o que lhes é permitido |

---

### FASE 9 — Testes, checkpoint e deploy

**Tarefas:**

| # | Tarefa |
|---|---|
| 9.1 | Escrever/atualizar testes Vitest para os novos procedures do backend |
| 9.2 | Testar fluxo completo: cadastrar médico com preço → assinar laudo → ver saldo atualizado |
| 9.3 | Testar fluxo do responsável: ver dívida → fechar ciclo → marcar como pago |
| 9.4 | Fazer checkpoint e push para GitHub |
| 9.5 | Orientar deploy na VM1 |

---

## Ordem de Execução Recomendada

A sequência abaixo minimiza retrabalho e garante que cada fase tenha base sólida:

```
FASE 2 (banco) → FASE 3 (backend) → FASE 4 (médico) → FASE 5 (unidade)
     → FASE 6 (responsável) → FASE 7 (fluxo médico) → FASE 8 (layout) → FASE 9 (testes/deploy)
```

**Não é necessário criar novas tabelas** — o schema atual já cobre todos os requisitos. As mudanças de banco são apenas ajustes pontuais (nullable, índices).

---

## Critérios de Aceitação

A reestruturação será considerada concluída quando:

1. **Cadastro de médico**: no mesmo contexto, é possível definir onde o médico atua e quanto recebe em cada unidade, com histórico de preços visível.
2. **Cadastro de unidade**: ao abrir uma unidade, é possível ver responsável financeiro, custo do sistema, médicos vinculados com preços e resumo financeiro.
3. **Fluxo do médico**: após assinar um laudo, o médico recebe feedback financeiro imediato e pode ver seu saldo atualizado em "Meu Financeiro".
4. **Responsável financeiro**: consegue ver claramente quanto deve ao sistema, quanto deve aos médicos, por unidade e por período, com extrato e fechamentos.
5. **Admin**: consegue configurar, auditar e fechar períodos sem sair do contexto da unidade ou do médico.
6. **Visual unificado**: o módulo financeiro usa a mesma identidade visual do restante do PACS, sem sensação de produto paralelo.

---

*Documento gerado em: Abril de 2026 | Projeto: pacs-portal*
