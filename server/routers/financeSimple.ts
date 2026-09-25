/**
 * financeSimple.ts — Módulo financeiro simplificado
 * Fonte de verdade: billing_visit_events (1 linha por laudo assinado)
 * Sem ciclos, sem summaries — queries diretas e claras.
 *
 * Desenvolvimento StudioBarra7
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { studyInstanceUidSchema } from "../routerUtils";
import {
  billing_visit_events,
  billing_cycles,
  billing_cycle_doctor_summary,
  billing_cycle_system_summary,
  users,
  units,
  financial_responsibles,
  financial_responsible_units,
  financial_responsible_users,
  user_unit_permissions,
  billing_doctor_unit_prices,
  billing_system_unit_prices,
  billing_cycle_configs,
  billing_doctor_modality_prices,
  billing_unit_modality_prices,
  billing_doctor_exam_legend_prices,
  billing_catalog_study_events,
  billing_external_sale_prices,
  exam_legends,
  study_exam_legend_selections,
  studies_cache,
  reports,
  model_layouts,
} from "../../drizzle/schema";
import { eq, and, isNull, isNotNull, ne, sql, sql as sqlFn, desc, inArray, gte, lte, or, SQL } from "drizzle-orm";
import {
  getResponsibleIdForUser,
  getResponsibleIdsForUser,
  listResponsiblesForUser,
  createBillingVisitEvent,
  getResponsibleCycleSummary,
  getResponsibleProfitHistory,
  getDoctorCycleSummary,
  getDoctorFinancialSummary,
  getDoctorCycleEvents,
  linkUnitToResponsible,
  listFinancialResponsibles,
  createFinancialResponsible,
  updateFinancialResponsible,
  getFinancialResponsibleById,
  linkUserToResponsible,
  unlinkUserFromResponsible,
  listUsersForResponsible,
  FinancialResponsibleUserLinkNotFoundError,
  listUnitsForResponsible,
  getCycleConfig,
  upsertCycleConfig,
  getAdminConsolidated,
  getDoctorMonthlySummary,
  listBillingReportItems,
  getDoctorUnitFinancialInfo,
  getDoctorOperationalBalance,
  getDoctorFullContext,
  getUnitFullContext,
  getResponsibleFullDashboard,
  getDoctorAuditReport,
  getUserById,
  getSystemOwnerLiveByUnit,
  listAllOpenCycles,
  listUnitCycles,
  listSystemPricesForUnit,
  listDoctorPricesForUnit,
  getActiveResponsibleForUnit,
  getActiveSystemPrice,
  upsertSystemUnitPrice,
  upsertDoctorUnitPrice,
  closeBillingCycle,
  closeCompetence,
  reopenCompetence,
  calculateCompetence,
  createCycleManual,
  editCycleDates,
  markDoctorCycleReceived,
  resetDoctorBilling,
  createAuditLog,
  getUserUnitPermission,
  getUserUnitPermissions,
} from "../db";
import { canAccessUnit } from "../authorization";
import { storageGetUrl } from "../storage";
import { calculateFinancialCycleDates } from "../financeCycle";

// ─── helpers monetários ─────────────────────────────────────────────────────

/**
 * Subtrai dois valores monetários com precisão de centavos.
 * Converte para inteiros (centavos), subtrai e converte de volta.
 * Evita erros de ponto flutuante: 120.50 - 120.00 = 0.50 exato.
 */
function subMoney(a: number | string, b: number | string): number {
  const centA = Math.round(Number(a) * 100);
  const centB = Math.round(Number(b) * 100);
  return (centA - centB) / 100;
}

/**
 * Converte valor do banco (string decimal do MySQL) para número seguro.
 * Usa Math.round para evitar imprecisões de representação IEEE 754.
 */
function toMoney(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return Math.round(Number(v) * 100) / 100;
}

// ─── calcCycleDates ─────────────────────────────────────────────────────────
/**
 * Calcula as datas de início e fim do ciclo de faturamento de uma unidade.
 * startDay/endDay: dias configurados na tabela units (billing_cycle_start_day/end_day)
 * refDate: qualquer data dentro do ciclo desejado (ex: "hoje")
 * Suporta ciclos que cruzam meses (ex: dia 15 ao dia 14 do mês seguinte).
 * Fallback: se startDay/endDay não configurados, usa 1→31 do mês da refDate.
 */
function calcCycleDates(
  startDay: number | null | undefined,
  endDay: number | null | undefined,
  refDate: Date
): { cycleStart: Date; cycleEnd: Date; label: string } {
  return calculateFinancialCycleDates(startDay, endDay, refDate);
}

function formatCycleCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

type UnitCycleFinancialEvent = {
  id: string;
  source: "legacy" | "catalog";
  event_id: number;
  billing_occurrence: number | null;
  source_report_id: number | null;
  doctor_user_id: number | null;
  study_instance_uid: string | null;
  report_id: number | null;
  patient_name: string | null;
  study_date: Date | null;
  study_description: string | null;
  modality: string | null;
  clinical_label: string | null;
  doctor_name: string | null;
  signed_at: Date | null;
  system_rate_applied: number | string | null;
  doctor_amount_due: number | string | null;
  system_amount_due: number | string | null;
  doctor_received_at: Date | null;
  system_paid_at: Date | null;
  pricing_status: string | null;
  financial_status: "active" | "cancelled";
};

function normalizeFinancialStatus(status: unknown): "active" | "cancelled" {
  return status === "cancelled" || status === "reversed" ? "cancelled" : "active";
}

async function listUnitCycleFinancialEvents(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  unitId: number,
  cycleStart: Date,
  cycleEnd: Date,
  includeClinicalContext = true,
): Promise<UnitCycleFinancialEvent[]> {
  const [legacyRows, catalogRows] = await Promise.all([
    db
      .select({
        event_id: billing_visit_events.id,
        billing_occurrence: sql<number | null>`NULL`,
        source_report_id: sql<number | null>`NULL`,
        study_instance_uid: billing_visit_events.study_instance_uid,
        report_id: billing_visit_events.report_id,
        modality: billing_visit_events.modality_snapshot,
        clinical_label: billing_visit_events.exam_name_snapshot,
        doctor_user_id: billing_visit_events.doctor_user_id,
        signed_at: billing_visit_events.signed_at,
        system_rate_applied: billing_visit_events.system_price_applied,
        doctor_amount_due: billing_visit_events.doctor_amount_due,
        system_amount_due: billing_visit_events.system_amount_due,
        doctor_received_at: billing_visit_events.doctor_received_at,
        system_paid_at: billing_visit_events.system_paid_at,
        pricing_status: billing_visit_events.financial_status,
        financial_status: billing_visit_events.financial_status,
      })
      .from(billing_visit_events)
      .where(and(
        eq(billing_visit_events.unit_id, unitId),
        sql`${billing_visit_events.signed_at} >= ${cycleStart}`,
        sql`${billing_visit_events.signed_at} < ${cycleEnd}`,
      )),
    db
      .select({
        event_id: billing_catalog_study_events.id,
        study_selection_id: billing_catalog_study_events.study_selection_id,
        billing_occurrence: billing_catalog_study_events.billing_occurrence,
        source_report_id: billing_catalog_study_events.source_report_id,
        report_id: sql<number | null>`NULL`,
        modality: billing_catalog_study_events.modality_snapshot,
        clinical_label: billing_catalog_study_events.exam_name_snapshot,
        doctor_user_id: billing_catalog_study_events.doctor_user_id,
        signed_at: billing_catalog_study_events.signed_at,
        system_rate_applied: billing_catalog_study_events.system_price_applied,
        doctor_amount_due: billing_catalog_study_events.price_applied,
        system_amount_due: billing_catalog_study_events.system_amount_due,
        doctor_received_at: billing_catalog_study_events.doctor_received_at,
        system_paid_at: billing_catalog_study_events.system_paid_at,
        pricing_status: billing_catalog_study_events.pricing_status,
        financial_status: billing_catalog_study_events.financial_status,
      })
      .from(billing_catalog_study_events)
      .where(and(
        eq(billing_catalog_study_events.unit_id, unitId),
        sql`${billing_catalog_study_events.signed_at} >= ${cycleStart}`,
        sql`${billing_catalog_study_events.signed_at} < ${cycleEnd}`,
      )),
  ]);

  const baseEvents = [
    ...legacyRows.map((event) => ({ ...event, id: `legacy-${event.event_id}`, source: "legacy" as const, catalog_study_instance_uid: null as string | null })),
    ...catalogRows.map((event) => ({ ...event, id: `catalog-${event.event_id}`, source: "catalog" as const, study_instance_uid: null as string | null })),
  ];

  if (!includeClinicalContext) {
    return baseEvents.map((event) => ({
      id: event.id,
      source: event.source,
      event_id: event.event_id,
      billing_occurrence: event.billing_occurrence,
      source_report_id: event.source_report_id,
      doctor_user_id: event.doctor_user_id,
      study_instance_uid: event.study_instance_uid ?? null,
      report_id: event.report_id,
      patient_name: null,
      study_date: null,
      study_description: null,
      modality: event.modality,
      clinical_label: event.clinical_label,
      doctor_name: null,
      signed_at: event.signed_at,
      system_rate_applied: event.system_rate_applied,
      doctor_amount_due: event.doctor_amount_due,
      system_amount_due: event.system_amount_due,
      doctor_received_at: event.doctor_received_at,
      system_paid_at: event.system_paid_at,
      pricing_status: event.pricing_status,
      financial_status: normalizeFinancialStatus(event.financial_status),
    })).sort((a, b) => new Date(b.signed_at ?? 0).getTime() - new Date(a.signed_at ?? 0).getTime());
  }

  const doctorIds = Array.from(new Set(baseEvents.map((event) => event.doctor_user_id).filter((id): id is number => id !== null)));
  const selectionIds = Array.from(new Set(catalogRows.map((event) => event.study_selection_id)));
  const [doctorRows, selectionRows] = await Promise.all([
    doctorIds.length > 0
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, doctorIds))
      : Promise.resolve([]),
    selectionIds.length > 0
      ? db.select({ id: study_exam_legend_selections.id, study_instance_uid: study_exam_legend_selections.study_instance_uid }).from(study_exam_legend_selections).where(inArray(study_exam_legend_selections.id, selectionIds))
      : Promise.resolve([]),
  ]);
  const doctorNameById = new Map(doctorRows.map((row) => [row.id, row.name]));
  const studyUidBySelectionId = new Map(selectionRows.map((row) => [row.id, row.study_instance_uid]));
  const studyUids = Array.from(new Set([
    ...legacyRows.map((event) => event.study_instance_uid),
    ...selectionRows.map((row) => row.study_instance_uid),
  ].filter((uid): uid is string => !!uid)));
  const studyRows = studyUids.length > 0
    ? await db.select({ study_instance_uid: studies_cache.study_instance_uid, patient_name: studies_cache.patient_name, study_date: studies_cache.study_date, study_description: studies_cache.description }).from(studies_cache).where(and(eq(studies_cache.unit_id, unitId), inArray(studies_cache.study_instance_uid, studyUids)))
    : [];
  const studyByUid = new Map(studyRows.map((row) => [row.study_instance_uid, row]));

  const events: UnitCycleFinancialEvent[] = baseEvents.map((event) => {
    const studyUid = event.source === "catalog"
      ? studyUidBySelectionId.get(event.study_selection_id)
      : event.study_instance_uid;
    const study = studyUid ? studyByUid.get(studyUid) : undefined;
    return {
      id: event.id,
      source: event.source,
      event_id: event.event_id,
      billing_occurrence: event.billing_occurrence,
      source_report_id: event.source_report_id,
      doctor_user_id: event.doctor_user_id,
      study_instance_uid: studyUid ?? null,
      report_id: event.report_id,
      patient_name: study?.patient_name ?? null,
      study_date: study?.study_date ?? null,
      study_description: study?.study_description ?? null,
      modality: event.modality,
      clinical_label: event.clinical_label,
      doctor_name: doctorNameById.get(event.doctor_user_id) ?? null,
      signed_at: event.signed_at,
      system_rate_applied: event.system_rate_applied,
      doctor_amount_due: event.doctor_amount_due,
      system_amount_due: event.system_amount_due,
      doctor_received_at: event.doctor_received_at,
      system_paid_at: event.system_paid_at,
      pricing_status: event.pricing_status,
      financial_status: normalizeFinancialStatus(event.financial_status),
    };
  });
  return events.sort((a, b) => new Date(b.signed_at ?? 0).getTime() - new Date(a.signed_at ?? 0).getTime());
}

// ─── resolveFinancialCycle ───────────────────────────────────────────────────────
/**
 * P1A — resolveFinancialCycle: única fonte de verdade para o ciclo de uma unidade.
 * Todas as procedures financeiras devem usar esta função para garantir que
 * o que aparece na tela = o que será pago no ciclo.
 * Retorna cycle_configured: false quando a unidade não tem ciclo configurado
 * (fallback para mês calendário 1→31).
 */
async function resolveFinancialCycle(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  unitId: number,
  refDate: Date
): Promise<{ startDate: Date; endDate: Date; label: string; cycle_configured: boolean }> {
  const unitRow = await db
    .select({ s: units.billing_cycle_start_day, e: units.billing_cycle_end_day })
    .from(units)
    .where(eq(units.id, unitId))
    .limit(1);
  const configured = !!(unitRow[0]?.s && unitRow[0]?.e);
  const { cycleStart, cycleEnd, label } = calcCycleDates(unitRow[0]?.s, unitRow[0]?.e, refDate);
  return { startDate: cycleStart, endDate: cycleEnd, label, cycle_configured: configured };
}

// ─── helpers ────────────────────────────────────────────────────────────────

type AllowedAdminRole = "admin_master" | "unit_admin" | "responsavel_financeiro";
const ADMIN_ROLES: AllowedAdminRole[] = ["admin_master", "unit_admin", "responsavel_financeiro"];

function assertAdmin(role: string) {
  if (!ADMIN_ROLES.includes(role as AllowedAdminRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao módulo financeiro" });
  }
}

/**
 * P4 (v50) — assertCanAccessFinancialUnit
 * Garante que o usuário tem vínculo com a unidade solicitada.
 * - admin_master: acesso irrestrito
 * - unit_admin: verifica user_unit_permissions
 * - responsavel_financeiro: verifica financial_responsible_units
 */
async function assertCanAccessFinancialUnit(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  user: { id: number; role: string },
  unitId: number
): Promise<void> {
  if (user.role === 'admin_master') return;

  if (user.role === 'unit_admin') {
    const perm = await db
      .select({ unit_id: user_unit_permissions.unit_id })
      .from(user_unit_permissions)
      .where(and(
        eq(user_unit_permissions.user_id, user.id),
        eq(user_unit_permissions.unit_id, unitId),
      ))
      .limit(1);
    if (!perm.length)
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta unidade.' });
    return;
  }

  if (user.role === 'responsavel_financeiro') {
    const responsibleIds = await getResponsibleIdsForUser(user.id);
    if (!responsibleIds.length)
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem responsável financeiro vinculado.' });
    const link = await db
      .select({ id: financial_responsible_units.id })
      .from(financial_responsible_units)
      .where(and(
        inArray(financial_responsible_units.financial_responsible_id, responsibleIds),
        eq(financial_responsible_units.unit_id, unitId),
        isNull(financial_responsible_units.ends_at),
      ))
      .limit(1);
    if (!link.length)
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta unidade não está vinculada ao seu perfil financeiro.' });
    return;
  }

  throw new TRPCError({ code: 'FORBIDDEN' });
}

/**
 * NOVO (auditoria claude/modulo-repasse-preco-externo): módulo de preço de venda externa
 * e cálculo de lucro da clínica — exclusivo de responsavel_financeiro e unit_admin.
 * admin_master é deliberadamente excluído (mesmo tendo acesso irrestrito a tudo mais no
 * módulo financeiro): o dono do sistema não tem relação com o preço que a unidade cobra
 * do próprio cliente externo, decisão confirmada explicitamente por Alessandro na coleta
 * de requisitos — não é falha de permissão, é escopo de produto.
 */
async function assertCanManageExternalSalePrice(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  user: { id: number; role: string },
  unitId: number
): Promise<void> {
  if (user.role === 'unit_admin') {
    const perm = await db
      .select({ unit_id: user_unit_permissions.unit_id })
      .from(user_unit_permissions)
      .where(and(
        eq(user_unit_permissions.user_id, user.id),
        eq(user_unit_permissions.unit_id, unitId),
      ))
      .limit(1);
    if (!perm.length)
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta unidade.' });
    return;
  }

  if (user.role === 'responsavel_financeiro') {
    const responsibleIds = await getResponsibleIdsForUser(user.id);
    if (!responsibleIds.length)
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem responsável financeiro vinculado.' });
    const link = await db
      .select({ id: financial_responsible_units.id })
      .from(financial_responsible_units)
      .where(and(
        inArray(financial_responsible_units.financial_responsible_id, responsibleIds),
        eq(financial_responsible_units.unit_id, unitId),
        isNull(financial_responsible_units.ends_at),
      ))
      .limit(1);
    if (!link.length)
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta unidade não está vinculada ao seu perfil financeiro.' });
    return;
  }

  // admin_master cai aqui também, de propósito — ver comentário da função.
  throw new TRPCError({ code: 'FORBIDDEN', message: 'Módulo exclusivo do responsável financeiro e do administrador da unidade.' });
}

/** Preços financeiros só podem ser mantidos pelo admin_master ou pelo responsável da unidade vinculada. */
async function assertCanManageFinancialPrices(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  user: { id: number; role: string },
  unitId: number,
  financialResponsibleId?: number,
): Promise<void> {
  if (user.role === 'admin_master') return;
  if (user.role !== 'responsavel_financeiro') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Somente o administrador raiz ou o responsável financeiro pode configurar preços.' });
  }
  const ownResponsibleIds = await getResponsibleIdsForUser(user.id);
  if (!ownResponsibleIds.length || (financialResponsibleId !== undefined && !ownResponsibleIds.includes(financialResponsibleId))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'O responsável financeiro não corresponde ao preço informado.' });
  }
  await assertCanAccessFinancialUnit(db, user, unitId);
}

/**
 * Resolve QUAL responsável financeiro uma tela "minha visão" (sem unit_id no
 * caminho) deve usar, agora que um usuário pode estar vinculado a mais de um
 * (decisão de produto — suporte a múltiplos responsáveis, 2026-09-17).
 *
 *  - financialResponsibleId informado: precisa estar entre os vínculos do
 *    usuário, senão FORBIDDEN — nunca confia num id vindo do cliente sem
 *    checar contra o array real.
 *  - não informado e o usuário tem exatamente 1 vínculo: usa esse (mantém o
 *    comportamento de sempre para o caso comum, sem exigir seletor).
 *  - não informado e o usuário tem 0 vínculos: retorna null (tela mostra
 *    estado vazio, como já fazia antes).
 *  - não informado e o usuário tem mais de 1 vínculo: erro explícito — o
 *    frontend deve chamar listMyResponsibles antes e pedir a seleção. Nunca
 *    escolhe implicitamente "o primeiro" aqui — foi exatamente esse tipo de
 *    resolução implícita e não determinística que causou o caso da erica.
 */
async function resolveResponsibleContext(
  user: { id: number },
  financialResponsibleId: number | undefined | null,
): Promise<number | null> {
  const ownResponsibleIds = await getResponsibleIdsForUser(user.id);
  if (financialResponsibleId !== undefined && financialResponsibleId !== null) {
    if (!ownResponsibleIds.includes(financialResponsibleId)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Este responsável financeiro não está vinculado à sua conta.' });
    }
    return financialResponsibleId;
  }
  if (ownResponsibleIds.length === 0) return null;
  if (ownResponsibleIds.length === 1) return ownResponsibleIds[0];
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Sua conta tem mais de um responsável financeiro vinculado — selecione um antes de continuar.',
  });
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

/**
 * Toda vigência de preço começa na abertura de um ciclo. Quando já há um
 * preço vigente, a nova tabela só pode iniciar em ciclo futuro, preservando
 * eventos financeiros e snapshots do ciclo atual.
 */
async function assertCycleAlignedPriceStart(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  unitId: number,
  requestedStart: Date,
  hasCurrentPrice: boolean,
): Promise<void> {
  // A primeira configuração pode ser feita durante um ciclo em andamento; ela
  // só afetará assinaturas futuras, cujos eventos preservam o valor aplicado.
  if (!hasCurrentPrice) return;
  const requestedCycle = await resolveFinancialCycle(db, unitId, requestedStart);
  if (!isSameCalendarDay(requestedStart, requestedCycle.startDate)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'O início do preço deve coincidir com o primeiro dia do ciclo financeiro da unidade.',
    });
  }
  if (hasCurrentPrice) {
    const currentCycle = await resolveFinancialCycle(db, unitId, new Date());
    if (requestedCycle.startDate.getTime() <= currentCycle.startDate.getTime()) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Uma alteração de preço já vigente deve iniciar somente em um novo ciclo financeiro.',
      });
    }
  }
}

async function assertDoctorUnitPriceStart(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  unitId: number,
  doctorUserId: number,
  startsAt: Date,
): Promise<void> {
  const activeRows = await db.select({ id: billing_doctor_unit_prices.id })
    .from(billing_doctor_unit_prices)
    .where(and(
      eq(billing_doctor_unit_prices.unit_id, unitId),
      eq(billing_doctor_unit_prices.doctor_user_id, doctorUserId),
      lte(billing_doctor_unit_prices.starts_at, new Date()),
      or(isNull(billing_doctor_unit_prices.ends_at), gte(billing_doctor_unit_prices.ends_at, new Date())),
    ))
    .limit(1);
  await assertCycleAlignedPriceStart(db, unitId, startsAt, activeRows.length > 0);
}

/** Retorna as unidades financeiras que podem compor consultas agregadas do usuário. */
async function getAuthorizedFinancialUnitIds(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  user: { id: number; role: string; unit_id?: number | null },
): Promise<number[] | null> {
  if (user.role === 'admin_master') return null;

  if (user.role === 'unit_admin') {
    const permissions = await db
      .select({ unit_id: user_unit_permissions.unit_id })
      .from(user_unit_permissions)
      .where(eq(user_unit_permissions.user_id, user.id));
    const ids = permissions.map((permission) => permission.unit_id);
    if (user.unit_id) ids.push(user.unit_id);
    return Array.from(new Set(ids));
  }

  if (user.role === 'responsavel_financeiro') {
    const responsibleIds = await getResponsibleIdsForUser(user.id);
    if (!responsibleIds.length) return [];
    const links = await db
      .select({ unit_id: financial_responsible_units.unit_id })
      .from(financial_responsible_units)
      .where(and(
        inArray(financial_responsible_units.financial_responsible_id, responsibleIds),
        isNull(financial_responsible_units.ends_at),
      ));
    return Array.from(new Set(links.map((link) => link.unit_id)));
  }

  return [];
}

function assertMedico(role: string) {
  if (role !== "medico" && role !== "admin_master") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a médicos" });
  }
}

// ─── router ─────────────────────────────────────────────────────────────────

