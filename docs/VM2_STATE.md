# VM2 — Estado do Banco de Dados (pacs_portal)

> **Atualizado em:** 2026-04-08  
> **Versão do código:** pacs-v4 (branch `main`)  
> **MySQL:** 8.0.45-0ubuntu0.22.04.1  
> **Host:** VM2 — `172.16.3.101`  
> **Banco:** `pacs_portal`  
> **Usuário da aplicação:** `pacs_user@localhost`

---

## Resumo das Migrações Aplicadas

| ID | Hash | Data |
|----|------|------|
| 1 | `814a08e4...` | Migração inicial |
| 2 | `5f4fdb86...` | Permissões e unidades |
| 3 | `15d2d450...` | Anamnese e anotações |
| 4 | `314284d2...` | Frases e grupos |
| 5 | `06a907ca...` | Versões de laudos |

> As migrações acima foram aplicadas via Drizzle Kit. As alterações posteriores (v4) foram aplicadas manualmente via SQL direto, conforme descrito abaixo.

---

## Alterações Manuais Aplicadas em 2026-04-08

### 1. `users.expiration_date` — Conversão de tipo

- **Antes:** `BIGINT` (timestamp Unix em milissegundos)
- **Depois:** `DATE` (formato `YYYY-MM-DD`)
- **Dado convertido:** usuário `lima` tinha `1775606399000` → convertido para `2026-04-07`

### 2. `study_metadata.exam_count` — Nova coluna

```sql
ALTER TABLE study_metadata ADD COLUMN exam_count INT DEFAULT 1;
```

### 3. `reports` — Índice único

```sql
ALTER TABLE reports ADD UNIQUE INDEX reports_uid_unit_idx (study_instance_uid, unit_id);
```
> Já existia — confirmado sem erro.

### 4. `user_unit_permissions.createdAt/updatedAt` — Colunas de auditoria

> Já existiam — confirmado sem erro.

### 5. Tabelas removidas

```sql
DROP TABLE IF EXISTS exam_catalog;
DROP TABLE IF EXISTS report_sections;
DROP TABLE IF EXISTS study_labels;
```

---

## Estrutura Completa das Tabelas (29 tabelas)

### Tabelas do sistema principal

| Tabela | Descrição |
|--------|-----------|
| `__drizzle_migrations` | Controle de migrações do Drizzle |
| `units` | Unidades de saúde (clínicas/hospitais) |
| `users` | Usuários do sistema (RBAC) |
| `user_unit_permissions` | Permissões granulares por usuário/unidade |
| `studies_cache` | Cache local de estudos DICOM do Orthanc |
| `templates` | Templates de laudos por unidade/modalidade |
| `reports` | Laudos radiológicos |
| `report_versions` | Histórico de versões dos laudos |
| `audit_log` | Log de auditoria completo |
| `anamnesis` | Anamnese clínica detalhada |
| `anamnesis_simple` | Indicação clínica simplificada |
| `study_metadata` | Metadados editáveis dos estudos |
| `phrase_groups` | Grupos de frases pré-definidas |
| `phrases` | Frases pré-definidas para laudos |
| `dicom_annotations` | Anotações DICOM persistentes do viewer |
| `user` | Tabela legada (OAuth Manus — não remover) |

### Tabelas do módulo financeiro V2/V3

| Tabela | Descrição |
|--------|-----------|
| `financial_responsibles` | Entidade pagadora (PF ou PJ) |
| `financial_responsible_users` | Vínculo usuário ↔ responsável financeiro |
| `financial_responsible_units` | Vínculo unidade ↔ responsável com vigência |
| `billing_system_unit_prices` | Preço do sistema por unidade com vigência |
| `billing_doctor_unit_prices` | Preço do médico por unidade com vigência |
| `billing_report_items` | Itemização auditável por laudo faturável |
| `billing_monthly_system_by_unit` | Consolidado mensal sistema por unidade |
| `billing_monthly_doctor_by_unit` | Consolidado mensal médico por unidade |
| `billing_cycle_configs` | Configuração do ciclo financeiro por unidade |
| `billing_cycles` | Ciclos financeiros abertos/fechados |
| `billing_visit_events` | Evento financeiro por visita (paciente+data) |
| `billing_cycle_doctor_summary` | Consolidado do médico por ciclo e unidade |
| `billing_cycle_system_summary` | Consolidado do sistema por ciclo e unidade |

---

## Detalhamento das Colunas Críticas

### `users`

| Coluna | Tipo | Observação |
|--------|------|-----------|
| `id` | INT AUTO_INCREMENT | PK |
| `openId` | VARCHAR(64) UNIQUE | ID OAuth Manus |
| `unit_id` | INT NULL | Unidade principal |
| `name` | TEXT NULL | Nome completo |
| `email` | VARCHAR(320) NULL | |
| `username` | VARCHAR(64) UNIQUE NULL | Login local |
| `password_hash` | VARCHAR(255) NULL | Senha local (bcrypt) |
| `loginMethod` | VARCHAR(64) NULL | `oauth` ou `local` |
| `role` | ENUM | `admin_master`, `unit_admin`, `medico`, `viewer`, `operador`, `responsavel_financeiro` |
| `isActive` | BOOLEAN | Default `TRUE` |
| `expiration_date` | **DATE NULL** | Convertido de BIGINT em 2026-04-08 |
| `crm` | VARCHAR(50) NULL | CRM do médico |
| `signature_url` | TEXT NULL | URL da assinatura (S3) |
| `stamp_url` | TEXT NULL | URL do carimbo (S3) |
| `createdAt` | TIMESTAMP | |
| `updatedAt` | TIMESTAMP | |
| `lastSignedIn` | TIMESTAMP | |

### `units`

| Coluna | Tipo | Observação |
|--------|------|-----------|
| `id` | INT AUTO_INCREMENT | PK |
| `name` | VARCHAR(255) | |
| `slug` | VARCHAR(100) UNIQUE | |
| `isActive` | BOOLEAN | |
| `orthanc_base_url` | VARCHAR(500) NULL | URL interna do Orthanc |
| `orthanc_public_url` | VARCHAR(500) NULL | URL pública via NAT |
| `orthanc_basic_user` | VARCHAR(100) NULL | |
| `orthanc_basic_pass` | VARCHAR(255) NULL | |
| `pacs_ip` | VARCHAR(45) NULL | IP do PACS/DICOM |
| `pacs_port` | INT NULL | Porta DICOM |
| `pacs_ae_title` | VARCHAR(16) NULL | AE Title do PACS |
| `pacs_local_ae_title` | VARCHAR(16) NULL | Default: `PACSMANUS` |
| `address` | VARCHAR(255) NULL | |
| `equipment_info` | TEXT NULL | |
| `logoUrl` | VARCHAR(500) NULL | Logo (campo legado) |
| `logo_url` | TEXT NULL | Logo (campo atual) |

---

## Conexão do Banco

```
Host:     172.16.3.101 (VM2)
Porta:    3306
Banco:    pacs_portal
Usuário:  pacs_user
Senha:    (configurada no .env da VM1)
```

A string de conexão usada no código (`.env` da VM1):

```
DATABASE_URL=mysql://pacs_user:SENHA@172.16.3.101:3306/pacs_portal
```

---

## Próximos Passos

Após atualizar a VM1 com o código v4, as migrações futuras devem ser geradas via:

```bash
pnpm drizzle-kit generate
```

E aplicadas diretamente na VM2 via SQL (não usar `drizzle-kit push` em produção).
