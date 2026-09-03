import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAnamnesisSimple, saveAnamnesisSimple, createAuditLog, getDb, resolveEffectiveUnitId } from "../db";
import { evaluateAndUpsertReadiness } from "./sla";
import { anamnesis_simple } from "../../drizzle/schema";
import { inArray } from "drizzle-orm";
import { canAccessUnit, getStudyUnitId } from "../authorization";
import { studyInstanceUidSchema } from "../routerUtils";

export const anamnesisSimpleRouter = router({
    /** Busca a anamnese de um estudo */
    getByStudy: protectedProcedure
      .input(z.object({ studyInstanceUid: studyInstanceUidSchema }))
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
        studyInstanceUid: studyInstanceUidSchema,
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

    /** Retorna quais UIDs têm anamnese registrada na unidade acessível ao usuário. */
    getStatusBatch: protectedProcedure
      .input(z.object({
        studyInstanceUids: z.array(studyInstanceUidSchema),
        unitId: z.number().int().positive().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (!input.studyInstanceUids.length) return {} as Record<string, boolean>;
        const result: Record<string, boolean> = {};
        for (const uid of input.studyInstanceUids) result[uid] = false;

        const access = await Promise.all(input.studyInstanceUids.map(async (studyInstanceUid) => {
          try {
            const studyUnitId = await getStudyUnitId(studyInstanceUid);
            // Estudos legados podem não ter vínculo registrado na tabela de origem.
            // Nesse caso, usa a unidade selecionada no Portal e ainda valida a permissão nela.
            const accessUnitId = studyUnitId ?? input.unitId ?? await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id);
            if (!accessUnitId) return null;
            return await canAccessUnit(ctx.user, accessUnitId, "view_anamnesis") ? studyInstanceUid : null;
          } catch {
            return null;
          }
        }));
        const allowedStudyUids = access.filter((studyInstanceUid): studyInstanceUid is string => studyInstanceUid !== null);
        if (!allowedStudyUids.length) return result;

        const db = await getDb();
        if (!db) return result;
        const rows = await db
          .select({ study_instance_uid: anamnesis_simple.study_instance_uid })
          .from(anamnesis_simple)
          .where(inArray(anamnesis_simple.study_instance_uid, allowedStudyUids));
        for (const row of rows) result[row.study_instance_uid] = true;
        return result;
      }),

});
