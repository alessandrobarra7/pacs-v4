import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  billing_catalog_study_events,
  billing_doctor_exam_legend_prices,
  billing_doctor_modality_prices,
  billing_system_unit_prices,
  billing_unit_modality_prices,
  reports,
  study_exam_legend_selections,
} from "../drizzle/schema";
import { getDb, selectActiveByVigency } from "./db";
import { normalizeDicomModality } from "../shared/modality";

/**
 * Bloqueia a legenda na primeira assinatura e cria eventos financeiros somente
 * quando todos os documentos selecionados da mesma ocorrência tiverem sido assinados.
 */
export async function createCatalogEventsWhenComplete(input: { studyUid: string; unitId: number; doctorUserId: number; documentKey: string; reportId: number; billingOccurrence: number; signedAt: Date }) {
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
    eq(reports.billing_occurrence, input.billingOccurrence),
    inArray(reports.status, ["signed", "revised"]),
  ));
  if (new Set(signed.map((item) => item.document_key)).size < documents.length) return { handled: true, created: 0 };
  const existing = await db.select({ id: billing_catalog_study_events.id }).from(billing_catalog_study_events).where(and(
    eq(billing_catalog_study_events.study_selection_id, selection.id),
    eq(billing_catalog_study_events.billing_occurrence, input.billingOccurrence),
    eq(billing_catalog_study_events.financial_status, "active"),
  ));
  if (existing.length) return { handled: true, created: 0 };
  const modality = normalizeDicomModality(selection.modality_snapshot);
  // FIX (2026-09-24, AUDITORIA_PAINEL_RESPONSAVEL_FINANCEIRO -- ponto novo
  // encontrado navegando a tela "Preços por Legenda Canônica"): essa tela
  // sempre permitiu configurar um preço por médico + unidade + legenda de
  // exame específica (billing_doctor_exam_legend_prices, via
  // setDoctorLegendPrice/listDoctorLegendPrices em financeSimple.ts), com
  // texto explícito na UI dizendo "o valor é aplicado por evento financeiro
  // da legenda". Isso nunca foi verdade: esta função (o único lugar que cria
  // billing_catalog_study_events, que são exatamente os eventos "por
  // legenda") nunca consultava essa tabela -- só usava preço por modalidade
  // do médico, com fallback para preço por modalidade da UNIDADE (nem
  // específico do médico). Ou seja, configurar um preço por legenda para um
  // médico não tinha nenhum efeito no que ele recebia; a tela existia,
  // salvava, mostrava "Configurado", mas era inerte.
  //
  // Corrigido adicionando billing_doctor_exam_legend_prices como fonte de
  // MAIOR prioridade (mais específica: médico + unidade + exame exato) na
  // hierarquia, antes do preço por modalidade. Quando não há preço de
  // legenda configurado para aquele médico+unidade+exam_legend_id vigente na
  // data da assinatura, o comportamento é idêntico ao anterior (modalidade
  // do médico, depois modalidade da unidade) -- mudança aditiva e
  // retrocompatível, não altera nenhum valor já calculado para quem nunca
  // configurou preço por legenda.
  const [doctorLegendRows, doctorModalityRows, unitModalityRows, systemPriceRows] = await Promise.all([
    db.select().from(billing_doctor_exam_legend_prices).where(and(
      eq(billing_doctor_exam_legend_prices.unit_id, input.unitId),
      eq(billing_doctor_exam_legend_prices.doctor_user_id, input.doctorUserId),
      eq(billing_doctor_exam_legend_prices.exam_legend_id, selection.exam_legend_id),
    )),
    db.select().from(billing_doctor_modality_prices).where(and(
      eq(billing_doctor_modality_prices.unit_id, input.unitId),
      eq(billing_doctor_modality_prices.doctor_user_id, input.doctorUserId),
      eq(billing_doctor_modality_prices.modality, modality),
    )),
    db.select().from(billing_unit_modality_prices).where(and(
      eq(billing_unit_modality_prices.unit_id, input.unitId),
      eq(billing_unit_modality_prices.modality, modality),
    )),
    db.select().from(billing_system_unit_prices).where(and(
      eq(billing_system_unit_prices.unit_id, input.unitId),
    )),
  ]);
  // billing_doctor_exam_legend_prices usa starts_at/ends_at do tipo `date`
  // (string), enquanto selectActiveByVigency espera `Date` -- normaliza antes
  // de reutilizar o mesmo helper de vigência usado pelas outras fontes.
  const doctorLegendRowsNormalized = doctorLegendRows.map((row) => ({
    ...row,
    starts_at: new Date(row.starts_at),
    ends_at: row.ends_at ? new Date(row.ends_at) : null,
  }));
  const doctorLegendPrice = selectActiveByVigency(doctorLegendRowsNormalized, input.signedAt);
  const doctorModalityPrice = selectActiveByVigency(doctorModalityRows, input.signedAt);
  const unitModalityPrice = selectActiveByVigency(unitModalityRows, input.signedAt);
  const systemPrice = selectActiveByVigency(systemPriceRows, input.signedAt);
  const doctorLegendAmount = doctorLegendPrice
    ? Number(doctorLegendPrice.price_per_event)
    : null;
  const doctorModalityAmount = doctorModalityPrice
    ? Number(doctorModalityPrice.price_per_report)
    : null;
  const unitModalityAmount = unitModalityPrice
    ? Number(unitModalityPrice.price_per_event)
    : null;
  const doctorPriceSource = doctorLegendPrice
    ? "doctor_legend"
    : doctorModalityPrice
      ? "doctor_modality"
      : unitModalityPrice
        ? "unit_modality_fallback"
        : null;
  const systemAmount = systemPrice ? Number(systemPrice.price_per_report) : null;
  const doctorAmount = doctorLegendAmount ?? doctorModalityAmount ?? unitModalityAmount;
  const pricingStatus = systemAmount !== null && doctorAmount !== null
    ? "ok" as const
    : systemAmount !== null
      ? "pending_doctor_price" as const
      : doctorAmount !== null
        ? "pending_system_price" as const
        : "pending_both" as const;
  await db.insert(billing_catalog_study_events).values(Array.from({ length: selection.financial_event_count }, (_, event_index) => ({
    study_selection_id: selection.id, billing_occurrence: input.billingOccurrence, event_index: event_index + 1, unit_id: input.unitId, doctor_user_id: input.doctorUserId, source_report_id: input.reportId,
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
