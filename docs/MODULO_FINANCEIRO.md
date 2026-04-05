# Módulo Financeiro — Memória Técnica de Implementação

**Sistema:** PACS v4  
**Data de elaboração:** 05/04/2026  
**Status:** Especificação aprovada — implementação pendente (Etapa 1)

---

## 1. Finalidade deste documento

Este documento registra todas as decisões técnicas e de negócio tomadas sobre o módulo financeiro do PACS v4. Ele serve como base oficial para a implementação futura, evitando retrabalho, modelagem equivocada e duplicidade de regras.

O módulo **não foi implementado ainda**. Este documento deve ser lido integralmente antes de qualquer linha de código ser escrita.

---

## 2. Objetivo do módulo

Adicionar ao PACS v4 uma camada financeira baseada na produção real de laudos já existente no sistema, sem criar fluxos paralelos de produção nem lançamentos manuais de quantidade.

Cada laudo final válido de uma unidade gera dois efeitos financeiros independentes:

1. **Unidade → Plataforma:** valor cobrado pelo dono do sistema da unidade, por laudo.
2. **Unidade → Médico:** valor pago pela unidade ao médico responsável pelo laudo, por laudo.

---

## 3. Premissas do sistema atual

O sistema já possui toda a estrutura necessária:

| Entidade | Tabela | Campo relevante |
|----------|--------|-----------------|
| Unidades | `units` | `id`, `name` |
| Usuários/Médicos | `users` | `id`, `role`, `name` |
| Laudos | `reports` | `id`, `unit_id`, `created_by`, `status`, `signed_at`, `signed_by`, `study_instance_uid` |
| Vínculo médico-unidade | `user_unit_permissions` | `user_id`, `unit_id` |
| Unicidade laudo/estudo | `reports` | UNIQUE (`study_instance_uid`, `unit_id`) |

O módulo financeiro **deve consultar esses dados**, não criar cadastros paralelos.

---

## 4. Regras de negócio — versão final travada

### Regra 1 — Evento faturável

O evento faturável é o laudo final válido de cada estudo dentro de uma unidade. Um estudo gera exatamente **um** evento faturável, independente de quantas vezes o laudo foi editado ou retificado.

### Regra 2 — Status válido para faturamento

Um estudo gera apenas um evento faturável por unidade.

Somente entram na apuração os laudos cujo registro do estudo na unidade esteja em status faturável: **`signed`** ou **`revised`**.

Laudos com status **`draft`** não entram na apuração.

A lógica de apuração deve sempre considerar o laudo final válido do estudo naquela unidade, evitando qualquer duplicidade de cobrança. Isso é garantido pelo UNIQUE constraint `(study_instance_uid, unit_id)` já existente na tabela `reports`.

### Regra 3 — Data da competência

A competência mensal é determinada pelo campo **`signed_at`** do laudo final válido.

Não se usa `created_at`, `updated_at` nem `study_date`.

### Regra 4 — Retificação

Retificação **não gera nova cobrança**. O estudo continua com um único evento faturável. O valor apurado permanece vinculado ao mesmo fato gerador. O UNIQUE constraint já garante isso no banco.

### Regra 5 — Preço da plataforma

O **admin_master** define o valor unitário cobrado de cada unidade pela plataforma. Esse valor tem vigência (`starts_at`, `ends_at`). Não pode haver duas vigências sobrepostas para a mesma unidade.

### Regra 6 — Preço do médico

O **unit_admin** define o valor unitário pago a cada médico vinculado à sua unidade. Esse valor é por médico por unidade (`unit_id` + `doctor_user_id`) e tem vigência. O mesmo médico pode ter preços diferentes em unidades diferentes. Não pode haver duas vigências sobrepostas para o mesmo par `(unit_id, doctor_user_id)`.

### Regra 7 — Ausência de preço

Se não houver preço configurado e vigente para a unidade ou para um médico na competência apurada, o sistema **não assume zero**. O sistema marca o item como **"pendente de configuração"** e bloqueia o fechamento da competência enquanto houver itens sem preço.

### Regra 8 — Vigência de preços

Cada regra de preço tem `starts_at` e `ends_at` (nullable). O campo `active` **não será usado** — a vigência é determinada exclusivamente pelas datas.

Ao cadastrar nova vigência, o sistema encerra automaticamente a vigência anterior (define `ends_at` = `starts_at_novo` − 1 segundo).

### Regra 9 — Fechamento de competência

- **Competência `open`:** pode ser recalculada a qualquer momento.
- **Competência `closed`:** os totais são congelados no momento do fechamento. O sistema **não recalcula automaticamente** competências fechadas. Reabertura exige ação explícita e controlada — apenas **admin_master** pode reabrir.

### Regra 10 — Itemização auditável

Cada laudo faturável gera um registro na tabela `billing_report_items` com os valores aplicados no momento da apuração. Isso garante rastreabilidade completa e permite explicar qualquer valor até o laudo individual.

