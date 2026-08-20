import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { billing_catalog_study_events, billing_doctor_exam_legend_prices, reports, study_exam_legend_selections } from "../drizzle/schema";
import { getDb } from "./db";

/** Cria eventos do catálogo somente quando todos os documentos selecionados foram assinados. */
export async function createCatalogEventsWhenComplete(input: { studyUid: string; unitId: number; doctorUserId: number; signedAt: Date }) {
  const db = await getDb();
  if (!db) return { handled: false, created: 0 };
  const [selection] = await db.select().from(study_exam_legend_selections).where(and(
    eq(study_exam_legend_selections.study_instance_uid, input.studyUid),
    eq(study_exam_legend_selections.unit_id, input.unitId),
  )).limit(1);
  if (!selection) return { handled: false, created: 0 };
  const documents = selection.documents_snapshot as Array<{ key: string }>;
  const signed = await db.select({ document_key: reports.document_key }).from(reports).where(and(
    eq(reports.study_instance_uid, input.studyUid), eq(reports.unit_id, input.unitId),
    inArray(reports.document_key, documents.map((item) => item.key)),
    inArray(reports.status, ["signed", "revised"]),
  ));
  if (new Set(signed.map((item) => item.document_key)).size < documents.length) return { handled: true, created: 0 };
  if (!selection.lockedAt) await db.update(study_exam_legend_selections).set({ lockedAt: input.signedAt }).where(eq(study_exam_legend_selections.id, selection.id));
  const existing = await db.select({ id: billing_catalog_study_events.id }).from(billing_catalog_study_events).where(eq(billing_catalog_study_events.study_selection_id, selection.id));
  if (existing.length) return { handled: true, created: 0 };
  const [price] = await db.select().from(billing_doctor_exam_legend_prices).where(and(
    eq(billing_doctor_exam_legend_prices.unit_id, input.unitId), eq(billing_doctor_exam_legend_prices.doctor_user_id, input.doctorUserId),
    eq(billing_doctor_exam_legend_prices.exam_legend_id, selection.exam_legend_id),
    lte(billing_doctor_exam_legend_prices.starts_at, input.signedAt),
    or(isNull(billing_doctor_exam_legend_prices.ends_at), gte(billing_doctor_exam_legend_prices.ends_at, input.signedAt)),
  )).limit(1);
  await db.insert(billing_catalog_study_events).values(Array.from({ length: selection.financial_event_count }, (_, event_index) => ({
    study_selection_id: selection.id, event_index: event_index + 1, unit_id: input.unitId, doctor_user_id: input.doctorUserId,
    exam_legend_id: selection.exam_legend_id, exam_name_snapshot: selection.exam_name_snapshot,
    price_applied: price?.price_per_event ?? null, pricing_status: price ? "ok" as const : "pending_doctor_price" as const, signed_at: input.signedAt,
  })));
  return { handled: true, created: selection.financial_event_count };
}
