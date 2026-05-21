import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getAllUnits, getUnitById, createUnit, updateUnit, deleteUnit,
  getDb, createAuditLog,
} from "../db";

export const unitsRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'admin_master') {
        return await getAllUnits();
      }
      // Verificar permissões por unidade (nova lógica multi-unidade)
      const { getUserUnitPermissions } = await import('../db');
      const perms = await getUserUnitPermissions(ctx.user.id);
      if (perms.length > 0) {
        const unitIds = perms.map(p => p.unit_id);
        const allUnits = await getAllUnits();
        return allUnits.filter(u => unitIds.includes(u.id));
      }
      // Fallback: unidade única do usuário (campo unit_id legado)
      if (ctx.user.unit_id) {
        const unit = await getUnitById(ctx.user.unit_id);
        return unit ? [unit] : [];
      }
      return [];
    }),

    /** Retorna as permissões do usuário logado para uma unidade específica */
    myPermissions: protectedProcedure
      .input(z.object({ unitId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role === 'admin_master') {
          // admin_master tem todas as permissões
          return {
            view_studies: true,
            edit_reports: true,
            view_anamnesis: true,
            edit_anamnesis: true,
            edit_exam_legend: true,
            print_reports: true,
            manage_templates: true,
            view_financial: true,
          };
        }
        const { getUserUnitPermission } = await import('../db');
        const perm = await getUserUnitPermission(ctx.user.id, input.unitId);
        if (!perm) {
          // V14-P1 FIX: Fallback legado com perfil MÍNIMO (não libera tudo)
          // Alinha com assertUnitPermission e canAccessUnit
          if (ctx.user.unit_id === input.unitId) {
            return {
              view_studies: true,
              edit_reports: false,
              view_anamnesis: false,
              edit_anamnesis: false,
              edit_exam_legend: false,
              print_reports: true,
              manage_templates: false,
              view_financial: false,
            };
          }
          return null;
        }
        return {
          view_studies: perm.view_studies,
          edit_reports: perm.edit_reports,
          view_anamnesis: perm.view_anamnesis,
          edit_anamnesis: perm.edit_anamnesis,
          edit_exam_legend: perm.edit_exam_legend,
          print_reports: perm.print_reports,
          manage_templates: perm.manage_templates,
          view_financial: perm.view_financial ?? false,
        };
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const unit = await getUnitById(input.id);
        if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unit not found' });
        
        if (ctx.user.role !== 'admin_master' && ctx.user.unit_id !== unit.id) {
          // Verificar permissão via user_unit_permissions (multi-unidade)
          const { getUserUnitPermission } = await import('../db');
          const perm = await getUserUnitPermission(ctx.user.id, unit.id);
          if (!perm) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          }
        }
        
        return unit;
      }),
    
    create: adminProcedure
      .input(z.object({
        name: z.string().min(2).max(255),
        slug: z.string().min(2).max(100),
        pacs_ip: z.string().min(7),
        pacs_port: z.number().int().min(1).max(65535),
        pacs_ae_title: z.string().min(1).max(16),
        pacs_local_ae_title: z.string().max(16).optional().default('LAUDS'),
        address: z.string().max(500).optional(),
        equipment_info: z.string().optional(),
        // PRG-03: renomeado de logoUrl para logo_url (campo canônico no schema)
        logo_url: z.string().optional(),
        isActive: z.boolean().optional().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await createUnit(input);
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: id,
          action: 'CREATE_UNIT',
          target_type: 'UNIT',
          target_id: String(id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { id };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(2).max(255).optional(),
        slug: z.string().min(2).max(100).optional(),
        pacs_ip: z.string().min(7).optional(),
        pacs_port: z.number().int().min(1).max(65535).optional(),
        pacs_ae_title: z.string().min(1).max(16).optional(),
        pacs_local_ae_title: z.string().max(16).optional(),
        address: z.string().max(500).optional().nullable(),
        equipment_info: z.string().optional().nullable(),
        // PRG-03: renomeado de logoUrl para logo_url (campo canônico no schema)
        logo_url: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        
        // V13-P5 FIX: unit_admin multiunidade deve poder editar unidades que gerencia via user_unit_permissions
        if (ctx.user.role !== 'admin_master') {
          const { getAdminManagedUnitIds } = await import('../authorization');
          const managedIds = await getAdminManagedUnitIds(ctx.user);
          const allowed = managedIds === null || (managedIds && managedIds.includes(id));
          if (!allowed) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          }
        }
        
        await updateUnit(id, data);
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: id,
          action: 'UPDATE_UNIT',
          target_type: 'UNIT',
          target_id: String(id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { success: true };
      }),
    
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteUnit(input.id);
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: input.id,
          action: 'DELETE_UNIT',
          target_type: 'UNIT',
          target_id: String(input.id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { success: true };
      }),

    /** Lista médicos vinculados a uma unidade via user_unit_permissions */
    listDoctors: protectedProcedure
      .input(z.object({ unitId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users: usersTable, user_unit_permissions } = await import('../../drizzle/schema');
        const { eq: eqOp, and: andOp, inArray } = await import('drizzle-orm');
        const perms = await db
          .select({ user_id: user_unit_permissions.user_id })
          .from(user_unit_permissions)
          .where(eqOp(user_unit_permissions.unit_id, input.unitId));
        const userIds = perms.map(p => p.user_id);
        if (userIds.length === 0) return [];
        return await db
          .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username, role: usersTable.role, isActive: usersTable.isActive, crm: usersTable.crm })
          .from(usersTable)
          .where(andOp(inArray(usersTable.id, userIds), eqOp(usersTable.role, 'medico')));
      }),

    /** Lista todos os médicos do sistema (para adicionar à unidade) */
    listAllDoctors: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users: usersTable } = await import('../../drizzle/schema');
        const { eq: eqOp } = await import('drizzle-orm');
        return await db
          .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username, role: usersTable.role, isActive: usersTable.isActive, crm: usersTable.crm })
          .from(usersTable)
          .where(eqOp(usersTable.role, 'medico'));
      }),

    /** Vincula médico a uma unidade (cria user_unit_permissions se não existir) */
    addDoctor: protectedProcedure
      .input(z.object({ unitId: z.number(), doctorUserId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        // V14-P2 FIX: unit_admin só pode vincular médico a unidades que administra
        if (ctx.user.role === 'unit_admin') {
          const { getUserUnitPermission: getUnitPerm } = await import('../db');
          const hasScope = ctx.user.unit_id === input.unitId || !!(await getUnitPerm(ctx.user.id, input.unitId));
          if (!hasScope) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin não tem acesso a esta unidade' });
          }
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { user_unit_permissions } = await import('../../drizzle/schema');
        const { eq: eqOp, and: andOp } = await import('drizzle-orm');
        const existing = await db
          .select({ id: user_unit_permissions.id })
          .from(user_unit_permissions)
          .where(andOp(eqOp(user_unit_permissions.user_id, input.doctorUserId), eqOp(user_unit_permissions.unit_id, input.unitId)));
        if (existing.length > 0) return { success: true, alreadyLinked: true };
        await db.insert(user_unit_permissions).values({
          user_id: input.doctorUserId,
          unit_id: input.unitId,
          view_studies: true,
          edit_reports: true,
          view_anamnesis: true,
          print_reports: true,
          manage_templates: false,
        });
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: input.unitId,
          action: 'UPDATE_UNIT',
          target_type: 'USER',
          target_id: String(input.doctorUserId),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { success: true, alreadyLinked: false };
      }),

    /** Remove vínculo de médico com uma unidade */
    removeDoctor: protectedProcedure
      .input(z.object({ unitId: z.number(), doctorUserId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { user_unit_permissions } = await import('../../drizzle/schema');
        const { eq: eqOp, and: andOp } = await import('drizzle-orm');
        await db
          .delete(user_unit_permissions)
          .where(andOp(eqOp(user_unit_permissions.user_id, input.doctorUserId), eqOp(user_unit_permissions.unit_id, input.unitId)));
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: input.unitId,
          action: 'UPDATE_UNIT',
          target_type: 'USER',
          target_id: String(input.doctorUserId),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { success: true };
      }),

});
