import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAnnotationsByStudy, upsertAnnotation, deleteAnnotation } from "../db";

export const annotationsRouter = router({
    /** Busca todas as anotações de um estudo para o usuário logado */
    getByStudy: protectedProcedure
      .input(z.object({ studyInstanceUid: z.string() }))
      .query(async ({ input, ctx }) => {
        return getAnnotationsByStudy(input.studyInstanceUid, ctx.user.id);
      }),

    /** Salva (cria ou atualiza) uma anotação */
    save: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
        seriesInstanceUid: z.string().optional(),
        annotationUid: z.string(),
        toolName: z.string().default("Length"),
        annotationData: z.record(z.string(), z.unknown()),
        label: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await upsertAnnotation({
          study_instance_uid: input.studyInstanceUid,
          series_instance_uid: input.seriesInstanceUid ?? null,
          user_id: ctx.user.id,
          tool_name: input.toolName,
          annotation_uid: input.annotationUid,
          annotation_data: input.annotationData,
          label: input.label ?? null,
        });
        return { success: true };
      }),

    /** Remove uma anotação pelo UID */
    delete: protectedProcedure
      .input(z.object({ annotationUid: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await deleteAnnotation(input.annotationUid, ctx.user.id);
        return { success: true };
      }),

});
