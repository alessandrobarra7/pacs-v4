/**
 * sla.ts — Router de SLA de Laudo e Report Readiness
 *
 * Procedures:
 *  - unit.setReportSla   — configura SLA por unidade (admin_master, unit_admin)
 *  - unit.getReportSla   — retorna SLA vigente de uma unidade
 *  - readiness.getByStudy       — retorna readiness de um estudo
 *  - readiness.getBatchStatus   — retorna readiness de múltiplos estudos
 *  - readiness.invalidate       — invalida readiness (admin_master)
 */
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { unit_report_sla_configs, report_readiness } from "../../drizzle/schema";
import { eq, inArray, and } from "drizzle-orm";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Calcula due_at a partir do became_ready_at + SLA */
function calcDueAt(becameReadyAt: Date, slaValue: number, slaUnit: "hour" | "day"): Date {
  const ms = slaUnit === "hour"
    ? slaValue * 60 * 60 * 1000
    : slaValue * 24 * 60 * 60 * 1000;
  return new Date(becameReadyAt.getTime() + ms);
}

/** Retorna o SLA vigente de uma unidade (ou null se não configurado/desabilitado) */
export async function getUnitSla(unitId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(unit_report_sla_configs)
    .where(eq(unit_report_sla_configs.unit_id, unitId))
    .limit(1);
  const cfg = rows[0];
  if (!cfg || !cfg.enabled || !cfg.sla_value || !cfg.sla_unit) return null;
  return cfg;
}

/**
 * Cria ou atualiza o readiness de um estudo.
 * Regra: o timer só inicia na PRIMEIRA vez que o exame fica pronto.
 * Edições posteriores da anamnese NÃO reiniciam o timer.
 */
export async function evaluateAndUpsertReadiness(params: {
  studyInstanceUid: string;
  unitId: number;
  createdByUserId: number;
  manualText: string;
}): Promise<{ created: boolean; readiness: typeof report_readiness.$inferSelect | null }> {
  const db = await getDb();
  if (!db) return { created: false, readiness: null };

  const { studyInstanceUid, unitId, createdByUserId, manualText } = params;

  // Critério mínimo de validade: manual_text não vazio
  if (!manualText || manualText.trim().length === 0) {
    return { created: false, readiness: null };
  }

  // Verificar se já existe readiness para este estudo+unidade
  const existing = await db
    .select()
    .from(report_readiness)
    .where(and(
      eq(report_readiness.study_instance_uid, studyInstanceUid),
      eq(report_readiness.unit_id, unitId),
    ))
    .limit(1);

  if (existing.length > 0) {
    // Já existe: NÃO reiniciar o timer — apenas retornar o existente
    return { created: false, readiness: existing[0] };
  }

  // Primeiro start: buscar SLA vigente da unidade
  const sla = await getUnitSla(unitId);
  const becameReadyAt = new Date();
  const dueAt = sla ? calcDueAt(becameReadyAt, sla.sla_value!, sla.sla_unit!) : null;

  await db.insert(report_readiness).values({
    study_instance_uid: studyInstanceUid,
    unit_id: unitId,
    readiness_status: "ready_for_reporting",
    became_ready_at: becameReadyAt,
    sla_value_snapshot: sla?.sla_value ?? null,
    sla_unit_snapshot: sla?.sla_unit ?? null,
    due_at: dueAt,
    readiness_source: "anamnesis_simple",
    created_by: createdByUserId,
  });

  const created = await db
    .select()
    .from(report_readiness)
    .where(and(
      eq(report_readiness.study_instance_uid, studyInstanceUid),
      eq(report_readiness.unit_id, unitId),
    ))
    .limit(1);

  return { created: true, readiness: created[0] ?? null };
}

/**
 * Marca o readiness como 'reported' quando o laudo é assinado.
 * Calcula sla_met e delay_seconds.
 */
