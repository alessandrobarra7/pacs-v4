import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAnamnesisSimple, saveAnamnesisSimple, createAuditLog, getDb, resolveEffectiveUnitId } from "../db";
import { evaluateAndUpsertReadiness } from "./sla";
import { anamnesis_simple } from "../../drizzle/schema";
import { inArray } from "drizzle-orm";
import { canAccessUnit, getStudyUnitId } from "../authorization";

export const anamnesisSimpleRouter = router({
    /** Busca a anamnese de um estudo */
    getByStudy: protectedProcedure
      .input(z.object({ studyInstanceUid: z.string() }))
      .query(async ({ input, ctx }) => {
        // Validar permissão view_anamnesis na unidade real do estudo
        const studyUnitId = await getStudyUnitId(input.studyInstanceUid);
        if (studyUnitId) {
          const canView = await canAccessUnit(ctx.user, studyUnitId, 'view_anamnesis');
          if (!canView) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para visualizar anamnese deste estudo' });
        }
        return await getAnamnesisSimple(input.studyInstanceUid);
      }),

    /** Cria ou atualiza a anamnese de um estudo */
    save: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
        patientName: z.string().optional(),
        presets: z.array(z.string()),
        manualText: z.string().min(1, "O campo de indicação clínica é obrigatório"),
      }))
      .mutation(async ({ input, ctx }) => {
        // Validar permissão edit_anamnesis na unidade real do estudo
        const studyUnitId = await getStudyUnitId(input.studyInstanceUid);
        let effectiveUnitId: number | null = null;
        if (studyUnitId) {
          const canEdit = await canAccessUnit(ctx.user, studyUnitId, 'edit_anamnesis');
          if (!canEdit) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para editar anamnese deste estudo' });
          effectiveUnitId = studyUnitId;
        } else {
          // Fallback para unidade efetiva do usuário
          effectiveUnitId = await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id);
        }

        await saveAnamnesisSimple({
          study_instance_uid: input.studyInstanceUid,
          unit_id: effectiveUnitId,
          created_by_user_id: ctx.user.id,
          patient_name: input.patientName ?? null,
          presets: input.presets,
          manual_text: input.manualText,
        });
        await createAuditLog({
          user_id: ctx.user.id,
          action: "CREATE_ANAMNESIS",
          target_type: "anamnesis_simple",
          target_id: input.studyInstanceUid,
        });
        // Avaliar prontidão e iniciar SLA (apenas na primeira anamnese válida)
        let readiness = null;
        if (effectiveUnitId) {
          const result = await evaluateAndUpsertReadiness({
            studyInstanceUid: input.studyInstanceUid,
            unitId: effectiveUnitId,
            createdByUserId: ctx.user.id,
            manualText: input.manualText,
          });
          readiness = result.readiness;
        }
        return { success: true, readiness };
      }),

    /** Retorna quais UIDs têm anamnese registrada (independente de unit_id) */
    getStatusBatch: protectedProcedure
      .input(z.object({ studyInstanceUids: z.array(z.string()) }))
      .query(async ({ input }) => {
        if (!input.studyInstanceUids.length) return {} as Record<string, boolean>;
        const db = await getDb();
        if (!db) return {} as Record<string, boolean>;
        const rows = await db
          .select({ study_instance_uid: anamnesis_simple.study_instance_uid })
          .from(anamnesis_simple)
          .where(inArray(anamnesis_simple.study_instance_uid, input.studyInstanceUids));
        const result: Record<string, boolean> = {};
        for (const uid of input.studyInstanceUids) result[uid] = false;
        for (const row of rows) result[row.study_instance_uid] = true;
        return result;
      }),

});
