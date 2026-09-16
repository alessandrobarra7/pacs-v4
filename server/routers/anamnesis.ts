import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb, createAuditLog, resolveEffectiveUnitId, getUserUnitPermission } from "../db";
import { studyInstanceUidSchema } from "../routerUtils";

export const anamnesisRouter = router({
    create: protectedProcedure
      .input(
        z.object({
          study_instance_uid: studyInstanceUidSchema,
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
        
        // ERRO CRÍTICO 6 FIX: Validar permissão edit_anamnesis com unit_id selecionado
        const { resolveEffectiveUnitId, assertUnitPermission } = await import("../db");
        
        let effectiveUnitId: number | null;
        if (ctx.user.role === 'admin_master') {
          // admin_master pode usar qualquer unidade
          effectiveUnitId = input.unit_id;
        } else {
          // Para usuários normais, validar que têm acesso à unidade selecionada
          effectiveUnitId = await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id, input.unit_id);
          if (!effectiveUnitId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuário sem acesso à unidade solicitada' });
          }
          // Validar permissão edit_anamnesis
          const hasPermission = await assertUnitPermission(ctx.user.id, effectiveUnitId, 'edit_anamnesis', ctx.user.unit_id);
          if (!hasPermission) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para editar anamnese nesta unidade' });
          }
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
      .input(z.object({ study_instance_uid: studyInstanceUidSchema }))
      .query(async ({ input, ctx }) => {
        // CORREÇÃO (auditoria claude/correcoes-setoriais-auditoria):
        // F1-6 original: quando resolveEffectiveUnitId não conseguia resolver uma
        // unidade (ex.: usuário sem user_unit_permissions e sem users.unit_id legado),
        // a checagem de view_anamnesis era pulada POR INTEIRO — e, mais abaixo, o
        // whereClause também deixava de filtrar por unit_id, retornando a anamnese de
        // QUALQUER unidade para esse usuário. Agora, para não-admin_master, a ausência
        // de unidade resolvida nega o acesso (deny-by-default), em vez de liberá-lo.
        const { getUserUnitPermission } = await import('../db');
        const effectiveUnitId = ctx.user.role === 'admin_master'
          ? undefined
          : await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id);

        if (ctx.user.role !== 'admin_master') {
          if (!effectiveUnitId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuário sem unidade vinculada' });
          }
          const perm = await getUserUnitPermission(ctx.user.id, effectiveUnitId);
          // Fallback para unit_id legado: se não tem perm mas tem unit_id legado, permite
          if (perm && !perm.view_anamnesis) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para visualizar anamnese' });
          }
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { anamnesis } = await import("../../drizzle/schema");
        const { eq, and: andOp } = await import("drizzle-orm");

        // F1-6: Filtrar por unit_id do usuário para evitar acesso cross-unidade.
        // effectiveUnitId só fica undefined para admin_master (já tratado acima);
        // para os demais papéis, a ausência de unidade já lançou FORBIDDEN.
        const whereClause = effectiveUnitId
          ? andOp(eq(anamnesis.study_instance_uid, input.study_instance_uid), eq(anamnesis.unit_id, effectiveUnitId))
          : eq(anamnesis.study_instance_uid, input.study_instance_uid);
        
        const results = await db
          .select()
          .from(anamnesis)
          .where(whereClause)
          .limit(1);
        
        // F3-3: Registrar acesso à anamnese (dado sensível)
        // NOTA (auditoria claude/correcoes-setoriais-auditoria): a ação registrada
        // aqui é 'CREATE_ANAMNESIS' mesmo neste caminho de LEITURA — a auditoria fica
        // com o rótulo "criação" para uma simples visualização (metadata.action='VIEW'
        // é o único sinal correto). O valor correto seria um novo action tipo
        // 'VIEW_ANAMNESIS', mas action é um MySQL ENUM fixo em drizzle/schema.ts
        // (linha ~190) — adicioná-lo exige uma migration real no banco de produção,
        // fora do escopo de uma correção só de código. Mantido como estava; reportado
        // separadamente como item que precisa de migration aprovada.
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
