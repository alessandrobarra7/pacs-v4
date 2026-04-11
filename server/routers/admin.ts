import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthService } from "../auth.service";
import {
  createAuditLog, getDb, resolveEffectiveUnitId,
} from "../db";

export const adminRouter = router({
    listUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const { users, user_unit_permissions, units: unitsTable } = await import("../../drizzle/schema");
      const { desc, eq: eqOp, and } = await import("drizzle-orm");
      
        // 4a: unit_admin com unit_id legado null deve usar user_unit_permissions
      const { inArray: inArrayOp2 } = await import('drizzle-orm');
      let result;
      if (ctx.user.role === 'unit_admin') {
        // Resolve as unidades do unit_admin via legado + user_unit_permissions
        const myPerms = await db.select({ unit_id: user_unit_permissions.unit_id })
          .from(user_unit_permissions)
          .where(eqOp(user_unit_permissions.user_id, ctx.user.id));
        const myUnitIds = myPerms.map(p => p.unit_id);
        if (ctx.user.unit_id && !myUnitIds.includes(ctx.user.unit_id)) {
          myUnitIds.push(ctx.user.unit_id);
        }
        if (myUnitIds.length === 0) return [];
        // Busca usuários que têm unit_id legado nas minhas unidades
        const usersLegacy = await db.select({ user_id: users.id })
          .from(users)
          .where(inArrayOp2(users.unit_id, myUnitIds));
        // Busca usuários que têm permissões nas minhas unidades
        const usersViaPerms = await db.selectDistinct({ user_id: user_unit_permissions.user_id })
          .from(user_unit_permissions)
          .where(inArrayOp2(user_unit_permissions.unit_id, myUnitIds));
        const allUserIds = Array.from(new Set([
          ...usersLegacy.map(u => u.user_id),
          ...usersViaPerms.map(u => u.user_id),
        ]));
        if (allUserIds.length === 0) return [];
        result = await db
          .select({
            id: users.id,
            name: users.name,
            username: users.username,
            email: users.email,
            role: users.role,
            unit_id: users.unit_id,
            isActive: users.isActive,
            createdAt: users.createdAt,
            lastSignedIn: users.lastSignedIn,
            expiration_date: users.expiration_date,
          })
          .from(users)
          .where(inArrayOp2(users.id, allUserIds))
          .orderBy(desc(users.createdAt));
      } else {
        result = await db
          .select({
            id: users.id,
            name: users.name,
            username: users.username,
            email: users.email,
            role: users.role,
            unit_id: users.unit_id,
            isActive: users.isActive,
            createdAt: users.createdAt,
            lastSignedIn: users.lastSignedIn,
            expiration_date: users.expiration_date,
          })
          .from(users)
          .orderBy(desc(users.createdAt));
      }
      // Buscar unidades vinculadas via permissões para cada usuário
      const allPerms = await db
        .select({
          user_id: user_unit_permissions.user_id,
          unit_id: user_unit_permissions.unit_id,
          unit_name: unitsTable.name,
        })
        .from(user_unit_permissions)
        .innerJoin(unitsTable, eqOp(unitsTable.id, user_unit_permissions.unit_id));
      const permsByUser: Record<number, { unit_id: number; unit_name: string }[]> = {};
      for (const p of allPerms) {
        if (!permsByUser[p.user_id]) permsByUser[p.user_id] = [];
        permsByUser[p.user_id].push({ unit_id: p.unit_id, unit_name: p.unit_name });
      }
      return result.map(u => ({
        ...u,
        linked_units: permsByUser[u.id] ?? [],
      }));;
    }),

    listAuditLog: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(100) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { audit_log, users } = await import("../../drizzle/schema");
        const { desc, eq: eqOp } = await import("drizzle-orm");
        // F2-5: unit_admin só vê eventos da(s) sua(s) unidade(s)
        const { and: andOp, inArray } = await import('drizzle-orm');
        let unitFilter: any = undefined;
        if (ctx.user.role === 'unit_admin') {
          const { getUserUnitPermission } = await import('../db');
          const { user_unit_permissions: uup } = await import('../../drizzle/schema');
          const myPerms = await db.select({ unit_id: uup.unit_id }).from(uup)
            .where(eqOp(uup.user_id, ctx.user.id));
          const myUnitIds = myPerms.map(p => p.unit_id);
          if (ctx.user.unit_id && !myUnitIds.includes(ctx.user.unit_id)) {
            myUnitIds.push(ctx.user.unit_id);
          }
          if (myUnitIds.length > 0) {
            unitFilter = inArray(audit_log.unit_id, myUnitIds);
          } else {
            return []; // unit_admin sem unidades não vê nada
          }
        }
        const result = await db
          .select({
            id: audit_log.id,
            action: audit_log.action,
            target_type: audit_log.target_type,
            target_id: audit_log.target_id,
            ip_address: audit_log.ip_address,
            timestamp: audit_log.timestamp,
            user_id: audit_log.user_id,
            unit_id: audit_log.unit_id,
            userName: users.name,
            userUsername: users.username,
          })
          .from(audit_log)
          .leftJoin(users, eqOp(audit_log.user_id, users.id))
          .where(unitFilter)
          .orderBy(desc(audit_log.timestamp))
          .limit(input.limit);
        return result;
      }),

    deleteUser: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin_master pode excluir usuários' });
        }
        if (ctx.user.id === input.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível excluir o próprio usuário' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users } = await import("../../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        await db.delete(users).where(eqOp(users.id, input.id));
        return { success: true };
      }),

    updateUser: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        email: z.string().optional().nullable(),
        role: z.enum(['admin_master', 'unit_admin', 'medico', 'viewer', 'operador', 'responsavel_financeiro']).optional(),
        unit_id: z.number().optional().nullable(),
        isActive: z.boolean().optional(),
        expiration_date: z.string().optional().nullable(),
        password: z.string().min(6).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        if (ctx.user.role === 'unit_admin' && input.role === 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin não pode promover para admin_master' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users } = await import("../../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        // F1-5: unit_admin só pode editar usuários da sua própria unidade
        if (ctx.user.role === 'unit_admin') {
          const targetUser = await db.select().from(users).where(eqOp(users.id, input.id)).limit(1);
          const targetUnitId = targetUser[0]?.unit_id;
          const adminUnitId = ctx.user.unit_id;
          if (!adminUnitId || targetUnitId !== adminUnitId) {
            // Verificar também via user_unit_permissions
            const { getUserUnitPermission: getUnitPerm } = await import('../db');
            const hasScope = targetUnitId ? !!(await getUnitPerm(ctx.user.id, targetUnitId)) : false;
            if (!hasScope) throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin só pode editar usuários da sua unidade' });
          }
        }
        const updateData: Record<string, unknown> = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.email !== undefined) updateData.email = input.email || null;
        if (input.role !== undefined) updateData.role = input.role;
        if (input.unit_id !== undefined) updateData.unit_id = input.unit_id;
        if (input.isActive !== undefined) updateData.isActive = input.isActive;
        if (input.expiration_date !== undefined) {
          if (input.expiration_date) {
            // Converter "YYYY-MM-DD" para timestamp BIGINT em ms (fim do dia UTC)
            const d = new Date(input.expiration_date + 'T23:59:59.000Z');
            updateData.expiration_date = isNaN(d.getTime()) ? null : d.getTime();
          } else {
            updateData.expiration_date = null;
          }
        }
        if (input.password) {
          const bcryptLib = await import('bcryptjs');
          updateData.password_hash = await bcryptLib.hash(input.password, 12);
        }
        await db.update(users).set(updateData as any).where(eqOp(users.id, input.id));
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id ?? undefined,
          action: 'UPDATE_USER',
          target_type: 'USER',
          target_id: String(input.id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { success: true };
      }),

    toggleUserActive: protectedProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        if (ctx.user.id === input.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível desativar o próprio usuário' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users } = await import("../../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        // F1-5: unit_admin só pode ativar/desativar usuários da sua própria unidade
        if (ctx.user.role === 'unit_admin') {
          const targetUser = await db.select().from(users).where(eqOp(users.id, input.id)).limit(1);
          const targetUnitId = targetUser[0]?.unit_id;
          const adminUnitId = ctx.user.unit_id;
          if (!adminUnitId || targetUnitId !== adminUnitId) {
            const { getUserUnitPermission: getUnitPerm } = await import('../db');
            const hasScope = targetUnitId ? !!(await getUnitPerm(ctx.user.id, targetUnitId)) : false;
            if (!hasScope) throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin só pode gerenciar usuários da sua unidade' });
          }
        }
        await db.update(users).set({ isActive: input.isActive }).where(eqOp(users.id, input.id));
        return { success: true };
      }),

    getUserPermissions: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const { getUserUnitPermissions } = await import('../db');
        return getUserUnitPermissions(input.userId);
      }),

    setUserPermissions: protectedProcedure
      .input(z.object({
        userId: z.number(),
        permissions: z.array(z.object({
          unit_id: z.number(),
          view_studies: z.boolean(),
          edit_reports: z.boolean(),
          view_anamnesis: z.boolean(),
          print_reports: z.boolean(),
          manage_templates: z.boolean(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        // F1-5: unit_admin só pode definir permissões para unidades às quais ele próprio tem acesso
        if (ctx.user.role === 'unit_admin') {
          const { getUserUnitPermission: getUnitPerm } = await import('../db');
          for (const perm of input.permissions) {
            const adminHasAccess = ctx.user.unit_id === perm.unit_id ||
              !!(await getUnitPerm(ctx.user.id, perm.unit_id));
            if (!adminHasAccess) {
              throw new TRPCError({ code: 'FORBIDDEN', message: `Unit admin não tem acesso à unidade ${perm.unit_id}` });
            }
          }
        }
        const { setUserUnitPermissions } = await import('../db');
        await setUserUnitPermissions(input.userId, input.permissions);
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id ?? undefined,
          action: 'UPDATE_USER',
          target_type: 'USER',
          target_id: String(input.userId),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { success: true };
      }),

    listUsersWithPermissions: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users: usersTable, units: unitsTable, user_unit_permissions } = await import('../../drizzle/schema');
        // F2-5: unit_admin só vê usuários das suas unidades
        const { eq: eqOp2, inArray: inArrayOp } = await import('drizzle-orm');
        let allUsers;
        if (ctx.user.role === 'unit_admin') {
          // Busca as unidades do unit_admin
          const myPerms = await db.select({ unit_id: user_unit_permissions.unit_id })
            .from(user_unit_permissions)
            .where(eqOp2(user_unit_permissions.user_id, ctx.user.id));
          const myUnitIds = myPerms.map(p => p.unit_id);
          if (ctx.user.unit_id && !myUnitIds.includes(ctx.user.unit_id)) {
            myUnitIds.push(ctx.user.unit_id);
          }
          if (myUnitIds.length === 0) return [];
          // Busca usuários que têm permissões nessas unidades
          const usersInMyUnits = await db
            .selectDistinct({ user_id: user_unit_permissions.user_id })
            .from(user_unit_permissions)
            .where(inArrayOp(user_unit_permissions.unit_id, myUnitIds));
          const userIds = usersInMyUnits.map(u => u.user_id);
          if (userIds.length === 0) return [];
          allUsers = await db.select().from(usersTable).where(inArrayOp(usersTable.id, userIds));
        } else {
          allUsers = await db.select().from(usersTable);
        }
        const allUnits = await db.select().from(unitsTable);
        const allPerms = await db.select().from(user_unit_permissions);
        return allUsers.map(u => ({
          ...u,
          unitName: allUnits.find(un => un.id === u.unit_id)?.name ?? null,
          permissions: allPerms.filter(p => p.user_id === u.id),
        }));
      }),

});
