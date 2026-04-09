import { drizzle } from "drizzle-orm/mysql2";
import { or, and, eq, like, inArray } from "drizzle-orm";
import { 
  InsertUser, 
  users, 
  units, 
  InsertUnit,
  studies_cache,
  InsertStudyCache,
  templates,
  InsertTemplate,
  reports,
  InsertReport,
  audit_log,
  InsertAuditLog,
  dicom_annotations,
  InsertDicomAnnotation,
  DicomAnnotation,
  anamnesis_simple,
  study_metadata,
  StudyMetadata,
  billing_cycle_configs,
  billing_cycles,
  billing_visit_events,
  billing_cycle_doctor_summary,
  billing_cycle_system_summary,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin_master';
      updateSet.role = 'admin_master';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByUsernameOrEmail(login: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(
    or(eq(users.username, login), eq(users.email, login))
  ).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ password_hash: passwordHash }).where(eq(users.id, userId));
}

export async function createLocalUser(data: {
  username: string;
  email?: string;
  name: string;
  password_hash: string;
  role: 'admin_master' | 'unit_admin' | 'medico' | 'viewer' | 'operador' | 'responsavel_financeiro';
  unit_id?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Generate a unique openId for local users
  const openId = `local_${data.username}_${Date.now()}`;
  const result = await db.insert(users).values({
    openId,
    username: data.username,
    email: data.email ?? null,
    name: data.name,
    password_hash: data.password_hash,
    role: data.role,
    unit_id: data.unit_id ?? null,
    loginMethod: 'local',
    lastSignedIn: new Date(),
  });
  return Number(result[0].insertId);
}

// Units helpers
export async function getAllUnits() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(units);
}

