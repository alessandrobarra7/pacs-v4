# VM2 — Estado do Banco de Dados (pacs_portal)

> **Última atualização:** 2026-04-08  
> **Versão do código:** pacs-v4 (branch `main`)  
> **MySQL:** 8.0.45-0ubuntu0.22.04.1  
> **Host:** VM2 — `172.16.3.101`  
> **Banco:** `pacs_portal`  
> **Usuário da aplicação:** `pacs_user@localhost` e `pacs_user@172.16.3.100`

---

## Resumo das Migrações Aplicadas

| ID | Hash | Observação |
|----|------|------------|
| 1 | `814a08e40d7fc2bcfd458759d18319198ca8ae394f2fa15617a78678e9c9c93b` | Migração inicial |
| 2 | `5f4fdb867c4aaae952be974b17d32f6c93852a770b837396c972b4c9a0a87854` | Permissões e unidades |
| 3 | `15d2d45071a1f39a9480e64354e1305a3724148d2e5a835fff0720f4bb20078e` | Anamnese e anotações |
| 4 | `314284d29a6b11d963787590f28693db0ca1b0d148d72af45d01e8fa48694ef7` | Frases e grupos |
| 5 | `06a907ca6b73c956202494796aeada24699761107dd1e2f8d772e4ec07938942` | Versões de laudos |

> As migrações acima foram aplicadas via Drizzle Kit. As alterações posteriores (v4) foram aplicadas manualmente via scripts SQL em 2026-04-08.

---

## Alterações Manuais Aplicadas em 2026-04-08

### 1. Tabelas removidas (obsoletas)
- `exam_catalog` — removida
- `report_sections` — removida
- `study_labels` — removida

### 2. Colunas adicionadas
| Tabela | Coluna | Tipo |
|--------|--------|------|
| `units` | `logo_url` | TEXT NULL |
| `study_metadata` | `exam_count` | INT DEFAULT 1 |
| `templates` | `owner_user_id` | INT NULL |
| `templates` | `exam_title` | VARCHAR(255) NULL |
| `report_versions` | `version` | INT |
| `report_versions` | `status` | VARCHAR(50) |
| `report_versions` | `saved_by_user_id` | INT NULL |
| `report_versions` | `saved_at` | TIMESTAMP NULL |

### 3. Colunas modificadas
| Tabela | Coluna | De | Para |
|--------|--------|----|------|
| `users` | `expiration_date` | BIGINT (ms epoch) | DATE NULL |
| `users` | `role` ENUM | sem `responsavel_financeiro` | com `responsavel_financeiro` |
| `audit_log` | `action` ENUM | valores antigos | valores atualizados com novos eventos |

### 4. Índices adicionados
| Tabela | Índice | Colunas |
|--------|--------|---------|
| `reports` | `reports_uid_unit_idx` (UNIQUE) | `study_instance_uid`, `unit_id` |

### 5. Tabelas criadas (módulo financeiro V2/V3)
- `financial_responsibles`
- `financial_responsible_users`
- `financial_responsible_units`
- `billing_system_unit_prices`
- `billing_doctor_unit_prices`
- `billing_report_items`
- `billing_visit_events`
- `billing_monthly_doctor_by_unit`
- `billing_monthly_system_by_unit`
- `billing_cycle_configs`
- `billing_cycles`
- `billing_cycle_doctor_summary`
- `billing_cycle_system_summary`

### 6. Renomeação de colunas (migração visit → report)
| Tabela | Coluna antiga | Coluna nova |
|--------|---------------|-------------|
| `billing_visit_events` | `visit_key` | `report_key` |
| `billing_cycle_doctor_summary` | `visits_count` | `reports_count` |
| `billing_cycle_system_summary` | `visits_count` | `reports_count` |
| `billing_monthly_doctor_by_unit` | `total_visits` | `total_reports` |
| `billing_monthly_system_by_unit` | `total_visits` | `total_reports` |

---

## Estrutura Completa das Tabelas (29 tabelas)

### Tabelas do sistema principal

