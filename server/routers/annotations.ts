import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getAnnotationsByStudy, upsertAnnotation, deleteAnnotation } from "../db";
import { study_attachments } from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import { storagePut, storageDelete } from "../storage";
import { toProxyUrl } from "../mediaProxy";
import { assertDicomFileAccess } from "../authorization";
import { detectImageMimeType, extensionForMediaMimeType } from "../routerUtils";

async function resolveAttachmentUrl(reference: string | null): Promise<string | null> {
  if (!reference) return null;
  return toProxyUrl(reference);
}

function assertClinicalMediaDoctor(role: string) {
  if (role !== "medico") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas médicos podem anexar ou excluir arquivos" });
  }
}

export const annotationsRouter = router({
  /** Busca anotações Cornerstone de um estudo (compatibilidade com viewer DICOM) */
  getByStudy: protectedProcedure
    .input(z.object({ studyInstanceUid: z.string() }))
    .query(async ({ input, ctx }) => {
      await assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies");
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
      await assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies");
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
    .query(async ({ input, ctx }) => {
      await assertDicomFileAccess(ctx.user, input.study_instance_uid, "view_studies");
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(study_attachments)
        .where(eq(study_attachments.study_instance_uid, input.study_instance_uid));
      return Promise.all(rows.map(async (row) => ({
        ...row,
        file_url: await resolveAttachmentUrl(row.file_url),
      })));
    }),

  /** Retorna quais UIDs possuem anexos cadastrados */
  getAttachmentsStatusBatch: protectedProcedure
    .input(z.object({ studyInstanceUids: z.array(z.string()) }))
    .query(async ({ input, ctx }) => {
      if (!input.studyInstanceUids.length) return {} as Record<string, boolean>;
      const result: Record<string, boolean> = {};
      for (const uid of input.studyInstanceUids) result[uid] = false;

      const access = await Promise.all(input.studyInstanceUids.map(async (studyUid) => {
        try {
          await assertDicomFileAccess(ctx.user, studyUid, "view_studies");
          return studyUid;
        } catch {
          return null;
        }
      }));
      const allowedStudyUids = access.filter((studyUid): studyUid is string => studyUid !== null);
      if (!allowedStudyUids.length) return result;

      const db = await getDb();
      if (!db) return result;
      const rows = await db
        .select({ study_instance_uid: study_attachments.study_instance_uid })
        .from(study_attachments)
        .where(inArray(study_attachments.study_instance_uid, allowedStudyUids));
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
      assertClinicalMediaDoctor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const unitId = await assertDicomFileAccess(ctx.user, input.study_instance_uid, "view_studies");

      const matches = input.file_data.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato base64 inválido" });
      }
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, "base64");

      if (buffer.length > 15 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo muito grande. Máximo 15MB." });
      }

      const mimeType = detectImageMimeType(buffer);
      if (!mimeType) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de anexo inválido. Envie uma imagem PNG, JPEG, GIF ou WebP real." });
      }

      const ext = extensionForMediaMimeType(mimeType);
      const safeName = `attachment_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const relKey = `attachments/${input.study_instance_uid}/${safeName}`;

      const { url } = await storagePut(relKey, buffer, mimeType);

      await db.insert(study_attachments).values({
        study_instance_uid: input.study_instance_uid,
        unit_id: unitId,
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
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [row] = await db
        .select()
        .from(study_attachments)
        .where(eq(study_attachments.id, input.id));

      if (row) {
        assertClinicalMediaDoctor(ctx.user.role);
        if (row.user_id !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o médico autor pode excluir este anexo" });
        }
        await assertDicomFileAccess(ctx.user, row.study_instance_uid, "view_studies");
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
