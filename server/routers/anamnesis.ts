import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb, createAuditLog, resolveEffectiveUnitId, getUserUnitPermission } from "../db";

export const anamnesisRouter = router({
    create: protectedProcedure
      .input(
        z.object({
          study_instance_uid: z.string(),
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
        
        // Validar permissão edit_anamnesis
        const effectiveUnitId = ctx.user.unit_id;
        if (effectiveUnitId) {
          const perm = await getUserUnitPermission(ctx.user.id, effectiveUnitId);
          if (perm && !perm.edit_anamnesis) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para editar anamnese' });
          }
        }
        
        const [result] = await db.insert(anamnesis).values({
          study_instance_uid: input.study_instance_uid,
          unit_id: ctx.user.unit_id || null,
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
        // F1-6: Verificar permissão view_anamnesis antes de retornar dados sensíveis
        if (ctx.user.role !== 'admin_master') {
          const { getUserUnitPermission } = await import('../db');
          const effectiveUnitId = await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id);
          if (effectiveUnitId) {
            const perm = await getUserUnitPermission(ctx.user.id, effectiveUnitId);
            // Fallback para unit_id legado: se não tem perm mas tem unit_id legado, permite
            if (perm && !perm.view_anamnesis) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para visualizar anamnese' });
            }
          }
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { anamnesis } = await import("../../drizzle/schema");
        const { eq, and: andOp } = await import("drizzle-orm");
        
        // F1-6: Filtrar por unit_id do usuário para evitar acesso cross-unidade
        const effectiveUnitId = ctx.user.role === 'admin_master'
          ? undefined
          : await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id);
        
        const whereClause = effectiveUnitId
          ? andOp(eq(anamnesis.study_instance_uid, input.study_instance_uid), eq(anamnesis.unit_id, effectiveUnitId))
          : eq(anamnesis.study_instance_uid, input.study_instance_uid);
        
        const results = await db
          .select()
          .from(anamnesis)
          .where(whereClause)
          .limit(1);
        
        // F3-3: Registrar acesso à anamnese (dado sensível)
        if (results[0]) {
          await createAuditLog({
            user_id: ctx.user.id,
            unit_id: ctx.user.unit_id ?? undefined,
            action: 'CREATE_ANAMNESIS',
            target_type: 'ANAMNESIS',
            target_id: input.study_instance_uid,
            ip_address: ctx.req.ip,
            user_agent: ctx.req.headers['user-agent'],
            metadata: { action: 'VIEW' },
          });
        }
        return results[0] || null;
      }),

});