export async function getUnitById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(units).where(eq(units.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUnitBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(units).where(eq(units.slug, slug)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUnit(unit: InsertUnit) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(units).values(unit);
  return Number(result[0].insertId);
}

export async function updateUnit(id: number, data: Partial<InsertUnit>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(units).set(data).where(eq(units.id, id));
}

export async function deleteUnit(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(units).where(eq(units.id, id));
}

// Studies cache helpers
export async function getStudiesByUnitId(unitId: number, filters?: {
  patient_name?: string;
  modality?: string;
  study_date?: string;
  accession_number?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [eq(studies_cache.unit_id, unitId)];
  
  if (filters?.patient_name) {
    conditions.push(like(studies_cache.patient_name, `%${filters.patient_name}%`));
  }
  if (filters?.modality) {
    conditions.push(eq(studies_cache.modality, filters.modality));
  }
  if (filters?.study_date) {
    conditions.push(like(studies_cache.study_date, `%${filters.study_date}%`));
  }
  if (filters?.accession_number) {
    conditions.push(like(studies_cache.accession_number, `%${filters.accession_number}%`));
  }
  
  let query = db.select().from(studies_cache).where(and(...conditions)) as any;
  
  if (filters?.limit) query = query.limit(filters.limit);
  if (filters?.offset) query = query.offset(filters.offset);
  
  return await query;
}

export async function getStudyById(id: number, unitId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const conditions = [eq(studies_cache.id, id)];
  if (unitId !== undefined) {
    conditions.push(eq(studies_cache.unit_id, unitId));
  }
  
  const result = await db.select().from(studies_cache).where(and(...conditions)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createStudyCache(study: InsertStudyCache) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(studies_cache).values(study);
  return Number(result[0].insertId);
}

// Busca estudo por study_instance_uid validando unit_id (previne IDOR)
export async function getStudyByInstanceUid(studyInstanceUid: string, unitId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  const conditions = [eq(studies_cache.study_instance_uid, studyInstanceUid)];
  if (unitId !== undefined) {
    conditions.push(eq(studies_cache.unit_id, unitId));
  }
  const result = await db.select().from(studies_cache).where(and(...conditions)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Templates helpers
export async function getTemplatesByUnitId(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(templates).where(eq(templates.unit_id, unitId));
}

export async function getGlobalTemplates() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(templates).where(eq(templates.isGlobal, true));
}

export async function getTemplateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(templates).where(eq(templates.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createTemplate(template: InsertTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(templates).values(template);
  return Number(result[0].insertId);
}

export async function updateTemplate(id: number, data: Partial<InsertTemplate>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(templates).set(data).where(eq(templates.id, id));
}

export async function deleteTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(templates).where(eq(templates.id, id));
}

// Reports helpers
export async function getReportsByUnitId(unitId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(reports).where(eq(reports.unit_id, unitId));
}

export async function getReportByStudyId(studyId: number, unitId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const conditions = [eq(reports.study_id, studyId)];
  if (unitId !== undefined) {
    conditions.push(eq(reports.unit_id, unitId));
  }
  
  const result = await db.select().from(reports).where(and(...conditions)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getReportById(id: number, unitId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const conditions = [eq(reports.id, id)];
  if (unitId !== undefined) {
    conditions.push(eq(reports.unit_id, unitId));
  }
  
  const result = await db.select().from(reports).where(and(...conditions)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createReport(report: InsertReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(reports).values(report);
  return Number(result[0].insertId);
}

export async function updateReport(id: number, data: Partial<InsertReport>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(reports).set(data).where(eq(reports.id, id));
}

// Audit log helpers
export async function createAuditLog(log: InsertAuditLog) {
  const db = await getDb();
  if (!db) return;
  try {
    // Passa timestamp explicitamente para evitar erro de DEFAULT em prepared statements no TiDB/MySQL
    await db.insert(audit_log).values({
      ...log,
      timestamp: new Date(),
    });
  } catch (err) {
    // Não propagar erros de auditoria para não bloquear operações do usuário
    console.error('[AuditLog] Falha ao registrar auditoria:', err);
  }
}

/** Retorna um mapa { studyInstanceUid → status } para uma lista de UIDs */
export async function getReportStatusByStudyUids(
  studyUids: string[],
  unitId?: number
): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db || studyUids.length === 0) return {};

  const conditions: any[] = [inArray(reports.study_instance_uid, studyUids)];
  if (unitId !== undefined) conditions.push(eq(reports.unit_id, unitId));

  const rows = await db
    .select({ uid: reports.study_instance_uid, status: reports.status })
    .from(reports)
    .where(and(...conditions));

  const map: Record<string, string> = {};
  for (const row of rows) {
    if (row.uid) {
      const label =
        row.status === "signed" ? "Assinado" :
        row.status === "revised" ? "Revisado" :
        "Em Andamento";
      map[row.uid] = label;
    }
  }
  return map;
}

// ─── DICOM Annotations ───────────────────────────────────────────────────────

/** Retorna todas as anotações de um estudo para um usuário */
export async function getAnnotationsByStudy(
  studyInstanceUid: string,
  userId: number
): Promise<DicomAnnotation[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(dicom_annotations)
    .where(
      and(
        eq(dicom_annotations.study_instance_uid, studyInstanceUid),
        eq(dicom_annotations.user_id, userId)
      )
    );
}

/** Upsert de uma anotação (insert ou update pelo annotation_uid) */
export async function upsertAnnotation(data: InsertDicomAnnotation): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(dicom_annotations)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        annotation_data: data.annotation_data,
        label: data.label,
        series_instance_uid: data.series_instance_uid,
        tool_name: data.tool_name,
      },
    });
}

/** Remove uma anotação pelo annotation_uid e userId (garante que só o dono pode deletar) */
export async function deleteAnnotation(
  annotationUid: string,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(dicom_annotations)
    .where(
      and(
        eq(dicom_annotations.annotation_uid, annotationUid),
        eq(dicom_annotations.user_id, userId)
      )
    );
}

/// ─── Anamnesis Simple ────────────────────────────────────────────────────────
/** Busca a anamnese de um estudo pelo studyInstanceUid */
export async function getAnamnesisSimple(studyInstanceUid: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(anamnesis_simple)
    .where(eq(anamnesis_simple.study_instance_uid, studyInstanceUid))
    .limit(1);
  return rows[0] ?? null;
}

/** Cria ou atualiza a anamnese de um estudo (upsert por studyInstanceUid) */
export async function saveAnamnesisSimple(data: {
  study_instance_uid: string;
  unit_id?: number | null;
  created_by_user_id?: number | null;
  patient_name?: string | null;
  presets: string[];
  manual_text: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(anamnesis_simple)
    .values({
      study_instance_uid: data.study_instance_uid,
      unit_id: data.unit_id ?? null,
      created_by_user_id: data.created_by_user_id ?? null,
      patient_name: data.patient_name ?? null,
      presets: data.presets,
      manual_text: data.manual_text,
    })
    .onDuplicateKeyUpdate({
      set: {
        presets: data.presets,
        manual_text: data.manual_text,
        patient_name: data.patient_name ?? null,
      },
    });
}

// ─── Study Metadata ───────────────────────────────────────────────────────────
/** Busca os metadados editados de um estudo para uma unidade específica */
export async function getStudyMetadata(
  studyInstanceUid: string,
  unitId: number
): Promise<StudyMetadata | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(study_metadata)
    .where(
      and(
        eq(study_metadata.study_instance_uid, studyInstanceUid),
        eq(study_metadata.unit_id, unitId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Busca metadados de múltiplos estudos de uma unidade (batch) */
export async function getStudyMetadataBatch(
  studyInstanceUids: string[],
  unitId: number
): Promise<StudyMetadata[]> {
  if (!studyInstanceUids.length) return [];
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(study_metadata)
    .where(
      and(
        inArray(study_metadata.study_instance_uid, studyInstanceUids),
        eq(study_metadata.unit_id, unitId)
      )
    );
}

/** Cria ou atualiza os metadados editados de um estudo (upsert por uid+unitId) */
export async function upsertStudyMetadata(data: {
  study_instance_uid: string;
  unit_id: number;
  patient_name_override?: string | null;
  description_override?: string | null;
  exam_count?: number | null;
  notes?: string | null;
  edited_by_user_id: number;
  edited_by_name?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(study_metadata)
    .values({
      study_instance_uid: data.study_instance_uid,
      unit_id: data.unit_id,
      patient_name_override: data.patient_name_override ?? null,
      description_override: data.description_override ?? null,
      exam_count: data.exam_count ?? 1,
      notes: data.notes ?? null,
      edited_by_user_id: data.edited_by_user_id,
      edited_by_name: data.edited_by_name ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        patient_name_override: data.patient_name_override ?? null,
        description_override: data.description_override ?? null,
        exam_count: data.exam_count ?? 1,
        notes: data.notes ?? null,
        edited_by_user_id: data.edited_by_user_id,
        edited_by_name: data.edited_by_name ?? null,
      },
    });
}

// ─── User-Unit Permissions ────────────────────────────────────────────────────

/** Retorna todas as permissões de um usuário (todas as unidades) */
export async function getUserUnitPermissions(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { user_unit_permissions } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return db.select().from(user_unit_permissions).where(eq(user_unit_permissions.user_id, userId));
}

/** Retorna a permissão de um usuário para uma unidade específica */
export async function getUserUnitPermission(userId: number, unitId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { user_unit_permissions } = await import("../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(user_unit_permissions)
    .where(and(eq(user_unit_permissions.user_id, userId), eq(user_unit_permissions.unit_id, unitId)));
  return rows[0] ?? null;
}

/** Define (replace) as permissões de um usuário para uma lista de unidades.
 *  Unidades não incluídas na lista terão seus registros removidos. */
export async function setUserUnitPermissions(
  userId: number,
  permissions: Array<{
    unit_id: number;
    view_studies: boolean;
    edit_reports: boolean;
    view_anamnesis: boolean;
    print_reports: boolean;
    manage_templates: boolean;
  }>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { user_unit_permissions } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");

  // Remove todas as permissões existentes do usuário
  await db.delete(user_unit_permissions).where(eq(user_unit_permissions.user_id, userId));

  // Insere as novas permissões
  if (permissions.length > 0) {
    await db.insert(user_unit_permissions).values(
      permissions.map((p) => ({
        user_id: userId,
        unit_id: p.unit_id,
        view_studies: p.view_studies,
        edit_reports: p.edit_reports,
        view_anamnesis: p.view_anamnesis,
        print_reports: p.print_reports,
        manage_templates: p.manage_templates,
      }))
    );
  }
}

// ─── Phrase Groups ────────────────────────────────────────────────────────────
export async function listPhraseGroups(userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { phrase_groups } = await import("../drizzle/schema");
  const { eq, or, and } = await import("drizzle-orm");
  const where = userId
    ? or(eq(phrase_groups.is_global, true), eq(phrase_groups.created_by_user_id, userId))
    : eq(phrase_groups.is_global, true);
  return db.select().from(phrase_groups)
    .where(and(where, eq(phrase_groups.isActive, true)))
    .orderBy(phrase_groups.sort_order, phrase_groups.name);
}

export async function createPhraseGroup(data: { name: string; color?: string; userId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { phrase_groups } = await import("../drizzle/schema");
  const [result] = await db.insert(phrase_groups).values({
    name: data.name,
    color: data.color ?? "blue",
    is_global: false,
    created_by_user_id: data.userId,
    isActive: true,
  });
  return result;
}

// ─── Phrases ──────────────────────────────────────────────────────────────────
export async function listPhrases(userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { phrases } = await import("../drizzle/schema");
  const { eq, or, and } = await import("drizzle-orm");
  const where = userId
    ? or(eq(phrases.is_global, true), eq(phrases.user_id, userId))
    : eq(phrases.is_global, true);
  return db.select().from(phrases)
    .where(and(where, eq(phrases.isActive, true)))
    .orderBy(phrases.sort_order, phrases.id);
}

export async function createPhrase(data: { groupId: number; userId: number; content: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { phrases } = await import("../drizzle/schema");
  const [result] = await db.insert(phrases).values({
    group_id: data.groupId,
    user_id: data.userId,
    content: data.content,
    is_global: false,
    is_favorite: false,
    isActive: true,
  });
  return result;
}

export async function deletePhrase(phraseId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { phrases } = await import("../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");
  await db.update(phrases).set({ isActive: false })
    .where(and(eq(phrases.id, phraseId), eq(phrases.user_id, userId)));
}

export async function togglePhrasesFavorite(phraseId: number, userId: number, isFavorite: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { phrases } = await import("../drizzle/schema");
  const { eq, and, or } = await import("drizzle-orm");
  await db.update(phrases).set({ is_favorite: isFavorite })
    .where(and(eq(phrases.id, phraseId), or(eq(phrases.user_id, userId), eq(phrases.is_global, true))));
}

// ─── User CRM / Signature ─────────────────────────────────────────────────────
export async function updateUserMedicalData(userId: number, data: { crm?: string; signature_url?: string | null; stamp_url?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { users } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(users).set(data).where(eq(users.id, userId));
}

// ─── Unit Logo ────────────────────────────────────────────────────────────────
export async function updateUnitLogo(unitId: number, logoUrl: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { units } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(units).set({ logo_url: logoUrl }).where(eq(units.id, unitId));
}


// ─── Billing Helpers V2 ───────────────────────────────────────────────────────
// Modelagem correta: responsável financeiro como entidade pagadora central.
// Tabelas: financial_responsibles, financial_responsible_users,
//          financial_responsible_units, billing_system_unit_prices,
//          billing_doctor_unit_prices, billing_report_items,
//          billing_monthly_system_by_unit, billing_monthly_doctor_by_unit

import {
  financial_responsibles,
  financial_responsible_users,
  financial_responsible_units,
  billing_system_unit_prices,
  billing_doctor_unit_prices,
  billing_report_items,
  billing_monthly_system_by_unit,
  billing_monthly_doctor_by_unit,
  FinancialResponsible,
  InsertFinancialResponsible,
  FinancialResponsibleUser,
  FinancialResponsibleUnit,
  BillingSystemUnitPrice,
  BillingDoctorUnitPrice,
  BillingReportItem,
  InsertBillingReportItem,
  BillingMonthlySystemByUnit,
  BillingMonthlyDoctorByUnit,
} from "../drizzle/schema";

// ─── Responsáveis Financeiros ─────────────────────────────────────────────────

export async function listFinancialResponsibles(): Promise<FinancialResponsible[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq } = await import("drizzle-orm");
  return db.select().from(financial_responsibles).orderBy(financial_responsibles.legal_name);
}

export async function getFinancialResponsibleById(id: number): Promise<FinancialResponsible | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(financial_responsibles).where(eq(financial_responsibles.id, id)).limit(1);
  return rows[0];
}

export async function createFinancialResponsible(data: InsertFinancialResponsible): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(financial_responsibles).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateFinancialResponsible(id: number, data: Partial<InsertFinancialResponsible>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq } = await import("drizzle-orm");
  await db.update(financial_responsibles).set(data).where(eq(financial_responsibles.id, id));
}

// ─── Vínculos Usuário → Responsável ──────────────────────────────────────────

export async function linkUserToResponsible(financialResponsibleId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(financial_responsible_users).values({ financial_responsible_id: financialResponsibleId, user_id: userId }).onDuplicateKeyUpdate({ set: { user_id: userId } });
}

export async function unlinkUserFromResponsible(financialResponsibleId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq } = await import("drizzle-orm");
  await db.delete(financial_responsible_users).where(and(eq(financial_responsible_users.financial_responsible_id, financialResponsibleId), eq(financial_responsible_users.user_id, userId)));
}

export async function getResponsibleIdForUser(userId: number): Promise<number | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select({ id: financial_responsible_users.financial_responsible_id }).from(financial_responsible_users).where(eq(financial_responsible_users.user_id, userId)).limit(1);
  return rows[0]?.id;
}

export async function listUsersForResponsible(financialResponsibleId: number): Promise<FinancialResponsibleUser[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq } = await import("drizzle-orm");
  return db.select().from(financial_responsible_users).where(eq(financial_responsible_users.financial_responsible_id, financialResponsibleId));
}

// ─── Vínculos Unidade → Responsável ──────────────────────────────────────────
export async function linkUnitToResponsible(financialResponsibleId: number, unitId: number, startsAt: Date, endsAt?: Date, createdBy?: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq, isNull, or, gte } = await import("drizzle-orm");

  // Encerrar automaticamente qualquer vigência ativa anterior para essa unidade
  const existing = await getActiveResponsibleForUnit(unitId, startsAt);
  if (existing) {
    // Fechar a vigência anterior na data de início da nova
    const endDate = new Date(startsAt.getTime() - 1000); // 1 segundo antes
    await db.update(financial_responsible_units)
      .set({ ends_at: endDate })
      .where(and(
        eq(financial_responsible_units.id, existing.id)
      ));
  }

  await db.insert(financial_responsible_units).values({
    financial_responsible_id: financialResponsibleId,
    unit_id: unitId,
    starts_at: startsAt,
    ends_at: endsAt ?? null,
    created_by: createdBy ?? 0,
  });
}

export async function getActiveResponsibleForUnit(unitId: number, atDate?: Date): Promise<FinancialResponsibleUnit | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq, isNull, or, lte, gte, desc } = await import("drizzle-orm");
  const at = atDate ?? new Date();
  // Regra correta: starts_at <= data E (ends_at IS NULL OU ends_at >= data)
  // Ordenar starts_at DESC para pegar a vigência mais recente
  const rows = await db.select().from(financial_responsible_units)
    .where(and(
      eq(financial_responsible_units.unit_id, unitId),
      lte(financial_responsible_units.starts_at, at),
      or(isNull(financial_responsible_units.ends_at), gte(financial_responsible_units.ends_at as any, at))
    ))
    .orderBy(desc(financial_responsible_units.starts_at))
    .limit(1);
  return rows[0];
}

export async function listUnitsForResponsible(financialResponsibleId: number): Promise<FinancialResponsibleUnit[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq, isNull } = await import("drizzle-orm");
  return db.select().from(financial_responsible_units)
    .where(eq(financial_responsible_units.financial_responsible_id, financialResponsibleId));
}

// ─── Preços do Sistema por Unidade ───────────────────────────────────────────

export async function getActiveSystemPrice(financialResponsibleId: number, unitId: number, atDate?: Date): Promise<BillingSystemUnitPrice | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq, isNull, or, lte, gte, desc } = await import("drizzle-orm");
  const at = atDate ?? new Date();
  // Regra correta: starts_at <= data E (ends_at IS NULL OU ends_at >= data)
  // Ordenar starts_at DESC para pegar a vigência mais recente
  const rows = await db.select().from(billing_system_unit_prices)
    .where(and(
      eq(billing_system_unit_prices.financial_responsible_id, financialResponsibleId),
      eq(billing_system_unit_prices.unit_id, unitId),
      lte(billing_system_unit_prices.starts_at, at),
      or(isNull(billing_system_unit_prices.ends_at), gte(billing_system_unit_prices.ends_at as any, at))
    ))
    .orderBy(desc(billing_system_unit_prices.starts_at))
    .limit(1);
  return rows[0];
}

