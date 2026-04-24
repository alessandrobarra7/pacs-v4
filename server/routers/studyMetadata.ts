import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getStudyMetadata, getStudyMetadataBatch, upsertStudyMetadata, createAuditLog, resolveEffectiveUnitId, getUserUnitPermission } from "../db";

export const studyMetadataRouter = router({
    /** Busca os metadados editados de um estudo para a unidade do usuário logado */
    get: protectedProcedure
      .input(z.object({ studyInstanceUid: z.string() }))
      .query(async ({ input, ctx }) => {
        const unitId = await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id);
        if (!unitId) return null;
        return await getStudyMetadata(input.studyInstanceUid, unitId);
      }),

    /** Busca metadados de múltiplos estudos (batch) para a unidade do usuário */
    getBatch: protectedProcedure
      .input(z.object({ studyInstanceUids: z.array(z.string()) }))
      .query(async ({ input, ctx }) => {
        const unitId = await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id);
        if (!unitId || !input.studyInstanceUids.length) return [];
        return await getStudyMetadataBatch(input.studyInstanceUids, unitId);
      }),

    /** Salva (cria ou atualiza) os metadados editados de um estudo */
    save: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
        patientNameOverride: z.string().nullable().optional(),
        descriptionOverride: z.string().nullable().optional(),
        examCount: z.number().int().min(1).nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Resolver a unidade efetiva do usuário
        const unitId = await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id);
        if (!unitId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuário sem acesso a nenhuma unidade' });
        
        // Validar permissão edit_exam_legend
        const perm = await getUserUnitPermission(ctx.user.id, unitId);
        if (perm && !perm.edit_exam_legend) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para editar legenda de exame' });
        }
        await upsertStudyMetadata({
          study_instance_uid: input.studyInstanceUid,
          unit_id: unitId,
          patient_name_override: input.patientNameOverride ?? null,
          description_override: input.descriptionOverride ?? null,
          exam_count: input.examCount ?? 1,
          notes: input.notes ?? null,
          edited_by_user_id: ctx.user.id,
          edited_by_name: ctx.user.name ?? ctx.user.username ?? null,
        });
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: unitId,
          action: 'EDIT_STUDY_METADATA',
          target_type: 'study_metadata',
          target_id: input.studyInstanceUid,
        });
        return { success: true };
      }),

});
