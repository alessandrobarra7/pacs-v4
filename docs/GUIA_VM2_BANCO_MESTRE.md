# Guia Mestre — VM2 / Banco de Dados

**Projeto:** PACS Portal v4
**Gerado em:** 07/04/2026
**Atualizado em:** 12/04/2026
**Status:** Documento canônico — substitui qualquer orientação anterior conflitante sobre a VM2

> Este documento é a referência definitiva para criação, reconstrução e validação do banco de dados da VM2. Sempre que houver divergência entre este guia e documentação mais antiga, prevalece este documento.

---

## 1. Finalidade

Este guia é a mesclagem entre o relatório canônico (que define a estrutura verdadeira do banco conforme o código-fonte) e o guia operacional prático de implantação da VM2. As regras fundamentais são:

1. A verdade estrutural do banco é definida pelo código atual do projeto.
2. A parte prática de criação e validação foi mantida, mas corrigida para eliminar conflitos com documentação antiga.
3. Sempre que houver divergência entre documentação antiga e código, **prevalece o código**.

---

## 2. Fontes Canônicas

As únicas fontes consideradas definitivas para a estrutura do banco são:

| Fonte | Papel |
|---|---|
| `drizzle/schema.ts` | Definição de todas as tabelas, colunas, tipos e enums |
| `drizzle/meta/_journal.json` | Lista oficial das migrations válidas |
| `drizzle/*.sql` listados no journal | SQL de cada migration |
| `server/db.ts`, `server/routers.ts` | Uso real das tabelas no backend |
| `client/src/pages/*` | Uso real no frontend |

Os arquivos abaixo **não definem** a estrutura canônica e não devem ser usados como referência:

- `README.md`, `DEPLOY.md`, `ENV_REFERENCE.md`
- `scripts/seed-production.mjs`
- Arquivos `.txt` e `.md` antigos do repositório

---

## 3. Topologia do Ambiente

| VM | IP | Papel | Serviços |
|---|---|---|---|
| **VM1** | `172.16.3.100` | Aplicação | Node.js, PM2, Nginx |
| **VM2** | `172.16.3.101` | Banco de dados | MySQL 8.0, porta 3306 |

**Banco:** `pacs_portal` | **Charset:** `utf8mb4` | **Collation:** `utf8mb4_unicode_ci`

**Regra de rede:** a porta 3306 da VM2 deve aceitar conexões **somente** da VM1 (`172.16.3.100`).

---

## 4. Credenciais — Regra Correta

O usuário da aplicação no MySQL é `pacs_user`, com acesso restrito ao host `172.16.3.100`.

> **Importante:** a senha `root` do MySQL da VM2 **não é** a senha canônica da aplicação. Não embutir senha root fixa em documentação como se fosse padrão do projeto.

A regra correta é:

1. Escolher uma única senha para o usuário `pacs_user`.
2. Criar esse usuário na VM2 com essa senha.
3. Repetir exatamente a mesma senha na variável `DATABASE_URL` da VM1.

**String de conexão canônica na VM1:**
```
DATABASE_URL=mysql://pacs_user:<SENHA_PACS_USER>@172.16.3.101:3306/pacs_portal
```

---

## 5. Criação Prática da VM2 do Zero

### 5.1 Instalar o MySQL 8.0
```bash
# Executar na VM2 como root
apt update
apt install -y mysql-server
```

### 5.2 Iniciar e habilitar o serviço
```bash
# Executar na VM2 como root
systemctl enable mysql
systemctl start mysql
systemctl status mysql
```

### 5.3 Entrar no MySQL como root
```bash
# Executar na VM2 como root
mysql -u root -p
```

### 5.4 Criar banco e usuário da aplicação
```sql
-- Executar dentro do MySQL na VM2
CREATE DATABASE IF NOT EXISTS pacs_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'pacs_user'@'172.16.3.100'
  IDENTIFIED BY '<SENHA_PACS_USER>';

GRANT ALL PRIVILEGES ON pacs_portal.* TO 'pacs_user'@'172.16.3.100';
FLUSH PRIVILEGES;
```

### 5.5 Ajustar bind-address
```bash
# Editar na VM2: /etc/mysql/mysql.conf.d/mysqld.cnf
bind-address = 172.16.3.101
# (alternativa aceitável: bind-address = 0.0.0.0)

# Reiniciar o serviço
systemctl restart mysql
```

