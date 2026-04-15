import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";

export const billingRouter = router({

    // ── Responsáveis Financeiros ──────────────────────────────────────────────
    listResponsibles: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { listFinancialResponsibles } = await import('../db');
        return await listFinancialResponsibles();
      }),

    getResponsible: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') {
          const { getResponsibleIdForUser } = await import('../db');
          const respId = await getResponsibleIdForUser(ctx.user.id);
          if (respId !== input.id) throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const { getFinancialResponsibleById } = await import('../db');
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
        const { createFinancialResponsible } = await import('../db');
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
        const { updateFinancialResponsible } = await import('../db');
        await updateFinancialResponsible(id, data);
        return { success: true };
      }),

    // ── Vínculos Usuário → Responsável ────────────────────────────────────────
    linkUser: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { linkUserToResponsible } = await import('../db');
        await linkUserToResponsible(input.financialResponsibleId, input.userId);
        return { success: true };
      }),

    unlinkUser: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { unlinkUserFromResponsible } = await import('../db');
        await unlinkUserFromResponsible(input.financialResponsibleId, input.userId);
        return { success: true };
      }),

    listUsersForResponsible: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { listUsersForResponsible } = await import('../db');
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
        const { linkUnitToResponsible } = await import('../db');
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
          const { getResponsibleIdForUser } = await import('../db');
          const respId = await getResponsibleIdForUser(ctx.user.id);
          if (respId !== input.financialResponsibleId) throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const { listUnitsForResponsible } = await import('../db');
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
        const { upsertSystemUnitPrice } = await import('../db');
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
        const { listSystemPricesForUnit } = await import('../db');
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
        const { upsertDoctorUnitPrice } = await import('../db');
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
        const { listDoctorPricesForUnit } = await import('../db');
        return await listDoctorPricesForUnit(input.financialResponsibleId, input.unitId);
      }),

    // ── Apuração de Competência ────────────────────────────────────────────────
    calculateCompetence: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { calculateCompetence } = await import('../db');
        return await calculateCompetence(input.year, input.month, ctx.user.id);
      }),

    closeCompetence: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { closeCompetence } = await import('../db');
        return await closeCompetence(input.financialResponsibleId, input.year, input.month, ctx.user.id);
      }),

    reopenCompetence: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { reopenCompetence } = await import('../db');
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
          const { getResponsibleIdForUser } = await import('../db');
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
        const { listBillingReportItems } = await import('../db');
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
        const { getAdminConsolidated } = await import('../db');
        return await getAdminConsolidated(input.year, input.month);
      }),

    getResponsibleSummary: protectedProcedure
      .query(async ({ ctx }) => {
        const ALLOWED = ['responsavel_financeiro', 'unit_admin', 'admin_master'];
        if (!ALLOWED.includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
        const { getResponsibleIdForUser, getResponsibleCycleSummary } = await import('../db');
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
        const { getDoctorMonthlySummary, listBillingReportItems } = await import('../db');
        const [byResponsible, items] = await Promise.all([
          getDoctorMonthlySummary(ctx.user.id, input.year, input.month),
          listBillingReportItems({ doctor_user_id: ctx.user.id, competence_year: input.year, competence_month: input.month }),
        ]);
        return { byResponsible, items };
      }),
    getMyResponsible: protectedProcedure
      .query(async ({ ctx }) => {
        const { getResponsibleIdForUser, getFinancialResponsibleById } = await import('../db');
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
        const { getCycleConfig } = await import('../db');
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
        const { upsertCycleConfig } = await import('../db');
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
        const { createBillingVisitEvent } = await import('../db');
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
        const { getDoctorFinancialSummary } = await import('../db');
        return await getDoctorFinancialSummary(ctx.user.id);
      }),

    getDoctorCycleEvents: protectedProcedure
      .input(z.object({ doctor_cycle_id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'medico' && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const { getDoctorCycleEvents } = await import('../db');
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
        const { markDoctorCycleReceived } = await import('../db');
        await markDoctorCycleReceived(input.doctor_cycle_id, input.unit_id, ctx.user.id, ctx.user.id);
        return { success: true };
      }),

    getResponsibleCycles: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'responsavel_financeiro' && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const { getResponsibleIdForUser, getResponsibleCycleSummary } = await import('../db');
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
        const { getDoctorUnitFinancialInfo } = await import('../db');
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
        const { closeBillingCycle } = await import('../db');
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
        const { listUnitCycles } = await import('../db');
        return await listUnitCycles(input.unit_id, input.cycle_type);
      }),

    // ── Listagem global de preços (para páginas de gestão financeira) ──────────
    listAllDoctorPrices: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) return [];
        const { billing_doctor_unit_prices } = await import('../../drizzle/schema');
        const { users } = await import('../../drizzle/schema');
        const { units } = await import('../../drizzle/schema');
        const { eq } = await import('drizzle-orm');
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
        const { billing_system_unit_prices } = await import('../../drizzle/schema');
        const { units } = await import('../../drizzle/schema');
        const { eq } = await import('drizzle-orm');
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
        const { users, user_unit_permissions, units, billing_doctor_unit_prices, financial_responsible_units, financial_responsibles } = await import('../../drizzle/schema');
        const { eq, and, isNull, lte, gte, or, desc } = await import('drizzle-orm');
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
              or(isNull(financial_responsible_units.ends_at), gte(financial_responsible_units.ends_at as any, now))
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
        const { getDoctorFinancialSummary } = await import('../db');
        return await getDoctorFinancialSummary(input.doctorUserId);
      }),

    getDoctorCycleEventsForAdmin: protectedProcedure
      .input(z.object({ doctorUserId: z.number(), doctorCycleId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { getDoctorCycleEvents } = await import('../db');
        return await getDoctorCycleEvents(input.doctorUserId, input.doctorCycleId);
      }),

    // ── Detalhe da Unidade (admin) ─────────────────────────────────────────────
    getUnitDetail: protectedProcedure
      .input(z.object({ unitId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) return null;
        const {
          units,
          users,
          billing_doctor_unit_prices,
          billing_system_unit_prices,
          financial_responsible_units,
          billing_cycle_doctor_summary,
          billing_cycle_system_summary,
          billing_cycles,
        } = await import('../../drizzle/schema');
        const { eq, isNull, and, desc } = await import('drizzle-orm');
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
        const { getDoctorAuditReport, getUserById } = await import('../db');
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
        const { resetDoctorBilling, createAuditLog } = await import('../db');
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
        const {
          getFinancialResponsibleById,
          listUnitsForResponsible,
          listUsersForResponsible,
          getResponsibleCycleSummary,
        } = await import('../db');
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
        const { getDoctorFullContext } = await import('../db');
        return await getDoctorFullContext(input.doctorUserId);
      }),

    getUnitFullContext: protectedProcedure
      .input(z.object({ unitId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { getUnitFullContext } = await import('../db');
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
        const { getResponsibleFullDashboard } = await import('../db');
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
        const { getDoctorOperationalBalance } = await import('../db');
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
        const { getActiveResponsibleForUnit, upsertSystemUnitPrice } = await import('../db');
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
        const { linkUnitToResponsible } = await import('../db');
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
        const { getActiveResponsibleForUnit, upsertDoctorUnitPrice } = await import('../db');
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
        const { getSystemOwnerLiveByUnit } = await import('../db');
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
        const { and, eq } = await import('drizzle-orm');
        const { billing_cycles, units, users, financial_responsibles } = await import('../../drizzle/schema');
        const conditions: any[] = [eq(billing_cycles.cycle_type, 'system')];
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
        const { eq } = await import('drizzle-orm');
        const { billing_cycles } = await import('../../drizzle/schema');
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
        const { eq } = await import('drizzle-orm');
        const { billing_cycles } = await import('../../drizzle/schema');
        await db.update(billing_cycles).set({ paid_status: 'pending', paid_at: null, paid_by_user_id: null, paid_note: null }).where(eq(billing_cycles.id, input.cycleId));
        return { ok: true };
      }),

    addCycleNote: protectedProcedure
      .input(z.object({ cycleId: z.number(), note: z.string().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { billing_cycles } = await import('../../drizzle/schema');
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
        const { and, eq, gte, lte, desc, inArray, isNull, or, lte: lteOp } = await import('drizzle-orm');
        const { billing_visit_events, units, users, financial_responsible_units } = await import('../../drizzle/schema');
        // Responsável financeiro: filtrar apenas pelas suas unidades
        let allowedUnitIds: number[] | undefined = undefined;
        if (isResp) {
          const { getResponsibleIdForUser } = await import('../db');
          const myRespId = await getResponsibleIdForUser(ctx.user.id);
          if (!myRespId) return [];
          const now = new Date();
          const unitLinks = await db.select({ unit_id: financial_responsible_units.unit_id })
            .from(financial_responsible_units)
            .where(and(
              eq(financial_responsible_units.financial_responsible_id, myRespId),
              lteOp(financial_responsible_units.starts_at, now),
              or(isNull(financial_responsible_units.ends_at), gte(financial_responsible_units.ends_at as any, now))
            ));
          allowedUnitIds = unitLinks.map(u => u.unit_id);
          if (allowedUnitIds.length === 0) return [];
        }
        const conditions: any[] = [];
        if (targetDoctorId) conditions.push(eq(billing_visit_events.doctor_user_id, targetDoctorId));
        if (allowedUnitIds) conditions.push(inArray(billing_visit_events.unit_id, allowedUnitIds));
        if (input?.unitId) conditions.push(eq(billing_visit_events.unit_id, input.unitId));
        if (input?.cycleId) conditions.push(eq(billing_visit_events.doctor_cycle_id, input.cycleId));
        if (input?.startDate) conditions.push(gte(billing_visit_events.study_date, new Date(input.startDate)));
        if (input?.endDate) conditions.push(lte(billing_visit_events.study_date, new Date(input.endDate)));
        const rows = await db
          .select({ event: billing_visit_events, unit_name: units.name, doctor_name: users.name })
          .from(billing_visit_events)
          .leftJoin(units, eq(billing_visit_events.unit_id, units.id))
          .leftJoin(users, eq(billing_visit_events.doctor_user_id, users.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(billing_visit_events.createdAt))
          .limit(500);
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
        return Array.from(doctorMap.values());
      }),

    // ─── P4: Dívida do Responsável por Médico ────────────────────────────────
    getResponsibleDebtByDoctor: protectedProcedure
      .input(z.object({
        responsibleId: z.number().optional(),
        cycleId: z.number().optional(),
        unitId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const isAdmin = ctx.user.role === 'admin_master';
        const isResp = ctx.user.role === 'responsavel_financeiro';
        if (!isAdmin && !isResp) throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { and, eq, inArray, desc } = await import('drizzle-orm');
        const { billing_visit_events, units, users, financial_responsibles, financial_responsible_units } = await import('../../drizzle/schema');
        let targetResponsibleId = input?.responsibleId;
        if (isResp && !isAdmin) {
          const { financial_responsible_users } = await import('../../drizzle/schema');
          const resp = await db.select({ id: financial_responsible_users.financial_responsible_id }).from(financial_responsible_users).where(eq(financial_responsible_users.user_id, ctx.user.id)).limit(1);
          targetResponsibleId = resp[0]?.id;
        }
        const conditions: any[] = [];
        if (input?.cycleId) conditions.push(eq(billing_visit_events.doctor_cycle_id, input.cycleId));
        if (input?.unitId) conditions.push(eq(billing_visit_events.unit_id, input.unitId));
        if (targetResponsibleId) {
          const unitLinks = await db.select({ unit_id: financial_responsible_units.unit_id }).from(financial_responsible_units).where(eq(financial_responsible_units.financial_responsible_id, targetResponsibleId));
          const unitIds = unitLinks.map(u => u.unit_id);
          if (unitIds.length > 0) conditions.push(inArray(billing_visit_events.unit_id, unitIds));
        }
        const rows = await db
          .select({ event: billing_visit_events, unit_name: units.name, doctor_name: users.name })
          .from(billing_visit_events)
          .leftJoin(units, eq(billing_visit_events.unit_id, units.id))
          .leftJoin(users, eq(billing_visit_events.doctor_user_id, users.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(billing_visit_events.createdAt))
          .limit(1000);
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
        return { doctors: Array.from(doctorMap.values()), grand_total: grandTotal, responsible_id: targetResponsibleId ?? null };
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
        const { createCycleManual } = await import('../db');
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
        const { editCycleDates } = await import('../db');
        return await editCycleDates(input.cycle_id, s, e);
      }),

    listAllOpenCycles: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { listAllOpenCycles } = await import('../db');
        return await listAllOpenCycles();
      }),

    // ─── Lista médicos vinculados às unidades do responsável financeiro ───────
    listDoctorsForResponsible: protectedProcedure
      .query(async ({ ctx }) => {
        const allowed = ['admin_master', 'responsavel_financeiro', 'unit_admin'];
        if (!allowed.includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await getDb();
        if (!db) return [];
        const { users, user_unit_permissions, units, billing_doctor_unit_prices, financial_responsible_users, financial_responsible_units } = await import('../../drizzle/schema');
        const { eq, and, isNull, inArray } = await import('drizzle-orm');
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
});