export async function listSystemPricesForUnit(financialResponsibleId: number, unitId: number): Promise<BillingSystemUnitPrice[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq } = await import("drizzle-orm");
  return db.select().from(billing_system_unit_prices)
    .where(and(
      eq(billing_system_unit_prices.financial_responsible_id, financialResponsibleId),
      eq(billing_system_unit_prices.unit_id, unitId)
    ))
    .orderBy(billing_system_unit_prices.starts_at);
}

export async function upsertSystemUnitPrice(data: {
  financial_responsible_id: number;
  unit_id: number;
  price_per_report: string;
  starts_at: Date;
  ends_at?: Date | null;
  created_by: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq } = await import("drizzle-orm");

  // Encerrar automaticamente qualquer preço ativo anterior para esse responsável/unidade
  const existing = await getActiveSystemPrice(data.financial_responsible_id, data.unit_id, data.starts_at);
  if (existing) {
    const endDate = new Date(data.starts_at.getTime() - 1000);
    await db.update(billing_system_unit_prices)
      .set({ ends_at: endDate })
      .where(eq(billing_system_unit_prices.id, existing.id));
  }

  const result = await db.insert(billing_system_unit_prices).values(data);
  return (result[0] as any).insertId as number;
}

// ─── Preços do Médico por Unidade ─────────────────────────────────────────────

