import { drizzle } from "drizzle-orm/mysql2";
import { or, and, eq, like, inArray, SQL, ne, gte, lte, isNull, desc, sql as drizzleSql2, count as drizzleCount, or as _or, and as _and, eq as _eq, lte as _lte, gte as _gte, ne as _ne, inArray as _inArray, isNull as isNullFn, desc as _desc } from "drizzle-orm";
import { 
  InsertUser, 
  users, 
  users as usersTable,
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
  user_unit_permissions,
  phrase_groups,
  phrases,
  financial_responsibles,
  InsertFinancialResponsible,
  financial_responsible_units,
  financial_responsible_users,
  billing_system_unit_prices,
  billing_doctor_unit_prices,
  billing_doctor_modality_prices,
  BillingDoctorModalityPrice,
  billing_report_items,
  billing_monthly_doctor_by_unit,
  billing_monthly_system_by_unit,
  FinancialResponsible,
  FinancialResponsibleUser,
  FinancialResponsibleUnit,
  BillingSystemUnitPrice,
  BillingDoctorUnitPrice,
  BillingReportItem,
  InsertBillingReportItem,
  BillingMonthlySystemByUnit,
  BillingMonthlyDoctorByUnit,
  unit_exam_prices,
  report_masks,
  ReportMask,
  InsertReportMask,
  group_permission_configs,
  GroupPermissionConfig,
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
  // FIX Bug2: verificar username duplicado antes do INSERT
  if (data.username) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, data.username))
      .limit(1);
    if (existing.length > 0) throw new Error('USERNAME_TAKEN');
  }
  // PRG-02: usar crypto.randomUUID() para evitar colisão em criações simultâneas
  const openId = `local_${data.username}_${crypto.randomUUID()}`;
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
/** Retorna todas as unidades sem campos sensíveis (SEC-04: orthanc_basic_pass omitido) */
export async function getAllUnits() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(units);
  // SEC-04: remover orthanc_basic_pass antes de retornar ao frontend
  return rows.map(({ orthanc_basic_pass: _pass, ...safe }) => safe);
}

/** Retorna uma unidade pelo ID sem campos sensíveis (SEC-04: orthanc_basic_pass omitido) */
export async function getUnitById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(units).where(eq(units.id, id)).limit(1);
  if (result.length === 0) return undefined;
  // SEC-04: remover orthanc_basic_pass antes de retornar ao frontend
  const { orthanc_basic_pass: _pass, ...safe } = result[0];
  return safe;
}

export async function getUnitBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(units).where(eq(units.slug, slug)).limit(1);
  if (result.length === 0) return undefined;
  // SEC-04: remover orthanc_basic_pass antes de retornar ao frontend
  const { orthanc_basic_pass: _pass, ...safe } = result[0];
  return safe;
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
  
  let q = db.select().from(studies_cache).where(and(...conditions));
  if (filters?.limit) q = q.limit(filters.limit) as typeof q;
  if (filters?.offset) q = q.offset(filters.offset) as typeof q;
  return await q;
}