### 5.6 Liberar firewall apenas para a VM1
```bash
# Executar na VM2 como root
ufw allow from 172.16.3.100 to any port 3306
ufw deny 3306
ufw status
```

---

## 6. Ordem Oficial das Migrations Válidas

Aplicar **somente** as migrations listadas no journal oficial (`drizzle/meta/_journal.json`):

| # | Arquivo |
|---|---|
| 0000 | `0000_dapper_pixie.sql` |
| 0001 | `0001_public_molecule_man.sql` |
| 0002 | `0002_married_nehzno.sql` |
| 0003 | `0003_black_luckman.sql` |
| 0004 | `0004_sleepy_cyclops.sql` |
| 0005 | `0005_organic_santa_claus.sql` |
| 0006 | `0006_parallel_betty_brant.sql` |
| 0007 | `0007_normal_kang.sql` |
| 0008 | `0008_lively_proemial_gods.sql` |
| 0009 | `0009_dear_tyger_tiger.sql` |
| 0010 | `0010_lumpy_wasp.sql` |
| 0011 | `0011_pale_moon_knight.sql` |
| 0012 | `0012_wonderful_secret_warriors.sql` |
| 0013 | `0013_slimy_thunderbird.sql` |
| 0014 | `0014_blushing_ser_duncan.sql` |
| 0015 | `0015_freezing_toxin.sql` |
| 0016 | `0016_absurd_dark_beast.sql` |
| 0017 | `0017_outstanding_frightful_four.sql` |
| 0018 | `0018_dizzy_moon_knight.sql` |

**NÃO aplicar:**
- `0007_add_anamnesis.sql`
- `0017_wooden_hercules.sql`

> Se a VM2 estiver vazia, aplicar o histórico oficial do journal em ordem. Nunca escolher migrations pelo nome — usar apenas as que constam no journal.

---

## 7. Como Aplicar as Migrations com Segurança

```bash
# Método 1 — aplicar localmente na VM2 como root
mysql -u root -p pacs_portal < /caminho/para/migracao.sql

# Método 2 — aplicar a partir da VM1 com o usuário da aplicação
mysql -h 172.16.3.101 -u pacs_user -p'<SENHA_PACS_USER>' pacs_portal < drizzle/0012_wonderful_secret_warriors.sql

# Método 3 — comando inline
mysql -u root -p pacs_portal -e "ALTER TABLE ..."
```

> **Atenção:** os arquivos Drizzle podem conter o marcador `--> statement-breakpoint`. Esse marcador **não é SQL válido**. Se aplicar manualmente, remova esses marcadores ou execute os statements separadamente.

---

## 8. Estado Final Canônico do Banco

O banco final deve possuir exatamente **14 tabelas ativas**:

| # | Tabela |
|---|---|
| 1 | `units` |
| 2 | `users` |
| 3 | `user_unit_permissions` |
| 4 | `studies_cache` |
| 5 | `templates` |
| 6 | `reports` |
| 7 | `report_versions` |
| 8 | `audit_log` |
| 9 | `anamnesis` |
| 10 | `anamnesis_simple` |
| 11 | `dicom_annotations` |
| 12 | `study_metadata` |
| 13 | `phrase_groups` |
| 14 | `phrases` |

---

## 9. Estrutura Canônica das Tabelas

### 9.1 units
| Coluna | Tipo | Observação |
|---|---|---|
| id | int auto_increment | PK |
| name | varchar(255) not null | |
| slug | varchar(100) not null unique | |
| isActive | boolean not null default true | |
| orthanc_base_url | varchar(500) null | |
| orthanc_public_url | varchar(500) null | |
| orthanc_basic_user | varchar(100) null | |
| orthanc_basic_pass | varchar(255) null | |
| pacs_ip | varchar(45) null | |
| pacs_port | int null | |
| pacs_ae_title | varchar(16) null | |
| pacs_local_ae_title | varchar(16) null default 'PACSMANUS' | |
| address | varchar(500) null | |
| equipment_info | text null | |
| logoUrl | varchar(500) null | Coluna legada — manter |
| logo_url | text null | Coluna nova — manter ambas |
| createdAt | timestamp not null default now() | |
| updatedAt | timestamp not null default now() on update current_timestamp | |

