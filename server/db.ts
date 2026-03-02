import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { or } from "drizzle-orm";
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
  InsertAuditLog
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
  role: 'admin_master' | 'unit_admin' | 'medico' | 'viewer';
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
  
  const query = db.select().from(studies_cache).where(eq(studies_cache.unit_id, unitId));
  
  if (filters?.limit && filters?.offset) {
    return await query.limit(filters.limit).offset(filters.offset);
  } else if (filters?.limit) {
    return await query.limit(filters.limit);
  } else if (filters?.offset) {
    return await query.offset(filters.offset);
  }
  
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
  await db.insert(audit_log).values(log);
}