export async function getStudyById(id: number, unitId?: number, unitIds?: number[]) {
  const db = await getDb();
  if (!db) return undefined;
  // E4: sem acesso a nenhuma unidade
  if (unitIds !== undefined && unitIds.length === 0) return undefined;
  const conditions: SQL[] = [eq(studies_cache.id, id)];
  if (unitId !== undefined) conditions.push(eq(studies_cache.unit_id, unitId));
  else if (unitIds !== undefined && unitIds.length > 0) conditions.push(inArray(studies_cache.unit_id, unitIds));
  const result = await db.select().from(studies_cache).where(and(...conditions)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createStudyCache(study: InsertStudyCache) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(studies_cache).values(study);
  return Number(result[0].insertId);
}

/**
 * Insere ou atualiza estudos no cache local após C-FIND.
 * Usa ON DUPLICATE KEY UPDATE para não falhar em re-consultas do mesmo estudo.
 * A chave de upsert é study_instance_uid (UNIQUE INDEX uq_study_instance_uid).
 * modality usa COALESCE: mantém valor anterior se novo C-FIND retornar vazio.
 */
export async function upsertStudyCache(study: {
  unit_id: number;
  study_instance_uid: string;
  patient_name?: string | null;
  patient_id?: string | null;
  accession_number?: string | null;
  study_date?: Date | null;
  modality?: string | null;
  description?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(drizzleSql2`
      INSERT INTO studies_cache
        (unit_id, study_instance_uid, patient_name, patient_id,
         accession_number, study_date, modality, description,
         createdAt, updatedAt)
      VALUES
        (${study.unit_id},
         ${study.study_instance_uid},
         ${study.patient_name ?? null},
         ${study.patient_id ?? null},
         ${study.accession_number ?? null},
         ${study.study_date ?? null},
         ${study.modality ?? null},
         ${study.description ?? null},
         NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        patient_name     = VALUES(patient_name),
        patient_id       = VALUES(patient_id),
        accession_number = VALUES(accession_number),
        study_date       = VALUES(study_date),
        modality         = COALESCE(VALUES(modality), modality),
        description      = VALUES(description),
        updatedAt        = NOW()
    `);
  } catch (err) {
    console.warn('[upsertStudyCache] Falha ao atualizar cache:', err);
  }
}

// Busca estudo por study_instance_uid validando unit_id (previne IDOR)
export async function getStudyByInstanceUid(studyInstanceUid: string, unitId?: number, unitIds?: number[]) {
  const db = await getDb();
  if (!db) return undefined;
  // E4: sem acesso a nenhuma unidade
  if (unitIds !== undefined && unitIds.length === 0) return undefined;
  const conditions: SQL[] = [eq(studies_cache.study_instance_uid, studyInstanceUid)];
  if (unitId !== undefined) conditions.push(eq(studies_cache.unit_id, unitId));
  else if (unitIds !== undefined && unitIds.length > 0) conditions.push(inArray(studies_cache.unit_id, unitIds));
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

export async function getReportByStudyId(studyId: number, unitId?: number, unitIds?: number[]) {
  const db = await getDb();
  if (!db) return undefined;
  // E4: sem acesso a nenhuma unidade
  if (unitIds !== undefined && unitIds.length === 0) return undefined;
  const conditions: SQL[] = [eq(reports.study_id, studyId)];
  if (unitId !== undefined) conditions.push(eq(reports.unit_id, unitId));
  else if (unitIds !== undefined && unitIds.length > 0) conditions.push(inArray(reports.unit_id, unitIds));
  const result = await db.select().from(reports).where(and(...conditions)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getReportById(id: number, unitId?: number, unitIds?: number[]) {
  const db = await getDb();
  if (!db) return undefined;
  // E4: sem acesso a nenhuma unidade
  if (unitIds !== undefined && unitIds.length === 0) return undefined;
  const conditions: SQL[] = [eq(reports.id, id)];
  if (unitId !== undefined) conditions.push(eq(reports.unit_id, unitId));
  else if (unitIds !== undefined && unitIds.length > 0) conditions.push(inArray(reports.unit_id, unitIds));
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
  unitId?: number,
  unitIds?: number[]
): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db || studyUids.length === 0) return {};

  // E4: suporte a médico multiunidade (unit_id null) via inArray
  if (unitIds !== undefined && unitIds.length === 0) return {}; // sem acesso
  const conditions: SQL[] = [inArray(reports.study_instance_uid, studyUids)];
  if (unitId !== undefined) conditions.push(eq(reports.unit_id, unitId));
  else if (unitIds !== undefined && unitIds.length > 0) conditions.push(inArray(reports.unit_id, unitIds));

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
): Promise<(StudyMetadata & { has_anamnesis: boolean })[]> {
  if (!studyInstanceUids.length) return [];
  const db = await getDb();
  if (!db) return [];
  // Busca metadados
  const rows = await db
    .select()
    .from(study_metadata)
    .where(
      and(
        inArray(study_metadata.study_instance_uid, studyInstanceUids),
        eq(study_metadata.unit_id, unitId)
      )
    );
  // Busca quais UIDs têm anamnese registrada
  const anamnesisRows = await db
    .select({ study_instance_uid: anamnesis_simple.study_instance_uid })
    .from(anamnesis_simple)
    .where(inArray(anamnesis_simple.study_instance_uid, studyInstanceUids));
  const anamnesisSet = new Set(anamnesisRows.map(r => r.study_instance_uid));
  return rows.map(r => ({ ...r, has_anamnesis: anamnesisSet.has(r.study_instance_uid) }));
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
  return db.select().from(user_unit_permissions).where(eq(user_unit_permissions.user_id, userId));
}

/** Retorna a permissão de um usuário para uma unidade específica */
export async function getUserUnitPermission(userId: number, unitId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(user_unit_permissions)
    .where(and(eq(user_unit_permissions.user_id, userId), eq(user_unit_permissions.unit_id, unitId)));
  return rows[0] ?? null;
}

/**
 * Resolve o unit_id efetivo para um usuário.
 * Prioridade: (1) unit_id legado do campo users.unit_id,
 *             (2) inputUnitId se o usuário tiver permissão nela,
 *             (3) primeira unidade em user_unit_permissions.
 * Retorna null se o usuário não tiver acesso a nenhuma unidade.
 */
/**
 * ERRO 2.2 FIX: Quando input.unit_id é informado, ele deve ter prioridade.
 * Só usar users.unit_id quando input.unit_id não existir.
 * 
 * Regra correta:
 * 1) admin_master: pode usar input.unit_id
 * 2) se input.unit_id foi enviado: verificar user_unit_permissions ou fallback legado para esse unitId
 * 3) se input.unit_id não foi enviado: usar users.unit_id ou primeira unidade permitida
 * 4) nunca ignorar a unidade selecionada pelo usuário
 */
export async function resolveEffectiveUnitId(
  userId: number,
  legacyUnitId: number | null | undefined,
  inputUnitId?: number | null
): Promise<number | null> {
  // V14-P1 FIX: Prioridade correta conforme auditoria V14
  // 1) inputUnitId informado: validar em user_unit_permissions, depois fallback legado
  // 2) sem inputUnitId: user_unit_permissions primeiro, legado só se sem permissões granulares
  const perms = await getUserUnitPermissions(userId);
  
  if (inputUnitId) {
    if (perms.some(p => p.unit_id === inputUnitId)) return inputUnitId;
    if (legacyUnitId === inputUnitId) return inputUnitId;
    return null;
  }
  
  // Sem inputUnitId: user_unit_permissions é a fonte principal
  if (perms.length > 0) return perms[0].unit_id;
  
  // Fallback legado: apenas se sem permissões granulares
  if (legacyUnitId) return legacyUnitId;
  return null;
}

/**
 * ERRO 2.1 FIX: Função central de autorização que aceita fallback legado.
 * Valida se usuário tem permissão para uma ação em uma unidade.
 * 
 * Regra:
 * - admin_master: sempre autorizado
 * - se existir user_unit_permissions: obedecer o booleano da permissão
 * - se não existir user_unit_permissions e user.unit_id === unitId: aplicar compatibilidade temporária
 * - caso contrário: negar
 */
export async function assertUnitPermission(
  userOrId: number | { id: number; role: string; unit_id?: number | null },
  unitId: number,
  permission: 'view_studies' | 'edit_reports' | 'view_anamnesis' | 'print_reports' | 'manage_templates' | 'edit_anamnesis' | 'edit_exam_legend',
  legacyUnitId?: number | null
): Promise<boolean> {
  // Suporte a objeto user completo ou apenas userId
  const userId = typeof userOrId === 'number' ? userOrId : userOrId.id;
  const role = typeof userOrId === 'object' ? userOrId.role : null;
  const legacyId = typeof userOrId === 'object' ? (userOrId.unit_id ?? null) : (legacyUnitId ?? null);

  // admin_master sempre autorizado
  if (role === 'admin_master') return true;

  // Verificar se há registro em user_unit_permissions
  const perm = await getUserUnitPermission(userId, unitId);
  if (perm) {
    return (perm as any)[permission] === true;
  }
  
  // V14-P1 FIX: Fallback legado com perfil MÍNIMO (não libera tudo)
  // Apenas view_studies e print_reports são seguros sem permissão granular explícita
  if (legacyId === unitId) {
    const LEGACY_FALLBACK: Record<string, boolean> = {
      view_studies: true,
      print_reports: true,
      edit_reports: false,
      view_anamnesis: false,
      edit_anamnesis: false,
      edit_exam_legend: false,
      manage_templates: false,
    };
    return LEGACY_FALLBACK[permission] === true;
  }
  
  return false;
}

/**
 * ERRO CRÍTICO 2 FIX: Resolve o filtro de unidade para queries de laudos/estudos.
 * Prioriza permissões granulares sobre o campo legado users.unit_id.
 * - admin_master: retorna {} (sem filtro — acesso total)
 * - usuário com permissões granulares: retorna { unitIds } (filtro inArray)
 * - fallback legado (quando sem permissões granulares): retorna { unitId } (filtro simples)
 * - sem acesso a nenhuma unidade: retorna { unitIds: [] } (resultado vazio)
 */
export async function resolveUnitFilter(
  role: string,
  userId: number,
  legacyUnitId: number | null | undefined
): Promise<{ unitId?: number; unitIds?: number[] }> {
  if (role === 'admin_master') return {};
  
  // V13-P1 FIX: Priorizar user_unit_permissions; users.unit_id é apenas fallback legado
  const perms = await getUserUnitPermissions(userId);
  const ids = perms.map(p => p.unit_id);
  
  if (ids.length > 0) {
    // Usuário tem permissões granulares — usa somente elas
    if (ids.length === 1) return { unitId: ids[0] };
    return { unitIds: ids };
  }
  
  // Fallback legado: sem permissões granulares, usar users.unit_id
  if (legacyUnitId) return { unitId: legacyUnitId };
  
  return { unitIds: [] };
}

/** Define (replace) as permissões de um usuário para uma lista de unidades.
 *  Unidades não incluídas na lista terão seus registros removidos. */
export async function setUserUnitPermissions(
  userId: number,
  permissions: Array<{
    unit_id: number;
    group_key?: string;  // V14-P1 FIX: gravar group_key para rastreabilidade
    view_studies: boolean;
    edit_reports: boolean;
    view_anamnesis: boolean;
    edit_anamnesis: boolean;
    edit_exam_legend: boolean;
    print_reports: boolean;
    manage_templates: boolean;
    view_financial?: boolean;
  }>
) : Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Remove todas as permissões existentes do usuário
  await db.delete(user_unit_permissions).where(eq(user_unit_permissions.user_id, userId));

  // Insere as novas permissões
  if (permissions.length > 0) {
    await db.insert(user_unit_permissions).values(
      permissions.map((p) => ({
        user_id: userId,
        unit_id: p.unit_id,
        group_key: (p.group_key as any) ?? 'outros',  // V14-P1 FIX: gravar group_key
        view_studies: p.view_studies,
        edit_reports: p.edit_reports,
        view_anamnesis: p.view_anamnesis,
        edit_anamnesis: p.edit_anamnesis,
        edit_exam_legend: p.edit_exam_legend,
        print_reports: p.print_reports,
        manage_templates: p.manage_templates,
        view_financial: p.view_financial ?? false,
      }))
    );
  }

  // V13-P1 FIX: Sincronizar unit_id principal na tabela users (Opção A da auditoria):
  // - 1 unidade: grava users.unit_id com a unidade única (compat. legada)
  // - múltiplas unidades: grava users.unit_id = null (user_unit_permissions é a fonte da verdade)
  // - 0 unidades: grava users.unit_id = null
  if (permissions.length === 1) {
    await db.update(usersTable).set({ unit_id: permissions[0].unit_id }).where(eq(usersTable.id, userId));
  } else {
    // 0 ou múltiplas unidades: limpar unit_id para forçar uso de user_unit_permissions
    await db.update(usersTable).set({ unit_id: null }).where(eq(usersTable.id, userId));
  }
}

// ─── Phrase Groups ────────────────────────────────────────────────────────────
export async function listPhraseGroups(userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
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
  await db.update(phrases).set({ isActive: false })
    .where(and(eq(phrases.id, phraseId), eq(phrases.user_id, userId)));
}

export async function togglePhrasesFavorite(phraseId: number, userId: number, isFavorite: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(phrases).set({ is_favorite: isFavorite })
    .where(and(eq(phrases.id, phraseId), or(eq(phrases.user_id, userId), eq(phrases.is_global, true))));
}

// ─── User CRM / Signature ─────────────────────────────────────────────────────
export async function updateUserMedicalData(userId: number, data: { crm?: string; signature_url?: string | null; stamp_url?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set(data).where(eq(users.id, userId));
}

// ─── Unit Logo ────────────────────────────────────────────────────────────────
export async function updateUnitLogo(unitId: number, logoUrl: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(units).set({ logo_url: logoUrl }).where(eq(units.id, unitId));
}


// ─── Billing Helpers V2 ───────────────────────────────────────────────────────
// Modelagem correta: responsável financeiro como entidade pagadora central.
// Tabelas: financial_responsibles, financial_responsible_users,
//          financial_responsible_units, billing_system_unit_prices,
//          billing_doctor_unit_prices, billing_report_items,
//          billing_monthly_system_by_unit, billing_monthly_doctor_by_unit



// ─── Responsáveis Financeiros ─────────────────────────────────────────────────

export async function listFinancialResponsibles(): Promise<FinancialResponsible[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(financial_responsibles).orderBy(financial_responsibles.legal_name);
}

export async function getFinancialResponsibleById(id: number): Promise<FinancialResponsible | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(financial_responsibles).where(eq(financial_responsibles.id, id)).limit(1);
  return rows[0];
}

export async function createFinancialResponsible(data: InsertFinancialResponsible): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(financial_responsibles).values(data);
  return result[0].insertId as number;
}

export async function updateFinancialResponsible(id: number, data: Partial<InsertFinancialResponsible>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
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
  await db.delete(financial_responsible_users).where(and(eq(financial_responsible_users.financial_responsible_id, financialResponsibleId), eq(financial_responsible_users.user_id, userId)));
}

export async function getResponsibleIdForUser(userId: number): Promise<number | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select({ id: financial_responsible_users.financial_responsible_id }).from(financial_responsible_users).where(eq(financial_responsible_users.user_id, userId)).limit(1);
  return rows[0]?.id;
}

export async function listUsersForResponsible(financialResponsibleId: number): Promise<FinancialResponsibleUser[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(financial_responsible_users).where(eq(financial_responsible_users.financial_responsible_id, financialResponsibleId));
}

// ─── Vínculos Unidade → Responsável ──────────────────────────────────────────
export async function linkUnitToResponsible(financialResponsibleId: number, unitId: number, startsAt: Date, endsAt?: Date, createdBy?: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

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
  const at = atDate ?? new Date();
  // Regra correta: starts_at <= data E (ends_at IS NULL OU ends_at >= data)
  // Ordenar starts_at DESC para pegar a vigência mais recente
  const rows = await db.select().from(financial_responsible_units)
    .where(and(
      eq(financial_responsible_units.unit_id, unitId),
      lte(financial_responsible_units.starts_at, at),
      or(isNull(financial_responsible_units.ends_at), gte(financial_responsible_units.ends_at, at))
    ))
    .orderBy(desc(financial_responsible_units.starts_at))
    .limit(1);
  return rows[0];
}

export async function listUnitsForResponsible(financialResponsibleId: number): Promise<FinancialResponsibleUnit[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(financial_responsible_units)
    .where(eq(financial_responsible_units.financial_responsible_id, financialResponsibleId));
}


// ─── Preços do Sistema por Unidade ───────────────────────────────────────────

