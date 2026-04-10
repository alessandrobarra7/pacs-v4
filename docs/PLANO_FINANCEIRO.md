# Plano de Ação — Módulo Financeiro PACS
**Data:** 2026-04-10  
**Baseado em:** `docs/ANALISE_MODULO_FINANCEIRO.txt`  
**Responsável técnico:** Desenvolvimento StudioBarra7

---

## Visão Geral

O módulo financeiro atual possui conflitos estruturais entre camadas que impedem um comportamento coerente. Este documento define a sequência oficial de correções e o contrato de comportamento esperado para cada camada do sistema.

---

## Modelo Financeiro Oficial (Decisão Arquitetural)

### Financeiro Operacional (dia a dia)
- **Base:** `billing_visit_events` (renomear semanticamente para `billing_report_events` futuramente)
- **Gatilho:** assinatura de laudo válido
- **Quem usa:** médico (ver saldo parcial e total do ciclo)
- **Tabelas principais:** `billing_visit_events`, `billing_cycles`, `billing_cycle_doctor_summary`

### Financeiro de Fechamento (consolidação)
- **Base:** `billing_cycle_doctor_summary` + `billing_cycle_system_summary`
- **Gatilho:** fechamento manual de ciclo pelo admin
- **Quem usa:** responsável financeiro (conferência de dívida), admin (auditoria e relatórios)
- **Tabelas principais:** `billing_cycles`, `billing_cycle_doctor_summary`, `billing_monthly_doctor_by_unit`

> **Regra:** `billing_report_items` e `billing_monthly_*` são a camada de consolidação mensal. Não devem ser confundidos com o operacional diário.

---

## Fonte de Verdade — Tabelas Oficiais

| Dado | Tabela Oficial | Legado (não usar como principal) |
|---|---|---|
| Usuário autenticado | `users` | `user` (Manus OAuth, ignorar) |
| Role do usuário | `users.role` | — |
| Unidade principal (fallback) | `users.unit_id` | — |
| Permissões multi-unidade | `user_unit_permissions` | `users.unit_id` (apenas fallback) |
| Preço por médico/unidade | `billing_doctor_unit_prices` | — |
| Evento financeiro por laudo | `billing_visit_events` | — |
| Ciclo financeiro | `billing_cycles` | — |
| Resumo do ciclo por médico | `billing_cycle_doctor_summary` | — |

---

## Passos de Implementação

### PASSO 1 — Unificar a Regra-Mestra ✅
**Status:** Definido neste documento.  
**Ação:** Este arquivo (`PLANO_FINANCEIRO.md`) é a referência oficial de arquitetura financeira.

---

### PASSO 2 — Limpar Nomenclatura ⏳
**Status:** Pendente (baixa prioridade, sem impacto em produção imediato).  
**Ação futura:** Renomear `billing_visit_events` → `billing_report_events` no schema, código e banco.  
**Pré-requisito:** Todos os outros passos concluídos primeiro.

---

### PASSO 3 — Desacoplar Preço de Ciclo 🔴 Alta Prioridade
**Problema:** O banner financeiro do médico só exibe dados quando há ciclo aberto. Se não há ciclo, o banner parece quebrado.  
**Comportamento correto:**
- Preço vigente do laudo → sempre visível (vem de `billing_doctor_unit_prices`)
- Saldo acumulado → zero quando não há produção no ciclo
- Mensagem clara quando não há configuração de preço

**Arquivos a modificar:**
- `server/db.ts` → `getDoctorUnitFinancialInfo()` — separar consulta de preço da consulta de ciclo
- `client/src/pages/PacsQueryPage.tsx` → `FinancialBanner` — exibir preço mesmo sem ciclo

---

### PASSO 4 — Unificar Multi-Unidade 🔴 Alta Prioridade
**Problema:** ~15 pontos no `routers.ts` ainda usam `ctx.user.unit_id` diretamente sem verificar `user_unit_permissions`.  
**Comportamento correto:** Toda validação de acesso à unidade deve usar `user_unit_permissions` como fonte principal, com `users.unit_id` apenas como fallback documentado.

**Arquivos a modificar:**
- `server/routers.ts` → procedures: `pacs.query`, `reports.*`, `templates.*`, `billing.*`
- `server/db.ts` → helpers que filtram por `unit_id`