### 9.2 users
| Coluna | Tipo | Observação |
|---|---|---|
| id | int auto_increment | PK |
| openId | varchar(64) not null unique | |
| unit_id | int null | |
| name | text null | |
| email | varchar(320) null | |
| username | varchar(64) null unique | |
| password_hash | varchar(255) null | |
| loginMethod | varchar(64) null | |
| role | enum('admin_master','unit_admin','medico','viewer','operador') not null default 'viewer' | |
| isActive | boolean not null default true | |
| expiration_date | date null | Manter como DATE |
| crm | varchar(50) null | |
| signature_url | text null | |
| stamp_url | text null | |
| createdAt | timestamp not null default now() | |
| updatedAt | timestamp not null default now() on update current_timestamp | |
| lastSignedIn | timestamp not null default now() | |

### 9.3 user_unit_permissions
| Coluna | Tipo |
|---|---|
| id | int auto_increment PK |
| user_id | int not null |
| unit_id | int not null |
| view_studies | boolean not null default true |
| edit_reports | boolean not null default false |
| view_anamnesis | boolean not null default false |
| print_reports | boolean not null default false |
| manage_templates | boolean not null default false |
| createdAt | timestamp not null default now() |
| updatedAt | timestamp not null default now() on update current_timestamp |

### 9.4 studies_cache
| Coluna | Tipo |
|---|---|
| id | int auto_increment PK |
| unit_id | int not null |
| orthanc_study_id | varchar(64) null |
| study_instance_uid | varchar(128) null |
| patient_name | varchar(255) null |
| patient_id | varchar(64) null |
| accession_number | varchar(64) null |
| study_date | date null |
| modality | varchar(50) null |
| description | text null |
| studyMetadata | json null |
| createdAt | timestamp not null default now() |
| updatedAt | timestamp not null default now() on update current_timestamp |

### 9.5 templates
| Coluna | Tipo |
|---|---|
| id | int auto_increment PK |
| unit_id | int null |
| owner_user_id | int null |
| name | varchar(255) not null |
| modality | varchar(50) null |
| exam_title | varchar(255) null |
| bodyTemplate | text not null |
| fields | json null |
| isGlobal | boolean not null default false |
| isActive | boolean not null default true |
| createdBy | int null |
| createdAt | timestamp not null default now() |
| updatedAt | timestamp not null default now() on update current_timestamp |

### 9.6 reports
| Coluna | Tipo | Observação |
|---|---|---|
| id | int auto_increment | PK |
| unit_id | int not null | |
| study_id | int null | |
| study_instance_uid | varchar(128) null | |
| template_id | int null | |
| author_user_id | int not null | |
| body | text not null | JSON multi-seção: `[{title, body}, ...]` |
| status | enum('draft','signed','revised') not null default 'draft' | |
| version | int not null default 1 | |
| signedAt | timestamp null | |
| signedBy | int null | |
| createdAt | timestamp not null default now() | |
| updatedAt | timestamp not null default now() on update current_timestamp | |
| **Índice único** | `reports_uid_unit_idx` (study_instance_uid, unit_id) | Obrigatório |

### 9.7 report_versions
| Coluna | Tipo |
|---|---|
| id | int auto_increment PK |
| report_id | int not null |
| version | int not null |
| body | text not null |
| status | enum('draft','signed','revised') not null |
| reason | varchar(500) null |
| saved_by_user_id | int not null |
| saved_at | timestamp not null default now() |

### 9.8 audit_log
| Coluna | Tipo |
|---|---|
| id | int auto_increment PK |
| user_id | int null |
| unit_id | int null |
| action | enum('LOGIN','LOGOUT','VIEW_STUDY','OPEN_VIEWER','CREATE_REPORT','UPDATE_REPORT','SIGN_REPORT','DELETE_REPORT','CREATE_USER','UPDATE_USER','DELETE_USER','CREATE_UNIT','UPDATE_UNIT','DELETE_UNIT','PACS_QUERY','PACS_DOWNLOAD','CREATE_ANAMNESIS','EDIT_STUDY_METADATA') not null |
| target_type | varchar(50) null |
| target_id | varchar(100) null |
| ip_address | varchar(45) null |
| user_agent | text null |
| metadata | json null |
| timestamp | timestamp not null default now() |