export async function getActiveSystemPrice(financialResponsibleId: number, unitId: number, atDate?: Date): Promise<BillingSystemUnitPrice | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const at = atDate ?? new Date();
  // Regra correta: starts_at <= data E (ends_at IS NULL OU ends_at >= data)
  // Ordenar starts_at DESC para pegar a vigência mais recente
  const rows = await db.select().from(billing_system_unit_prices)
    .where(and(
      eq(billing_system_unit_prices.financial_responsible_id, financialResponsibleId),
      eq(billing_system_unit_prices.unit_id, unitId),
      lte(billing_system_unit_prices.starts_at, at),
      or(isNull(billing_system_unit_prices.ends_at), gte(billing_system_unit_prices.ends_at, at))
    ))
    .orderBy(desc(billing_system_unit_prices.starts_at))
    .limit(1);
  return rows[0];
}

export async function listSystemPricesForUnit(financialResponsibleId: number, unitId: number): Promise<BillingSystemUnitPrice[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
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

  // Encerrar automaticamente qualquer preço ativo anterior para esse responsável/unidade
  const existing = await getActiveSystemPrice(data.financial_responsible_id, data.unit_id, data.starts_at);
  if (existing) {
    const endDate = new Date(data.starts_at.getTime() - 1000);
    await db.update(billing_system_unit_prices)
      .set({ ends_at: endDate })
      .where(eq(billing_system_unit_prices.id, existing.id));
  }

  const result = await db.insert(billing_system_unit_prices).values(data);
  return result[0].insertId as number;
}

// ─── Preços do Médico por Unidade ─────────────────────────────────────────────

/**
 * Busca o preço ativo de um médico em uma unidade com hierarquia de fallback:
 *   1. billing_doctor_modality_prices (modality específica) — se modality fornecida
 *   2. billing_doctor_unit_prices (preço padrão do médico na unidade)
 *   3. undefined → pricing_status será pending_doctor_price ou pending_both
 *
 * Retorna { price_per_report, source } onde source indica de onde veio o preço.
 */
export async function getActiveDoctorPrice(
  financialResponsibleId: number,
  unitId: number,
  doctorUserId: number,
  atDate?: Date,
  modality?: string | null
): Promise<(BillingDoctorUnitPrice & { _source?: 'modality' | 'unit_default' }) | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const at = atDate ?? new Date();

  // 1. Buscar preço específico por modalidade (se modality fornecida e não vazia)
  if (modality && modality.trim() !== '') {
    const modalityRows = await db
      .select()
      .from(billing_doctor_modality_prices)
      .where(and(
        eq(billing_doctor_modality_prices.unit_id, unitId),
        eq(billing_doctor_modality_prices.doctor_user_id, doctorUserId),
        eq(billing_doctor_modality_prices.modality, modality.trim().toUpperCase()),
        lte(billing_doctor_modality_prices.starts_at, at),
        or(
          isNull(billing_doctor_modality_prices.ends_at),
          gte(billing_doctor_modality_prices.ends_at, at)
        )
      ))
      .orderBy(desc(billing_doctor_modality_prices.starts_at))
      .limit(1);
    if (modalityRows.length > 0) {
      // Retorna compatível com BillingDoctorUnitPrice (mesmo campo price_per_report)
      const row = modalityRows[0];
      return {
        id: row.id,
        financial_responsible_id: row.financial_responsible_id,
        unit_id: row.unit_id,
        doctor_user_id: row.doctor_user_id,
        price_per_report: row.price_per_report,
        starts_at: row.starts_at,
        ends_at: row.ends_at ?? null,
        created_by: row.created_by,
        createdAt: row.createdAt,
        _source: 'modality',
      } as BillingDoctorUnitPrice & { _source: 'modality' };
    }
  }

  // 2. Fallback: preço padrão do médico na unidade
  // Regra correta: starts_at <= data E (ends_at IS NULL OU ends_at >= data)
  // Ordenar starts_at DESC para pegar a vigência mais recente
  const rows = await db.select().from(billing_doctor_unit_prices)
    .where(and(
      eq(billing_doctor_unit_prices.financial_responsible_id, financialResponsibleId),
      eq(billing_doctor_unit_prices.unit_id, unitId),
      eq(billing_doctor_unit_prices.doctor_user_id, doctorUserId),
      lte(billing_doctor_unit_prices.starts_at, at),
      or(isNull(billing_doctor_unit_prices.ends_at), gte(billing_doctor_unit_prices.ends_at, at))
    ))
    .orderBy(desc(billing_doctor_unit_prices.starts_at))
    .limit(1);
  if (rows.length > 0) {
    return { ...rows[0], _source: 'unit_default' } as BillingDoctorUnitPrice & { _source: 'unit_default' };
  }
  return undefined;
}