**Regra de migração:**
```ts
// Antes (legado):
const unitId = ctx.user.unit_id;

// Depois (correto):
const unitId = input.unit_id 
  ? (await validateUnitPermission(ctx.user.id, input.unit_id) ? input.unit_id : ctx.user.unit_id)
  : ctx.user.unit_id;
```

---

### PASSO 5 — Fortalecer Feedback do Front 🔴 Alta Prioridade
**Problema:** Componentes financeiros desaparecem silenciosamente quando há erro, ausência de dados ou falta de configuração.  
**Comportamento correto:** Todo componente financeiro deve ter 5 estados explícitos:

1. `loading` — esqueleto de carregamento
2. `no_unit` — "Selecione uma unidade"
3. `no_config` — "Esta unidade ainda não possui configuração financeira. Contate o administrador."
4. `error` — "Erro ao carregar dados financeiros. Tente novamente."
5. `ready` — exibição normal dos dados

**Arquivos a modificar:**
- `client/src/pages/PacsQueryPage.tsx` → `FinancialBanner`
- `client/src/pages/BillingDoctorPage.tsx`
- `client/src/pages/BillingUnitPage.tsx`
- `client/src/pages/BillingAdminPage.tsx`

---

### PASSO 6 — Fechar Fluxo Operacional do Médico 🟡 Média Prioridade
**Problema:** O médico assina o laudo mas não recebe confirmação financeira explícita com o valor adicionado.  
**Comportamento correto após assinatura:**
1. Evento financeiro gerado em `billing_visit_events`
2. Queries financeiras invalidadas (`trpc.billing.getUnitFinancialInfo.invalidate()`)
3. Toast de confirmação: _"Laudo assinado. +R$ 30,00 adicionados ao seu saldo nesta unidade."_
4. Banner atualizado automaticamente

**Arquivos a modificar:**
- `server/routers.ts` → procedure de assinatura de laudo — não engolir erro de billing
- `client/src/pages/PacsQueryPage.tsx` → invalidar queries após assinatura
- `client/src/components/ReportEditor.tsx` → toast com valor financeiro

---

### PASSO 7 — Separar Camadas do Produto 🟡 Média Prioridade
**Problema:** Médico, responsável e admin compartilham lógica visual e operacional misturada.  
**Comportamento correto:**

| Camada | Rota | Visão |
|---|---|---|
| Médico | `/billing/doctor` | Preço por laudo, saldo parcial, saldo total do ciclo, extrato pessoal |
| Responsável | `/billing/unit` | Dívida consolidada por médico, conferência, extrato para pagamento |
| Admin/Root | `/billing/admin` | Configuração de preços, abertura/fechamento de ciclos, auditoria, relatórios |

**Arquivos a modificar:**
- `client/src/pages/BillingDoctorPage.tsx` — foco em operacional e extrato pessoal
- `client/src/pages/BillingUnitPage.tsx` — foco em dívida e conferência
- `client/src/pages/BillingAdminPage.tsx` — foco em configuração e fechamento

---

### PASSO 8 — Revisão de Fonte de Verdade 🟢 Baixa Prioridade
**Problema:** Indícios de legado estrutural sem documentação clara.  
**Ação:** Este documento (`PLANO_FINANCEIRO.md`) serve como referência. A tabela `user` (Manus OAuth) é legado e não deve ser referenciada pelo código da aplicação.

---

## Ordem de Execução

```
PASSO 3 → PASSO 5 → PASSO 4 → PASSO 6 → PASSO 7 → PASSO 2 → PASSO 8
```

**Justificativa:** Os passos 3 e 5 resolvem os problemas mais visíveis para o usuário final (banner quebrado, componentes sumindo). O passo 4 consolida a base para os passos seguintes. Os passos 6 e 7 fecham a experiência. Os passos 2 e 8 são de manutenção e podem ser feitos por último.

---

## Critérios de Conclusão

O módulo financeiro estará reorganizado quando:

- [ ] Médico vê preço vigente do laudo mesmo sem ciclo aberto
- [ ] Médico vê saldo zero (não erro) quando não há produção no ciclo
- [ ] Nenhum componente financeiro desaparece sem explicação
- [ ] Assinatura de laudo exibe confirmação com valor financeiro
- [ ] Médico com múltiplas unidades alterna entre elas e vê saldo correto de cada uma
- [ ] Responsável vê dívida consolidada por médico e por unidade
- [ ] Admin configura preços e abre/fecha ciclos pelo portal (sem SQL direto)
- [ ] Todas as validações de unidade usam `user_unit_permissions` como fonte principal
