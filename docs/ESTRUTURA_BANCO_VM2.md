# Estrutura Real do Banco de Dados da VM2 — `pacs_portal`

> Inventário estrutural capturado na VM2 em 17/08/2026. Este documento registra apenas metadados do schema; não contém linhas de pacientes, laudos, senhas, tokens ou valores clínicos.

## 1. Objetivo e escopo

A VM2 é a camada relacional da arquitetura PACS. Ela deve guardar dados estruturados, índices, metadados, controle de acesso, auditoria, configuração de unidades, status de laudos e referências aos objetos armazenados na VM3. Os bytes de PDFs, imagens, áudios e demais arquivos binários não devem ser gravados em colunas do banco.

Este inventário foi produzido a partir da saída real do comando `INVENTORY_VM2` fornecido pelo administrador. A contagem de linhas apresentada pelo `information_schema.tables` é estimada pelo InnoDB e não substitui uma contagem transacional quando for necessário medir dados exatos.

## 2. Configuração observada

| Parâmetro | Valor observado |
|---|---|
| Versão do MySQL | `MySQL 8.0.46-0ubuntu0.22.04.3` |
| Diretório de dados | `/var/lib/mysql/` |
| `innodb_buffer_pool_size` observado | `128 MB` |
| Engine das tabelas | `InnoDB` |
| Collations observadas | `utf8mb4_unicode_ci` e `utf8mb4_0900_ai_ci` |
| Disco informado no diagnóstico | 98 GB totais, 12 GB usados, 82 GB livres, 13% |

## 3. Resumo de tabelas, volume e engine

| Tabela | Engine | Linhas estimadas | Dados MB | Índices MB | Collation |
|---|---:|---:|---:|---:|---|
| INVENTÁRIO | ESTRUTURAL | DO | BANCO | DE | DADOS (VM2) — PACS |
| mysql | Ver | 8.0.46-0ubuntu0.22.04.3 | for | Linux | on x86_64 ((Ubuntu)) |
| __drizzle_migrations | InnoDB | 5 | 0.02 | 0.02 | utf8mb4_unicode_ci |
| anamnesis | InnoDB | 0 | 0.02 | 0.00 | utf8mb4_unicode_ci |
| anamnesis_simple | InnoDB | 29 | 0.02 | 0.02 | utf8mb4_unicode_ci |
| audit_log | InnoDB | 2484 | 1.52 | 0.00 | utf8mb4_unicode_ci |
| billing_cycle_configs | InnoDB | 0 | 0.02 | 0.02 | utf8mb4_0900_ai_ci |
| billing_cycle_doctor_summary | InnoDB | 0 | 0.02 | 0.02 | utf8mb4_0900_ai_ci |
| billing_cycle_system_summary | InnoDB | 0 | 0.02 | 0.02 | utf8mb4_0900_ai_ci |
| billing_cycles | InnoDB | 10 | 0.02 | 0.02 | utf8mb4_0900_ai_ci |
| billing_doctor_modality_prices | InnoDB | 4 | 0.02 | 0.03 | utf8mb4_0900_ai_ci |
| billing_doctor_unit_prices | InnoDB | 7 | 0.02 | 0.00 | utf8mb4_0900_ai_ci |
| billing_monthly_doctor_by_unit | InnoDB | 0 | 0.02 | 0.02 | utf8mb4_0900_ai_ci |
| billing_monthly_system_by_unit | InnoDB | 0 | 0.02 | 0.02 | utf8mb4_0900_ai_ci |
| billing_report_items | InnoDB | 0 | 0.02 | 0.02 | utf8mb4_0900_ai_ci |
| billing_system_unit_prices | InnoDB | 1 | 0.02 | 0.00 | utf8mb4_0900_ai_ci |
| billing_visit_events | InnoDB | 12 | 0.02 | 0.03 | utf8mb4_0900_ai_ci |
| contract_custom_expenses | InnoDB | 0 | 0.02 | 0.00 | utf8mb4_unicode_ci |
| contract_revenues | InnoDB | 0 | 0.02 | 0.00 | utf8mb4_unicode_ci |
| dicom_annotations | InnoDB | 0 | 0.02 | 0.02 | utf8mb4_unicode_ci |
| exam_legends | InnoDB | 211 | 0.02 | 0.02 | utf8mb4_unicode_ci |
| financial_responsible_units | InnoDB | 7 | 0.02 | 0.00 | utf8mb4_0900_ai_ci |
| financial_responsible_users | InnoDB | 0 | 0.02 | 0.02 | utf8mb4_0900_ai_ci |
| financial_responsibles | InnoDB | 1 | 0.02 | 0.02 | utf8mb4_0900_ai_ci |
| group_permission_configs | InnoDB | 6 | 0.02 | 0.02 | utf8mb4_0900_ai_ci |
| model_layouts | InnoDB | 2 | 0.02 | 0.02 | utf8mb4_unicode_ci |
| phrase_groups | InnoDB | 3 | 0.02 | 0.00 | utf8mb4_unicode_ci |
| phrases | InnoDB | 3 | 0.02 | 0.00 | utf8mb4_unicode_ci |
| report_masks | InnoDB | 2 | 0.02 | 0.03 | utf8mb4_0900_ai_ci |
| report_readiness | InnoDB | 25 | 0.02 | 0.06 | utf8mb4_unicode_ci |
| report_versions | InnoDB | 3 | 0.02 | 0.03 | utf8mb4_unicode_ci |
| reports | InnoDB | 12 | 0.02 | 0.02 | utf8mb4_unicode_ci |
| studies_cache | InnoDB | 38 | 0.02 | 0.02 | utf8mb4_unicode_ci |
| study_attachments | InnoDB | 1 | 0.02 | 0.02 | utf8mb4_unicode_ci |
| study_audio_reports | InnoDB | 1 | 0.02 | 0.02 | utf8mb4_unicode_ci |
| study_metadata | InnoDB | 36 | 0.02 | 0.02 | utf8mb4_unicode_ci |
| templates | InnoDB | 4 | 0.02 | 0.00 | utf8mb4_unicode_ci |
| unit_doctor_compensation_rules | InnoDB | 0 | 0.02 | 0.00 | utf8mb4_unicode_ci |
| unit_doctor_scales | InnoDB | 0 | 0.02 | 0.02 | utf8mb4_unicode_ci |
| unit_exam_prices | InnoDB | 0 | 0.02 | 0.03 | utf8mb4_unicode_ci |
| unit_report_sla_configs | InnoDB | 3 | 0.02 | 0.02 | utf8mb4_unicode_ci |
| units | InnoDB | 3 | 0.02 | 0.02 | utf8mb4_unicode_ci |
| user_unit_permissions | InnoDB | 9 | 0.02 | 0.03 | utf8mb4_unicode_ci |
| users | InnoDB | 12 | 0.02 | 0.02 | utf8mb4_unicode_ci |