export async function listDoctorPricesForUnit(financialResponsibleId: number, unitId: number): Promise<BillingDoctorUnitPrice[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
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

  // Encerrar automaticamente qualquer preço ativo anterior para esse responsável/unidade/médico
  const existing = await getActiveDoctorPrice(data.financial_responsible_id, data.unit_id, data.doctor_user_id, data.starts_at);
  if (existing) {
    const endDate = new Date(data.starts_at.getTime() - 1000);
    await db.update(billing_doctor_unit_prices)
      .set({ ends_at: endDate })
      .where(eq(billing_doctor_unit_prices.id, existing.id));
  }

  const result = await db.insert(billing_doctor_unit_prices).values(data);
  return result[0].insertId as number;
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

  const conditions: SQL[] = [
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

  // Intervalo da competência em UTC
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  // Buscar laudos signed/revised com signedAt no período
  const faultableReports = await db.select().from(reports)
    .where(and(
      inArray(reports.status, ["signed", "revised"]),
      lte(reports.signedAt, end),
      gte(reports.signedAt, start),
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
    } catch (e: unknown) {
      errors.push(`report ${report.id}: ${e instanceof Error ? e.message : String(e)}`);
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
  return db.select().from(billing_monthly_doctor_by_unit)
    .where(and(
      eq(billing_monthly_doctor_by_unit.doctor_user_id, doctorUserId),
      eq(billing_monthly_doctor_by_unit.competence_year, year),
      eq(billing_monthly_doctor_by_unit.competence_month, month),
    ));
}

export async function getAdminConsolidated(year: number, month: number): Promise<{
  responsibles: (FinancialResponsible & { system_total: number; doctor_total: number; reports_count: number; pending_count: number })[];
  system_total: number;
  doctor_total: number;
  reports_count: number;
  pending_count: number;
  open_cycle_id: number | null;
  pending: Array<{
    id: number;
    unit_name: string;
    doctor_name: string;
    patient_name: string | null;
    report_key: string;
    pricing_status: string;
    system_amount: string;
    doctor_amount: string;
  }>;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const responsibles = await listFinancialResponsibles();
  const result = [];
  let globalSystemTotal = 0;
  let globalDoctorTotal = 0;
  let globalReportsCount = 0;
  let globalPendingCount = 0;

  for (const resp of responsibles) {
    const sysSummary = await getMonthlySystemSummary(resp.id, year, month);
    const docSummary = await getMonthlyDoctorSummary(resp.id, year, month);

    const systemTotal = sysSummary.reduce((s, r) => s + parseFloat(r.amount_due ?? "0"), 0);
    const doctorTotal = docSummary.reduce((s, r) => s + parseFloat(r.amount_due ?? "0"), 0);
    const reportsCount = sysSummary.reduce((s, r) => s + r.reports_count, 0);
    const pendingCount = sysSummary.reduce((s, r) => s + r.pending_items_count, 0);

    globalSystemTotal += systemTotal;
    globalDoctorTotal += doctorTotal;
    globalReportsCount += reportsCount;
    globalPendingCount += pendingCount;

    result.push({
      ...resp,
      system_total: systemTotal,
      doctor_total: doctorTotal,
      reports_count: reportsCount,
      pending_count: pendingCount,
    });
  }

  // Buscar itens com pendência de preço para o mês/ano
  const pendingItems = await db
    .select({
      id: billing_report_items.id,
      unit_id: billing_report_items.unit_id,
      doctor_user_id: billing_report_items.doctor_user_id,
      report_key: billing_report_items.study_instance_uid,
      pricing_status: billing_report_items.pricing_status,
      system_amount: billing_report_items.system_amount_due,
      doctor_amount: billing_report_items.doctor_amount_due,
      report_id: billing_report_items.report_id,
    })
    .from(billing_report_items)
    .where(
      and(
        eq(billing_report_items.competence_year, year),
        eq(billing_report_items.competence_month, month),
        ne(billing_report_items.pricing_status, "ok"),
      )
    )
    .limit(100);

  // Enriquecer com nomes de unidade, médico e paciente
  const enrichedPending = await Promise.all(
    pendingItems.map(async (item) => {
      const unitRow = await db.select({ name: units.name }).from(units).where(eq(units.id, item.unit_id)).limit(1);
      const doctorRow = await db.select({ name: users.name }).from(users).where(eq(users.id, item.doctor_user_id)).limit(1);
      let patientName: string | null = null;
      try {
        if (item.report_key) {
          const cacheRow = await db.select({ patient_name: studies_cache.patient_name }).from(studies_cache).where(eq(studies_cache.study_instance_uid, item.report_key)).limit(1);
          patientName = cacheRow[0]?.patient_name ?? null;
        }
      } catch {}
      return {
        id: item.id,
        unit_name: unitRow[0]?.name ?? `Unidade ${item.unit_id}`,
        doctor_name: doctorRow[0]?.name ?? `Médico ${item.doctor_user_id}`,
        patient_name: patientName,
        report_key: item.report_key ?? `report-${item.report_id}`,
        pricing_status: item.pricing_status,
        system_amount: String(item.system_amount ?? "0.00"),
        doctor_amount: String(item.doctor_amount ?? "0.00"),
      };
    })
  );

  // Buscar o ciclo aberto mais recente (para o botão Fechar Ciclo)
  let openCycleId: number | null = null;
  try {
    const openCycles = await db
      .select({ id: billing_cycles.id })
      .from(billing_cycles)
      .where(eq(billing_cycles.status, "open"))
      .orderBy(desc(billing_cycles.id))
      .limit(1);
    openCycleId = openCycles[0]?.id ?? null;
  } catch {}

  return {
    responsibles: result,
    system_total: globalSystemTotal,
    doctor_total: globalDoctorTotal,
    reports_count: globalReportsCount,
    pending_count: globalPendingCount,
    open_cycle_id: openCycleId,
    pending: enrichedPending,
  };
}
// ─── Billing Cycle Helpers (V3 Operacional) ──────────────────────────────────


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
      drizzleSql2`${billing_cycles.starts_at} <= ${refDateStr}`,
      drizzleSql2`${billing_cycles.ends_at} >= ${refDateStr}`,
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
      drizzleSql2`${billing_cycles.starts_at} = ${starts_at}`,
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
  });

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
  /** M2B: modalidade do exame para precificação por modalidade */
  modality_snapshot?: string | null;
}): Promise<{ event: typeof billing_visit_events.$inferSelect; created: boolean; doctor_amount_due: string | null }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Chave de deduplicação: um evento por laudo
  const reportKey = `report_${data.report_id}`;
  const normalizedName = (data.patient_name ?? "UNKNOWN")
    .replace(/\^/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  const studyDate = data.study_date ?? data.signed_at.toISOString().slice(0, 10);

  // Busca ciclos ativos de forma NÃO-BLOQUEANTE.
  // O evento financeiro DEVE ser criado mesmo quando não há ciclo configurado.
  // O ciclo é apenas filtro de visualização — não é pré-requisito do evento.
  let doctorCycleId: number | null = null;
  let systemCycleId: number | null = null;
  try {
    const doctorCycle = await getOrCreateActiveCycle(
      data.unit_id, "doctor", data.signed_at, data.financial_responsible_id
    );
    doctorCycleId = doctorCycle.id;
  } catch (cycleErr) {
    console.warn(`[billing] Ciclo médico não encontrado para unit=${data.unit_id}:`, cycleErr instanceof Error ? cycleErr.message : cycleErr);
  }
  try {
    const systemCycle = await getOrCreateActiveCycle(
      data.unit_id, "system", data.signed_at, data.financial_responsible_id
    );
    systemCycleId = systemCycle.id;
  } catch (cycleErr) {
    console.warn(`[billing] Ciclo sistema não encontrado para unit=${data.unit_id}:`, cycleErr instanceof Error ? cycleErr.message : cycleErr);
  }

  const responsible = data.financial_responsible_id
    ? data.financial_responsible_id
    : (await getActiveResponsibleForUnit(data.unit_id, data.signed_at))?.financial_responsible_id ?? null;

  const responsibleId = responsible ?? null;

  const systemPrice = responsibleId
    ? await getActiveSystemPrice(responsibleId, data.unit_id, data.signed_at)
    : null;
  const doctorPrice = responsibleId
    ? await getActiveDoctorPrice(responsibleId, data.unit_id, data.doctor_user_id, data.signed_at, data.modality_snapshot)
    : null;

  let systemAmt = systemPrice ? Math.round(Number(systemPrice.price_per_report ?? 0) * 100) / 100 : null;
  let doctorAmt = doctorPrice ? Math.round(Number(doctorPrice.price_per_report ?? 0) * 100) / 100 : null;

  // Fallback: usa default_system_price e default_doctor_price da unidade quando não há responsável financeiro
  if (systemAmt === null || doctorAmt === null) {
    const unitRow = await db.select({
      default_system_price: units.default_system_price,
      default_doctor_price: units.default_doctor_price,
    }).from(units).where(eq(units.id, data.unit_id)).limit(1);
    const unitDefaults = unitRow[0];
    if (systemAmt === null && unitDefaults?.default_system_price != null) {
      systemAmt = Math.round(Number(unitDefaults.default_system_price) * 100) / 100;
    }
    if (doctorAmt === null && unitDefaults?.default_doctor_price != null) {
      doctorAmt = Math.round(Number(unitDefaults.default_doctor_price) * 100) / 100;
    }
  }

  const pricingStatus =
    systemAmt !== null && doctorAmt !== null ? "ok" :
    systemAmt !== null ? "pending_doctor_price" :
    doctorAmt !== null ? "pending_system_price" : "pending_both";

  // P5 (v50): registrar audit_log se unidade com financial_enabled = false
  // Não bloqueia a criação do evento — apenas registra para diagnóstico
  try {
    const unitCheck = await db
      .select({ financial_enabled: units.financial_enabled })
      .from(units)
      .where(eq(units.id, data.unit_id))
      .limit(1);
    const financialActive = unitCheck[0]?.financial_enabled ?? false;
    if (!financialActive) {
      await createAuditLog({
        user_id: data.doctor_user_id,
        unit_id: data.unit_id,
        action: 'BILLING_EVENT_WITHOUT_FINANCIAL_ENABLED',
        target_type: 'REPORT',
        target_id: String(data.report_id),
      });
    }
  } catch (auditErr) {
    console.warn('[billing] audit_log BILLING_EVENT_WITHOUT_FINANCIAL_ENABLED falhou:', auditErr instanceof Error ? auditErr.message : auditErr);
  }

  const insertResult = await db.insert(billing_visit_events).values({
    report_id: data.report_id,
    study_instance_uid: data.study_instance_uid ?? null,
    unit_id: data.unit_id,
    doctor_user_id: data.doctor_user_id,
    financial_responsible_id: responsibleId,
    report_key: reportKey,
    patient_name: normalizedName,
    study_date: studyDate ? new Date(studyDate + 'T00:00:00Z') : null,
    doctor_cycle_id: doctorCycleId,
    system_cycle_id: systemCycleId,
    system_price_applied: systemAmt !== null ? String(systemAmt) : null,
    doctor_price_applied: doctorAmt !== null ? String(doctorAmt) : null,
    system_amount_due: systemAmt !== null ? String(systemAmt) : null,
    doctor_amount_due: doctorAmt !== null ? String(doctorAmt) : null,
    pricing_status: pricingStatus,
    signed_at: data.signed_at,
    modality_snapshot: data.modality_snapshot ?? null,
  }).onDuplicateKeyUpdate({ set: { report_key: reportKey } });

  const insertId = Number(insertResult[0].insertId);

  if (insertId === 0) {
    const existing = await db.select().from(billing_visit_events)
      .where(eq(billing_visit_events.report_key, reportKey)).limit(1);
    return { event: existing[0], created: false, doctor_amount_due: existing[0].doctor_amount_due };
  }

  // P7: updateCycleSummaries removida — billing_cycle_*_summary são tabelas mortas (sem leitura ativa)

  const newEvent = await db.select().from(billing_visit_events)
    .where(eq(billing_visit_events.id, insertId)).limit(1);
  return { event: newEvent[0], created: true, doctor_amount_due: doctorAmt !== null ? String(doctorAmt) : null };
}

// P9 (v50): updateCycleSummaries removida — dead code (não era chamada após v49)

/**
 * Remove o billing_visit_event de um laudo e decrementa os consolidados de ciclo.
 * Chamado ao excluir um laudo assinado.
 */