export async function getActiveDoctorPrice(financialResponsibleId: number, unitId: number, doctorUserId: number, atDate?: Date): Promise<BillingDoctorUnitPrice | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq, isNull, or, lte, gte, desc } = await import("drizzle-orm");
  const at = atDate ?? new Date();
  // Regra correta: starts_at <= data E (ends_at IS NULL OU ends_at >= data)
  // Ordenar starts_at DESC para pegar a vigência mais recente
  const rows = await db.select().from(billing_doctor_unit_prices)
    .where(and(
      eq(billing_doctor_unit_prices.financial_responsible_id, financialResponsibleId),
      eq(billing_doctor_unit_prices.unit_id, unitId),
      eq(billing_doctor_unit_prices.doctor_user_id, doctorUserId),
      lte(billing_doctor_unit_prices.starts_at, at),
      or(isNull(billing_doctor_unit_prices.ends_at), gte(billing_doctor_unit_prices.ends_at as any, at))
    ))
    .orderBy(desc(billing_doctor_unit_prices.starts_at))
    .limit(1);
  return rows[0];
}

export async function listDoctorPricesForUnit(financialResponsibleId: number, unitId: number): Promise<BillingDoctorUnitPrice[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq } = await import("drizzle-orm");
  return db.select().from(billing_doctor_unit_prices)
    .where(and(
      eq(billing_doctor_unit_prices.financial_responsible_id, financialResponsibleId),
      eq(billing_doctor_unit_prices.unit_id, unitId)
    ))
    .orderBy(billing_doctor_unit_prices.starts_at);
}

export async function upsertDoctorUnitPrice(data: {
  financial_responsible_id: number;
  unit_id: number;
  doctor_user_id: number;
  price_per_report: string;
  starts_at: Date;
  ends_at?: Date | null;
  created_by: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq } = await import("drizzle-orm");

  // Encerrar automaticamente qualquer preço ativo anterior para esse responsável/unidade/médico
  const existing = await getActiveDoctorPrice(data.financial_responsible_id, data.unit_id, data.doctor_user_id, data.starts_at);
  if (existing) {
    const endDate = new Date(data.starts_at.getTime() - 1000);
    await db.update(billing_doctor_unit_prices)
      .set({ ends_at: endDate })
      .where(eq(billing_doctor_unit_prices.id, existing.id));
  }

  const result = await db.insert(billing_doctor_unit_prices).values(data);
  return (result[0] as any).insertId as number;
}

// ─── Itens de Apuração (billing_report_items) ─────────────────────────────────

/**
 * Cria ou atualiza um item financeiro para um laudo.
 * Regra: signedBy ?? author_user_id para o médico financeiro.
 * Só entra laudo com status signed ou revised.
 */
export async function upsertBillingReportItem(data: InsertBillingReportItem): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(billing_report_items).values(data).onDuplicateKeyUpdate({
    set: {
      financial_responsible_id: data.financial_responsible_id,
      system_price_applied: data.system_price_applied,
      doctor_price_applied: data.doctor_price_applied,
      system_amount_due: data.system_amount_due,
      doctor_amount_due: data.doctor_amount_due,
      pricing_status: data.pricing_status,
    }
  });
}

export async function listBillingReportItems(filters: {
  financial_responsible_id?: number;
  unit_id?: number;
  doctor_user_id?: number;
  competence_year: number;
  competence_month: number;
}): Promise<(BillingReportItem & { patient_name?: string | null; study_description?: string | null; doctor_name?: string | null })[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq } = await import("drizzle-orm");

  const conditions: any[] = [
    eq(billing_report_items.competence_year, filters.competence_year),
    eq(billing_report_items.competence_month, filters.competence_month),
  ];
  if (filters.financial_responsible_id) conditions.push(eq(billing_report_items.financial_responsible_id, filters.financial_responsible_id));
  if (filters.unit_id) conditions.push(eq(billing_report_items.unit_id, filters.unit_id));
  if (filters.doctor_user_id) conditions.push(eq(billing_report_items.doctor_user_id, filters.doctor_user_id));

  const rows = await db
    .select({
      item: billing_report_items,
      patient_name: studies_cache.patient_name,
      study_description: studies_cache.description,
      doctor_name: users.name,
    })
    .from(billing_report_items)
    .leftJoin(studies_cache, eq(billing_report_items.study_instance_uid, studies_cache.study_instance_uid))
    .leftJoin(users, eq(billing_report_items.doctor_user_id, users.id))
    .where(and(...conditions))
    .orderBy(billing_report_items.report_signed_at);

  return rows.map(r => ({
    ...r.item,
    patient_name: r.patient_name,
    study_description: r.study_description,
    doctor_name: r.doctor_name,
  }));
}

// ─── Apuração de Competência ──────────────────────────────────────────────────

/**
 * Apura todos os laudos signed/revised de uma competência (mês/ano) e
 * cria/atualiza os billing_report_items e os consolidados mensais.
 * Retorna um resumo com contagens de itens ok e pendentes.
 */
export async function calculateCompetence(year: number, month: number, createdBy: number): Promise<{
  total: number;
  ok: number;
  pending: number;
  errors: string[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq, inArray, isNull, or, lte } = await import("drizzle-orm");

  // Intervalo da competência em UTC
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  // Buscar laudos signed/revised com signedAt no período
  const faultableReports = await db.select().from(reports)
    .where(and(
      inArray(reports.status, ["signed", "revised"]),
      lte(reports.signedAt, end),
      lte(start as any, reports.signedAt as any),
    ));

  // Filtrar pelo mês correto (signedAt >= start e < end)
  const periodReports = faultableReports.filter(r => {
    if (!r.signedAt) return false;
    const d = new Date(r.signedAt);
    return d >= start && d < end;
  });

  let ok = 0;
  let pending = 0;
  const errors: string[] = [];

  for (const report of periodReports) {
    try {
      const doctorUserId = report.signedBy ?? report.author_user_id;
      const signedAt = new Date(report.signedAt!);

      // Descobrir responsável ativo para a unidade
      const respUnit = await getActiveResponsibleForUnit(report.unit_id, signedAt);
      const financialResponsibleId = respUnit?.financial_responsible_id ?? null;

      // Buscar preços vigentes
      let systemPrice: string | null = null;
      let doctorPrice: string | null = null;

      if (financialResponsibleId) {
        const sp = await getActiveSystemPrice(financialResponsibleId, report.unit_id, signedAt);
        const dp = await getActiveDoctorPrice(financialResponsibleId, report.unit_id, doctorUserId, signedAt);
        systemPrice = sp?.price_per_report ?? null;
        doctorPrice = dp?.price_per_report ?? null;
      }

      // Determinar pricing_status
      const hasSys = systemPrice !== null;
      const hasDoc = doctorPrice !== null;
      let pricingStatus: "ok" | "pending_system_price" | "pending_doctor_price" | "pending_both";
      if (hasSys && hasDoc) pricingStatus = "ok";
      else if (!hasSys && !hasDoc) pricingStatus = "pending_both";
      else if (!hasSys) pricingStatus = "pending_system_price";
      else pricingStatus = "pending_doctor_price";

      const item: InsertBillingReportItem = {
        report_id: report.id,
        study_instance_uid: report.study_instance_uid ?? null,
        financial_responsible_id: financialResponsibleId,
        unit_id: report.unit_id,
        doctor_user_id: doctorUserId,
        competence_year: year,
        competence_month: month,
        report_status_snapshot: report.status as "signed" | "revised",
        report_signed_at: signedAt,
        system_price_applied: systemPrice,
        doctor_price_applied: doctorPrice,
        system_amount_due: systemPrice,
        doctor_amount_due: doctorPrice,
        pricing_status: pricingStatus,
      };

      await upsertBillingReportItem(item);

      if (pricingStatus === "ok") ok++;
      else pending++;
    } catch (e: any) {
      errors.push(`report ${report.id}: ${e.message}`);
      pending++;
    }
  }

  // Recalcular consolidados mensais (apenas se a competência não estiver fechada)
  await recalculateMonthlyConsolidates(year, month, createdBy);

  return { total: periodReports.length, ok, pending, errors };
}