### Regra 11 — Médico em múltiplas unidades

Um médico pode atuar em múltiplas unidades. A apuração é sempre por `unit_id` + `doctor_user_id`. Não existe preço global do médico.

---

## 5. Modelagem das tabelas

### 5.1. `billing_unit_prices`

Registra o valor cobrado pela plataforma de cada unidade por laudo, com vigência.

```sql
CREATE TABLE billing_unit_prices (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id         BIGINT NOT NULL,
  price_per_report DECIMAL(10,2) NOT NULL CHECK (price_per_report > 0),
  starts_at       BIGINT NOT NULL,   -- timestamp UTC ms
  ends_at         BIGINT NULL,       -- NULL = vigência aberta
  created_by      BIGINT NOT NULL,
  created_at      BIGINT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES units(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

**Constraint de negócio:** não pode haver sobreposição de vigência para a mesma `unit_id`. Validar no backend antes de inserir.

---

### 5.2. `billing_doctor_prices`

Registra o valor pago pela unidade a cada médico por laudo, com vigência.

```sql
CREATE TABLE billing_doctor_prices (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id         BIGINT NOT NULL,
  doctor_user_id  BIGINT NOT NULL,
  price_per_report DECIMAL(10,2) NOT NULL CHECK (price_per_report > 0),
  starts_at       BIGINT NOT NULL,
  ends_at         BIGINT NULL,
  created_by      BIGINT NOT NULL,
  created_at      BIGINT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES units(id),
  FOREIGN KEY (doctor_user_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

**Constraint de negócio:** não pode haver sobreposição de vigência para o mesmo `(unit_id, doctor_user_id)`. Validar no backend antes de inserir.

---

### 5.3. `billing_monthly_unit`

Consolida quanto a unidade deve ao sistema por competência.

```sql
CREATE TABLE billing_monthly_unit (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id             BIGINT NOT NULL,
  competence_year     INT NOT NULL,
  competence_month    INT NOT NULL,   -- 1 a 12
  reports_count       INT NOT NULL DEFAULT 0,
  unit_price_applied  DECIMAL(10,2) NULL,  -- NULL = sem preço configurado
  system_total_due    DECIMAL(10,2) NULL,
  status              ENUM('open','closed') NOT NULL DEFAULT 'open',
  generated_at        BIGINT NOT NULL,
  closed_at           BIGINT NULL,
  closed_by           BIGINT NULL,
  UNIQUE KEY uq_unit_competence (unit_id, competence_year, competence_month),
  FOREIGN KEY (unit_id) REFERENCES units(id),
  FOREIGN KEY (closed_by) REFERENCES users(id)
);
```

---

### 5.4. `billing_monthly_doctor`

Consolida quanto a unidade deve a cada médico por competência.

```sql
CREATE TABLE billing_monthly_doctor (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id               BIGINT NOT NULL,
  doctor_user_id        BIGINT NOT NULL,
  competence_year       INT NOT NULL,
  competence_month      INT NOT NULL,
  reports_count         INT NOT NULL DEFAULT 0,
  doctor_price_applied  DECIMAL(10,2) NULL,
  doctor_total_due      DECIMAL(10,2) NULL,
  status                ENUM('open','closed') NOT NULL DEFAULT 'open',
  generated_at          BIGINT NOT NULL,
  closed_at             BIGINT NULL,
  closed_by             BIGINT NULL,
  UNIQUE KEY uq_doctor_unit_competence (unit_id, doctor_user_id, competence_year, competence_month),
  FOREIGN KEY (unit_id) REFERENCES units(id),
  FOREIGN KEY (doctor_user_id) REFERENCES users(id),
  FOREIGN KEY (closed_by) REFERENCES users(id)
);
```

---

### 5.5. `billing_report_items`

Itemização auditável — um registro por laudo faturável.

```sql
CREATE TABLE billing_report_items (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_id             BIGINT NOT NULL,
  unit_id               BIGINT NOT NULL,
  doctor_user_id        BIGINT NOT NULL,
  competence_year       INT NOT NULL,
  competence_month      INT NOT NULL,
  system_price_applied  DECIMAL(10,2) NULL,
  doctor_price_applied  DECIMAL(10,2) NULL,
  report_signed_at      BIGINT NOT NULL,
  created_at            BIGINT NOT NULL,
  UNIQUE KEY uq_report_item (report_id),   -- um laudo = um item
  FOREIGN KEY (report_id) REFERENCES reports(id),
  FOREIGN KEY (unit_id) REFERENCES units(id),
  FOREIGN KEY (doctor_user_id) REFERENCES users(id)
);
```

---

## 6. Papéis e permissões

| Ação | admin_master | unit_admin | medico |
|------|:---:|:---:|:---:|
| Definir preço da plataforma por unidade | ✅ | ❌ | ❌ |
| Definir preço do médico por unidade | ❌ | ✅ (só sua unidade) | ❌ |
| Ver faturamento consolidado (todas as unidades) | ✅ | ❌ | ❌ |
| Ver passivo da unidade (sistema + médicos) | ✅ | ✅ (só sua unidade) | ❌ |
| Ver produção e valor a receber | ❌ | ❌ | ✅ (só seus laudos) |
| Fechar competência | ✅ | ✅ (só sua unidade) | ❌ |
| Reabrir competência fechada | ✅ | ❌ | ❌ |

---

## 7. Lógica de cálculo

### Fórmula — valor devido ao sistema

```
TOTAL_SISTEMA = total de laudos válidos da unidade × preço_plataforma_vigente
```

### Fórmula — valor devido a cada médico

```
TOTAL_MÉDICO = total de laudos válidos do médico na unidade × preço_médico_vigente
```

### Consulta base para apuração

```sql
SELECT
  r.id             AS report_id,
  r.unit_id,
  r.created_by     AS doctor_user_id,
  r.signed_at      AS report_signed_at,
  YEAR(FROM_UNIXTIME(r.signed_at / 1000))  AS competence_year,
  MONTH(FROM_UNIXTIME(r.signed_at / 1000)) AS competence_month
FROM reports r
WHERE
  r.unit_id = :unit_id
  AND r.status IN ('signed', 'revised')
  AND r.signed_at IS NOT NULL
  AND YEAR(FROM_UNIXTIME(r.signed_at / 1000))  = :year
  AND MONTH(FROM_UNIXTIME(r.signed_at / 1000)) = :month;
```

---

## 8. Tela do unit_admin — configuração de preços

Ao configurar o preço de um médico, o unit_admin deve ver **todos os usuários com perfil `medico` vinculados à unidade**, mesmo que ainda não tenham laudos.

Sugestão de exibição:
- Médicos com preço configurado (vigente).
- Médicos sem preço configurado (destaque de pendência).
- Opcionalmente: indicar médicos com produção na competência atual.

---

## 9. Escopo da Etapa 1

### Backend (tRPC procedures)

| Procedure | Perfil | Descrição |
|-----------|--------|-----------|
| `billing.setUnitPrice` | admin_master | Cadastrar/editar preço da unidade para a plataforma |
| `billing.setDoctorPrice` | unit_admin | Cadastrar/editar preço do médico por unidade |
| `billing.calculateCompetence` | admin_master / unit_admin | Calcular/recalcular apuração de uma competência |
| `billing.closeCompetence` | admin_master / unit_admin | Fechar competência (congela totais) |
| `billing.getUnitSummary` | admin_master / unit_admin | Consultar apuração da unidade por competência |
| `billing.getDoctorSummary` | medico | Consultar produção e valor a receber |
| `billing.getAdminConsolidated` | admin_master | Faturamento consolidado de todas as unidades |

### Frontend

| Tela | Perfil | Conteúdo |
|------|--------|----------|
| Financeiro (admin) | admin_master | Configurar preço por unidade + faturamento mensal |
| Financeiro (unidade) | unit_admin | Configurar preço por médico + passivo da unidade |
| Financeiro (médico) | medico | Produção e valor a receber por competência |

### Validações obrigatórias

- Preço não pode ser negativo ou zero.
- Sem sobreposição de vigência (validar no backend antes de inserir).
- Fechamento bloqueado se houver itens sem preço configurado.
- Competência fechada não recalcula automaticamente.
- unit_admin só pode configurar preços da própria unidade.
- admin_master só pode configurar preço da plataforma (não o preço do médico).

---

## 10. O que não entra na Etapa 1

- Exportação/PDF de relatórios.
- Status financeiros além de `open` e `closed`.
- Reabertura de competência fechada (Etapa 3).
- Alertas automáticos de pendência.
- Integração com sistemas externos de pagamento.
- Script de conferência de itemização (Etapa 4).

---

## 11. Etapas futuras (resumo)

| Etapa | Conteúdo |
|-------|----------|
| **1** | Schema + backend + telas básicas por perfil (implementar primeiro) |
| **2** | Filtros avançados, histórico de competências, consolidado geral |
| **3** | Fechamento com bloqueio real, reabertura controlada, exportação PDF |
| **4** | Script de conferência de itemização, alertas de divergência |

---

## 12. Arquivos que serão criados/modificados na Etapa 1

```
drizzle/schema.ts                          ← 5 novas tabelas
drizzle/XXXX_billing_module.sql            ← migration gerada
server/routers/billing.ts                  ← procedures tRPC
server/db.ts                               ← helpers de consulta billing
client/src/pages/BillingAdminPage.tsx      ← tela admin_master
client/src/pages/BillingUnitPage.tsx       ← tela unit_admin
client/src/pages/BillingDoctorPage.tsx     ← tela médico
client/src/App.tsx                         ← registrar rotas
```

---

*Documento elaborado em 05/04/2026. Não iniciar implementação sem ler este documento na íntegra.*