**Total de tabelas inventariadas:** 44.

## 4. Estrutura completa de colunas

A seguir está a estrutura observada em cada tabela. `PRI` representa chave primária, `UNI` representa índice único e `MUL` representa coluna participante de índice não único. A ausência de chave na saída não prova que não existam relacionamentos lógicos; as foreign keys e índices completos devem ser confirmados com `SHOW CREATE TABLE` em uma segunda coleta, caso necessário.

### `__drizzle_migrations`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | bigint unsigned | NO | PRI | NULL | auto_increment |
| hash | text | NO | — | NULL | — |
| created_at | bigint | YES | — | NULL | — |

### `anamnesis`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| study_instance_uid | varchar(128) | NO | — | NULL | — |
| unit_id | int | YES | — | NULL | — |
| created_by_user_id | int | YES | — | NULL | — |
| exam_area | varchar(50) | YES | — | NULL | — |
| main_symptom | varchar(100) | YES | — | NULL | — |
| symptom_duration_days | int | YES | — | NULL | — |
| symptom_intensity | varchar(20) | YES | — | NULL | — |
| has_fever | tinyint(1) | YES | — | 0 | — |
| fever_temperature | decimal(4,1) | YES | — | NULL | — |
| has_dyspnea | tinyint(1) | YES | — | 0 | — |
| has_chest_pain | tinyint(1) | YES | — | 0 | — |
| associated_symptoms | text | YES | — | NULL | — |
| has_hypertension | tinyint(1) | YES | — | 0 | — |
| has_diabetes | tinyint(1) | YES | — | 0 | — |
| has_anxiety | tinyint(1) | YES | — | 0 | — |
| has_previous_lung_disease | tinyint(1) | YES | — | 0 | — |
| uses_continuous_medication | tinyint(1) | YES | — | 0 | — |
| medications_list | text | YES | — | NULL | — |
| exam_purpose | varchar(50) | YES | — | NULL | — |
| suggested_cid | varchar(20) | YES | — | NULL | — |
| suggested_cid_description | varchar(255) | YES | — | NULL | — |
| anamnesis_data | json | YES | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `anamnesis_simple`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| study_instance_uid | varchar(128) | NO | UNI | NULL | — |
| unit_id | int | YES | — | NULL | — |
| created_by_user_id | int | YES | — | NULL | — |
| patient_name | varchar(255) | YES | — | NULL | — |
| presets | json | NO | — | NULL | — |
| manual_text | text | NO | — | NULL | — |
| createdAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `audit_log`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| user_id | int | YES | — | NULL | — |
| unit_id | int | YES | — | NULL | — |
| action | enum('LOGIN','LOGOUT','VIEW_STUDY','OPEN_VIEWER','CREATE_REPORT','UPDATE_REPORT','SIGN_REPORT','DELETE_REPORT','REVISE_REPORT','CREATE_USER','UPDATE_USER','DELETE_USER','ACTIVATE_USER','DEACTIVATE_USER','CREATE_UNIT','UPDATE_UNIT','DELETE_UNIT','PACS_QUERY','PACS_DOWNLOAD','CREATE_ANAMNESIS','EDIT_STUDY_METADATA','RESET_DOCTOR_BILLING','CREATE_LAYOUT','UPDATE_LAYOUT','DELETE_LAYOUT','BILLING_EVENT_FAILED','FINANCIAL_ENABLED','FINANCIAL_DISABLED','BILLING_EVENT_WITHOUT_FINANCIAL_ENABLED','BILLING_EVENT_CANCELLED') | NO | — | NULL | — |
| target_type | varchar(50) | YES | — | NULL | — |
| target_id | varchar(100) | YES | — | NULL | — |
| ip_address | varchar(45) | YES | — | NULL | — |
| user_agent | text | YES | — | NULL | — |
| metadata | json | YES | — | NULL | — |
| timestamp | timestamp | NO | — | now() | DEFAULT_GENERATED |

