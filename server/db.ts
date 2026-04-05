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
  StudyMetadata
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
  role: 'admin_master' | 'unit_admin' | 'medico' | 'viewer' | 'operador';
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
      notes: data.notes ?? null,
      edited_by_user_id: data.edited_by_user_id,
      edited_by_name: data.edited_by_name ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        patient_name_override: data.patient_name_override ?? null,
        description_override: data.description_override ?? null,
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