### 9.9 anamnesis
| Coluna | Tipo |
|---|---|
| id | int auto_increment PK |
| study_instance_uid | varchar(128) not null |
| unit_id | int null |
| created_by_user_id | int null |
| exam_area | varchar(50) null |
| main_symptom | varchar(100) null |
| symptom_duration_days | int null |
| symptom_intensity | varchar(20) null |
| has_fever | boolean default false |
| fever_temperature | decimal(4,1) null |
| has_dyspnea | boolean default false |
| has_chest_pain | boolean default false |
| associated_symptoms | text null |
| has_hypertension | boolean default false |
| has_diabetes | boolean default false |
| has_anxiety | boolean default false |
| has_previous_lung_disease | boolean default false |
| uses_continuous_medication | boolean default false |
| medications_list | text null |
| exam_purpose | varchar(50) null |
| suggested_cid | varchar(20) null |
| suggested_cid_description | varchar(255) null |
| anamnesis_data | json null |
| createdAt | timestamp not null default now() |
| updatedAt | timestamp not null default now() on update current_timestamp |

### 9.10 anamnesis_simple
| Coluna | Tipo |
|---|---|
| id | int auto_increment PK |
| study_instance_uid | varchar(128) not null unique |
| unit_id | int null |
| created_by_user_id | int null |
| patient_name | varchar(255) null |
| presets | json not null default ('[]') |
| manual_text | text not null |
| createdAt | timestamp not null default now() |
| updatedAt | timestamp not null default now() on update current_timestamp |

### 9.11 dicom_annotations
| Coluna | Tipo |
|---|---|
| id | int auto_increment PK |
| study_instance_uid | varchar(128) not null |
| series_instance_uid | varchar(128) null |
| user_id | int not null |
| tool_name | varchar(64) not null default 'Length' |
| annotation_uid | varchar(128) not null unique |
| annotation_data | json not null |
| label | varchar(255) null |
| createdAt | timestamp not null default now() |
| updatedAt | timestamp not null default now() on update current_timestamp |

### 9.12 study_metadata
| Coluna | Tipo | Observação |
|---|---|---|
| id | int auto_increment | PK |
| study_instance_uid | varchar(128) not null | |
| unit_id | int not null | |
| patient_name_override | varchar(255) null | |
| description_override | varchar(255) null | |
| notes | text null | |
| edited_by_user_id | int not null | |
| edited_by_name | varchar(255) null | |
| createdAt | timestamp not null default now() | |
| updatedAt | timestamp not null default now() on update current_timestamp | |
| exam_count | int null default 1 | Migration 0018 — pendente na VM2 |

### 9.13 phrase_groups
| Coluna | Tipo |
|---|---|
| id | int auto_increment PK |
| name | varchar(100) not null |
| color | varchar(30) null default 'blue' |
| sort_order | int null default 0 |
| is_global | boolean not null default true |
| created_by_user_id | int null |
| isActive | boolean not null default true |
| createdAt | timestamp not null default now() |

### 9.14 phrases
| Coluna | Tipo |
|---|---|
| id | int auto_increment PK |
| group_id | int not null |
| user_id | int null |
| content | text not null |
| is_global | boolean not null default false |
| is_favorite | boolean not null default false |
| sort_order | int null default 0 |
| isActive | boolean not null default true |
| createdAt | timestamp not null default now() |
| updatedAt | timestamp not null default now() on update current_timestamp |

---

## 10. Enums e Restrições Obrigatórias

| Tabela.Coluna | Valores válidos |
|---|---|
| `users.role` | `'admin_master','unit_admin','medico','viewer','operador'` |
| `reports.status` | `'draft','signed','revised'` |
| `report_versions.status` | `'draft','signed','revised'` |
| `audit_log.action` | `'LOGIN','LOGOUT','VIEW_STUDY','OPEN_VIEWER','CREATE_REPORT','UPDATE_REPORT','SIGN_REPORT','DELETE_REPORT','CREATE_USER','UPDATE_USER','DELETE_USER','CREATE_UNIT','UPDATE_UNIT','DELETE_UNIT','PACS_QUERY','PACS_DOWNLOAD','CREATE_ANAMNESIS','EDIT_STUDY_METADATA'` |