### `billing_cycle_configs`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| unit_id | int | NO | UNI | NULL | — |
| doctor_cycle_day | int | NO | — | 1 | — |
| system_cycle_day | int | NO | — | 1 | — |
| is_active | tinyint(1) | NO | — | 1 | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| created_by | int | YES | — | NULL | — |

### `billing_cycle_doctor_summary`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| doctor_cycle_id | int | NO | MUL | NULL | — |
| unit_id | int | NO | — | NULL | — |
| doctor_user_id | int | NO | — | NULL | — |
| financial_responsible_id | int | YES | — | NULL | — |
| reports_count | int | NO | — | 0 | — |
| amount_due | decimal(10,2) | NO | — | 0.00 | — |
| pending_pricing_count | int | NO | — | 0 | — |
| received_at | timestamp | YES | — | NULL | — |
| received_by | int | YES | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `billing_cycle_system_summary`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| system_cycle_id | int | NO | MUL | NULL | — |
| unit_id | int | NO | — | NULL | — |
| financial_responsible_id | int | YES | — | NULL | — |
| reports_count | int | NO | — | 0 | — |
| amount_due | decimal(10,2) | NO | — | 0.00 | — |
| pending_pricing_count | int | NO | — | 0 | — |
| paid_at | timestamp | YES | — | NULL | — |
| paid_by | int | YES | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `billing_cycles`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| unit_id | int | NO | MUL | NULL | — |
| financial_responsible_id | int | YES | — | NULL | — |
| cycle_type | enum('doctor','system') | NO | — | NULL | — |
| starts_at | date | NO | — | NULL | — |
| ends_at | date | NO | — | NULL | — |
| status | enum('open','closed') | NO | — | open | — |
| total_reports | int | NO | — | 0 | — |
| total_amount | decimal(10,2) | NO | — | 0.00 | — |
| closedAt | timestamp | YES | — | NULL | — |
| closedBy | int | YES | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| paid_status | enum('pending','paid') | NO | — | pending | — |
| paid_at | timestamp | YES | — | NULL | — |
| paid_by_user_id | int | YES | — | NULL | — |
| paid_note | varchar(500) | YES | — | NULL | — |

### `billing_doctor_modality_prices`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| financial_responsible_id | int | NO | — | NULL | — |
| unit_id | int | NO | MUL | NULL | — |
| doctor_user_id | int | NO | — | NULL | — |
| modality | varchar(10) | NO | — | NULL | — |
| price_per_report | decimal(10,2) | NO | — | NULL | — |
| starts_at | timestamp | NO | — | NULL | — |
| ends_at | timestamp | YES | — | NULL | — |
| created_by | int | NO | — | NULL | — |
| createdAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

### `billing_doctor_unit_prices`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| financial_responsible_id | int | NO | — | NULL | — |
| unit_id | int | NO | — | NULL | — |
| doctor_user_id | int | NO | — | NULL | — |
| price_per_report | decimal(10,2) | NO | — | NULL | — |
| starts_at | timestamp | NO | — | NULL | — |
| ends_at | timestamp | YES | — | NULL | — |
| created_by | int | NO | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |

### `billing_monthly_doctor_by_unit`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| financial_responsible_id | int | NO | MUL | NULL | — |
| unit_id | int | NO | — | NULL | — |
| doctor_user_id | int | NO | — | NULL | — |
| competence_year | int | NO | — | NULL | — |
| competence_month | int | NO | — | NULL | — |
| reports_count | int | NO | — | 0 | — |
| amount_due | decimal(10,2) | NO | — | 0.00 | — |
| pending_items_count | int | NO | — | 0 | — |
| status | enum('open','closed') | NO | — | open | — |
| generatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| closedAt | timestamp | YES | — | NULL | — |
| closedBy | int | YES | — | NULL | — |

### `billing_monthly_system_by_unit`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| financial_responsible_id | int | NO | MUL | NULL | — |
| unit_id | int | NO | — | NULL | — |
| competence_year | int | NO | — | NULL | — |
| competence_month | int | NO | — | NULL | — |
| reports_count | int | NO | — | 0 | — |
| amount_due | decimal(10,2) | NO | — | 0.00 | — |
| pending_items_count | int | NO | — | 0 | — |
| status | enum('open','closed') | NO | — | open | — |
| generatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| closedAt | timestamp | YES | — | NULL | — |
| closedBy | int | YES | — | NULL | — |

### `billing_report_items`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| report_id | int | NO | UNI | NULL | — |
| study_instance_uid | varchar(128) | YES | — | NULL | — |
| financial_responsible_id | int | YES | — | NULL | — |
| unit_id | int | NO | — | NULL | — |
| doctor_user_id | int | NO | — | NULL | — |
| competence_year | int | NO | — | NULL | — |
| competence_month | int | NO | — | NULL | — |
| report_status_snapshot | enum('signed','revised') | NO | — | NULL | — |
| report_signed_at | timestamp | NO | — | NULL | — |
| system_price_applied | decimal(10,2) | YES | — | NULL | — |
| doctor_price_applied | decimal(10,2) | YES | — | NULL | — |
| system_amount_due | decimal(10,2) | YES | — | NULL | — |
| doctor_amount_due | decimal(10,2) | YES | — | NULL | — |
| pricing_status | enum('ok','pending_system_price','pending_doctor_price','pending_both') | NO | — | pending_both | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `billing_system_unit_prices`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| financial_responsible_id | int | NO | — | NULL | — |
| unit_id | int | NO | — | NULL | — |
| price_per_report | decimal(10,2) | NO | — | NULL | — |
| starts_at | timestamp | NO | — | NULL | — |
| ends_at | timestamp | YES | — | NULL | — |
| created_by | int | NO | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |

### `billing_visit_events`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| report_id | int | NO | MUL | NULL | — |
| study_instance_uid | varchar(128) | YES | — | NULL | — |
| unit_id | int | NO | — | NULL | — |
| doctor_user_id | int | NO | — | NULL | — |
| financial_responsible_id | int | YES | — | NULL | — |
| report_key | varchar(300) | NO | UNI | NULL | — |
| patient_name | varchar(200) | YES | — | NULL | — |
| study_date | date | YES | — | NULL | — |
| doctor_cycle_id | int | YES | — | NULL | — |
| system_cycle_id | int | YES | — | NULL | — |
| system_price_applied | decimal(10,2) | YES | — | NULL | — |
| doctor_price_applied | decimal(10,2) | YES | — | NULL | — |
| system_amount_due | decimal(10,2) | YES | — | NULL | — |
| doctor_amount_due | decimal(10,2) | YES | — | NULL | — |
| patient_price | decimal(10,2) | YES | — | NULL | — |
| modality_snapshot | varchar(20) | YES | — | NULL | — |
| exam_name_snapshot | varchar(200) | YES | — | NULL | — |
| pricing_status | enum('ok','pending_system_price','pending_doctor_price','pending_both') | NO | — | pending_both | — |
| financial_status | enum('active','cancelled','reversed','adjusted') | NO | — | active | — |
| report_status_snapshot | enum('signed','revised') | YES | — | signed | — |
| doctor_received_at | timestamp | YES | — | NULL | — |
| doctor_received_by_user_id | int | YES | — | NULL | — |
| system_paid_at | timestamp | YES | — | NULL | — |
| system_paid_by_user_id | int | YES | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| signed_at | datetime | YES | — | NULL | — |