/**
 * Recalcula os consolidados mensais a partir dos billing_report_items.
 * Não atualiza consolidados que já estão fechados.
 */
async function recalculateMonthlyConsolidates(year: number, month: number, closedBy: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq, ne } = await import("drizzle-orm");

  const items = await db.select().from(billing_report_items)
    .where(and(
      eq(billing_report_items.competence_year, year),
      eq(billing_report_items.competence_month, month),
    ));

  // Agrupar por (financial_responsible_id, unit_id) para sistema
  const sysMap = new Map<string, { responsible: number | null; unit: number; count: number; amount: number; pending: number }>();
  // Agrupar por (financial_responsible_id, unit_id, doctor_user_id) para médico
  const docMap = new Map<string, { responsible: number | null; unit: number; doctor: number; count: number; amount: number; pending: number }>();

  for (const item of items) {
    const sysKey = `${item.financial_responsible_id}_${item.unit_id}`;
    const docKey = `${item.financial_responsible_id}_${item.unit_id}_${item.doctor_user_id}`;

    if (!sysMap.has(sysKey)) sysMap.set(sysKey, { responsible: item.financial_responsible_id, unit: item.unit_id, count: 0, amount: 0, pending: 0 });
    const sysEntry = sysMap.get(sysKey)!;
    sysEntry.count++;
    sysEntry.amount += parseFloat(item.system_amount_due ?? "0");
    if (item.pricing_status !== "ok") sysEntry.pending++;

    if (!docMap.has(docKey)) docMap.set(docKey, { responsible: item.financial_responsible_id, unit: item.unit_id, doctor: item.doctor_user_id, count: 0, amount: 0, pending: 0 });
    const docEntry = docMap.get(docKey)!;
    docEntry.count++;
    docEntry.amount += parseFloat(item.doctor_amount_due ?? "0");
    if (item.pricing_status !== "ok") docEntry.pending++;
  }

  // Upsert billing_monthly_system_by_unit (apenas se não estiver fechado)
  for (const [, v] of Array.from(sysMap)) {
    if (!v.responsible) continue;
    // Verificar se já existe e está fechado
    const existingSys = await db.select().from(billing_monthly_system_by_unit)
      .where(and(
        eq(billing_monthly_system_by_unit.financial_responsible_id, v.responsible),
        eq(billing_monthly_system_by_unit.unit_id, v.unit),
        eq(billing_monthly_system_by_unit.competence_year, year),
        eq(billing_monthly_system_by_unit.competence_month, month),
      )).limit(1);
    if (existingSys[0]?.status === "closed") continue; // Não atualizar competencia fechada

    await db.insert(billing_monthly_system_by_unit).values({
      financial_responsible_id: v.responsible,
      unit_id: v.unit,
      competence_year: year,
      competence_month: month,
      reports_count: v.count,
      amount_due: v.amount.toFixed(2),
      pending_items_count: v.pending,
      status: "open",
    }).onDuplicateKeyUpdate({
      set: {
        reports_count: v.count,
        amount_due: v.amount.toFixed(2),
        pending_items_count: v.pending,
      }
    });
  }

  // Upsert billing_monthly_doctor_by_unit (apenas se não estiver fechado)
  for (const [, v] of Array.from(docMap)) {
    if (!v.responsible) continue;
    // Verificar se já existe e está fechado
    const existingDoc = await db.select().from(billing_monthly_doctor_by_unit)
      .where(and(
        eq(billing_monthly_doctor_by_unit.financial_responsible_id, v.responsible),
        eq(billing_monthly_doctor_by_unit.unit_id, v.unit),
        eq(billing_monthly_doctor_by_unit.doctor_user_id, v.doctor),
        eq(billing_monthly_doctor_by_unit.competence_year, year),
        eq(billing_monthly_doctor_by_unit.competence_month, month),
      )).limit(1);
    if (existingDoc[0]?.status === "closed") continue; // Não atualizar competencia fechada

    await db.insert(billing_monthly_doctor_by_unit).values({
      financial_responsible_id: v.responsible,
      unit_id: v.unit,
      doctor_user_id: v.doctor,
      competence_year: year,
      competence_month: month,
      reports_count: v.count,
      amount_due: v.amount.toFixed(2),
      pending_items_count: v.pending,
      status: "open",
    }).onDuplicateKeyUpdate({
      set: {
        reports_count: v.count,
        amount_due: v.amount.toFixed(2),
        pending_items_count: v.pending,
      }
    });
  }
}

// ─── Fechamento de Competência ────────────────────────────────────────────────

export async function closeCompetence(financialResponsibleId: number, year: number, month: number, closedBy: number): Promise<{ success: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq } = await import("drizzle-orm");

  // Verificar se há itens pendentes
  const pending = await db.select().from(billing_report_items)
    .where(and(
      eq(billing_report_items.financial_responsible_id, financialResponsibleId),
      eq(billing_report_items.competence_year, year),
      eq(billing_report_items.competence_month, month),
      // pricing_status != 'ok'
    ));
  const pendingItems = pending.filter(i => i.pricing_status !== "ok");
  if (pendingItems.length > 0) {
    return { success: false, reason: `Há ${pendingItems.length} item(ns) com preço pendente. Resolva antes de fechar.` };
  }

  const now = new Date();
  await db.update(billing_monthly_system_by_unit)
    .set({ status: "closed", closedAt: now, closedBy })
    .where(and(
      eq(billing_monthly_system_by_unit.financial_responsible_id, financialResponsibleId),
      eq(billing_monthly_system_by_unit.competence_year, year),
      eq(billing_monthly_system_by_unit.competence_month, month),
    ));

  await db.update(billing_monthly_doctor_by_unit)
    .set({ status: "closed", closedAt: now, closedBy })
    .where(and(
      eq(billing_monthly_doctor_by_unit.financial_responsible_id, financialResponsibleId),
      eq(billing_monthly_doctor_by_unit.competence_year, year),
      eq(billing_monthly_doctor_by_unit.competence_month, month),
    ));

  return { success: true };
}