**Restrições UNIQUE obrigatórias:**

| Tabela | Coluna(s) | Nome do índice |
|---|---|---|
| `units` | `slug` | — |
| `users` | `openId` | — |
| `users` | `username` | — |
| `anamnesis_simple` | `study_instance_uid` | — |
| `dicom_annotations` | `annotation_uid` | — |
| `reports` | `(study_instance_uid, unit_id)` | `reports_uid_unit_idx` |

---

## 11. O Que Não Deve Existir

**Tabelas que não fazem parte do estado final:**
- `exam_catalog`
- `report_sections`
- `study_labels`

**Roles antigas ou incorretas:**
- `user`, `admin`, `admin_unit`, `radiologist`, `referring_doctor`, `technician`

**Arquivos que não devem ser usados como definição final:**
- `scripts/seed-production.mjs`
- Migrations fora do journal oficial
- Documentos antigos com credenciais fixas conflitantes

---

## 12. Inconsistências Conhecidas do Projeto

Estas inconsistências existem no código e **não devem ser "corrigidas errado"** no banco:

| Inconsistência | Orientação |
|---|---|
| `users.expiration_date` — tratado de forma inconsistente em alguns trechos | Manter como `DATE` no banco |
| `units.logoUrl` vs `units.logo_url` — duas colunas coexistem | Manter **ambas** no banco |
| `units.pacs_local_ae_title` — alguns formulários enviam `'LAUDS'` | Manter `'PACSMANUS'` como default estrutural |
| `scripts/seed-production.mjs` — representa subconjunto antigo do schema | Nunca usar como definição canônica |

---

## 13. Consultas de Validação Após a Criação

```bash
# Executar na VM2 como root (ou na VM1 com pacs_user)

# Listar tabelas
mysql -u root -p -D pacs_portal -e "SHOW TABLES;"

# Checar colunas-chave
mysql -u root -p -D pacs_portal -e "SHOW COLUMNS FROM users;"
mysql -u root -p -D pacs_portal -e "SHOW COLUMNS FROM units;"
mysql -u root -p -D pacs_portal -e "SHOW COLUMNS FROM templates;"
mysql -u root -p -D pacs_portal -e "SHOW COLUMNS FROM study_metadata;"

# Checar enum de users.role
mysql -u root -p -D pacs_portal -e "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='pacs_portal' AND TABLE_NAME='users' AND COLUMN_NAME='role';"

# Checar enum de audit_log.action
mysql -u root -p -D pacs_portal -e "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='pacs_portal' AND TABLE_NAME='audit_log' AND COLUMN_NAME='action';"

# Checar índice único de reports
mysql -u root -p -D pacs_portal -e "SHOW INDEX FROM reports WHERE Key_name='reports_uid_unit_idx';"

# Checar ausência de tabelas legadas
mysql -u root -p -D pacs_portal -e "SHOW TABLES LIKE 'exam_catalog';"
mysql -u root -p -D pacs_portal -e "SHOW TABLES LIKE 'report_sections';"
mysql -u root -p -D pacs_portal -e "SHOW TABLES LIKE 'study_labels';"
```

---

## 14. Checklist Prático Antes de Ligar a VM1 no Banco

- [ ] MySQL 8.0 instalado e em execução na VM2
- [ ] Banco `pacs_portal` criado com `utf8mb4` / `utf8mb4_unicode_ci`
- [ ] Usuário `pacs_user` criado para origem `172.16.3.100`
- [ ] `DATABASE_URL` da VM1 aponta para `172.16.3.101:3306` com a mesma senha do `pacs_user`
- [ ] `bind-address` ajustado para aceitar conexão remota
- [ ] Firewall liberado somente para `172.16.3.100` na porta 3306
- [ ] Somente as migrations do journal oficial foram aplicadas
- [ ] As 14 tabelas finais existem
- [ ] `users.role` contém exatamente 5 roles válidas
- [ ] `audit_log.action` contém `DELETE_REPORT` e `EDIT_STUDY_METADATA`
- [ ] `study_metadata` possui `exam_count`
- [ ] `templates` possui `owner_user_id` e `exam_title`
- [ ] `reports` possui índice único `reports_uid_unit_idx`
- [ ] `units` possui `logoUrl` e `logo_url`
- [ ] Backup realizado antes de qualquer alteração em banco já existente

