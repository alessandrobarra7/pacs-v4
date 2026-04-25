import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getStudyMetadata, getStudyMetadataBatch, upsertStudyMetadata, createAuditLog, resolveEffectiveUnitId } from "../db";

export const studyMetadataRouter = router({
    /** Busca os metadados editados de um estudo para a unidade do usuário logado */
    get: protectedProcedure
      .input(z.object({ studyInstanceUid: z.string(), unit_id: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        // V14-P1 FIX: aceitar unit_id da tela (unidade selecionada)
        const unitId = ctx.user.role === 'admin_master'
          ? (input.unit_id ?? await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id))
          : await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id, input.unit_id);
        if (!unitId) return null;
        return await getStudyMetadata(input.studyInstanceUid, unitId);
      }),

    /** Busca metadados de múltiplos estudos (batch) para a unidade do usuário */
    getBatch: protectedProcedure
      .input(z.object({ studyInstanceUids: z.array(z.string()), unit_id: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        // V14-P1 FIX: aceitar unit_id da tela (unidade selecionada)
        const unitId = ctx.user.role === 'admin_master'
          ? (input.unit_id ?? await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id))
          : await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id, input.unit_id);
        if (!unitId || !input.studyInstanceUids.length) return [];
        return await getStudyMetadataBatch(input.studyInstanceUids, unitId);
      }),

    /** Salva (cria ou atualiza) os metadados editados de um estudo */
    save: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
        unit_id: z.number().optional(),  // V14-P1 FIX: unidade selecionada na tela
        patientNameOverride: z.string().nullable().optional(),
        descriptionOverride: z.string().nullable().optional(),
        examCount: z.number().int().min(1).nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // V14-P1 FIX: Resolver unidade efetiva com input.unit_id da tela
        let unitId: number | null = null;
        
        if (ctx.user.role !== 'admin_master') {
          unitId = await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id, input.unit_id);
          if (!unitId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuario sem acesso a nenhuma unidade' });
          
          // V14-P1 FIX: Validar edit_exam_legend via canAccessUnit (fonte única)
          const { canAccessUnit } = await import('../authorization');
          const canEdit = await canAccessUnit(ctx.user, unitId, 'edit_exam_legend');
          if (!canEdit) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Voce nao tem permissao para editar legenda de exame' });
          }
        } else {
          // admin_master pode usar qualquer unidade
          unitId = input.unit_id ?? ctx.user.unit_id ?? (await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id));
          if (!unitId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuario sem acesso a nenhuma unidade' });
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
