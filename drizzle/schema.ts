import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, date, json, decimal, uniqueIndex } from "drizzle-orm/mysql-core";

/**
 * Units (Medical facilities) - Each unit has its own Orthanc instance
 */
export const units = mysqlTable("units", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  isActive: boolean("isActive").default(true).notNull(),
  orthanc_base_url: varchar("orthanc_base_url", { length: 500 }),
  // URL pública via Mikrotik NAT (ex: http://45.189.160.17:8042) — usada pelo frontend para viewers
  orthanc_public_url: varchar("orthanc_public_url", { length: 500 }),
  orthanc_basic_user: varchar("orthanc_basic_user", { length: 100 }),
  orthanc_basic_pass: varchar("orthanc_basic_pass", { length: 255 }),
  // PACS/DICOM connection parameters
  pacs_ip: varchar("pacs_ip", { length: 45 }),
  pacs_port: int("pacs_port"),
  pacs_ae_title: varchar("pacs_ae_title", { length: 16 }),
  pacs_local_ae_title: varchar("pacs_local_ae_title", { length: 16 }).default("PACSMANUS"),
  address: varchar("address", { length: 500 }),
  equipment_info: text("equipment_info"),
  // PRG-03: coluna logoUrl removida (duplicata) — usar logo_url como campo canônico
  logo_url: text("logo_url"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Unit = typeof units.$inferSelect;
export type InsertUnit = typeof units.$inferInsert;

/**
 * Users with multi-tenant support and RBAC
 * Roles: admin_master, unit_admin, medico, viewer, operador
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  unit_id: int("unit_id"),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  username: varchar("username", { length: 64 }).unique(),
  password_hash: varchar("password_hash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin_master", "unit_admin", "medico", "viewer", "operador", "responsavel_financeiro"]).default("viewer").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  expiration_date: date("expiration_date"),
  crm: varchar("crm", { length: 50 }),
  signature_url: text("signature_url"),
  stamp_url: text("stamp_url"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * User-Unit Permissions — granular access control per unit per user
 * admin_master and unit_admin bypass this table (full access implied)
 */
export const user_unit_permissions = mysqlTable("user_unit_permissions", {
  id: int("id").autoincrement().primaryKey(),
  user_id: int("user_id").notNull(),
  unit_id: int("unit_id").notNull(),
  view_studies: boolean("view_studies").default(true).notNull(),
  edit_reports: boolean("edit_reports").default(false).notNull(),
  view_anamnesis: boolean("view_anamnesis").default(false).notNull(),
  print_reports: boolean("print_reports").default(false).notNull(),
  manage_templates: boolean("manage_templates").default(false).notNull(),
  // Papel do usuário nesta unidade específica (independente do role global)
  group_key: mysqlEnum("group_key", ["responsaveisFinanceiros", "medicos", "operadores", "visualizadores", "administradoresUnidade", "adminsMaster", "outros"]).default("outros"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserUnitPermission = typeof user_unit_permissions.$inferSelect;
export type InsertUserUnitPermission = typeof user_unit_permissions.$inferInsert;

/**
 * Studies cache - Local cache of DICOM studies from Orthanc
 */
export const studies_cache = mysqlTable("studies_cache", {
  id: int("id").autoincrement().primaryKey(),
  unit_id: int("unit_id").notNull(),
  orthanc_study_id: varchar("orthanc_study_id", { length: 64 }),
  study_instance_uid: varchar("study_instance_uid", { length: 128 }),
  patient_name: varchar("patient_name", { length: 255 }),
  patient_id: varchar("patient_id", { length: 64 }),
  accession_number: varchar("accession_number", { length: 64 }),
  study_date: date("study_date"),
  modality: varchar("modality", { length: 50 }),
  description: text("description"),
  studyMetadata: json("studyMetadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StudyCache = typeof studies_cache.$inferSelect;
export type InsertStudyCache = typeof studies_cache.$inferInsert;

/**
 * Report templates - Customizable report templates by unit and modality
 */
export const templates = mysqlTable("templates", {
  id: int("id").autoincrement().primaryKey(),
  unit_id: int("unit_id"),
  // owner_user_id: quando preenchido, o template é pessoal do médico; null = template da unidade
  owner_user_id: int("owner_user_id"),
  name: varchar("name", { length: 255 }).notNull(),
  modality: varchar("modality", { length: 50 }),
  // exam_title: título do exame associado (ex: "Radiografia de Tórax PA")
  exam_title: varchar("exam_title", { length: 255 }),
  bodyTemplate: text("bodyTemplate").notNull(),
  fields: json("fields"),
  isGlobal: boolean("isGlobal").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = typeof templates.$inferInsert;

/**
 * Reports - Radiology reports with versioning
 */
export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  unit_id: int("unit_id").notNull(),
  study_id: int("study_id"),
  study_instance_uid: varchar("study_instance_uid", { length: 128 }),
  template_id: int("template_id"),
  author_user_id: int("author_user_id").notNull(),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["draft", "signed", "revised"]).default("draft").notNull(),
  version: int("version").default(1).notNull(),
  previousVersionId: int("previousVersionId"),
  signedAt: timestamp("signedAt"),
  signedBy: int("signedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // N5 — Bug fix: garante um laudo por estudo por unidade, evitando duplicatas por race condition.
  uidUnitIdx: uniqueIndex("reports_uid_unit_idx").on(table.study_instance_uid, table.unit_id),
}));

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

/**
 * Audit log - Complete audit trail of all actions
 */
export const audit_log = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  user_id: int("user_id"),
  unit_id: int("unit_id"),
  action: mysqlEnum("action", ["LOGIN", "LOGOUT", "VIEW_STUDY", "OPEN_VIEWER", "CREATE_REPORT", "UPDATE_REPORT", "SIGN_REPORT", "DELETE_REPORT", "CREATE_USER", "UPDATE_USER", "DELETE_USER", "CREATE_UNIT", "UPDATE_UNIT", "DELETE_UNIT", "PACS_QUERY", "PACS_DOWNLOAD", "CREATE_ANAMNESIS", "EDIT_STUDY_METADATA", "RESET_DOCTOR_BILLING"]).notNull(),
  target_type: varchar("target_type", { length: 50 }),
  target_id: varchar("target_id", { length: 100 }),
  ip_address: varchar("ip_address", { length: 45 }),
  user_agent: text("user_agent"),
  metadata: json("metadata"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type AuditLog = typeof audit_log.$inferSelect;
export type InsertAuditLog = typeof audit_log.$inferInsert;
/**
 * Anamnesis - Clinical history and CID suggestions for studies
 */
export const anamnesis = mysqlTable("anamnesis", {
  id: int("id").autoincrement().primaryKey(),
  study_instance_uid: varchar("study_instance_uid", { length: 128 }).notNull(),
  unit_id: int("unit_id"),
  created_by_user_id: int("created_by_user_id"),
  
  // CAMADA 1: Área do exame
  exam_area: varchar("exam_area", { length: 50 }),
  
  // CAMADA 2: Sintoma principal
  main_symptom: varchar("main_symptom", { length: 100 }),
  
  // CAMADA 3: Caracterização do sintoma
  symptom_duration_days: int("symptom_duration_days"),
  symptom_intensity: varchar("symptom_intensity", { length: 20 }),
  
  // CAMADA 4: Sintomas associados
  has_fever: boolean("has_fever").default(false),
  fever_temperature: decimal("fever_temperature", { precision: 4, scale: 1 }),
  has_dyspnea: boolean("has_dyspnea").default(false),
  has_chest_pain: boolean("has_chest_pain").default(false),
  associated_symptoms: text("associated_symptoms"),
  
  // CAMADA 5: Histórico clínico
  has_hypertension: boolean("has_hypertension").default(false),
  has_diabetes: boolean("has_diabetes").default(false),
  has_anxiety: boolean("has_anxiety").default(false),
  has_previous_lung_disease: boolean("has_previous_lung_disease").default(false),
  uses_continuous_medication: boolean("uses_continuous_medication").default(false),
  medications_list: text("medications_list"),
  
  // CAMADA 6: Finalidade do exame
  exam_purpose: varchar("exam_purpose", { length: 50 }),
  
  // CID sugerido
  suggested_cid: varchar("suggested_cid", { length: 20 }),
  suggested_cid_description: varchar("suggested_cid_description", { length: 255 }),
  
  // Metadados completos
  anamnesis_data: json("anamnesis_data"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Anamnesis = typeof anamnesis.$inferSelect;
export type InsertAnamnesis = typeof anamnesis.$inferInsert;

/**
 * DICOM Annotations - Persistent measurements and annotations from the viewer
 * Stores Cornerstone3D annotation state (LengthTool, etc.) per study
 */
export const dicom_annotations = mysqlTable("dicom_annotations", {
  id: int("id").autoincrement().primaryKey(),
  study_instance_uid: varchar("study_instance_uid", { length: 128 }).notNull(),
  series_instance_uid: varchar("series_instance_uid", { length: 128 }),
  user_id: int("user_id").notNull(),
  tool_name: varchar("tool_name", { length: 64 }).notNull().default("Length"),
  annotation_uid: varchar("annotation_uid", { length: 128 }).notNull().unique(),
  annotation_data: json("annotation_data").notNull(),
  label: varchar("label", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DicomAnnotation = typeof dicom_annotations.$inferSelect;
export type InsertDicomAnnotation = typeof dicom_annotations.$inferInsert;

/**
 * Anamnesis Simple - Clinical indication for studies (presets + free text)
 * Linked to study by studyInstanceUid, shown in viewer and report
 */
export const anamnesis_simple = mysqlTable("anamnesis_simple", {
  id: int("id").autoincrement().primaryKey(),
  study_instance_uid: varchar("study_instance_uid", { length: 128 }).notNull().unique(),
  unit_id: int("unit_id"),
  created_by_user_id: int("created_by_user_id"),
  patient_name: varchar("patient_name", { length: 255 }),
  presets: json("presets").$type<string[]>().notNull().default([]),
  manual_text: text("manual_text").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnamnesisSimple = typeof anamnesis_simple.$inferSelect;
export type InsertAnamnesisSimple = typeof anamnesis_simple.$inferInsert;

/**
 * Study Metadata — Editable overrides per unit
 * Allows technicians to edit patient name, study description, etc.
 * All users of the same unit see the same overrides (shared data layer)
 */
export const study_metadata = mysqlTable("study_metadata", {
  id: int("id").autoincrement().primaryKey(),
  study_instance_uid: varchar("study_instance_uid", { length: 128 }).notNull(),
  unit_id: int("unit_id").notNull(),
  // Overrides — null means "use original PACS value"
  patient_name_override: varchar("patient_name_override", { length: 255 }),
  description_override: varchar("description_override", { length: 255 }),
  // exam_count: número de exames selecionados pelo operador (para múltiplas folhas no editor de laudos)
  exam_count: int("exam_count").default(1),
  notes: text("notes"),
  // Audit
  edited_by_user_id: int("edited_by_user_id").notNull(),
  edited_by_name: varchar("edited_by_name", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type StudyMetadata = typeof study_metadata.$inferSelect;
export type InsertStudyMetadata = typeof study_metadata.$inferInsert;

/**
 * Phrase Groups — Grouping for pre-defined report phrases
 * Global groups visible to all users; user-created groups are personal
 */
export const phrase_groups = mysqlTable("phrase_groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 30 }).default("blue"),
  sort_order: int("sort_order").default(0),
  is_global: boolean("is_global").default(true).notNull(),
  created_by_user_id: int("created_by_user_id"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PhraseGroup = typeof phrase_groups.$inferSelect;
export type InsertPhraseGroup = typeof phrase_groups.$inferInsert;

/**
 * Phrases — Pre-defined report phrases (global + personal)
 * Global phrases are visible to all; personal phrases belong to a user
 */
export const phrases = mysqlTable("phrases", {
  id: int("id").autoincrement().primaryKey(),
  group_id: int("group_id").notNull(),
  user_id: int("user_id"),
  content: text("content").notNull(),
  is_global: boolean("is_global").default(false).notNull(),
  is_favorite: boolean("is_favorite").default(false).notNull(),
  sort_order: int("sort_order").default(0),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Phrase = typeof phrases.$inferSelect;
export type InsertPhrase = typeof phrases.$inferInsert;

/**
 * Report Versions — Audit trail of all edits to signed reports
 * Every time a signed report is edited, the old version is saved here
 */
export const report_versions = mysqlTable("report_versions", {
  id: int("id").autoincrement().primaryKey(),
  report_id: int("report_id").notNull(),
  version: int("version").notNull(),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["draft", "signed", "revised"]).notNull(),
  reason: varchar("reason", { length: 500 }),
  saved_by_user_id: int("saved_by_user_id").notNull(),
  saved_at: timestamp("saved_at").defaultNow().notNull(),
});

export type ReportVersion = typeof report_versions.$inferSelect;
export type InsertReportVersion = typeof report_versions.$inferInsert;


// ============================================================
// MÓDULO FINANCEIRO V2 — Modelagem correta com responsável pelo gasto
// ============================================================

/**
 * financial_responsibles — Entidade pagadora central (PF ou PJ)
 * Independente de users. Um responsável pode ter várias unidades.
 */
export const financial_responsibles = mysqlTable("financial_responsibles", {
  id: int("id").autoincrement().primaryKey(),
  person_type: mysqlEnum("person_type", ["PF", "PJ"]).notNull().default("PJ"),
  legal_name: varchar("legal_name", { length: 255 }).notNull(),
  trade_name: varchar("trade_name", { length: 255 }),
  cpf_cnpj: varchar("cpf_cnpj", { length: 18 }).unique(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinancialResponsible = typeof financial_responsibles.$inferSelect;
export type InsertFinancialResponsible = typeof financial_responsibles.$inferInsert;

/**
 * financial_responsible_users — Vincula usuários ao responsável financeiro
 * Permite que múltiplos logins consultem o painel do mesmo responsável.
 */
export const financial_responsible_users = mysqlTable("financial_responsible_users", {
  id: int("id").autoincrement().primaryKey(),
  financial_responsible_id: int("financial_responsible_id").notNull(),
  user_id: int("user_id").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uq_resp_user: uniqueIndex("uq_resp_user").on(t.financial_responsible_id, t.user_id),
}));
export type FinancialResponsibleUser = typeof financial_responsible_users.$inferSelect;
export type InsertFinancialResponsibleUser = typeof financial_responsible_users.$inferInsert;

/**
 * financial_responsible_units — Vincula unidades ao responsável com histórico de vigência
 * Uma unidade tem apenas um responsável ativo por vez.
 */
export const financial_responsible_units = mysqlTable("financial_responsible_units", {
  id: int("id").autoincrement().primaryKey(),
  financial_responsible_id: int("financial_responsible_id").notNull(),
  unit_id: int("unit_id").notNull(),
  starts_at: timestamp("starts_at").notNull(),
  ends_at: timestamp("ends_at"),
  created_by: int("created_by").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FinancialResponsibleUnit = typeof financial_responsible_units.$inferSelect;
export type InsertFinancialResponsibleUnit = typeof financial_responsible_units.$inferInsert;

/**
 * billing_system_unit_prices — Preço cobrado pelo sistema por unidade com vigência
 * Configurado pelo admin_master. Não pode haver sobreposição de vigência.
 */
export const billing_system_unit_prices = mysqlTable("billing_system_unit_prices", {
  id: int("id").autoincrement().primaryKey(),
  financial_responsible_id: int("financial_responsible_id").notNull(),
  unit_id: int("unit_id").notNull(),
  price_per_report: decimal("price_per_report", { precision: 10, scale: 2 }).notNull(),
  starts_at: timestamp("starts_at").notNull(),
  ends_at: timestamp("ends_at"),
  created_by: int("created_by").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BillingSystemUnitPrice = typeof billing_system_unit_prices.$inferSelect;
export type InsertBillingSystemUnitPrice = typeof billing_system_unit_prices.$inferInsert;

/**
 * billing_doctor_unit_prices — Preço do médico por responsável + unidade + médico com vigência
 * Configurado pelo admin_master. Mesmo médico pode ter valores diferentes por unidade.
 */
export const billing_doctor_unit_prices = mysqlTable("billing_doctor_unit_prices", {
  id: int("id").autoincrement().primaryKey(),
  financial_responsible_id: int("financial_responsible_id").notNull(),
  unit_id: int("unit_id").notNull(),
  doctor_user_id: int("doctor_user_id").notNull(),
  price_per_report: decimal("price_per_report", { precision: 10, scale: 2 }).notNull(),
  starts_at: timestamp("starts_at").notNull(),
  ends_at: timestamp("ends_at"),
  created_by: int("created_by").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BillingDoctorUnitPrice = typeof billing_doctor_unit_prices.$inferSelect;
export type InsertBillingDoctorUnitPrice = typeof billing_doctor_unit_prices.$inferInsert;

/**
 * billing_report_items — Itemização auditável: um registro por laudo faturável
 * Fato gerador: reports com status signed ou revised.
 * Médico financeiro: signedBy ?? author_user_id.
 */
export const billing_report_items = mysqlTable("billing_report_items", {
  id: int("id").autoincrement().primaryKey(),
  report_id: int("report_id").notNull(),
  study_instance_uid: varchar("study_instance_uid", { length: 128 }),
  financial_responsible_id: int("financial_responsible_id"),
  unit_id: int("unit_id").notNull(),
  doctor_user_id: int("doctor_user_id").notNull(),
  competence_year: int("competence_year").notNull(),
  competence_month: int("competence_month").notNull(),
  report_status_snapshot: mysqlEnum("report_status_snapshot", ["signed", "revised"]).notNull(),
  report_signed_at: timestamp("report_signed_at").notNull(),
  system_price_applied: decimal("system_price_applied", { precision: 10, scale: 2 }),
  doctor_price_applied: decimal("doctor_price_applied", { precision: 10, scale: 2 }),
  system_amount_due: decimal("system_amount_due", { precision: 10, scale: 2 }),
  doctor_amount_due: decimal("doctor_amount_due", { precision: 10, scale: 2 }),
  pricing_status: mysqlEnum("pricing_status", ["ok", "pending_system_price", "pending_doctor_price", "pending_both"]).notNull().default("pending_both"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uq_report_item: uniqueIndex("uq_report_item").on(t.report_id),
}));
export type BillingReportItem = typeof billing_report_items.$inferSelect;
export type InsertBillingReportItem = typeof billing_report_items.$inferInsert;

/**
 * billing_monthly_system_by_unit — Consolidado mensal: responsável deve ao sistema por unidade
 */
export const billing_monthly_system_by_unit = mysqlTable("billing_monthly_system_by_unit", {
  id: int("id").autoincrement().primaryKey(),
  financial_responsible_id: int("financial_responsible_id").notNull(),
  unit_id: int("unit_id").notNull(),
  competence_year: int("competence_year").notNull(),
  competence_month: int("competence_month").notNull(),
  reports_count: int("reports_count").notNull().default(0),
  amount_due: decimal("amount_due", { precision: 10, scale: 2 }).notNull().default("0.00"),
  pending_items_count: int("pending_items_count").notNull().default(0),
  status: mysqlEnum("status", ["open", "closed"]).notNull().default("open"),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
  closedBy: int("closedBy"),
}, (t) => ({
  uq_sys_resp_unit_comp: uniqueIndex("uq_sys_resp_unit_comp").on(t.financial_responsible_id, t.unit_id, t.competence_year, t.competence_month),
}));
export type BillingMonthlySystemByUnit = typeof billing_monthly_system_by_unit.$inferSelect;
export type InsertBillingMonthlySystemByUnit = typeof billing_monthly_system_by_unit.$inferInsert;

/**
 * billing_monthly_doctor_by_unit — Consolidado mensal: responsável deve ao médico por unidade
 */
export const billing_monthly_doctor_by_unit = mysqlTable("billing_monthly_doctor_by_unit", {
  id: int("id").autoincrement().primaryKey(),
  financial_responsible_id: int("financial_responsible_id").notNull(),
  unit_id: int("unit_id").notNull(),
  doctor_user_id: int("doctor_user_id").notNull(),
  competence_year: int("competence_year").notNull(),
  competence_month: int("competence_month").notNull(),
  reports_count: int("reports_count").notNull().default(0),
  amount_due: decimal("amount_due", { precision: 10, scale: 2 }).notNull().default("0.00"),
  pending_items_count: int("pending_items_count").notNull().default(0),
  status: mysqlEnum("status", ["open", "closed"]).notNull().default("open"),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
  closedBy: int("closedBy"),
}, (t) => ({
  uq_doc_resp_unit_comp: uniqueIndex("uq_doc_resp_unit_comp").on(t.financial_responsible_id, t.unit_id, t.doctor_user_id, t.competence_year, t.competence_month),
}));
export type BillingMonthlyDoctorByUnit = typeof billing_monthly_doctor_by_unit.$inferSelect;
export type InsertBillingMonthlyDoctorByUnit = typeof billing_monthly_doctor_by_unit.$inferInsert;


/**
 * billing_cycle_configs — Configuração do ciclo financeiro por unidade
 * O root define o dia de fechamento para médicos e para o sistema separadamente.
 * Exemplo: médicos fecham todo dia 20, sistema fecha todo dia 1.
 */
export const billing_cycle_configs = mysqlTable("billing_cycle_configs", {
  id: int("id").autoincrement().primaryKey(),
  unit_id: int("unit_id").notNull(),
  /** Dia do mês em que o ciclo dos médicos fecha (1-28) */
  doctor_cycle_day: int("doctor_cycle_day").notNull().default(1),
  /** Dia do mês em que o ciclo do sistema fecha (1-28) */
  system_cycle_day: int("system_cycle_day").notNull().default(1),
  is_active: boolean("is_active").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  created_by: int("created_by"),
}, (t) => ({
  uq_unit_config: uniqueIndex("uq_unit_config").on(t.unit_id),
}));
export type BillingCycleConfig = typeof billing_cycle_configs.$inferSelect;
export type InsertBillingCycleConfig = typeof billing_cycle_configs.$inferInsert;

/**
 * billing_cycles — Ciclos financeiros abertos/fechados por unidade e tipo
 * cycle_type: 'doctor' (pagamento ao médico) | 'system' (pagamento ao sistema)
 */
export const billing_cycles = mysqlTable("billing_cycles", {
  id: int("id").autoincrement().primaryKey(),
  unit_id: int("unit_id").notNull(),
  financial_responsible_id: int("financial_responsible_id"),
  cycle_type: mysqlEnum("cycle_type", ["doctor", "system"]).notNull(),
  starts_at: date("starts_at").notNull(),
  ends_at: date("ends_at").notNull(),
  status: mysqlEnum("status", ["open", "closed"]).notNull().default("open"),
  total_reports: int("total_reports").notNull().default(0),
  total_amount: decimal("total_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  closedAt: timestamp("closedAt"),
  closedBy: int("closedBy"),
  // Controle de pagamento do ciclo ao sistema (P2 - Contas a Receber)
  paid_status: mysqlEnum("paid_status", ["pending", "paid"]).notNull().default("pending"),
  paid_at: timestamp("paid_at"),
  paid_by_user_id: int("paid_by_user_id"),
  paid_note: varchar("paid_note", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uq_cycle: uniqueIndex("uq_cycle").on(t.unit_id, t.cycle_type, t.starts_at),
}));
export type BillingCycle = typeof billing_cycles.$inferSelect;
export type InsertBillingCycle = typeof billing_cycles.$inferInsert;

/**
 * billing_visit_events — Evento financeiro por laudo assinado.
 * Cada laudo assinado gera exatamente 1 evento financeiro.
 * Chave de deduplicação: report_id (um evento por laudo)
 */
export const billing_visit_events = mysqlTable("billing_visit_events", {
  id: int("id").autoincrement().primaryKey(),
  report_id: int("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
  study_instance_uid: varchar("study_instance_uid", { length: 128 }),
  unit_id: int("unit_id").notNull(),
  doctor_user_id: int("doctor_user_id").notNull(),
  financial_responsible_id: int("financial_responsible_id"),
  /** Chave de deduplicação: report_id — um evento por laudo */
  report_key: varchar("report_key", { length: 100 }).notNull(),
  patient_name: varchar("patient_name", { length: 200 }),
  study_date: date("study_date"),
  doctor_cycle_id: int("doctor_cycle_id"),
  system_cycle_id: int("system_cycle_id"),
  system_price_applied: decimal("system_price_applied", { precision: 10, scale: 2 }),
  doctor_price_applied: decimal("doctor_price_applied", { precision: 10, scale: 2 }),
  system_amount_due: decimal("system_amount_due", { precision: 10, scale: 2 }),
  doctor_amount_due: decimal("doctor_amount_due", { precision: 10, scale: 2 }),
  /** Preço cobrado do paciente — preenchido automaticamente na assinatura via unit_exam_prices */
  patient_price: decimal("patient_price", { precision: 10, scale: 2 }),
  /** Modalidade do estudo no momento do laudo (snapshot para auditoria) */
  modality_snapshot: varchar("modality_snapshot", { length: 20 }),
  /** Nome do exame no momento do laudo (snapshot para auditoria) */
  exam_name_snapshot: varchar("exam_name_snapshot", { length: 200 }),
  pricing_status: mysqlEnum("pricing_status", ["ok", "pending_system_price", "pending_doctor_price", "pending_both"]).notNull().default("pending_both"),
  doctor_received_at: timestamp("doctor_received_at"),
  system_paid_at: timestamp("system_paid_at"),
  // SCH-01: snapshot do status do laudo no momento do evento financeiro (signed ou revised)
  report_status_snapshot: mysqlEnum("report_status_snapshot", ["signed", "revised"]).default("signed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uq_report_event: uniqueIndex("uq_report_event").on(t.report_key),
}));
export type BillingVisitEvent = typeof billing_visit_events.$inferSelect;
export type InsertBillingVisitEvent = typeof billing_visit_events.$inferInsert;

/**
 * billing_cycle_doctor_summary — Consolidado do médico por ciclo e unidade
 */
export const billing_cycle_doctor_summary = mysqlTable("billing_cycle_doctor_summary", {
  id: int("id").autoincrement().primaryKey(),
  doctor_cycle_id: int("doctor_cycle_id").notNull(),
  unit_id: int("unit_id").notNull(),
  doctor_user_id: int("doctor_user_id").notNull(),
  financial_responsible_id: int("financial_responsible_id"),
  reports_count: int("reports_count").notNull().default(0),
  amount_due: decimal("amount_due", { precision: 10, scale: 2 }).notNull().default("0.00"),
  pending_pricing_count: int("pending_pricing_count").notNull().default(0),
  received_at: timestamp("received_at"),
  received_by: int("received_by"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uq_cycle_doc_unit: uniqueIndex("uq_cycle_doc_unit").on(t.doctor_cycle_id, t.unit_id, t.doctor_user_id),
}));
export type BillingCycleDoctorSummary = typeof billing_cycle_doctor_summary.$inferSelect;
export type InsertBillingCycleDoctorSummary = typeof billing_cycle_doctor_summary.$inferInsert;

/**
 * billing_cycle_system_summary — Consolidado do sistema por ciclo e unidade
 */
export const billing_cycle_system_summary = mysqlTable("billing_cycle_system_summary", {
  id: int("id").autoincrement().primaryKey(),
  system_cycle_id: int("system_cycle_id").notNull(),
  unit_id: int("unit_id").notNull(),
  financial_responsible_id: int("financial_responsible_id"),
  reports_count: int("reports_count").notNull().default(0),
  amount_due: decimal("amount_due", { precision: 10, scale: 2 }).notNull().default("0.00"),
  pending_pricing_count: int("pending_pricing_count").notNull().default(0),
  paid_at: timestamp("paid_at"),
  paid_by: int("paid_by"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uq_cycle_sys_unit: uniqueIndex("uq_cycle_sys_unit").on(t.system_cycle_id, t.unit_id),
}));
export type BillingCycleSystemSummary = typeof billing_cycle_system_summary.$inferSelect;
export type InsertBillingCycleSystemSummary = typeof billing_cycle_system_summary.$inferInsert;


/**
 * unit_doctor_scales — Escala semanal de médicos por unidade
 * Define em quais dias da semana e horários cada médico atua em cada unidade.
 * days_of_week: JSON array de inteiros 0-6 (0=domingo, 1=segunda, ..., 6=sábado)
 */
export const unit_doctor_scales = mysqlTable("unit_doctor_scales", {
  id: int("id").autoincrement().primaryKey(),
  unit_id: int("unit_id").notNull(),
  doctor_user_id: int("doctor_user_id").notNull(),
  days_of_week: varchar("days_of_week", { length: 50 }).notNull().default("[]"),
  start_time: varchar("start_time", { length: 5 }),
  end_time: varchar("end_time", { length: 5 }),
  is_active: boolean("is_active").notNull().default(true),
  starts_at: date("starts_at"),
  ends_at: date("ends_at"),
  notes: text("notes"),
  created_by: int("created_by").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uq_unit_doctor_scale: uniqueIndex("uq_unit_doctor_scale").on(t.unit_id, t.doctor_user_id),
}));
export type UnitDoctorScale = typeof unit_doctor_scales.$inferSelect;
export type InsertUnitDoctorScale = typeof unit_doctor_scales.$inferInsert;

/**
 * unit_doctor_compensation_rules — Remuneração do médico por unidade
 * Define o modelo de remuneração (por laudo, por paciente, por plantão) e o valor.
 * Separado do billing_doctor_unit_prices (que é o preço do sistema).
 */
export const unit_doctor_compensation_rules = mysqlTable("unit_doctor_compensation_rules", {
  id: int("id").autoincrement().primaryKey(),
  unit_id: int("unit_id").notNull(),
  doctor_user_id: int("doctor_user_id"),
  compensation_type: mysqlEnum("compensation_type", ["per_report", "per_patient", "per_shift", "other"]).notNull().default("per_report"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  starts_at: date("starts_at").notNull(),
  ends_at: date("ends_at"),
  notes: text("notes"),
  created_by: int("created_by").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UnitDoctorCompensationRule = typeof unit_doctor_compensation_rules.$inferSelect;
export type InsertUnitDoctorCompensationRule = typeof unit_doctor_compensation_rules.$inferInsert;

/**
 * contract_revenues — Receita do contrato do responsável financeiro
 * Registra o valor recebido pelo responsável no contrato com a unidade.
 */
export const contract_revenues = mysqlTable("contract_revenues", {
  id: int("id").autoincrement().primaryKey(),
  financial_responsible_id: int("financial_responsible_id").notNull(),
  unit_id: int("unit_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  periodicity: mysqlEnum("periodicity", ["monthly", "quarterly", "yearly", "one_time"]).notNull().default("monthly"),
  starts_at: date("starts_at").notNull(),
  ends_at: date("ends_at"),
  description: varchar("description", { length: 500 }),
  notes: text("notes"),
  created_by: int("created_by").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ContractRevenue = typeof contract_revenues.$inferSelect;
export type InsertContractRevenue = typeof contract_revenues.$inferInsert;

/**
 * contract_custom_expenses — Gastos personalizados do responsável financeiro
 * Permite registrar qualquer tipo de gasto operacional (secretária, internet, aluguel, etc.)
 */
export const contract_custom_expenses = mysqlTable("contract_custom_expenses", {
  id: int("id").autoincrement().primaryKey(),
  financial_responsible_id: int("financial_responsible_id").notNull(),
  unit_id: int("unit_id"),
  category: varchar("category", { length: 100 }).notNull(),
  description: varchar("description", { length: 500 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  competence_month: int("competence_month").notNull(),
  competence_year: int("competence_year").notNull(),
  notes: text("notes"),
  created_by: int("created_by").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ContractCustomExpense = typeof contract_custom_expenses.$inferSelect;
export type InsertContractCustomExpense = typeof contract_custom_expenses.$inferInsert;

/**
 * unit_report_sla_configs — Configuração de SLA de laudo por unidade
 * Define o prazo máximo para entrega do laudo após a anamnese ser inserida.
 * Apenas admin_master e unit_admin podem configurar.
 */
export const unit_report_sla_configs = mysqlTable("unit_report_sla_configs", {
  id: int("id").autoincrement().primaryKey(),
  unit_id: int("unit_id").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  /** Valor numérico do prazo (ex: 4, 8, 2, 7) */
  sla_value: int("sla_value"),
  /** Unidade do prazo: 'hour' ou 'day' */
  sla_unit: mysqlEnum("sla_unit", ["hour", "day"]),
  /** Data/hora a partir da qual esta configuração entra em vigor */
  effective_from: timestamp("effective_from"),
  notes: text("notes"),
  created_by: int("created_by").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uq_unit_sla: uniqueIndex("uq_unit_sla").on(t.unit_id),
}));
export type UnitReportSlaConfig = typeof unit_report_sla_configs.$inferSelect;
export type InsertUnitReportSlaConfig = typeof unit_report_sla_configs.$inferInsert;

/**
 * report_readiness — Marco formal de prontidão de exame para laudo
 * Criado quando a anamnese é salva de forma válida pela primeira vez.
 * O SLA é capturado como snapshot no momento da criação — edições posteriores
 * da anamnese NÃO reiniciam o timer.
 */
export const report_readiness = mysqlTable("report_readiness", {
  id: int("id").autoincrement().primaryKey(),
  study_instance_uid: varchar("study_instance_uid", { length: 128 }).notNull(),
  unit_id: int("unit_id").notNull(),
  /** Status do ciclo de vida do exame */
  readiness_status: mysqlEnum("readiness_status", [
    "pending",
    "ready_for_reporting",
    "reported",
    "cancelled",
    "invalidated",
  ]).notNull().default("ready_for_reporting"),
  /** Timestamp oficial de entrada em fila para laudo (imutável após criação) */
  became_ready_at: timestamp("became_ready_at").notNull(),
  /** Snapshot do SLA vigente no momento da prontidão */
  sla_value_snapshot: int("sla_value_snapshot"),
  sla_unit_snapshot: mysqlEnum("sla_unit_snapshot", ["hour", "day"]),
  /** Prazo calculado: became_ready_at + SLA */
  due_at: timestamp("due_at"),
  /** Fonte da prontidão (ex: 'anamnesis_simple') */
  readiness_source: varchar("readiness_source", { length: 50 }).default("anamnesis_simple"),
  readiness_note: text("readiness_note"),
  /** Preenchido quando o laudo é assinado */
  reported_at: timestamp("reported_at"),
  reported_by_user_id: int("reported_by_user_id"),
  /** true = laudo entregue dentro do SLA; false = fora do SLA */
  sla_met: boolean("sla_met"),
  /** Atraso em segundos (negativo = adiantado) */
  delay_seconds: int("delay_seconds"),
  created_by: int("created_by").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uq_readiness_uid_unit: uniqueIndex("uq_readiness_uid_unit").on(t.study_instance_uid, t.unit_id),
}));
export type ReportReadiness = typeof report_readiness.$inferSelect;
export type InsertReportReadiness = typeof report_readiness.$inferInsert;


/**
 * Catálogo de legendas de exames — define quais exames são bilaterais
 * e a modalidade a que pertencem para uso no editor de laudo.
 */
export const exam_legends = mysqlTable("exam_legends", {
  id: int("id").autoincrement().primaryKey(),
  /** Nome canônico do exame (ex: "Ultrassonografia de Mama") */
  exam_name: varchar("exam_name", { length: 255 }).notNull(),
  /** Modalidade: rx, tc, us, rm, outros */
  modality: varchar("modality", { length: 20 }).notNull().default("outros"),
  /** true = exame pode ser bilateral (exibe seletor Direito/Esquerdo/Bilateral) */
  bilateral: boolean("bilateral").notNull().default(false),
  /** Ordem de exibição dentro da modalidade */
  sort_order: int("sort_order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uq_exam_name: uniqueIndex("uq_exam_name").on(t.exam_name),
}));
export type ExamLegend = typeof exam_legends.$inferSelect;
export type InsertExamLegend = typeof exam_legends.$inferInsert;

/**
 * Unit Exam Prices — tabela de preços de exames por unidade
 * Gerenciada pelo responsável financeiro ou admin_master.
 * Usada para calcular patient_price automaticamente na assinatura do laudo.
 */
export const unit_exam_prices = mysqlTable("unit_exam_prices", {
  id: int("id").autoincrement().primaryKey(),
  unit_id: int("unit_id").notNull(),
  /** Modalidade do exame: rx, tc, us, rm, mg, outros */
  modality: varchar("modality", { length: 20 }).notNull(),
  /** Nome descritivo do exame (ex: "TC Crânio", "RX Tórax") */
  exam_name: varchar("exam_name", { length: 200 }).notNull(),
  /** Preço cobrado do paciente por este exame */
  price_per_exam: decimal("price_per_exam", { precision: 10, scale: 2 }).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  created_by: int("created_by").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uq_unit_modality_exam: uniqueIndex("uq_unit_modality_exam").on(t.unit_id, t.modality, t.exam_name),
}));
export type UnitExamPrice = typeof unit_exam_prices.$inferSelect;
export type InsertUnitExamPrice = typeof unit_exam_prices.$inferInsert;
