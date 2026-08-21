import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import {
  billing_catalog_study_events,
  billing_doctor_modality_prices,
  billing_system_unit_prices,
  billing_unit_modality_prices,
  reports,
  study_exam_legend_selections,
} from "../drizzle/schema";
import { getDb } from "./db";

function normalizeModality(modality: string | null | undefined) {
  const normalized = (modality ?? "").trim().toUpperCase();
  return normalized === "RM" ? "MR" : normalized;
}

/**
 * Bloqueia a legenda na primeira assinatura e cria eventos financeiros somente
 * quando todos os documentos selecionados tiverem sido assinados.
 */
export async function createCatalogEventsWhenComplete(input: { studyUid: string; unitId: number; doctorUserId: number; documentKey: string; signedAt: Date }) {
  const db = await getDb();
  if (!db) return { handled: false, created: 0 };
  const candidates = await db.select().from(study_exam_legend_selections).where(and(
    eq(study_exam_legend_selections.study_instance_uid, input.studyUid),
    eq(study_exam_legend_selections.unit_id, input.unitId),
  ));
  const selection = candidates.find((item) => {
    const snapshot = item.documents_snapshot as Array<{ key: string }>;
    return snapshot.some((document) => document.key === input.documentKey);
  });
  if (!selection) return { handled: false, created: 0 };
  // Esta função é chamada após cada assinatura. A atualização condicional mantém
  // imutável o instante da primeira assinatura, inclusive se houver concorrência.
  if (!selection.lockedAt) {
    await db.update(study_exam_legend_selections).set({ lockedAt: input.signedAt }).where(and(
      eq(study_exam_legend_selections.id, selection.id),
      isNull(study_exam_legend_selections.lockedAt),
    ));
  }
  const documents = selection.documents_snapshot as Array<{ key: string }>;
  const signed = await db.select({ document_key: reports.document_key }).from(reports).where(and(
    eq(reports.study_instance_uid, input.studyUid), eq(reports.unit_id, input.unitId),
    inArray(reports.document_key, documents.map((item) => item.key)),
    inArray(reports.status, ["signed", "revised"]),
  ));
  if (new Set(signed.map((item) => item.document_key)).size < documents.length) return { handled: true, created: 0 };
  const existing = await db.select({ id: billing_catalog_study_events.id }).from(billing_catalog_study_events).where(eq(billing_catalog_study_events.study_selection_id, selection.id));
  if (existing.length) return { handled: true, created: 0 };
  const modality = normalizeModality(selection.modality_snapshot);
  const [doctorModalityPrice, unitModalityPrice, systemPrice] = await Promise.all([
    db.select().from(billing_doctor_modality_prices).where(and(
      eq(billing_doctor_modality_prices.unit_id, input.unitId),
      eq(billing_doctor_modality_prices.doctor_user_id, input.doctorUserId),
      eq(billing_doctor_modality_prices.modality, modality),
      lte(billing_doctor_modality_prices.starts_at, input.signedAt),
      or(isNull(billing_doctor_modality_prices.ends_at), gte(billing_doctor_modality_prices.ends_at, input.signedAt)),
    )).orderBy(desc(billing_doctor_modality_prices.starts_at)).limit(1),
    db.select().from(billing_unit_modality_prices).where(and(
      eq(billing_unit_modality_prices.unit_id, input.unitId),
      eq(billing_unit_modality_prices.modality, modality),
      lte(billing_unit_modality_prices.starts_at, input.signedAt),
      or(isNull(billing_unit_modality_prices.ends_at), gte(billing_unit_modality_prices.ends_at, input.signedAt)),
    )).orderBy(desc(billing_unit_modality_prices.starts_at)).limit(1),
    db.select().from(billing_system_unit_prices).where(and(
      eq(billing_system_unit_prices.unit_id, input.unitId),
      lte(billing_system_unit_prices.starts_at, input.signedAt),
      or(isNull(billing_system_unit_prices.ends_at), gte(billing_system_unit_prices.ends_at, input.signedAt)),
    )).orderBy(desc(billing_system_unit_prices.starts_at)).limit(1),
  ]);
  const doctorModalityAmount = doctorModalityPrice[0]
    ? Number(doctorModalityPrice[0].price_per_report)
    : null;
  const unitModalityAmount = unitModalityPrice[0]
    ? Number(unitModalityPrice[0].price_per_event)
    : null;
  const doctorPriceSource = doctorModalityPrice[0]
    ? "doctor_modality"
    : unitModalityPrice[0]
      ? "unit_modality_fallback"
      : null;
  const systemAmount = systemPrice[0] ? Number(systemPrice[0].price_per_report) : null;
  const doctorAmount = doctorModalityAmount ?? unitModalityAmount;
  const pricingStatus = systemAmount !== null && doctorAmount !== null
    ? "ok" as const
    : systemAmount !== null
      ? "pending_doctor_price" as const
      : doctorAmount !== null
        ? "pending_system_price" as const
        : "pending_both" as const;
  await db.insert(billing_catalog_study_events).values(Array.from({ length: selection.financial_event_count }, (_, event_index) => ({
    study_selection_id: selection.id, event_index: event_index + 1, unit_id: input.unitId, doctor_user_id: input.doctorUserId,
    exam_legend_id: selection.exam_legend_id, exam_name_snapshot: selection.exam_name_snapshot,
    modality_snapshot: modality,
    price_applied: doctorAmount !== null ? String(doctorAmount) : null,
    doctor_price_source: doctorPriceSource,
    system_price_applied: systemAmount !== null ? String(systemAmount) : null,
    system_amount_due: systemAmount !== null ? String(systemAmount) : null,
    pricing_status: pricingStatus,
    signed_at: input.signedAt,
  })));
  return { handled: true, created: selection.financial_event_count };
}
