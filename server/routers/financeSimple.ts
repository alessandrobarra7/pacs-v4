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
  users,
  units,
} from "../../drizzle/schema";
import { eq, and, isNull, isNotNull, sql, desc, inArray } from "drizzle-orm";

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
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
    }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 1);

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
            sql`${billing_visit_events.createdAt} >= ${startDate}`,
            sql`${billing_visit_events.createdAt} < ${endDate}`,
            unitFilter,
          )
        );

      const r = rows[0];
      return {
        total_laudos: Number(r.total_laudos),
        system_total: Number(r.system_total),
        doctor_total: Number(r.doctor_total),
        system_paid: Number(r.system_paid),
        doctor_paid: Number(r.doctor_paid),
        system_pending: Number(r.system_total) - Number(r.system_paid),
        doctor_pending: Number(r.doctor_total) - Number(r.doctor_paid),
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
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
    }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 1);

      // Parte da tabela units para mostrar TODAS as unidades, mesmo sem laudos no mês
      const unitIdFilter =
        ctx.user.role === "unit_admin" && ctx.user.unit_id
          ? eq(units.id, ctx.user.unit_id)
          : undefined;

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
            sql`${billing_visit_events.createdAt} >= ${startDate}`,
            sql`${billing_visit_events.createdAt} < ${endDate}`,
          )
        )
        .where(unitIdFilter)
        .groupBy(units.id, units.name)
        .orderBy(units.name);

      return rows.map((r) => ({
        unit_id: r.unit_id,
        unit_name: r.unit_name ?? "Unidade",
        total_laudos: Number(r.total_laudos),
        system_total: Number(r.system_total),
        doctor_total: Number(r.doctor_total),
        system_paid: Number(r.system_paid),
        doctor_paid: Number(r.doctor_paid),
        system_pending: Number(r.system_total) - Number(r.system_paid),
        doctor_pending: Number(r.doctor_total) - Number(r.doctor_paid),
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
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
    }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 1);

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
            sql`${billing_visit_events.createdAt} >= ${startDate}`,
            sql`${billing_visit_events.createdAt} < ${endDate}`,
          )
        )
        .groupBy(billing_visit_events.doctor_user_id, users.name)
        .orderBy(users.name);

      return rows.map((r) => ({
        doctor_user_id: r.doctor_user_id,
        doctor_name: r.doctor_name ?? "Médico",
        total_laudos: Number(r.total_laudos),
        doctor_total: Number(r.doctor_total),
        doctor_paid: Number(r.doctor_paid),
        doctor_pending: Number(r.doctor_total) - Number(r.doctor_paid),
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
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
    }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 1);

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
          createdAt: billing_visit_events.createdAt,
        })
        .from(billing_visit_events)
        .where(
          and(
            eq(billing_visit_events.unit_id, input.unit_id),
            eq(billing_visit_events.doctor_user_id, input.doctor_user_id),
            sql`${billing_visit_events.createdAt} >= ${startDate}`,
            sql`${billing_visit_events.createdAt} < ${endDate}`,
          )
        )
        .orderBy(desc(billing_visit_events.createdAt));

      return rows;
    }),

  /**
   * Marcar pagamento ao médico como realizado (em lote por unidade+médico+mês)
   */
  markDoctorPaid: protectedProcedure
    .input(z.object({
      unit_id: z.number().int(),
      doctor_user_id: z.number().int(),
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 1);
      const now = new Date();

      await db
        .update(billing_visit_events)
        .set({ doctor_received_at: now })
        .where(
          and(
            eq(billing_visit_events.unit_id, input.unit_id),
            eq(billing_visit_events.doctor_user_id, input.doctor_user_id),
            sql`${billing_visit_events.createdAt} >= ${startDate}`,
            sql`${billing_visit_events.createdAt} < ${endDate}`,
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
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin_master pode marcar pagamento ao sistema" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 1);
      const now = new Date();

      await db
        .update(billing_visit_events)
        .set({ system_paid_at: now })
        .where(
          and(
            eq(billing_visit_events.unit_id, input.unit_id),
            sql`${billing_visit_events.createdAt} >= ${startDate}`,
            sql`${billing_visit_events.createdAt} < ${endDate}`,
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
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
    }))
    .query(async ({ input, ctx }) => {
      assertMedico(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 1);

      // Resumo por unidade
      const summary = await db
        .select({
          unit_id: billing_visit_events.unit_id,
          unit_name: units.name,
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
            sql`${billing_visit_events.createdAt} >= ${startDate}`,
            sql`${billing_visit_events.createdAt} < ${endDate}`,
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
          createdAt: billing_visit_events.createdAt,
        })
        .from(billing_visit_events)
        .leftJoin(units, eq(units.id, billing_visit_events.unit_id))
        .where(
          and(
            eq(billing_visit_events.doctor_user_id, ctx.user.id),
            sql`${billing_visit_events.createdAt} >= ${startDate}`,
            sql`${billing_visit_events.createdAt} < ${endDate}`,
          )
        )
        .orderBy(desc(billing_visit_events.createdAt));

      return {
        summary: summary.map((r) => ({
          unit_id: r.unit_id,
          unit_name: r.unit_name ?? "Unidade",
          total_laudos: Number(r.total_laudos),
          doctor_total: Number(r.doctor_total),
          doctor_paid: Number(r.doctor_paid),
          doctor_pending: Number(r.doctor_total) - Number(r.doctor_paid),
          last_received_at: r.last_received_at,
        })),
        events,
      };
    }),

  /**
   * Configuração de preços por unidade — leitura
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
});
