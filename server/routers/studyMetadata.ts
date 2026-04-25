import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getStudyMetadata, getStudyMetadataBatch, upsertStudyMetadata, createAuditLog, resolveEffectiveUnitId, getUserUnitPermission } from "../db";
import { hasUnitPermission } from "../permissions";

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
        unit_id: z.number().optional(), // multi-unidade: usuario pode especificar unidade
      }))
      .mutation(async ({ input, ctx }) => {
        // Determinar unidade para salvar metadados
        let unitId: number | null = null;
        
        if (ctx.user.role === 'admin_master') {
          // admin_master pode usar qualquer unidade
          unitId = input.unit_id ?? ctx.user.unit_id ?? (await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id));
        } else {
          // Usuarios normais precisam de edit_exam_legend na unidade
          const targetUnitId = input.unit_id ?? ctx.user.unit_id;
          if (!targetUnitId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Unidade nao especificada e usuario sem unidade padrao' });
          }
          
          const allowed = await hasUnitPermission(ctx.user, targetUnitId, 'edit_exam_legend');
          if (!allowed) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Voce nao tem permissao para editar legenda de exame nesta unidade' });
          }
          unitId = targetUnitId;
        }
        
        if (!unitId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuario sem acesso a nenhuma unidade' });
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