export async function reopenCompetence(financialResponsibleId: number, year: number, month: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq } = await import("drizzle-orm");

  await db.update(billing_monthly_system_by_unit)
    .set({ status: "open", closedAt: null, closedBy: null })
    .where(and(
      eq(billing_monthly_system_by_unit.financial_responsible_id, financialResponsibleId),
      eq(billing_monthly_system_by_unit.competence_year, year),
      eq(billing_monthly_system_by_unit.competence_month, month),
    ));

  await db.update(billing_monthly_doctor_by_unit)
    .set({ status: "open", closedAt: null, closedBy: null })
    .where(and(
      eq(billing_monthly_doctor_by_unit.financial_responsible_id, financialResponsibleId),
      eq(billing_monthly_doctor_by_unit.competence_year, year),
      eq(billing_monthly_doctor_by_unit.competence_month, month),
    ));
}

// ─── Consultas de Consolidados ────────────────────────────────────────────────

export async function getMonthlySystemSummary(financialResponsibleId: number, year: number, month: number): Promise<BillingMonthlySystemByUnit[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq } = await import("drizzle-orm");
  return db.select().from(billing_monthly_system_by_unit)
    .where(and(
      eq(billing_monthly_system_by_unit.financial_responsible_id, financialResponsibleId),
      eq(billing_monthly_system_by_unit.competence_year, year),
      eq(billing_monthly_system_by_unit.competence_month, month),
    ));
}

export async function getMonthlyDoctorSummary(financialResponsibleId: number, year: number, month: number): Promise<BillingMonthlyDoctorByUnit[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq } = await import("drizzle-orm");
  return db.select().from(billing_monthly_doctor_by_unit)
    .where(and(
      eq(billing_monthly_doctor_by_unit.financial_responsible_id, financialResponsibleId),
      eq(billing_monthly_doctor_by_unit.competence_year, year),
      eq(billing_monthly_doctor_by_unit.competence_month, month),
    ));
}

export async function getDoctorMonthlySummary(doctorUserId: number, year: number, month: number): Promise<BillingMonthlyDoctorByUnit[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq } = await import("drizzle-orm");
  return db.select().from(billing_monthly_doctor_by_unit)
    .where(and(
      eq(billing_monthly_doctor_by_unit.doctor_user_id, doctorUserId),
      eq(billing_monthly_doctor_by_unit.competence_year, year),
      eq(billing_monthly_doctor_by_unit.competence_month, month),
    ));
}

export async function getAdminConsolidated(year: number, month: number): Promise<{
  responsibles: (FinancialResponsible & { system_total: number; doctor_total: number; reports_count: number; pending_count: number })[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and, eq } = await import("drizzle-orm");

  const responsibles = await listFinancialResponsibles();
  const result = [];

  for (const resp of responsibles) {
    const sysSummary = await getMonthlySystemSummary(resp.id, year, month);
    const docSummary = await getMonthlyDoctorSummary(resp.id, year, month);

    const systemTotal = sysSummary.reduce((s, r) => s + parseFloat(r.amount_due ?? "0"), 0);
    const doctorTotal = docSummary.reduce((s, r) => s + parseFloat(r.amount_due ?? "0"), 0);
    const reportsCount = sysSummary.reduce((s, r) => s + r.reports_count, 0);
    const pendingCount = sysSummary.reduce((s, r) => s + r.pending_items_count, 0);

    result.push({
      ...resp,
      system_total: systemTotal,
      doctor_total: doctorTotal,
      reports_count: reportsCount,
      pending_count: pendingCount,
    });
  }

  return { responsibles: result };
}

// ─── Billing Cycle Helpers (V3 Operacional) ──────────────────────────────────

import { gte, lte, isNull, desc, sql as drizzleSql } from "drizzle-orm";

/**
 * Retorna a configuração de ciclo de uma unidade.
 * Se não existir, retorna os defaults (dia 1 para ambos).
 */
