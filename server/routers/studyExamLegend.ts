import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { exam_legends, exam_legend_documents, study_exam_legend_selections } from "../../drizzle/schema";
import { assertDicomFileAccess } from "../authorization";
import { createAuditLog, getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const selectableRoles = new Set(["operador", "atendente", "medico", "admin_master"]);

function assertCanSelect(role: string) {
  if (!selectableRoles.has(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Somente operador, atendente, médico ou administrador podem selecionar a legenda." });
  }
}

export const studyExamLegendRouter = router({
  listForStudy: protectedProcedure
    .input(z.object({ studyInstanceUid: z.string().min(1), modality: z.string().trim().min(1) }))
    .query(async ({ input, ctx }) => {
      await assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      return db.select({ id: exam_legends.id, exam_name: exam_legends.exam_name, modality: exam_legends.modality, financial_event_count: exam_legends.financial_event_count })
        .from(exam_legends)
        .where(and(eq(exam_legends.is_active, true), eq(exam_legends.modality, input.modality.trim().toUpperCase())));
    }),

  getBatch: protectedProcedure
    .input(z.object({ unit_id: z.number().int().positive(), studyInstanceUids: z.array(z.string().min(1)).max(100) }))
    .query(async ({ input, ctx }) => {
      if (!input.studyInstanceUids.length) return [];
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      return db.select().from(study_exam_legend_selections).where(and(
        eq(study_exam_legend_selections.unit_id, input.unit_id),
        inArray(study_exam_legend_selections.study_instance_uid, input.studyInstanceUids),
      ));
    }),

  select: protectedProcedure
    .input(z.object({ studyInstanceUid: z.string().min(1), examLegendId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCanSelect(ctx.user.role);
      const unitId = await assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const [legend] = await db.select().from(exam_legends).where(and(eq(exam_legends.id, input.examLegendId), eq(exam_legends.is_active, true))).limit(1);
      if (!legend) throw new TRPCError({ code: "NOT_FOUND", message: "Legenda ativa não encontrada." });
      const documents = await db.select().from(exam_legend_documents).where(and(eq(exam_legend_documents.exam_legend_id, legend.id), eq(exam_legend_documents.is_active, true)));
      if (!documents.length) throw new TRPCError({ code: "BAD_REQUEST", message: "A legenda selecionada não possui documentos clínicos configurados." });
      const whereSelection = and(eq(study_exam_legend_selections.study_instance_uid, input.studyInstanceUid), eq(study_exam_legend_selections.unit_id, unitId));
      const [existing] = await db.select().from(study_exam_legend_selections).where(whereSelection).limit(1);
      if (existing?.lockedAt) throw new TRPCError({ code: "CONFLICT", message: "A legenda não pode ser alterada após a primeira assinatura." });
      const snapshot = documents.sort((a, b) => a.sort_order - b.sort_order).map((item) => ({ key: item.document_key, label: item.document_label, sort_order: item.sort_order }));
      const values = {
        exam_legend_id: legend.id,
        exam_name_snapshot: legend.exam_name,
        modality_snapshot: legend.modality,
        documents_snapshot: snapshot,
        financial_event_count: legend.financial_event_count,
        selected_by: ctx.user.id,
      };
      if (existing) {
        await db.update(study_exam_legend_selections).set(values).where(eq(study_exam_legend_selections.id, existing.id));
      } else {
        await db.insert(study_exam_legend_selections).values({ study_instance_uid: input.studyInstanceUid, unit_id: unitId, ...values });
      }
      await createAuditLog({ user_id: ctx.user.id, unit_id: unitId, action: "EDIT_STUDY_METADATA", target_type: "STUDY_EXAM_LEGEND", target_id: input.studyInstanceUid });
      return { success: true, examLegendId: legend.id, examName: legend.exam_name, documentCount: snapshot.length, financialEventCount: legend.financial_event_count };
    }),
});