export async function removeVisitEventForReport(reportId: number) {
  const db = await getDb();
  if (!db) return;

  // Buscar o evento existente para este laudo
  const events = await db.select().from(billing_visit_events)
    .where(eq(billing_visit_events.report_id, reportId))
    .limit(1);

  if (events.length === 0) return; // Laudo não tinha evento financeiro (ex: não estava assinado)

  const evt = events[0];
  const doctorAmt = parseFloat(evt.doctor_amount_due ?? "0");
  const systemAmt = parseFloat(evt.system_amount_due ?? "0");
  const doctorAmtStr = String(doctorAmt);
  const systemAmtStr = String(systemAmt);
  const isPendingDoctor = evt.doctor_amount_due === null ? 1 : 0;
  const isPendingSystem = evt.system_amount_due === null ? 1 : 0;

  // Decrementar billing_cycle_doctor_summary
  if (evt.doctor_cycle_id) {
    await db.update(billing_cycle_doctor_summary).set({
      reports_count: drizzleSql2`GREATEST(0, reports_count - 1)`,
      amount_due: drizzleSql2`GREATEST(0, amount_due - ${doctorAmtStr})`,
      pending_pricing_count: drizzleSql2`GREATEST(0, pending_pricing_count - ${isPendingDoctor})`,
    }).where(
      and(
        eq(billing_cycle_doctor_summary.doctor_cycle_id, evt.doctor_cycle_id),
        eq(billing_cycle_doctor_summary.unit_id, evt.unit_id),
        eq(billing_cycle_doctor_summary.doctor_user_id, evt.doctor_user_id),
      )
    );

    // Decrementar billing_cycles (doctor)
    await db.update(billing_cycles).set({
      total_reports: drizzleSql2`GREATEST(0, total_reports - 1)`,
      total_amount: drizzleSql2`GREATEST(0, total_amount - ${doctorAmtStr})`,
    }).where(eq(billing_cycles.id, evt.doctor_cycle_id));
  }

  // Decrementar billing_cycle_system_summary
  if (evt.system_cycle_id) {
    await db.update(billing_cycle_system_summary).set({
      reports_count: drizzleSql2`GREATEST(0, reports_count - 1)`,
      amount_due: drizzleSql2`GREATEST(0, amount_due - ${systemAmtStr})`,
      pending_pricing_count: drizzleSql2`GREATEST(0, pending_pricing_count - ${isPendingSystem})`,
    }).where(
      and(
        eq(billing_cycle_system_summary.system_cycle_id, evt.system_cycle_id),
        eq(billing_cycle_system_summary.unit_id, evt.unit_id),
      )
    );

    // Decrementar billing_cycles (system)
    await db.update(billing_cycles).set({
      total_reports: drizzleSql2`GREATEST(0, total_reports - 1)`,
      total_amount: drizzleSql2`GREATEST(0, total_amount - ${systemAmtStr})`,
    }).where(eq(billing_cycles.id, evt.system_cycle_id));
  }

  // Remover o evento financeiro
  await db.delete(billing_visit_events).where(eq(billing_visit_events.report_id, reportId));
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
    price_per_report: billing_doctor_unit_prices.price_per_report,
  }).from(billing_cycle_doctor_summary)
    .innerJoin(billing_cycles, eq(billing_cycle_doctor_summary.doctor_cycle_id, billing_cycles.id))
    .innerJoin(units, eq(billing_cycle_doctor_summary.unit_id, units.id))
    .leftJoin(
      billing_doctor_unit_prices,
      and(
        eq(billing_doctor_unit_prices.doctor_user_id, doctorUserId),
        eq(billing_doctor_unit_prices.unit_id, billing_cycle_doctor_summary.unit_id),
        isNullFn(billing_doctor_unit_prices.ends_at),
      )
    )
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
  const rows = await db.select().from(billing_visit_events).where(
    and(
      eq(billing_visit_events.doctor_user_id, doctorUserId),
      eq(billing_visit_events.doctor_cycle_id, doctorCycleId),
    )
  ).orderBy(desc(billing_visit_events.createdAt));
  // Map doctor_amount_due → amount for frontend compatibility
  return rows.map(r => ({
    ...r,
    amount: r.doctor_amount_due != null ? r.doctor_amount_due.toString() : null,
  }));
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

  try {
    const now = new Date();
    const refDateStr = now.toISOString().slice(0, 10);

    // PASSO 3: Buscar preço vigente INDEPENDENTEMENTE de ciclo aberto
    // O preço deve aparecer mesmo que não haja produção no período
    let price_per_report: string | null = null;
    try {
      const responsible = await getActiveResponsibleForUnit(unitId, now);
      if (responsible) {
        // Usar financial_responsible_id (ID do responsável), não id (ID da linha na tabela)
        const doctorPrice = await getActiveDoctorPrice(responsible.financial_responsible_id, unitId, doctorUserId, now);
        price_per_report = doctorPrice?.price_per_report ?? null;
      }
    } catch (priceErr) {
      console.error('[getDoctorUnitFinancialInfo] Erro ao buscar preço:', priceErr);
    }

    // Ciclo ativo do médico nessa unidade (opcional — saldo zero se não houver ciclo)
    let cycle_visits = 0;
    let cycle_amount = "0.00";
    let cycle_period: { starts_at: Date; ends_at: Date } | null = null;
    let has_open_cycle = false;

    try {
      const activeCycle = await db.select({
        id: billing_cycles.id,
        unit_id: billing_cycles.unit_id,
        cycle_type: billing_cycles.cycle_type,
        status: billing_cycles.status,
        starts_at: billing_cycles.starts_at,
        ends_at: billing_cycles.ends_at,
      }).from(billing_cycles).where(
        and(
          eq(billing_cycles.unit_id, unitId),
          eq(billing_cycles.cycle_type, "doctor"),
          eq(billing_cycles.status, "open"),
          drizzleSql2`${billing_cycles.starts_at} <= ${refDateStr}`,
          drizzleSql2`${billing_cycles.ends_at} >= ${refDateStr}`,
        )
      ).limit(1);

      if (activeCycle.length > 0) {
        has_open_cycle = true;
        const cycle = activeCycle[0];
        cycle_period = { starts_at: cycle.starts_at, ends_at: cycle.ends_at };

        // BUG FIX: billing_cycle_doctor_summary é uma tabela desnormalizada que não é
        // atualizada automaticamente após novos laudos. Calculamos diretamente dos
        // billing_visit_events dentro do intervalo do ciclo aberto.
        const liveRows = await db.select({
          total_laudos: drizzleSql2<number>`COUNT(*)`,
          total_amount: drizzleSql2<number>`COALESCE(SUM(${billing_visit_events.doctor_amount_due}), 0)`,
        }).from(billing_visit_events).where(
          and(
            eq(billing_visit_events.doctor_cycle_id, cycle.id),
            eq(billing_visit_events.unit_id, unitId),
            eq(billing_visit_events.doctor_user_id, doctorUserId),
            ne(billing_visit_events.financial_status, 'cancelled'),
          )
        );

        cycle_visits = Number(liveRows[0]?.total_laudos ?? 0);
        cycle_amount = Number(liveRows[0]?.total_amount ?? 0).toFixed(2);
      }
    } catch (cycleErr) {
      console.error('[getDoctorUnitFinancialInfo] Erro ao buscar ciclo:', cycleErr);
    }

    return {
      price_per_report,
      cycle_visits,
      cycle_amount,
      cycle_period,
      has_open_cycle,
    };
  } catch (err) {
    console.error('[getDoctorUnitFinancialInfo] Erro geral:', err);
    return null;
  }
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

// ─── Auditoria e Reset de Médico (admin_master) ───────────────────────────────

/**
 * Retorna todos os eventos de billing de um médico para auditoria completa.
 * Inclui nome do paciente, unidade, data, valores e status.
 */