### `contract_custom_expenses`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| financial_responsible_id | int | NO | — | NULL | — |
| unit_id | int | YES | — | NULL | — |
| category | varchar(100) | NO | — | NULL | — |
| description | varchar(500) | YES | — | NULL | — |
| amount | decimal(10,2) | NO | — | NULL | — |
| competence_month | int | NO | — | NULL | — |
| competence_year | int | NO | — | NULL | — |
| notes | text | YES | — | NULL | — |
| created_by | int | NO | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `contract_revenues`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| financial_responsible_id | int | NO | — | NULL | — |
| unit_id | int | YES | — | NULL | — |
| amount | decimal(10,2) | NO | — | NULL | — |
| periodicity | enum('monthly','quarterly','yearly','one_time') | NO | — | monthly | — |
| starts_at | date | NO | — | NULL | — |
| ends_at | date | YES | — | NULL | — |
| description | varchar(500) | YES | — | NULL | — |
| notes | text | YES | — | NULL | — |
| created_by | int | NO | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `dicom_annotations`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| study_instance_uid | varchar(128) | NO | — | NULL | — |
| series_instance_uid | varchar(128) | YES | — | NULL | — |
| user_id | int | NO | — | NULL | — |
| tool_name | varchar(64) | NO | — | Length | — |
| annotation_uid | varchar(128) | NO | UNI | NULL | — |
| annotation_data | json | NO | — | NULL | — |
| label | varchar(255) | YES | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `exam_legends`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| exam_name | varchar(255) | NO | UNI | NULL | — |
| modality | varchar(20) | NO | — | outros | — |
| bilateral | tinyint(1) | NO | — | 0 | — |
| sort_order | int | NO | — | 0 | — |
| createdAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `financial_responsible_units`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| financial_responsible_id | int | NO | — | NULL | — |
| unit_id | int | NO | — | NULL | — |
| starts_at | timestamp | NO | — | NULL | — |
| ends_at | timestamp | YES | — | NULL | — |
| created_by | int | NO | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |

### `financial_responsible_users`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| financial_responsible_id | int | NO | MUL | NULL | — |
| user_id | int | NO | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |

### `financial_responsibles`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| person_type | enum('PF','PJ') | NO | — | PJ | — |
| legal_name | varchar(255) | NO | — | NULL | — |
| trade_name | varchar(255) | YES | — | NULL | — |
| cpf_cnpj | varchar(18) | YES | UNI | NULL | — |
| email | varchar(320) | YES | — | NULL | — |
| phone | varchar(30) | YES | — | NULL | — |
| notes | text | YES | — | NULL | — |
| isActive | tinyint(1) | NO | — | 1 | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `group_permission_configs`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| group_key | varchar(50) | NO | UNI | NULL | — |
| view_studies | tinyint(1) | NO | — | 1 | — |
| edit_reports | tinyint(1) | NO | — | 0 | — |
| view_anamnesis | tinyint(1) | NO | — | 0 | — |
| edit_anamnesis | tinyint(1) | NO | — | 0 | — |
| edit_exam_legend | tinyint(1) | NO | — | 0 | — |
| print_reports | tinyint(1) | NO | — | 0 | — |
| manage_templates | tinyint(1) | NO | — | 0 | — |
| view_financial | tinyint(1) | NO | — | 0 | — |
| updated_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| updated_by | int | YES | — | NULL | — |

### `model_layouts`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| unit_id | int | NO | UNI | NULL | — |
| header_html | text | YES | — | NULL | — |
| footer_html | text | YES | — | NULL | — |
| preferences | json | YES | — | NULL | — |
| is_active | tinyint(1) | NO | — | 1 | — |
| created_by | int | NO | — | NULL | — |
| createdAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| background_image_url | text | YES | — | NULL | — |
| footer_image_url | text | YES | — | NULL | — |
| logos | json | YES | — | NULL | — |
| block_positions | json | YES | — | NULL | — |
| background_opacity | decimal(3,2) | NO | — | 1.00 | — |
| background_size | varchar(30) | NO | — | cover | — |

### `phrase_groups`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(100) | NO | — | NULL | — |
| color | varchar(30) | YES | — | blue | — |
| sort_order | int | YES | — | 0 | — |
| is_global | tinyint(1) | NO | — | 1 | — |
| created_by_user_id | int | YES | — | NULL | — |
| isActive | tinyint(1) | NO | — | 1 | — |
| createdAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

