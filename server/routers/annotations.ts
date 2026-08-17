import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getAnnotationsByStudy, upsertAnnotation, deleteAnnotation } from "../db";
import { study_attachments } from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import { storagePut, storageDelete } from "../storage";

export const annotationsRouter = router({
  /** Busca anotações Cornerstone de um estudo (compatibilidade com viewer DICOM) */
  getByStudy: protectedProcedure
    .input(z.object({ studyInstanceUid: z.string() }))
    .query(async ({ input, ctx }) => {
      return getAnnotationsByStudy(input.studyInstanceUid, ctx.user.id);
    }),

  /** Salva uma anotação Cornerstone */
  save: protectedProcedure
    .input(
      z.object({
        studyInstanceUid: z.string(),
        seriesInstanceUid: z.string().optional(),
        annotationUid: z.string(),
        toolName: z.string().default("Length"),
        annotationData: z.record(z.string(), z.unknown()),
        label: z.string().optional(),
      })
    )
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

  /** Remove uma anotação Cornerstone */
  delete: protectedProcedure
    .input(z.object({ annotationUid: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await deleteAnnotation(input.annotationUid, ctx.user.id);
      return { success: true };
    }),

  /** Lista todos os anexos de um estudo (fotos, documentos) */
  list: protectedProcedure
    .input(z.object({ study_instance_uid: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(study_attachments)
        .where(eq(study_attachments.study_instance_uid, input.study_instance_uid));
    }),

  /** Retorna quais UIDs possuem anexos cadastrados */
  getAttachmentsStatusBatch: protectedProcedure
    .input(z.object({ studyInstanceUids: z.array(z.string()) }))
    .query(async ({ input }) => {
      if (!input.studyInstanceUids.length) return {} as Record<string, boolean>;
      const db = await getDb();
      if (!db) return {} as Record<string, boolean>;
      const rows = await db
        .select({ study_instance_uid: study_attachments.study_instance_uid })
        .from(study_attachments)
        .where(inArray(study_attachments.study_instance_uid, input.studyInstanceUids));
      const result: Record<string, boolean> = {};
      for (const uid of input.studyInstanceUids) result[uid] = false;
      for (const row of rows) {
        if (row.study_instance_uid) result[row.study_instance_uid] = true;
      }
      return result;
    }),

  /** Faz upload de um anexo (foto da câmera ou arquivo) */
  upload: protectedProcedure
    .input(
      z.object({
        study_instance_uid: z.string(),
        unit_id: z.number().optional(),
        file_data: z.string(),
        file_name: z.string(),
        file_type: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const matches = input.file_data.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato base64 inválido" });
      }
      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, "base64");

      if (buffer.length > 15 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo muito grande. Máximo 15MB." });
      }

      const ext = input.file_name.split(".").pop() || "jpg";
      const safeName = `attachment_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const relKey = `attachments/${input.study_instance_uid}/${safeName}`;

      const { url } = await storagePut(relKey, buffer, mimeType);

      await db.insert(study_attachments).values({
        study_instance_uid: input.study_instance_uid,
        unit_id: input.unit_id || ctx.user.unit_id || null,
        user_id: ctx.user.id,
        file_url: url,
        file_name: input.file_name,
        file_type: mimeType,
      });

      return { success: true, url };
    }),

  /** Remove um anexo */
  deleteAttachment: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [row] = await db
        .select()
        .from(study_attachments)
        .where(eq(study_attachments.id, input.id));

      if (row) {
        try {
          await storageDelete(row.file_url);
        } catch (error) {
          console.error("[Attachments] Falha ao remover objeto:", error instanceof Error ? error.message : "erro desconhecido");
        }
        await db.delete(study_attachments).where(eq(study_attachments.id, input.id));
      }

      return { success: true };
    }),
});
