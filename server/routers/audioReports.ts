import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, createAuditLog } from "../db";
import { study_audio_reports } from "../../drizzle/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { storagePut, storageDelete } from "../storage";
import { toProxyUrl } from "../mediaProxy";
import { TRPCError } from "@trpc/server";
import { assertDicomFileAccess } from "../authorization";
import { detectAudioMimeType, extensionForMediaMimeType, studyInstanceUidSchema } from "../routerUtils";

async function resolveAudioUrl(reference: string | null): Promise<string | null> {
  if (!reference) return null;
  return toProxyUrl(reference);
}

function assertClinicalMediaViewer(role: string) {
  if (role !== "medico" && role !== "operador") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a médicos e operadores" });
  }
}

function assertClinicalMediaDoctor(role: string) {
  if (role !== "medico") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas médicos podem gravar ou excluir áudios" });
  }
}

export const audioReportsRouter = router({
  /** Lista áudios gravados de um estudo */
  list: protectedProcedure
    .input(z.object({ study_instance_uid: studyInstanceUidSchema }))
    .query(async ({ input, ctx }) => {
      assertClinicalMediaViewer(ctx.user.role);
      await assertDicomFileAccess(ctx.user, input.study_instance_uid, "view_studies");
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(study_audio_reports)
        .where(eq(study_audio_reports.study_instance_uid, input.study_instance_uid))
        .orderBy(desc(study_audio_reports.createdAt));
      return Promise.all(rows.map(async (row) => ({
        ...row,
        file_url: await resolveAudioUrl(row.file_url),
      })));
    }),

  /** Retorna quais UIDs possuem áudios cadastrados (para listagem PACS) */
  getStatusBatch: protectedProcedure
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
        .select({ study_instance_uid: study_audio_reports.study_instance_uid })
        .from(study_audio_reports)
        .where(inArray(study_audio_reports.study_instance_uid, allowedStudyUids));
      for (const row of rows) {
        if (row.study_instance_uid) result[row.study_instance_uid] = true;
      }
      return result;
    }),

  /** Salva um áudio gravado (laudo falado) */
  upload: protectedProcedure
    .input(
      z.object({
        study_instance_uid: studyInstanceUidSchema,
        unit_id: z.number().optional(),
        file_data: z.string(),
        file_name: z.string(),
        duration_seconds: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertClinicalMediaDoctor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const unitId = await assertDicomFileAccess(ctx.user, input.study_instance_uid, "view_studies");

      const matches = input.file_data.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de áudio base64 inválido" });
      }
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, "base64");

      if (buffer.length > 25 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Áudio muito grande. Máximo 25MB." });
      }

      const mimeType = detectAudioMimeType(buffer);
      if (!mimeType) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de áudio inválido. Envie MP3, WAV, OGG ou WEBM reais." });
      }

      const ext = extensionForMediaMimeType(mimeType);
      const safeName = `audio_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const relKey = `audio_reports/${input.study_instance_uid}/${safeName}`;

      const { url } = await storagePut(relKey, buffer, mimeType);

      const [inserted] = await db.insert(study_audio_reports).values({
        study_instance_uid: input.study_instance_uid,
        unit_id: unitId,
        user_id: ctx.user.id,
        file_url: url,
        file_key: relKey,
        file_name: input.file_name,
        file_size: buffer.length,
        duration_seconds: input.duration_seconds || 0,
      });

      // CORREÇÃO (auditoria-seguranca-rbac-20261110): upload de áudio de laudo falado
      // (dado clínico sensível) não deixava trilha de auditoria, diferente de
      // anamnesis.ts/anamnesisSimple.ts. 'action' é um ENUM fixo em
      // drizzle/schema.ts sem valor próprio para áudio de laudo — adicioná-lo
      // exigiria uma migration de produção fora do escopo desta correção de código;
      // reaproveitamos EDIT_STUDY_METADATA (mesmo padrão já usado para
      // STUDY_EXAM_LEGEND/anotações) e desambiguamos via target_type/metadata.action.
      // unit_id é a unidade real do estudo (retornada por assertDicomFileAccess),
      // não a do ator.
      await createAuditLog({
        user_id: ctx.user.id,
        unit_id: unitId,
        action: "EDIT_STUDY_METADATA",
        target_type: "STUDY_AUDIO_REPORT",
        target_id: inserted?.insertId != null ? String(inserted.insertId) : input.study_instance_uid,
        ip_address: ctx.req.ip,
        user_agent: ctx.req.headers["user-agent"],
        metadata: { action: "UPLOAD_AUDIO_REPORT", study_instance_uid: input.study_instance_uid, file_name: input.file_name, duration_seconds: input.duration_seconds ?? null },
      });

      return { success: true, url };
    }),

  /** Remove um áudio gravado */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select()
        .from(study_audio_reports)
        .where(eq(study_audio_reports.id, input.id));

      if (!rows.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Áudio não encontrado" });
      }

      const record = rows[0];
      assertClinicalMediaDoctor(ctx.user.role);
      if (record.user_id !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o médico autor pode excluir este áudio" });
      }
      const unitId = await assertDicomFileAccess(ctx.user, record.study_instance_uid, "view_studies");
      try {
        await storageDelete(record.file_url || record.file_key);
      } catch (_) {}

      await db
        .delete(study_audio_reports)
        .where(eq(study_audio_reports.id, input.id));

      // CORREÇÃO (auditoria-seguranca-rbac-20261110): exclusão de áudio de laudo
      // falado não deixava trilha de auditoria (ver comentário em upload, mesmo arquivo).
      await createAuditLog({
        user_id: ctx.user.id,
        unit_id: unitId,
        action: "EDIT_STUDY_METADATA",
        target_type: "STUDY_AUDIO_REPORT",
        target_id: String(input.id),
        ip_address: ctx.req.ip,
        user_agent: ctx.req.headers["user-agent"],
        metadata: { action: "DELETE_AUDIO_REPORT", study_instance_uid: record.study_instance_uid, file_name: record.file_name },
      });

      return { success: true };
    }),
});
