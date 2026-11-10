import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getAnnotationsByStudy, upsertAnnotation, deleteAnnotation, createAuditLog } from "../db";
import { study_attachments, dicom_annotations } from "../../drizzle/schema";
import { eq, inArray, and } from "drizzle-orm";
import { storagePut, storageDelete } from "../storage";
import { toProxyUrl } from "../mediaProxy";
import { assertDicomFileAccess } from "../authorization";
import { detectImageMimeType, extensionForMediaMimeType, studyInstanceUidSchema } from "../routerUtils";

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
    .input(z.object({ studyInstanceUid: studyInstanceUidSchema }))
    .query(async ({ input, ctx }) => {
      await assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies");
      return getAnnotationsByStudy(input.studyInstanceUid, ctx.user.id);
    }),

  /** Salva uma anotação Cornerstone */
  save: protectedProcedure
    .input(
      z.object({
        studyInstanceUid: studyInstanceUidSchema,
        seriesInstanceUid: z.string().optional(),
        annotationUid: z.string(),
        toolName: z.string().default("Length"),
        annotationData: z.record(z.string(), z.unknown()),
        label: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const unitId = await assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies");
      await upsertAnnotation({
        study_instance_uid: input.studyInstanceUid,
        series_instance_uid: input.seriesInstanceUid ?? null,
        user_id: ctx.user.id,
        tool_name: input.toolName,
        annotation_uid: input.annotationUid,
        annotation_data: input.annotationData,
        label: input.label ?? null,
      });
      // CORREÇÃO (auditoria-seguranca-rbac-20261110): save/delete de anotação
      // Cornerstone (dado clínico sobre o exame) não deixava nenhuma trilha de
      // auditoria, diferente de anamnesis.ts/anamnesisSimple.ts. 'action' é um
      // ENUM fixo em drizzle/schema.ts sem um valor próprio para anotação —
      // adicioná-lo exigiria uma migration de produção fora do escopo desta
      // correção de código; reaproveitamos EDIT_STUDY_METADATA (mesmo padrão já
      // usado para STUDY_EXAM_LEGEND) e desambiguamos via target_type/metadata.action.
      await createAuditLog({
        user_id: ctx.user.id,
        unit_id: unitId,
        action: "EDIT_STUDY_METADATA",
        target_type: "DICOM_ANNOTATION",
        target_id: input.annotationUid,
        ip_address: ctx.req.ip,
        user_agent: ctx.req.headers["user-agent"],
        metadata: { action: "SAVE_ANNOTATION", study_instance_uid: input.studyInstanceUid, tool_name: input.toolName },
      });
      return { success: true };
    }),

  /** Remove uma anotação Cornerstone */
  delete: protectedProcedure
    .input(z.object({ annotationUid: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // CORREÇÃO (auditoria-seguranca-rbac-20261110): deleteAnnotation só filtra por
      // annotation_uid + user_id (protege contra IDOR entre usuários), mas nunca
      // revalidava que o usuário ainda tem acesso ao ESTUDO da anotação — se a
      // permissão na unidade fosse revogada depois da anotação criada, o usuário
      // ainda conseguia excluí-la. Buscamos o studyInstanceUid real da anotação
      // (sempre restrito a user_id = ctx.user.id, preservando a proteção de IDOR já
      // existente) e revalidamos com assertDicomFileAccess, com a mesma permissão
      // ("view_studies") já usada em save/getByStudy neste mesmo arquivo, antes de
      // prosseguir com a exclusão. Também registramos auditoria (ver comentário em save).
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db
        .select({ study_instance_uid: dicom_annotations.study_instance_uid })
        .from(dicom_annotations)
        .where(and(eq(dicom_annotations.annotation_uid, input.annotationUid), eq(dicom_annotations.user_id, ctx.user.id)))
        .limit(1);

      if (existing) {
        const unitId = await assertDicomFileAccess(ctx.user, existing.study_instance_uid, "view_studies");
        await deleteAnnotation(input.annotationUid, ctx.user.id);
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: unitId,
          action: "EDIT_STUDY_METADATA",
          target_type: "DICOM_ANNOTATION",
          target_id: input.annotationUid,
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers["user-agent"],
          metadata: { action: "DELETE_ANNOTATION", study_instance_uid: existing.study_instance_uid },
        });
      }
      return { success: true };
    }),

  /** Lista todos os anexos de um estudo (fotos, documentos) */
  list: protectedProcedure
    .input(z.object({ study_instance_uid: studyInstanceUidSchema }))
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
    .input(z.object({ studyInstanceUids: z.array(studyInstanceUidSchema) }))
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
        study_instance_uid: studyInstanceUidSchema,
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

      const [inserted] = await db.insert(study_attachments).values({
        study_instance_uid: input.study_instance_uid,
        unit_id: unitId,
        user_id: ctx.user.id,
        file_url: url,
        file_name: input.file_name,
        file_type: mimeType,
      });

      // CORREÇÃO (auditoria-seguranca-rbac-20261110): upload de anexo clínico
      // (foto/documento do exame) não deixava trilha de auditoria. unit_id é o da
      // unidade real do estudo (retornado por assertDicomFileAccess), não a do ator.
      await createAuditLog({
        user_id: ctx.user.id,
        unit_id: unitId,
        action: "EDIT_STUDY_METADATA",
        target_type: "STUDY_ATTACHMENT",
        target_id: inserted?.insertId != null ? String(inserted.insertId) : input.study_instance_uid,
        ip_address: ctx.req.ip,
        user_agent: ctx.req.headers["user-agent"],
        metadata: { action: "UPLOAD_ATTACHMENT", study_instance_uid: input.study_instance_uid, file_name: input.file_name, mime_type: mimeType },
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
        const unitId = await assertDicomFileAccess(ctx.user, row.study_instance_uid, "view_studies");
        try {
          await storageDelete(row.file_url);
        } catch (error) {
          console.error("[Attachments] Falha ao remover objeto:", error instanceof Error ? error.message : "erro desconhecido");
        }
        await db.delete(study_attachments).where(eq(study_attachments.id, input.id));
        // CORREÇÃO (auditoria-seguranca-rbac-20261110): exclusão de anexo clínico não
        // deixava trilha de auditoria (ver comentário em upload, mesmo arquivo).
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: unitId,
          action: "EDIT_STUDY_METADATA",
          target_type: "STUDY_ATTACHMENT",
          target_id: String(input.id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers["user-agent"],
          metadata: { action: "DELETE_ATTACHMENT", study_instance_uid: row.study_instance_uid, file_name: row.file_name },
        });
      }

      return { success: true };
    }),
});
