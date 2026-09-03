import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  exam_legends,
  exam_legend_documents,
  exam_legend_unit_availability,
  studies_cache,
  study_exam_legend_selections,
} from "../../drizzle/schema";
import { assertDicomFileAccess } from "../authorization";
import { createAuditLog, getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { getSingleStudyModality, normalizeDicomModality } from "../../shared/modality";
import { studyInstanceUidSchema } from "../routerUtils";

const selectableRoles = new Set(["operador", "atendente", "medico", "admin_master"]);
type LegendRow = typeof exam_legends.$inferSelect;
type DocumentRow = typeof exam_legend_documents.$inferSelect;
type SelectionRow = typeof study_exam_legend_selections.$inferSelect;

function assertCanSelect(role: string) {
  if (!selectableRoles.has(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Somente operador, atendente, médico ou administrador podem selecionar a legenda." });
  }
}

async function getAvailableLegends(db: any, unitId: number, legendIds: number[], retainedLockedLegendIds: number[] = []): Promise<LegendRow[]> {
  const rows = await db.select({ legend: exam_legends })
    .from(exam_legends)
    .leftJoin(exam_legend_unit_availability, and(
      eq(exam_legend_unit_availability.exam_legend_id, exam_legends.id),
      eq(exam_legend_unit_availability.unit_id, unitId),
    ))
    .where(and(
      inArray(exam_legends.id, legendIds),
      eq(exam_legends.is_active, true),
      or(
        isNull(exam_legend_unit_availability.id),
        eq(exam_legend_unit_availability.is_available, true),
        ...(retainedLockedLegendIds.length ? [inArray(exam_legends.id, retainedLockedLegendIds)] : []),
      ),
    ));
  return (rows as Array<{ legend: LegendRow }>).map((row) => row.legend);
}

function snapshotDocumentKey(legendId: number, documentId: number) {
  return `legend_${legendId}_document_${documentId}`;
}

/** A modalidade da composição é sempre resolvida no servidor, nunca recebida do cliente. */
async function resolveStudyModality(db: any, studyInstanceUid: string, unitId: number): Promise<string> {
  const rows = await db.select({ modality: studies_cache.modality })
    .from(studies_cache)
    .where(and(
      eq(studies_cache.study_instance_uid, studyInstanceUid),
      eq(studies_cache.unit_id, unitId),
    ))
    .limit(1);
  const modality = getSingleStudyModality(rows[0]?.modality);
  if (!modality) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A modalidade única do estudo não está disponível para composição clínica.",
    });
  }
  return modality;
}

async function synchronizeSelections(input: {
  db: any;
  studyInstanceUid: string;
  unitId: number;
  examLegendIds: number[];
  selectedBy: number;
  studyModality: string;
}) {
  const examLegendIds = Array.from(new Set(input.examLegendIds));
  const existing: SelectionRow[] = await input.db.select().from(study_exam_legend_selections).where(and(
    eq(study_exam_legend_selections.study_instance_uid, input.studyInstanceUid),
    eq(study_exam_legend_selections.unit_id, input.unitId),
  ));
  const selectedIds = new Set(examLegendIds);
  const lockedRemoved = existing.find((selection: typeof study_exam_legend_selections.$inferSelect) => (
    selection.lockedAt && !selectedIds.has(selection.exam_legend_id)
  ));
  if (lockedRemoved) {
    throw new TRPCError({ code: "CONFLICT", message: `A legenda "${lockedRemoved.exam_name_snapshot}" não pode ser removida após a primeira assinatura.` });
  }

  const lockedLegendIds = existing.filter((selection) => selection.lockedAt && selectedIds.has(selection.exam_legend_id)).map((selection) => selection.exam_legend_id);
  const mutableLegendIds = examLegendIds.filter((legendId) => !lockedLegendIds.includes(legendId));
  const legends = mutableLegendIds.length
    ? await getAvailableLegends(input.db, input.unitId, mutableLegendIds)
    : [];
  if (legends.length !== mutableLegendIds.length) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Uma ou mais legendas não estão ativas ou não estão disponíveis para esta unidade." });
  }
  const incompatibleLegend = legends.find((legend) => normalizeDicomModality(legend.modality) !== input.studyModality);
  if (incompatibleLegend) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `A legenda "${incompatibleLegend.exam_name}" é de modalidade ${incompatibleLegend.modality}, incompatível com a modalidade do estudo (${input.studyModality}).`,
    });
  }

  const documents = mutableLegendIds.length
    ? await input.db.select().from(exam_legend_documents).where(and(
      inArray(exam_legend_documents.exam_legend_id, mutableLegendIds),
      eq(exam_legend_documents.is_active, true),
    )).orderBy(asc(exam_legend_documents.sort_order), asc(exam_legend_documents.document_label)) as DocumentRow[]
    : [];
  const documentsByLegend = new Map<number, DocumentRow[]>();
  for (const document of documents) {
    const list = documentsByLegend.get(document.exam_legend_id) ?? [];
    list.push(document);
    documentsByLegend.set(document.exam_legend_id, list);
  }
  for (const legend of legends) {
    if (!documentsByLegend.get(legend.id)?.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `A legenda "${legend.exam_name}" não possui documentos clínicos configurados.` });
    }
  }

  const existingByLegend = new Map<number, SelectionRow>(existing.map((selection) => [selection.exam_legend_id, selection]));
  await input.db.transaction(async (tx: any) => {
    const removableIds = existing
      .filter((selection: typeof study_exam_legend_selections.$inferSelect) => !selection.lockedAt && !selectedIds.has(selection.exam_legend_id))
      .map((selection: typeof study_exam_legend_selections.$inferSelect) => selection.id);
    if (removableIds.length) {
      await tx.delete(study_exam_legend_selections).where(inArray(study_exam_legend_selections.id, removableIds));
    }

    for (const legend of legends) {
      const current = existingByLegend.get(legend.id);
      if (current?.lockedAt) continue;
      const snapshot = (documentsByLegend.get(legend.id) ?? []).map((document: DocumentRow) => ({
        key: snapshotDocumentKey(legend.id, document.id),
        label: document.document_label,
        sort_order: document.sort_order,
      }));
      const values = {
        exam_legend_id: legend.id,
        exam_name_snapshot: legend.exam_name,
        modality_snapshot: legend.modality,
        documents_snapshot: snapshot,
        financial_event_count: legend.financial_event_count,
        selected_by: input.selectedBy,
      };
      if (current) {
        await tx.update(study_exam_legend_selections).set(values)
          .where(eq(study_exam_legend_selections.id, current.id));
      } else {
        await tx.insert(study_exam_legend_selections).values({
          study_instance_uid: input.studyInstanceUid,
          unit_id: input.unitId,
          ...values,
        });
      }
    }
  });

  const lockedNames = existing
    .filter((selection) => selection.lockedAt && selectedIds.has(selection.exam_legend_id))
    .map((selection) => selection.exam_name_snapshot);
  return {
    examLegendIds,
    examNames: [...lockedNames, ...legends.map((legend) => legend.exam_name)],
    removed: existing.length - existing.filter((selection: typeof study_exam_legend_selections.$inferSelect) => selectedIds.has(selection.exam_legend_id)).length,
  };
}

