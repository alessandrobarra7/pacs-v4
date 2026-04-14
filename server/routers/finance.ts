import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb, getResponsibleIdForUser } from "../db";

// ── Helpers internos ─────────────────────────────────────────────────────────

async function assertResponsibleAccess(userId: number, role: string, responsibleId: number) {
  if (role === "admin_master") return;
  const myId = await getResponsibleIdForUser(userId);
  if (myId !== responsibleId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
}

async function assertUnitAdminOrMaster(role: string) {
  if (role !== "admin_master" && role !== "unit_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
  }
}

// ── Router ───────────────────────────────────────────────────────────────────

export const financeRouter = router({

  // ── Receitas do Contrato ──────────────────────────────────────────────────

  listContractRevenues: protectedProcedure
    .input(z.object({ financialResponsibleId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertResponsibleAccess(ctx.user.id, ctx.user.role, input.financialResponsibleId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { contract_revenues } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      return await db
        .select()
        .from(contract_revenues)
        .where(eq(contract_revenues.financial_responsible_id, input.financialResponsibleId))
        .orderBy(contract_revenues.starts_at);
    }),

  createContractRevenue: protectedProcedure
    .input(z.object({
      financialResponsibleId: z.number(),
      unitId: z.number().optional(),
      amount: z.string(),
      periodicity: z.enum(["monthly", "quarterly", "yearly", "one_time"]).default("monthly"),
      startsAt: z.string(),
      endsAt: z.string().optional(),
      description: z.string().max(500).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertResponsibleAccess(ctx.user.id, ctx.user.role, input.financialResponsibleId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { contract_revenues } = await import("../../drizzle/schema");
      const [result] = await db.insert(contract_revenues).values({
        financial_responsible_id: input.financialResponsibleId,
        unit_id: input.unitId ?? null,
        amount: input.amount,
        periodicity: input.periodicity,
        starts_at: new Date(input.startsAt),
        ends_at: input.endsAt ? new Date(input.endsAt) : null,
        description: input.description ?? null,
        notes: input.notes ?? null,
        created_by: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  updateContractRevenue: protectedProcedure
    .input(z.object({
      id: z.number(),
      financialResponsibleId: z.number(),
      amount: z.string().optional(),
      periodicity: z.enum(["monthly", "quarterly", "yearly", "one_time"]).optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional().nullable(),
      description: z.string().max(500).optional().nullable(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertResponsibleAccess(ctx.user.id, ctx.user.role, input.financialResponsibleId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { contract_revenues } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { id, financialResponsibleId: _r, ...data } = input;
      const updateData: Record<string, any> = {};
      if (data.amount !== undefined) updateData.amount = data.amount;
      if (data.periodicity !== undefined) updateData.periodicity = data.periodicity;
      if (data.startsAt !== undefined) updateData.starts_at = data.startsAt;
      if ("endsAt" in data) updateData.ends_at = data.endsAt ?? null;
      if ("description" in data) updateData.description = data.description ?? null;
      if ("notes" in data) updateData.notes = data.notes ?? null;
      await db.update(contract_revenues).set(updateData).where(eq(contract_revenues.id, id));
      return { success: true };
    }),

  deleteContractRevenue: protectedProcedure
    .input(z.object({ id: z.number(), financialResponsibleId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertResponsibleAccess(ctx.user.id, ctx.user.role, input.financialResponsibleId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { contract_revenues } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      // C7: IDOR fix — verificar que o registro pertence ao responsável informado
      const [row] = await db.select({ id: contract_revenues.id })
        .from(contract_revenues)
        .where(and(
          eq(contract_revenues.id, input.id),
          eq(contract_revenues.financial_responsible_id, input.financialResponsibleId)
        ));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Receita não encontrada ou não pertence a este responsável" });
      await db.delete(contract_revenues).where(eq(contract_revenues.id, input.id));
      return { success: true };
    }),

  // ── Gastos Personalizados ─────────────────────────────────────────────────

  listCustomExpenses: protectedProcedure
    .input(z.object({
      financialResponsibleId: z.number(),
      competenceYear: z.number().optional(),
      competenceMonth: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await assertResponsibleAccess(ctx.user.id, ctx.user.role, input.financialResponsibleId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { contract_custom_expenses } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const conditions = [eq(contract_custom_expenses.financial_responsible_id, input.financialResponsibleId)];
      if (input.competenceYear !== undefined) conditions.push(eq(contract_custom_expenses.competence_year, input.competenceYear));
      if (input.competenceMonth !== undefined) conditions.push(eq(contract_custom_expenses.competence_month, input.competenceMonth));
      return await db
        .select()
        .from(contract_custom_expenses)
        .where(and(...conditions))
        .orderBy(contract_custom_expenses.competence_year, contract_custom_expenses.competence_month);
    }),

  createCustomExpense: protectedProcedure
    .input(z.object({
      financialResponsibleId: z.number(),
      unitId: z.number().optional(),
      category: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      amount: z.string(),
      competenceMonth: z.number().int().min(1).max(12),
      competenceYear: z.number().int().min(2020).max(2099),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertResponsibleAccess(ctx.user.id, ctx.user.role, input.financialResponsibleId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { contract_custom_expenses } = await import("../../drizzle/schema");
      const [result] = await db.insert(contract_custom_expenses).values({
        financial_responsible_id: input.financialResponsibleId,
        unit_id: input.unitId ?? null,
        category: input.category,
        description: input.description ?? null,
        amount: input.amount,
        competence_month: input.competenceMonth,
        competence_year: input.competenceYear,
        notes: input.notes ?? null,
        created_by: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  updateCustomExpense: protectedProcedure
    .input(z.object({
      id: z.number(),
      financialResponsibleId: z.number(),
      category: z.string().max(100).optional(),
      description: z.string().max(500).optional().nullable(),
      amount: z.string().optional(),
      competenceMonth: z.number().int().min(1).max(12).optional(),
      competenceYear: z.number().int().min(2020).max(2099).optional(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertResponsibleAccess(ctx.user.id, ctx.user.role, input.financialResponsibleId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { contract_custom_expenses } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { id, financialResponsibleId: _r, ...data } = input;
      const updateData: Record<string, any> = {};
      if (data.category !== undefined) updateData.category = data.category;
      if ("description" in data) updateData.description = data.description ?? null;
      if (data.amount !== undefined) updateData.amount = data.amount;
      if (data.competenceMonth !== undefined) updateData.competence_month = data.competenceMonth;
      if (data.competenceYear !== undefined) updateData.competence_year = data.competenceYear;
      if ("notes" in data) updateData.notes = data.notes ?? null;
      await db.update(contract_custom_expenses).set(updateData).where(eq(contract_custom_expenses.id, id));
      return { success: true };
    }),

  deleteCustomExpense: protectedProcedure
    .input(z.object({ id: z.number(), financialResponsibleId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertResponsibleAccess(ctx.user.id, ctx.user.role, input.financialResponsibleId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { contract_custom_expenses } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      // C7: IDOR fix — verificar que o registro pertence ao responsável informado
      const [row] = await db.select({ id: contract_custom_expenses.id })
        .from(contract_custom_expenses)
        .where(and(
          eq(contract_custom_expenses.id, input.id),
          eq(contract_custom_expenses.financial_responsible_id, input.financialResponsibleId)
        ));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Gasto não encontrado ou não pertence a este responsável" });
      await db.delete(contract_custom_expenses).where(eq(contract_custom_expenses.id, input.id));
      return { success: true };
    }),

  // ── Escala Médica ─────────────────────────────────────────────────────────

  listDoctorScales: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertUnitAdminOrMaster(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { unit_doctor_scales, users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const rows = await db
        .select({
          id: unit_doctor_scales.id,
          unit_id: unit_doctor_scales.unit_id,
          doctor_user_id: unit_doctor_scales.doctor_user_id,
          days_of_week: unit_doctor_scales.days_of_week,
          start_time: unit_doctor_scales.start_time,
          end_time: unit_doctor_scales.end_time,
          is_active: unit_doctor_scales.is_active,
          starts_at: unit_doctor_scales.starts_at,
          ends_at: unit_doctor_scales.ends_at,
          notes: unit_doctor_scales.notes,
          doctor_name: users.name,
          doctor_crm: users.crm,
        })
        .from(unit_doctor_scales)
        .leftJoin(users, eq(users.id, unit_doctor_scales.doctor_user_id))
        .where(eq(unit_doctor_scales.unit_id, input.unitId));
      // C13: garantir que days_of_week é sempre array (parse seguro)
      return rows.map((row: typeof rows[0]) => ({
        ...row,
        days_of_week: (() => {
          try {
            const parsed = typeof row.days_of_week === 'string'
              ? JSON.parse(row.days_of_week)
              : row.days_of_week;
            return Array.isArray(parsed) ? parsed : [];
          } catch { return []; }
        })(),
      }));
    }),

  upsertDoctorScale: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      doctorUserId: z.number(),
      daysOfWeek: z.array(z.number().int().min(0).max(6)),
      startTime: z.string().max(5).optional(),
      endTime: z.string().max(5).optional(),
      isActive: z.boolean().default(true),
      startsAt: z.string().optional(),
      endsAt: z.string().optional().nullable(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertUnitAdminOrMaster(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { unit_doctor_scales } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const daysJson = JSON.stringify(input.daysOfWeek);
      const existing = await db
        .select({ id: unit_doctor_scales.id })
        .from(unit_doctor_scales)
        .where(and(eq(unit_doctor_scales.unit_id, input.unitId), eq(unit_doctor_scales.doctor_user_id, input.doctorUserId)));
      if (existing.length > 0) {
        await db.update(unit_doctor_scales).set({
          days_of_week: daysJson,
          start_time: input.startTime ?? null,
          end_time: input.endTime ?? null,
          is_active: input.isActive,
          starts_at: input.startsAt ? new Date(input.startsAt) : null,
          ends_at: input.endsAt ? new Date(input.endsAt) : null,
          notes: input.notes ?? null,
        }).where(and(eq(unit_doctor_scales.unit_id, input.unitId), eq(unit_doctor_scales.doctor_user_id, input.doctorUserId)));
        return { id: existing[0].id };
      }
      const [result] = await db.insert(unit_doctor_scales).values({
        unit_id: input.unitId,
        doctor_user_id: input.doctorUserId,
        days_of_week: daysJson,
        start_time: input.startTime ?? null,
        end_time: input.endTime ?? null,
        is_active: input.isActive,
        starts_at: input.startsAt ? new Date(input.startsAt) : null,
        ends_at: input.endsAt ? new Date(input.endsAt) : null,
        notes: input.notes ?? null,
        created_by: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  deleteDoctorScale: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertUnitAdminOrMaster(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { unit_doctor_scales } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(unit_doctor_scales).where(eq(unit_doctor_scales.id, input.id));
      return { success: true };
    }),

  // ── Remuneração Médica ────────────────────────────────────────────────────

  listCompensationRules: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertUnitAdminOrMaster(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { unit_doctor_compensation_rules, users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      return await db
        .select({
          id: unit_doctor_compensation_rules.id,
          unit_id: unit_doctor_compensation_rules.unit_id,
          doctor_user_id: unit_doctor_compensation_rules.doctor_user_id,
          compensation_type: unit_doctor_compensation_rules.compensation_type,
          amount: unit_doctor_compensation_rules.amount,
          starts_at: unit_doctor_compensation_rules.starts_at,
          ends_at: unit_doctor_compensation_rules.ends_at,
          notes: unit_doctor_compensation_rules.notes,
          doctor_name: users.name,
        })
        .from(unit_doctor_compensation_rules)
        .leftJoin(users, eq(users.id, unit_doctor_compensation_rules.doctor_user_id))
        .where(eq(unit_doctor_compensation_rules.unit_id, input.unitId));
    }),

  createCompensationRule: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      doctorUserId: z.number().optional(),
      compensationType: z.enum(["per_report", "per_patient", "per_shift", "other"]).default("per_report"),
      amount: z.string(),
      startsAt: z.string(),
      endsAt: z.string().optional().nullable(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertUnitAdminOrMaster(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { unit_doctor_compensation_rules } = await import("../../drizzle/schema");
      const [result] = await db.insert(unit_doctor_compensation_rules).values({
        unit_id: input.unitId,
        doctor_user_id: input.doctorUserId ?? null,
        compensation_type: input.compensationType,
        amount: input.amount,
        starts_at: new Date(input.startsAt),
        ends_at: input.endsAt ? new Date(input.endsAt) : null,
        notes: input.notes ?? null,
        created_by: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  updateCompensationRule: protectedProcedure
    .input(z.object({
      id: z.number(),
      compensationType: z.enum(["per_report", "per_patient", "per_shift", "other"]).optional(),
      amount: z.string().optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertUnitAdminOrMaster(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { unit_doctor_compensation_rules } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { id, ...data } = input;
      const updateData: Record<string, any> = {};
      if (data.compensationType !== undefined) updateData.compensation_type = data.compensationType;
      if (data.amount !== undefined) updateData.amount = data.amount;
      if (data.startsAt !== undefined) updateData.starts_at = data.startsAt;
      if ("endsAt" in data) updateData.ends_at = data.endsAt ?? null;
      if ("notes" in data) updateData.notes = data.notes ?? null;
      await db.update(unit_doctor_compensation_rules).set(updateData).where(eq(unit_doctor_compensation_rules.id, id));
      return { success: true };
    }),

  deleteCompensationRule: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertUnitAdminOrMaster(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { unit_doctor_compensation_rules } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(unit_doctor_compensation_rules).where(eq(unit_doctor_compensation_rules.id, input.id));
      return { success: true };
    }),

  // ── Dashboard Econômico do Responsável ────────────────────────────────────

  getEconomicDashboard: protectedProcedure
    .input(z.object({
      financialResponsibleId: z.number(),
      competenceYear: z.number().int(),
      competenceMonth: z.number().int().min(1).max(12),
    }))
    .query(async ({ input, ctx }) => {
      await assertResponsibleAccess(ctx.user.id, ctx.user.role, input.financialResponsibleId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { contract_revenues, contract_custom_expenses, billing_cycle_doctor_summary, billing_cycle_system_summary, billing_cycles } = await import("../../drizzle/schema");
      const { eq, and, gte, lte, sum, sql: sqlRaw, isNull, or } = await import("drizzle-orm");

      // C9-3A: Receitas filtradas pelo período de competência (starts_at <= fim_período AND (ends_at IS NULL OR ends_at >= início_período))
      const periodStart = new Date(Date.UTC(input.competenceYear, input.competenceMonth - 1, 1));
      const periodEnd   = new Date(Date.UTC(input.competenceYear, input.competenceMonth, 1));
      const revenues = await db
        .select()
        .from(contract_revenues)
        .where(and(
          eq(contract_revenues.financial_responsible_id, input.financialResponsibleId),
          lte(contract_revenues.starts_at, periodEnd),
          or(
            isNull(contract_revenues.ends_at),
            gte(contract_revenues.ends_at, periodStart)
          )
        ));

      // C9-3C: Calcular valor mensal proporcional por periodicidade
      function monthlyValue(amount: number, periodicity: string): number {
        switch (periodicity) {
          case 'monthly':   return amount;
          case 'quarterly': return amount / 3;
          case 'yearly':    return amount / 12;
          case 'one_time':  return 0; // receita única não entra no recorrente mensal
          default:          return amount;
        }
      }
      const totalRevenue = revenues.reduce((acc, r) => acc + monthlyValue(parseFloat(r.amount as string), r.periodicity ?? 'monthly'), 0);

      // 2. Gastos personalizados do mês
      const customExpenses = await db
        .select()
        .from(contract_custom_expenses)
        .where(and(
          eq(contract_custom_expenses.financial_responsible_id, input.financialResponsibleId),
          eq(contract_custom_expenses.competence_year, input.competenceYear),
          eq(contract_custom_expenses.competence_month, input.competenceMonth),
        ));

      const totalCustomExpenses = customExpenses.reduce((acc, e) => acc + parseFloat(e.amount as string), 0);

      // C9-3B: Gastos com médicos — apenas ciclos FECHADOS que intersectam o período
      // billing_cycles.starts_at e ends_at são tipo 'date' (string YYYY-MM-DD no MySQL)
      // sqlRaw já importado acima como alias de sql
      const periodStartStr = `${input.competenceYear}-${String(input.competenceMonth).padStart(2,'0')}-01`;
      const nextMonth = input.competenceMonth === 12 ? 1 : input.competenceMonth + 1;
      const nextYear  = input.competenceMonth === 12 ? input.competenceYear + 1 : input.competenceYear;
      const periodEndStr = `${nextYear}-${String(nextMonth).padStart(2,'0')}-01`;
      const doctorCycles = await db
        .select({
          amount_due: billing_cycle_doctor_summary.amount_due,
          doctor_user_id: billing_cycle_doctor_summary.doctor_user_id,
          unit_id: billing_cycle_doctor_summary.unit_id,
        })
        .from(billing_cycle_doctor_summary)
        .innerJoin(billing_cycles, eq(billing_cycles.id, billing_cycle_doctor_summary.doctor_cycle_id))
        .where(and(
          eq(billing_cycles.financial_responsible_id, input.financialResponsibleId),
          eq(billing_cycles.cycle_type, "doctor"),
          eq(billing_cycles.status, "closed"),
          sqlRaw`${billing_cycles.starts_at} <= ${periodEndStr}`,
          sqlRaw`${billing_cycles.ends_at} >= ${periodStartStr}`,
        ));

      const totalDoctorCost = doctorCycles.reduce((acc, d) => acc + parseFloat(d.amount_due as string), 0);

      // C9-3B: Gastos com sistema — apenas ciclos FECHADOS que intersectam o período
      const systemCycles = await db
        .select({
          amount_due: billing_cycle_system_summary.amount_due,
          unit_id: billing_cycle_system_summary.unit_id,
        })
        .from(billing_cycle_system_summary)
        .innerJoin(billing_cycles, eq(billing_cycles.id, billing_cycle_system_summary.system_cycle_id))
        .where(and(
          eq(billing_cycles.financial_responsible_id, input.financialResponsibleId),
          eq(billing_cycles.cycle_type, "system"),
          eq(billing_cycles.status, "closed"),
          sqlRaw`${billing_cycles.starts_at} <= ${periodEndStr}`,
          sqlRaw`${billing_cycles.ends_at} >= ${periodStartStr}`,
        ));

      const totalSystemCost = systemCycles.reduce((acc, s) => acc + parseFloat(s.amount_due as string), 0);

      // 5. Resultado econômico
      const totalCosts = totalDoctorCost + totalSystemCost + totalCustomExpenses;
      const operationalBalance = totalRevenue - totalCosts;
      const margin = totalRevenue > 0 ? (operationalBalance / totalRevenue) * 100 : 0;

      return {
        competenceYear: input.competenceYear,
        competenceMonth: input.competenceMonth,
        revenues: {
          total: totalRevenue,
          items: revenues,
        },
        doctorCosts: {
          total: totalDoctorCost,
          breakdown: doctorCycles,
        },
        systemCosts: {
          total: totalSystemCost,
          breakdown: systemCycles,
        },
        customExpenses: {
          total: totalCustomExpenses,
          items: customExpenses,
        },
        result: {
          totalRevenue,
          totalCosts,
          operationalBalance,
          marginPercent: Math.round(margin * 100) / 100,
        },
      };
    }),

  // ── Equipe da Unidade (operadores, visualizadores, unit_admins) ───────────

  listTeamMembers: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertUnitAdminOrMaster(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { users, user_unit_permissions } = await import("../../drizzle/schema");
      const { eq, and, inArray, ne } = await import("drizzle-orm");
      // Busca todos os vínculos da unidade
      const perms = await db
        .select({ user_id: user_unit_permissions.user_id })
        .from(user_unit_permissions)
        .where(eq(user_unit_permissions.unit_id, input.unitId));
      if (perms.length === 0) return [];
      const userIds = perms.map(p => p.user_id);
      // Retorna usuários que NÃO são médicos (médicos têm aba própria)
      return await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          role: users.role,
          isActive: users.isActive,
        })
        .from(users)
        .where(and(
          inArray(users.id, userIds),
          ne(users.role, "medico"),
        ));
    }),

  addTeamMember: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      userId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertUnitAdminOrMaster(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { user_unit_permissions } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
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
      await assertUnitAdminOrMaster(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { user_unit_permissions } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      await db
        .delete(user_unit_permissions)
        .where(and(eq(user_unit_permissions.user_id, input.userId), eq(user_unit_permissions.unit_id, input.unitId)));
      return { success: true };
    }),

  // ── Conexão Orthanc da Unidade ────────────────────────────────────────────

  saveOrthancConnection: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      orthanc_base_url: z.string().url().optional().nullable(),
      orthanc_public_url: z.string().url().optional().nullable(),
      orthanc_basic_user: z.string().max(100).optional().nullable(),
      orthanc_basic_pass: z.string().max(255).optional().nullable(),
      pacs_ip: z.string().max(45).optional().nullable(),
      pacs_port: z.number().int().min(1).max(65535).optional().nullable(),
      pacs_ae_title: z.string().max(16).optional().nullable(),
      pacs_local_ae_title: z.string().max(16).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "unit_admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // C8: unit_admin só pode modificar unidades às quais pertence
      if (ctx.user.role === "unit_admin") {
        const { getUserUnitPermission } = await import("../db");
        const perm = await getUserUnitPermission(ctx.user.id, input.unitId);
        if (!perm && ctx.user.unit_id !== input.unitId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para modificar esta unidade." });
        }
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { units } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { unitId, ...data } = input;
      await db.update(units).set(data).where(eq(units.id, unitId));
      return { success: true };
    }),

  testOrthancConnection: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "unit_admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // C8: unit_admin só pode testar unidades às quais pertence
      if (ctx.user.role === "unit_admin") {
        const { getUserUnitPermission } = await import("../db");
        const perm = await getUserUnitPermission(ctx.user.id, input.unitId);
        if (!perm && ctx.user.unit_id !== input.unitId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para testar esta unidade." });
        }
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { units } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [unit] = await db.select().from(units).where(eq(units.id, input.unitId));
      if (!unit?.pacs_ip || !unit?.pacs_port) {
        return { ok: false, message: "IP ou Porta do PACS não configurados" };
      }
      // Teste TCP: verifica se a porta DICOM está acessível (mesmo protocolo usado pelo C-FIND/C-MOVE)
      const net = await import("net");
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
        socket.on("connect", () => {
          done(true, `Porta ${unit.pacs_port} acessível em ${unit.pacs_ip} — AE Title: ${unit.pacs_ae_title ?? "??"}`);
        });
        socket.on("timeout", () => done(false, `Timeout após ${timeout / 1000}s — verifique IP e Porta`));
        socket.on("error", (err: NodeJS.ErrnoException) => {
          const msg = err.code === "ECONNREFUSED"
            ? `Conexão recusada em ${unit.pacs_ip}:${unit.pacs_port} — PACS offline ou porta errada`
            : err.message;
          done(false, msg);
        });
        socket.connect(unit.pacs_port!, unit.pacs_ip!);
      });
    }),

});
