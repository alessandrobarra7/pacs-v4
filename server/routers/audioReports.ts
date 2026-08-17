import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { study_audio_reports } from "../../drizzle/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { storagePut, storageDelete, storageGetUrl } from "../storage";
import { TRPCError } from "@trpc/server";

async function resolveAudioUrl(reference: string | null): Promise<string | null> {
  if (!reference) return null;
  try {
    return await storageGetUrl(reference);
  } catch (error) {
    console.error("[AudioReports] Falha ao gerar URL temporária:", error instanceof Error ? error.message : "erro desconhecido");
    return reference.startsWith("/uploads/") ? reference : null;
  }
}
export const audioReportsRouter = router({
  /** Lista áudios gravados de um estudo */
  list: protectedProcedure
    .input(z.object({ study_instance_uid: z.string() }))
    .query(async ({ input }) => {
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
    .input(z.object({ studyInstanceUids: z.array(z.string()) }))
    .query(async ({ input }) => {
      if (!input.studyInstanceUids.length) return {} as Record<string, boolean>;
      const db = await getDb();
      if (!db) return {} as Record<string, boolean>;
      const rows = await db
        .select({ study_instance_uid: study_audio_reports.study_instance_uid })
        .from(study_audio_reports)
        .where(inArray(study_audio_reports.study_instance_uid, input.studyInstanceUids));
      const result: Record<string, boolean> = {};
      for (const uid of input.studyInstanceUids) result[uid] = false;
      for (const row of rows) {
        if (row.study_instance_uid) result[row.study_instance_uid] = true;
      }
      return result;
    }),

  /** Salva um áudio gravado (laudo falado) */
  upload: protectedProcedure
    .input(
      z.object({
        study_instance_uid: z.string(),
        unit_id: z.number().optional(),
        file_data: z.string(),
        file_name: z.string(),
        duration_seconds: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const matches = input.file_data.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de áudio base64 inválido" });
      }
      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, "base64");

      if (buffer.length > 25 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Áudio muito grande. Máximo 25MB." });
      }

      const ext = input.file_name.split(".").pop() || "webm";
      const safeName = `audio_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const relKey = `audio_reports/${input.study_instance_uid}/${safeName}`;

      const { url } = await storagePut(relKey, buffer, mimeType);

      await db.insert(study_audio_reports).values({
        study_instance_uid: input.study_instance_uid,
        unit_id: input.unit_id || ctx.user.unit_id || null,
        user_id: ctx.user.id,
        file_url: url,
        file_key: relKey,
        file_name: input.file_name,
        file_size: buffer.length,
        duration_seconds: input.duration_seconds || 0,
      });

      return { success: true, url };
    }),

  /** Remove um áudio gravado */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
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
      try {
        await storageDelete(record.file_url || record.file_key);
      } catch (_) {}

      await db
        .delete(study_audio_reports)
        .where(eq(study_audio_reports.id, input.id));

      return { success: true };
    }),
});