### `phrases`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| group_id | int | NO | — | NULL | — |
| user_id | int | YES | — | NULL | — |
| content | text | NO | — | NULL | — |
| is_global | tinyint(1) | NO | — | 0 | — |
| is_favorite | tinyint(1) | NO | — | 0 | — |
| sort_order | int | YES | — | 0 | — |
| isActive | tinyint(1) | NO | — | 1 | — |
| createdAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `report_masks`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| unit_id | int | NO | MUL | NULL | — |
| owner_user_id | int | NO | MUL | NULL | — |
| scope | enum('personal','unit') | NO | — | personal | — |
| name | varchar(255) | NO | — | NULL | — |
| modality | varchar(10) | YES | — | NULL | — |
| exam_title | varchar(255) | YES | — | NULL | — |
| body | longtext | NO | — | NULL | — |
| created_by | int | NO | — | NULL | — |
| createdAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `report_readiness`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| study_instance_uid | varchar(128) | NO | MUL | NULL | — |
| unit_id | int | NO | MUL | NULL | — |
| readiness_status | enum('pending','ready_for_reporting','reported','cancelled','invalidated') | NO | MUL | ready_for_reporting | — |
| became_ready_at | timestamp | NO | — | NULL | — |
| sla_value_snapshot | int | YES | — | NULL | — |
| sla_unit_snapshot | enum('hour','day') | YES | — | NULL | — |
| due_at | timestamp | YES | MUL | NULL | — |
| readiness_source | varchar(50) | YES | — | anamnesis_simple | — |
| readiness_note | text | YES | — | NULL | — |
| reported_at | timestamp | YES | — | NULL | — |
| reported_by_user_id | int | YES | — | NULL | — |
| sla_met | tinyint(1) | YES | — | NULL | — |
| delay_seconds | int | YES | — | NULL | — |
| created_by | int | NO | — | NULL | — |
| createdAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `report_versions`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| report_id | int | NO | MUL | NULL | — |
| version | int | NO | — | 1 | — |
| body | longtext | NO | — | NULL | — |
| status | enum('draft','signed','revised') | NO | — | revised | — |
| reason | varchar(500) | YES | — | NULL | — |
| saved_by_user_id | int | NO | — | 0 | — |
| saved_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| revised_by | int | YES | MUL | NULL | — |
| created_at | bigint | YES | — | NULL | — |

### `reports`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| unit_id | int | NO | — | NULL | — |
| study_id | int | YES | — | NULL | — |
| study_instance_uid | varchar(128) | YES | MUL | NULL | — |
| template_id | int | YES | — | NULL | — |
| author_user_id | int | NO | — | NULL | — |
| body | text | NO | — | NULL | — |
| status | enum('draft','signed','revised') | NO | — | draft | — |
| version | int | NO | — | 1 | — |
| previousVersionId | int | YES | — | NULL | — |
| signedAt | timestamp | YES | — | NULL | — |
| signedBy | int | YES | — | NULL | — |
| layout_snapshot | json | YES | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `studies_cache`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| unit_id | int | NO | — | NULL | — |
| orthanc_study_id | varchar(64) | YES | — | NULL | — |
| study_instance_uid | varchar(128) | YES | UNI | NULL | — |
| patient_name | varchar(255) | YES | — | NULL | — |
| patient_id | varchar(64) | YES | — | NULL | — |
| accession_number | varchar(64) | YES | — | NULL | — |
| study_date | date | YES | — | NULL | — |
| modality | varchar(50) | YES | — | NULL | — |
| description | text | YES | — | NULL | — |
| studyMetadata | json | YES | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `study_attachments`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| study_instance_uid | varchar(128) | NO | MUL | NULL | — |
| unit_id | int | YES | — | NULL | — |
| user_id | int | NO | — | NULL | — |
| file_url | text | NO | — | NULL | — |
| file_name | varchar(255) | NO | — | NULL | — |
| file_type | varchar(100) | YES | — | NULL | — |
| createdAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

### `study_audio_reports`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| study_instance_uid | varchar(128) | NO | MUL | NULL | — |
| unit_id | int | YES | — | NULL | — |
| user_id | int | NO | — | NULL | — |
| file_url | text | NO | — | NULL | — |
| file_key | text | NO | — | NULL | — |
| file_name | varchar(255) | NO | — | NULL | — |
| file_size | int | YES | — | NULL | — |
| duration_seconds | int | YES | — | NULL | — |
| createdAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `study_metadata`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| study_instance_uid | varchar(128) | NO | MUL | NULL | — |
| unit_id | int | NO | — | NULL | — |
| patient_name_override | varchar(255) | YES | — | NULL | — |
| description_override | varchar(255) | YES | — | NULL | — |
| notes | text | YES | — | NULL | — |
| edited_by_user_id | int | NO | — | NULL | — |
| edited_by_name | varchar(255) | YES | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| exam_count | int | YES | — | 1 | — |

### `templates`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| unit_id | int | YES | — | NULL | — |
| name | varchar(255) | NO | — | NULL | — |
| modality | varchar(50) | YES | — | NULL | — |
| bodyTemplate | text | NO | — | NULL | — |
| fields | json | YES | — | NULL | — |
| isGlobal | tinyint(1) | NO | — | 0 | — |
| isActive | tinyint(1) | NO | — | 1 | — |
| createdBy | int | YES | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| owner_user_id | int | YES | — | NULL | — |
| exam_title | varchar(255) | YES | — | NULL | — |

