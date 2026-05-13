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
  financial_responsible_units,
  user_unit_permissions,
  financial_responsibles,
  billing_doctor_unit_prices,
} from "../../drizzle/schema";
import { eq, and, isNull, isNotNull, sql, desc, inArray } from "drizzle-orm";
import { getResponsibleIdForUser } from "../db";

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
      // dashboard usa ciclo global (1-31) pois agrega todas as unidades
      const { cycleStart: startDate, cycleEnd: endDate } = calcCycleDates(1, 31, refDate);

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
      // Para unitSummary, cada unidade pode ter ciclo diferente.
      // Usamos ciclo 1-31 como janela comum; drill-down por unidade usa ciclo específico.
      const { cycleStart: startDate, cycleEnd: endDate } = calcCycleDates(1, 31, refDate);

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

      // myFinanceiro: cada unidade tem seu próprio ciclo; usamos janela ampla (3 meses)
      // para buscar todos os eventos e depois agrupamos por unidade.
      // O ciclo específico por unidade é exibido no frontend via cycle_label.
      const refDate = input.reference_date ? new Date(input.reference_date) : new Date();
      const { cycleStart: startDate, cycleEnd: endDate } = calcCycleDates(1, 31, refDate);

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
      const { cycleStart: startDate, cycleEnd: endDate } = calcCycleDates(1, 31, refDate);

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
      const { cycleStart: startDate, cycleEnd: endDate } = calcCycleDates(1, 31, refDate);
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
});