---

## 15. Sequência Segura de Deploy

```bash
# PASSO 1 — Backup do banco atual (executar na VM2 como root)
mysqldump -u root -p --single-transaction --routines --triggers pacs_portal > /backup/pacs_portal_$(date +%Y%m%d_%H%M).sql

# PASSO 2 — Validar estado do banco (executar na VM2 como root)
mysql -u root -p -D pacs_portal -e "SHOW TABLES;"
mysql -u root -p -D pacs_portal -e "SHOW COLUMNS FROM users;"

# PASSO 3 — Aplicar migrations pendentes, respeitando o journal oficial
# (ver seção 6 e 7 deste documento)

# PASSO 4 — Testar conectividade da VM1 com a VM2 (executar na VM1)
mysql -h 172.16.3.101 -u pacs_user -p'<SENHA_PACS_USER>' pacs_portal -e "SELECT id, name FROM units;"

# PASSO 5 — Atualizar o código da VM1 (executar na VM1)
cd /var/www/pacs-portal
git pull origin main
pnpm install
pnpm build
pm2 restart pacs-portal
```

---

## 16. Migrations Pendentes na VM2 (Estado em 07/04/2026)

Com base na verificação real do banco em 07/04/2026, as seguintes operações ainda não foram aplicadas:

### Migration 0017 — DROP tabelas legadas
```sql
-- Executar na VM2: mysql -u root -p pacs_portal
-- Remover tabelas obsoletas que não fazem parte do estado final
DROP TABLE IF EXISTS exam_catalog;
DROP TABLE IF EXISTS report_sections;
DROP TABLE IF EXISTS study_labels;
```

### Migration 0018 — Adicionar exam_count
```sql
-- Executar na VM2: mysql -u root -p pacs_portal
ALTER TABLE study_metadata ADD COLUMN exam_count int NULL DEFAULT 1;
```

**Verificação após aplicar:**
```bash
# Executar na VM2 como root
mysql -u root -p -D pacs_portal -e "SHOW COLUMNS FROM study_metadata LIKE 'exam_count';"
mysql -u root -p -D pacs_portal -e "SHOW TABLES LIKE 'exam_catalog';"
```

---

## 17. Validação Realizada em 12/04/2026

Em 12/04/2026 foi feita uma comparação completa entre o banco real da VM2 e o `drizzle/schema.ts`.

**Resultado:** banco 100% sincronizado com o código.

### Ação executada

A tabela `user` (singular) foi identificada como resíduo legado — criada manualmente antes da migração para Drizzle, com 1 registro de admin de teste (`local_admin_001`). O usuário equivalente já existia na tabela canônica `users` (id=1, username=admin, role=admin_master, isActive=1). A tabela foi removida:

```sql
-- Executado na VM2 em 12/04/2026
DROP TABLE `user`;
```

### Estado atual do banco (12/04/2026)

| Verificação | Resultado |
|---|---|
| Total de tabelas de negócio | 27 (todas as do `drizzle/schema.ts`) |
| Tabela `user` (singular) legada | Removida |
| Tabelas legadas (`exam_catalog`, `report_sections`, `study_labels`) | Já removidas (migration 0017) |
| `study_metadata.exam_count` | Presente (migration 0018 aplicada) |
| `users.role` | 6 roles: `admin_master`, `unit_admin`, `medico`, `viewer`, `operador`, `responsavel_financeiro` |
| `units.logoUrl` e `units.logo_url` | Ambas presentes |
| Todas as tabelas de billing | Presentes e sincronizadas |

> **Nota:** o total de tabelas de negócio passou de 14 (documentado na seção 8) para 27 após a adição do módulo financeiro completo (billing). A seção 8 está desatualizada — o número correto é 27 tabelas.

---

*Este documento é mantido pelo repositório `alessandrobarra7/pacs-v4`. Para atualizações, editar `docs/GUIA_VM2_BANCO_MESTRE.md` e fazer commit no branch `main`.*