### `unit_doctor_compensation_rules`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| unit_id | int | NO | — | NULL | — |
| doctor_user_id | int | YES | — | NULL | — |
| compensation_type | enum('per_report','per_patient','per_shift','other') | NO | — | per_report | — |
| amount | decimal(10,2) | NO | — | NULL | — |
| starts_at | date | NO | — | NULL | — |
| ends_at | date | YES | — | NULL | — |
| notes | text | YES | — | NULL | — |
| created_by | int | NO | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `unit_doctor_scales`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| unit_id | int | NO | MUL | NULL | — |
| doctor_user_id | int | NO | — | NULL | — |
| days_of_week | varchar(50) | NO | — | [] | — |
| start_time | varchar(5) | YES | — | NULL | — |
| end_time | varchar(5) | YES | — | NULL | — |
| is_active | tinyint(1) | NO | — | 1 | — |
| starts_at | date | YES | — | NULL | — |
| ends_at | date | YES | — | NULL | — |
| notes | text | YES | — | NULL | — |
| created_by | int | NO | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `unit_exam_prices`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| unit_id | int | NO | MUL | NULL | — |
| modality | varchar(20) | NO | — | NULL | — |
| exam_name | varchar(200) | NO | — | NULL | — |
| price_per_exam | decimal(10,2) | NO | — | NULL | — |
| is_active | tinyint(1) | NO | — | 1 | — |
| created_by | int | NO | — | NULL | — |
| createdAt | datetime | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updatedAt | datetime | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `unit_report_sla_configs`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| unit_id | int | NO | UNI | NULL | — |
| enabled | tinyint(1) | NO | — | 0 | — |
| sla_value | int | YES | — | NULL | — |
| sla_unit | enum('hour','day') | YES | — | NULL | — |
| effective_from | timestamp | YES | — | NULL | — |
| notes | text | YES | — | NULL | — |
| created_by | int | NO | — | NULL | — |
| createdAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

### `units`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(255) | NO | — | NULL | — |
| slug | varchar(100) | NO | UNI | NULL | — |
| isActive | tinyint(1) | NO | — | 1 | — |
| financial_enabled | tinyint(1) | NO | — | 0 | — |
| orthanc_base_url | varchar(500) | YES | — | NULL | — |
| orthanc_basic_user | varchar(100) | YES | — | NULL | — |
| orthanc_basic_pass | varchar(255) | YES | — | NULL | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| pacs_ip | varchar(45) | YES | — | NULL | — |
| pacs_port | int | YES | — | NULL | — |
| pacs_ae_title | varchar(16) | YES | — | NULL | — |
| pacs_local_ae_title | varchar(16) | YES | — | PACSMANUS | — |
| orthanc_public_url | varchar(500) | YES | — | NULL | — |
| address | varchar(255) | YES | — | NULL | — |
| equipment_info | text | YES | — | NULL | — |
| logo_url | text | YES | — | NULL | — |
| default_system_price | decimal(10,2) | YES | — | NULL | — |
| default_doctor_price | decimal(10,2) | YES | — | NULL | — |
| billing_cycle_start_day | int | YES | — | 1 | — |
| billing_cycle_end_day | int | YES | — | 31 | — |

### `user_unit_permissions`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| user_id | int | NO | MUL | NULL | — |
| unit_id | int | NO | MUL | NULL | — |
| view_studies | tinyint(1) | NO | — | 1 | — |
| edit_reports | tinyint(1) | NO | — | 0 | — |
| view_anamnesis | tinyint(1) | NO | — | 0 | — |
| print_reports | tinyint(1) | NO | — | 1 | — |
| manage_templates | tinyint(1) | NO | — | 0 | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| createdAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| group_key | enum('responsaveisFinanceiros','medicos','operadores','visualizadores','administradoresUnidade','adminsMaster','outros') | YES | — | outros | — |
| edit_anamnesis | tinyint(1) | NO | — | 0 | — |
| edit_exam_legend | tinyint(1) | NO | — | 0 | — |
| view_financial | tinyint(1) | NO | — | 0 | — |

### `users`