export const financeSimpleRouter = router({

  /**
   * Dashboard — cards de resumo para admin/responsável
   * Retorna totais gerais: laudos do mês, pendentes sistema, pendentes médicos
   */
  dashboard: protectedProcedure
    .input(z.object({
      reference_date: z.string().datetime().optional(), // ISO string; default = hoje
    }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      // P1E: dashboard usa ciclo real por unidade.
      // Busca todas as unidades relevantes e calcula o ciclo de cada uma.

      const unitScope = await getAuthorizedFinancialUnitIds(db, ctx.user); // null = todas
      if (unitScope?.length === 0) {
        return {
          total_laudos: 0, system_total: 0, doctor_total: 0,
          system_paid: 0, doctor_paid: 0, system_pending: 0, doctor_pending: 0,
          system_pending_count: 0, doctor_pending_count: 0,
        };
      }

      const allUnitsRows = await db
        .select({ id: units.id, s: units.billing_cycle_start_day, e: units.billing_cycle_end_day })
        .from(units)
        .where(unitScope ? inArray(units.id, unitScope) : undefined);

      if (allUnitsRows.length === 0) {
        return {
          total_laudos: 0, system_total: 0, doctor_total: 0,
          system_paid: 0, doctor_paid: 0, system_pending: 0, doctor_pending: 0,
          system_pending_count: 0, doctor_pending_count: 0,
        };
      }

      // Calcular ciclo de cada unidade e agregar resultados
      const perUnitResults = await Promise.all(
        allUnitsRows.map(async (u) => {
          const { cycleStart, cycleEnd } = calcCycleDates(u.s, u.e, refDate);
          const r = await db
            .select({
              total_laudos: sql<number>`COUNT(*)`,
              system_total: sql<number>`COALESCE(SUM(${billing_visit_events.system_amount_due}), 0)`,
              doctor_total: sql<number>`COALESCE(SUM(${billing_visit_events.doctor_amount_due}), 0)`,
              system_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.system_paid_at} IS NOT NULL THEN ${billing_visit_events.system_amount_due} ELSE 0 END), 0)`,
              doctor_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.doctor_received_at} IS NOT NULL THEN ${billing_visit_events.doctor_amount_due} ELSE 0 END), 0)`,
              system_pending_count: sql<number>`SUM(CASE WHEN ${billing_visit_events.system_paid_at} IS NULL THEN 1 ELSE 0 END)`,
              doctor_pending_count: sql<number>`SUM(CASE WHEN ${billing_visit_events.doctor_received_at} IS NULL THEN 1 ELSE 0 END)`,
            })
            .from(billing_visit_events)
            .where(and(
              eq(billing_visit_events.unit_id, u.id),
              sql`${billing_visit_events.signed_at} >= ${cycleStart}`,
              sql`${billing_visit_events.signed_at} < ${cycleEnd}`,
              ne(billing_visit_events.financial_status, 'cancelled'), // P8D
            ));
          return r[0];
        })
      );

      // Agregar todos os resultados
      const rows = [{
        total_laudos: perUnitResults.reduce((s, r) => s + Number(r?.total_laudos ?? 0), 0),
        system_total: perUnitResults.reduce((s, r) => s + Number(r?.system_total ?? 0), 0),
        doctor_total: perUnitResults.reduce((s, r) => s + Number(r?.doctor_total ?? 0), 0),
        system_paid: perUnitResults.reduce((s, r) => s + Number(r?.system_paid ?? 0), 0),
        doctor_paid: perUnitResults.reduce((s, r) => s + Number(r?.doctor_paid ?? 0), 0),
        system_pending_count: perUnitResults.reduce((s, r) => s + Number(r?.system_pending_count ?? 0), 0),
        doctor_pending_count: perUnitResults.reduce((s, r) => s + Number(r?.doctor_pending_count ?? 0), 0),
      }];

      const r = rows[0];
      return {
        total_laudos: Number(r.total_laudos),
        system_total: toMoney(r.system_total),
        doctor_total: toMoney(r.doctor_total),
        system_paid: toMoney(r.system_paid),
        doctor_paid: toMoney(r.doctor_paid),
        system_pending: subMoney(r.system_total, r.system_paid),   // FIX float
        doctor_pending: subMoney(r.doctor_total, r.doctor_paid),   // FIX float
        system_pending_count: Number(r.system_pending_count),
        doctor_pending_count: Number(r.doctor_pending_count),
      };
    }),

  /**
   * Lista de laudos por unidade — para a tela de Pagamentos
   * Agrupa por unidade, retorna totais e status de pagamento
   */
  /**
   * Visão consolidada extra do administrador — faturamento externo do ciclo
   * atual (REAL, mesmo cálculo do unitProfitCalculator, agregado entre todas
   * as unidades autorizadas) + médicos com laudo faturável nos últimos 30
   * dias + fluxo mensal histórico (últimos 6 meses com ciclo fechado).
   *
   * O fluxo mensal é ESTIMATIVA na parte de receita externa, pelo mesmo
   * motivo e mesma técnica de getResponsibleProfitHistory (server/db.ts):
   * não existe registro histórico de receita externa, só do que foi devido
   * ao sistema e aos médicos. Decisão do usuário 2026-09-18, mesma já
   * aplicada ao gráfico do responsável.
   */
  financialOverviewExtras: protectedProcedure
    .query(async ({ ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const unitScope = await getAuthorizedFinancialUnitIds(db, ctx.user); // null = todas
      const scopedUnitsRows = await db
        .select({ id: units.id })
        .from(units)
        .where(unitScope ? inArray(units.id, unitScope) : undefined);
      const unitIds = scopedUnitsRows.map((u) => u.id);
      if (unitIds.length === 0) {
        return { external_revenue_current: 0, active_doctors: 0, monthly_flow: [] };
      }

      // ── Faturamento externo do ciclo atual (REAL) ──────────────────────
      let externalRevenueCurrent = 0;
      const activeDoctorIds = new Set<number>();
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      for (const unitId of unitIds) {
        const { startDate, endDate } = await resolveFinancialCycle(db, unitId, now);
        const [eventRows, priceRows] = await Promise.all([
          db.select({
            exam_legend_id: billing_catalog_study_events.exam_legend_id,
            signed_at: billing_catalog_study_events.signed_at,
          }).from(billing_catalog_study_events)
            .where(and(
              eq(billing_catalog_study_events.unit_id, unitId),
              eq(billing_catalog_study_events.financial_status, "active"),
              sql`${billing_catalog_study_events.signed_at} >= ${startDate}`,
              sql`${billing_catalog_study_events.signed_at} < ${endDate}`,
            )),
          db.select({
            exam_legend_id: billing_external_sale_prices.exam_legend_id,
            price_external: billing_external_sale_prices.price_external,
            starts_at: billing_external_sale_prices.starts_at,
            ends_at: billing_external_sale_prices.ends_at,
          }).from(billing_external_sale_prices)
            .where(and(
              eq(billing_external_sale_prices.unit_id, unitId),
              sql`${billing_external_sale_prices.starts_at} < ${endDate}`,
              or(isNull(billing_external_sale_prices.ends_at), sql`${billing_external_sale_prices.ends_at} >= ${startDate}`),
            )),
        ]);
        const byLegend = new Map<number, typeof priceRows>();
        for (const p of priceRows) {
          const list = byLegend.get(p.exam_legend_id) ?? [];
          list.push(p);
          byLegend.set(p.exam_legend_id, list);
        }
        for (const event of eventRows) {
          const candidates = byLegend.get(event.exam_legend_id);
          const match = candidates?.find((p) => p.starts_at <= event.signed_at && (p.ends_at === null || p.ends_at > event.signed_at));
          if (match) externalRevenueCurrent += toMoney(match.price_external);
        }

        const [recentLegacy, recentCatalog] = await Promise.all([
          db.select({ doctor_user_id: billing_visit_events.doctor_user_id })
            .from(billing_visit_events)
            .where(and(
              eq(billing_visit_events.unit_id, unitId),
              ne(billing_visit_events.financial_status, "cancelled"),
              sql`${billing_visit_events.signed_at} >= ${thirtyDaysAgo}`,
            )),
          db.select({ doctor_user_id: billing_catalog_study_events.doctor_user_id })
            .from(billing_catalog_study_events)
            .where(and(
              eq(billing_catalog_study_events.unit_id, unitId),
              eq(billing_catalog_study_events.financial_status, "active"),
              sql`${billing_catalog_study_events.signed_at} >= ${thirtyDaysAgo}`,
            )),
        ]);
        for (const r of [...recentLegacy, ...recentCatalog]) {
          if (r.doctor_user_id != null) activeDoctorIds.add(r.doctor_user_id);
        }
      }

      // ── Fluxo mensal histórico (ciclos fechados, agrupados por mês) ────
      const systemCycles = await db.select({
        unit_id: billing_cycle_system_summary.unit_id,
        amount_due: billing_cycle_system_summary.amount_due,
        cycle_id: billing_cycles.id,
        starts_at: billing_cycles.starts_at,
        ends_at: billing_cycles.ends_at,
      }).from(billing_cycle_system_summary)
        .innerJoin(billing_cycles, eq(billing_cycle_system_summary.system_cycle_id, billing_cycles.id))
        .where(and(
          inArray(billing_cycle_system_summary.unit_id, unitIds),
          eq(billing_cycles.status, "closed"),
        ))
        .orderBy(desc(billing_cycles.ends_at));

      const doctorCycles = await db.select({
        unit_id: billing_cycle_doctor_summary.unit_id,
        amount_due: billing_cycle_doctor_summary.amount_due,
        doctor_cycle_id: billing_cycle_doctor_summary.doctor_cycle_id,
      }).from(billing_cycle_doctor_summary)
        .innerJoin(billing_cycles, eq(billing_cycle_doctor_summary.doctor_cycle_id, billing_cycles.id))
        .where(and(
          inArray(billing_cycle_doctor_summary.unit_id, unitIds),
          eq(billing_cycles.status, "closed"),
        ));

      const currentPrices = await db.select({
        unit_id: billing_external_sale_prices.unit_id,
        exam_legend_id: billing_external_sale_prices.exam_legend_id,
        price_external: billing_external_sale_prices.price_external,
      }).from(billing_external_sale_prices)
        .where(isNull(billing_external_sale_prices.ends_at));
      const priceByUnitLegend = new Map<string, number>();
      for (const p of currentPrices) priceByUnitLegend.set(`${p.unit_id}:${p.exam_legend_id}`, toMoney(p.price_external));

      const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthlyAgg = new Map<string, { month_label: string; system_cost: number; doctor_cost: number; estimated_revenue: number }>();

      for (const cycle of systemCycles) {
        const start = new Date(cycle.starts_at);
        const key = monthKey(start);
        const entry = monthlyAgg.get(key) ?? {
          month_label: start.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
          system_cost: 0, doctor_cost: 0, estimated_revenue: 0,
        };
        entry.system_cost += toMoney(cycle.amount_due);

        const eventRows = await db.select({ exam_legend_id: billing_catalog_study_events.exam_legend_id })
          .from(billing_catalog_study_events)
          .where(and(
            eq(billing_catalog_study_events.unit_id, cycle.unit_id),
            eq(billing_catalog_study_events.financial_status, "active"),
            sql`${billing_catalog_study_events.signed_at} >= ${cycle.starts_at}`,
            sql`${billing_catalog_study_events.signed_at} < ${cycle.ends_at}`,
          ));
        for (const event of eventRows) {
          const price = priceByUnitLegend.get(`${cycle.unit_id}:${event.exam_legend_id}`);
          if (price !== undefined) entry.estimated_revenue += price;
        }

        const doctorCost = doctorCycles
          .filter((d) => d.unit_id === cycle.unit_id && d.doctor_cycle_id === cycle.cycle_id)
          .reduce((sum, d) => sum + toMoney(d.amount_due), 0);
        entry.doctor_cost += doctorCost;

        monthlyAgg.set(key, entry);
      }

      const monthlyFlow = Array.from(monthlyAgg.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        .map(([, v]) => ({
          month_label: v.month_label,
          system_cost: Math.round(v.system_cost * 100) / 100,
          doctor_cost: Math.round(v.doctor_cost * 100) / 100,
          estimated_revenue: Math.round(v.estimated_revenue * 100) / 100,
          price_basis: "current" as const,
        }));

      return {
        external_revenue_current: toMoney(externalRevenueCurrent),
        active_doctors: activeDoctorIds.size,
        monthly_flow: monthlyFlow,
      };
    }),

  unitSummary: protectedProcedure
    .input(z.object({
      reference_date: z.string().datetime().optional(),
      responsible_id: z.number().int().optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      // P1D: unitSummary usa ciclo real por unidade (resolveFinancialCycle via calcCycleDates).

      // Filtro de unidades pela autoridade real do usuário financeiro.
      const authorizedUnitIds = await getAuthorizedFinancialUnitIds(db, ctx.user);
      if (authorizedUnitIds?.length === 0) return [];
      let unitIdFilter: ReturnType<typeof eq> | ReturnType<typeof inArray> | undefined = authorizedUnitIds
        ? inArray(units.id, authorizedUnitIds)
        : undefined;

      // Filtro opcional por responsável financeiro
      if (input.responsible_id) {
        const linkedUnits = await db
          .select({ unit_id: financial_responsible_units.unit_id })
          .from(financial_responsible_units)
          .where(eq(financial_responsible_units.financial_responsible_id, input.responsible_id));
        const respUnitIds = linkedUnits.map(u => u.unit_id);
        if (respUnitIds.length === 0) return [];
        unitIdFilter = unitIdFilter
          ? and(unitIdFilter, inArray(units.id, respUnitIds)) as ReturnType<typeof eq>
          : inArray(units.id, respUnitIds) as ReturnType<typeof eq>;
      }
      // P1D: Buscar todas as unidades no escopo com seus ciclos
      const unitsInScope = await db
        .select({ id: units.id, name: units.name, s: units.billing_cycle_start_day, e: units.billing_cycle_end_day })
        .from(units)
        .where(unitIdFilter)
        .orderBy(units.name);

      if (unitsInScope.length === 0) return [];

      // Para cada unidade, buscar eventos dentro do seu ciclo real
      const perUnitRows = await Promise.all(
        unitsInScope.map(async (u) => {
          const { cycleStart, cycleEnd, label: cycle_label } = calcCycleDates(u.s, u.e, refDate);
          const events = await listUnitCycleFinancialEvents(db, u.id, cycleStart, cycleEnd, false);
          const activeEvents = events.filter((event) => event.financial_status === 'active');
          const historicalRateCounts = new Map<number, number>();
          for (const event of activeEvents) {
            if (event.system_rate_applied === null || event.system_rate_applied === undefined) continue;
            const rate = toMoney(event.system_rate_applied);
            historicalRateCounts.set(rate, (historicalRateCounts.get(rate) ?? 0) + 1);
          }
          const historical_system_rates = Array.from(historicalRateCounts.entries())
            .sort(([left], [right]) => left - right)
            .map(([rate, event_count]) => ({ rate, event_count }));
          return {
            unit_id: u.id,
            unit_name: u.name ?? "Unidade",
            cycle_label,
            cycle_start_date: cycleStart.toISOString(),
            cycle_end_date: cycleEnd.toISOString(),
            historical_system_rates,
            has_multiple_system_rates: historical_system_rates.length > 1,
            total_laudos: activeEvents.length,
            system_total: toMoney(activeEvents.reduce((total, event) => total + toMoney(event.system_amount_due), 0)),
            doctor_total: toMoney(activeEvents.reduce((total, event) => total + toMoney(event.doctor_amount_due), 0)),
            system_paid: toMoney(activeEvents.filter((event) => event.system_paid_at).reduce((total, event) => total + toMoney(event.system_amount_due), 0)),
            doctor_paid: toMoney(activeEvents.filter((event) => event.doctor_received_at).reduce((total, event) => total + toMoney(event.doctor_amount_due), 0)),
            system_pending_count: activeEvents.filter((event) => !event.system_paid_at && (event.source === "legacy" || event.system_amount_due !== null)).length,
            doctor_pending_count: activeEvents.filter((event) => !event.doctor_received_at && (event.source === "legacy" || event.doctor_amount_due !== null)).length,
          };
        })
      );

      return perUnitRows.map((r) => ({
        unit_id: r.unit_id,
        unit_name: r.unit_name,
        cycle_label: r.cycle_label,
        cycle_start_date: r.cycle_start_date,
        cycle_end_date: r.cycle_end_date,
        historical_system_rates: r.historical_system_rates,
        has_multiple_system_rates: r.has_multiple_system_rates,
        total_laudos: Number(r.total_laudos),
        system_total: toMoney(r.system_total),
        doctor_total: toMoney(r.doctor_total),
        system_paid: toMoney(r.system_paid),
        doctor_paid: toMoney(r.doctor_paid),
        system_pending: subMoney(r.system_total, r.system_paid),
        doctor_pending: subMoney(r.doctor_total, r.doctor_paid),
        system_pending_count: Number(r.system_pending_count),
        doctor_pending_count: Number(r.doctor_pending_count),
      }));
    }),

  /**
   * Médicos de uma unidade — para a tela de Pagamentos (drill-down)
   */
  doctorSummaryByUnit: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      reference_date: z.string().datetime().optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id); // P4

      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      // Busca ciclo configurado para esta unidade
      const unitRow = await db.select({
        s: units.billing_cycle_start_day,
        e: units.billing_cycle_end_day,
      }).from(units).where(eq(units.id, input.unit_id)).limit(1);
      const { cycleStart: startDate, cycleEnd: endDate, label: cycle_label } =
        calcCycleDates(unitRow[0]?.s, unitRow[0]?.e, refDate);

      const [legacyRows, catalogRows] = await Promise.all([
        db
        .select({
          doctor_user_id: billing_visit_events.doctor_user_id,
          doctor_name: users.name,
          total_laudos: sql<number>`COUNT(*)`,
          doctor_total: sql<number>`COALESCE(SUM(${billing_visit_events.doctor_amount_due}), 0)`,
          doctor_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.doctor_received_at} IS NOT NULL THEN ${billing_visit_events.doctor_amount_due} ELSE 0 END), 0)`,
          doctor_pending_count: sql<number>`SUM(CASE WHEN ${billing_visit_events.doctor_received_at} IS NULL THEN 1 ELSE 0 END)`,
          // FIX (2026-09-24, bloqueio 2 da revisao Manus): conta separadamente
          // quantos laudos deste medico JA TEM preco aplicado (doctor_amount_due
          // nao nulo) -- necessario para nao dividir o total pelo numero TOTAL
          // de laudos (que inclui os ainda sem preco, "pending_doctor_price"),
          // o que mascarava pendencia de precificacao tratando-a como preco
          // zero dentro da media exibida.
          doctor_priced_count: sql<number>`SUM(CASE WHEN ${billing_visit_events.doctor_amount_due} IS NOT NULL THEN 1 ELSE 0 END)`,
          last_received_at: sql<Date | null>`MAX(${billing_visit_events.doctor_received_at})`,
        })
        .from(billing_visit_events)
        .leftJoin(users, eq(users.id, billing_visit_events.doctor_user_id))
        .where(
          and(
            eq(billing_visit_events.unit_id, input.unit_id),
            sql`${billing_visit_events.signed_at} >= ${startDate}`,
            sql`${billing_visit_events.signed_at} < ${endDate}`,
            ne(billing_visit_events.financial_status, 'cancelled'), // P8D
          )
        )
        .groupBy(billing_visit_events.doctor_user_id, users.name)
        .orderBy(users.name),
        db
          .select({
            doctor_user_id: billing_catalog_study_events.doctor_user_id,
            doctor_name: users.name,
            total_laudos: sql<number>`COUNT(*)`,
            doctor_total: sql<number>`COALESCE(SUM(${billing_catalog_study_events.price_applied}), 0)`,
            doctor_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_catalog_study_events.doctor_received_at} IS NOT NULL THEN ${billing_catalog_study_events.price_applied} ELSE 0 END), 0)`,
            doctor_pending_count: sql<number>`COALESCE(SUM(CASE WHEN ${billing_catalog_study_events.doctor_received_at} IS NULL AND ${billing_catalog_study_events.price_applied} IS NOT NULL THEN 1 ELSE 0 END), 0)`,
            // Ver comentario equivalente na query de legacyRows acima.
            doctor_priced_count: sql<number>`COALESCE(SUM(CASE WHEN ${billing_catalog_study_events.price_applied} IS NOT NULL THEN 1 ELSE 0 END), 0)`,
            last_received_at: sql<Date | null>`MAX(${billing_catalog_study_events.doctor_received_at})`,
          })
          .from(billing_catalog_study_events)
          .leftJoin(users, eq(users.id, billing_catalog_study_events.doctor_user_id))
          .where(and(
            eq(billing_catalog_study_events.unit_id, input.unit_id),
            sql`${billing_catalog_study_events.signed_at} >= ${startDate}`,
            sql`${billing_catalog_study_events.signed_at} < ${endDate}`,
            eq(billing_catalog_study_events.financial_status, 'active'),
          ))
          .groupBy(billing_catalog_study_events.doctor_user_id, users.name)
          .orderBy(users.name),
      ]);
      const summaryByDoctor = new Map<number, {
        doctor_user_id: number;
        doctor_name: string;
        total_laudos: number;
        doctor_total: number;
        doctor_paid: number;
        doctor_pending_count: number;
        doctor_priced_count: number;
        last_received_at: Date | null;
      }>();
      for (const row of legacyRows) {
        if (row.doctor_user_id === null) continue;
        summaryByDoctor.set(row.doctor_user_id, {
          doctor_user_id: row.doctor_user_id,
          doctor_name: row.doctor_name ?? "Médico",
          total_laudos: Number(row.total_laudos),
          doctor_total: toMoney(row.doctor_total),
          doctor_paid: toMoney(row.doctor_paid),
          doctor_pending_count: Number(row.doctor_pending_count),
          doctor_priced_count: Number(row.doctor_priced_count),
          last_received_at: row.last_received_at,
        });
      }
      for (const row of catalogRows) {
        if (row.doctor_user_id === null) continue;
        const current = summaryByDoctor.get(row.doctor_user_id);
        summaryByDoctor.set(row.doctor_user_id, {
          doctor_user_id: row.doctor_user_id,
          doctor_name: current?.doctor_name ?? row.doctor_name ?? "Médico",
          total_laudos: (current?.total_laudos ?? 0) + Number(row.total_laudos),
          doctor_total: (current?.doctor_total ?? 0) + toMoney(row.doctor_total),
          doctor_paid: (current?.doctor_paid ?? 0) + toMoney(row.doctor_paid),
          doctor_pending_count: (current?.doctor_pending_count ?? 0) + Number(row.doctor_pending_count),
          doctor_priced_count: (current?.doctor_priced_count ?? 0) + Number(row.doctor_priced_count),
          last_received_at: [current?.last_received_at, row.last_received_at]
            .filter((value): value is Date => value instanceof Date)
            .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
        });
      }
      const rows = Array.from(summaryByDoctor.values())
        .sort((a, b) => a.doctor_name.localeCompare(b.doctor_name, "pt-BR"));

      // Buscar preços configurados para cada médico nesta unidade
      const doctorIds = rows.map((r) => r.doctor_user_id).filter((id): id is number => id !== null);
      let priceMap = new Map<number, number | null>();
      if (doctorIds.length > 0) {
        const priceRows = await db
          .select({
            doctor_user_id: billing_doctor_unit_prices.doctor_user_id,
            price_per_report: billing_doctor_unit_prices.price_per_report,
          })
          .from(billing_doctor_unit_prices)
          .where(
            and(
              eq(billing_doctor_unit_prices.unit_id, input.unit_id),
              inArray(billing_doctor_unit_prices.doctor_user_id, doctorIds),
              isNull(billing_doctor_unit_prices.ends_at),
            )
          )
          .orderBy(desc(billing_doctor_unit_prices.starts_at));
        // Manter apenas o preço mais recente por médico
        for (const pr of priceRows) {
          if (!priceMap.has(pr.doctor_user_id)) {
            priceMap.set(pr.doctor_user_id, pr.price_per_report ? Number(pr.price_per_report) : null);
          }
        }
      }

      return rows.map((r) => {
        // FIX (AUDITORIA_PAINEL_RESPONSAVEL_FINANCEIRO_2026-09-24, Achado 4,
        // e bloqueio 2 da revisao Manus em 2026-09-24):
        // price_per_report vinha do preco ATUALMENTE configurado
        // (billing_doctor_unit_prices), desacoplado de doctor_total /
        // total_laudos -- que sao somas dos valores REALMENTE aplicados em
        // cada evento no momento da assinatura. A primeira correcao dividiu
        // doctor_total por total_laudos, mas a Manus apontou dois problemas
        // nisso: (1) total_laudos inclui laudos AINDA SEM preco aplicado
        // (pending_doctor_price), que entram no total como se fossem preco
        // zero, distorcendo a media para baixo e escondendo a pendencia; e
        // (2) uma media de 2 casas decimais nao garante
        // preco_exibido * quantidade == total (ex.: R$0,87 em 2 laudos vira
        // R$0,44/laudo, que multiplicado por 2 da R$0,88, nao R$0,87) -- a
        // tela nao deve prometer essa igualdade.
        //
        // Correcao: o denominador passa a ser SOMENTE os laudos que ja tem
        // preco aplicado (doctor_priced_count), nunca total_laudos. O
        // resultado e exposto como price_per_report (mantido por
        // compatibilidade com o frontend existente) mas deve ser entendido
        // e rotulado no frontend como MEDIA EFETIVA do periodo, nao como uma
        // tarifa fixa exata -- ver pending_price_count abaixo para o
        // frontend sinalizar quando parte dos laudos ainda nao tem preco.
        const pendingPriceCount = r.total_laudos - r.doctor_priced_count;
        const derivedPricePerReport = r.doctor_priced_count > 0
          ? toMoney(r.doctor_total / r.doctor_priced_count)
          : (r.doctor_user_id ? (priceMap.get(r.doctor_user_id) ?? null) : null);
        return {
          doctor_user_id: r.doctor_user_id,
          doctor_name: r.doctor_name,
          total_laudos: Number(r.total_laudos),
          doctor_total: toMoney(r.doctor_total),
          doctor_paid: toMoney(r.doctor_paid),
          doctor_pending: subMoney(r.doctor_total, r.doctor_paid),   // FIX float
          doctor_pending_count: Number(r.doctor_pending_count),
          last_received_at: r.last_received_at,
          // Média efetiva do período (Total ÷ Laudos já precificados) — não
          // é necessariamente igual ao preço configurado hoje, nem
          // necessariamente multiplica de volta para o total exato quando
          // há mais de uma tarifa aplicada no período (arredondamento de
          // centavos). Ver priced_laudos_count / pending_price_count.
          price_per_report: derivedPricePerReport,
          // Quantos dos total_laudos já têm preço aplicado (entraram no
          // cálculo acima) vs. quantos ainda estão pendentes de
          // precificação (não entram no denominador, não são tratados como
          // preço zero).
          priced_laudos_count: r.doctor_priced_count,
          pending_price_count: pendingPriceCount,
          // Preco atualmente configurado (pode divergir do price_per_report
          // acima quando o preco mudou durante o ciclo) -- exposto para quem
          // quiser mostrar os dois lado a lado.
          configured_price_per_report: r.doctor_user_id ? (priceMap.get(r.doctor_user_id) ?? null) : null,
        };
      });
    }),

  /**
   * Laudos individuais de um médico em uma unidade — para drill-down completo
   */
  eventsByDoctorUnit: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      doctor_user_id: z.number().int(),
      reference_date: z.string().datetime().optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id); // P4

      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      const unitRow = await db.select({
        s: units.billing_cycle_start_day,
        e: units.billing_cycle_end_day,
      }).from(units).where(eq(units.id, input.unit_id)).limit(1);
      const { cycleStart: startDate, cycleEnd: endDate } =
        calcCycleDates(unitRow[0]?.s, unitRow[0]?.e, refDate);

      const events = await listUnitCycleFinancialEvents(db, input.unit_id, startDate, endDate, true);
      return events
        .filter((event) => event.doctor_user_id === input.doctor_user_id && event.financial_status === "active")
        .map((event) => ({
          id: event.id,
          report_id: event.report_id,
          patient_name: event.patient_name,
          study_date: event.study_date,
          modality_snapshot: event.modality,
          exam_name_snapshot: event.clinical_label,
          system_amount_due: event.system_amount_due,
          doctor_amount_due: event.doctor_amount_due,
          doctor_received_at: event.doctor_received_at,
          system_paid_at: event.system_paid_at,
          signed_at: event.signed_at,
          source: event.source,
        }));
    }),

  /**
   * Trilha auditável dos eventos que formam os indicadores financeiros de uma unidade.
   * Não recalcula nem altera eventos: somente expõe sua origem clínica, valores e baixas.
   */
  auditEventsByUnit: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      reference_date: z.string().datetime().optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const authorizedUnitIds = await getAuthorizedFinancialUnitIds(db, ctx.user);
      if (authorizedUnitIds && !authorizedUnitIds.includes(input.unit_id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso financeiro a esta unidade." });
      }

      const [unit] = await db
        .select({ id: units.id, billing_cycle_start_day: units.billing_cycle_start_day, billing_cycle_end_day: units.billing_cycle_end_day })
        .from(units)
        .where(eq(units.id, input.unit_id))
        .limit(1);
      if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "Unidade não encontrada." });

      const referenceDate = input.reference_date ? new Date(input.reference_date) : new Date();
      const { cycleStart, cycleEnd, label: cycle_label } = calcCycleDates(
        unit.billing_cycle_start_day,
        unit.billing_cycle_end_day,
        referenceDate,
      );

      const events = await listUnitCycleFinancialEvents(db, input.unit_id, cycleStart, cycleEnd);

      return { cycle_label, cycle_start_date: cycleStart, cycle_end_date: cycleEnd, events };
    }),

  /**
   * Marcar pagamento ao médico como realizado (em lote por unidade+médico+mês)
   */
  markDoctorPaid: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      doctor_user_id: z.number().int(),
      reference_date: z.string().datetime().optional(),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id); // P4
      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      // P1F: usar resolveFinancialCycle para garantir ciclo reall
      const { startDate, endDate } = await resolveFinancialCycle(db, input.unit_id, refDate);
      const now = new Date();
      await Promise.all([
        db
          .update(billing_visit_events)
          .set({ doctor_received_at: now, doctor_received_by_user_id: ctx.user.id })
          .where(
          and(
            eq(billing_visit_events.unit_id, input.unit_id),
            eq(billing_visit_events.doctor_user_id, input.doctor_user_id),
            sql`${billing_visit_events.signed_at} >= ${startDate}`,
            sql`${billing_visit_events.signed_at} < ${endDate}`,
            isNull(billing_visit_events.doctor_received_at),
            eq(billing_visit_events.financial_status, 'active'),
          )
          ),
        db
          .update(billing_catalog_study_events)
          .set({ doctor_received_at: now, doctor_received_by_user_id: ctx.user.id, doctor_payment_note: input.note ?? null })
          .where(and(
            eq(billing_catalog_study_events.unit_id, input.unit_id),
            eq(billing_catalog_study_events.doctor_user_id, input.doctor_user_id),
            sql`${billing_catalog_study_events.signed_at} >= ${startDate}`,
            sql`${billing_catalog_study_events.signed_at} < ${endDate}`,
            isNotNull(billing_catalog_study_events.price_applied),
            isNull(billing_catalog_study_events.doctor_received_at),
            eq(billing_catalog_study_events.financial_status, 'active'),
          )),
      ]);

      return { success: true, paid_at: now };
    }),

  // ─── NOVO (auditoria claude/modulo-repasse-preco-externo) ──────────────────
  // Confirmação do médico sobre repasse marcado como pago + módulo de preço de
  // venda externa / cálculo de lucro, exclusivo de responsavel_financeiro e unit_admin.

  /**
   * Médico confirma ou contesta um repasse já marcado como pago pela clínica.
   * Uma resposta só, não editável depois — se precisar corrigir, é decisão humana
   * fora do sistema (igual a qualquer divergência financeira real).
   */
  confirmDoctorPayment: protectedProcedure
    .input(z.object({
      event_type: z.enum(["legacy", "catalog"]),
      event_id: z.number().int(),
      status: z.enum(["confirmed", "disputed"]),
      note: z.string().max(500).optional(),
    }).refine((data) => data.status !== "disputed" || (data.note && data.note.trim().length >= 3), {
      message: "Descreva brevemente o motivo da contestação.",
      path: ["note"],
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "medico") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Somente o próprio médico pode confirmar um repasse." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const table = input.event_type === "legacy" ? billing_visit_events : billing_catalog_study_events;
      const [event] = await db
        .select({
          id: table.id,
          doctor_user_id: table.doctor_user_id,
          doctor_received_at: table.doctor_received_at,
          doctor_confirmation_status: table.doctor_confirmation_status,
        })
        .from(table)
        .where(eq(table.id, input.event_id))
        .limit(1);

      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      if (event.doctor_user_id !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Este repasse não pertence a você." });
      }
      if (!event.doctor_received_at) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este repasse ainda não foi marcado como pago pela clínica." });
      }
      if (event.doctor_confirmation_status) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este repasse já foi respondido." });
      }

      const now = new Date();
      // CORREÇÃO (revisão independente Manus, 2026-09-17): a checagem acima (select +
      // depois update) tinha uma janela de corrida — duas requisições concorrentes podiam
      // ler doctor_confirmation_status nulo e a segunda sobrescrever a resposta definitiva
      // da primeira. A condição de nulidade agora vai NO PRÓPRIO UPDATE, então só a
      // requisição que efetivamente encontrar a linha ainda nula consegue gravar; a outra
      // atualiza zero linhas e recebe erro explícito, sem sobrescrever status/data/nota.
      const updateResult = await db
        .update(table)
        .set({
          doctor_confirmation_status: input.status,
          doctor_confirmed_at: now,
          doctor_confirmation_note: input.note ?? null,
        })
        .where(and(eq(table.id, input.event_id), isNull(table.doctor_confirmation_status)));

      if ((updateResult[0] as { affectedRows: number }).affectedRows === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este repasse já foi respondido." });
      }

      await createAuditLog({
        user_id: ctx.user.id,
        unit_id: null,
        action: input.status === "confirmed" ? "DOCTOR_PAYMENT_CONFIRMED" : "DOCTOR_PAYMENT_DISPUTED",
        target_type: input.event_type === "legacy" ? "BILLING_VISIT_EVENT" : "BILLING_CATALOG_STUDY_EVENT",
        target_id: String(input.event_id),
        ip_address: ctx.req.ip,
        user_agent: ctx.req.headers['user-agent'],
        metadata: { note: input.note ?? null },
      });

      return { success: true, status: input.status, confirmed_at: now };
    }),

  /**
   * Repasses ao médico marcados como contestados — visão do responsável financeiro
   * e do unit_admin da unidade, para resolver fora do sistema. admin_master também
   * enxerga (é uma questão de confiança/operação, não de preço de venda externa).
   */
  listDoctorPaymentDisputes: protectedProcedure
    .input(z.object({ unit_id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id);

      const [legacyRows, catalogRows] = await Promise.all([
        db.select({
          id: billing_visit_events.id,
          doctor_user_id: billing_visit_events.doctor_user_id,
          doctor_name: sql<string>`(SELECT name FROM users WHERE id = ${billing_visit_events.doctor_user_id} LIMIT 1)`,
          amount: billing_visit_events.doctor_amount_due,
          note: billing_visit_events.doctor_confirmation_note,
          confirmed_at: billing_visit_events.doctor_confirmed_at,
          patient_name: billing_visit_events.patient_name,
        })
          .from(billing_visit_events)
          .where(and(
            eq(billing_visit_events.unit_id, input.unit_id),
            eq(billing_visit_events.doctor_confirmation_status, "disputed"),
          )),
        db.select({
          id: billing_catalog_study_events.id,
          doctor_user_id: billing_catalog_study_events.doctor_user_id,
          doctor_name: sql<string>`(SELECT name FROM users WHERE id = ${billing_catalog_study_events.doctor_user_id} LIMIT 1)`,
          amount: billing_catalog_study_events.price_applied,
          note: billing_catalog_study_events.doctor_confirmation_note,
          confirmed_at: billing_catalog_study_events.doctor_confirmed_at,
          patient_name: sql<string | null>`NULL`,
        })
          .from(billing_catalog_study_events)
          .where(and(
            eq(billing_catalog_study_events.unit_id, input.unit_id),
            eq(billing_catalog_study_events.doctor_confirmation_status, "disputed"),
          )),
      ]);

      return [
        ...legacyRows.map((r) => ({ ...r, source: "legacy" as const, amount: toMoney(r.amount) })),
        ...catalogRows.map((r) => ({ ...r, source: "catalog" as const, amount: toMoney(r.amount) })),
      ].sort((a, b) => (b.confirmed_at?.getTime() ?? 0) - (a.confirmed_at?.getTime() ?? 0));
    }),

  /**
   * Preço de venda externa por legenda de exame — lista o catálogo inteiro da unidade
   * com o preço vigente quando existir, ou null quando ainda não foi configurado
   * (configuração é opcional; nunca assume zero).
   */
  listExternalSalePrices: protectedProcedure
    .input(z.object({ unit_id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanManageExternalSalePrice(db, ctx.user, input.unit_id);

      const now = new Date();
      const [legends, activePrices] = await Promise.all([
        db.select({ id: exam_legends.id, exam_name: exam_legends.exam_name, modality: exam_legends.modality })
          .from(exam_legends)
          .where(eq(exam_legends.is_active, true))
          .orderBy(exam_legends.modality, exam_legends.exam_name),
        db.select({
          exam_legend_id: billing_external_sale_prices.exam_legend_id,
          price_external: billing_external_sale_prices.price_external,
          starts_at: billing_external_sale_prices.starts_at,
        })
          .from(billing_external_sale_prices)
          .where(and(
            eq(billing_external_sale_prices.unit_id, input.unit_id),
            lte(billing_external_sale_prices.starts_at, now),
            or(isNull(billing_external_sale_prices.ends_at), gte(billing_external_sale_prices.ends_at, now)),
          )),
      ]);

      const priceByLegend = new Map(activePrices.map((p) => [p.exam_legend_id, p]));
      return legends.map((legend) => {
        const active = priceByLegend.get(legend.id);
        return {
          exam_legend_id: legend.id,
          exam_name: legend.exam_name,
          modality: legend.modality,
          price_external: active ? toMoney(active.price_external) : null,
          configured: Boolean(active),
        };
      });
    }),

  /**
   * Define (ou substitui) o preço de venda externa vigente de uma legenda de exame
   * para a unidade. Encerra a vigência anterior em vez de sobrescrever, preservando
   * histórico auditável — mesmo padrão de billing_unit_modality_prices.
   */
  setExternalSalePrice: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      exam_legend_id: z.number().int(),
      price_external: z.number().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanManageExternalSalePrice(db, ctx.user, input.unit_id);

      // CORREÇÃO (revisão independente Manus, 2026-09-17): a interface só oferece legendas
      // ativas, mas o endpoint aceitava qualquer exam_legend_id — uma chamada direta podia
      // gravar preço para legenda inexistente/inativa, sem FK que impedisse o registro órfão.
      // Mesmo padrão já usado em setDoctorLegendPrice.
      const legend = await db.select({ id: exam_legends.id })
        .from(exam_legends)
        .where(and(eq(exam_legends.id, input.exam_legend_id), eq(exam_legends.is_active, true)))
        .limit(1);
      if (!legend[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Legenda de exame ativa não encontrada." });
      }

      const now = new Date();
      await db
        .update(billing_external_sale_prices)
        .set({ ends_at: now })
        .where(and(
          eq(billing_external_sale_prices.unit_id, input.unit_id),
          eq(billing_external_sale_prices.exam_legend_id, input.exam_legend_id),
          isNull(billing_external_sale_prices.ends_at),
        ));

      await db.insert(billing_external_sale_prices).values({
        unit_id: input.unit_id,
        exam_legend_id: input.exam_legend_id,
        price_external: String(input.price_external),
        starts_at: now,
        created_by: ctx.user.id,
      });

      await createAuditLog({
        user_id: ctx.user.id,
        unit_id: input.unit_id,
        action: "SET_EXTERNAL_SALE_PRICE",
        target_type: "EXAM_LEGEND",
        target_id: String(input.exam_legend_id),
        ip_address: ctx.req.ip,
        user_agent: ctx.req.headers['user-agent'],
        metadata: { price_external: input.price_external },
      });

      return { success: true };
    }),

  /**
   * Calculadora de lucro da clínica por legenda de exame, no ciclo real da unidade:
   * caixa recebido (laudos emitidos × preço externo) menos repasse ao sistema menos
   * repasse ao médico, reaproveitando os valores já calculados por evento em
   * billing_catalog_study_events. Legendas sem preço externo configurado ficam de
   * fora do cálculo de lucro (não entram como zero) e são listadas à parte.
   */
  unitProfitCalculator: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      reference_date: z.string().datetime().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanManageExternalSalePrice(db, ctx.user, input.unit_id);

      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      const { startDate, endDate, label } = await resolveFinancialCycle(db, input.unit_id, refDate);

      // CORREÇÃO (revisão independente Manus, 2026-09-17): a versão anterior buscava só o
      // preço externo VIGENTE HOJE e aplicava esse único valor a todos os eventos do ciclo —
      // se o preço mudasse no meio do ciclo, laudos já emitidos antes da mudança passavam a
      // usar o novo valor retroativamente, o que não é auditável e contradiz o próprio
      // propósito de guardar starts_at/ends_at. Decisão registrada no handoff (Opção A):
      // cada evento usa o preço cuja vigência CONTÉM O signed_at DAQUELE EVENTO — igual ao
      // que já acontece com system_amount_due/price_applied, que são travados no instante da
      // assinatura. Por isso a query busca eventos individuais (não agregados por legenda) e
      // TODAS as vigências de preço que tocam o ciclo, e a correspondência é feita aqui, por
      // evento. Consequência esperada e correta: se o preço só foi configurado no meio do
      // ciclo, a mesma legenda pode aparecer em `by_exam` (eventos assinados depois) e em
      // `unconfigured_exams` (eventos assinados antes) ao mesmo tempo — isso é intencional,
      // não um bug de agrupamento.
      const [eventRows, priceRows] = await Promise.all([
        db.select({
          exam_legend_id: billing_catalog_study_events.exam_legend_id,
          exam_name: billing_catalog_study_events.exam_name_snapshot,
          signed_at: billing_catalog_study_events.signed_at,
          system_amount_due: billing_catalog_study_events.system_amount_due,
          price_applied: billing_catalog_study_events.price_applied,
        })
          .from(billing_catalog_study_events)
          .where(and(
            eq(billing_catalog_study_events.unit_id, input.unit_id),
            eq(billing_catalog_study_events.financial_status, "active"),
            sql`${billing_catalog_study_events.signed_at} >= ${startDate}`,
            sql`${billing_catalog_study_events.signed_at} < ${endDate}`,
          )),
        // Todas as vigências que tocam o ciclo, não só a vigente agora — precisamos
        // resolver o preço correto para cada signed_at individualmente, inclusive para
        // eventos assinados antes de uma mudança de preço já ocorrida.
        db.select({
          exam_legend_id: billing_external_sale_prices.exam_legend_id,
          price_external: billing_external_sale_prices.price_external,
          starts_at: billing_external_sale_prices.starts_at,
          ends_at: billing_external_sale_prices.ends_at,
        })
          .from(billing_external_sale_prices)
          .where(and(
            eq(billing_external_sale_prices.unit_id, input.unit_id),
            sql`${billing_external_sale_prices.starts_at} < ${endDate}`,
            or(isNull(billing_external_sale_prices.ends_at), sql`${billing_external_sale_prices.ends_at} >= ${startDate}`),
          )),
      ]);

      const pricesByLegend = new Map<number, typeof priceRows>();
      for (const price of priceRows) {
        const list = pricesByLegend.get(price.exam_legend_id) ?? [];
        list.push(price);
        pricesByLegend.set(price.exam_legend_id, list);
      }
      function resolvePriceForSignedAt(examLegendId: number, signedAt: Date): number | undefined {
        const candidates = pricesByLegend.get(examLegendId);
        if (!candidates) return undefined;
        const match = candidates.find((p) =>
          p.starts_at <= signedAt && (p.ends_at === null || p.ends_at > signedAt)
        );
        return match ? toMoney(match.price_external) : undefined;
      }

      type ConfiguredRow = { exam_legend_id: number; exam_name: string; units_sold: number; price_external: number; cash_received: number; system_repasse: number; doctor_repasse: number; profit: number };
      const configuredByKey = new Map<string, ConfiguredRow>();
      const unconfiguredByLegend = new Map<number, { exam_legend_id: number; exam_name: string; units_sold: number }>();

      for (const event of eventRows) {
        const priceExternal = resolvePriceForSignedAt(event.exam_legend_id, event.signed_at);
        const systemRepasse = toMoney(event.system_amount_due);
        const doctorRepasse = toMoney(event.price_applied);
        if (priceExternal === undefined) {
          const current = unconfiguredByLegend.get(event.exam_legend_id) ?? { exam_legend_id: event.exam_legend_id, exam_name: event.exam_name, units_sold: 0 };
          current.units_sold += 1;
          unconfiguredByLegend.set(event.exam_legend_id, current);
          continue;
        }
        // A mesma legenda pode ter mais de um preço vigente dentro do ciclo (mudança
        // intra-ciclo) — chave por legenda+preço para não misturar cash_received de
        // vigências diferentes na mesma linha.
        const key = `${event.exam_legend_id}:${priceExternal}`;
        const current = configuredByKey.get(key) ?? {
          exam_legend_id: event.exam_legend_id,
          exam_name: event.exam_name,
          units_sold: 0,
          price_external: priceExternal,
          cash_received: 0,
          system_repasse: 0,
          doctor_repasse: 0,
          profit: 0,
        };
        current.units_sold += 1;
        current.cash_received = subMoney(current.cash_received + priceExternal, 0);
        current.system_repasse = subMoney(current.system_repasse + systemRepasse, 0);
        current.doctor_repasse = subMoney(current.doctor_repasse + doctorRepasse, 0);
        current.profit = subMoney(subMoney(current.cash_received, current.system_repasse), current.doctor_repasse);
        configuredByKey.set(key, current);
      }

      const configured = Array.from(configuredByKey.values());
      const unconfigured = Array.from(unconfiguredByLegend.values());

      const totals = configured.reduce((acc, row) => ({
        cash_received: acc.cash_received + row.cash_received,
        system_repasse: acc.system_repasse + row.system_repasse,
        doctor_repasse: acc.doctor_repasse + row.doctor_repasse,
        profit: acc.profit + row.profit,
      }), { cash_received: 0, system_repasse: 0, doctor_repasse: 0, profit: 0 });

      return { cycle_label: label, cycle_start_date: startDate, cycle_end_date: endDate, by_exam: configured, unconfigured_exams: unconfigured, totals };
    }),

  /**
   * Marcar pagamento ao sistema como realizado (em lote por unidade+mês)
   */
    markSystemPaid: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      reference_date: z.string().datetime().optional(),
      note: z.string().max(500).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin_master") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Somente o administrador geral pode confirmar o recebimento da obrigação da unidade com a LAUDS." });
        }
        const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id); // P7: só unidades autorizadas

      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      // P1F: usar resolveFinancialCycle para garantir ciclo real
      const { startDate, endDate } = await resolveFinancialCycle(db, input.unit_id, refDate);
      const now = new Date();
      await Promise.all([
        db
          .update(billing_visit_events)
          .set({ system_paid_at: now, system_paid_by_user_id: ctx.user.id })
          .where(
          and(
            eq(billing_visit_events.unit_id, input.unit_id),
            sql`${billing_visit_events.signed_at} >= ${startDate}`,
            sql`${billing_visit_events.signed_at} < ${endDate}`,
            isNull(billing_visit_events.system_paid_at),
            eq(billing_visit_events.financial_status, 'active'),
          )
          ),
        db
          .update(billing_catalog_study_events)
          .set({ system_paid_at: now, system_paid_by_user_id: ctx.user.id, system_payment_note: input.note ?? null })
          .where(and(
            eq(billing_catalog_study_events.unit_id, input.unit_id),
            sql`${billing_catalog_study_events.signed_at} >= ${startDate}`,
            sql`${billing_catalog_study_events.signed_at} < ${endDate}`,
            isNotNull(billing_catalog_study_events.system_amount_due),
            isNull(billing_catalog_study_events.system_paid_at),
            eq(billing_catalog_study_events.financial_status, 'active'),
          )),
      ]);

      return { success: true, paid_at: now };
    }),

  /**
   * Unidades financeiras do médico logado. A seleção explícita é obrigatória
   * na interface para impedir consolidação acidental entre hospitais.
   */
  myFinanceiroUnits: protectedProcedure
    .query(async ({ ctx }) => {
      assertMedico(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (ctx.user.role === 'admin_master') return [];
      const permissions = await getUserUnitPermissions(ctx.user.id);
      const unitIds = permissions
        .filter((permission) => permission.view_financial)
        .map((permission) => permission.unit_id);
      if (unitIds.length === 0) return [];

      return db
        .select({
          unit_id: units.id,
          unit_name: units.name,
          cycle_start_day: units.billing_cycle_start_day,
          cycle_end_day: units.billing_cycle_end_day,
        })
        .from(units)
        .where(inArray(units.id, unitIds))
        .orderBy(units.name);
    }),

  /**
   * Períodos anteriores do médico — ciclos já fechados (billing_cycle_doctor_summary),
   * em todas as unidades. O ciclo vigente NÃO aparece aqui (vem de myFinanceiro).
   */
  myPastCycles: protectedProcedure
    .query(async ({ ctx }) => {
      assertMedico(ctx.user.role);
      return await getDoctorCycleSummary(ctx.user.id);
    }),

  /** Preços vigentes do próprio médico no contexto de uma única unidade. */
  myModalityPrices: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      reference_date: z.string().datetime().optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertMedico(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (ctx.user.role !== 'admin_master') {
        const permissions = await getUserUnitPermissions(ctx.user.id);
        const allowed = permissions.some((permission) =>
          permission.unit_id === input.unit_id && permission.view_financial,
        );
        if (!allowed) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso financeiro a esta unidade.' });
        }
      }

      const referenceDate = input.reference_date ? new Date(input.reference_date) : new Date();
      const [doctorRows, unitRows] = await Promise.all([
        db
          .select({
            modality: billing_doctor_modality_prices.modality,
            price_per_report: billing_doctor_modality_prices.price_per_report,
            starts_at: billing_doctor_modality_prices.starts_at,
            ends_at: billing_doctor_modality_prices.ends_at,
          })
          .from(billing_doctor_modality_prices)
          .where(and(
            eq(billing_doctor_modality_prices.doctor_user_id, ctx.user.id),
            eq(billing_doctor_modality_prices.unit_id, input.unit_id),
            lte(billing_doctor_modality_prices.starts_at, referenceDate),
            or(
              isNull(billing_doctor_modality_prices.ends_at),
              gte(billing_doctor_modality_prices.ends_at, referenceDate),
            ),
          ))
          .orderBy(desc(billing_doctor_modality_prices.starts_at)),
        db
          .select({
            modality: billing_unit_modality_prices.modality,
            price_per_event: billing_unit_modality_prices.price_per_event,
            starts_at: billing_unit_modality_prices.starts_at,
            ends_at: billing_unit_modality_prices.ends_at,
          })
          .from(billing_unit_modality_prices)
          .where(and(
            eq(billing_unit_modality_prices.unit_id, input.unit_id),
            lte(billing_unit_modality_prices.starts_at, referenceDate),
            or(
              isNull(billing_unit_modality_prices.ends_at),
              gte(billing_unit_modality_prices.ends_at, referenceDate),
            ),
          ))
          .orderBy(desc(billing_unit_modality_prices.starts_at)),
      ]);
      const normalizeModality = (modality: string) => {
        const normalized = modality.trim().toUpperCase();
        return normalized === "RM" ? "MR" : normalized;
      };
      const doctorByModality = new Map<string, typeof doctorRows[number]>();
      const unitByModality = new Map<string, typeof unitRows[number]>();
      for (const row of doctorRows) {
        const modality = normalizeModality(row.modality);
        if (!doctorByModality.has(modality)) doctorByModality.set(modality, row);
      }
      for (const row of unitRows) {
        const modality = normalizeModality(row.modality);
        if (!unitByModality.has(modality)) unitByModality.set(modality, row);
      }
      return ["CT", "CR", "MR", "US"].map((modality) => {
        const individual = doctorByModality.get(modality);
        const fallback = unitByModality.get(modality);
        if (individual) {
          return { modality, price_per_report: toMoney(individual.price_per_report), source: "individual" as const, source_label: "Valor individual definido para você", starts_at: individual.starts_at, ends_at: individual.ends_at };
        }
        if (fallback) {
          return { modality, price_per_report: toMoney(fallback.price_per_event), source: "unit_modality_fallback" as const, source_label: "Valor padrão da unidade", starts_at: fallback.starts_at, ends_at: fallback.ends_at };
        }
        return { modality, price_per_report: null, source: "unconfigured" as const, source_label: "Sem valor configurado", starts_at: null, ends_at: null };
      });
    }),

  /**
   * Meu Financeiro — extrato do médico logado para uma única unidade.
   */
  myFinanceiro: protectedProcedure
    .input(z.object({
      reference_date: z.string().datetime().optional(),
      unit_id: z.number().int(),
    }))
    .query(async ({ input, ctx }) => {
      assertMedico(ctx.user.role);
      // Guard: médico precisa ter view_financial em pelo menos uma unidade
      // FIX: usar getUserUnitPermissions (plural) para checar todas as unidades
      // ctx.user.unit_id é campo legado — pode ser null ou apontar para unidade errada
      if (ctx.user.role !== 'admin_master') {
        const allPerms = await getUserUnitPermissions(ctx.user.id);
        const hasFinancial = allPerms.some(p => p.view_financial);
        if (!hasFinancial) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Sem permissão para visualizar financeiro.',
          });
        }
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // P1B: myFinanceiro usa ciclo real por unidade (resolveFinancialCycle).
      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();

      // FIX ANALISE_GERACAO_DADOS P3: filtrar unitRows por permissão view_financial ativa
      // Sem esse filtro, um médico que perdeu a permissão ainda vê dados de unidades antigas
      let allowedUnitIds: number[] | null = null;
      if (ctx.user.role !== 'admin_master') {
        const allPerms = await getUserUnitPermissions(ctx.user.id);
        allowedUnitIds = allPerms
          .filter(p => p.view_financial)
          .map(p => p.unit_id);
        if (!allowedUnitIds.includes(input.unit_id)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso financeiro a esta unidade.' });
        }
      }

      // O contexto é sempre a unidade solicitada, inclusive quando ela possui
      // apenas eventos do catálogo clínico-financeiro e nenhum evento legado.
      const unitRowsQuery = db
        .select({ id: units.id, name: units.name, s: units.billing_cycle_start_day, e: units.billing_cycle_end_day })
        .from(units)
        .where(eq(units.id, input.unit_id))
        .orderBy(units.name);

      const unitRows = allowedUnitIds !== null
        ? (await unitRowsQuery).filter(u => allowedUnitIds!.includes(u.id))
        : await unitRowsQuery;
      const scopedUnitRows = unitRows.filter((unit) => unit.id === input.unit_id);

      // Para cada unidade, buscar resumo dentro do ciclo real
      const summaryRaw = await Promise.all(
        scopedUnitRows.map(async (u) => {
          const { cycleStart, cycleEnd, label: cycle_label } = calcCycleDates(u.s, u.e, refDate);
          const [legacyRows, catalogRows] = await Promise.all([
            db.select({
              total_laudos: sql<number>`COUNT(*)`,
              doctor_total: sql<number>`COALESCE(SUM(${billing_visit_events.doctor_amount_due}), 0)`,
              doctor_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.doctor_received_at} IS NOT NULL THEN ${billing_visit_events.doctor_amount_due} ELSE 0 END), 0)`,
              last_received_at: sql<Date | null>`MAX(${billing_visit_events.doctor_received_at})`,
            })
              .from(billing_visit_events)
              .where(and(
                eq(billing_visit_events.doctor_user_id, ctx.user.id),
                eq(billing_visit_events.unit_id, u.id),
                sql`${billing_visit_events.signed_at} >= ${cycleStart}`,
                sql`${billing_visit_events.signed_at} < ${cycleEnd}`,
                ne(billing_visit_events.financial_status, 'cancelled'), // P8D
              )),
            db.select({
              total_eventos: sql<number>`COUNT(*)`,
              doctor_total: sql<number>`COALESCE(SUM(${billing_catalog_study_events.price_applied}), 0)`,
              doctor_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_catalog_study_events.doctor_received_at} IS NOT NULL THEN ${billing_catalog_study_events.price_applied} ELSE 0 END), 0)`,
              last_received_at: sql<Date | null>`MAX(${billing_catalog_study_events.doctor_received_at})`,
            })
              .from(billing_catalog_study_events)
              .where(and(
                eq(billing_catalog_study_events.doctor_user_id, ctx.user.id),
                eq(billing_catalog_study_events.unit_id, u.id),
                sql`${billing_catalog_study_events.signed_at} >= ${cycleStart}`,
                sql`${billing_catalog_study_events.signed_at} < ${cycleEnd}`,
                eq(billing_catalog_study_events.financial_status, 'active'),
              )),
          ]);
          const legacy = legacyRows[0];
          const catalog = catalogRows[0];
          return {
            unit_id: u.id,
            unit_name: u.name ?? "Unidade",
            cycle_start_day: u.s ?? 1,
            cycle_end_day: u.e ?? 31,
            cycle_label,
            cycle_start_date: cycleStart.toISOString(),
            cycle_end_date: cycleEnd.toISOString(),
            cycle_start_display: formatCycleCalendarDate(cycleStart),
            cycle_end_display: formatCycleCalendarDate(new Date(cycleEnd.getTime() - 1)),
            total_laudos: Number(legacy?.total_laudos ?? 0) + Number(catalog?.total_eventos ?? 0),
            doctor_total: Number(legacy?.doctor_total ?? 0) + Number(catalog?.doctor_total ?? 0),
            doctor_paid: toMoney(legacy?.doctor_paid) + toMoney(catalog?.doctor_paid),
            last_received_at: [legacy?.last_received_at, catalog?.last_received_at]
              .filter((value): value is Date => value instanceof Date)
              .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
          };
        })
      );
      const summary = summaryRaw;

      // Laudos individuais: buscar por unidade dentro do ciclo real
      const legacyEventsPerUnit = await Promise.all(
        scopedUnitRows.map(async (u) => {
          const { cycleStart, cycleEnd } = calcCycleDates(u.s, u.e, refDate);
          return db
            .select({
              id: billing_visit_events.id,
              unit_id: billing_visit_events.unit_id,
              unit_name: units.name,
              patient_name: billing_visit_events.patient_name,
              study_date: billing_visit_events.study_date,
              modality_snapshot: billing_visit_events.modality_snapshot,
              exam_name_snapshot: billing_visit_events.exam_name_snapshot,
              doctor_amount_due: billing_visit_events.doctor_amount_due,
              doctor_received_at: billing_visit_events.doctor_received_at,
              doctor_received_by_user_id: billing_visit_events.doctor_received_by_user_id,
              /** P6A: nome de quem marcou pago (subquery) */
              paid_by_name: sql<string | null>`(SELECT u2.name FROM users u2 WHERE u2.id = ${billing_visit_events.doctor_received_by_user_id} LIMIT 1)`,
              /** NOVO (claude/modulo-repasse-preco-externo): confirmação do próprio médico. */
              doctor_confirmation_status: billing_visit_events.doctor_confirmation_status,
              doctor_confirmed_at: billing_visit_events.doctor_confirmed_at,
              doctor_confirmation_note: billing_visit_events.doctor_confirmation_note,
              event_source: sql<"legacy">`'legacy'`,
              pricing_status: billing_visit_events.pricing_status,
              signed_at: billing_visit_events.signed_at,
            })
            .from(billing_visit_events)
            .leftJoin(units, eq(units.id, billing_visit_events.unit_id))
            .where(and(
              eq(billing_visit_events.doctor_user_id, ctx.user.id),
              eq(billing_visit_events.unit_id, u.id),
              sql`${billing_visit_events.signed_at} >= ${cycleStart}`,
              sql`${billing_visit_events.signed_at} < ${cycleEnd}`,
              ne(billing_visit_events.financial_status, 'cancelled'), // P8D
            ))
            .orderBy(desc(billing_visit_events.signed_at));
        })
      );
      const catalogEventsPerUnit = await Promise.all(
        scopedUnitRows.map(async (u) => {
          const { cycleStart, cycleEnd } = calcCycleDates(u.s, u.e, refDate);
          return db
            .select({
              id: billing_catalog_study_events.id,
              unit_id: billing_catalog_study_events.unit_id,
              unit_name: units.name,
              patient_name: studies_cache.patient_name,
              study_date: studies_cache.study_date,
              modality_snapshot: study_exam_legend_selections.modality_snapshot,
              exam_name_snapshot: billing_catalog_study_events.exam_name_snapshot,
              doctor_amount_due: billing_catalog_study_events.price_applied,
              doctor_received_at: billing_catalog_study_events.doctor_received_at,
              doctor_received_by_user_id: billing_catalog_study_events.doctor_received_by_user_id,
              paid_by_name: sql<string | null>`(SELECT u2.name FROM users u2 WHERE u2.id = ${billing_catalog_study_events.doctor_received_by_user_id} LIMIT 1)`,
              /** NOVO (claude/modulo-repasse-preco-externo): confirmação do próprio médico. */
              doctor_confirmation_status: billing_catalog_study_events.doctor_confirmation_status,
              doctor_confirmed_at: billing_catalog_study_events.doctor_confirmed_at,
              doctor_confirmation_note: billing_catalog_study_events.doctor_confirmation_note,
              event_source: sql<"catalog">`'catalog'`,
              pricing_status: billing_catalog_study_events.pricing_status,
              signed_at: billing_catalog_study_events.signed_at,
            })
            .from(billing_catalog_study_events)
            .innerJoin(study_exam_legend_selections, eq(
              study_exam_legend_selections.id,
              billing_catalog_study_events.study_selection_id,
            ))
            .leftJoin(studies_cache, and(
              eq(studies_cache.study_instance_uid, study_exam_legend_selections.study_instance_uid),
              eq(studies_cache.unit_id, billing_catalog_study_events.unit_id),
            ))
            .leftJoin(units, eq(units.id, billing_catalog_study_events.unit_id))
            .where(and(
              eq(billing_catalog_study_events.doctor_user_id, ctx.user.id),
              eq(billing_catalog_study_events.unit_id, u.id),
              sql`${billing_catalog_study_events.signed_at} >= ${cycleStart}`,
              sql`${billing_catalog_study_events.signed_at} < ${cycleEnd}`,
              eq(billing_catalog_study_events.financial_status, 'active'),
            ))
            .orderBy(desc(billing_catalog_study_events.signed_at));
        })
      );
      const events = [
        ...legacyEventsPerUnit.flat().map((event) => ({ ...event, source: "legacy" as const })),
        ...catalogEventsPerUnit.flat().map((event) => ({
          ...event,
          id: `catalog-${event.id}`,
          source: "catalog" as const,
        })),
      ].sort((a, b) =>
        new Date(b.signed_at ?? 0).getTime() - new Date(a.signed_at ?? 0).getTime()
      );

      const canViewOwnReports = await canAccessUnit(ctx.user, input.unit_id, "view_studies");
      const canDownloadOwnReports = canViewOwnReports
        && await canAccessUnit(ctx.user, input.unit_id, "print_reports");

      // Documentos clínicos entregues pelo próprio médico. Esta lista não usa
      // eventos financeiros como substituto do laudo: um exame composto pode
      // ter vários documentos e uma única ocorrência de cobrança. A leitura é
      // limitada à unidade selecionada, ao médico logado e ao ciclo consultado.
      const deliveredReports = canViewOwnReports ? (await Promise.all(
        scopedUnitRows.map(async (u) => {
          const { cycleStart, cycleEnd } = calcCycleDates(u.s, u.e, refDate);
          return db
            .select({
              id: reports.id,
              unit_id: reports.unit_id,
              unit_name: units.name,
              study_instance_uid: reports.study_instance_uid,
              document_key: reports.document_key,
              patient_name: studies_cache.patient_name,
              modality: studies_cache.modality,
              study_description: studies_cache.description,
              document_label: reports.document_label_snapshot,
              status: reports.status,
              signed_at: reports.signedAt,
              export_file_url: reports.export_file_url,
              author_user_id: reports.author_user_id,
              signed_by: reports.signedBy,
            })
            .from(reports)
            .leftJoin(studies_cache, and(
              eq(studies_cache.study_instance_uid, reports.study_instance_uid),
              eq(studies_cache.unit_id, reports.unit_id),
            ))
            .leftJoin(units, eq(units.id, reports.unit_id))
            .where(and(
              eq(reports.unit_id, u.id),
              or(
                eq(reports.author_user_id, ctx.user.id),
                eq(reports.signedBy, ctx.user.id),
              ),
              isNotNull(reports.signedAt),
              sql`${reports.signedAt} >= ${cycleStart}`,
              sql`${reports.signedAt} < ${cycleEnd}`,
              inArray(reports.status, ["signed", "revised", "cancelled"]),
            ))
            .orderBy(desc(reports.signedAt));
        })
      )).flat() : [];

      // A resposta entrega somente o alvo mínimo para a impressão configurada
      // quando o documento pertence ao próprio médico. A mesma regra é aplicada
      // no filtro SQL acima; esta verificação defensiva evita expor o arquivo
      // direto caso a integridade histórica esteja incompleta.
      const safeDeliveredReports = deliveredReports.map(({ export_file_url: _exportFileUrl, ...report }) => ({
        ...report,
        print_target: canDownloadOwnReports && (report.author_user_id === ctx.user.id || report.signed_by === ctx.user.id)
          ? {
              unit_id: report.unit_id,
              study_instance_uid: report.study_instance_uid,
              document_key: report.document_key ?? "primary",
              document_label: report.document_label ?? report.study_description ?? "Laudo entregue",
              patient_name: report.patient_name,
              modality: report.modality,
              study_description: report.study_description,
            }
          : null,
      }));
      const signedReportCountByUnit = new Map<number, number>();
      for (const report of safeDeliveredReports) {
        if (report.status === "signed" || report.status === "revised") {
          signedReportCountByUnit.set(
            report.unit_id,
            (signedReportCountByUnit.get(report.unit_id) ?? 0) + 1,
          );
        }
      }

      // FIX ANALISE_FINANCEIRO_PERMISSOES BUG1: unificar fonte de price_per_report
      // O billing event usa billing_doctor_modality_prices para calcular doctor_amount_due.
      // Antes, o resumo buscava de billing_doctor_unit_prices (tabela diferente), causando
      // divergência: médico via "Sem preço configurado" mas eventos tinham valor real.
      // Solução: buscar de billing_doctor_modality_prices (mesma fonte do billing event),
      // priorizando CR (mais comum). Fallback: qualquer modalidade ativa. Fallback final: null.
      const modPriceRows = await db
        .select({
          unit_id: billing_doctor_modality_prices.unit_id,
          modality: billing_doctor_modality_prices.modality,
          price_per_report: billing_doctor_modality_prices.price_per_report,
        })
        .from(billing_doctor_modality_prices)
        .where(
          and(
            eq(billing_doctor_modality_prices.doctor_user_id, ctx.user.id),
            isNull(billing_doctor_modality_prices.ends_at),
          )
        )
        .orderBy(desc(billing_doctor_modality_prices.starts_at));

      // Para cada unidade: preferir CR, depois CT, depois qualquer modalidade ativa
      const PREFERRED_MODALITIES = ['CR', 'CT', 'MR', 'US', 'DX', 'PT'];
      const priceByUnit = new Map<number, number | null>();
      for (const row of modPriceRows) {
        if (!priceByUnit.has(row.unit_id)) {
          priceByUnit.set(row.unit_id, Number(row.price_per_report ?? 0));
        } else {
          // Substituir se a modalidade atual tem prioridade maior
          const currentIdx = PREFERRED_MODALITIES.indexOf(
            modPriceRows.find(r => r.unit_id === row.unit_id && priceByUnit.get(r.unit_id) === Number(r.price_per_report ?? 0))?.modality ?? ''
          );
          const newIdx = PREFERRED_MODALITIES.indexOf(row.modality ?? '');
          if (newIdx !== -1 && (currentIdx === -1 || newIdx < currentIdx)) {
            priceByUnit.set(row.unit_id, Number(row.price_per_report ?? 0));
          }
        }
      }

      // Fallback: se unidade não tem preço de modalidade, buscar default_doctor_price da unidade
      for (const u of scopedUnitRows) {
        if (!priceByUnit.has(u.id)) {
          // Buscar default da unidade (já temos u.id — query inline)
          const unitDefault = await db
            .select({ default_doctor_price: units.default_doctor_price })
            .from(units)
            .where(eq(units.id, u.id))
            .limit(1);
          const def = unitDefault[0]?.default_doctor_price;
          priceByUnit.set(u.id, def != null ? Number(def) : null);
        }
      }
      return {
        summary: summary.map((r) => ({
          unit_id: r.unit_id,
          unit_name: r.unit_name,
          cycle_start_day: r.cycle_start_day,
          cycle_end_day: r.cycle_end_day,
          cycle_label: r.cycle_label,
          cycle_start_date: r.cycle_start_date,
          cycle_end_date: r.cycle_end_date,
          cycle_start_display: r.cycle_start_display,
          cycle_end_display: r.cycle_end_display,
          total_laudos: Number(r.total_laudos),
          doctor_total: toMoney(r.doctor_total),
          doctor_paid: toMoney(r.doctor_paid ?? 0),
          doctor_pending: subMoney(r.doctor_total, r.doctor_paid ?? 0),
          last_received_at: r.last_received_at,
          price_per_report: priceByUnit.get(r.unit_id) ?? null,
          signed_report_count: signedReportCountByUnit.get(r.unit_id) ?? 0,
        })),
        events,
        delivered_reports: safeDeliveredReports,
      };
    }),

  /** Documento final do próprio médico para download financeiro direto, sem URL de arquivo exposta. */
  myReportDownload: protectedProcedure
    .input(z.object({
      unit_id: z.number().int().positive(),
      study_instance_uid: studyInstanceUidSchema,
      document_key: z.string().trim().min(1).max(80).default("primary"),
    }))
    .query(async ({ input, ctx }) => {
      assertMedico(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [canView, canPrint] = await Promise.all([
        canAccessUnit(ctx.user, input.unit_id, "view_studies"),
        canAccessUnit(ctx.user, input.unit_id, "print_reports"),
      ]);
      if (!canView || !canPrint) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para baixar este documento." });
      }

      const rows = await db
        .select({
          id: reports.id,
          unit_id: reports.unit_id,
          study_instance_uid: reports.study_instance_uid,
          document_key: reports.document_key,
          document_label: reports.document_label_snapshot,
          body: reports.body,
          status: reports.status,
          signed_at: reports.signedAt,
          signed_by: reports.signedBy,
          author_user_id: reports.author_user_id,
          layout_snapshot: reports.layout_snapshot,
          patient_name: studies_cache.patient_name,
          study_date: sql<Date | null>`COALESCE(${reports.study_date_snapshot}, ${studies_cache.study_date})`,
          modality: studies_cache.modality,
          study_description: studies_cache.description,
        })
        .from(reports)
        .leftJoin(studies_cache, and(
          eq(studies_cache.study_instance_uid, reports.study_instance_uid),
          eq(studies_cache.unit_id, reports.unit_id),
        ))
        .where(and(
          eq(reports.unit_id, input.unit_id),
          eq(reports.study_instance_uid, input.study_instance_uid),
        ));
      rows.sort((a, b) => b.id - a.id);
      const report = rows.find(row => row.document_key === input.document_key)
        ?? (rows.length === 1 && rows[0]?.document_key === "primary" ? rows[0] : null);
      if (!report || (report.author_user_id !== ctx.user.id && report.signed_by !== ctx.user.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento não disponível para download." });
      }
      if (report.status !== "signed" && report.status !== "revised") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Somente documentos finalizados podem ser baixados." });
      }

      const [layout] = await db.select().from(model_layouts)
        .where(eq(model_layouts.unit_id, input.unit_id)).limit(1);
      const signer = await getUserById(report.signed_by ?? report.author_user_id);
      const resolveMedia = async (reference: string | null | undefined) => {
        if (!reference) return null;
        try { return await storageGetUrl(reference); } catch { return null; }
      };
      const [signature_url, stamp_url] = await Promise.all([
        resolveMedia(signer?.signature_url),
        resolveMedia(signer?.stamp_url),
      ]);

      return {
        report,
        layout: layout ?? null,
        signer: {
          name: signer?.name ?? "",
          crm: signer?.crm ?? "",
          signature_url,
          stamp_url,
        },
      };
    }),
  /**
   * Configuração de preços por unidade — leituraa
   */
  getPriceConfig: protectedProcedure
    .input(z.object({ unit_id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id); // P4

      // Busca o preço de sistema mais recente para a unidade
      const { billing_system_unit_prices, billing_doctor_unit_prices } = await import("../../drizzle/schema");

      const systemPrices = await db
        .select()
        .from(billing_system_unit_prices)
        .where(eq(billing_system_unit_prices.unit_id, input.unit_id))
        .orderBy(desc(billing_system_unit_prices.starts_at))
        .limit(5);

      const doctorPrices = await db
        .select({
          id: billing_doctor_unit_prices.id,
          doctor_user_id: billing_doctor_unit_prices.doctor_user_id,
          doctor_name: users.name,
          price_per_report: billing_doctor_unit_prices.price_per_report,
          starts_at: billing_doctor_unit_prices.starts_at,
          ends_at: billing_doctor_unit_prices.ends_at,
        })
        .from(billing_doctor_unit_prices)
        .leftJoin(users, eq(users.id, billing_doctor_unit_prices.doctor_user_id))
        .where(eq(billing_doctor_unit_prices.unit_id, input.unit_id))
        .orderBy(desc(billing_doctor_unit_prices.starts_at));

      return { systemPrices, doctorPrices };
    }),

  /**
   * Busca os preços padrão da unidade (default_system_price, default_doctor_price)
   */
  getUnitDefaultPrices: protectedProcedure
    .input(z.object({ unit_id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id); // P4
      const rows = await db
        .select({
          id: units.id,
          name: units.name,
          default_system_price: units.default_system_price,
          default_doctor_price: units.default_doctor_price,
      })
        .from(units)
        .where(eq(units.id, input.unit_id))
        .limit(1);
      const u = rows[0];
      if (!u) throw new TRPCError({ code: "NOT_FOUND" });
      const now = new Date();
      const activeSystemRate = await db.select({ price_per_report: billing_system_unit_prices.price_per_report })
        .from(billing_system_unit_prices)
        .where(and(
          eq(billing_system_unit_prices.unit_id, input.unit_id),
          lte(billing_system_unit_prices.starts_at, now),
          or(isNull(billing_system_unit_prices.ends_at), gte(billing_system_unit_prices.ends_at, now)),
        ))
        .orderBy(desc(billing_system_unit_prices.starts_at))
        .limit(1);
      return {
        unit_id: u.id,
        unit_name: u.name,
        // FIX: usar toMoney() em vez de parseFloat() — mesmo padrão do módulo financeiro
        // != null (em vez de ?) garante que 0 seja retornado como 0, não como null
        default_system_price: activeSystemRate[0] ? toMoney(activeSystemRate[0].price_per_report) : (u.default_system_price != null ? toMoney(u.default_system_price) : null),
        default_doctor_price: u.default_doctor_price != null ? toMoney(u.default_doctor_price) : null,
      };
    }),

  /**
   * Configura os preços padrão da unidade (admin_master only)
   */
  setUnitDefaultPrices: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      default_system_price: z.number().min(0),
      default_doctor_price: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      // FIX (2026-09-24): mensagem explicativa em vez de FORBIDDEN cru -- a
      // modal do frontend agora evita chegar aqui para quem nao e
      // admin_master (ver PriceConfigModal), mas a checagem de role
      // permanece a fonte de verdade da autorizacao.
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Somente o administrador geral pode alterar os preços padrão da unidade." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(units)
        .set({
          default_system_price: String(input.default_system_price),
          default_doctor_price: String(input.default_doctor_price),
        })
        .where(eq(units.id, input.unit_id));
      return { ok: true };
    }),

  /** Valores padrão vigentes da unidade. São o fallback por modalidade para médicos sem preço individual. */
  getUnitModalityPrices: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      reference_date: z.string().datetime().optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id);

      const referenceDate = input.reference_date ? new Date(input.reference_date) : new Date();
      const rows = await db
        .select({
          id: billing_unit_modality_prices.id,
          modality: billing_unit_modality_prices.modality,
          price_per_event: billing_unit_modality_prices.price_per_event,
          starts_at: billing_unit_modality_prices.starts_at,
          ends_at: billing_unit_modality_prices.ends_at,
          created_by: billing_unit_modality_prices.created_by,
        })
        .from(billing_unit_modality_prices)
        .where(and(
          eq(billing_unit_modality_prices.unit_id, input.unit_id),
          lte(billing_unit_modality_prices.starts_at, referenceDate),
          or(isNull(billing_unit_modality_prices.ends_at), gte(billing_unit_modality_prices.ends_at, referenceDate)),
        ))
        .orderBy(desc(billing_unit_modality_prices.starts_at));

      const current = new Map<string, typeof rows[number]>();
      for (const row of rows) {
        const modality = row.modality.trim().toUpperCase();
        if (!current.has(modality)) current.set(modality, row);
      }

      return ["CT", "CR", "MR", "US"].map((modality) => {
        const row = current.get(modality);
        return {
          modality,
          price_per_event: row ? toMoney(row.price_per_event) : 0,
          configured: Boolean(row),
          starts_at: row?.starts_at ?? null,
          ends_at: row?.ends_at ?? null,
          created_by: row?.created_by ?? null,
        };
      });
    }),

  /** Publica uma nova vigência imediata e encerra a anterior, sem sobrescrever o histórico. */
  setUnitModalityPrice: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      modality: z.enum(["CT", "CR", "MR", "US"]),
      price_per_event: z.number().min(0).max(99999999.99),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanManageFinancialPrices(db, ctx.user, input.unit_id);

      const now = new Date();
      const current = await db
        .select({ id: billing_unit_modality_prices.id })
        .from(billing_unit_modality_prices)
        .where(and(
          eq(billing_unit_modality_prices.unit_id, input.unit_id),
          eq(billing_unit_modality_prices.modality, input.modality),
          lte(billing_unit_modality_prices.starts_at, now),
          or(isNull(billing_unit_modality_prices.ends_at), gte(billing_unit_modality_prices.ends_at, now)),
        ))
        .orderBy(desc(billing_unit_modality_prices.starts_at))
        .limit(1);

      if (current[0]) {
        await db
          .update(billing_unit_modality_prices)
          .set({ ends_at: new Date(now.getTime() - 1000) })
          .where(eq(billing_unit_modality_prices.id, current[0].id));
      }

      const result = await db.insert(billing_unit_modality_prices).values({
        unit_id: input.unit_id,
        modality: input.modality,
        price_per_event: input.price_per_event.toFixed(2),
        starts_at: now,
        ends_at: null,
        created_by: ctx.user.id,
      });

      return { id: Number(result[0].insertId), starts_at: now };
    }),

  /** Taxa LAUDS efetiva e a primeira data permitida para uma nova vigência. */
  getUnitSystemRate: protectedProcedure
    .input(z.object({ unit_id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id);
      const now = new Date();
      const active = await db.select({
        id: billing_system_unit_prices.id,
        price_per_report: billing_system_unit_prices.price_per_report,
        starts_at: billing_system_unit_prices.starts_at,
        ends_at: billing_system_unit_prices.ends_at,
      }).from(billing_system_unit_prices).where(and(
        eq(billing_system_unit_prices.unit_id, input.unit_id),
        lte(billing_system_unit_prices.starts_at, now),
        or(isNull(billing_system_unit_prices.ends_at), gte(billing_system_unit_prices.ends_at, now)),
      )).orderBy(desc(billing_system_unit_prices.starts_at)).limit(1);
      const legacy = await db.select({ default_system_price: units.default_system_price }).from(units).where(eq(units.id, input.unit_id)).limit(1);
      const cycle = await resolveFinancialCycle(db, input.unit_id, now);
      return {
        price_per_event: active[0] ? toMoney(active[0].price_per_report) : toMoney(legacy[0]?.default_system_price),
        configured: Boolean(active[0]),
        starts_at: active[0]?.starts_at ?? null,
        next_change_at: active[0] ? cycle.endDate : now,
      };
    }),

  /**
   * Taxa LAUDS só pode mudar em uma nova abertura de ciclo quando já existe
   * vigência ativa. A anterior é encerrada, nunca sobrescrita.
   */
  setUnitSystemRate: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      price_per_event: z.number().min(0).max(99999999.99),
      starts_at: z.string().datetime(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Somente o administrador geral pode publicar a taxa LAUDS." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const startsAt = new Date(input.starts_at);
      const now = new Date();
      const current = await db.select({ id: billing_system_unit_prices.id }).from(billing_system_unit_prices).where(and(
        eq(billing_system_unit_prices.unit_id, input.unit_id),
        lte(billing_system_unit_prices.starts_at, now),
        or(isNull(billing_system_unit_prices.ends_at), gte(billing_system_unit_prices.ends_at, now)),
      )).orderBy(desc(billing_system_unit_prices.starts_at)).limit(1);
      await assertCycleAlignedPriceStart(db, input.unit_id, startsAt, Boolean(current[0]));
      const responsible = await getActiveResponsibleForUnit(input.unit_id);
      if (!responsible) throw new TRPCError({ code: "BAD_REQUEST", message: "Defina um responsável financeiro ativo para a unidade antes de publicar a taxa LAUDS." });
      if (current[0]) {
        await db.update(billing_system_unit_prices).set({ ends_at: new Date(startsAt.getTime() - 1000) }).where(eq(billing_system_unit_prices.id, current[0].id));
      }
      const result = await db.insert(billing_system_unit_prices).values({
        financial_responsible_id: responsible.financial_responsible_id,
        unit_id: input.unit_id,
        price_per_report: input.price_per_event.toFixed(2),
        starts_at: startsAt,
        ends_at: null,
        created_by: ctx.user.id,
      });
      return { id: Number(result[0].insertId), starts_at: startsAt };
    }),

  /**
   * Busca o ciclo de pagamento configurado para a unidade (admin_master only)
   */
  /**
   * FIX (2026-09-23, revisão Manus — bloqueio crítico 2): esta procedure
   * ainda exigia admin_master mesmo depois de setUnitCycle ter sido aberta
   * para responsavel_financeiro (decisão de 22/09/2026). Resultado prático:
   * o botão "Ciclo" aparecia pro responsável, mas o modal nunca conseguia
   * carregar os dias atuais (FORBIDDEN), então CycleConfigModal ficava com
   * os campos vazios — e o parseInt("") || fallback do modal convertia isso
   * em 1 e 31, arriscando sobrescrever o ciclo real com 1–31 ao salvar. Usa
   * agora a mesma checagem de setUnitCycle (assertCanManageFinancialPrices).
   */
  getUnitCycle: protectedProcedure
    .input(z.object({ unit_id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanManageFinancialPrices(db, ctx.user, input.unit_id);
      const rows = await db
        .select({
          id: units.id,
          name: units.name,
          billing_cycle_start_day: units.billing_cycle_start_day,
          billing_cycle_end_day: units.billing_cycle_end_day,
        })
        .from(units)
        .where(eq(units.id, input.unit_id))
        .limit(1);
      const u = rows[0];
      if (!u) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        unit_id: u.id,
        unit_name: u.name,
        start_day: u.billing_cycle_start_day ?? 1,
        end_day: u.billing_cycle_end_day ?? 31,
      };
    }),

  /**
   * Configura o ciclo de pagamento da unidade.
   * start_day: dia do mês de início (1-31)
   * end_day: dia do mês de fim (1-31)
   * Se start_day > end_day, o ciclo cruza mêses (ex: 15 ao 14 do mês seguinte)
   *
   * Decisão de 22/09/2026 (Alessandro): responsavel_financeiro também pode
   * editar o ciclo da(s) própria(s) unidade(s) — antes era admin_master
   * only. Reusa assertCanManageFinancialPrices (mesma checagem de
   * setUnitModalityPrice: admin_master irrestrito, responsavel_financeiro
   * só na própria unidade via assertCanAccessFinancialUnit) — o nome da
   * função ficou de quando só cobria preços, mas a regra de autorização é
   * idêntica pra configuração financeira da unidade em geral.
   */
  setUnitCycle: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      start_day: z.number().int().min(1).max(31),
      end_day: z.number().int().min(1).max(31),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanManageFinancialPrices(db, ctx.user, input.unit_id);
      await db.update(units)
        .set({
          billing_cycle_start_day: input.start_day,
          billing_cycle_end_day: input.end_day,
        })
        .where(eq(units.id, input.unit_id));
      return { ok: true };
    }),

  /**
   * Resumo financeiro para o Responsável Financeiro logado
   * Retorna as unidades vinculadas + resumo de laudos/valores por mês
   */
  myResponsavelSummary: protectedProcedure
    .input(z.object({
      reference_date: z.string().datetime().optional(),
      financialResponsibleId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "responsavel_financeiro" && ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Descobrir o responsável a usar (explícito, ou o único vínculo do usuário)
      const responsavelId = await resolveResponsibleContext(ctx.user, input.financialResponsibleId);
      if (!responsavelId) {
        return { units: [], responsavelId: null };
      }

      // Buscar unidades vinculadas ao responsável (vigência ativa)
      const linkedUnitsRaw = await db
        .select({
          unit_id: financial_responsible_units.unit_id,
          unit_name: units.name,
          cycle_start_day: units.billing_cycle_start_day,
          cycle_end_day: units.billing_cycle_end_day,
        })
        .from(financial_responsible_units)
        .leftJoin(units, eq(units.id, financial_responsible_units.unit_id))
        .where(
          and(
            eq(financial_responsible_units.financial_responsible_id, responsavelId),
            isNull(financial_responsible_units.ends_at),
          )
        );

      // FIX (AUDITORIA_PAINEL_RESPONSAVEL_FINANCEIRO_2026-09-24, Achado 1):
      // financial_responsible_units pode ter mais de uma linha ativa
      // (ends_at IS NULL) apontando para a MESMA unidade -- vinculo
      // duplicado por dado sujo (ex.: reativacao sem encerrar o vinculo
      // antigo). Sem dedupe aqui, cada linha virava um card inteiro na tela
      // do responsavel (unidade repetida) e os totais do cabecalho ("LAUDOS",
      // "TOTAL AO SISTEMA" etc.) somavam a mesma unidade duas vezes,
      // inflando os numeros visiveis para o responsavel financeiro.
      // Deduplicar aqui garante o comportamento correto independentemente de
      // o dado no banco ja estar limpo ou nao -- a limpeza dos vinculos
      // duplicados em si e uma acao de dado, nao de codigo (ver handoff).
      const seenUnitIds = new Set<number>();
      const duplicateUnitIds = new Set<number>();
      const linkedUnits = linkedUnitsRaw.filter((lu) => {
        if (seenUnitIds.has(lu.unit_id)) {
          duplicateUnitIds.add(lu.unit_id);
          return false;
        }
        seenUnitIds.add(lu.unit_id);
        return true;
      });
      if (duplicateUnitIds.size > 0) {
        // Nao bloqueia a resposta -- e so um sinal para investigacao de dado.
        console.warn(
          `[finance] financial_responsible_units duplicado para responsavelId=${responsavelId}: unit_id(s) ${Array.from(duplicateUnitIds).join(", ")} tem mais de um vinculo ativo (ends_at IS NULL).`
        );
      }

      if (linkedUnits.length === 0) {
        return { units: [], responsavelId };
      }

      const unitIds = linkedUnits.map((u) => u.unit_id);
      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      // P1C: myResponsavelSummary usa ciclo real por unidade
      // FIX (2026-09-22): a agregação anterior lia só billing_visit_events
      // via SQL cru, direto — isso deixava de fora billing_catalog_study_events
      // (evento faturado pelo fluxo novo de catálogo) e não excluía eventos
      // com financial_status = 'cancelled' dos totais. Reusa
      // listUnitCycleFinancialEvents, que já combina as duas tabelas e já
      // normaliza financial_status (mesmo helper usado pelo log auditável e
      // pelo fechamento histórico) — agrega os totais aqui em vez de duplicar
      // a leitura em SQL cru.
      const summaryPerUnit = await Promise.all(
        linkedUnits.map(async (lu) => {
          const { cycleStart, cycleEnd, label: cycle_label } = calcCycleDates(lu.cycle_start_day, lu.cycle_end_day, refDate);
          const events = await listUnitCycleFinancialEvents(db, lu.unit_id, cycleStart, cycleEnd, false);
          const activeEvents = events.filter((event) => event.financial_status !== "cancelled");
          const totals = activeEvents.reduce(
            (acc, event) => {
              const systemDue = Number(event.system_amount_due ?? 0);
              const doctorDue = Number(event.doctor_amount_due ?? 0);
              acc.total_laudos += 1;
              acc.system_total += systemDue;
              acc.doctor_total += doctorDue;
              if (event.system_paid_at) acc.system_paid += systemDue;
              if (event.doctor_received_at) acc.doctor_paid += doctorDue;
              return acc;
            },
            { total_laudos: 0, system_total: 0, system_paid: 0, doctor_total: 0, doctor_paid: 0 },
          );
          return { unit_id: lu.unit_id, cycle_label, cycle_start_date: cycleStart.toISOString(), cycle_end_date: cycleEnd.toISOString(), ...totals };
        })
      );
      const summary = summaryPerUnit;

      // Montar resultado com ciclo real por unidade
      const summaryMap = new Map(summary.map((s) => [s.unit_id, s]));
      const result = linkedUnits.map((lu) => {
        const s = summaryMap.get(lu.unit_id);
        // FIX (AUDITORIA_PAINEL_RESPONSAVEL_FINANCEIRO_2026-09-24, Achado 2):
        // o LEFT JOIN com `units` nao encontra a unidade quando o unit_id em
        // financial_responsible_units aponta para uma unidade que nao existe
        // mais (excluida, ou vinculo criado errado). Antes, isso virava
        // silenciosamente o texto generico "Unidade" -- indistinguivel de uma
        // unidade real chamada assim, escondendo um problema de dado real (e
        // escondendo, junto, qualquer valor pendente ligado a esse unit_id).
        // Agora o nome deixa explicito que a unidade nao foi encontrada, e o
        // flag `unit_orphaned` permite o frontend destacar visualmente sem
        // parsear texto.
        const isOrphaned = lu.unit_name === null;
        return {
          unit_id: lu.unit_id,
          unit_name: isOrphaned ? `Unidade removida (ID ${lu.unit_id})` : (lu.unit_name as string),
          unit_orphaned: isOrphaned,
          cycle_start_day: lu.cycle_start_day ?? 1,
          cycle_end_day: lu.cycle_end_day ?? 31,
          cycle_label: s?.cycle_label ?? "",
          cycle_start_date: s?.cycle_start_date ?? "",
          cycle_end_date: s?.cycle_end_date ?? "",
          total_laudos: s ? Number(s.total_laudos) : 0,
          system_total: s ? toMoney(s.system_total) : 0,
          system_paid: s ? toMoney(s.system_paid) : 0,
          system_pending: s ? subMoney(s.system_total, s.system_paid) : 0,
          doctor_total: s ? toMoney(s.doctor_total) : 0,
          doctor_paid: s ? toMoney(s.doctor_paid) : 0,
          doctor_pending: s ? subMoney(s.doctor_total, s.doctor_paid) : 0,
        };
      });
      return { units: result, responsavelId };
    }),

  /**
   * Resumo por Responsável Financeiro — para admin_master
   * Agrupa billing_visit_events por financial_responsible_id
   */
  responsibleSummary: protectedProcedure
    .input(z.object({
      reference_date: z.string().datetime().optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao admin master" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      // P1E: responsibleSummary usa ciclo real por unidade.
      // Busca todas as unidades com seus ciclos e agrega por responsável.
      const allUnitsWithCycles = await db
        .select({ id: units.id, s: units.billing_cycle_start_day, e: units.billing_cycle_end_day })
        .from(units);

      // Para cada unidade, buscar eventos no ciclo real agrupados por responsável
      const perUnitPerResp = await Promise.all(
        allUnitsWithCycles.map(async (u) => {
          const { cycleStart, cycleEnd } = calcCycleDates(u.s, u.e, refDate);
          return db
            .select({
              responsible_id: billing_visit_events.financial_responsible_id,
              responsible_name: financial_responsibles.legal_name,
              unit_id: billing_visit_events.unit_id,
              total_laudos: sql<number>`COUNT(*)`,
              system_total: sql<number>`COALESCE(SUM(${billing_visit_events.system_amount_due}), 0)`,
              system_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.system_paid_at} IS NOT NULL THEN ${billing_visit_events.system_amount_due} ELSE 0 END), 0)`,
              doctor_total: sql<number>`COALESCE(SUM(${billing_visit_events.doctor_amount_due}), 0)`,
              doctor_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.doctor_received_at} IS NOT NULL THEN ${billing_visit_events.doctor_amount_due} ELSE 0 END), 0)`,
            })
            .from(billing_visit_events)
            .leftJoin(financial_responsibles, eq(financial_responsibles.id, billing_visit_events.financial_responsible_id))
            .where(and(
              eq(billing_visit_events.unit_id, u.id),
              sql`${billing_visit_events.signed_at} >= ${cycleStart}`,
              sql`${billing_visit_events.signed_at} < ${cycleEnd}`,
            ))
            .groupBy(billing_visit_events.financial_responsible_id, financial_responsibles.legal_name, billing_visit_events.unit_id);
        })
      );

      // Agregar por responsável
      const respMap = new Map<number | null, {
        responsible_id: number | null; responsible_name: string;
        unit_ids: Set<number>; total_laudos: number;
        system_total: number; system_paid: number;
        doctor_total: number; doctor_paid: number;
      }>();

      for (const unitRows of perUnitPerResp) {
        for (const r of unitRows) {
          const key = r.responsible_id;
          if (!respMap.has(key)) {
            respMap.set(key, {
              responsible_id: key,
              responsible_name: r.responsible_name ?? "Sem responsável",
              unit_ids: new Set(),
              total_laudos: 0, system_total: 0, system_paid: 0,
              doctor_total: 0, doctor_paid: 0,
            });
          }
          const agg = respMap.get(key)!;
          if (r.unit_id) agg.unit_ids.add(r.unit_id);
          agg.total_laudos += Number(r.total_laudos);
          agg.system_total += Number(r.system_total);
          agg.system_paid += Number(r.system_paid);
          agg.doctor_total += Number(r.doctor_total);
          agg.doctor_paid += Number(r.doctor_paid);
        }
      }

      return Array.from(respMap.values())
        .sort((a, b) => a.responsible_name.localeCompare(b.responsible_name))
        .map(r => ({
          responsible_id: r.responsible_id,
          responsible_name: r.responsible_name,
          unit_count: r.unit_ids.size,
          total_laudos: r.total_laudos,
          system_total: toMoney(r.system_total),
          system_paid: toMoney(r.system_paid),
          system_pending: subMoney(r.system_total, r.system_paid),
          doctor_total: toMoney(r.doctor_total),
          doctor_paid: toMoney(r.doctor_paid),
          doctor_pending: subMoney(r.doctor_total, r.doctor_paid),
        }));
    }),

  /**
   * FIN-C3: Diagnóstico financeiro — lista laudos assinados sem evento de billing
   * ou com valor zero, para identificar a causa raiz dos eventos zerados.
   * Restrito a admin_master.
   */
  financialDiagnostic: protectedProcedure
    .input(z.object({
      unit_id: z.number().optional(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { reports, audit_log } = await import('../../drizzle/schema');

      // Laudos assinados sem billing_visit_event correspondente
      const missingBilling = await db
        .select({
          report_id: reports.id,
          unit_id: reports.unit_id,
          author_user_id: reports.author_user_id,
          study_instance_uid: reports.study_instance_uid,
          signedAt: reports.signedAt,
          signedBy: reports.signedBy,
        })
        .from(reports)
        .leftJoin(billing_visit_events, eq(billing_visit_events.report_id, reports.id))
        .where(and(
          eq(reports.status, 'signed'),
          isNull(billing_visit_events.id),
          input.unit_id ? eq(reports.unit_id, input.unit_id) : undefined,
        ))
        .orderBy(desc(reports.signedAt))
        .limit(input.limit);

      // Laudos com billing_visit_event mas valor zero
      const zeroBilling = await db
        .select({
          id: billing_visit_events.id,
          report_id: billing_visit_events.report_id,
          unit_id: billing_visit_events.unit_id,
          doctor_user_id: billing_visit_events.doctor_user_id,
          system_amount_due: billing_visit_events.system_amount_due,
          doctor_amount_due: billing_visit_events.doctor_amount_due,
          pricing_status: billing_visit_events.pricing_status,
          signed_at: billing_visit_events.signed_at,
        })
        .from(billing_visit_events)
        .where(and(
          sql`(${billing_visit_events.system_amount_due} = 0 OR ${billing_visit_events.system_amount_due} IS NULL)`,
          input.unit_id ? eq(billing_visit_events.unit_id, input.unit_id) : undefined,
        ))
        .orderBy(desc(billing_visit_events.signed_at))
        .limit(input.limit);

      // Contar BILLING_EVENT_FAILED no audit_log
      const failedEvents = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(audit_log)
        .where(eq(audit_log.action, 'BILLING_EVENT_FAILED'));

      return {
        missing_billing_count: missingBilling.length,
        zero_billing_count: zeroBilling.length,
        failed_events_count: Number(failedEvents[0]?.count ?? 0),
        missing_billing: missingBilling,
        zero_billing: zeroBilling,
      };
    }),

  /**
   * FIN-C5: Reprecificar eventos com valor zero.
   * dry_run=true apenas lista; dry_run=false aplica as atualizações.
   * Restrito a admin_master.
   */
  repriceMissingEvents: protectedProcedure
    .input(z.object({
      unit_id: z.number().optional(),
      dry_run: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const zeroEvents = await db
        .select({
          id: billing_visit_events.id,
          unit_id: billing_visit_events.unit_id,
          doctor_user_id: billing_visit_events.doctor_user_id,
        })
        .from(billing_visit_events)
        .where(and(
          sql`(${billing_visit_events.system_amount_due} = 0 OR ${billing_visit_events.system_amount_due} IS NULL)`,
          input.unit_id ? eq(billing_visit_events.unit_id, input.unit_id) : undefined,
        ))
        .limit(500);

      if (input.dry_run) {
        return { dry_run: true, would_update: zeroEvents.length, events: zeroEvents };
      }

      let updated = 0;
      for (const evt of zeroEvents) {
        const doctorPrice = await db
          .select()
          .from(billing_doctor_unit_prices)
          .where(and(
            eq(billing_doctor_unit_prices.unit_id, evt.unit_id),
            eq(billing_doctor_unit_prices.doctor_user_id, evt.doctor_user_id),
          ))
          .limit(1);
        const unit = await db
          .select({ sys: units.default_system_price, doc: units.default_doctor_price })
          .from(units)
          .where(eq(units.id, evt.unit_id))
          .limit(1);
        // Se default_system_price for NULL, buscar em billing_system_unit_prices
        let sysPrice = unit[0]?.sys ?? null;
        if (!sysPrice || Number(sysPrice) === 0) {
          const sysPriceRow = await db
            .select({ price: billing_system_unit_prices.price_per_report })
            .from(billing_system_unit_prices)
            .where(and(
              eq(billing_system_unit_prices.unit_id, evt.unit_id),
              sql`${billing_system_unit_prices.ends_at} IS NULL`,
            ))
            .orderBy(sql`${billing_system_unit_prices.starts_at} DESC`)
            .limit(1);
          sysPrice = sysPriceRow[0]?.price ?? '0';
        }
        const docPrice = doctorPrice[0]?.price_per_report ?? unit[0]?.doc ?? '0';
        if (Number(sysPrice) > 0 || Number(docPrice) > 0) {
          await db
            .update(billing_visit_events)
            .set({
              system_amount_due: String(sysPrice),
              doctor_amount_due: String(docPrice),
              // 'ok' = preço configurado e aplicado; 'pending_both' = sem preço
              pricing_status: 'ok',
            })
            .where(eq(billing_visit_events.id, evt.id));
          updated++;
        }
      }
      return { dry_run: false, updated, total_zero: zeroEvents.length };
    }),

  /**
   * FIN-R1: Reprocessar billing_visit_events legados faltantes.
   * Busca somente laudos assinados/revisados sem evento financeiro legado e sem
   * seleção de legenda canônica. Estudos selecionados pelo catálogo têm o seu
   * próprio fluxo consolidado em billing_catalog_study_events e jamais podem
   * voltar para billing_visit_events.
   * dry_run=true apenas lista os laudos afetados sem criar nada.
   * dry_run=false cria os eventos para todos os laudos listados.
   * Restrito a admin_master.
   */
  reprocessBillingEvents: protectedProcedure
    .input(z.object({
      unit_id: z.number().optional(),
      dry_run: z.boolean().default(true),
      limit: z.number().min(1).max(1000).default(500),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { reports, studies_cache } = await import('../../drizzle/schema');

      // Busca exclusivamente laudos legados: sem billing_visit_event e sem seleção
      // canônica. O segundo critério bloqueia reprocessamento duplicado mesmo quando
      // o catálogo ainda aguarda as demais assinaturas antes de consolidar eventos.
      const missing = await db
        .select({
          report_id: reports.id,
          unit_id: reports.unit_id,
          author_user_id: reports.author_user_id,
          study_instance_uid: reports.study_instance_uid,
          signedAt: reports.signedAt,
          patient_name: studies_cache.patient_name,
          study_date: studies_cache.study_date,
          modality: studies_cache.modality,
        })
        .from(reports)
        .leftJoin(billing_visit_events, eq(billing_visit_events.report_id, reports.id))
        .leftJoin(
          study_exam_legend_selections,
          and(
            eq(study_exam_legend_selections.study_instance_uid, reports.study_instance_uid),
            eq(study_exam_legend_selections.unit_id, reports.unit_id),
          )
        )
        .leftJoin(
          studies_cache,
          and(
            eq(studies_cache.study_instance_uid, reports.study_instance_uid),
            eq(studies_cache.unit_id, reports.unit_id),
          )
        )
        .where(and(
          sql`${reports.status} IN ('signed', 'revised')`,
          isNull(billing_visit_events.id),
          isNull(study_exam_legend_selections.id),
          input.unit_id ? eq(reports.unit_id, input.unit_id) : undefined,
        ))
        .orderBy(reports.signedAt)
        .limit(input.limit);

      if (input.dry_run) {
        return {
          dry_run: true,
          would_create: missing.length,
          reports: missing.map(r => ({
            report_id: r.report_id,
            unit_id: r.unit_id,
            author_user_id: r.author_user_id,
            signedAt: r.signedAt,
          })),
        };
      }

      let created = 0;
      let failed = 0;
      const errors: { report_id: number; error: string }[] = [];

      for (const r of missing) {
        // Laudos sem unit_id não podem ter evento financeiro
        if (!r.unit_id) {
          failed++;
          errors.push({ report_id: r.report_id, error: 'unit_id ausente no laudo' });
          continue;
        }
        try {
          await createBillingVisitEvent({
            report_id: r.report_id,
            study_instance_uid: r.study_instance_uid ?? undefined,
            unit_id: r.unit_id,
            doctor_user_id: r.author_user_id ?? ctx.user.id,
            patient_name: r.patient_name ?? undefined,
            study_date: r.study_date instanceof Date ? r.study_date.toISOString().slice(0, 10) : (r.study_date ?? undefined),
            signed_at: r.signedAt ? new Date(r.signedAt) : new Date(),
            modality_snapshot: r.modality ?? null,
          });
          created++;
        } catch (err) {
          failed++;
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ report_id: r.report_id, error: msg });
        }
      }

      return {
        dry_run: false,
        total_missing: missing.length,
        created,
        failed,
        errors: errors.slice(0, 50), // limita erros retornados
      };
    }),

  // ─── Procedimentos migrados de billing.ts ─────────────────────────────────

    // ── Responsáveis Financeiros ──────────────────────────────────────────────
    listResponsibles: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        return await listFinancialResponsibles();
      }),

    getResponsible: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') {
          
          const respIds = await getResponsibleIdsForUser(ctx.user.id);
          if (!respIds.includes(input.id)) throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        return await getFinancialResponsibleById(input.id);
      }),

    createResponsible: protectedProcedure
      .input(z.object({
        person_type: z.enum(['PF', 'PJ']),
        legal_name: z.string().min(2),
        trade_name: z.string().optional(),
        cpf_cnpj: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        const id = await createFinancialResponsible({ ...input, isActive: true });
        return { id };
      }),

    updateResponsible: protectedProcedure
      .input(z.object({
        id: z.number(),
        legal_name: z.string().min(2).optional(),
        trade_name: z.string().optional(),
        cpf_cnpj: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        notes: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { id, ...data } = input;
        
        await updateFinancialResponsible(id, data);
        return { success: true };
      }),

    // ── Vínculos Usuário → Responsável ────────────────────────────────────────
    // NOVO (claude/gestao-usuarios-responsavel-financeiro, requisitos 2026-09-17
    // seções 3.3/3.4/7) + CORRIGIDO (revisão Manus 2026-09-20, 3 bloqueios):
    // antes desta mudança, linkUser/unlinkUser só faziam o INSERT/DELETE cru.
    // Depois de uma primeira rodada com checagem de perfil e "tratamento" de
    // duplicidade, o Manus revisou e achou 3 problemas reais: (1) o helper
    // usava onDuplicateKeyUpdate, que nunca lança em MySQL — o catch de
    // duplicidade abaixo era código morto contra o banco real; (2) nada
    // impedia vincular a mesma conta a um SEGUNDO responsável diferente,
    // e getResponsibleIdForUser (.limit(1)) resolveria um dos dois em
    // silêncio — decisão de produto confirmada pelo Alessandro em
    // 2026-09-20: Opção A, uma conta tem no máximo um responsável ativo,
    // garantido pela unique key uq_resp_user(user_id) da migration 0062;
    // (3) o vínculo concedido não bastava pra a conta enxergar o módulo
    // depois do login (ver Login.tsx e PacsQueryPage.tsx). Esta versão
    // corrige (1) e (2); (3) é tratado fora desta procedure.
    linkUser: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

        const targetRows = await db.select({ id: users.id, role: users.role, isActive: users.isActive })
          .from(users).where(eq(users.id, input.userId)).limit(1);
        const target = targetRows[0];
        if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conta de usuário não encontrada.' });
        if (target.role !== 'responsavel_financeiro') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Esta conta não tem o perfil "Responsável Financeiro" — ajuste o perfil do usuário antes de conceder acesso ao painel financeiro.' });
        }
        if (!target.isActive) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Esta conta está inativa. Ative o usuário antes de conceder acesso.' });
        }

        // Responsável precisa existir de fato — a tabela de vínculo não tem
        // FK declarada no schema, então uma chamada direta de admin poderia
        // criar um vínculo órfão pro lado do responsável (achado do Manus).
        const responsible = await getFinancialResponsibleById(input.financialResponsibleId);
        if (!responsible) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Responsável financeiro não encontrado.' });
        }
        // FIX (2026-09-23, revisão Manus — política de responsável inativo,
        // "bloquear tudo"): não conceder acesso novo a um responsável
        // desativado. Vínculos já existentes de um responsável que for
        // desativado depois continuam no banco, mas param de contar pra
        // autorização (ver getResponsibleIdForUser/getResponsibleIdsForUser
        // em server/db.ts) — aqui é só a barreira de não criar vínculo NOVO
        // pra um responsável que já está inativo.
        if (!responsible.isActive) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este responsável financeiro está inativo. Reative-o antes de conceder acesso a novos usuários.' });
        }

        // Opção A (pré-checagem com mensagem específica — a unique key do
        // banco é a garantia de verdade, isto aqui é só pra dizer AO QUE a
        // conta já está vinculada, em vez de um ER_DUP_ENTRY genérico).
        const existingResponsibleId = await getResponsibleIdForUser(input.userId);
        if (existingResponsibleId !== undefined && existingResponsibleId !== input.financialResponsibleId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Esta conta já tem acesso a outro responsável financeiro. Revogue o acesso atual antes de vincular a um novo (uma conta só pode operar um responsável financeiro por vez).',
          });
        }

        try {
          await linkUserToResponsible(input.financialResponsibleId, input.userId, {
            user_id: ctx.user.id,
            ip_address: ctx.req.ip,
            user_agent: ctx.req.headers['user-agent'],
          });
        } catch (err) {
          // uq_resp_user(user_id) — vínculo duplicado (defesa em profundidade
          // contra corrida com a pré-checagem acima; o texto exato da mensagem
          // de duplicidade do MySQL varia por versão/driver, por isso o regex
          // cobre tanto o nome da constraint quanto "Duplicate entry" e o
          // código de erro ER_DUP_ENTRY quando o driver o expõe).
          const code = (err as { code?: string } | undefined)?.code;
          const isDuplicateKey = code === 'ER_DUP_ENTRY' ||
            (err instanceof Error && /uq_resp_user|Duplicate entry/i.test(err.message));
          if (isDuplicateKey) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Esta conta já tem acesso a um responsável financeiro (o mesmo ou outro) — revogue o acesso atual antes de conceder um novo.' });
          }
          throw err;
        }

        return { success: true };
      }),

    unlinkUser: protectedProcedure
      .input(z.object({
        financialResponsibleId: z.number(),
        userId: z.number(),
        // Seção 3.4: se for o único usuário com acesso, a interface tem que
        // exigir confirmação reforçada — validado aqui de novo (não só na UI),
        // porque uma chamada direta à API tem que obedecer à mesma regra (seção 7).
        confirmLastUser: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });

        const currentUsers = await listUsersForResponsible(input.financialResponsibleId);
        const isLastUser = currentUsers.length === 1 && currentUsers[0]?.user_id === input.userId;
        if (isLastUser && !input.confirmLastUser) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'LAST_USER_CONFIRMATION_REQUIRED: este é o único usuário com acesso a este responsável financeiro. Confirme a remoção para deixá-lo temporariamente sem nenhum operador com acesso ao painel.',
          });
        }

        try {
          await unlinkUserFromResponsible(
            input.financialResponsibleId,
            input.userId,
            { user_id: ctx.user.id, ip_address: ctx.req.ip, user_agent: ctx.req.headers['user-agent'] },
            { was_last_user: isLastUser },
          );
        } catch (err) {
          if (err instanceof FinancialResponsibleUserLinkNotFoundError) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Este vínculo não existe — talvez já tenha sido removido.' });
          }
          throw err;
        }

        return { success: true, was_last_user: isLastUser };
      }),

    listUsersForResponsible: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        return await listUsersForResponsible(input.financialResponsibleId);
      }),

    // Seção 3.3: contas elegíveis pra receber acesso (role correto, ativas).
    // CORRIGIDO (revisão Manus 2026-09-20, Bloqueio 2 / Opção A): antes só
    // excluía contas já vinculadas a ESTE responsável — uma conta vinculada
    // a outro responsável continuava aparecendo como "elegível" aqui, e só
    // era barrada (com um erro) no clique de confirmar. Agora exclui contas
    // vinculadas a QUALQUER responsável, já que sob a Opção A uma conta só
    // pode ter um por vez — a lista deixa de oferecer uma opção que sempre
    // falharia.
    listEligibleUsersForResponsible: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number() }))
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const [linkedAnywhere, eligible] = await Promise.all([
          db.selectDistinct({ user_id: financial_responsible_users.user_id }).from(financial_responsible_users),
          db.select({ id: users.id, name: users.name, username: users.username, email: users.email })
            .from(users)
            .where(and(eq(users.role, 'responsavel_financeiro'), eq(users.isActive, true)))
            .orderBy(users.name),
        ]);
        const linkedIds = new Set(linkedAnywhere.map((l) => l.user_id));
        return eligible.filter((u) => !linkedIds.has(u.id));
      }),

    // ── Vínculos Unidade → Responsável ────────────────────────────────────────
    linkUnit: protectedProcedure
      .input(z.object({
        financialResponsibleId: z.number(),
        unitId: z.number(),
        startsAt: z.string(),
        endsAt: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        await linkUnitToResponsible(
          input.financialResponsibleId,
          input.unitId,
          new Date(input.startsAt),
          input.endsAt ? new Date(input.endsAt) : undefined,
          ctx.user.id,
        );
        return { success: true };
      }),

    listUnitsForResponsible: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') {
          
          const respIds = await getResponsibleIdsForUser(ctx.user.id);
          if (!respIds.includes(input.financialResponsibleId)) throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        return await listUnitsForResponsible(input.financialResponsibleId);
      }),

    // ── Preços do Sistema ──────────────────────────────────────────────────────
    setSystemPrice: protectedProcedure
      .input(z.object({
        financialResponsibleId: z.number(),
        unitId: z.number(),
        pricePerReport: z.string(),
        startsAt: z.string(),
        endsAt: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        await assertCanManageFinancialPrices(db, ctx.user, input.unitId, input.financialResponsibleId);
        
        const id = await upsertSystemUnitPrice({
          financial_responsible_id: input.financialResponsibleId,
          unit_id: input.unitId,
          price_per_report: input.pricePerReport,
          starts_at: new Date(input.startsAt),
          ends_at: input.endsAt ? new Date(input.endsAt) : null,
          created_by: ctx.user.id,
        });
        return { id };
      }),

    listSystemPrices: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), unitId: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        await assertCanManageFinancialPrices(db, ctx.user, input.unitId, input.financialResponsibleId);
        
        return await listSystemPricesForUnit(input.financialResponsibleId, input.unitId);
      }),

    // ── Preços do Médico ───────────────────────────────────────────────────────
    setDoctorPrice: protectedProcedure
      .input(z.object({
        financialResponsibleId: z.number(),
        unitId: z.number(),
        doctorUserId: z.number(),
        pricePerReport: z.string(),
        startsAt: z.string(),
        endsAt: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        await assertCanManageFinancialPrices(db, ctx.user, input.unitId, input.financialResponsibleId);
        const startsAt = new Date(input.startsAt);
        await assertDoctorUnitPriceStart(db, input.unitId, input.doctorUserId, startsAt);
        const id = await upsertDoctorUnitPrice({
          financial_responsible_id: input.financialResponsibleId,
          unit_id: input.unitId,
          doctor_user_id: input.doctorUserId,
          price_per_report: input.pricePerReport,
          starts_at: startsAt,
          ends_at: input.endsAt ? new Date(input.endsAt) : null,
          created_by: ctx.user.id,
        });
        return { id };
      }),

    listDoctorPrices: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), unitId: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        await assertCanManageFinancialPrices(db, ctx.user, input.unitId, input.financialResponsibleId);
        
        return await listDoctorPricesForUnit(input.financialResponsibleId, input.unitId);
      }),

    // ── Preços por Modalidade (M4A / M4B / M4C) ───────────────────────────────
    /** M4A: Listar preços por modalidade de um médico em uma unidade */
    listDoctorModalityPrices: protectedProcedure
      .input(z.object({
        financialResponsibleId: z.number(),
        unitId: z.number(),
        doctorUserId: z.number(),
      }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        await assertCanManageFinancialPrices(db, ctx.user, input.unitId, input.financialResponsibleId);
        return db
          .select()
          .from(billing_doctor_modality_prices)
          .where(and(
            eq(billing_doctor_modality_prices.financial_responsible_id, input.financialResponsibleId),
            eq(billing_doctor_modality_prices.unit_id, input.unitId),
            eq(billing_doctor_modality_prices.doctor_user_id, input.doctorUserId),
          ))
          .orderBy(desc(billing_doctor_modality_prices.starts_at));
      }),

    /** M4B: Criar/atualizar preço por modalidade */
    setDoctorModalityPrice: protectedProcedure
      .input(z.object({
        financialResponsibleId: z.number(),
        unitId: z.number(),
        doctorUserId: z.number(),
        modality: z.string().min(1).max(10),
        pricePerReport: z.string(),
        startsAt: z.string(),
        endsAt: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        await assertCanManageFinancialPrices(db, ctx.user, input.unitId, input.financialResponsibleId);
        const requestedStart = new Date(input.startsAt);
        if (Number.isNaN(requestedStart.getTime())) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Início de vigência inválido.' });
        }
        const now = new Date();
        const activeRows = await db.select({ id: billing_doctor_modality_prices.id })
          .from(billing_doctor_modality_prices)
          .where(and(
            eq(billing_doctor_modality_prices.financial_responsible_id, input.financialResponsibleId),
            eq(billing_doctor_modality_prices.unit_id, input.unitId),
            eq(billing_doctor_modality_prices.doctor_user_id, input.doctorUserId),
            eq(billing_doctor_modality_prices.modality, input.modality.trim().toUpperCase()),
            lte(billing_doctor_modality_prices.starts_at, now),
            or(isNull(billing_doctor_modality_prices.ends_at), gte(billing_doctor_modality_prices.ends_at, now)),
          )).limit(1);
        let startsAt = requestedStart;
        if (activeRows[0]) {
          const currentCycle = await resolveFinancialCycle(db, input.unitId, now);
          if (startsAt.getTime() < currentCycle.endDate.getTime()) startsAt = currentCycle.endDate;
        }
        await assertCycleAlignedPriceStart(db, input.unitId, startsAt, activeRows.length > 0);
        if (activeRows[0]) {
          await db.update(billing_doctor_modality_prices)
            .set({ ends_at: new Date(startsAt.getTime() - 1000) })
            .where(eq(billing_doctor_modality_prices.id, activeRows[0].id));
        }
        const result = await db.insert(billing_doctor_modality_prices).values({
          financial_responsible_id: input.financialResponsibleId,
          unit_id: input.unitId,
          doctor_user_id: input.doctorUserId,
          modality: input.modality.trim().toUpperCase(),
          price_per_report: input.pricePerReport,
          starts_at: startsAt,
          ends_at: input.endsAt ? new Date(input.endsAt) : null,
          created_by: ctx.user.id,
        });
        return { id: Number(result[0].insertId) };
      }),

    /** M4C: Encerrar vigência de um preço por modalidade (soft-delete via ends_at) */
    endDoctorModalityPrice: protectedProcedure
      .input(z.object({ id: z.number(), endsAt: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const existing = await db.select({
          unit_id: billing_doctor_modality_prices.unit_id,
          financial_responsible_id: billing_doctor_modality_prices.financial_responsible_id,
        }).from(billing_doctor_modality_prices).where(eq(billing_doctor_modality_prices.id, input.id)).limit(1);
        if (!existing[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Preço por modalidade não encontrado.' });
        await assertCanManageFinancialPrices(db, ctx.user, existing[0].unit_id, existing[0].financial_responsible_id);
        await db
          .update(billing_doctor_modality_prices)
          .set({ ends_at: new Date(input.endsAt) })
          .where(eq(billing_doctor_modality_prices.id, input.id));
        return { success: true };
      }),

    // ── Preços por Legenda Canônica ───────────────────────────────────────────
    /**
     * Retorna as legendas ativas e o histórico de valores do médico no contexto
     * financeiro da unidade. O responsável só acessa as próprias unidades; o
     * admin_master pode supervisionar qualquer uma delas.
     */
    listDoctorLegendPrices: protectedProcedure
      .input(z.object({
        financialResponsibleId: z.number(),
        unitId: z.number().int().positive(),
        doctorUserId: z.number().int().positive(),
      }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        await assertCanManageFinancialPrices(db, ctx.user, input.unitId, input.financialResponsibleId);

        const [legends, prices] = await Promise.all([
          db.select({
            id: exam_legends.id,
            exam_name: exam_legends.exam_name,
            modality: exam_legends.modality,
            financial_event_count: exam_legends.financial_event_count,
          })
            .from(exam_legends)
            .where(eq(exam_legends.is_active, true))
            .orderBy(exam_legends.modality, exam_legends.sort_order, exam_legends.exam_name),
          db.select()
            .from(billing_doctor_exam_legend_prices)
            .where(and(
              eq(billing_doctor_exam_legend_prices.unit_id, input.unitId),
              eq(billing_doctor_exam_legend_prices.doctor_user_id, input.doctorUserId),
            ))
            .orderBy(desc(billing_doctor_exam_legend_prices.starts_at)),
        ]);

        return { legends, prices };
      }),

    /** Cria uma nova vigência de preço para uma legenda canônica e encerra a anterior. */
    setDoctorLegendPrice: protectedProcedure
      .input(z.object({
        financialResponsibleId: z.number(),
        unitId: z.number().int().positive(),
        doctorUserId: z.number().int().positive(),
        examLegendId: z.number().int().positive(),
        pricePerEvent: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Informe um valor monetário válido.'),
        startsAt: z.string(),
        endsAt: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        await assertCanManageFinancialPrices(db, ctx.user, input.unitId, input.financialResponsibleId);

        const legend = await db.select({ id: exam_legends.id })
          .from(exam_legends)
          .where(and(eq(exam_legends.id, input.examLegendId), eq(exam_legends.is_active, true)))
          .limit(1);
        if (!legend[0]) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Legenda canônica ativa não encontrada.' });
        }

        const startsAt = new Date(input.startsAt);
        if (Number.isNaN(startsAt.getTime())) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Data de início inválida.' });
        }
        const currentRows = await db.select({ id: billing_doctor_exam_legend_prices.id })
          .from(billing_doctor_exam_legend_prices)
          .where(and(
            eq(billing_doctor_exam_legend_prices.unit_id, input.unitId),
            eq(billing_doctor_exam_legend_prices.doctor_user_id, input.doctorUserId),
            eq(billing_doctor_exam_legend_prices.exam_legend_id, input.examLegendId),
            lte(billing_doctor_exam_legend_prices.starts_at, new Date()),
            or(isNull(billing_doctor_exam_legend_prices.ends_at), gte(billing_doctor_exam_legend_prices.ends_at, new Date())),
          ))
          .limit(1);
        await assertCycleAlignedPriceStart(db, input.unitId, startsAt, currentRows.length > 0);

        if (currentRows[0]) {
          await db.update(billing_doctor_exam_legend_prices)
            .set({ ends_at: new Date(startsAt.getTime() - 24 * 60 * 60 * 1000) })
            .where(eq(billing_doctor_exam_legend_prices.id, currentRows[0].id));
        }

        const result = await db.insert(billing_doctor_exam_legend_prices).values({
          unit_id: input.unitId,
          doctor_user_id: input.doctorUserId,
          exam_legend_id: input.examLegendId,
          price_per_event: input.pricePerEvent,
          starts_at: startsAt,
          ends_at: input.endsAt ? new Date(input.endsAt) : null,
          created_by: ctx.user.id,
        });
        return { id: Number(result[0].insertId) };
      }),

    // ── Apuração de Competência ────────────────────────────────────────────────
    calculateCompetence: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        return await calculateCompetence(input.year, input.month, ctx.user.id);
      }),

    closeCompetence: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        return await closeCompetence(input.financialResponsibleId, input.year, input.month, ctx.user.id);
      }),

    reopenCompetence: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        await reopenCompetence(input.financialResponsibleId, input.year, input.month);
        return { success: true };
      }),

    // ── Consultas de Itens e Consolidados ─────────────────────────────────────
    getReportItems: protectedProcedure
      .input(z.object({
        financialResponsibleId: z.number().optional(),
        unitId: z.number().optional(),
        doctorUserId: z.number().optional(),
        year: z.number(),
        month: z.number(),
      }))
      .query(async ({ input, ctx }) => {
        // admin_master: vê tudo
        // responsavel_financeiro: só seu próprio
        // medico: só seus próprios laudos
        if (ctx.user.role === 'responsavel_financeiro') {
          
          const respId = await resolveResponsibleContext(ctx.user, input.financialResponsibleId);
          if (!respId) {
            throw new TRPCError({ code: 'FORBIDDEN' });
          }
          input.financialResponsibleId = respId;
        } else if (ctx.user.role === 'medico') {
          if (input.doctorUserId && input.doctorUserId !== ctx.user.id) {
            throw new TRPCError({ code: 'FORBIDDEN' });
          }
          input.doctorUserId = ctx.user.id;
        } else if (ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        return await listBillingReportItems({
          financial_responsible_id: input.financialResponsibleId,
          unit_id: input.unitId,
          doctor_user_id: input.doctorUserId,
          competence_year: input.year,
          competence_month: input.month,
        });
      }),

    getAdminSummary: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        return await getAdminConsolidated(input.year, input.month);
      }),

    getResponsibleSummary: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const ALLOWED = ['responsavel_financeiro', 'unit_admin', 'admin_master'];
        if (!ALLOWED.includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
        
        const respId = await resolveResponsibleContext(ctx.user, input?.financialResponsibleId);
        if (!respId) return { byUnit: [], byDoctor: [], totalSystem: '0.00', totalDoctors: '0.00', totalGeral: '0.00' };
        const { systemCycles, doctorCycles, totalSystem, totalDoctors, totalGeral } = await getResponsibleCycleSummary(respId);
        // Agregar por unidade
        const byUnitMap = new Map<number, { unit_id: number; unit_name: string; reports_count: number; system_amount_due: number; doctor_amount_due: number; cycle?: object }>();
        for (const row of systemCycles) {
          const uid = row.summary.unit_id;
          const existing = byUnitMap.get(uid) ?? { unit_id: uid, unit_name: row.unit_name ?? '', reports_count: 0, system_amount_due: 0, doctor_amount_due: 0, cycle: row.cycle };
          existing.reports_count += row.summary.reports_count ?? 0;
          existing.system_amount_due += toMoney(row.summary.amount_due ?? 0);
          byUnitMap.set(uid, existing);
        }
        for (const row of doctorCycles) {
          const uid = row.summary.unit_id;
          const existing = byUnitMap.get(uid) ?? { unit_id: uid, unit_name: row.unit_name ?? '', reports_count: 0, system_amount_due: 0, doctor_amount_due: 0 };
          existing.doctor_amount_due += toMoney(row.summary.amount_due ?? 0);
          byUnitMap.set(uid, existing);
        }
        const byUnit = Array.from(byUnitMap.values()).map(r => ({
          ...r,
          system_amount_due: r.system_amount_due.toFixed(2),
          doctor_amount_due: r.doctor_amount_due.toFixed(2),
        }));
        // Agregar por médico
        type DRow = { unit_id: number; unit_name: string; doctor_user_id: number; doctor_name: string; reports_count: number; amount_due: number };
        const byDoctorMap = new Map<string, DRow>();
        for (const row of doctorCycles) {
          const key = `${row.summary.unit_id}-${row.summary.doctor_user_id}`;
          const existing = byDoctorMap.get(key) ?? { unit_id: row.summary.unit_id, unit_name: row.unit_name ?? '', doctor_user_id: row.summary.doctor_user_id, doctor_name: row.doctor_name ?? '', reports_count: 0, amount_due: 0 };
          existing.reports_count += row.summary.reports_count ?? 0;
          existing.amount_due += toMoney(row.summary.amount_due ?? 0);
          byDoctorMap.set(key, existing);
        }
        const byDoctor = Array.from(byDoctorMap.values()).map(r => ({ ...r, amount_due: r.amount_due.toFixed(2) }));
        return { byUnit, byDoctor, totalSystem, totalDoctors, totalGeral };
      }),

    getDoctorSummary: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'medico' && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        const [byResponsible, items] = await Promise.all([
          getDoctorMonthlySummary(ctx.user.id, input.year, input.month),
          listBillingReportItems({ doctor_user_id: ctx.user.id, competence_year: input.year, competence_month: input.month }),
        ]);
        return { byResponsible, items };
      }),
    getMyResponsible: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        
        const respId = await resolveResponsibleContext(ctx.user, input?.financialResponsibleId);
        if (!respId) return null;
        return await getFinancialResponsibleById(respId) ?? null;
      }),

    /**
     * Todos os responsáveis financeiros vinculados ao usuário logado, para o
     * seletor de contexto no frontend (suporte a múltiplos responsáveis,
     * decisão de produto — 2026-09-17). Quando length <= 1 o frontend não
     * precisa mostrar seletor nenhum — mantém a experiência de sempre.
     */
    listMyResponsibles: protectedProcedure
      .query(async ({ ctx }) => {
        return await listResponsiblesForUser(ctx.user.id);
      }),

    // ─── V3 Operacional: Ciclos Financeiros ──────────────────────────────────

    getCycleConfig: protectedProcedure
      .input(z.object({ unit_id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'responsavel_financeiro' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id); // P4
        
        return await getCycleConfig(input.unit_id);
      }),

    setCycleConfig: protectedProcedure
      .input(z.object({
        unit_id: z.number(),
        doctor_cycle_day: z.number().min(1).max(28),
        system_cycle_day: z.number().min(1).max(28),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        await upsertCycleConfig({ ...input, created_by: ctx.user.id });
        return { success: true };
      }),

    getDoctorProduction: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'medico' && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        return await getDoctorFinancialSummary(ctx.user.id);
      }),

    getDoctorCycleEvents: protectedProcedure
      .input(z.object({ doctor_cycle_id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'medico' && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        return await getDoctorCycleEvents(ctx.user.id, input.doctor_cycle_id);
      }),

    markReceived: protectedProcedure
      .input(z.object({
        doctor_cycle_id: z.number(),
        unit_id: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'medico' && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        // LOG-03: verificar que o ciclo pertence ao médico autenticado (ou admin_master pode usar qualquer ciclo)
        if (ctx.user.role === 'medico') {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
          
          
          const [cycle] = await db.select({ id: billing_cycle_doctor_summary.doctor_cycle_id })
            .from(billing_cycle_doctor_summary)
            .where(and(
              eq(billing_cycle_doctor_summary.doctor_cycle_id, input.doctor_cycle_id),
              eq(billing_cycle_doctor_summary.unit_id, input.unit_id),
              eq(billing_cycle_doctor_summary.doctor_user_id, ctx.user.id),
            ));
          if (!cycle) throw new TRPCError({ code: 'FORBIDDEN', message: 'Ciclo não encontrado ou não pertence a este médico' });
        }
        
        await markDoctorCycleReceived(input.doctor_cycle_id, input.unit_id, ctx.user.id, ctx.user.id);
        return { success: true };
      }),

    getResponsibleCycles: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'responsavel_financeiro' && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        const respId = await resolveResponsibleContext(ctx.user, input?.financialResponsibleId);
        if (!respId) return { systemCycles: [], doctorCycles: [] };
        return await getResponsibleCycleSummary(respId);
      }),

    /**
     * Histórico de receita/custo/lucro por ciclo fechado, para o gráfico do
     * responsável. Receita é ESTIMATIVA (preço externo vigente hoje aplicado
     * retroativamente) — ver comentário de getResponsibleProfitHistory em db.ts.
     */
    getResponsibleProfitHistory: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'responsavel_financeiro' && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const respId = await resolveResponsibleContext(ctx.user, input?.financialResponsibleId);
        if (!respId) return { periods: [] };
        const { periods } = await getResponsibleProfitHistory(respId);
        return {
          periods: periods.map((p) => ({
            ...p,
            cycle_label: `${formatCycleCalendarDate(new Date(p.cycle_starts_at))} a ${formatCycleCalendarDate(new Date(new Date(p.cycle_ends_at).getTime() - 1))}`,
          })),
        };
      }),

    getUnitFinancialInfo: protectedProcedure
      .input(z.object({ unit_id: z.number() }))
      .query(async ({ input, ctx }) => {
        const allowedRoles = ['medico', 'admin_master', 'responsavel_financeiro', 'unit_admin'];
        if (!allowedRoles.includes(ctx.user.role)) {
          return { status: 'no_access' as const, cycle_period: null, cycle_amount: null, cycle_visits: null, price_per_report: null };
        }
        // Guard: não-admin precisa ter view_financial na unidade
        if (ctx.user.role !== 'admin_master') {
          const perm = await getUserUnitPermission(ctx.user.id, input.unit_id);
          if (!perm?.view_financial) {
            return { status: 'no_access' as const, cycle_period: null, cycle_amount: null, cycle_visits: null, price_per_report: null };
          }
        }
        
        const result = await getDoctorUnitFinancialInfo(ctx.user.id, input.unit_id);
        if (!result) {
          return { status: 'no_config' as const, cycle_period: null, cycle_amount: null, cycle_visits: null, price_per_report: null };
        }
        return { status: 'ok' as const, ...result };
      }),

    closeCycle: protectedProcedure
      .input(z.object({ cycle_id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Decisão de 22/09/2026 (Alessandro): responsavel_financeiro também
        // pode encerrar o ciclo da própria unidade — antes era admin_master
        // only. closeBillingCycle só recebe cycle_id, então resolve o
        // unit_id do ciclo primeiro pra checar a autorização por unidade
        // (mesma regra de setUnitCycle/setUnitModalityPrice).
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const cycleRows = await db
          .select({ unit_id: billing_cycles.unit_id })
          .from(billing_cycles)
          .where(eq(billing_cycles.id, input.cycle_id))
          .limit(1);
        if (!cycleRows[0]) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Ciclo não encontrado.' });
        }
        await assertCanManageFinancialPrices(db, ctx.user, cycleRows[0].unit_id);

        await closeBillingCycle(input.cycle_id, ctx.user.id);
        return { success: true };
      }),

    listUnitCycles: protectedProcedure
      .input(z.object({
        unit_id: z.number(),
        cycle_type: z.enum(['doctor', 'system']).optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'responsavel_financeiro' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id); // P4
        
        return await listUnitCycles(input.unit_id, input.cycle_type);
      }),

    // ── Listagem global de preços (para páginas de gestão financeira) ──────────
    listAllDoctorPrices: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) return [];

        
        
        
        return await db
          .select({
            id: billing_doctor_unit_prices.id,
            financial_responsible_id: billing_doctor_unit_prices.financial_responsible_id,
            unit_id: billing_doctor_unit_prices.unit_id,
            unit_name: units.name,
            doctor_user_id: billing_doctor_unit_prices.doctor_user_id,
            doctor_name: users.name,
            price_per_report: billing_doctor_unit_prices.price_per_report,
            starts_at: billing_doctor_unit_prices.starts_at,
            ends_at: billing_doctor_unit_prices.ends_at,
          })
          .from(billing_doctor_unit_prices)
          .leftJoin(users, eq(users.id, billing_doctor_unit_prices.doctor_user_id))
          .leftJoin(units, eq(units.id, billing_doctor_unit_prices.unit_id))
          .orderBy(billing_doctor_unit_prices.unit_id, billing_doctor_unit_prices.doctor_user_id);
      }),

    listAllSystemPrices: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) return [];

        
        
        return await db
          .select({
            id: billing_system_unit_prices.id,
            financial_responsible_id: billing_system_unit_prices.financial_responsible_id,
            unit_id: billing_system_unit_prices.unit_id,
            unit_name: units.name,
            price_per_report: billing_system_unit_prices.price_per_report,
            starts_at: billing_system_unit_prices.starts_at,
            ends_at: billing_system_unit_prices.ends_at,
          })
          .from(billing_system_unit_prices)
          .leftJoin(units, eq(units.id, billing_system_unit_prices.unit_id))
          .orderBy(billing_system_unit_prices.unit_id);
      }),

    // ── Detalhe do médico para admin_master ──────────────────────────────────────
    getDoctorDetail: protectedProcedure
      .input(z.object({ doctorUserId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) return null;
        
        
        // Dados do médico
        const [doctor] = await db.select().from(users).where(eq(users.id, input.doctorUserId)).limit(1);
        if (!doctor) return null;
        // Unidades vinculadas
        const unitLinks = await db
          .select({ unit_id: user_unit_permissions.unit_id, unit_name: units.name })
          .from(user_unit_permissions)
          .leftJoin(units, eq(units.id, user_unit_permissions.unit_id))
          .where(eq(user_unit_permissions.user_id, input.doctorUserId));
        // Preços ativos por unidade (ends_at IS NULL)
        const prices = await db
          .select({
            id: billing_doctor_unit_prices.id,
            unit_id: billing_doctor_unit_prices.unit_id,
            unit_name: units.name,
            price_per_report: billing_doctor_unit_prices.price_per_report,
            starts_at: billing_doctor_unit_prices.starts_at,
            ends_at: billing_doctor_unit_prices.ends_at,
            financial_responsible_id: billing_doctor_unit_prices.financial_responsible_id,
          })
          .from(billing_doctor_unit_prices)
          .leftJoin(units, eq(units.id, billing_doctor_unit_prices.unit_id))
          .where(and(
            eq(billing_doctor_unit_prices.doctor_user_id, input.doctorUserId),
            isNull(billing_doctor_unit_prices.ends_at),
          ));
        // Buscar nome do responsável ativo por unidade
        const now = new Date();
        const unitResponsibles: Record<number, string | null> = {};
        for (const ul of unitLinks) {
          if (!ul.unit_id) continue;
          const rows = await db.select({ legal_name: financial_responsibles.legal_name })
            .from(financial_responsible_units)
            .leftJoin(financial_responsibles, eq(financial_responsibles.id, financial_responsible_units.financial_responsible_id))
            .where(and(
              eq(financial_responsible_units.unit_id, ul.unit_id),
              lte(financial_responsible_units.starts_at, now),
              or(isNull(financial_responsible_units.ends_at), gte(financial_responsible_units.ends_at, now))
            ))
            .orderBy(desc(financial_responsible_units.starts_at))
            .limit(1);
          unitResponsibles[ul.unit_id] = rows[0]?.legal_name ?? null;
        }
        return { doctor, unitLinks, prices, unitResponsibles };
      }),

    getDoctorFinancialDetail: protectedProcedure
      .input(z.object({ doctorUserId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        return await getDoctorFinancialSummary(input.doctorUserId);
      }),

    getDoctorCycleEventsForAdmin: protectedProcedure
      .input(z.object({ doctorUserId: z.number(), doctorCycleId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        return await getDoctorCycleEvents(input.doctorUserId, input.doctorCycleId);
      }),

    // ── Detalhe da Unidade (admin) ─────────────────────────────────────────────
    getUnitDetail: protectedProcedure
      .input(z.object({ unitId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) return null;
        // PRG-05: todas as tabelas já importadas estaticamente no topo
        
        // Dados da unidade
        const [unit] = await db.select().from(units).where(eq(units.id, input.unitId)).limit(1);
        if (!unit) return null;
        // Preços de médicos ativos nessa unidade
        const doctorPrices = await db
          .select({
            id: billing_doctor_unit_prices.id,
            doctor_user_id: billing_doctor_unit_prices.doctor_user_id,
            doctor_name: users.name,
            price_per_report: billing_doctor_unit_prices.price_per_report,
            starts_at: billing_doctor_unit_prices.starts_at,
            ends_at: billing_doctor_unit_prices.ends_at,
          })
          .from(billing_doctor_unit_prices)
          .leftJoin(users, eq(users.id, billing_doctor_unit_prices.doctor_user_id))
          .where(and(
            eq(billing_doctor_unit_prices.unit_id, input.unitId),
            isNull(billing_doctor_unit_prices.ends_at),
          ));
        // Preço do sistema ativo
        const systemPriceRows = await db
          .select()
          .from(billing_system_unit_prices)
          .where(and(
            eq(billing_system_unit_prices.unit_id, input.unitId),
            isNull(billing_system_unit_prices.ends_at),
          ))
          .orderBy(desc(billing_system_unit_prices.starts_at))
          .limit(1);
        const systemPrice = systemPriceRows[0] ?? null;
        // Responsável financeiro ativo
        const respLinks = await db
          .select()
          .from(financial_responsible_units)
          .where(and(
            eq(financial_responsible_units.unit_id, input.unitId),
            isNull(financial_responsible_units.ends_at),
          ))
          .limit(1);
        const respLink = respLinks[0] ?? null;
        // Ciclos da unidade (últimos 12)
        const cycles = await db
          .select()
          .from(billing_cycles)
          .where(eq(billing_cycles.unit_id, input.unitId))
          .orderBy(desc(billing_cycles.starts_at))
          .limit(12);
        // Resumo financeiro: total laudos e valores nos ciclos abertos
        const openDoctorSummaries = await db
          .select({ summary: billing_cycle_doctor_summary, doctor_name: users.name })
          .from(billing_cycle_doctor_summary)
          .leftJoin(users, eq(users.id, billing_cycle_doctor_summary.doctor_user_id))
          .leftJoin(billing_cycles, eq(billing_cycles.id, billing_cycle_doctor_summary.doctor_cycle_id))
          .where(and(
            eq(billing_cycle_doctor_summary.unit_id, input.unitId),
            eq(billing_cycles.status, 'open'),
          ));
        const openSystemSummaries = await db
          .select({ summary: billing_cycle_system_summary })
          .from(billing_cycle_system_summary)
          .leftJoin(billing_cycles, eq(billing_cycles.id, billing_cycle_system_summary.system_cycle_id))
          .where(and(
            eq(billing_cycle_system_summary.unit_id, input.unitId),
            eq(billing_cycles.status, 'open'),
          ));
        const totalReports = openDoctorSummaries.reduce((s, r) => s + (r.summary.reports_count ?? 0), 0);
        const totalDoctorAmount = openDoctorSummaries.reduce((s, r) => s + toMoney(r.summary.amount_due ?? 0), 0);
        const totalSystemAmount = openSystemSummaries.reduce((s, r) => s + toMoney(r.summary.amount_due ?? 0), 0);
        return {
          unit,
          doctorPrices,
          systemPrice,
          respLink,
          cycles,
          openDoctorSummaries: openDoctorSummaries.map(r => ({ ...r.summary, doctor_name: r.doctor_name })),
          totalReports,
          totalDoctorAmount: totalDoctorAmount.toFixed(2),
          totalSystemAmount: totalSystemAmount.toFixed(2),
        };
      }),

    // ── Auditoria e Reset de Médico (admin_master) ─────────────────────────────
    getDoctorAuditReport: protectedProcedure
      .input(z.object({
        doctorUserId: z.number(),
        unit_id: z.number().optional(),
        from_date: z.string().optional(),
        to_date: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        const doctor = await getUserById(input.doctorUserId);
        if (!doctor) throw new TRPCError({ code: 'NOT_FOUND', message: 'Médico não encontrado' });
        const events = await getDoctorAuditReport(input.doctorUserId, {
          unit_id: input.unit_id,
          from_date: input.from_date ? new Date(input.from_date) : undefined,
          to_date: input.to_date ? new Date(input.to_date) : undefined,
        });
        return { doctor, events };
      }),

    resetDoctorBilling: protectedProcedure
      .input(z.object({ doctorUserId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        const result = await resetDoctorBilling(input.doctorUserId);
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: null,
          action: 'RESET_DOCTOR_BILLING',
          target_type: 'USER',
          target_id: String(input.doctorUserId),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
          metadata: result,
        });
        return result;
      }),

    // ── Detalhe do Responsável (admin) ────────────────────────────────────────
    getResponsibleDetail: protectedProcedure
      .input(z.object({ responsibleId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        // PRG-05: funções já importadas estaticamente no topo
        const [responsible, units, users, summary] = await Promise.all([
          getFinancialResponsibleById(input.responsibleId),
          listUnitsForResponsible(input.responsibleId),
          listUsersForResponsible(input.responsibleId),
          getResponsibleCycleSummary(input.responsibleId),
        ]);
        if (!responsible) throw new TRPCError({ code: 'NOT_FOUND' });
        // Agregar por unidade
        const byUnitMap = new Map<number, { unit_id: number; unit_name: string; reports_count: number; system_amount_due: number; doctor_amount_due: number }>();
        for (const row of summary.systemCycles) {
          const uid = row.summary.unit_id;
          const existing = byUnitMap.get(uid) ?? { unit_id: uid, unit_name: row.unit_name ?? '', reports_count: 0, system_amount_due: 0, doctor_amount_due: 0 };
          existing.reports_count += row.summary.reports_count ?? 0;
          existing.system_amount_due += toMoney(row.summary.amount_due ?? 0);
          byUnitMap.set(uid, existing);
        }
        for (const row of summary.doctorCycles) {
          const uid = row.summary.unit_id;
          const existing = byUnitMap.get(uid) ?? { unit_id: uid, unit_name: row.unit_name ?? '', reports_count: 0, system_amount_due: 0, doctor_amount_due: 0 };
          existing.doctor_amount_due += toMoney(row.summary.amount_due ?? 0);
          byUnitMap.set(uid, existing);
        }
        const byUnit = Array.from(byUnitMap.values()).map(r => ({
          ...r,
          system_amount_due: r.system_amount_due.toFixed(2),
          doctor_amount_due: r.doctor_amount_due.toFixed(2),
        }));
        // Agregar por médico
        type DRow = { unit_id: number; unit_name: string; doctor_user_id: number; doctor_name: string; reports_count: number; amount_due: number };
        const byDoctorMap = new Map<string, DRow>();
        for (const row of summary.doctorCycles) {
          const key = `${row.summary.unit_id}-${row.summary.doctor_user_id}`;
          const existing = byDoctorMap.get(key) ?? { unit_id: row.summary.unit_id, unit_name: row.unit_name ?? '', doctor_user_id: row.summary.doctor_user_id, doctor_name: row.doctor_name ?? '', reports_count: 0, amount_due: 0 };
          existing.reports_count += row.summary.reports_count ?? 0;
          existing.amount_due += toMoney(row.summary.amount_due ?? 0);
          byDoctorMap.set(key, existing);
        }
        const byDoctor = Array.from(byDoctorMap.values()).map(r => ({ ...r, amount_due: r.amount_due.toFixed(2) }));
        return {
          responsible,
          units,
          users,
          byUnit,
          byDoctor,
          totalSystem: summary.totalSystem,
          totalDoctors: summary.totalDoctors,
          totalGeral: summary.totalGeral,
        };
      }),

    // ── Procedures de Contexto Completo (novas telas práticas) ────────────────
    getDoctorFullContext: protectedProcedure
      .input(z.object({ doctorUserId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        return await getDoctorFullContext(input.doctorUserId);
      }),

    getUnitFullContext: protectedProcedure
      .input(z.object({ unitId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        return await getUnitFullContext(input.unitId);
      }),

    getResponsibleFullDashboard: protectedProcedure
      .input(z.object({
        responsibleId: z.number(),
        page: z.number().optional(),
        pageSize: z.number().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const allowed = ['admin_master', 'responsavel_financeiro'];
        if (!allowed.includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
        if (ctx.user.role === 'responsavel_financeiro') {
          const ownResponsibleIds = await getResponsibleIdsForUser(ctx.user.id);
          if (!ownResponsibleIds.includes(input.responsibleId)) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem acesso a este responsável financeiro.' });
          }
        }
        
        return await getResponsibleFullDashboard(input.responsibleId, {
          page: input.page,
          pageSize: input.pageSize,
          from: input.from,
          to: input.to,
        });
      }),

    getDoctorOperationalBalance: protectedProcedure
      .input(z.object({ doctorUserId: z.number() }))
      .query(async ({ input, ctx }) => {
        const allowed = ['admin_master', 'medico'];
        if (!allowed.includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
        if (ctx.user.role === 'medico' && ctx.user.id !== input.doctorUserId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        return await getDoctorOperationalBalance(input.doctorUserId);
      }),

    setSystemPriceDirect: protectedProcedure
      .input(z.object({
        unitId: z.number(),
        pricePerReport: z.string(),
        startsAt: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        assertAdmin(ctx.user.role);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        await assertCanAccessFinancialUnit(db, ctx.user, input.unitId); // P4
        // C4: Não criar mais "Sem Responsável" automaticamente.
        // Exigir que a unidade já tenha um responsável financeiro ativo.
        
        const responsible = await getActiveResponsibleForUnit(input.unitId);
        if (!responsible) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Esta unidade não possui um responsável financeiro ativo. Vincule um responsável antes de configurar preços.',
          });
        }
        const id = await upsertSystemUnitPrice({
          financial_responsible_id: responsible.financial_responsible_id,
          unit_id: input.unitId,
          price_per_report: input.pricePerReport,
          starts_at: new Date(input.startsAt),
          ends_at: null,
          created_by: ctx.user.id,
        });
        return { id, responsible_id: responsible.financial_responsible_id };
      }),

    linkResponsibleToUnitDirect: protectedProcedure
      .input(z.object({
        unitId: z.number(),
        responsibleId: z.number(),
        startsAt: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        await linkUnitToResponsible(
          input.responsibleId,
          input.unitId,
          new Date(input.startsAt),
          undefined,
          ctx.user.id
        );
        return { ok: true };
      }),

    // ── Configurar preço do médico por unidade direto do cadastro admin ──────────────────────
    setDoctorPriceDirect: protectedProcedure
      .input(z.object({
        doctorUserId: z.number(),
        unitId: z.number(),
        pricePerReport: z.string(),
        startsAt: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        await assertCanManageFinancialPrices(db, ctx.user, input.unitId);
        // C4: Não criar mais "Sem Responsável" automaticamente.
        // Exigir que a unidade já tenha um responsável financeiro ativo.
        
        const responsible = await getActiveResponsibleForUnit(input.unitId);
        if (!responsible) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Esta unidade não possui um responsável financeiro ativo. Vincule um responsável antes de configurar preços.',
          });
        }
        await assertCanManageFinancialPrices(db, ctx.user, input.unitId, responsible.financial_responsible_id);
        const startsAt = new Date(input.startsAt);
        await assertDoctorUnitPriceStart(db, input.unitId, input.doctorUserId, startsAt);
        const id = await upsertDoctorUnitPrice({
          financial_responsible_id: responsible.financial_responsible_id,
          unit_id: input.unitId,
          doctor_user_id: input.doctorUserId,
          price_per_report: input.pricePerReport,
          starts_at: startsAt,
          ends_at: null,
          created_by: ctx.user.id,
        });
        return { id, responsible_id: responsible.financial_responsible_id };
      }),

    // ─── Visão operacional do dono do sistema por unidade em tempo real ───────
    getSystemOwnerLiveByUnit: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        return await getSystemOwnerLiveByUnit();
      }),

    // ─── P2: Contas a Receber do Sistema ─────────────────────────────────────
    listSystemReceivables: protectedProcedure
      .input(z.object({
        cycleStatus: z.enum(['open', 'closed', 'all']).default('all'),
        paidStatus: z.enum(['pending', 'paid', 'all']).default('all'),
        unitId: z.number().optional(),
        responsibleId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        
        
        const conditions: SQL[] = [eq(billing_cycles.cycle_type, 'system')];
        if (input?.cycleStatus && input.cycleStatus !== 'all') conditions.push(eq(billing_cycles.status, input.cycleStatus as 'open' | 'closed'));
        if (input?.paidStatus && input.paidStatus !== 'all') conditions.push(eq(billing_cycles.paid_status, input.paidStatus as 'pending' | 'paid'));
        if (input?.unitId) conditions.push(eq(billing_cycles.unit_id, input.unitId));
        if (input?.responsibleId) conditions.push(eq(billing_cycles.financial_responsible_id, input.responsibleId));
        // C3: query única com JOINs (elimina N+1)
        const rows = await db
          .select({
            cycle: billing_cycles,
            unit_name: units.name,
            responsible_name: financial_responsibles.legal_name,
            paid_by_name: users.name,
          })
          .from(billing_cycles)
          .leftJoin(units, eq(billing_cycles.unit_id, units.id))
          .leftJoin(financial_responsibles, eq(billing_cycles.financial_responsible_id, financial_responsibles.id))
          .leftJoin(users, eq(billing_cycles.paid_by_user_id, users.id))
          .where(and(...conditions))
          .orderBy(billing_cycles.id);
        return rows.map(row => ({
          ...row.cycle,
          unit_name: row.unit_name ?? `Unidade ${row.cycle.unit_id}`,
          responsible_name: row.responsible_name ?? null,
          paid_by_name: row.paid_by_name ?? null,
          // Aliases esperados pelo frontend
          total_system_amount: row.cycle.total_amount,
          total_doctor_amount: null as string | null,
          report_count: row.cycle.total_reports,
        }));
      }),

    markCyclePaid: protectedProcedure
      .input(z.object({ cycleId: z.number(), note: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        
        
        // C8: só permite marcar como pago ciclos já fechados
        const [cycle] = await db.select({ status: billing_cycles.status }).from(billing_cycles).where(eq(billing_cycles.id, input.cycleId)).limit(1);
        if (!cycle) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ciclo não encontrado.' });
        if (cycle.status !== 'closed') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Feche o ciclo antes de marcá-lo como pago.' });
        await db.update(billing_cycles).set({ paid_status: 'paid', paid_at: new Date(), paid_by_user_id: ctx.user.id, paid_note: input.note ?? null }).where(eq(billing_cycles.id, input.cycleId));
        return { ok: true };
      }),

    unmarkCyclePaid: protectedProcedure
      .input(z.object({ cycleId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        
        
        await db.update(billing_cycles).set({ paid_status: 'pending', paid_at: null, paid_by_user_id: null, paid_note: null }).where(eq(billing_cycles.id, input.cycleId));
        return { ok: true };
      }),

    addCycleNote: protectedProcedure
      .input(z.object({ cycleId: z.number(), note: z.string().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        
        
        await db.update(billing_cycles).set({ paid_note: input.note }).where(eq(billing_cycles.id, input.cycleId));
        return { ok: true };
      }),

    // ─── P3: Extrato de Produção Médica ──────────────────────────────────────
    getDoctorStatement: protectedProcedure
      .input(z.object({
        doctorUserId: z.number().optional(),
        unitId: z.number().optional(),
        cycleId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        // C5: paginação para evitar truncamento silencioso
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(500).default(200),
      }).optional())
      .query(async ({ ctx, input }) => {
        const isAdmin = ctx.user.role === 'admin_master';
        const isResp  = ctx.user.role === 'responsavel_financeiro';
        const isDoctor = ctx.user.role === 'medico';
        if (!isAdmin && !isResp && !isDoctor) throw new TRPCError({ code: 'FORBIDDEN' });
        // Médico: sempre vê apenas seus próprios dados
        const targetDoctorId = isDoctor ? ctx.user.id : (input?.doctorUserId ?? undefined);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        
        
        // Responsável financeiro: filtrar apenas pelas suas unidades
        let allowedUnitIds: number[] | undefined = undefined;
        if (isResp) {
          
          // Relatório agregado: soma as unidades de TODOS os responsáveis do usuário
          // (não precisa de contexto único, diferente das telas "meu resumo").
          const myRespIds = await getResponsibleIdsForUser(ctx.user.id);
          if (!myRespIds.length) return [];
          const now = new Date();
          const unitLinks = await db.select({ unit_id: financial_responsible_units.unit_id })
            .from(financial_responsible_units)
            .where(and(
              inArray(financial_responsible_units.financial_responsible_id, myRespIds),
              lte(financial_responsible_units.starts_at, now),
              or(isNull(financial_responsible_units.ends_at), gte(financial_responsible_units.ends_at, now))
            ));
          allowedUnitIds = Array.from(new Set(unitLinks.map(u => u.unit_id)));
          if (allowedUnitIds.length === 0) return [];
        }
        const conditions: SQL[] = [];
        if (targetDoctorId) conditions.push(eq(billing_visit_events.doctor_user_id, targetDoctorId));
        if (allowedUnitIds) conditions.push(inArray(billing_visit_events.unit_id, allowedUnitIds));
        if (input?.unitId) conditions.push(eq(billing_visit_events.unit_id, input.unitId));
        if (input?.cycleId) conditions.push(eq(billing_visit_events.doctor_cycle_id, input.cycleId));
        if (input?.startDate) conditions.push(gte(billing_visit_events.study_date, new Date(input.startDate)));
        if (input?.endDate) conditions.push(lte(billing_visit_events.study_date, new Date(input.endDate)));
        const page = input?.page ?? 1;
        const pageSize = input?.pageSize ?? 200;
        // C5: contar total de registros para metadata de paginação
        
        const [countRow] = await db.select({ count: sqlFn<number>`COUNT(*)` })
          .from(billing_visit_events)
          .where(conditions.length > 0 ? and(...conditions) : undefined);
        const total = Number(countRow?.count ?? 0);
        const rows = await db
          .select({ event: billing_visit_events, unit_name: units.name, doctor_name: users.name })
          .from(billing_visit_events)
          .leftJoin(units, eq(billing_visit_events.unit_id, units.id))
          .leftJoin(users, eq(billing_visit_events.doctor_user_id, users.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(billing_visit_events.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize);
        type DayGroup = { date: string; reports: number; amount: number };
        type UnitGroup = { unit_id: number; unit_name: string; reports: number; amount: number; price_per_report: string; days: DayGroup[] };
        type DoctorGroup = { doctor_id: number; doctor_name: string; total_reports: number; total_amount: number; units: UnitGroup[] };
        const doctorMap = new Map<number, DoctorGroup>();
        for (const row of rows) {
          const did = row.event.doctor_user_id;
          if (!doctorMap.has(did)) doctorMap.set(did, { doctor_id: did, doctor_name: row.doctor_name ?? `Médico ${did}`, total_reports: 0, total_amount: 0, units: [] });
          const doc = doctorMap.get(did)!;
          const uid = row.event.unit_id;
          let ug = doc.units.find(u => u.unit_id === uid);
          if (!ug) { ug = { unit_id: uid, unit_name: row.unit_name ?? `Unidade ${uid}`, reports: 0, amount: 0, price_per_report: row.event.doctor_price_applied ?? '0', days: [] }; doc.units.push(ug); }
          const rawDate = row.event.study_date;
          const d = rawDate ? (rawDate instanceof Date ? rawDate.toISOString().split('T')[0] : String(rawDate).split('T')[0]) : 'sem-data';
          let dg = ug.days.find(x => x.date === d);
          if (!dg) { dg = { date: d, reports: 0, amount: 0 }; ug.days.push(dg); }
          const amt = toMoney(row.event.doctor_price_applied ?? 0);
          dg.reports += 1; dg.amount += amt;
          ug.reports += 1; ug.amount += amt;
          doc.total_reports += 1; doc.total_amount += amt;
        }
        return { data: Array.from(doctorMap.values()), total, page, pageSize, hasMore: total > page * pageSize };
      }),

    // ─── P4: Dívida do Responsável por Médico ────────────────────────────────
    getResponsibleDebtByDoctor: protectedProcedure
      .input(z.object({
        responsibleId: z.number().optional(),
        cycleId: z.number().optional(),
        unitId: z.number().optional(),
        // C5: paginação
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(500).default(200),
      }).optional())
      .query(async ({ ctx, input }) => {
        const isAdmin = ctx.user.role === 'admin_master';
        const isResp = ctx.user.role === 'responsavel_financeiro';
        if (!isAdmin && !isResp) throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        
        
        let targetResponsibleId = input?.responsibleId;
        if (isResp && !isAdmin) {
          // FIX (2026-09-23, revisão Manus — bloqueio 2 da 2ª rodada): esta
          // procedure lia financial_responsible_users direto, sem checar se o
          // responsável financeiro está ativo (política de "bloqueio total"
          // já decidida pelo Alessandro). Um responsável desativado ainda
          // conseguia ver dívidas de médicos por aqui. Corrigido reutilizando
          // a mesma resolução central usada em todo o resto do módulo
          // (getResponsibleIdForUser), que já respeita isActive.
          //
          // Também corrige um bug mais grave escondido atrás disso: se
          // nenhum responsável fosse encontrado (inativo OU simplesmente sem
          // vínculo nenhum), targetResponsibleId ficava undefined e o bloco
          // de filtro por unidade abaixo era pulado inteiro — a consulta
          // devolvia dívidas de TODAS as unidades, sem filtro nenhum, pra
          // uma conta responsavel_financeiro. Agora nega explicitamente.
          targetResponsibleId = await getResponsibleIdForUser(ctx.user.id);
          if (!targetResponsibleId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Nenhum responsável financeiro ativo vinculado a esta conta.',
            });
          }
        }
        const conditions: SQL[] = [];
        // LOG-05: excluir eventos de ciclos já pagos do grand_total
        conditions.push(ne(billing_cycles.paid_status, 'paid'));
        if (input?.cycleId) conditions.push(eq(billing_visit_events.doctor_cycle_id, input.cycleId));
        if (input?.unitId) conditions.push(eq(billing_visit_events.unit_id, input.unitId));
        if (targetResponsibleId) {
          const unitLinks = await db.select({ unit_id: financial_responsible_units.unit_id }).from(financial_responsible_units).where(eq(financial_responsible_units.financial_responsible_id, targetResponsibleId));
          const unitIds = unitLinks.map(u => u.unit_id);
          if (unitIds.length > 0) conditions.push(inArray(billing_visit_events.unit_id, unitIds));
        }
        const page2 = input?.page ?? 1;
        const pageSize2 = input?.pageSize ?? 200;
        
        const [countRow2] = await db.select({ count: sqlFn<number>`COUNT(*)` })
          .from(billing_visit_events)
          .leftJoin(billing_cycles, eq(billing_visit_events.doctor_cycle_id, billing_cycles.id))
          .where(and(...conditions));
        const total2 = Number(countRow2?.count ?? 0);
        const rows = await db
          .select({ event: billing_visit_events, unit_name: units.name, doctor_name: users.name })
          .from(billing_visit_events)
          .leftJoin(billing_cycles, eq(billing_visit_events.doctor_cycle_id, billing_cycles.id))
          .leftJoin(units, eq(billing_visit_events.unit_id, units.id))
          .leftJoin(users, eq(billing_visit_events.doctor_user_id, users.id))
          .where(and(...conditions))
          .orderBy(desc(billing_visit_events.createdAt))
          .limit(pageSize2)
          .offset((page2 - 1) * pageSize2);
        type DayEntry = { date: string; reports: number; amount: number };
        type UnitEntry = { unit_id: number; unit_name: string; reports: number; priced_reports: number; pending_price_count: number; amount: number; price_per_report: string; days: DayEntry[] };
        type DoctorEntry = { doctor_id: number; doctor_name: string; total_reports: number; total_amount: number; units: UnitEntry[] };
        const doctorMap = new Map<number, DoctorEntry>();
        let grandTotal = 0;
        for (const row of rows) {
          const did = row.event.doctor_user_id;
          if (!doctorMap.has(did)) doctorMap.set(did, { doctor_id: did, doctor_name: row.doctor_name ?? `Médico ${did}`, total_reports: 0, total_amount: 0, units: [] });
          const doc = doctorMap.get(did)!;
          const uid = row.event.unit_id;
          let ue = doc.units.find(u => u.unit_id === uid);
          // FIX (AUDITORIA_PAINEL_RESPONSAVEL_FINANCEIRO_2026-09-24, Achado 4b,
          // e bloqueio 2 da revisao Manus em 2026-09-24):
          // price_per_report era fixado com o valor da PRIMEIRA linha
          // encontrada para este medico+unidade, enquanto reports/amount
          // continuavam acumulando por TODAS as linhas seguintes. A primeira
          // correcao passou a recalcular como amount/reports no final, mas a
          // Manus apontou dois problemas adicionais: (1) reports contava
          // TODOS os eventos, incluindo os que ainda nao tem
          // doctor_price_applied (pendentes de precificacao) -- esses
          // entravam no denominador como se fossem preco zero, distorcendo a
          // media para baixo e escondendo a pendencia; e (2) amount era
          // acumulado com += em ponto flutuante ao longo de muitas
          // iteracoes, o que pode divergir por erro de representacao binaria
          // (ex.: 0.29 + 0.58 nem sempre da exatamente 0.87 em float).
          // Corrigido: (1) priced_reports conta so os eventos com preco
          // aplicado, e e o denominador da media -- nao reports; (2) toMoney()
          // e aplicado a CADA soma, arredondando para o centavo mais proximo
          // imediatamente apos cada adicao, o que impede o erro de
          // representacao de se acumular ao longo de muitas iteracoes.
          if (!ue) { ue = { unit_id: uid, unit_name: row.unit_name ?? `Unidade ${uid}`, reports: 0, priced_reports: 0, pending_price_count: 0, amount: 0, price_per_report: '0', days: [] }; doc.units.push(ue); }
          const rawDate2 = row.event.study_date;
          const d = rawDate2 ? (rawDate2 instanceof Date ? rawDate2.toISOString().split('T')[0] : String(rawDate2).split('T')[0]) : 'sem-data';
          let de = ue.days.find(x => x.date === d);
          if (!de) { de = { date: d, reports: 0, amount: 0 }; ue.days.push(de); }
          const hasPrice = row.event.doctor_price_applied !== null && row.event.doctor_price_applied !== undefined;
          const amt = toMoney(row.event.doctor_price_applied ?? 0);
          de.reports += 1; de.amount = toMoney(de.amount + amt);
          ue.reports += 1; ue.amount = toMoney(ue.amount + amt);
          if (hasPrice) ue.priced_reports += 1;
          doc.total_reports += 1; doc.total_amount = toMoney(doc.total_amount + amt);
          grandTotal = toMoney(grandTotal + amt);
        }
        // Recalcula price_per_report como a media dos valores realmente
        // aplicados (amount/priced_reports, nao amount/reports) apos toda a
        // agregacao -- ver comentario FIX acima, no ponto onde `ue` e
        // criado. Continua sendo uma MEDIA (rótulo no frontend deve deixar
        // isso claro), nao uma tarifa fixa que multiplicada pelos laudos
        // reproduz o total exato quando há mais de um preço no período.
        for (const doc of Array.from(doctorMap.values())) {
          for (const ue of doc.units) {
            ue.pending_price_count = ue.reports - ue.priced_reports;
            ue.price_per_report = ue.priced_reports > 0 ? (ue.amount / ue.priced_reports).toFixed(2) : '0';
          }
        }
        return { doctors: Array.from(doctorMap.values()), grand_total: grandTotal, responsible_id: targetResponsibleId ?? null, total: total2, page: page2, pageSize: pageSize2, hasMore: total2 > page2 * pageSize2 };
      }),

    createCycleManual: protectedProcedure
      .input(z.object({
        unit_id: z.number(),
        financial_responsible_id: z.number().nullable(),
        cycle_type: z.enum(['doctor', 'system']),
        starts_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        ends_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        // C7: validar que starts_at < ends_at
        const s = new Date(input.starts_at);
        const e = new Date(input.ends_at);
        if (s >= e) throw new TRPCError({ code: 'BAD_REQUEST', message: 'A data de início deve ser anterior à data de fim.' });
        
        return await createCycleManual({
          unit_id: input.unit_id,
          financial_responsible_id: input.financial_responsible_id,
          cycle_type: input.cycle_type,
          starts_at: s,
          ends_at: e,
        });
      }),

    editCycleDates: protectedProcedure
      .input(z.object({
        cycle_id: z.number(),
        starts_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        ends_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        // C7: validar que starts_at < ends_at
        const s = new Date(input.starts_at);
        const e = new Date(input.ends_at);
        if (s >= e) throw new TRPCError({ code: 'BAD_REQUEST', message: 'A data de início deve ser anterior à data de fim.' });
        
        return await editCycleDates(input.cycle_id, s, e);
      }),

    listAllOpenCycles: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        return await listAllOpenCycles();
      }),

    // ─── Lista médicos vinculados às unidades do responsável financeiro ───────
    listDoctorsForResponsible: protectedProcedure
      .query(async ({ ctx }) => {
        const allowed = ['admin_master', 'responsavel_financeiro', 'unit_admin'];
        if (!allowed.includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) return [];
        
        
        // Determinar quais unidades o usuário pode ver
        let allowedUnitIds: number[] | undefined = undefined;
        if (ctx.user.role === 'responsavel_financeiro') {
          // FIX (2026-09-23, revisão Manus — bloqueio 2 da 2ª rodada): igual
          // ao ajuste em getResponsibleDebtByDoctor — esta procedure lia
          // financial_responsible_users direto, sem checar isActive. Um
          // responsável desativado ainda conseguia ver a lista de médicos,
          // unidades e preços vinculados por aqui. Corrigido com a mesma
          // resolução central (getResponsibleIdForUser), e negando de forma
          // explícita (FORBIDDEN) em vez de devolver lista vazia — recomendação
          // da revisão: sem vínculo ativo, nem consultar médicos/unidades/preços.
          const respId = await getResponsibleIdForUser(ctx.user.id);
          if (!respId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Nenhum responsável financeiro ativo vinculado a esta conta.',
            });
          }
          const unitLinks = await db.select({ unit_id: financial_responsible_units.unit_id })
            .from(financial_responsible_units)
            .where(and(eq(financial_responsible_units.financial_responsible_id, respId), isNull(financial_responsible_units.ends_at)));
          allowedUnitIds = unitLinks.map(u => u.unit_id);
          if (allowedUnitIds.length === 0) return [];
        }
        // Buscar médicos com preços ativos
        const priceQuery = db.select({
          doctor_user_id: billing_doctor_unit_prices.doctor_user_id,
          doctor_name: users.name,
          unit_id: billing_doctor_unit_prices.unit_id,
          unit_name: units.name,
          price_per_report: billing_doctor_unit_prices.price_per_report,
        })
          .from(billing_doctor_unit_prices)
          .leftJoin(users, eq(users.id, billing_doctor_unit_prices.doctor_user_id))
          .leftJoin(units, eq(units.id, billing_doctor_unit_prices.unit_id))
          .where(and(
            isNull(billing_doctor_unit_prices.ends_at),
            ...(allowedUnitIds ? [inArray(billing_doctor_unit_prices.unit_id, allowedUnitIds)] : []),
          ));
        const prices = await priceQuery;
        // Agrupar por médico
        type DoctorEntry = { id: number; name: string | null; units: { unit_id: number; unit_name: string | null; price_per_report: string }[] };
        const map = new Map<number, DoctorEntry>();
        for (const p of prices) {
          if (!map.has(p.doctor_user_id)) map.set(p.doctor_user_id, { id: p.doctor_user_id, name: p.doctor_name, units: [] });
          map.get(p.doctor_user_id)!.units.push({ unit_id: p.unit_id, unit_name: p.unit_name, price_per_report: p.price_per_report });
        }
        return Array.from(map.values());
      }),

    // ── Desvincular Unidade de Responsável ────────────────────────────────────
    unlinkUnit: protectedProcedure
      .input(z.object({
        financialResponsibleId: z.number(),
        unitId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        await db.update(financial_responsible_units)
          .set({ ends_at: new Date() })
          .where(
            and(
              eq(financial_responsible_units.financial_responsible_id, input.financialResponsibleId),
              eq(financial_responsible_units.unit_id, input.unitId),
              isNull(financial_responsible_units.ends_at),
            )
          );
        return { success: true };
      }),

    // ── Listar usuários disponíveis para vincular como responsável ────────────
    listAvailableUsers: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const rows = await db
          .select({
            id: users.id,
            name: users.name,
            username: users.username,
            email: users.email,
            role: users.role,
          })
          .from(users)
          .where(eq(users.isActive, true))
          .orderBy(users.name);
        return rows;
      }),

    // ── Listar usuários vinculados ao responsável (com nome) ─────────────────
    listUsersForResponsibleWithNames: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const rows = await db
          .select({
            id: financial_responsible_users.id,
            user_id: financial_responsible_users.user_id,
            user_name: users.name,
            user_username: users.username,
            user_email: users.email,
            user_role: users.role,
          })
          .from(financial_responsible_users)
          .leftJoin(users, eq(users.id, financial_responsible_users.user_id))
          .where(eq(financial_responsible_users.financial_responsible_id, input.financialResponsibleId));
        return rows;
      }),

    // ── Listar unidades vinculadas ao responsável (com nome da unidade) ──────
    listUnitsForResponsibleWithNames: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const rows = await db
          .select({
            id: financial_responsible_units.id,
            unit_id: financial_responsible_units.unit_id,
            unit_name: units.name,
            starts_at: financial_responsible_units.starts_at,
            ends_at: financial_responsible_units.ends_at,
          })
          .from(financial_responsible_units)
          .leftJoin(units, eq(units.id, financial_responsible_units.unit_id))
          .where(eq(financial_responsible_units.financial_responsible_id, input.financialResponsibleId))
          .orderBy(financial_responsible_units.starts_at);
        return rows;
      }),

    // ── Equipe da Unidade (migrado de finance.ts) ──────────────────────────────────────
    listTeamMembers: protectedProcedure
      .input(z.object({ unitId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        if (ctx.user.role === 'unit_admin' && !await canAccessUnit(ctx.user, input.unitId, 'view_studies')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para gerenciar esta unidade.' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const perms = await db
          .select({ user_id: user_unit_permissions.user_id })
          .from(user_unit_permissions)
          .where(eq(user_unit_permissions.unit_id, input.unitId));
        if (perms.length === 0) return [];
        const userIds = perms.map(p => p.user_id);
        return await db
          .select({ id: users.id, name: users.name, username: users.username, role: users.role, isActive: users.isActive })
          .from(users)
          .where(and(inArray(users.id, userIds), ne(users.role, 'medico')));
      }),

    addTeamMember: protectedProcedure
      .input(z.object({ unitId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        if (ctx.user.role === 'unit_admin' && !await canAccessUnit(ctx.user, input.unitId, 'view_studies')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para gerenciar esta unidade.' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const existing = await db
          .select({ id: user_unit_permissions.id })
          .from(user_unit_permissions)
          .where(and(eq(user_unit_permissions.user_id, input.userId), eq(user_unit_permissions.unit_id, input.unitId)));
        if (existing.length > 0) return { success: true, alreadyLinked: true };
        await db.insert(user_unit_permissions).values({
          user_id: input.userId,
          unit_id: input.unitId,
          view_studies: true,
          edit_reports: false,
          view_anamnesis: false,
          print_reports: true,
          manage_templates: false,
        });
        return { success: true, alreadyLinked: false };
      }),

    removeTeamMember: protectedProcedure
      .input(z.object({ unitId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        if (ctx.user.role === 'unit_admin' && !await canAccessUnit(ctx.user, input.unitId, 'view_studies')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para gerenciar esta unidade.' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        await db
          .delete(user_unit_permissions)
          .where(and(eq(user_unit_permissions.user_id, input.userId), eq(user_unit_permissions.unit_id, input.unitId)));
        return { success: true };
      }),

    // ── Conexão PACS/Orthanc da Unidade (migrado de finance.ts) ─────────────────────
    testOrthancConnection: protectedProcedure
      .input(z.object({ unitId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        if (ctx.user.role === 'unit_admin') {
          const { getUserUnitPermission } = await import('../db');
          const perm = await getUserUnitPermission(ctx.user.id, input.unitId);
          if (!perm && ctx.user.unit_id !== input.unitId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para testar esta unidade.' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const [unit] = await db.select().from(units).where(eq(units.id, input.unitId));
        if (!unit?.pacs_ip || !unit?.pacs_port) return { ok: false, message: 'IP ou Porta do PACS não configurados' };
        const net = await import('net');
        return new Promise<{ ok: boolean; message: string }>((resolve) => {
          const socket = new net.Socket();
          const timeout = 5000;
          let resolved = false;
          const done = (ok: boolean, message: string) => {
            if (resolved) return;
            resolved = true;
            socket.destroy();
            resolve({ ok, message });
          };
          socket.setTimeout(timeout);
          socket.on('connect', () => done(true, `Porta ${unit.pacs_port} acessível em ${unit.pacs_ip} — AE Title: ${unit.pacs_ae_title ?? '??'}`));
          socket.on('timeout', () => done(false, `Timeout após ${timeout / 1000}s — verifique IP e Porta`));
          socket.on('error', (err: NodeJS.ErrnoException) => {
            const msg = err.code === 'ECONNREFUSED'
              ? `Conexão recusada em ${unit.pacs_ip}:${unit.pacs_port} — PACS offline ou porta errada`
              : err.message;
            done(false, msg);
          });
           socket.connect(unit.pacs_port!, unit.pacs_ip!);
        });
      }),

  /**
   * unitFinancialReadiness — Checklist de aptidão financeira de uma unidade
   * Retorna status de cada pré-requisito para operação financeira correta.
   */
  unitFinancialReadiness: protectedProcedure
    .input(z.object({ unit_id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id); // P4
      // 1. Dados básicos da unidadee
      const unitRow = await db
        .select({
          id: units.id,
          name: units.name,
          isActive: units.isActive,
          default_doctor_price: units.default_doctor_price,
          default_system_price: units.default_system_price,
          billing_cycle_start_day: units.billing_cycle_start_day,
          billing_cycle_end_day: units.billing_cycle_end_day,
          financial_enabled: units.financial_enabled,
        })
        .from(units)
        .where(eq(units.id, input.unit_id))
        .limit(1);
      if (!unitRow[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Unidade não encontrada" });
      const unit = unitRow[0];

      // 2. Responsável financeiro ativo
      const responsibleRow = await db
        .select({
          id: financial_responsible_units.financial_responsible_id,
          name: financial_responsibles.legal_name,
          starts_at: financial_responsible_units.starts_at,
        })
        .from(financial_responsible_units)
        .leftJoin(financial_responsibles, eq(financial_responsibles.id, financial_responsible_units.financial_responsible_id))
        .where(
          and(
            eq(financial_responsible_units.unit_id, input.unit_id),
            isNull(financial_responsible_units.ends_at),
          )
        )
        .limit(1);
      const hasResponsible = responsibleRow.length > 0;
      const responsibleName = responsibleRow[0]?.name ?? null;

      // 3. Usuários com acesso financeiro vinculados ao responsável.
      // NOVO (claude/gestao-usuarios-responsavel-financeiro, requisitos seção
      // 5 — "quadro de estado da unidade"): além de saber SE existe usuário,
      // o quadro de estado precisa da contagem e de sinalizar vínculo órfão
      // (user_id que não existe mais em users) explicitamente, não em silêncio.
      //
      // CORRIGIDO (revisão Manus 2026-09-20): uma conta INATIVA (isActive =
      // false) aparecia contada como "usuário com acesso" — ela aparece
      // corretamente na lista, mas não consegue de fato entrar no sistema.
      // responsibleUserCount / hasResponsibleUser agora contam só vínculos
      // ativos e não órfãos; a contagem total e a quebra por situação ficam
      // disponíveis à parte pra quem precisar diagnosticar/manter.
      let hasResponsibleUser = false;
      let responsibleUserCount = 0;
      let responsibleUserTotalLinks = 0;
      let responsibleInactiveUserCount = 0;
      let responsibleHasInvalidLink = false;
      if (hasResponsible && responsibleRow[0]?.id) {
        const respUsers = await listUsersForResponsible(responsibleRow[0].id);
        responsibleUserTotalLinks = respUsers.length;
        responsibleUserCount = respUsers.filter((u) => !u.is_orphan && u.is_active).length;
        responsibleInactiveUserCount = respUsers.filter((u) => !u.is_orphan && !u.is_active).length;
        responsibleHasInvalidLink = respUsers.some((u) => u.is_orphan);
        hasResponsibleUser = responsibleUserCount > 0;
      }

      // 4. Ciclo configurado (diferente dos defaults genéricos ou explicitamente configurado)
      const hasCycle = !!(unit.billing_cycle_start_day && unit.billing_cycle_end_day);
      const cycleStartDay = unit.billing_cycle_start_day ?? null;
      const cycleEndDay = unit.billing_cycle_end_day ?? null;

      // 5. Preço de sistema configurado
      const systemPriceRow = await db
        .select({ price: billing_system_unit_prices.price_per_report })
        .from(billing_system_unit_prices)
        .where(
          and(
            eq(billing_system_unit_prices.unit_id, input.unit_id),
            isNull(billing_system_unit_prices.ends_at),
          )
        )
        .orderBy(desc(billing_system_unit_prices.starts_at))
        .limit(1);
      const hasSpecificSystemPrice = systemPriceRow.length > 0 && Number(systemPriceRow[0].price) > 0;
      const hasDefaultSystemPrice = !!(unit.default_system_price && Number(unit.default_system_price) > 0);
      const systemPrice = hasSpecificSystemPrice
        ? Number(systemPriceRow[0].price)
        : (hasDefaultSystemPrice ? Number(unit.default_system_price) : null);

      // 6. Médicos com preço configurado
      const doctorPriceRows = await db
        .select({ doctor_user_id: billing_doctor_unit_prices.doctor_user_id })
        .from(billing_doctor_unit_prices)
        .where(
          and(
            eq(billing_doctor_unit_prices.unit_id, input.unit_id),
            isNull(billing_doctor_unit_prices.ends_at),
            sql`${billing_doctor_unit_prices.price_per_report} > 0`,
          )
        );
      const doctorsWithPrice = doctorPriceRows.length;
      const hasDefaultDoctorPrice = !!(unit.default_doctor_price && Number(unit.default_doctor_price) > 0);

      // P3 (v50): total de médicos distintos com laudos assinados na unidade
      const { reports: reportsTable } = await import('../../drizzle/schema');
      const totalDoctorRows = await db
        .selectDistinct({ doctor_user_id: reportsTable.author_user_id })
        .from(reportsTable)
        .where(and(
          eq(reportsTable.unit_id, input.unit_id),
          sql`${reportsTable.status} IN ('signed', 'revised')`,
        ));
      const totalDoctors = totalDoctorRows.length;
      const doctorsWithoutPrice = Math.max(0, totalDoctors - doctorsWithPrice);
      // Aprovado se: preço padrão existe OU todos os médicos com laudos têm preço específico
      const doctorPriceOk = hasDefaultDoctorPrice || doctorsWithPrice >= totalDoctors;

      // 7. Eventos com pricing_status pendente
      const pendingRows = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(billing_visit_events)
        .where(
          and(
            eq(billing_visit_events.unit_id, input.unit_id),
            ne(billing_visit_events.pricing_status, 'ok'),
          )
        );
      const pendingPricingCount = Number(pendingRows[0]?.count ?? 0);

      // 8. Laudos signed sem evento billing (missing events) — P6: LEFT JOIN (mais robusto)
      const missingRows = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(reportsTable)
        .leftJoin(
          billing_visit_events,
          eq(billing_visit_events.report_id, reportsTable.id)
        )
        .where(
          and(
            eq(reportsTable.unit_id, input.unit_id),
            sql`${reportsTable.status} IN ('signed', 'revised')`,
            isNull(billing_visit_events.id),
          )
        );
      const missingEventsCount = Number(missingRows[0]?.count ?? 0);

      // E4: isReady exige também hasResponsibleUser
      const isReady =
        unit.isActive &&
        hasResponsible &&
        hasResponsibleUser &&
        hasCycle &&
        (hasSpecificSystemPrice || hasDefaultSystemPrice) &&
        doctorPriceOk &&
        pendingPricingCount === 0 &&
        missingEventsCount === 0;

      return {
        unit_id: input.unit_id,
        unit_name: unit.name,
        is_active: unit.isActive,
        has_responsible: hasResponsible,
        responsible_id: responsibleRow[0]?.id ?? null,
        responsible_name: responsibleName,
        responsible_starts_at: responsibleRow[0]?.starts_at ?? null,
        has_responsible_user: hasResponsibleUser,
        responsible_user_count: responsibleUserCount,
        responsible_user_total_links: responsibleUserTotalLinks,
        responsible_inactive_user_count: responsibleInactiveUserCount,
        responsible_has_invalid_link: responsibleHasInvalidLink,
        has_cycle: hasCycle,
        cycle_start_day: cycleStartDay,
        cycle_end_day: cycleEndDay,
        has_specific_system_price: hasSpecificSystemPrice,
        has_default_system_price: hasDefaultSystemPrice,
        system_price: systemPrice,
        has_default_doctor_price: hasDefaultDoctorPrice,
        doctors_with_price: doctorsWithPrice,
        total_doctors: totalDoctors,
        doctors_without_price: doctorsWithoutPrice,
        doctor_price_ok: doctorPriceOk,
        pending_pricing_count: pendingPricingCount,
         missing_events_count: missingEventsCount,
        is_ready: isReady,
        financial_enabled: unit.financial_enabled,
      };
    }),
  /**
   * P5: Ativar/desativar financeiro de uma unidade
   */
  setFinancialEnabled: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id); // P4

      // P2: Validar readiness antes de ativar
      if (input.enabled) {
        const unitRow = await db
          .select({
            isActive: units.isActive,
            s: units.billing_cycle_start_day,
            e: units.billing_cycle_end_day,
            sys: units.default_system_price,
          })
          .from(units)
          .where(eq(units.id, input.unit_id))
          .limit(1);
        const u = unitRow[0];
        if (!u?.isActive)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'A unidade precisa estar ativa para habilitar o financeiro.' });
        if (!u.s || !u.e)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Configure o ciclo financeiro antes de ativar.' });
        const now = new Date();
        const responsible = await getActiveResponsibleForUnit(input.unit_id, now);
        if (!responsible)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vincule um responsável financeiro antes de ativar.' });
        const sysPrice = await getActiveSystemPrice(responsible.financial_responsible_id, input.unit_id, now);
        const hasPrice = sysPrice || (u.sys && Number(u.sys) > 0);
        if (!hasPrice)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Configure o preço do sistema antes de ativar.' });
      }

      await db
        .update(units)
        .set({ financial_enabled: input.enabled })
        .where(eq(units.id, input.unit_id));

      // P2: Registrar ativação/desativação no audit_log
      await createAuditLog({
        user_id: ctx.user.id,
        unit_id: input.unit_id,
        action: input.enabled ? 'FINANCIAL_ENABLED' : 'FINANCIAL_DISABLED',
        target_type: 'UNIT',
        target_id: String(input.unit_id),
      }).catch(() => {}); // não bloquear o fluxo

      return { ok: true };
    }),
  /**
   * E3 — Lista todos os médicos que assinaram laudos na unidade (com ou sem preço configurado)
   * Usado na tela de Configuração para exibir médicos sem preço (que ficavam invisíveis antes)
   */
  listDoctorsForUnit: protectedProcedure
    .input(z.object({ unit_id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCanAccessFinancialUnit(db, ctx.user, input.unit_id);
      const { reports: reportsTable } = await import('../../drizzle/schema');
      // Busca médicos distintos que assinaram laudos nesta unidade
      const doctorRows = await db
        .selectDistinct({
          doctor_user_id: reportsTable.author_user_id,
          doctor_name: users.name,
        })
        .from(reportsTable)
        .innerJoin(users, eq(users.id, reportsTable.author_user_id))
        .where(
          and(
            eq(reportsTable.unit_id, input.unit_id),
            eq(reportsTable.status, 'signed'),
          )
        );
      if (!doctorRows.length) return [];
      // Busca preços configurados para cada médico nesta unidade
      const doctorIds = doctorRows.map(d => d.doctor_user_id);
      const priceRows = await db
        .select({
          doctor_user_id: billing_doctor_unit_prices.doctor_user_id,
          amount: billing_doctor_unit_prices.price_per_report,
          starts_at: billing_doctor_unit_prices.starts_at,
        })
        .from(billing_doctor_unit_prices)
        .where(
          and(
            eq(billing_doctor_unit_prices.unit_id, input.unit_id),
            inArray(billing_doctor_unit_prices.doctor_user_id, doctorIds),
            isNull(billing_doctor_unit_prices.ends_at),
          )
        );
      const priceMap = new Map(priceRows.map(p => [p.doctor_user_id, p]));
      return doctorRows.map(d => ({
        doctor_user_id: d.doctor_user_id,
        doctor_name: d.doctor_name,
        has_price: priceMap.has(d.doctor_user_id),
        price_per_report: priceMap.get(d.doctor_user_id)?.amount ?? null, // amount = price_per_report do schema
        price_starts_at: priceMap.get(d.doctor_user_id)?.starts_at ?? null,
      }));
    }),

  /**
   * P8C (v50): Cancelar um evento financeiro de laudo.
   * Apenas admin_master pode cancelar. O evento não é deletado — apenas marcado como 'cancelled'.
   * Eventos cancelados não entram nos cálculos de resumo (filtrado em todas as queries de summary).
   */
  cancelBillingEvent: protectedProcedure
    .input(z.object({
      event_id: z.number().int(),
      reason: z.string().min(5).max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin_master')
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin_master pode cancelar eventos financeiros' });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const evtRow = await db
        .select({ id: billing_visit_events.id, unit_id: billing_visit_events.unit_id, financial_status: billing_visit_events.financial_status })
        .from(billing_visit_events)
        .where(eq(billing_visit_events.id, input.event_id))
        .limit(1);
      if (!evtRow.length)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento financeiro não encontrado' });
      const evt = evtRow[0];
      if (evt.financial_status === 'cancelled')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Evento já está cancelado' });
      await db
        .update(billing_visit_events)
        .set({ financial_status: 'cancelled' })
        .where(eq(billing_visit_events.id, input.event_id));
      await createAuditLog({
        user_id: ctx.user.id,
        unit_id: evt.unit_id,
        action: 'BILLING_EVENT_CANCELLED',
        target_type: 'BILLING_EVENT',
        target_id: String(input.event_id),
      }).catch(() => {});
      return { ok: true, event_id: input.event_id };
    }),
});