export async function closeReadinessOnReport(params: {
  studyInstanceUid: string;
  unitId: number;
  reportedByUserId: number;
  reportedAt: Date;
}) {
  const db = await getDb();
  if (!db) return;
  const { studyInstanceUid, unitId, reportedByUserId, reportedAt } = params;

  const rows = await db
    .select()
    .from(report_readiness)
    .where(and(
      eq(report_readiness.study_instance_uid, studyInstanceUid),
      eq(report_readiness.unit_id, unitId),
    ))
    .limit(1);

  if (!rows.length) return; // sem readiness — não há SLA para fechar

  const rr = rows[0];
  if (rr.readiness_status === "reported") return; // já fechado

  let slaMet: boolean | null = null;
  let delaySeconds: number | null = null;

  if (rr.due_at) {
    const dueMs = new Date(rr.due_at).getTime();
    const reportedMs = reportedAt.getTime();
    delaySeconds = Math.round((reportedMs - dueMs) / 1000);
    slaMet = delaySeconds <= 0;
  }

  await db
    .update(report_readiness)
    .set({
      readiness_status: "reported",
      reported_at: reportedAt,
      reported_by_user_id: reportedByUserId,
      sla_met: slaMet,
      delay_seconds: delaySeconds,
    })
    .where(eq(report_readiness.id, rr.id));
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const slaRouter = router({

  /** Retorna o SLA configurado para uma unidade */
  getUnitSla: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(unit_report_sla_configs)
        .where(eq(unit_report_sla_configs.unit_id, input.unitId))
        .limit(1);
      return rows[0] ?? null;
    }),

  /** Configura ou atualiza o SLA de uma unidade (admin_master ou unit_admin) */
  setUnitSla: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      enabled: z.boolean(),
      slaValue: z.number().int().min(1).max(999).optional(),
      slaUnit: z.enum(["hour", "day"]).optional(),
      notes: z.string().max(1000).optional(),
      effectiveFrom: z.string().optional(), // ISO string
    }))
    .mutation(async ({ input, ctx }) => {
      // Apenas admin_master e unit_admin podem configurar SLA
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "unit_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem configurar o SLA." });
      }
      // unit_admin só pode configurar sua própria unidade
      if (ctx.user.role === "unit_admin" && ctx.user.unit_id !== input.unitId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você só pode configurar o SLA da sua unidade." });
      }
      if (input.enabled && (!input.slaValue || !input.slaUnit)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o valor e a unidade do prazo." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const existing = await db
        .select({ id: unit_report_sla_configs.id })
        .from(unit_report_sla_configs)
        .where(eq(unit_report_sla_configs.unit_id, input.unitId))
        .limit(1);

      const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();

      if (existing.length > 0) {
        await db
          .update(unit_report_sla_configs)
          .set({
            enabled: input.enabled,
            sla_value: input.slaValue ?? null,
            sla_unit: input.slaUnit ?? null,
            effective_from: effectiveFrom,
            notes: input.notes ?? null,
          })
          .where(eq(unit_report_sla_configs.id, existing[0].id));
      } else {
        await db.insert(unit_report_sla_configs).values({
          unit_id: input.unitId,
          enabled: input.enabled,
          sla_value: input.slaValue ?? null,
          sla_unit: input.slaUnit ?? null,
          effective_from: effectiveFrom,
          notes: input.notes ?? null,
          created_by: ctx.user.id,
        });
      }
      return { success: true };
    }),

  /** Retorna o readiness de um estudo específico */
  getByStudy: protectedProcedure
    .input(z.object({ studyInstanceUid: z.string(), unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(report_readiness)
        .where(and(
          eq(report_readiness.study_instance_uid, input.studyInstanceUid),
          eq(report_readiness.unit_id, input.unitId),
        ))
        .limit(1);
      return rows[0] ?? null;
    }),

  /** Retorna readiness de múltiplos estudos (batch) */
  getBatchStatus: protectedProcedure
    .input(z.object({
      studyInstanceUids: z.array(z.string()),
      unitId: z.number(),
    }))
    .query(async ({ input }) => {
      if (!input.studyInstanceUids.length) return {} as Record<string, typeof report_readiness.$inferSelect>;
      const db = await getDb();
      if (!db) return {} as Record<string, typeof report_readiness.$inferSelect>;
      const rows = await db
        .select()
        .from(report_readiness)
        .where(and(
          inArray(report_readiness.study_instance_uid, input.studyInstanceUids),
          eq(report_readiness.unit_id, input.unitId),
        ));
      const result: Record<string, typeof report_readiness.$inferSelect> = {};
      for (const row of rows) {
        result[row.study_instance_uid] = row;
      }
      return result;
    }),

  /** Invalida o readiness de um estudo (apenas admin_master) */
  invalidate: protectedProcedure
    .input(z.object({
      studyInstanceUid: z.string(),
      unitId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin_master pode invalidar o readiness." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(report_readiness)
        .set({
          readiness_status: "invalidated",
          readiness_note: input.reason ?? "Invalidado manualmente",
        })
        .where(and(
          eq(report_readiness.study_instance_uid, input.studyInstanceUid),
          eq(report_readiness.unit_id, input.unitId),
        ));
      return { success: true };
    }),
});
