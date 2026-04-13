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
        const { users, user_unit_permissions, units, billing_doctor_unit_prices } = await import('../../drizzle/schema');
        const { eq, and, isNull } = await import('drizzle-orm');
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
          })
          .from(billing_doctor_unit_prices)
          .leftJoin(units, eq(units.id, billing_doctor_unit_prices.unit_id))
          .where(and(
            eq(billing_doctor_unit_prices.doctor_user_id, input.doctorUserId),
            isNull(billing_doctor_unit_prices.ends_at),
          ));
        return { doctor, unitLinks, prices };
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

    // ── Configurar preço do médico por unidade direto do cadastro admin ──────────
    setDoctorPriceDirect: protectedProcedure
      .input(z.object({
        doctorUserId: z.number(),
        unitId: z.number(),
        pricePerReport: z.string(),
        startsAt: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { getActiveResponsibleForUnit, upsertDoctorUnitPrice } = await import('../db');
        // Busca o responsável financeiro ativo da unidade automaticamente
        const responsible = await getActiveResponsibleForUnit(input.unitId);
        if (!responsible) throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Nenhum responsável financeiro ativo para esta unidade. Configure um responsável financeiro no módulo Financeiro primeiro.',
        });
        const id = await upsertDoctorUnitPrice({
          financial_responsible_id: responsible.financial_responsible_id,
          unit_id: input.unitId,
          doctor_user_id: input.doctorUserId,
          price_per_report: input.pricePerReport,
          starts_at: new Date(input.startsAt),
          ends_at: null,
          created_by: ctx.user.id,
        });
        return { id };
      }),
});
