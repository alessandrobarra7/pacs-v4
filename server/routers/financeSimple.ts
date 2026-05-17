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
} from "../../drizzle/schema";
import { eq, and, isNull, isNotNull, ne, sql, sql as sqlFn, desc, inArray, gte, lte, or, SQL } from "drizzle-orm";
import {
  getResponsibleIdForUser,
  createBillingVisitEvent,
  getResponsibleCycleSummary,
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
} from "../db";

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
  const sd = startDay ?? 1;
  const ed = endDay ?? 31;
  const d = refDate.getDate();
  const m = refDate.getMonth();
  const y = refDate.getFullYear();
  const pad = (n: number) => String(n).padStart(2, '0');
  if (sd <= ed) {
    // Ciclo dentro do mesmo mês (ex: 1→31 ou 5→25)
    return {
      cycleStart: new Date(y, m, sd),
      cycleEnd:   new Date(y, m, ed + 1),
      label: `${pad(sd)}/${pad(m + 1)} – ${pad(ed)}/${pad(m + 1)}`,
    };
  } else {
    // Ciclo cruza meses (ex: 15→14)
    if (d >= sd) {
      return {
        cycleStart: new Date(y, m, sd),
        cycleEnd:   new Date(y, m + 1, ed + 1),
        label: `${pad(sd)}/${pad(m + 1)} – ${pad(ed)}/${pad(m + 2)}`,
      };
    } else {
      return {
        cycleStart: new Date(y, m - 1, sd),
        cycleEnd:   new Date(y, m, ed + 1),
        label: `${pad(sd)}/${pad(m)} – ${pad(ed)}/${pad(m + 1)}`,
      };
    }
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

type AllowedAdminRole = "admin_master" | "unit_admin" | "responsavel_financeiro";
const ADMIN_ROLES: AllowedAdminRole[] = ["admin_master", "unit_admin", "responsavel_financeiro"];

function assertAdmin(role: string) {
  if (!ADMIN_ROLES.includes(role as AllowedAdminRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao módulo financeiro" });
  }
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
      // dashboard agrega todas as unidades (cada uma com ciclo diferente).
      // Usa janela de 3 meses centrada no refDate para cobrir qualquer ciclo por unidade.
      const startDate = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
      const endDate = new Date(refDate.getFullYear(), refDate.getMonth() + 2, 1);

      // Filtro por unidade para unit_admin / responsavel_financeiro
      const unitFilter =
        ctx.user.role === "unit_admin" && ctx.user.unit_id
          ? eq(billing_visit_events.unit_id, ctx.user.unit_id)
          : undefined;

      const rows = await db
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
        .where(
          and(
            sql`${billing_visit_events.signed_at} >= ${startDate}`,
            sql`${billing_visit_events.signed_at} < ${endDate}`,
            unitFilter,
          )
        );

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
      // unitSummary: cada unidade tem ciclo diferente.
      // Usa janela de 3 meses centrada no refDate; drill-down por unidade usa ciclo específico.
      const startDate = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
      const endDate = new Date(refDate.getFullYear(), refDate.getMonth() + 2, 1);

      // Filtro de unidades: unit_admin vê apenas suas unidades (unit_id fixo OU via permissões)
      let unitIdFilter: ReturnType<typeof eq> | ReturnType<typeof inArray> | undefined = undefined;
      if (ctx.user.role === "unit_admin") {
        if (ctx.user.unit_id) {
          unitIdFilter = eq(units.id, ctx.user.unit_id);
        } else {
          const perms = await db
            .select({ unit_id: user_unit_permissions.unit_id })
            .from(user_unit_permissions)
            .where(and(
              eq(user_unit_permissions.user_id, ctx.user.id),
              eq(user_unit_permissions.group_key, "administradoresUnidade")
            ));
          const unitIds = perms.map(p => p.unit_id);
          if (unitIds.length > 0) {
            unitIdFilter = inArray(units.id, unitIds);
          } else {
            return [];
          }
        }
      }

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
      const rows = await db
        .select({
          unit_id: units.id,
          unit_name: units.name,
          total_laudos: sql<number>`COALESCE(COUNT(${billing_visit_events.id}), 0)`,
          system_total: sql<number>`COALESCE(SUM(${billing_visit_events.system_amount_due}), 0)`,
          doctor_total: sql<number>`COALESCE(SUM(${billing_visit_events.doctor_amount_due}), 0)`,
          system_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.system_paid_at} IS NOT NULL THEN ${billing_visit_events.system_amount_due} ELSE 0 END), 0)`,
          doctor_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.doctor_received_at} IS NOT NULL THEN ${billing_visit_events.doctor_amount_due} ELSE 0 END), 0)`,
          system_pending_count: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.system_paid_at} IS NULL AND ${billing_visit_events.id} IS NOT NULL THEN 1 ELSE 0 END), 0)`,
          doctor_pending_count: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.doctor_received_at} IS NULL AND ${billing_visit_events.id} IS NOT NULL THEN 1 ELSE 0 END), 0)`,
        })
        .from(units)
        .leftJoin(
          billing_visit_events,
          and(
            eq(billing_visit_events.unit_id, units.id),
            sql`${billing_visit_events.signed_at} >= ${startDate}`,
            sql`${billing_visit_events.signed_at} < ${endDate}`,
          )
        )
        .where(unitIdFilter)
        .groupBy(units.id, units.name)
        .orderBy(units.name);

      return rows.map((r) => ({
        unit_id: r.unit_id,
        unit_name: r.unit_name ?? "Unidade",
        total_laudos: Number(r.total_laudos),
        system_total: toMoney(r.system_total),
        doctor_total: toMoney(r.doctor_total),
        system_paid: toMoney(r.system_paid),
        doctor_paid: toMoney(r.doctor_paid),
        system_pending: subMoney(r.system_total, r.system_paid),   // FIX float
        doctor_pending: subMoney(r.doctor_total, r.doctor_paid),   // FIX float
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

      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      // Busca ciclo configurado para esta unidade
      const unitRow = await db.select({
        s: units.billing_cycle_start_day,
        e: units.billing_cycle_end_day,
      }).from(units).where(eq(units.id, input.unit_id)).limit(1);
      const { cycleStart: startDate, cycleEnd: endDate, label: cycle_label } =
        calcCycleDates(unitRow[0]?.s, unitRow[0]?.e, refDate);

      const rows = await db
        .select({
          doctor_user_id: billing_visit_events.doctor_user_id,
          doctor_name: users.name,
          total_laudos: sql<number>`COUNT(*)`,
          doctor_total: sql<number>`COALESCE(SUM(${billing_visit_events.doctor_amount_due}), 0)`,
          doctor_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.doctor_received_at} IS NOT NULL THEN ${billing_visit_events.doctor_amount_due} ELSE 0 END), 0)`,
          doctor_pending_count: sql<number>`SUM(CASE WHEN ${billing_visit_events.doctor_received_at} IS NULL THEN 1 ELSE 0 END)`,
          last_received_at: sql<Date | null>`MAX(${billing_visit_events.doctor_received_at})`,
        })
        .from(billing_visit_events)
        .leftJoin(users, eq(users.id, billing_visit_events.doctor_user_id))
        .where(
          and(
            eq(billing_visit_events.unit_id, input.unit_id),
            sql`${billing_visit_events.signed_at} >= ${startDate}`,
            sql`${billing_visit_events.signed_at} < ${endDate}`,
          )
        )
        .groupBy(billing_visit_events.doctor_user_id, users.name)
        .orderBy(users.name);

      return rows.map((r) => ({
        doctor_user_id: r.doctor_user_id,
        doctor_name: r.doctor_name ?? "Médico",
        total_laudos: Number(r.total_laudos),
        doctor_total: toMoney(r.doctor_total),
        doctor_paid: toMoney(r.doctor_paid),
        doctor_pending: subMoney(r.doctor_total, r.doctor_paid),   // FIX float
        doctor_pending_count: Number(r.doctor_pending_count),
        last_received_at: r.last_received_at,
      }));
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

      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      const unitRow = await db.select({
        s: units.billing_cycle_start_day,
        e: units.billing_cycle_end_day,
      }).from(units).where(eq(units.id, input.unit_id)).limit(1);
      const { cycleStart: startDate, cycleEnd: endDate } =
        calcCycleDates(unitRow[0]?.s, unitRow[0]?.e, refDate);

      const rows = await db
        .select({
          id: billing_visit_events.id,
          report_id: billing_visit_events.report_id,
          patient_name: billing_visit_events.patient_name,
          study_date: billing_visit_events.study_date,
          modality_snapshot: billing_visit_events.modality_snapshot,
          exam_name_snapshot: billing_visit_events.exam_name_snapshot,
          system_amount_due: billing_visit_events.system_amount_due,
          doctor_amount_due: billing_visit_events.doctor_amount_due,
          doctor_received_at: billing_visit_events.doctor_received_at,
          system_paid_at: billing_visit_events.system_paid_at,
          signed_at: billing_visit_events.signed_at,
        })
        .from(billing_visit_events)
        .where(
          and(
            eq(billing_visit_events.unit_id, input.unit_id),
            eq(billing_visit_events.doctor_user_id, input.doctor_user_id),
            sql`${billing_visit_events.signed_at} >= ${startDate}`,
            sql`${billing_visit_events.signed_at} < ${endDate}`,
          )
        )
        .orderBy(desc(billing_visit_events.signed_at));

      return rows;
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

      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      const unitRow = await db.select({
        s: units.billing_cycle_start_day,
        e: units.billing_cycle_end_day,
      }).from(units).where(eq(units.id, input.unit_id)).limit(1);
      const { cycleStart: startDate, cycleEnd: endDate } =
        calcCycleDates(unitRow[0]?.s, unitRow[0]?.e, refDate);
      const now = new Date();

      await db
        .update(billing_visit_events)
        .set({ doctor_received_at: now })
        .where(
          and(
            eq(billing_visit_events.unit_id, input.unit_id),
            eq(billing_visit_events.doctor_user_id, input.doctor_user_id),
            sql`${billing_visit_events.signed_at} >= ${startDate}`,
            sql`${billing_visit_events.signed_at} < ${endDate}`,
            isNull(billing_visit_events.doctor_received_at),
          )
        );

      return { success: true, paid_at: now };
    }),

  /**
   * Marcar pagamento ao sistema como realizado (em lote por unidade+mês)
   */
  markSystemPaid: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      reference_date: z.string().datetime().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin_master pode marcar pagamento ao sistema" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      const unitRow = await db.select({
        s: units.billing_cycle_start_day,
        e: units.billing_cycle_end_day,
      }).from(units).where(eq(units.id, input.unit_id)).limit(1);
      const { cycleStart: startDate, cycleEnd: endDate } =
        calcCycleDates(unitRow[0]?.s, unitRow[0]?.e, refDate);
      const now = new Date();

      await db
        .update(billing_visit_events)
        .set({ system_paid_at: now })
        .where(
          and(
            eq(billing_visit_events.unit_id, input.unit_id),
            sql`${billing_visit_events.signed_at} >= ${startDate}`,
            sql`${billing_visit_events.signed_at} < ${endDate}`,
            isNull(billing_visit_events.system_paid_at),
          )
        );

      return { success: true, paid_at: now };
    }),

  /**
   * Meu Financeiro — extrato do médico logado, por unidade
   */
  myFinanceiro: protectedProcedure
    .input(z.object({
      reference_date: z.string().datetime().optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertMedico(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // myFinanceiro: janela de 3 meses centrada no refDate (mês anterior + atual + seguinte).
      // Garante cobertura de qualquer ciclo por unidade (ex: 15/04→14/05).
      // O ciclo específico por unidade é exibido no frontend via cycle_label.
      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      const startDate = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
      const endDate = new Date(refDate.getFullYear(), refDate.getMonth() + 2, 1);

      // Resumo por unidade
      const summary = await db
        .select({
          unit_id: billing_visit_events.unit_id,
          unit_name: units.name,
          cycle_start_day: units.billing_cycle_start_day,
          cycle_end_day: units.billing_cycle_end_day,
          total_laudos: sql<number>`COUNT(*)`,
          doctor_total: sql<number>`COALESCE(SUM(${billing_visit_events.doctor_amount_due}), 0)`,
          doctor_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.doctor_received_at} IS NOT NULL THEN ${billing_visit_events.doctor_amount_due} ELSE 0 END), 0)`,
          last_received_at: sql<Date | null>`MAX(${billing_visit_events.doctor_received_at})`,
        })
        .from(billing_visit_events)
        .leftJoin(units, eq(units.id, billing_visit_events.unit_id))
        .where(
          and(
            eq(billing_visit_events.doctor_user_id, ctx.user.id),
            sql`${billing_visit_events.signed_at} >= ${startDate}`,
            sql`${billing_visit_events.signed_at} < ${endDate}`,
          )
        )
        .groupBy(billing_visit_events.unit_id, units.name)
        .orderBy(units.name);

      // Laudos individuais
      const events = await db
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
          pricing_status: billing_visit_events.pricing_status,  // FIN-C4: aviso de preço não configurado
          signed_at: billing_visit_events.signed_at,
        })
        .from(billing_visit_events)
        .leftJoin(units, eq(units.id, billing_visit_events.unit_id))
        .where(
          and(
            eq(billing_visit_events.doctor_user_id, ctx.user.id),
            sql`${billing_visit_events.signed_at} >= ${startDate}`,
            sql`${billing_visit_events.signed_at} < ${endDate}`,
          )
        )
        .orderBy(desc(billing_visit_events.signed_at));

      // Buscar preço vigente do médico por unidade (ends_at IS NULL = ativo)
      const doctorPriceRows = await db
        .select({
          unit_id: billing_doctor_unit_prices.unit_id,
          price_per_report: billing_doctor_unit_prices.price_per_report,
        })
        .from(billing_doctor_unit_prices)
        .where(
          and(
            eq(billing_doctor_unit_prices.doctor_user_id, ctx.user.id),
            isNull(billing_doctor_unit_prices.ends_at),
          )
        );
      const priceByUnit = new Map(
        doctorPriceRows.map(p => [p.unit_id, Number(p.price_per_report ?? 0)])
      );
      return {
        summary: summary.map((r) => ({
          unit_id: r.unit_id,
          unit_name: r.unit_name ?? "Unidade",
          cycle_start_day: r.cycle_start_day ?? 1,
          cycle_end_day: r.cycle_end_day ?? 31,
          total_laudos: Number(r.total_laudos),
          doctor_total: toMoney(r.doctor_total),
          doctor_paid: toMoney(r.doctor_paid ?? 0),
          doctor_pending: subMoney(r.doctor_total, r.doctor_paid ?? 0),   // FIX float
          last_received_at: r.last_received_at,
          price_per_report: priceByUnit.get(r.unit_id) ?? null,  // NOVO: valor vigente
        })),
        events,
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
      return {
        unit_id: u.id,
        unit_name: u.name,
        default_system_price: u.default_system_price ? parseFloat(String(u.default_system_price)) : null,
        default_doctor_price: u.default_doctor_price ? parseFloat(String(u.default_doctor_price)) : null,
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
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
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

  /**
   * Busca o ciclo de pagamento configurado para a unidade (admin_master only)
   */
  getUnitCycle: protectedProcedure
    .input(z.object({ unit_id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
   * Configura o ciclo de pagamento da unidade (admin_master only)
   * start_day: dia do mês de início (1-31)
   * end_day: dia do mês de fim (1-31)
   * Se start_day > end_day, o ciclo cruza mêses (ex: 15 ao 14 do mês seguinte)
   */
  setUnitCycle: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      start_day: z.number().int().min(1).max(31),
      end_day: z.number().int().min(1).max(31),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "responsavel_financeiro" && ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Descobrir o ID do responsável vinculado ao usuário
      const responsavelId = await getResponsibleIdForUser(ctx.user.id);
      if (!responsavelId) {
        return { units: [], responsavelId: null };
      }

      // Buscar unidades vinculadas ao responsável (vigência ativa)
      const linkedUnits = await db
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

      if (linkedUnits.length === 0) {
        return { units: [], responsavelId };
      }

      const unitIds = linkedUnits.map((u) => u.unit_id);
      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      // myResponsavel: janela de 3 meses centrada no refDate para cobrir qualquer ciclo por unidade.
      const startDate = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
      const endDate = new Date(refDate.getFullYear(), refDate.getMonth() + 2, 1);

      // Resumo por unidade
      const summary = await db
        .select({
          unit_id: billing_visit_events.unit_id,
          unit_name: units.name,
          total_laudos: sql<number>`COUNT(*)`,
          system_total: sql<number>`COALESCE(SUM(${billing_visit_events.system_amount_due}), 0)`,
          system_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.system_paid_at} IS NOT NULL THEN ${billing_visit_events.system_amount_due} ELSE 0 END), 0)`,
          doctor_total: sql<number>`COALESCE(SUM(${billing_visit_events.doctor_amount_due}), 0)`,
          doctor_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.doctor_received_at} IS NOT NULL THEN ${billing_visit_events.doctor_amount_due} ELSE 0 END), 0)`,
        })
        .from(billing_visit_events)
        .leftJoin(units, eq(units.id, billing_visit_events.unit_id))
        .where(
          and(
            inArray(billing_visit_events.unit_id, unitIds),
            sql`${billing_visit_events.signed_at} >= ${startDate}`,
            sql`${billing_visit_events.signed_at} < ${endDate}`,
          )
        )
        .groupBy(billing_visit_events.unit_id, units.name)
        .orderBy(units.name);

      // Montar mapa de unidades vinculadas (inclui unidades sem laudos no mês)
      const summaryMap = new Map(summary.map((s) => [s.unit_id, s]));
      const result = linkedUnits.map((lu) => {
        const s = summaryMap.get(lu.unit_id);
        return {
          unit_id: lu.unit_id,
          unit_name: lu.unit_name ?? "Unidade",
          cycle_start_day: lu.cycle_start_day ?? 1,
          cycle_end_day: lu.cycle_end_day ?? 31,
          total_laudos: s ? Number(s.total_laudos) : 0,
          system_total: s ? toMoney(s.system_total) : 0,
          system_paid: s ? toMoney(s.system_paid) : 0,
          system_pending: s ? subMoney(s.system_total, s.system_paid) : 0,   // FIX float
          doctor_total: s ? toMoney(s.doctor_total) : 0,
          doctor_paid: s ? toMoney(s.doctor_paid) : 0,
          doctor_pending: s ? subMoney(s.doctor_total, s.doctor_paid) : 0,   // FIX float
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
      // responsibleSummary: agrega por responsável (múltiplas unidades com ciclos diferentes).
      // Usa janela de 3 meses centrada no refDate.
      const startDate = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
      const endDate = new Date(refDate.getFullYear(), refDate.getMonth() + 2, 1);
      const rows = await db
        .select({
          responsible_id: billing_visit_events.financial_responsible_id,
          responsible_name: financial_responsibles.legal_name,
          unit_count: sql<number>`COUNT(DISTINCT ${billing_visit_events.unit_id})`,
          total_laudos: sql<number>`COUNT(*)`,
          system_total: sql<number>`COALESCE(SUM(${billing_visit_events.system_amount_due}), 0)`,
          system_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.system_paid_at} IS NOT NULL THEN ${billing_visit_events.system_amount_due} ELSE 0 END), 0)`,
          doctor_total: sql<number>`COALESCE(SUM(${billing_visit_events.doctor_amount_due}), 0)`,
          doctor_paid: sql<number>`COALESCE(SUM(CASE WHEN ${billing_visit_events.doctor_received_at} IS NOT NULL THEN ${billing_visit_events.doctor_amount_due} ELSE 0 END), 0)`,
        })
        .from(billing_visit_events)
        .leftJoin(financial_responsibles, eq(financial_responsibles.id, billing_visit_events.financial_responsible_id))
        .where(
          and(
            sql`${billing_visit_events.signed_at} >= ${startDate}`,
            sql`${billing_visit_events.signed_at} < ${endDate}`,
          )
        )
        .groupBy(billing_visit_events.financial_responsible_id, financial_responsibles.legal_name)
        .orderBy(financial_responsibles.legal_name);
      return rows.map(r => ({
        responsible_id: r.responsible_id,
        responsible_name: r.responsible_name ?? "Sem responsável",
        unit_count: Number(r.unit_count),
        total_laudos: Number(r.total_laudos),
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
        // billing_doctor_unit_prices tem apenas price_per_report (valor do médico)
        // O preço do sistema vem de units.default_system_price
        const docPrice = doctorPrice[0]?.price_per_report ?? unit[0]?.doc ?? '0';
        const sysPrice = unit[0]?.sys ?? '0';
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
   * FIN-R1: Reprocessar billing_visit_events faltantes.
   * Busca todos os laudos assinados/revisados sem evento financeiro e cria os eventos.
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

      // Busca laudos assinados/revisados sem billing_visit_event correspondente
      // Faz LEFT JOIN com studies_cache para obter patient_name e study_date
      const missing = await db
        .select({
          report_id: reports.id,
          unit_id: reports.unit_id,
          author_user_id: reports.author_user_id,
          study_instance_uid: reports.study_instance_uid,
          signedAt: reports.signedAt,
          patient_name: studies_cache.patient_name,
          study_date: studies_cache.study_date,
        })
        .from(reports)
        .leftJoin(billing_visit_events, eq(billing_visit_events.report_id, reports.id))
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
          
          const respId = await getResponsibleIdForUser(ctx.user.id);
          if (respId !== input.id) throw new TRPCError({ code: 'FORBIDDEN' });
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
    linkUser: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        await linkUserToResponsible(input.financialResponsibleId, input.userId);
        return { success: true };
      }),

    unlinkUser: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        await unlinkUserFromResponsible(input.financialResponsibleId, input.userId);
        return { success: true };
      }),

    listUsersForResponsible: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        return await listUsersForResponsible(input.financialResponsibleId);
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
          
          const respId = await getResponsibleIdForUser(ctx.user.id);
          if (respId !== input.financialResponsibleId) throw new TRPCError({ code: 'FORBIDDEN' });
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
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
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
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
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
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        const id = await upsertDoctorUnitPrice({
          financial_responsible_id: input.financialResponsibleId,
          unit_id: input.unitId,
          doctor_user_id: input.doctorUserId,
          price_per_report: input.pricePerReport,
          starts_at: new Date(input.startsAt),
          ends_at: input.endsAt ? new Date(input.endsAt) : null,
          created_by: ctx.user.id,
        });
        return { id };
      }),

    listDoctorPrices: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), unitId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        
        return await listDoctorPricesForUnit(input.financialResponsibleId, input.unitId);
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
          
          const respId = await getResponsibleIdForUser(ctx.user.id);
          if (!respId || (input.financialResponsibleId && respId !== input.financialResponsibleId)) {
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
      .query(async ({ ctx }) => {
        const ALLOWED = ['responsavel_financeiro', 'unit_admin', 'admin_master'];
        if (!ALLOWED.includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
        
        const respId = await getResponsibleIdForUser(ctx.user.id);
        if (!respId) return { byUnit: [], byDoctor: [], totalSystem: '0.00', totalDoctors: '0.00', totalGeral: '0.00' };
        const { systemCycles, doctorCycles, totalSystem, totalDoctors, totalGeral } = await getResponsibleCycleSummary(respId);
        // Agregar por unidade
        const byUnitMap = new Map<number, { unit_id: number; unit_name: string; reports_count: number; system_amount_due: number; doctor_amount_due: number; cycle?: object }>();
        for (const row of systemCycles) {
          const uid = row.summary.unit_id;
          const existing = byUnitMap.get(uid) ?? { unit_id: uid, unit_name: row.unit_name ?? '', reports_count: 0, system_amount_due: 0, doctor_amount_due: 0, cycle: row.cycle };
          existing.reports_count += row.summary.reports_count ?? 0;
          existing.system_amount_due += parseFloat(String(row.summary.amount_due ?? '0'));
          byUnitMap.set(uid, existing);
        }
        for (const row of doctorCycles) {
          const uid = row.summary.unit_id;
          const existing = byUnitMap.get(uid) ?? { unit_id: uid, unit_name: row.unit_name ?? '', reports_count: 0, system_amount_due: 0, doctor_amount_due: 0 };
          existing.doctor_amount_due += parseFloat(String(row.summary.amount_due ?? '0'));
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
          existing.amount_due += parseFloat(String(row.summary.amount_due ?? '0'));
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
      .query(async ({ ctx }) => {
        
        const respId = await getResponsibleIdForUser(ctx.user.id);
        if (!respId) return null;
        return await getFinancialResponsibleById(respId) ?? null;
      }),

    // ─── V3 Operacional: Ciclos Financeiros ──────────────────────────────────

    getCycleConfig: protectedProcedure
      .input(z.object({ unit_id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'responsavel_financeiro' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
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

    createVisitEvent: protectedProcedure
      .input(z.object({
        report_id: z.number(),
        study_instance_uid: z.string().optional(),
        unit_id: z.number(),
        patient_name: z.string().optional(),
        study_date: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'medico' && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        return await createBillingVisitEvent({
          ...input,
          doctor_user_id: ctx.user.id, // sempre o médico logado
          signed_at: new Date(),
        });
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
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'responsavel_financeiro' && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        const respId = await getResponsibleIdForUser(ctx.user.id);
        if (!respId) return { systemCycles: [], doctorCycles: [] };
        return await getResponsibleCycleSummary(respId);
      }),

    getUnitFinancialInfo: protectedProcedure
      .input(z.object({ unit_id: z.number() }))
      .query(async ({ input, ctx }) => {
        const allowedRoles = ['medico', 'admin_master', 'responsavel_financeiro', 'unit_admin'];
        if (!allowedRoles.includes(ctx.user.role)) {
          return { status: 'no_access' as const, cycle_period: null, cycle_amount: null, cycle_visits: null, price_per_report: null };
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
        if (ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
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
        const totalDoctorAmount = openDoctorSummaries.reduce((s, r) => s + parseFloat(r.summary.amount_due ?? '0'), 0);
        const totalSystemAmount = openSystemSummaries.reduce((s, r) => s + parseFloat(r.summary.amount_due ?? '0'), 0);
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
          existing.system_amount_due += parseFloat(String(row.summary.amount_due ?? '0'));
          byUnitMap.set(uid, existing);
        }
        for (const row of summary.doctorCycles) {
          const uid = row.summary.unit_id;
          const existing = byUnitMap.get(uid) ?? { unit_id: uid, unit_name: row.unit_name ?? '', reports_count: 0, system_amount_due: 0, doctor_amount_due: 0 };
          existing.doctor_amount_due += parseFloat(String(row.summary.amount_due ?? '0'));
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
          existing.amount_due += parseFloat(String(row.summary.amount_due ?? '0'));
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
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
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
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        // C4: Não criar mais "Sem Responsável" automaticamente.
        // Exigir que a unidade já tenha um responsável financeiro ativo.
        
        const responsible = await getActiveResponsibleForUnit(input.unitId);
        if (!responsible) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Esta unidade não possui um responsável financeiro ativo. Vincule um responsável antes de configurar preços.',
          });
        }
        const id = await upsertDoctorUnitPrice({
          financial_responsible_id: responsible.financial_responsible_id,
          unit_id: input.unitId,
          doctor_user_id: input.doctorUserId,
          price_per_report: input.pricePerReport,
          starts_at: new Date(input.startsAt),
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
          
          const myRespId = await getResponsibleIdForUser(ctx.user.id);
          if (!myRespId) return [];
          const now = new Date();
          const unitLinks = await db.select({ unit_id: financial_responsible_units.unit_id })
            .from(financial_responsible_units)
            .where(and(
              eq(financial_responsible_units.financial_responsible_id, myRespId),
              lte(financial_responsible_units.starts_at, now),
              or(isNull(financial_responsible_units.ends_at), gte(financial_responsible_units.ends_at, now))
            ));
          allowedUnitIds = unitLinks.map(u => u.unit_id);
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
          const amt = parseFloat(row.event.doctor_price_applied ?? '0');
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
          
          const resp = await db.select({ id: financial_responsible_users.financial_responsible_id }).from(financial_responsible_users).where(eq(financial_responsible_users.user_id, ctx.user.id)).limit(1);
          targetResponsibleId = resp[0]?.id;
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
        type UnitEntry = { unit_id: number; unit_name: string; reports: number; amount: number; price_per_report: string; days: DayEntry[] };
        type DoctorEntry = { doctor_id: number; doctor_name: string; total_reports: number; total_amount: number; units: UnitEntry[] };
        const doctorMap = new Map<number, DoctorEntry>();
        let grandTotal = 0;
        for (const row of rows) {
          const did = row.event.doctor_user_id;
          if (!doctorMap.has(did)) doctorMap.set(did, { doctor_id: did, doctor_name: row.doctor_name ?? `Médico ${did}`, total_reports: 0, total_amount: 0, units: [] });
          const doc = doctorMap.get(did)!;
          const uid = row.event.unit_id;
          let ue = doc.units.find(u => u.unit_id === uid);
          if (!ue) { ue = { unit_id: uid, unit_name: row.unit_name ?? `Unidade ${uid}`, reports: 0, amount: 0, price_per_report: row.event.doctor_price_applied ?? '0', days: [] }; doc.units.push(ue); }
          const rawDate2 = row.event.study_date;
          const d = rawDate2 ? (rawDate2 instanceof Date ? rawDate2.toISOString().split('T')[0] : String(rawDate2).split('T')[0]) : 'sem-data';
          let de = ue.days.find(x => x.date === d);
          if (!de) { de = { date: d, reports: 0, amount: 0 }; ue.days.push(de); }
          const amt = parseFloat(row.event.doctor_price_applied ?? '0');
          de.reports += 1; de.amount += amt;
          ue.reports += 1; ue.amount += amt;
          doc.total_reports += 1; doc.total_amount += amt;
          grandTotal += amt;
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
          const respLinks = await db.select({ financial_responsible_id: financial_responsible_users.financial_responsible_id })
            .from(financial_responsible_users)
            .where(eq(financial_responsible_users.user_id, ctx.user.id));
          const respId = respLinks[0]?.financial_responsible_id;
          if (!respId) return [];
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

});