export async function getDoctorAuditReport(doctorUserId: number, filters?: {
  unit_id?: number;
  from_date?: Date;
  to_date?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: SQL[] = [eq(billing_visit_events.doctor_user_id, doctorUserId)];
  if (filters?.unit_id) conditions.push(eq(billing_visit_events.unit_id, filters.unit_id));
  if (filters?.from_date) conditions.push(_gte(billing_visit_events.createdAt, filters.from_date));
  if (filters?.to_date) conditions.push(_lte(billing_visit_events.createdAt, filters.to_date));
  const rows = await db.select({
    event: billing_visit_events,
    unit_name: units.name,
    doctor_name: users.name,
  }).from(billing_visit_events)
    .leftJoin(units, eq(billing_visit_events.unit_id, units.id))
    .leftJoin(users, eq(billing_visit_events.doctor_user_id, users.id))
    .where(and(...conditions))
    .orderBy(_desc(billing_visit_events.createdAt));
  return rows.map(r => ({
    ...r.event,
    unit_name: r.unit_name,
    doctor_name: r.doctor_name,
  }));
}

/**
 * Zera todos os dados financeiros de um médico:
 * - billing_visit_events (eventos por laudo)
 * - billing_cycle_doctor_summary (totalizadores por ciclo)
 * - billing_report_items (itens de apuração)
 * Retorna contagem de registros deletados.
 */
export async function resetDoctorBilling(doctorUserId: number): Promise<{
  events_deleted: number;
  summaries_deleted: number;
  report_items_deleted: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Coletar ciclos afetados ANTES de deletar (para recalcular depois)
  const affectedDoctorCycleIds = await db
    .select({ id: billing_visit_events.doctor_cycle_id })
    .from(billing_visit_events)
    .where(eq(billing_visit_events.doctor_user_id, doctorUserId))
    .then(rows => Array.from(new Set(rows.map(r => r.id).filter((id): id is number => id !== null && id !== undefined))));
  const affectedSystemCycleIds = await db
    .select({ id: billing_visit_events.system_cycle_id })
    .from(billing_visit_events)
    .where(eq(billing_visit_events.doctor_user_id, doctorUserId))
    .then(rows => Array.from(new Set(rows.map(r => r.id).filter((id): id is number => id !== null && id !== undefined))));

  // Contar antes de deletar
  const [evtCount] = await db.select({ c: drizzleCount() }).from(billing_visit_events).where(eq(billing_visit_events.doctor_user_id, doctorUserId));
  const [sumCount] = await db.select({ c: drizzleCount() }).from(billing_cycle_doctor_summary).where(eq(billing_cycle_doctor_summary.doctor_user_id, doctorUserId));
  const [itemCount] = await db.select({ c: drizzleCount() }).from(billing_report_items).where(eq(billing_report_items.doctor_user_id, doctorUserId));

  // Deletar registros do médico
  await db.delete(billing_visit_events).where(eq(billing_visit_events.doctor_user_id, doctorUserId));
  await db.delete(billing_cycle_doctor_summary).where(eq(billing_cycle_doctor_summary.doctor_user_id, doctorUserId));
  await db.delete(billing_report_items).where(eq(billing_report_items.doctor_user_id, doctorUserId));

  // B6/B7/E10: Recalcular billing_cycles para ciclos afetados
  // Para ciclos de médico: recalcular total_reports e total_amount a partir do que sobrou
  if (affectedDoctorCycleIds.length > 0) {
      for (const cycleId of affectedDoctorCycleIds) {
      const [agg] = await db
        .select({
          total_reports: drizzleSql2<number>`COUNT(*)`,
          total_amount: drizzleSql2<string>`COALESCE(SUM(doctor_amount_due), 0)`,
        })
        .from(billing_cycle_doctor_summary)
        .where(eq(billing_cycle_doctor_summary.doctor_cycle_id, cycleId));
      await db.update(billing_cycles).set({
        total_reports: agg?.total_reports ?? 0,
        total_amount: String(agg?.total_amount ?? '0.00'),
      }).where(eq(billing_cycles.id, cycleId));
    }
  }

  // Para ciclos de sistema: recalcular a partir do billing_cycle_system_summary restante
  if (affectedSystemCycleIds.length > 0) {
    for (const cycleId of affectedSystemCycleIds) {
      const [agg] = await db
        .select({
          total_reports: drizzleSql2<number>`COUNT(*)`,
          total_amount: drizzleSql2<string>`COALESCE(SUM(amount_due), 0)`,
        })
        .from(billing_cycle_system_summary)
        .where(eq(billing_cycle_system_summary.system_cycle_id, cycleId));
      await db.update(billing_cycles).set({
        total_reports: agg?.total_reports ?? 0,
        total_amount: String(agg?.total_amount ?? '0.00'),
      }).where(eq(billing_cycles.id, cycleId));
    }
  }

  return {
    events_deleted: Number(evtCount?.c ?? 0),
    summaries_deleted: Number(sumCount?.c ?? 0),
    report_items_deleted: Number(itemCount?.c ?? 0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS DE CONTEXTO COMPLETO — alimentam as telas práticas do financeiro
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * getDoctorFullContext — retorna tudo que o admin precisa para o cadastro do médico:
 * dados do médico, unidades vinculadas, preços vigentes por unidade (com responsável),
 * histórico de preços e saldo operacional do ciclo corrente.
 */
export async function getDoctorFullContext(doctorUserId: number) {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();

  const [doctor] = await db.select().from(users).where(eq(users.id, doctorUserId)).limit(1);
  if (!doctor) return null;

  const unitLinks = await db
    .select({ unit_id: user_unit_permissions.unit_id, unit_name: units.name })
    .from(user_unit_permissions)
    .leftJoin(units, eq(units.id, user_unit_permissions.unit_id))
    .where(eq(user_unit_permissions.user_id, doctorUserId));

  const activePrices = await db
    .select({
      id: billing_doctor_unit_prices.id,
      unit_id: billing_doctor_unit_prices.unit_id,
      unit_name: units.name,
      price_per_report: billing_doctor_unit_prices.price_per_report,
      starts_at: billing_doctor_unit_prices.starts_at,
      ends_at: billing_doctor_unit_prices.ends_at,
      financial_responsible_id: billing_doctor_unit_prices.financial_responsible_id,
    })
    .from(billing_doctor_unit_prices)
    .leftJoin(units, eq(units.id, billing_doctor_unit_prices.unit_id))
    .where(and(
      eq(billing_doctor_unit_prices.doctor_user_id, doctorUserId),
      isNull(billing_doctor_unit_prices.ends_at),
    ));

  const priceHistory = await db
    .select({
      id: billing_doctor_unit_prices.id,
      unit_id: billing_doctor_unit_prices.unit_id,
      unit_name: units.name,
      price_per_report: billing_doctor_unit_prices.price_per_report,
      starts_at: billing_doctor_unit_prices.starts_at,
      ends_at: billing_doctor_unit_prices.ends_at,
    })
    .from(billing_doctor_unit_prices)
    .leftJoin(units, eq(units.id, billing_doctor_unit_prices.unit_id))
    .where(eq(billing_doctor_unit_prices.doctor_user_id, doctorUserId))
    .orderBy(desc(billing_doctor_unit_prices.starts_at))
    .limit(20);

  const unitResponsibles: Record<number, { id: number; name: string } | null> = {};
  for (const ul of unitLinks) {
    if (!ul.unit_id) continue;
    const rows = await db
      .select({ id: financial_responsibles.id, legal_name: financial_responsibles.legal_name })
      .from(financial_responsible_units)
      .leftJoin(financial_responsibles, eq(financial_responsibles.id, financial_responsible_units.financial_responsible_id))
      .where(and(
        eq(financial_responsible_units.unit_id, ul.unit_id),
        lte(financial_responsible_units.starts_at, now),
        _or(isNull(financial_responsible_units.ends_at), gte(financial_responsible_units.ends_at, now))
      ))
      .orderBy(desc(financial_responsible_units.starts_at))
      .limit(1);
    unitResponsibles[ul.unit_id] = rows[0] ? { id: rows[0].id!, name: rows[0].legal_name ?? '' } : null;
  }

  const openCycles = await db
    .select({
      summary: billing_cycle_doctor_summary,
      cycle: billing_cycles,
      unit_name: units.name,
    })
    .from(billing_cycle_doctor_summary)
    .innerJoin(billing_cycles, eq(billing_cycle_doctor_summary.doctor_cycle_id, billing_cycles.id))
    .innerJoin(units, eq(billing_cycle_doctor_summary.unit_id, units.id))
    .where(and(
      eq(billing_cycle_doctor_summary.doctor_user_id, doctorUserId),
      eq(billing_cycles.status, 'open'),
    ));

  const totalBalance = openCycles.reduce((s, r) => s + parseFloat(r.summary.amount_due ?? '0'), 0);

  return {
    doctor,
    unitLinks,
    activePrices,
    priceHistory,
    unitResponsibles,
    openCycles: openCycles.map(r => ({
      unit_id: r.summary.unit_id,
      unit_name: r.unit_name,
      reports_count: r.summary.reports_count,
      amount_due: r.summary.amount_due,
      cycle_starts_at: r.cycle.starts_at,
      cycle_ends_at: r.cycle.ends_at,
    })),
    totalBalance: totalBalance.toFixed(2),
  };
}

/**
 * getUnitFullContext — retorna tudo que o admin precisa para o cadastro da unidade:
 * dados da unidade, responsável financeiro ativo (com histórico), custo do sistema vigente,
 * médicos com preços vigentes e resumo financeiro do ciclo corrente.
 */
export async function getUnitFullContext(unitId: number) {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();

  const [unit] = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  if (!unit) return null;

  const activeRespRows = await db
    .select({
      link_id: financial_responsible_units.id,
      financial_responsible_id: financial_responsible_units.financial_responsible_id,
      starts_at: financial_responsible_units.starts_at,
      ends_at: financial_responsible_units.ends_at,
      legal_name: financial_responsibles.legal_name,
      trade_name: financial_responsibles.trade_name,
      person_type: financial_responsibles.person_type,
      email: financial_responsibles.email,
      phone: financial_responsibles.phone,
      cpf_cnpj: financial_responsibles.cpf_cnpj,
      isActive: financial_responsibles.isActive,
    })
    .from(financial_responsible_units)
    .leftJoin(financial_responsibles, eq(financial_responsibles.id, financial_responsible_units.financial_responsible_id))
    .where(and(
      eq(financial_responsible_units.unit_id, unitId),
      lte(financial_responsible_units.starts_at, now),
      _or(isNull(financial_responsible_units.ends_at), gte(financial_responsible_units.ends_at, now))
    ))
    .orderBy(desc(financial_responsible_units.starts_at))
    .limit(1);
  const activeResponsible = activeRespRows[0] ?? null;

  const responsibleHistory = await db
    .select({
      link_id: financial_responsible_units.id,
      financial_responsible_id: financial_responsible_units.financial_responsible_id,
      starts_at: financial_responsible_units.starts_at,
      ends_at: financial_responsible_units.ends_at,
      legal_name: financial_responsibles.legal_name,
    })
    .from(financial_responsible_units)
    .leftJoin(financial_responsibles, eq(financial_responsibles.id, financial_responsible_units.financial_responsible_id))
    .where(eq(financial_responsible_units.unit_id, unitId))
    .orderBy(desc(financial_responsible_units.starts_at))
    .limit(5);

  const activeSystemPriceRows = await db
    .select()
    .from(billing_system_unit_prices)
    .where(and(
      eq(billing_system_unit_prices.unit_id, unitId),
      isNull(billing_system_unit_prices.ends_at),
    ))
    .orderBy(desc(billing_system_unit_prices.starts_at))
    .limit(1);
  const activeSystemPrice = activeSystemPriceRows[0] ?? null;

  const systemPriceHistory = await db
    .select()
    .from(billing_system_unit_prices)
    .where(eq(billing_system_unit_prices.unit_id, unitId))
    .orderBy(desc(billing_system_unit_prices.starts_at))
    .limit(5);

  const doctorPrices = await db
    .select({
      id: billing_doctor_unit_prices.id,
      doctor_user_id: billing_doctor_unit_prices.doctor_user_id,
      doctor_name: users.name,
      price_per_report: billing_doctor_unit_prices.price_per_report,
      starts_at: billing_doctor_unit_prices.starts_at,
      ends_at: billing_doctor_unit_prices.ends_at,
      financial_responsible_id: billing_doctor_unit_prices.financial_responsible_id,
    })
    .from(billing_doctor_unit_prices)
    .leftJoin(users, eq(users.id, billing_doctor_unit_prices.doctor_user_id))
    .where(and(
      eq(billing_doctor_unit_prices.unit_id, unitId),
      isNull(billing_doctor_unit_prices.ends_at),
    ))
    .orderBy(users.name);

  const openDoctorSummaries = await db
    .select({ summary: billing_cycle_doctor_summary, doctor_name: users.name })
    .from(billing_cycle_doctor_summary)
    .leftJoin(users, eq(users.id, billing_cycle_doctor_summary.doctor_user_id))
    .leftJoin(billing_cycles, eq(billing_cycles.id, billing_cycle_doctor_summary.doctor_cycle_id))
    .where(and(
      eq(billing_cycle_doctor_summary.unit_id, unitId),
      eq(billing_cycles.status, 'open'),
    ));

  const openSystemSummaries = await db
    .select({ summary: billing_cycle_system_summary })
    .from(billing_cycle_system_summary)
    .leftJoin(billing_cycles, eq(billing_cycles.id, billing_cycle_system_summary.system_cycle_id))
    .where(and(
      eq(billing_cycle_system_summary.unit_id, unitId),
      eq(billing_cycles.status, 'open'),
    ));

  const totalReports = openDoctorSummaries.reduce((s, r) => s + (r.summary.reports_count ?? 0), 0);
  const totalDoctorAmount = openDoctorSummaries.reduce((s, r) => s + parseFloat(r.summary.amount_due ?? '0'), 0);
  const totalSystemAmount = openSystemSummaries.reduce((s, r) => s + parseFloat(r.summary.amount_due ?? '0'), 0);

  return {
    unit,
    activeResponsible,
    responsibleHistory,
    activeSystemPrice,
    systemPriceHistory,
    doctorPrices,
    financialSummary: {
      totalReports,
      totalDoctorAmount: totalDoctorAmount.toFixed(2),
      totalSystemAmount: totalSystemAmount.toFixed(2),
      totalGeral: (totalDoctorAmount + totalSystemAmount).toFixed(2),
      openDoctorSummaries: openDoctorSummaries.map(r => ({
        ...r.summary,
        doctor_name: r.doctor_name,
      })),
    },
  };
}

/**
 * getResponsibleFullDashboard — retorna tudo para o painel do responsável financeiro:
 * cards de dívida, por unidade, por médico, extrato paginado e fechamentos.
 */
export async function getResponsibleFullDashboard(
  financialResponsibleId: number,
  options?: { page?: number; pageSize?: number; from?: string; to?: string }
) {
  const db = await getDb();
  if (!db) return null;
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const [responsible] = await db
    .select()
    .from(financial_responsibles)
    .where(eq(financial_responsibles.id, financialResponsibleId))
    .limit(1);
  if (!responsible) return null;

  const openSystemCycles = await db
    .select({ summary: billing_cycle_system_summary, cycle: billing_cycles, unit_name: units.name })
    .from(billing_cycle_system_summary)
    .innerJoin(billing_cycles, eq(billing_cycle_system_summary.system_cycle_id, billing_cycles.id))
    .innerJoin(units, eq(billing_cycle_system_summary.unit_id, units.id))
    .where(and(
      eq(billing_cycle_system_summary.financial_responsible_id, financialResponsibleId),
      eq(billing_cycles.status, 'open'),
    ));

  const openDoctorCycles = await db
    .select({ summary: billing_cycle_doctor_summary, cycle: billing_cycles, unit_name: units.name, doctor_name: users.name })
    .from(billing_cycle_doctor_summary)
    .innerJoin(billing_cycles, eq(billing_cycle_doctor_summary.doctor_cycle_id, billing_cycles.id))
    .innerJoin(units, eq(billing_cycle_doctor_summary.unit_id, units.id))
    .innerJoin(users, eq(billing_cycle_doctor_summary.doctor_user_id, users.id))
    .where(and(
      eq(billing_cycle_doctor_summary.financial_responsible_id, financialResponsibleId),
      eq(billing_cycles.status, 'open'),
    ));

  const totalSystem = openSystemCycles.reduce((s, r) => s + parseFloat(r.summary.amount_due ?? '0'), 0);
  const totalDoctors = openDoctorCycles.reduce((s, r) => s + parseFloat(r.summary.amount_due ?? '0'), 0);

  const byUnitMap = new Map<number, { unit_id: number; unit_name: string; reports_count: number; system_amount: number; doctor_amount: number }>();
  for (const r of openSystemCycles) {
    const uid = r.summary.unit_id;
    const ex = byUnitMap.get(uid) ?? { unit_id: uid, unit_name: r.unit_name ?? '', reports_count: 0, system_amount: 0, doctor_amount: 0 };
    ex.reports_count += r.summary.reports_count ?? 0;
    ex.system_amount += parseFloat(r.summary.amount_due ?? '0');
    byUnitMap.set(uid, ex);
  }
  for (const r of openDoctorCycles) {
    const uid = r.summary.unit_id;
    const ex = byUnitMap.get(uid) ?? { unit_id: uid, unit_name: r.unit_name ?? '', reports_count: 0, system_amount: 0, doctor_amount: 0 };
    ex.reports_count += r.summary.reports_count ?? 0;
    ex.doctor_amount += parseFloat(r.summary.amount_due ?? '0');
    byUnitMap.set(uid, ex);
  }
  const byUnit = Array.from(byUnitMap.values()).map(r => ({
    ...r,
    system_amount: r.system_amount.toFixed(2),
    doctor_amount: r.doctor_amount.toFixed(2),
    total: (r.system_amount + r.doctor_amount).toFixed(2),
  }));

  const byDoctorMap = new Map<number, { doctor_user_id: number; doctor_name: string; reports_count: number; amount_due: number; units: Set<string> }>();
  for (const r of openDoctorCycles) {
    const did = r.summary.doctor_user_id;
    const ex = byDoctorMap.get(did) ?? { doctor_user_id: did, doctor_name: r.doctor_name ?? '', reports_count: 0, amount_due: 0, units: new Set<string>() };
    ex.reports_count += r.summary.reports_count ?? 0;
    ex.amount_due += parseFloat(r.summary.amount_due ?? '0');
    ex.units.add(r.unit_name ?? '');
    byDoctorMap.set(did, ex);
  }
  const byDoctor = Array.from(byDoctorMap.values()).map(r => ({
    doctor_user_id: r.doctor_user_id,
    doctor_name: r.doctor_name,
    reports_count: r.reports_count,
    amount_due: r.amount_due.toFixed(2),
    units: Array.from(r.units),
  }));

  const evtFilters: SQL[] = [eq(billing_visit_events.financial_responsible_id, financialResponsibleId)];
  if (options?.from) evtFilters.push(gte(billing_visit_events.createdAt, new Date(options.from)));
  if (options?.to) evtFilters.push(lte(billing_visit_events.createdAt, new Date(options.to)));

  const extractRows = await db
    .select({ evt: billing_visit_events, unit_name: units.name, doctor_name: users.name })
    .from(billing_visit_events)
    .leftJoin(units, eq(units.id, billing_visit_events.unit_id))
    .leftJoin(users, eq(users.id, billing_visit_events.doctor_user_id))
    .where(and(...evtFilters))
    .orderBy(desc(billing_visit_events.createdAt))
    .limit(pageSize)
    .offset(offset);

  const closedCycles = await db
    .select({ cycle: billing_cycles, unit_name: units.name })
    .from(billing_cycles)
    .innerJoin(units, eq(units.id, billing_cycles.unit_id))
    .where(and(
      eq(billing_cycles.financial_responsible_id, financialResponsibleId),
      eq(billing_cycles.status, 'closed'),
    ))
    .orderBy(desc(billing_cycles.ends_at))
    .limit(24);

  return {
    responsible,
    cards: {
      totalSystem: totalSystem.toFixed(2),
      totalDoctors: totalDoctors.toFixed(2),
      totalGeral: (totalSystem + totalDoctors).toFixed(2),
    },
    byUnit,
    byDoctor,
    extract: extractRows.map(r => ({
      id: r.evt.id,
      createdAt: r.evt.createdAt,
      patient_name: r.evt.patient_name,
      study_date: r.evt.study_date,
      unit_name: r.unit_name,
      doctor_name: r.doctor_name,
      system_price_applied: r.evt.system_price_applied,
      doctor_price_applied: r.evt.doctor_price_applied,
      system_amount_due: r.evt.system_amount_due,
      doctor_amount_due: r.evt.doctor_amount_due,
      pricing_status: r.evt.pricing_status,
      doctor_received_at: r.evt.doctor_received_at,
      system_paid_at: r.evt.system_paid_at,
    })),
    closedCycles: closedCycles.map(r => ({
      id: r.cycle.id,
      unit_name: r.unit_name,
      cycle_type: r.cycle.cycle_type,
      starts_at: r.cycle.starts_at,
      ends_at: r.cycle.ends_at,
      total_reports: r.cycle.total_reports,
      total_amount: r.cycle.total_amount,
      closedAt: r.cycle.closedAt,
    })),
  };
}

/**
 * getDoctorOperationalBalance — saldo operacional total do médico no ciclo corrente.
 */
export async function getDoctorOperationalBalance(doctorUserId: number) {
  const db = await getDb();
  if (!db) return { totalBalance: '0.00', byUnit: [] };

  const rows = await db
    .select({
      summary: billing_cycle_doctor_summary,
      cycle: billing_cycles,
      unit_name: units.name,
    })
    .from(billing_cycle_doctor_summary)
    .innerJoin(billing_cycles, eq(billing_cycle_doctor_summary.doctor_cycle_id, billing_cycles.id))
    .innerJoin(units, eq(billing_cycle_doctor_summary.unit_id, units.id))
    .where(and(
      eq(billing_cycle_doctor_summary.doctor_user_id, doctorUserId),
      eq(billing_cycles.status, 'open'),
    ));

  const total = rows.reduce((s, r) => s + parseFloat(r.summary.amount_due ?? '0'), 0);

  return {
    totalBalance: total.toFixed(2),
    byUnit: rows.map(r => ({
      unit_id: r.summary.unit_id,
      unit_name: r.unit_name,
      reports_count: r.summary.reports_count,
      amount_due: r.summary.amount_due,
      cycle_starts_at: r.cycle.starts_at,
      cycle_ends_at: r.cycle.ends_at,
    })),
  };
}

/**
 * getSystemOwnerLiveByUnit — visão operacional do dono do sistema por unidade.
 * Retorna, para cada unidade ativa, o ciclo aberto do sistema com:
 * - receita do sistema, custo médico, margem, laudos, preço configurado
 * - responsável financeiro ativo
 * - alertas de configuração ausente
 */
export async function getSystemOwnerLiveByUnit(): Promise<Array<{
  unit_id: number;
  unit_name: string;
  responsible_name: string | null;
  responsible_id: number | null;
  active_cycle_id: number | null;
  cycle_start: Date | null;
  cycle_end: Date | null;
  reports_count: number;
  system_price_per_report: string | null;
  system_amount: string;
  doctor_amount: string;
  net_amount: string;
  has_missing_config: boolean;
  missing_config_details: string[];
}>> {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();

  // C2: 4 queries fixas em vez de 4 queries por unidade (elimina N+1)
  const allUnits = await db.select().from(units).where(eq(units.isActive, true));
  if (allUnits.length === 0) return [];
  const unitIds = allUnits.map(u => u.id);

  // Q1: Responsáveis ativos por unidade
  const allRespRows = await db
    .select({
      unit_id: financial_responsible_units.unit_id,
      id: financial_responsible_units.financial_responsible_id,
      legal_name: financial_responsibles.legal_name,
      trade_name: financial_responsibles.trade_name,
    })
    .from(financial_responsible_units)
    .leftJoin(financial_responsibles, eq(financial_responsibles.id, financial_responsible_units.financial_responsible_id))
    .where(and(
      _inArray(financial_responsible_units.unit_id, unitIds),
      lte(financial_responsible_units.starts_at, now),
      _or(isNull(financial_responsible_units.ends_at), gte(financial_responsible_units.ends_at, now))
    ))
    .orderBy(desc(financial_responsible_units.starts_at));
  const respByUnit = new Map<number, typeof allRespRows[0]>();
  for (const r of allRespRows) { if (!respByUnit.has(r.unit_id)) respByUnit.set(r.unit_id, r); }

  // Q2: Preços do sistema ativos por unidade
  const allSysPriceRows = await db
    .select({ unit_id: billing_system_unit_prices.unit_id, price_per_report: billing_system_unit_prices.price_per_report })
    .from(billing_system_unit_prices)
    .where(and(_inArray(billing_system_unit_prices.unit_id, unitIds), isNull(billing_system_unit_prices.ends_at)))
    .orderBy(desc(billing_system_unit_prices.starts_at));
  const sysPriceByUnit = new Map<number, string>();
  for (const r of allSysPriceRows) { if (!sysPriceByUnit.has(r.unit_id)) sysPriceByUnit.set(r.unit_id, String(r.price_per_report)); }

  // Q3: Ciclos abertos do sistema por unidade
  const allOpenCycles = await db
    .select({ cycle: billing_cycles, summary: billing_cycle_system_summary })
    .from(billing_cycles)
    .leftJoin(billing_cycle_system_summary, and(
      eq(billing_cycle_system_summary.system_cycle_id, billing_cycles.id),
      _inArray(billing_cycle_system_summary.unit_id, unitIds),
    ))
    .where(and(
      _inArray(billing_cycles.unit_id, unitIds),
      eq(billing_cycles.cycle_type, 'system'),
      eq(billing_cycles.status, 'open'),
    ))
    .orderBy(desc(billing_cycles.id));
  const cycleByUnit = new Map<number, typeof allOpenCycles[0]>();
  for (const r of allOpenCycles) { if (!cycleByUnit.has(r.cycle.unit_id)) cycleByUnit.set(r.cycle.unit_id, r); }

  // Q4: Custo médico (ciclos abertos) por unidade
  const allDocSummaries = await db
    .select({ unit_id: billing_cycle_doctor_summary.unit_id, amount_due: billing_cycle_doctor_summary.amount_due, reports_count: billing_cycle_doctor_summary.reports_count })
    .from(billing_cycle_doctor_summary)
    .innerJoin(billing_cycles, eq(billing_cycle_doctor_summary.doctor_cycle_id, billing_cycles.id))
    .where(and(_inArray(billing_cycle_doctor_summary.unit_id, unitIds), eq(billing_cycles.status, 'open')));
  const docDataByUnit = new Map<number, { amount: number; reports: number }>();
  for (const r of allDocSummaries) {
    const prev = docDataByUnit.get(r.unit_id) ?? { amount: 0, reports: 0 };
    docDataByUnit.set(r.unit_id, { amount: prev.amount + parseFloat(r.amount_due ?? '0'), reports: prev.reports + (r.reports_count ?? 0) });
  }

  return allUnits.map(unit => {
    const resp = respByUnit.get(unit.id) ?? null;
    const sysPrice = sysPriceByUnit.get(unit.id) ?? null;
    const cycleRow = cycleByUnit.get(unit.id) ?? null;
    const docData = docDataByUnit.get(unit.id) ?? { amount: 0, reports: 0 };
    const missing: string[] = [];
    if (!resp) missing.push('Responsável financeiro');
    if (!sysPrice) missing.push('Preço do sistema');
    if (!cycleRow?.cycle) missing.push('Ciclo do sistema');
    const systemAmount = parseFloat(cycleRow?.summary?.amount_due ?? '0');
    const reportsCount = (cycleRow?.summary?.reports_count ?? 0) || docData.reports;
    const doctorAmount = docData.amount;
    return {
      unit_id: unit.id,
      unit_name: unit.name,
      responsible_name: resp ? (resp.trade_name ?? resp.legal_name) : null,
      responsible_id: resp?.id ?? null,
      active_cycle_id: cycleRow?.cycle?.id ?? null,
      cycle_start: cycleRow?.cycle?.starts_at ?? null,
      cycle_end: cycleRow?.cycle?.ends_at ?? null,
      reports_count: reportsCount,
      system_price_per_report: sysPrice,
      system_amount: systemAmount.toFixed(2),
      doctor_amount: doctorAmount.toFixed(2),
      net_amount: (systemAmount - doctorAmount).toFixed(2),
      has_missing_config: missing.length > 0,
      missing_config_details: missing,
    };
  });
}

// ─── Gestão Manual de Ciclos ─────────────────────────────────────────────────

/**
 * Cria um ciclo financeiro manualmente para uma unidade.
 */
export async function createCycleManual(params: {
  unit_id: number;
  financial_responsible_id: number | null;
  cycle_type: "doctor" | "system";
  starts_at: Date;
  ends_at: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // C4: verificar sobreposição de ciclos do mesmo tipo/unidade
  const overlapping = await db.select({ id: billing_cycles.id })
    .from(billing_cycles)
    .where(_and(
      _eq(billing_cycles.unit_id, params.unit_id),
      _eq(billing_cycles.cycle_type, params.cycle_type),
      _eq(billing_cycles.status, 'open'),
      _or(
        _and(_lte(billing_cycles.starts_at, params.ends_at), _gte(billing_cycles.ends_at, params.starts_at)),
      ),
    ))
    .limit(1);
  if (overlapping.length > 0) {
    throw new Error('Já existe um ciclo aberto neste período para esta unidade e tipo.');
  }
  const result = await db.insert(billing_cycles).values({
    unit_id: params.unit_id,
    financial_responsible_id: params.financial_responsible_id,
    cycle_type: params.cycle_type,
    starts_at: params.starts_at,
    ends_at: params.ends_at,
    status: "open",
    total_reports: 0,
    total_amount: "0.00",
    paid_status: "pending",
  });
  const cycleId = Number(result[0].insertId);
  const [cycle] = await db.select().from(billing_cycles).where(eq(billing_cycles.id, cycleId));
  return cycle;
}

/**
 * Edita as datas de início e fim de um ciclo existente (somente ciclos abertos).
 */
export async function editCycleDates(cycleId: number, starts_at: Date, ends_at: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [cycle] = await db.select().from(billing_cycles).where(eq(billing_cycles.id, cycleId));
  if (!cycle) throw new Error("Ciclo não encontrado");
  if (cycle.status !== "open") throw new Error("Só é possível editar ciclos com status 'aberto'");
  // C7: validar que starts_at < ends_at
  if (starts_at >= ends_at) throw new Error('A data de início deve ser anterior à data de término.');
  // C4: verificar sobreposição com outros ciclos do mesmo tipo/unidade (excluindo o próprio ciclo)
  const overlapping = await db.select({ id: billing_cycles.id })
    .from(billing_cycles)
    .where(_and(
      _eq(billing_cycles.unit_id, cycle.unit_id),
      _eq(billing_cycles.cycle_type, cycle.cycle_type),
      _ne(billing_cycles.id, cycleId),
      _or(
        _and(_lte(billing_cycles.starts_at, ends_at), _gte(billing_cycles.ends_at, starts_at)),
      ),
    ))
    .limit(1);
  if (overlapping.length > 0) {
    throw new Error(`Já existe um ciclo neste período para esta unidade e tipo (id: ${overlapping[0].id}).`);
  }
  await db.update(billing_cycles).set({ starts_at, ends_at }).where(eq(billing_cycles.id, cycleId));
  const [updated] = await db.select().from(billing_cycles).where(eq(billing_cycles.id, cycleId));
  return updated;
}

/**
 * Lista todos os ciclos abertos de todas as unidades (para o modal de fechar ciclo).
 */
export async function listAllOpenCycles() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    cycle: billing_cycles,
    unit_name: units.name,
    responsible_name: financial_responsibles.trade_name,
    responsible_legal: financial_responsibles.legal_name,
  })
    .from(billing_cycles)
    .leftJoin(units, eq(billing_cycles.unit_id, units.id))
    .leftJoin(financial_responsibles, eq(billing_cycles.financial_responsible_id, financial_responsibles.id))
    .where(eq(billing_cycles.status, "open"))
    .orderBy(desc(billing_cycles.starts_at));
  return rows.map(r => ({
    ...r.cycle,
    unit_name: r.unit_name ?? "",
    responsible_name: r.responsible_name ?? r.responsible_legal ?? "",
  }));
}


// ─── Máscaras / Laudos Prontos ────────────────────────────────────────────────

/**
 * Lista máscaras visíveis para um usuário em uma unidade:
 * - scope='personal' do próprio usuário
 * - scope='unit' de qualquer owner da mesma unidade
 */
export async function listReportMasks(unitId: number, userId: number): Promise<ReportMask[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(report_masks).where(
    and(
      eq(report_masks.unit_id, unitId),
      or(
        and(eq(report_masks.scope, "personal"), eq(report_masks.owner_user_id, userId)),
        eq(report_masks.scope, "unit")
      )
    )
  ).orderBy(report_masks.scope, report_masks.name);
}

/** Insere uma ou mais máscaras em lote (importação JSON). */
export async function createReportMasks(masks: InsertReportMask[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (masks.length === 0) return;
  await db.insert(report_masks).values(masks);
}

/** Remove uma máscara pelo id, verificando que pertence ao usuário (ou admin). */
export async function deleteReportMask(
  id: number,
  userId: number,
  isAdmin: boolean,
  unitId: number  // FIX: obrigatório — restringe admin à própria unidade
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Admin pode deletar qualquer máscara da PRÓPRIA unidade
  // Usuário comum só pode deletar suas próprias máscaras
  const condition = isAdmin
    ? and(
        eq(report_masks.id, id),
        eq(report_masks.unit_id, unitId)  // FIX: restrito à unidade do admin
      )
    : and(
        eq(report_masks.id, id),
        eq(report_masks.owner_user_id, userId)
      );

  const result = await db.delete(report_masks).where(condition);
  return (result[0] as { affectedRows: number }).affectedRows > 0;
}

// ─── Group Permission Configs ─────────────────────────────────────────────────

export async function getGroupPermissions(): Promise<GroupPermissionConfig[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(group_permission_configs).orderBy(group_permission_configs.group_key);
}

export async function upsertGroupPermission(
  groupKey: string,
  perms: {
    view_studies: boolean;
    edit_reports: boolean;
    view_anamnesis: boolean;
    edit_anamnesis: boolean;
    edit_exam_legend: boolean;
    print_reports: boolean;
    manage_templates: boolean;
    view_financial: boolean;
  },
  updatedBy: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(group_permission_configs)
    .values({ group_key: groupKey, ...perms, updated_by: updatedBy })
    .onDuplicateKeyUpdate({
      set: { ...perms, updated_by: updatedBy },
    });
}