export async function getCycleConfig(unitId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(billing_cycle_configs)
    .where(eq(billing_cycle_configs.unit_id, unitId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Cria ou atualiza a configuração de ciclo de uma unidade.
 */
export async function upsertCycleConfig(data: {
  unit_id: number;
  doctor_cycle_day: number;
  system_cycle_day: number;
  created_by?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(billing_cycle_configs).values({
    unit_id: data.unit_id,
    doctor_cycle_day: data.doctor_cycle_day,
    system_cycle_day: data.system_cycle_day,
    created_by: data.created_by ?? null,
    is_active: true,
  }).onDuplicateKeyUpdate({
    set: {
      doctor_cycle_day: data.doctor_cycle_day,
      system_cycle_day: data.system_cycle_day,
      is_active: true,
    },
  });
}

/**
 * Calcula as datas de início e fim do ciclo ativo para uma unidade e tipo,
 * com base no dia de fechamento configurado e na data de referência.
 *
 * Exemplo: cycleDay=20, refDate=2026-04-08
 *   → starts_at = 2026-03-20, ends_at = 2026-04-19
 *
 * Exemplo: cycleDay=20, refDate=2026-04-20
 *   → starts_at = 2026-04-20, ends_at = 2026-05-19
 */
export function computeCycleDates(cycleDay: number, refDate: Date): { starts_at: string; ends_at: string } {
  const day = refDate.getDate();
  const month = refDate.getMonth(); // 0-indexed
  const year = refDate.getFullYear();

  let startYear = year;
  let startMonth = month;

  if (day < cycleDay) {
    // Estamos antes do dia de fechamento: ciclo começou no mês anterior
    startMonth = month - 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear = year - 1;
    }
  }

  const starts = new Date(startYear, startMonth, cycleDay);
  const ends = new Date(startYear, startMonth + 1, cycleDay - 1);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { starts_at: fmt(starts), ends_at: fmt(ends) };
}

/**
 * Retorna o ciclo ativo para uma unidade e tipo.
 * Se não existir, cria um novo com base na configuração de ciclo.
 */
export async function getOrCreateActiveCycle(
  unitId: number,
  cycleType: "doctor" | "system",
  refDate: Date,
  financialResponsibleId?: number | null
): Promise<typeof billing_cycles.$inferSelect> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Busca ciclo aberto que contém a data de referência
  const refDateStr = refDate.toISOString().slice(0, 10);
  // Use raw SQL for date string comparison (drizzle date columns expect Date objects for lte/gte)
  const existing = await db.select().from(billing_cycles).where(
    and(
      eq(billing_cycles.unit_id, unitId),
      eq(billing_cycles.cycle_type, cycleType),
      eq(billing_cycles.status, "open"),
      drizzleSql`${billing_cycles.starts_at} <= ${refDateStr}`,
      drizzleSql`${billing_cycles.ends_at} >= ${refDateStr}`,
    )
  ).limit(1);

  if (existing.length > 0) return existing[0];

  // Busca configuração de ciclo da unidade
  const config = await getCycleConfig(unitId);
  const cycleDay = cycleType === "doctor"
    ? (config?.doctor_cycle_day ?? 1)
    : (config?.system_cycle_day ?? 1);

  const { starts_at, ends_at } = computeCycleDates(cycleDay, refDate);

  // Verifica se já existe ciclo com esse starts_at (pode ter sido fechado)
  const existingByStart = await db.select().from(billing_cycles).where(
    and(
      eq(billing_cycles.unit_id, unitId),
      eq(billing_cycles.cycle_type, cycleType),
      drizzleSql`${billing_cycles.starts_at} = ${starts_at}`,
    )
  ).limit(1);

  if (existingByStart.length > 0) return existingByStart[0];

  // Cria novo ciclo
  // Convert date strings to Date objects for Drizzle's date column type
  const startsDate = new Date(starts_at + 'T00:00:00Z');
  const endsDate = new Date(ends_at + 'T00:00:00Z');
  const result = await db.insert(billing_cycles).values({
    unit_id: unitId,
    financial_responsible_id: financialResponsibleId ?? null,
    cycle_type: cycleType,
    starts_at: startsDate,
    ends_at: endsDate,
    status: "open",
    total_reports: 0,
    total_amount: "0.00",
  } as any);

  const newId = Number(result[0].insertId);
  const newCycle = await db.select().from(billing_cycles).where(eq(billing_cycles.id, newId)).limit(1);
  return newCycle[0];
}

/**
 * Cria um evento financeiro por laudo assinado.
 * report_key = `report_${report_id}` — cada laudo gera exatamente 1 evento financeiro.
 *
 * Se já existir um evento para esse laudo (report_id), retorna o existente sem criar duplicata.
 */
export async function createBillingVisitEvent(data: {
  report_id: number;
  study_instance_uid?: string | null;
  unit_id: number;
  doctor_user_id: number;
  financial_responsible_id?: number | null;
  patient_name?: string | null;
  study_date?: string | null;
  signed_at: Date;
}): Promise<{ event: typeof billing_visit_events.$inferSelect; created: boolean; doctor_amount_due: string | null }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Chave de deduplicação: um evento por laudo
  const reportKey = `report_${data.report_id}`;
  const normalizedName = (data.patient_name ?? "UNKNOWN")
    .replace(/\^/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  const studyDate = data.study_date ?? data.signed_at.toISOString().slice(0, 10);

  // Verifica se já existe evento para esse laudo
  const existing = await db.select().from(billing_visit_events)
    .where(eq(billing_visit_events.report_key, reportKey)).limit(1);

  if (existing.length > 0) {
    return { event: existing[0], created: false, doctor_amount_due: existing[0].doctor_amount_due };
  }

  // Busca ciclos ativos
  const doctorCycle = await getOrCreateActiveCycle(
    data.unit_id, "doctor", data.signed_at, data.financial_responsible_id
  );
  const systemCycle = await getOrCreateActiveCycle(
    data.unit_id, "system", data.signed_at, data.financial_responsible_id
  );

  // Busca preços ativos
  const { getActiveSystemPrice, getActiveDoctorPrice, getActiveResponsibleForUnit } = await import("./db");

  const responsible = data.financial_responsible_id
    ? { id: data.financial_responsible_id }
    : await getActiveResponsibleForUnit(data.unit_id, data.signed_at);

  const responsibleId = responsible?.id ?? null;

  const systemPrice = responsibleId
    ? await getActiveSystemPrice(responsibleId, data.unit_id, data.signed_at)
    : null;
  const doctorPrice = responsibleId
    ? await getActiveDoctorPrice(responsibleId, data.unit_id, data.doctor_user_id, data.signed_at)
    : null;

  const systemAmt = systemPrice ? parseFloat(systemPrice.price_per_report ?? "0") : null;
  const doctorAmt = doctorPrice ? parseFloat(doctorPrice.price_per_report ?? "0") : null;

  const pricingStatus =
    systemAmt !== null && doctorAmt !== null ? "ok" :
    systemAmt !== null ? "pending_doctor_price" :
    doctorAmt !== null ? "pending_system_price" : "pending_both";

  const insertResult = await db.insert(billing_visit_events).values({
    report_id: data.report_id,
    study_instance_uid: data.study_instance_uid ?? null,
    unit_id: data.unit_id,
    doctor_user_id: data.doctor_user_id,
    financial_responsible_id: responsibleId,
    report_key: reportKey,
    patient_name: normalizedName,
    study_date: studyDate ? new Date(studyDate + 'T00:00:00Z') : null,
    doctor_cycle_id: doctorCycle.id,
    system_cycle_id: systemCycle.id,
    system_price_applied: systemAmt !== null ? String(systemAmt) : null,
    doctor_price_applied: doctorAmt !== null ? String(doctorAmt) : null,
    system_amount_due: systemAmt !== null ? String(systemAmt) : null,
    doctor_amount_due: doctorAmt !== null ? String(doctorAmt) : null,
    pricing_status: pricingStatus,
  });

  const newId = Number(insertResult[0].insertId);

  // Atualiza consolidados
  await updateCycleSummaries(doctorCycle.id, systemCycle.id, data.unit_id, data.doctor_user_id, responsibleId, doctorAmt, systemAmt);

  const newEvent = await db.select().from(billing_visit_events)
    .where(eq(billing_visit_events.id, newId)).limit(1);
  return { event: newEvent[0], created: true, doctor_amount_due: doctorAmt !== null ? String(doctorAmt) : null };
}

/**
 * Atualiza os consolidados de ciclo após um novo evento de laudo.
 */
async function updateCycleSummaries(
  doctorCycleId: number,
  systemCycleId: number,
  unitId: number,
  doctorUserId: number,
  financialResponsibleId: number | null,
  doctorAmt: number | null,
  systemAmt: number | null
) {
  const db = await getDb();
  if (!db) return;

  // Doctor summary
  const doctorAmtStr = String(doctorAmt ?? 0);
  const isPendingDoctor = doctorAmt === null ? 1 : 0;

  await db.insert(billing_cycle_doctor_summary).values({
    doctor_cycle_id: doctorCycleId,
    unit_id: unitId,
    doctor_user_id: doctorUserId,
    financial_responsible_id: financialResponsibleId,
    reports_count: 1,
    amount_due: doctorAmtStr,
    pending_pricing_count: isPendingDoctor,
  }).onDuplicateKeyUpdate({
    set: {
      reports_count: drizzleSql`reports_count + 1`,
      amount_due: drizzleSql`amount_due + ${doctorAmtStr}`,
      pending_pricing_count: drizzleSql`pending_pricing_count + ${isPendingDoctor}`,
    },
  });

  // System summary
  const systemAmtStr = String(systemAmt ?? 0);
  const isPendingSystem = systemAmt === null ? 1 : 0;

  await db.insert(billing_cycle_system_summary).values({
    system_cycle_id: systemCycleId,
    unit_id: unitId,
    financial_responsible_id: financialResponsibleId,
    reports_count: 1,
    amount_due: systemAmtStr,
    pending_pricing_count: isPendingSystem,
  }).onDuplicateKeyUpdate({
    set: {
      reports_count: drizzleSql`reports_count + 1`,
      amount_due: drizzleSql`amount_due + ${systemAmtStr}`,
      pending_pricing_count: drizzleSql`pending_pricing_count + ${isPendingSystem}`,
    },
  });

  // Atualiza totais do ciclo
  await db.update(billing_cycles).set({
    total_reports: drizzleSql`total_reports + 1`,
    total_amount: drizzleSql`total_amount + ${doctorAmtStr}`,
  }).where(eq(billing_cycles.id, doctorCycleId));

  await db.update(billing_cycles).set({
    total_reports: drizzleSql`total_reports + 1`,
    total_amount: drizzleSql`total_amount + ${systemAmtStr}`,
  }).where(eq(billing_cycles.id, systemCycleId));
}

/**
 * Retorna o resumo financeiro do médico logado:
 * ciclo atual por unidade + histórico de ciclos fechados.
 */
export async function getDoctorFinancialSummary(doctorUserId: number) {
  const db = await getDb();
  if (!db) return { currentCycles: [], history: [], totalOpen: "0.00", totalUnits: 0 };

  // Ciclos abertos do médico com nome da unidade
  const currentCycles = await db.select({
    summary: billing_cycle_doctor_summary,
    cycle: billing_cycles,
    unit_name: units.name,
  }).from(billing_cycle_doctor_summary)
    .innerJoin(billing_cycles, eq(billing_cycle_doctor_summary.doctor_cycle_id, billing_cycles.id))
    .innerJoin(units, eq(billing_cycle_doctor_summary.unit_id, units.id))
    .where(
      and(
        eq(billing_cycle_doctor_summary.doctor_user_id, doctorUserId),
        eq(billing_cycles.status, "open"),
      )
    );

  // Histórico de ciclos fechados com nome da unidade
  const history = await db.select({
    summary: billing_cycle_doctor_summary,
    cycle: billing_cycles,
    unit_name: units.name,
  }).from(billing_cycle_doctor_summary)
    .innerJoin(billing_cycles, eq(billing_cycle_doctor_summary.doctor_cycle_id, billing_cycles.id))
    .innerJoin(units, eq(billing_cycle_doctor_summary.unit_id, units.id))
    .where(
      and(
        eq(billing_cycle_doctor_summary.doctor_user_id, doctorUserId),
        eq(billing_cycles.status, "closed"),
      )
    )
    .orderBy(desc(billing_cycles.ends_at))
    .limit(24);

  // Totais gerais dos ciclos abertos
  const totalOpen = currentCycles.reduce((sum, r) => sum + parseFloat(r.summary.amount_due ?? "0"), 0);
  const totalUnits = new Set(currentCycles.map(r => r.summary.unit_id)).size;

  return { currentCycles, history, totalOpen: totalOpen.toFixed(2), totalUnits };
}

/**
 * Retorna os eventos de visita de um médico em um ciclo específico.
 */
export async function getDoctorCycleEvents(doctorUserId: number, doctorCycleId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(billing_visit_events).where(
    and(
      eq(billing_visit_events.doctor_user_id, doctorUserId),
      eq(billing_visit_events.doctor_cycle_id, doctorCycleId),
    )
  ).orderBy(desc(billing_visit_events.createdAt));
}

/**
 * Médico sinaliza que recebeu o valor de um ciclo/unidade.
 */
export async function markDoctorCycleReceived(
  doctorCycleId: number,
  unitId: number,
  doctorUserId: number,
  receivedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(billing_cycle_doctor_summary).set({
    received_at: new Date(),
    received_by: receivedBy,
  }).where(
    and(
      eq(billing_cycle_doctor_summary.doctor_cycle_id, doctorCycleId),
      eq(billing_cycle_doctor_summary.unit_id, unitId),
      eq(billing_cycle_doctor_summary.doctor_user_id, doctorUserId),
    )
  );
}

/**
 * Retorna o resumo financeiro do responsável:
 * ciclos abertos por unidade + totais.
 */
export async function getResponsibleCycleSummary(financialResponsibleId: number) {
  const db = await getDb();
  if (!db) return { systemCycles: [], doctorCycles: [], totalSystem: "0.00", totalDoctors: "0.00", totalGeral: "0.00" };

  const systemCycles = await db.select({
    summary: billing_cycle_system_summary,
    cycle: billing_cycles,
    unit_name: units.name,
  }).from(billing_cycle_system_summary)
    .innerJoin(billing_cycles, eq(billing_cycle_system_summary.system_cycle_id, billing_cycles.id))
    .innerJoin(units, eq(billing_cycle_system_summary.unit_id, units.id))
    .where(eq(billing_cycle_system_summary.financial_responsible_id, financialResponsibleId));

  const doctorCycles = await db.select({
    summary: billing_cycle_doctor_summary,
    cycle: billing_cycles,
    unit_name: units.name,
    doctor_name: users.name,
  }).from(billing_cycle_doctor_summary)
    .innerJoin(billing_cycles, eq(billing_cycle_doctor_summary.doctor_cycle_id, billing_cycles.id))
    .innerJoin(units, eq(billing_cycle_doctor_summary.unit_id, units.id))
    .innerJoin(users, eq(billing_cycle_doctor_summary.doctor_user_id, users.id))
    .where(eq(billing_cycle_doctor_summary.financial_responsible_id, financialResponsibleId));

  // Totais
  const totalSystem = systemCycles
    .filter(r => r.cycle.status === "open")
    .reduce((sum, r) => sum + parseFloat(r.summary.amount_due ?? "0"), 0);
  const totalDoctors = doctorCycles
    .filter(r => r.cycle.status === "open")
    .reduce((sum, r) => sum + parseFloat(r.summary.amount_due ?? "0"), 0);

  return {
    systemCycles,
    doctorCycles,
    totalSystem: totalSystem.toFixed(2),
    totalDoctors: totalDoctors.toFixed(2),
    totalGeral: (totalSystem + totalDoctors).toFixed(2),
  };
}

/**
 * Retorna info financeira discreta para o seletor de unidades:
 * valor/laudo do médico e acumulado no ciclo atual.
 */
export async function getDoctorUnitFinancialInfo(doctorUserId: number, unitId: number) {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const refDateStr = now.toISOString().slice(0, 10);

  // Ciclo ativo do médico nessa unidade
  const activeCycle = await db.select().from(billing_cycles).where(
    and(
      eq(billing_cycles.unit_id, unitId),
      eq(billing_cycles.cycle_type, "doctor"),
      eq(billing_cycles.status, "open"),
      drizzleSql`${billing_cycles.starts_at} <= ${refDateStr}`,
      drizzleSql`${billing_cycles.ends_at} >= ${refDateStr}`,
    )
  ).limit(1);

  if (activeCycle.length === 0) return { price_per_report: null, cycle_visits: 0, cycle_amount: "0.00", cycle_period: null };

  const cycle = activeCycle[0];

  const summary = await db.select().from(billing_cycle_doctor_summary).where(
    and(
      eq(billing_cycle_doctor_summary.doctor_cycle_id, cycle.id),
      eq(billing_cycle_doctor_summary.unit_id, unitId),
      eq(billing_cycle_doctor_summary.doctor_user_id, doctorUserId),
    )
  ).limit(1);

  // Busca preço ativo do médico
  const responsible = await getActiveResponsibleForUnit(unitId, now);
  const doctorPrice = responsible
    ? await getActiveDoctorPrice(responsible.id, unitId, doctorUserId, now)
    : null;

  return {
    price_per_report: doctorPrice?.price_per_report ?? null,
    cycle_visits: summary[0]?.reports_count ?? 0,
    cycle_amount: summary[0]?.amount_due ?? "0.00",
    cycle_period: { starts_at: cycle.starts_at, ends_at: cycle.ends_at },
  };
}

/**
 * Fecha um ciclo manualmente (admin_master).
 */
export async function closeBillingCycle(cycleId: number, closedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(billing_cycles).set({
    status: "closed",
    closedAt: new Date(),
    closedBy,
  }).where(eq(billing_cycles.id, cycleId));
}

/**
 * Lista todos os ciclos de uma unidade.
 */
export async function listUnitCycles(unitId: number, cycleType?: "doctor" | "system") {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(billing_cycles.unit_id, unitId)];
  if (cycleType) conditions.push(eq(billing_cycles.cycle_type, cycleType));
  return await db.select().from(billing_cycles)
    .where(and(...conditions))
    .orderBy(desc(billing_cycles.starts_at));
}
