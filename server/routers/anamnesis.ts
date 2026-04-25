import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb, createAuditLog, resolveEffectiveUnitId, getUserUnitPermission } from "../db";
import { hasUnitPermission } from "../permissions";

export const anamnesisRouter = router({
    create: protectedProcedure
      .input(
        z.object({
          study_instance_uid: z.string(),
          unit_id: z.number(),
          exam_area: z.string().optional(),
          main_symptom: z.string().optional(),
          symptom_duration_days: z.number().optional(),
          symptom_intensity: z.string().optional(),
          has_fever: z.boolean().optional(),
          fever_temperature: z.number().optional(),
          has_dyspnea: z.boolean().optional(),
          has_chest_pain: z.boolean().optional(),
          associated_symptoms: z.string().optional(),
          has_hypertension: z.boolean().optional(),
          has_diabetes: z.boolean().optional(),
          has_anxiety: z.boolean().optional(),
          has_previous_lung_disease: z.boolean().optional(),
          uses_continuous_medication: z.boolean().optional(),
          medications_list: z.string().optional(),
          exam_purpose: z.string().optional(),
          suggested_cid: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { anamnesis } = await import("../../drizzle/schema");
        
        // Validar permissão edit_anamnesis com unit_id selecionado
        let effectiveUnitId: number | null;
        if (ctx.user.role === 'admin_master') {
          effectiveUnitId = input.unit_id;
        } else {
          // Validar que tem acesso à unidade selecionada
          const allowed = await hasUnitPermission(ctx.user, input.unit_id, 'edit_anamnesis');
          if (!allowed) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Voce nao tem permissao para editar anamnese nesta unidade' });
          }
          effectiveUnitId = input.unit_id;
        }
        
        const [result] = await db.insert(anamnesis).values({
          study_instance_uid: input.study_instance_uid,
          unit_id: effectiveUnitId || null,
          created_by_user_id: ctx.user.id,
          exam_area: input.exam_area || null,
          main_symptom: input.main_symptom || null,
          symptom_duration_days: input.symptom_duration_days ?? null,
          symptom_intensity: input.symptom_intensity || null,
          has_fever: input.has_fever || false,
          fever_temperature: input.fever_temperature ? String(input.fever_temperature) : null,
          has_dyspnea: input.has_dyspnea || false,
          has_chest_pain: input.has_chest_pain || false,
          associated_symptoms: input.associated_symptoms || null,
          has_hypertension: input.has_hypertension || false,
          has_diabetes: input.has_diabetes || false,
          has_anxiety: input.has_anxiety || false,
          has_previous_lung_disease: input.has_previous_lung_disease || false,
          uses_continuous_medication: input.uses_continuous_medication || false,
          medications_list: input.medications_list || null,
          exam_purpose: input.exam_purpose || null,
          suggested_cid: input.suggested_cid || null,
        });

        await createAuditLog({
          user_id: ctx.user.id,
          action: "CREATE_ANAMNESIS",
          target_type: "anamnesis",
          target_id: result.insertId.toString(),
        });

        return { id: result.insertId };
      }),

    getByStudyId: protectedProcedure
      .input(z.object({ study_instance_uid: z.string() }))
      .query(async ({ input, ctx }) => {
        // Buscar anamnese primeiro para validar acesso a unidade correta
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { anamnesis } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        
        // Buscar anamnese sem filtro para encontrar a unidade real
        const anamnesisRecords = await db
          .select()
          .from(anamnesis)
          .where(eq(anamnesis.study_instance_uid, input.study_instance_uid))
          .limit(1);
        
        const anamnesisRecord = anamnesisRecords[0];
        if (!anamnesisRecord) return null;
        
        // Validar permissao view_anamnesis na unidade real da anamnese
        if (ctx.user.role !== 'admin_master' && anamnesisRecord.unit_id) {
          const allowed = await hasUnitPermission(ctx.user, anamnesisRecord.unit_id, 'view_anamnesis');
          if (!allowed) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissao para visualizar anamnese' });
          }
        }
        
        // Registrar acesso à anamnese (dado sensível)
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: anamnesisRecord.unit_id ?? undefined,
          action: 'VIEW_STUDY',
          target_type: 'ANAMNESIS',
          target_id: input.study_instance_uid,
        });
        
        return anamnesisRecord;
      }),

});