| Coluna | Tipo | Null | Chave | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL | auto_increment |
| openId | varchar(64) | NO | UNI | NULL | — |
| name | text | YES | — | NULL | — |
| email | varchar(320) | YES | — | NULL | — |
| loginMethod | varchar(64) | YES | — | NULL | — |
| role | enum('admin_master','unit_admin','medico','viewer','operador','responsavel_financeiro') | NO | — | viewer | — |
| createdAt | timestamp | NO | — | now() | DEFAULT_GENERATED |
| updatedAt | timestamp | NO | — | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| lastSignedIn | timestamp | NO | — | now() | DEFAULT_GENERATED |
| unit_id | int | YES | — | NULL | — |
| isActive | tinyint(1) | NO | — | 1 | — |
| username | varchar(64) | YES | — | NULL | — |
| password_hash | varchar(255) | YES | — | NULL | — |
| crm | varchar(50) | YES | — | NULL | — |
| signature_url | text | YES | — | NULL | — |
| stamp_url | text | YES | — | NULL | — |
| expiration_date | date | YES | — | NULL | — |

## 5. Divergências relevantes entre o código e a VM2 observada

| Item | Estado observado | Consequência | Ação recomendada |
|---|---|---|---|
| `reports.export_file_key` | AUSENTE | O código da assinatura não terá onde registrar a chave do export persistente se a coluna estiver ausente | Confirmar e aplicar DDL idempotente antes de assinar laudos em produção |
| `reports.export_file_url` | AUSENTE | A referência de compatibilidade do export não pode ser persistida | Confirmar e aplicar DDL idempotente antes de assinar laudos em produção |
| `reports.layout_snapshot` | presente | Preserva a composição histórica do laudo | Manter sincronizado com Drizzle e testes |
| `study_attachments.file_key` | AUSENTE | A exclusão/recuperação de anexos pode depender somente de `file_url` | Avaliar inclusão de `file_key` para referência estável do objeto VM3 |
| `study_audio_reports.file_key` | presente | Permite exclusão e recuperação pelo caminho do objeto | Manter preenchido para cada upload |
| Documentação anterior | Há documentos históricos com schema anterior | Pode induzir atualização incompleta | Usar este inventário real e o `drizzle/schema.ts` atual como fontes de reconciliação |

### Ação crítica sobre `reports`

O inventário fornecido mostra a tabela `reports` sem `export_file_key` e `export_file_url`, embora essas colunas existam no schema Drizzle atual e sejam necessárias para a exportação persistente na VM3. Isso deve ser tratado como **pendência de migração da VM2**, não como detalhe meramente documental. Antes de usar a assinatura de laudos em produção, deve-se confirmar com `SHOW COLUMNS FROM reports` e aplicar a alteração em janela controlada, com backup validado.

## 6. Dados sensíveis presentes como estrutura

A estrutura contém campos que exigem proteção operacional, mesmo sem valores no inventário: `units.orthanc_basic_pass`, `users.password_hash`, `users.signature_url`, `users.stamp_url`, dados de identificação financeira e campos de auditoria. A documentação não deve conter valores dessas colunas. O banco deve permanecer acessível somente pela VM1 e por administração autorizada; backups devem ter permissões restritas e cópia externa protegida.

## 7. Responsabilidade da VM2 na arquitetura de três VMs

| Deve permanecer na VM2 | Deve permanecer fora da VM2 |
|---|---|
| Texto estruturado e versões necessárias para edição/auditoria; usuários, unidades, RBAC, SLA, auditoria; índices de estudos; metadados de anexos/áudios; chaves dos objetos MinIO; dados financeiros estruturados | PDF/HTML exportado em volume; fotografias, anexos e áudios binários; imagens DICOM; arquivos temporários de upload; credenciais administrativas expostas |

## 8. Backups observados

O diagnóstico da VM2 registrou `/root/pacs-backups/pacs_portal_20260816_160438.sql.gz` com aproximadamente 50 KB e um arquivo de checksum separado. O backup deve ser validado com `gzip -t` e `sha256sum -c` antes de qualquer DDL. A existência de um dump local não substitui uma cópia externa nem um teste de restauração periódico.

## 9. Próxima coleta recomendada

Para fechar a documentação de produção, coletar também `SHOW CREATE TABLE` de cada tabela, `SHOW INDEX`, `information_schema.table_constraints`, `information_schema.referential_constraints`, o status do `__drizzle_migrations` sem expor hashes desnecessariamente e parâmetros operacionais não sensíveis do MySQL. Nenhuma dessas consultas deve selecionar dados de negócio.

## 10. Fontes internas

1. Inventário estrutural real fornecido a partir da VM2 em 17/08/2026 (`pasted_content_26.txt`).
2. Schema declarativo do projeto (`drizzle/schema.ts`).
3. Parecer de escopo da VM3 (`docs/PARECER_PLANO_IMPLEMENTACAO_VM3.md`).
4. Guia histórico da VM2 (`docs/GUIA_VM2_BANCO_MESTRE.md`), usado somente para identificar documentação desatualizada.