| Tabela | Colunas relevantes |
|--------|--------------------|
| `__drizzle_migrations` | `id`, `hash`, `created_at` |
| `anamnesis` | `id`, `study_instance_uid`, `unit_id`, `created_by_user_id`, `exam_area`, `main_symptom`, `symptom_duration_days`, `symptom_intensity`, `has_fever`, `fever_temperature`, `has_dyspnea`, `has_chest_pain`, `associated_symptoms`, `has_hypertension`, `has_diabetes`, `has_anxiety`, `has_previous_lung_disease`, `uses_continuous_medication`, `medications_list`, `exam_purpose`, `suggested_cid`, `suggested_cid_description`, `anamnesis_data`, `createdAt`, `updatedAt` |
| `anamnesis_simple` | `id`, `study_instance_uid`, `unit_id`, `created_by_user_id`, `patient_name`, `presets`, `manual_text`, `createdAt`, `updatedAt` |
| `audit_log` | `id`, `user_id`, `unit_id`, `action` (ENUM), `target_type`, `target_id`, `ip_address`, `user_agent`, `metadata`, `timestamp` |
| `dicom_annotations` | `id`, `study_instance_uid`, `series_instance_uid`, `user_id`, `tool_name`, `annotation_uid`, `annotation_data`, `createdAt`, `updatedAt` |
| `phrase_groups` | `id`, `name`, `color`, `sort_order`, `is_global`, `created_by_user_id`, `isActive`, `createdAt` |
| `phrases` | `id`, `group_id`, `user_id`, `content`, `is_global`, `is_favorite`, `sort_order`, `isActive`, `createdAt`, `updatedAt` |
| `report_versions` | `id`, `report_id`, `version`, `body`, `status`, `reason`, `saved_by_user_id`, `saved_at`, `revised_by`, `created_at` |
| `reports` | `id`, `unit_id`, `study_id`, `study_instance_uid`, `template_id`, `author_user_id`, `body`, `status`, `version`, `previousVersionId`, `signedAt`, `signedBy`, `createdAt`, `updatedAt` |
| `studies_cache` | `id`, `unit_id`, `orthanc_study_id`, `study_instance_uid`, `patient_name`, `patient_id`, `accession_number`, `study_date`, `modality`, `description`, `studyMetadata`, `createdAt`, `updatedAt` |
| `study_metadata` | `id`, `study_instance_uid`, `unit_id`, `patient_name_override`, `description_override`, `notes`, `edited_by_user_id`, `edited_by_name`, `exam_count`, `createdAt`, `updatedAt` |
| `templates` | `id`, `unit_id`, `name`, `modality`, `bodyTemplate`, `fields`, `isGlobal`, `isActive`, `createdBy`, `owner_user_id`, `exam_title`, `createdAt`, `updatedAt` |
| `units` | `id`, `name`, `slug`, `isActive`, `orthanc_base_url`, `orthanc_public_url`, `orthanc_basic_user`, `orthanc_basic_pass`, `logoUrl`, `logo_url`, `pacs_ip`, `pacs_port`, `pacs_ae_title`, `pacs_local_ae_title`, `address`, `equipment_info`, `createdAt`, `updatedAt` |
| `user` | `id`, `open_id`, `name`, `email`, `avatar`, `role`, `unit_id`, `username`, `password_hash`, `created_at`, `updated_at` *(tabela legada OAuth — não remover)* |
| `user_unit_permissions` | `id`, `user_id`, `unit_id`, `view_studies`, `edit_reports`, `view_anamnesis`, `print_reports`, `manage_templates`, `created_at`, `createdAt`, `updatedAt` |
| `users` | `id`, `openId`, `name`, `email`, `loginMethod`, `role` (ENUM), `createdAt`, `updatedAt`, `lastSignedIn`, `unit_id`, `isActive`, `username`, `password_hash`, `crm`, `signature_url`, `stamp_url`, `expiration_date` (DATE) |

### Tabelas do módulo financeiro