export const studyExamLegendRouter = router({
  listForStudy: protectedProcedure
    .input(z.object({ studyInstanceUid: studyInstanceUidSchema }))
    .query(async ({ input, ctx }) => {
      const unitId = await assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const studyModality = await resolveStudyModality(db, input.studyInstanceUid, unitId);
      return db.select({
        id: exam_legends.id,
        exam_name: exam_legends.exam_name,
        modality: exam_legends.modality,
        financial_event_count: exam_legends.financial_event_count,
      })
        .from(exam_legends)
        .leftJoin(exam_legend_unit_availability, and(
          eq(exam_legend_unit_availability.exam_legend_id, exam_legends.id),
          eq(exam_legend_unit_availability.unit_id, unitId),
        ))
        .where(and(
          eq(exam_legends.is_active, true),
          eq(exam_legends.modality, studyModality),
          or(isNull(exam_legend_unit_availability.id), eq(exam_legend_unit_availability.is_available, true)),
        ))
        .orderBy(asc(exam_legends.modality), asc(exam_legends.sort_order), asc(exam_legends.exam_name));
    }),

  getBatch: protectedProcedure
    .input(z.object({ unit_id: z.number().int().positive(), studyInstanceUids: z.array(studyInstanceUidSchema).max(100) }))
    .query(async ({ input, ctx }) => {
      if (!input.studyInstanceUids.length) return [];
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      return db.select().from(study_exam_legend_selections).where(and(
        eq(study_exam_legend_selections.unit_id, input.unit_id),
        inArray(study_exam_legend_selections.study_instance_uid, input.studyInstanceUids),
      ));
    }),

  confirmSelections: protectedProcedure
    .input(z.object({
      studyInstanceUid: studyInstanceUidSchema,
      examLegendIds: z.array(z.number().int().positive()).min(1).max(20),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCanSelect(ctx.user.role);
      const unitId = await assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const studyModality = await resolveStudyModality(db, input.studyInstanceUid, unitId);
      const result = await synchronizeSelections({
        db,
        studyInstanceUid: input.studyInstanceUid,
        unitId,
        examLegendIds: input.examLegendIds,
        selectedBy: ctx.user.id,
        studyModality,
      });
      await createAuditLog({ user_id: ctx.user.id, unit_id: unitId, action: "EDIT_STUDY_METADATA", target_type: "STUDY_EXAM_LEGEND", target_id: input.studyInstanceUid });
      return {
        success: true,
        examLegendIds: result.examLegendIds,
        examNames: result.examNames,
        documentCount: result.examLegendIds.length,
      };
    }),

  /** Compatibilidade transitória para clientes antigos: acrescenta uma legenda sem remover as existentes. */
  select: protectedProcedure
    .input(z.object({ studyInstanceUid: studyInstanceUidSchema, examLegendId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCanSelect(ctx.user.role);
      const unitId = await assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const studyModality = await resolveStudyModality(db, input.studyInstanceUid, unitId);
      const existing = await db.select({ exam_legend_id: study_exam_legend_selections.exam_legend_id })
        .from(study_exam_legend_selections)
        .where(and(
          eq(study_exam_legend_selections.study_instance_uid, input.studyInstanceUid),
          eq(study_exam_legend_selections.unit_id, unitId),
        ));
      const result = await synchronizeSelections({
        db,
        studyInstanceUid: input.studyInstanceUid,
        unitId,
        examLegendIds: [...existing.map((selection: { exam_legend_id: number }) => selection.exam_legend_id), input.examLegendId],
        selectedBy: ctx.user.id,
        studyModality,
      });
      await createAuditLog({ user_id: ctx.user.id, unit_id: unitId, action: "EDIT_STUDY_METADATA", target_type: "STUDY_EXAM_LEGEND", target_id: input.studyInstanceUid });
      return { success: true, examLegendIds: result.examLegendIds };
    }),
});
