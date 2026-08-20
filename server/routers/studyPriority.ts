import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { study_priority_flags } from "../../drizzle/schema";
import { assertDicomFileAccess, canAccessUnit } from "../authorization";
import { createAuditLog, getDb, resolveEffectiveUnitId } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const prioritySchema = z.enum(["urgencia", "prioridade_maxima"]);

function assertPriorityAuthorRole(role: string) {
  if (role !== "operador" && role !== "atendente") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Somente operador ou atendente podem sinalizar prioridade clínica.",
    });
  }
}

export const studyPriorityRouter = router({
  /** Retorna as sinalizações da unidade selecionada para os estudos já autorizados na tela. */
  getBatch: protectedProcedure
    .input(z.object({ studyInstanceUids: z.array(z.string()).max(100), unit_id: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      if (!input.studyInstanceUids.length) return [];
      const unitId = ctx.user.role === "admin_master"
        ? (input.unit_id ?? await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id))
        : await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id, input.unit_id);
      if (!unitId || !(await canAccessUnit(ctx.user, unitId, "view_studies"))) return [];

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      return db.select().from(study_priority_flags).where(and(
        eq(study_priority_flags.unit_id, unitId),
        inArray(study_priority_flags.study_instance_uid, input.studyInstanceUids),
      ));
    }),

  /**
   * Cria, altera ou remove uma sinalização. Somente o próprio autor pode alterá-la ou removê-la.
   * priority=null remove a sinalização criada pelo usuário atual.
   */
  set: protectedProcedure
    .input(z.object({
      studyInstanceUid: z.string().min(1),
      unit_id: z.number().optional(),
      priority: prioritySchema.nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertPriorityAuthorRole(ctx.user.role);
      const unitId = await assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies");
      if (input.unit_id !== undefined && input.unit_id !== unitId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "O estudo não pertence à unidade selecionada." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const whereStudy = and(
        eq(study_priority_flags.study_instance_uid, input.studyInstanceUid),
        eq(study_priority_flags.unit_id, unitId),
      );
      const existing = await db.select().from(study_priority_flags).where(whereStudy).limit(1);
      const current = existing[0] ?? null;

      if (current && current.marked_by_user_id !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Sinalização registrada por ${current.marked_by_name || "outro usuário"}; somente o autor pode alterá-la.`,
        });
      }

      if (input.priority === null) {
        if (!current) return { success: true, priority: null };
        await db.delete(study_priority_flags).where(eq(study_priority_flags.id, current.id));
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: unitId,
          action: "CLEAR_STUDY_PRIORITY",
          target_type: "study_priority",
          target_id: input.studyInstanceUid,
        });
        return { success: true, priority: null };
      }

      if (current) {
        await db.update(study_priority_flags).set({ priority: input.priority }).where(eq(study_priority_flags.id, current.id));
      } else {
        await db.insert(study_priority_flags).values({
          study_instance_uid: input.studyInstanceUid,
          unit_id: unitId,
          priority: input.priority,
          marked_by_user_id: ctx.user.id,
          marked_by_name: ctx.user.name ?? ctx.user.username ?? null,
        });
      }
      await createAuditLog({
        user_id: ctx.user.id,
        unit_id: unitId,
        action: current ? "UPDATE_STUDY_PRIORITY" : "SET_STUDY_PRIORITY",
        target_type: "study_priority",
        target_id: input.studyInstanceUid,
      });
      return { success: true, priority: input.priority };
    }),
});
