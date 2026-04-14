import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getTemplatesByUnitId, getGlobalTemplates, getTemplateById,
  createTemplate, updateTemplate, deleteTemplate, getDb, resolveEffectiveUnitId,
} from "../db";
import { and, eq } from "drizzle-orm";
import sanitizeHtml from "sanitize-html";
import { REPORT_SANITIZE_OPTIONS } from "../reportSanitize";

export const templatesRouter = router({
    // Listar templates pessoais do usuário logado
    listMine: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { templates } = await import('../../drizzle/schema');
      return await db.select().from(templates)
        .where(and(eq(templates.owner_user_id, ctx.user.id), eq(templates.isActive, true)))
        .orderBy(templates.updatedAt);
    }),

    // Listar templates globais da unidade (admin)
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'admin_master') {
        return await getGlobalTemplates();
      }
      // PASSO 4: Buscar templates de todas as unidades que o médico tem acesso
      const { getUserUnitPermissions } = await import('../db');
      const userPerms = await getUserUnitPermissions(ctx.user.id);
      if (userPerms.length > 0) {
        // Buscar templates de todas as unidades vinculadas (deduplicar por id)
        const allTemplates = await Promise.all(userPerms.map(p => getTemplatesByUnitId(p.unit_id)));
        const seen = new Set<number>();
        const merged = allTemplates.flat().filter(t => {
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
        return merged;
      }
      // Fallback para unit_id legado
      if (ctx.user.unit_id) {
        return await getTemplatesByUnitId(ctx.user.unit_id);
      }
      return [];
    }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const template = await getTemplateById(input.id);
        if (!template) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });
        }
        return template;
      }),
    
    // Criar template pessoal
    createPersonal: protectedProcedure
      .input(z.object({
        name: z.string().min(1, 'Nome obrigatório'),
        modality: z.string().optional(),
        exam_title: z.string().optional(),
        bodyTemplate: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });
        const { templates } = await import('../../drizzle/schema');
        const [result] = await db.insert(templates).values({
          name: input.name,
          modality: input.modality,
          exam_title: input.exam_title,
          bodyTemplate: input.bodyTemplate,
          owner_user_id: ctx.user.id,
          unit_id: ctx.user.unit_id,
          createdBy: ctx.user.id,
          isGlobal: false,
          isActive: true,
        });
        return { id: (result as any).insertId };
      }),

    // Atualizar template pessoal (só o dono pode editar)
    updatePersonal: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        modality: z.string().optional(),
        exam_title: z.string().optional(),
        bodyTemplate: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });
        const { templates } = await import('../../drizzle/schema');
        const rows = await db.select().from(templates).where(eq(templates.id, input.id));
        const template = rows[0];
        if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template não encontrado' });
        if (template.owner_user_id !== ctx.user.id && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você só pode editar seus próprios templates' });
        }
        const { id, ...data } = input;
        await db.update(templates).set(data).where(eq(templates.id, id));
        return { success: true };
      }),

    // Apagar template pessoal (só o dono pode apagar)
    deletePersonal: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });
        const { templates } = await import('../../drizzle/schema');
        const rows = await db.select().from(templates).where(eq(templates.id, input.id));
        const template = rows[0];
        if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template não encontrado' });
        if (template.owner_user_id !== ctx.user.id && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você só pode apagar seus próprios templates' });
        }
        await db.delete(templates).where(eq(templates.id, input.id));
        return { success: true };
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        modality: z.string().optional(),
        bodyTemplate: z.string(),
        fields: z.any().optional(),
        isGlobal: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.isGlobal && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admin_master can create global templates' });
        }
        // F2-6: Verificar permissão manage_templates para usuários não-admin
        if (ctx.user.role !== 'admin_master') {
          const { getUserUnitPermission } = await import('../db');
          const effectiveUnitId = await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id);
          if (effectiveUnitId) {
            const perm = await getUserUnitPermission(ctx.user.id, effectiveUnitId);
            if (perm && !perm.manage_templates) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para gerenciar templates' });
            }
          }
        }
        const id = await createTemplate({
          ...input,
          unit_id: input.isGlobal ? null : ctx.user.unit_id,
          createdBy: ctx.user.id,
        });
        
        return { id };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        modality: z.string().optional(),
        bodyTemplate: z.string().optional(),
        fields: z.any().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const template = await getTemplateById(id);
        if (!template) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Template nao encontrado' });
        }
        if (ctx.user.role !== 'admin_master' && template.unit_id !== ctx.user.unit_id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        // F2-6: Verificar permissão manage_templates para usuários não-admin
        if (ctx.user.role !== 'admin_master') {
          const { getUserUnitPermission } = await import('../db');
          const effectiveUnitId = await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id);
          if (effectiveUnitId) {
            const perm = await getUserUnitPermission(ctx.user.id, effectiveUnitId);
            if (perm && !perm.manage_templates) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para gerenciar templates' });
            }
          }
        }
        await updateTemplate(id, data);
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const template = await getTemplateById(input.id);
        if (!template) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Template nao encontrado' });
        }
        if (ctx.user.role !== 'admin_master' && template.unit_id !== ctx.user.unit_id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        // F2-6: Verificar permissão manage_templates para usuários não-admin
        if (ctx.user.role !== 'admin_master') {
          const { getUserUnitPermission } = await import('../db');
          const effectiveUnitId = await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id);
          if (effectiveUnitId) {
            const perm = await getUserUnitPermission(ctx.user.id, effectiveUnitId);
            if (perm && !perm.manage_templates) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para gerenciar templates' });
            }
          }
        }
        await deleteTemplate(input.id);
        return { success: true };
      }),

    /** Duplica um template global como template pessoal do médico logado */
    useAsBase: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });
        const template = await getTemplateById(input.id);
        if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template não encontrado' });
        const { templates } = await import('../../drizzle/schema');
        const [result] = await db.insert(templates).values({
          name: `${template.name} (minha cópia)`,
          modality: template.modality,
          exam_title: template.exam_title,
          bodyTemplate: template.bodyTemplate,
          fields: template.fields,
          owner_user_id: ctx.user.id,
          unit_id: ctx.user.unit_id,
          createdBy: ctx.user.id,
          isGlobal: false,
          isActive: true,
        });
        return { id: (result as any).insertId };
      }),

    /** Lista templates globais do sistema (is_global = true, sem unit_id) */
    listGlobal: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const { templates } = await import('../../drizzle/schema');
      const { eq, and, isNull } = await import('drizzle-orm');
      return db.select().from(templates)
        .where(and(eq(templates.isGlobal, true), eq(templates.isActive, true), isNull(templates.unit_id)))
        .orderBy(templates.modality, templates.name);
    }),

});