| Tabela | Colunas relevantes |
|--------|--------------------|
| `billing_cycle_configs` | `id`, `unit_id`, `doctor_cycle_day`, `system_cycle_day`, `is_active`, `created_by`, `createdAt`, `updatedAt` |
| `billing_cycle_doctor_summary` | `id`, `doctor_cycle_id`, `unit_id`, `doctor_user_id`, `financial_responsible_id`, `reports_count`, `amount_due`, `pending_pricing_count`, `received_at`, `received_by`, `createdAt`, `updatedAt` |
| `billing_cycle_system_summary` | `id`, `system_cycle_id`, `unit_id`, `financial_responsible_id`, `reports_count`, `amount_due`, `pending_pricing_count`, `paid_at`, `paid_by`, `createdAt`, `updatedAt` |
| `billing_cycles` | `id`, `unit_id`, `financial_responsible_id`, `cycle_type` (doctor/system), `starts_at`, `ends_at`, `status` (open/closed), `total_visits`, `total_amount`, `closedAt`, `closedBy`, `createdAt`, `updatedAt` |
| `billing_doctor_unit_prices` | `id`, `financial_responsible_id`, `unit_id`, `doctor_user_id`, `price_per_report`, `starts_at`, `ends_at`, `created_by`, `createdAt` |
| `billing_monthly_doctor_by_unit` | `id`, `financial_responsible_id`, `unit_id`, `doctor_user_id`, `competence_year`, `competence_month`, `reports_count`, `amount_due`, `pending_items_count`, `status`, `generatedAt`, `closedAt`, `closedBy` |
| `billing_monthly_system_by_unit` | `id`, `financial_responsible_id`, `unit_id`, `competence_year`, `competence_month`, `reports_count`, `amount_due`, `pending_items_count`, `status`, `generatedAt`, `closedAt`, `closedBy` |
| `billing_report_items` | `id`, `report_id`, `study_instance_uid`, `financial_responsible_id`, `unit_id`, `doctor_user_id`, `competence_year`, `competence_month`, `report_status_snapshot`, `report_signed_at`, `system_price_applied`, `doctor_price_applied`, `system_amount_due`, `doctor_amount_due`, `pricing_status`, `createdAt`, `updatedAt` |
| `billing_system_unit_prices` | `id`, `financial_responsible_id`, `unit_id`, `price_per_report`, `starts_at`, `ends_at`, `created_by`, `createdAt` |
| `billing_visit_events` | `id`, `report_id`, `study_instance_uid`, `unit_id`, `doctor_user_id`, `financial_responsible_id`, `report_key` (UNIQUE), `patient_name`, `study_date`, `doctor_cycle_id`, `system_cycle_id`, `system_price_applied`, `doctor_price_applied`, `system_amount_due`, `doctor_amount_due`, `pricing_status`, `doctor_received_at`, `system_paid_at`, `createdAt`, `updatedAt` |
| `financial_responsible_units` | `id`, `financial_responsible_id`, `unit_id`, `starts_at`, `ends_at`, `created_by`, `createdAt` |
| `financial_responsible_users` | `id`, `financial_responsible_id`, `user_id`, `createdAt` |
| `financial_responsibles` | `id`, `person_type` (PF/PJ), `legal_name`, `trade_name`, `cpf_cnpj` (UNIQUE), `email`, `phone`, `notes`, `isActive`, `createdAt`, `updatedAt` |

---

## ENUM de `users.role`

```
admin_master | unit_admin | medico | viewer | operador | responsavel_financeiro
```

---

## Conexão do Banco

```
Host:     172.16.3.101 (VM2)
Porta:    3306
Banco:    pacs_portal
Usuário:  pacs_user
```

String de conexão usada no `.env` da VM1:
```
DATABASE_URL=mysql://pacs_user:PacsPortal2025@172.16.3.101:3306/pacs_portal
```

---

## Próximas Migrações Pendentes

**Nenhuma.** O banco está 100% alinhado com o schema do código na branch `main` do repositório `pacs-v4`.

Para futuras alterações de schema, gerar a migration via:
```bash
pnpm drizzle-kit generate
```
E aplicar o SQL gerado diretamente na VM2 (não usar `drizzle-kit push` em produção).
