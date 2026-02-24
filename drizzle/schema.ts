import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, date, json, decimal } from "drizzle-orm/mysql-core";

/**
 * Units (Medical facilities) - Each unit has its own Orthanc instance
 */
export const units = mysqlTable("units", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  isActive: boolean("isActive").default(true).notNull(),
  orthanc_base_url: varchar("orthanc_base_url", { length: 500 }),
  orthanc_basic_user: varchar("orthanc_basic_user", { length: 100 }),
  orthanc_basic_pass: varchar("orthanc_basic_pass", { length: 255 }),
  // PACS/DICOM connection parameters
  pacs_ip: varchar("pacs_ip", { length: 45 }),
  pacs_port: int("pacs_port"),
  pacs_ae_title: varchar("pacs_ae_title", { length: 16 }),
  pacs_local_ae_title: varchar("pacs_local_ae_title", { length: 16 }).default("PACSMANUS"),
  logoUrl: varchar("logoUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Unit = typeof units.$inferSelect;
export type InsertUnit = typeof units.$inferInsert;

/**
 * Users with multi-tenant support and RBAC
 * Roles: admin_master, admin_unit, radiologist, referring_doctor
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  unit_id: int("unit_id"),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin_master", "admin_unit", "radiologist", "referring_doctor"]).default("referring_doctor").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

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
  name: varchar("name", { length: 255 }).notNull(),
  modality: varchar("modality", { length: 50 }),
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
});

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

/**
 * Audit log - Complete audit trail of all actions
 */
export const audit_log = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  user_id: int("user_id"),
  unit_id: int("unit_id"),
  action: mysqlEnum("action", ["LOGIN", "LOGOUT", "VIEW_STUDY", "OPEN_VIEWER", "CREATE_REPORT", "UPDATE_REPORT", "SIGN_REPORT", "CREATE_USER", "UPDATE_USER", "DELETE_USER", "CREATE_UNIT", "UPDATE_UNIT", "DELETE_UNIT", "PACS_QUERY", "PACS_DOWNLOAD", "CREATE_ANAMNESIS"]).notNull(),
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
