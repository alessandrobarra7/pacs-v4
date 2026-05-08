import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthService } from "../auth.service";
import {
  createAuditLog, getDb, resolveEffectiveUnitId,
} from "../db";

// FIX: GROUP_PERMISSIONS definido uma única vez — evita inconsistência
// entre createUserScoped e linkExistingUserToUnitGroup
const GROUP_PERMISSIONS: Record<string, {
  view_studies: boolean; edit_reports: boolean; view_anamnesis: boolean;
  edit_anamnesis: boolean; edit_exam_legend: boolean; print_reports: boolean;
  manage_templates: boolean;
}> = {
  medicos:                 { view_studies: true,  edit_reports: true,  view_anamnesis: true,  edit_anamnesis: true,  edit_exam_legend: true,  print_reports: true,  manage_templates: true },
  operadores:              { view_studies: true,  edit_reports: false, view_anamnesis: true,  edit_anamnesis: true,  edit_exam_legend: true,  print_reports: false, manage_templates: false },
  visualizadores:          { view_studies: true,  edit_reports: false, view_anamnesis: false, edit_anamnesis: false, edit_exam_legend: false, print_reports: true,  manage_templates: false },
  responsaveisFinanceiros: { view_studies: false, edit_reports: false, view_anamnesis: false, edit_anamnesis: false, edit_exam_legend: false, print_reports: false, manage_templates: false },
  administradoresUnidade:  { view_studies: true,  edit_reports: false, view_anamnesis: false, edit_anamnesis: false, edit_exam_legend: false, print_reports: true,  manage_templates: false },
  adminsMaster:            { view_studies: true,  edit_reports: true,  view_anamnesis: true,  edit_anamnesis: true,  edit_exam_legend: true,  print_reports: true,  manage_templates: true },
};

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
      
      // V14-P2 FIX: Para unit_admin, determinar unidades administradas para filtrar linked_units
      let adminUnitIds: number[] | null = null;
      if (ctx.user.role === 'unit_admin') {
        const { getUserUnitPermissions: getAdminPerms } = await import('../db');
        const adminPerms = await getAdminPerms(ctx.user.id);
        adminUnitIds = adminPerms.map(p => p.unit_id);
        if (ctx.user.unit_id && !adminUnitIds.includes(ctx.user.unit_id)) {
          adminUnitIds.push(ctx.user.unit_id);
        }
      }
      
      const permsByUser: Record<number, { unit_id: number; unit_name: string }[]> = {};
      for (const p of allPerms) {
        // V14-P2 FIX: unit_admin só vê linked_units dentro do seu escopo
        if (adminUnitIds && !adminUnitIds.includes(p.unit_id)) continue;
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

        // FIX: capturar nome/dados ANTES de deletar — o registro some após o DELETE
        const [targetUser] = await db
          .select({ id: users.id, name: users.name, username: users.username, role: users.role })
          .from(users)
          .where(eqOp(users.id, input.id))
          .limit(1);

        if (!targetUser) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' });
        }

        // FIX: gravar audit log ANTES de deletar — garante rastreabilidade
        // mesmo que a deleção falhe parcialmente (transação incompleta)
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id ?? undefined,
          action: 'DELETE_USER',
          target_type: 'USER',
          target_id: String(input.id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });

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
        // V14-P2 FIX: unit_admin não pode mover usuário para unidade fora do seu escopo
        if (ctx.user.role === 'unit_admin' && input.unit_id !== undefined && input.unit_id !== null) {
          const { getUserUnitPermissions: getAdminPerms } = await import('../db');
          const adminPerms = await getAdminPerms(ctx.user.id);
          const adminUnitIds = adminPerms.map(p => p.unit_id);
          if (ctx.user.unit_id && !adminUnitIds.includes(ctx.user.unit_id)) adminUnitIds.push(ctx.user.unit_id);
          if (!adminUnitIds.includes(input.unit_id)) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin não pode mover usuário para unidade fora do seu escopo' });
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

        // FIX: registrar ativação/desativação no audit log
        // Ativar ou desativar acesso é operação de segurança que deve ser rastreada
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id ?? undefined,
          action: input.isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
          target_type: 'USER',
          target_id: String(input.id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });

        return { success: true };
      }),

    getUserPermissions: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const { getUserUnitPermissions, getUserById } = await import('../db');
        const perms = await getUserUnitPermissions(input.userId);
        // V13-P5 FIX: unit_admin só pode ver permissões de usuários dentro do seu escopo
        if (ctx.user.role === 'unit_admin') {
          const { getAdminManagedUnitIds } = await import('../authorization');
          const managedIds = await getAdminManagedUnitIds(ctx.user);
          if (managedIds) {
            // Verificar se o usuário alvo pertence a pelo menos uma unidade gerenciada
            const targetUser = await getUserById(input.userId);
            const targetInScope = perms.some(p => managedIds.includes(p.unit_id))
              || (targetUser?.unit_id != null && managedIds.includes(targetUser.unit_id));
            if (!targetInScope) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuário fora do seu escopo de administração' });
            }
            return perms.filter(p => managedIds.includes(p.unit_id));
          }
        }
        return perms;
      }),

    setUserPermissions: protectedProcedure
      .input(z.object({
        userId: z.number(),
        permissions: z.array(z.object({
          unit_id: z.number(),
          view_studies: z.boolean(),
          edit_reports: z.boolean(),
          view_anamnesis: z.boolean(),
          edit_anamnesis: z.boolean(),
          edit_exam_legend: z.boolean(),
          print_reports: z.boolean(),
          manage_templates: z.boolean(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        // unit_admin só pode definir permissões para unidades que ele gerencia
        if (ctx.user.role === 'unit_admin') {
          const { getAdminManagedUnitIds } = await import('../authorization');
          const managedIds = await getAdminManagedUnitIds(ctx.user);
          if (managedIds) {
            for (const perm of input.permissions) {
              if (!managedIds.includes(perm.unit_id)) {
                throw new TRPCError({ code: 'FORBIDDEN', message: `Unit admin não tem acesso à unidade ${perm.unit_id}` });
              }
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

    getUnitAccessTree: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users: usersTable, units: unitsTable, user_unit_permissions: uup } = await import('../../drizzle/schema');
        const { eq: eqOp, inArray: inArrayOp } = await import('drizzle-orm');

        // Determinar quais unidades o caller pode ver
        let allowedUnitIds: number[] | null = null;
        if (ctx.user.role === 'unit_admin') {
          const myPerms = await db.select({ unit_id: uup.unit_id }).from(uup)
            .where(eqOp(uup.user_id, ctx.user.id));
          const ids = myPerms.map(p => p.unit_id);
          if (ctx.user.unit_id && !ids.includes(ctx.user.unit_id)) ids.push(ctx.user.unit_id);
          if (ids.length === 0) return [];
          allowedUnitIds = ids;
        }

        // Buscar todas as unidades (filtradas se unit_admin)
        const allUnits = allowedUnitIds
          ? await db.select().from(unitsTable).where(inArrayOp(unitsTable.id, allowedUnitIds))
          : await db.select().from(unitsTable);

        // Buscar todos os vínculos user_unit_permissions das unidades visíveis
        const unitIds = allUnits.map(u => u.id);
        if (unitIds.length === 0) return [];

        const allPerms = await db
          .select({
            user_id: uup.user_id,
            unit_id: uup.unit_id,
            view_studies: uup.view_studies,
            edit_reports: uup.edit_reports,
            view_anamnesis: uup.view_anamnesis,
            print_reports: uup.print_reports,
            manage_templates: uup.manage_templates,
            group_key: uup.group_key,
          })
          .from(uup)
          .where(inArrayOp(uup.unit_id, unitIds));

        // Buscar todos os usuários vinculados
        const linkedUserIds = Array.from(new Set(allPerms.map(p => p.user_id)));

        // Incluir também usuários com unit_id legado nas unidades visíveis
        const legacyUsers = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(inArrayOp(usersTable.unit_id, unitIds));
        const legacyIds = legacyUsers.map(u => u.id).filter(id => !linkedUserIds.includes(id));
        const allUserIds = [...linkedUserIds, ...legacyIds];

        let allUsers: typeof usersTable.$inferSelect[] = [];
        if (allUserIds.length > 0) {
          allUsers = await db
            .select({
              id: usersTable.id,
              name: usersTable.name,
              username: usersTable.username,
              email: usersTable.email,
              role: usersTable.role,
              unit_id: usersTable.unit_id,
              isActive: usersTable.isActive,
              createdAt: usersTable.createdAt,
              lastSignedIn: usersTable.lastSignedIn,
              expiration_date: usersTable.expiration_date,
            } as any)
            .from(usersTable)
            .where(inArrayOp(usersTable.id, allUserIds)) as any;
        }

        // Montar índice de permissões por unidade e usuário
        const permsByUnit: Record<number, typeof allPerms> = {};
        // Índice: user_id -> unit_id -> group_key (para classificação por unidade)
        const groupKeyByUserUnit: Record<string, string> = {};
        for (const p of allPerms) {
          if (!permsByUnit[p.unit_id]) permsByUnit[p.unit_id] = [];
          permsByUnit[p.unit_id].push(p);
          if (p.group_key) groupKeyByUserUnit[`${p.user_id}:${p.unit_id}`] = p.group_key;
        }
        const usersById: Record<number, (typeof allUsers)[0]> = {};
        for (const u of allUsers) usersById[u.id] = u;

        // Função de agrupamento por papel (fallback para role global)
        const ROLE_GROUPS = [
          { key: 'responsaveisFinanceiros', roles: ['responsavel_financeiro'] },
          { key: 'medicos', roles: ['medico'] },
          { key: 'operadores', roles: ['operador'] },
          { key: 'visualizadores', roles: ['viewer'] },
          { key: 'administradoresUnidade', roles: ['unit_admin'] },
          { key: 'adminsMaster', roles: ['admin_master'] },
        ] as const;

        return allUnits.map(unit => {
          const permsForUnit = permsByUnit[unit.id] ?? [];

          // Usuários via permissões
          const usersInUnit = permsForUnit
            .map(p => usersById[p.user_id])
            .filter(Boolean);

          // Adicionar usuários legados (unit_id) que não têm permissão explícita
          for (const u of allUsers) {
            if (u.unit_id === unit.id && !usersInUnit.find(x => x.id === u.id)) {
              usersInUnit.push(u);
            }
          }

          // Deduplicar
          const seen = new Set<number>();
          const uniqueUsers = usersInUnit.filter(u => {
            if (seen.has(u.id)) return false;
            seen.add(u.id);
            return true;
          });

          // Agrupar por group_key da permissão (específico por unidade)
          // Fallback para role global se group_key não estiver definido
          const groups: Record<string, typeof uniqueUsers> = {
            responsaveisFinanceiros: [],
            medicos: [],
            operadores: [],
            visualizadores: [],
            administradoresUnidade: [],
            adminsMaster: [],
            outros: [],
          };
          for (const u of uniqueUsers) {
            const unitGroupKey = groupKeyByUserUnit[`${u.id}:${unit.id}`];
            if (unitGroupKey && unitGroupKey !== 'outros' && groups[unitGroupKey] !== undefined) {
              groups[unitGroupKey].push(u);
            } else {
              // Fallback: usar role global
              const group = ROLE_GROUPS.find(g => (g.roles as readonly string[]).includes(u.role));
              if (group) {
                groups[group.key].push(u);
              } else {
                groups['outros'].push(u);
              }
            }
          }

          const totalUsers = uniqueUsers.length;
          return {
            unit: {
              id: unit.id,
              name: unit.name,
              slug: unit.slug,
              isActive: unit.isActive,
              address: unit.address,
              logo_url: unit.logo_url,
            },
            totals: {
              totalUsers,
              responsibleCount: groups.responsaveisFinanceiros.length,
              doctorCount: groups.medicos.length,
              operatorCount: groups.operadores.length,
              viewerCount: groups.visualizadores.length,
              unitAdminCount: groups.administradoresUnidade.length,
            },
            groups,
          };
        });
      }),

    removeUserUnitLink: protectedProcedure
      .input(z.object({ userId: z.number(), unitId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        if (ctx.user.role === 'unit_admin') {
          const { getUserUnitPermission: getUnitPerm } = await import('../db');
          const hasAccess = ctx.user.unit_id === input.unitId ||
            !!(await getUnitPerm(ctx.user.id, input.unitId));
          if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta unidade' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { user_unit_permissions: uup } = await import('../../drizzle/schema');
        const { eq: eqOp, and: andOp } = await import('drizzle-orm');
        await db.delete(uup).where(
          andOp(eqOp(uup.user_id, input.userId), eqOp(uup.unit_id, input.unitId))
        );
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: input.unitId,
          action: 'UPDATE_USER',
          target_type: 'USER',
          target_id: String(input.userId),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { success: true };
      }),

    searchAssignableUsers: protectedProcedure
      .input(z.object({
        query: z.string().optional(),
        excludeUnitId: z.number().optional(),
        onlyActive: z.boolean().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users: usersTable, units: unitsTable, user_unit_permissions: uup } = await import('../../drizzle/schema');
        const { or, like, eq: eqOp, inArray: inArrayOp, and: andOp } = await import('drizzle-orm');
        let allowedUnitIds: number[] | null = null;
        if (ctx.user.role === 'unit_admin') {
          const myPerms = await db.select({ unit_id: uup.unit_id }).from(uup).where(eqOp(uup.user_id, ctx.user.id));
          const ids = myPerms.map(p => p.unit_id);
          if (ctx.user.unit_id && !ids.includes(ctx.user.unit_id)) ids.push(ctx.user.unit_id);
          allowedUnitIds = ids;
        }
        const whereClauses: any[] = [];
        if (input.query && input.query.trim().length > 0) {
          const q = `%${input.query.trim()}%`;
          whereClauses.push(or(like(usersTable.name, q), like(usersTable.username, q), like(usersTable.email, q)));
        }
        if (input.onlyActive) {
          whereClauses.push(eqOp(usersTable.isActive, true));
        }
        const allUsers = whereClauses.length > 0
          ? await db.select().from(usersTable).where(whereClauses.length === 1 ? whereClauses[0] : andOp(...whereClauses))
          : await db.select().from(usersTable);
        const allUnits = await db.select({ id: unitsTable.id, name: unitsTable.name }).from(unitsTable);
        const allPerms = await db.select({ user_id: uup.user_id, unit_id: uup.unit_id }).from(uup);
        const unitsById: Record<number, string> = {};
        for (const u of allUnits) unitsById[u.id] = u.name;
        return allUsers
          .filter(u => {
            if (allowedUnitIds) {
              const userUnitIds = allPerms.filter(p => p.user_id === u.id).map(p => p.unit_id);
              if (u.unit_id) userUnitIds.push(u.unit_id);
              return userUnitIds.some(id => allowedUnitIds!.includes(id));
            }
            return true;
          })
          .filter(u => {
            if (input.excludeUnitId) {
              const alreadyLinked = allPerms.some(p => p.user_id === u.id && p.unit_id === input.excludeUnitId);
              const isLegacy = u.unit_id === input.excludeUnitId;
              return !alreadyLinked && !isLegacy;
            }
            return true;
          })
          .map(u => ({
            id: u.id,
            name: u.name,
            username: u.username,
            email: u.email,
            role: u.role,
            isActive: u.isActive,
            lastSignedIn: u.lastSignedIn,
            linkedUnits: allPerms
              .filter(p => p.user_id === u.id)
              .map(p => ({ id: p.unit_id, name: unitsById[p.unit_id] ?? '' }))
              .filter(x => x.name),
          }));
      }),

    createUserScoped: protectedProcedure
      .input(z.object({
        username: z.string()
          .min(3, { message: 'Username deve ter ao menos 3 caracteres' })
          .max(64, { message: 'Username deve ter no máximo 64 caracteres' })
          .regex(/^[a-zA-Z0-9_-]+$/, {
            message: 'Username deve conter apenas letras, números, underscore (_) ou hífen (-)'
          }),
        email: z.string().email().optional(),
        name: z.string().min(1),
        password: z.string().min(6),
        role: z.enum(['medico', 'operador', 'viewer', 'responsavel_financeiro']),
        unitId: z.number(),
        groupKey: z.enum(['medicos', 'operadores', 'visualizadores', 'responsaveisFinanceiros', 'administradoresUnidade']),
      }))
      .mutation(async ({ input, ctx }) => {
        // Apenas admin_master e unit_admin podem criar usuários
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        
        // unit_admin só pode criar usuários para suas unidades
        if (ctx.user.role === 'unit_admin') {
          const { getUserUnitPermission: getUnitPerm } = await import('../db');
          const hasAccess = ctx.user.unit_id === input.unitId || !!(await getUnitPerm(ctx.user.id, input.unitId));
          if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta unidade' });
          // unit_admin não pode criar admin_master (não está no enum, mas adicionamos validação por segurança)
        }
        
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        
        // Criar usuário
        const password_hash = await bcrypt.hash(input.password, 12);
        const { createLocalUser } = await import('../db');
        const userId = await createLocalUser({
          username: input.username,
          email: input.email,
          name: input.name,
          password_hash,
          role: input.role,
          unit_id: input.unitId,
        });
        
        // Vincular à unidade com permissões
        const { users: usersTable, user_unit_permissions: uup } = await import('../../drizzle/schema');
        const perms = GROUP_PERMISSIONS[input.groupKey]; // usa constante do módulo
        await db.insert(uup).values({
          user_id: userId,
          unit_id: input.unitId,
          group_key: input.groupKey,
          ...perms,
        });
        
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: input.unitId,
          action: 'CREATE_USER',
          target_type: 'USER',
          target_id: String(userId),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        
        return { success: true, id: userId };
      }),

    linkExistingUserToUnitGroup: protectedProcedure
      .input(z.object({
        userId: z.number(),
        unitId: z.number(),
        groupKey: z.enum(['responsaveisFinanceiros', 'medicos', 'operadores', 'visualizadores', 'administradoresUnidade', 'adminsMaster']),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        if (ctx.user.role === 'unit_admin') {
          const { getUserUnitPermission: getUnitPerm } = await import('../db');
          const hasAccess = ctx.user.unit_id === input.unitId || !!(await getUnitPerm(ctx.user.id, input.unitId));
          if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta unidade' });
          if (input.groupKey === 'adminsMaster') throw new TRPCError({ code: 'FORBIDDEN', message: 'Operação não permitida' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users: usersTable, user_unit_permissions: uup } = await import('../../drizzle/schema');
        const { eq: eqOp, and: andOp } = await import('drizzle-orm');
        const [targetUser] = await db.select().from(usersTable).where(eqOp(usersTable.id, input.userId));
        if (!targetUser) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' });
        const [existing] = await db.select().from(uup)
          .where(andOp(eqOp(uup.user_id, input.userId), eqOp(uup.unit_id, input.unitId)));
        const perms = GROUP_PERMISSIONS[input.groupKey]; // usa constante do módulo
        if (existing) {
          await db.update(uup).set({ ...perms, group_key: input.groupKey }).where(andOp(eqOp(uup.user_id, input.userId), eqOp(uup.unit_id, input.unitId)));
        } else {
          await db.insert(uup).values({ user_id: input.userId, unit_id: input.unitId, group_key: input.groupKey, ...perms });
        }
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: input.unitId,
          action: 'UPDATE_USER',
          target_type: 'USER',
          target_id: String(input.userId),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { success: true, wasExisting: !!existing };
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
