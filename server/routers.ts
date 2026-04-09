import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "@shared/const";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sdk } from "./_core/sdk";
import { AuthService } from "./auth.service";
import {
  getAllUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
  getStudiesByUnitId,
  getStudyById,
  getStudyByInstanceUid,
  getTemplatesByUnitId,
  getGlobalTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getReportByStudyId,
  getReportById,
  createReport,
  updateReport,
  createAuditLog,
  getDb,
  getUserByUsernameOrEmail,
  createLocalUser,
  updateUserPassword,
  getReportStatusByStudyUids,
  getAnnotationsByStudy,
  upsertAnnotation,
  deleteAnnotation,
  getAnamnesisSimple,
  saveAnamnesisSimple,
  getStudyMetadata,
  getStudyMetadataBatch,
  upsertStudyMetadata,
} from "./db";
import { units, studies_cache, reports } from "../drizzle/schema";
import { eq, and, like } from "drizzle-orm";
// orthanc.ts mantido para visualização futura via DICOMweb, não mais usado na pesquisa
import { getDicomWebUrl } from "./orthanc";
import { cFind } from "./dicom.service";
import type { CFindResult } from "./dicom.service";
import { MAX_UPLOAD_BYTES } from '../shared/const'; // M4: constante centralizada

/**
 * Bug fix N1: Infere a extensão real do arquivo a partir do data URI.
 * Evita que WebP/JPEG/GIF sejam salvos com extensão .png incorreta.
 */
function inferExtension(dataUri: string): string {
  const match = dataUri.match(/^data:image\/([a-z+]+);base64,/);
  const mime = match?.[1] || 'png';
  if (mime === 'jpeg') return 'jpg';
  if (mime === 'svg+xml') return 'svg';
  return mime; // png, gif, webp
}

/**
 * Bug fix 5.2: Valida magic bytes para garantir que o buffer é uma imagem real.
 * Aceita PNG, JPEG, GIF e WebP.
 */
function isValidImageBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  // WebP: RIFF....WEBP
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return true;
  return false;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),

    login: publicProcedure
      .input(z.object({
        login: z.string().min(1),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const user = await AuthService.validateCredentials(input.login, input.password);
          // Usa sdk.signSession para gerar JWT no formato esperado pelo sdk.authenticateRequest
          // O payload precisa ter { openId, appId, name } para ser lido pelo verifySession
          const token = await sdk.signSession({
            openId: user.openId,
            appId: process.env.VITE_APP_ID ?? 'pacs-local',
            name: user.name ?? user.username ?? 'Usuário',
          });
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
          const sanitizedUser = AuthService.sanitizeUser(user);
          return { success: true, user: sanitizedUser };
        } catch (error: any) {
          const message = error.message === 'USER_NOT_FOUND' || error.message === 'INVALID_PASSWORD'
            ? 'Credenciais inválidas'
            : error.message === 'USER_INACTIVE'
              ? 'Usuário inativo'
              : 'Erro ao fazer login';
          throw new TRPCError({ code: 'UNAUTHORIZED', message });
        }
      }),

    createLocalUser: adminProcedure
      .input(z.object({
        username: z.string().min(3).max(64),
        email: z.string().email().optional(),
        name: z.string().min(1),
        password: z.string().min(6),
        role: z.enum(['admin_master', 'unit_admin', 'medico', 'viewer', 'operador', 'responsavel_financeiro']),
        unit_id: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const password_hash = await bcrypt.hash(input.password, 12);
        const id = await createLocalUser({
          username: input.username,
          email: input.email,
          name: input.name,
          password_hash,
          role: input.role,
          unit_id: input.unit_id,
        });
        return { success: true, id };
      }),

    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.password_hash) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Usuário não usa autenticação local' });
        }
        const valid = await bcrypt.compare(input.currentPassword, ctx.user.password_hash);
        if (!valid) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Senha atual incorreta' });
        }
        const newHash = await bcrypt.hash(input.newPassword, 12);
        await updateUserPassword(ctx.user.id, newHash);
        return { success: true };
      }),
  }),

  units: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'admin_master') {
        return await getAllUnits();
      }
      // Verificar permissões por unidade (nova lógica multi-unidade)
      const { getUserUnitPermissions } = await import('./db');
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
            print_reports: true,
            manage_templates: true,
          };
        }
        const { getUserUnitPermission } = await import('./db');
        const perm = await getUserUnitPermission(ctx.user.id, input.unitId);
        if (!perm) {
          // Fallback para unit_id legado
          if (ctx.user.unit_id === input.unitId) {
            return { view_studies: true, edit_reports: true, view_anamnesis: true, print_reports: true, manage_templates: true };
          }
          return null;
        }
        return {
          view_studies: perm.view_studies,
          edit_reports: perm.edit_reports,
          view_anamnesis: perm.view_anamnesis,
          print_reports: perm.print_reports,
          manage_templates: perm.manage_templates,
        };
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const unit = await getUnitById(input.id);
        if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unit not found' });
        
        if (ctx.user.role !== 'admin_master' && ctx.user.unit_id !== unit.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
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
        logoUrl: z.string().optional(),
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
        logoUrl: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        
        if (ctx.user.role !== 'admin_master' && ctx.user.unit_id !== id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
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
  }),

  studies: router({
    list: protectedProcedure
      .input(z.object({
        patient_name: z.string().optional(),
        modality: z.string().optional(),
        study_date: z.string().optional(),
        accession_number: z.string().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user.unit_id && ctx.user.role !== 'admin_master') {
          return { items: [], total: 0, page: input.page, pageSize: input.pageSize };
        }
        
        const unitId = ctx.user.unit_id || 0;
        const offset = (input.page - 1) * input.pageSize;
        
        const db = await getDb();
        
        let countResult = 0;
        if (db) {
          const { count } = await import('drizzle-orm');
          const conditions = [eq(studies_cache.unit_id, unitId)];
          
          if (input.patient_name) {
            conditions.push(like(studies_cache.patient_name, `%${input.patient_name}%`));
          }
          if (input.modality) {
            conditions.push(eq(studies_cache.modality, input.modality));
          }
          if (input.study_date) {
            conditions.push(like(studies_cache.study_date, `%${input.study_date}%`));
          }
          if (input.accession_number) {
            conditions.push(like(studies_cache.accession_number, `%${input.accession_number}%`));
          }
          
          const [{ total }] = await db
            .select({ total: count() })
            .from(studies_cache)
            .where(and(...conditions));
          countResult = Number(total);
        }
        
        const studies = await getStudiesByUnitId(unitId, {
          patient_name: input.patient_name,
          modality: input.modality,
          study_date: input.study_date,
          accession_number: input.accession_number,
          limit: input.pageSize,
          offset,
        });
        
        return {
          items: studies,
          total: countResult,
          page: input.page,
          pageSize: input.pageSize,
        };
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const unitId = ctx.user.role === 'admin_master' ? undefined : (ctx.user.unit_id ?? undefined);
        const study = await getStudyById(input.id, unitId);
        
        if (!study) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Study not found' });
        }
        
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: study.unit_id,
          action: 'VIEW_STUDY',
          target_type: 'STUDY',
          target_id: String(study.id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        
        return study;
      }),
    
    openViewer: protectedProcedure
      .input(z.object({ studyId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const unitId = ctx.user.role === 'admin_master' ? undefined : (ctx.user.unit_id ?? undefined);
        const study = await getStudyById(input.studyId, unitId);
        
        if (!study) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Study not found' });
        }
        
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: study.unit_id,
          action: 'OPEN_VIEWER',
          target_type: 'STUDY',
          target_id: String(study.id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        
        const unit = await getUnitById(study.unit_id);
        return {
          viewerUrl: `/viewer/${study.id}`,
          studyInstanceUid: study.study_instance_uid,
          unitSlug: unit?.slug,
        };
      }),
  }),

  templates: router({
    // Listar templates pessoais do usuário logado
    listMine: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { templates } = await import('../drizzle/schema');
      return await db.select().from(templates)
        .where(and(eq(templates.owner_user_id, ctx.user.id), eq(templates.isActive, true)))
        .orderBy(templates.updatedAt);
    }),

    // Listar templates globais da unidade (admin)
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'admin_master') {
        return await getGlobalTemplates();
      }
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
        const { templates } = await import('../drizzle/schema');
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
        const { templates } = await import('../drizzle/schema');
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
        const { templates } = await import('../drizzle/schema');
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
        await deleteTemplate(input.id);
        return { success: true };
      }),
  }),

  reports: router({
    getByStudyId: protectedProcedure
      .input(z.object({ studyId: z.number() }))
      .query(async ({ input, ctx }) => {
        const unitId = ctx.user.role === 'admin_master' ? undefined : (ctx.user.unit_id ?? undefined);
        return await getReportByStudyId(input.studyId, unitId);
      }),

    getByStudyUid: protectedProcedure
      .input(z.object({ studyInstanceUid: z.string() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });
        const unitId = ctx.user.role === 'admin_master' ? undefined : (ctx.user.unit_id ?? undefined);
        const rows = unitId
          ? await db.select().from(reports).where(and(eq(reports.study_instance_uid, input.studyInstanceUid), eq(reports.unit_id, unitId)))
          : await db.select().from(reports).where(eq(reports.study_instance_uid, input.studyInstanceUid));
        return rows[0] ?? null;
      }),

    // Retorna laudo + dados do médico assinante (para impressão com carimbo)
    getByStudyUidWithDoctor: protectedProcedure
      .input(z.object({ studyInstanceUid: z.string() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });
        const unitId = ctx.user.role === 'admin_master' ? undefined : (ctx.user.unit_id ?? undefined);
        const rows = unitId
          ? await db.select().from(reports).where(and(eq(reports.study_instance_uid, input.studyInstanceUid), eq(reports.unit_id, unitId)))
          : await db.select().from(reports).where(eq(reports.study_instance_uid, input.studyInstanceUid));
        const report = rows[0] ?? null;
        if (!report) return null;
        // Buscar dados do médico que assinou
        const { getUserById } = await import('./db');
        const signedByUserId = report.signedBy ?? report.author_user_id;
        const doctor = await getUserById(signedByUserId);
        return {
          ...report,
          doctorName: doctor?.name ?? '',
          doctorCrm: doctor?.crm ?? '',
          doctorStampUrl: doctor?.stamp_url ?? null,
          doctorSignatureUrl: doctor?.signature_url ?? null,
        };
      }),
    
    create: protectedProcedure
      .input(z.object({
        study_id: z.number().optional(),
        study_instance_uid: z.string().optional(),
        template_id: z.number().optional(),
        body: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.unit_id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'User must be assigned to a unit' });
        }
        
        const id = await createReport({
          ...input,
          unit_id: ctx.user.unit_id,
          author_user_id: ctx.user.id,
          status: 'draft',
        });
        
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id,
          action: 'CREATE_REPORT',
          target_type: 'REPORT',
          target_id: String(id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        
        return { id };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        body: z.string().optional(),
        status: z.enum(['draft', 'signed', 'revised']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        // CORREÇÃO BUG: usar getReportById (por ID do laudo), não getReportByStudyId
        const unitId = ctx.user.role === 'admin_master' ? undefined : (ctx.user.unit_id ?? undefined);
        const report = await getReportById(id, unitId);
        if (!report) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Laudo não encontrado' });
        }
        if (ctx.user.role !== 'admin_master' && report.unit_id !== ctx.user.unit_id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        // Bug fix B1: bloquear atualização direta de laudos assinados ou retificados.
        // Laudos nesse estado só podem ser alterados via reports.revise (com histórico e motivo).
        if (report.status === 'signed' || report.status === 'revised') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Laudos assinados só podem ser editados via retificação.',
          });
        }
        await updateReport(id, data);
        
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id,
          action: 'UPDATE_REPORT',
          target_type: 'REPORT',
          target_id: String(id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        
        return { success: true };
      }),
    
    sign: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // CORREÇÃO BUG: usar getReportById (por ID do laudo), não getReportByStudyId
        const unitId = ctx.user.role === 'admin_master' ? undefined : (ctx.user.unit_id ?? undefined);
        const report = await getReportById(input.id, unitId);
        if (!report) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Laudo não encontrado' });
        }
        if (ctx.user.role !== 'admin_master' && report.unit_id !== ctx.user.unit_id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        await updateReport(input.id, {
          status: 'signed',
          signedAt: new Date(),
          signedBy: ctx.user.id,
        });
        
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id,
          action: 'SIGN_REPORT',
          target_type: 'REPORT',
          target_id: String(input.id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        
        return { success: true };
      }),

    statusByStudyUids: protectedProcedure
      .input(z.object({ studyUids: z.array(z.string()) }))
      .query(async ({ input, ctx }) => {
        const unitId = ctx.user.role === 'admin_master' ? undefined : (ctx.user.unit_id ?? undefined);
        return await getReportStatusByStudyUids(input.studyUids, unitId);
      }),

    // Retificar laudo assinado: salva versão anterior e cria nova revisão
    revise: protectedProcedure
      .input(z.object({
        id: z.number(),
        body: z.string(),
        reason: z.string().min(5, 'Informe o motivo da retificação (mínimo 5 caracteres)'),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });
        const unitId = ctx.user.role === 'admin_master' ? undefined : (ctx.user.unit_id ?? undefined);
        const report = await getReportById(input.id, unitId);
        if (!report) throw new TRPCError({ code: 'NOT_FOUND', message: 'Laudo não encontrado' });
        if (ctx.user.role !== 'admin_master' && report.unit_id !== ctx.user.unit_id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        if (report.status !== 'signed' && report.status !== 'revised') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Apenas laudos assinados podem ser retificados' });
        }
        // 1. Salvar versão anterior no histórico
        const { report_versions } = await import('../drizzle/schema');
        await db.insert(report_versions).values({
          report_id: report.id,
          version: report.version ?? 1,
          body: report.body,
          status: report.status as 'draft' | 'signed' | 'revised',
          reason: input.reason,
          saved_by_user_id: ctx.user.id,
        });
        // 2. Atualizar laudo com novo corpo e status 'revised'
        // Bug fix B4: atualizar signedAt e signedBy para refletir quem retificou e quando,
        // garantindo rastreabilidade médico-legal correta no laudo impresso e no histórico.
        await updateReport(input.id, {
          body: input.body,
          status: 'revised',
          version: (report.version ?? 1) + 1,
          signedAt: new Date(),
          signedBy: ctx.user.id,
        });
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id,
          action: 'UPDATE_REPORT',
          target_type: 'REPORT',
          target_id: String(input.id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
          metadata: { action: 'REVISE', reason: input.reason, newVersion: (report.version ?? 1) + 1 },
        });
        return { success: true };
      }),

    // Apagar laudo (rascunho ou assinado)
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });
        const unitId = ctx.user.role === 'admin_master' ? undefined : (ctx.user.unit_id ?? undefined);
        const report = await getReportById(input.id, unitId);
        if (!report) throw new TRPCError({ code: 'NOT_FOUND', message: 'Laudo não encontrado' });
        if (ctx.user.role !== 'admin_master' && report.unit_id !== ctx.user.unit_id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        // Apagar versões históricas primeiro (FK)
        const { report_versions } = await import('../drizzle/schema');
        await db.delete(report_versions).where(eq(report_versions.report_id, input.id));
        // Apagar o laudo
        await db.delete(reports).where(eq(reports.id, input.id));
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id,
          action: 'DELETE_REPORT',
          target_type: 'REPORT',
          target_id: String(input.id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { success: true };
      }),

    // Buscar histórico de versões de um laudo
    getVersions: protectedProcedure
      .input(z.object({ reportId: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });
        const { report_versions } = await import('../drizzle/schema');
        const { desc } = await import('drizzle-orm');
        return await db.select().from(report_versions)
          .where(eq(report_versions.report_id, input.reportId))
          .orderBy(desc(report_versions.saved_at));
      }),
  }),

  pacs: router({
    query: protectedProcedure
      .input(z.object({
        patientName: z.string().optional(),
        patientId: z.string().optional(),
        modality: z.string().optional(),
        studyDate: z.string().optional(),
        accessionNumber: z.string().optional(),
        studyDescription: z.string().optional(),
        unit_id: z.number().optional(), // admin_master pode passar unit_id explícito
      }))
      .mutation(async ({ input, ctx }) => {
        // Get user's unit to retrieve PACS connection parameters
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database not available',
          });
        }

        // admin_master pode especificar unit_id; demais usuários usam a própria unidade
        const targetUnitId = (ctx.user.role === 'admin_master' && input.unit_id)
          ? input.unit_id
          : ctx.user.unit_id;

        // Busca unidade do usuário
        if (!targetUnitId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Usuário não está associado a nenhuma unidade. Entre em contato com o administrador.',
          });
        }
        
        const [unitData] = await db.select().from(units).where(eq(units.id, targetUnitId)).limit(1);
        const unit = unitData;
        
        if (!unit) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Nenhuma unidade configurada. Acesse Administração > Unidades para configurar.',
          });
        }
        
        // MODO ÚNICO: DICOM DIRETO via C-FIND
        const hasDicomDirect = !!(unit.pacs_ip && unit.pacs_port && unit.pacs_ae_title);
        
        if (!hasDicomDirect) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'A unidade não está configurada corretamente. Verifique o IP, Porta e AE Title nas configurações.',
          });
        }
        
        // Handle special date values
        let studyDate = input.studyDate;
        if (studyDate === 'TODAY') {
          // Use server's local date (not UTC)
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          studyDate = `${year}${month}${day}`;
          console.log('[PACS Query] TODAY resolved to:', studyDate);
        } else if (studyDate === 'LAST_7_DAYS') {
          // Calculate date 7 days ago
          const now = new Date();
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const year = sevenDaysAgo.getFullYear();
          const month = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
          const day = String(sevenDaysAgo.getDate()).padStart(2, '0');
          studyDate = `${year}${month}${day}-`; // Range format: YYYYMMDD- means from that date to today
          console.log('[PACS Query] LAST_7_DAYS resolved to:', studyDate);
        } else if (studyDate === 'LAST_30_DAYS') {
          // Calculate date 30 days ago
          const now = new Date();
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          const year = thirtyDaysAgo.getFullYear();
          const month = String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0');
          const day = String(thirtyDaysAgo.getDate()).padStart(2, '0');
          studyDate = `${year}${month}${day}-`; // Range format: YYYYMMDD- means from that date to today
          console.log('[PACS Query] LAST_30_DAYS resolved to:', studyDate);
        }
        
        const filters = {
          patientName: input.patientName,
          patientId: input.patientId,
          modality: input.modality,
          studyDate,
          accessionNumber: input.accessionNumber,
        };
        
        try {
          let studies: any[] = [];
          let truncated = false;
          let timedOut = false;

          // MODO ÚNCO: C-FIND DICOM DIRETO
          console.log(`[PACS Query] C-FIND → ${unit.pacs_ip}:${unit.pacs_port} AE=${unit.pacs_ae_title}`);
          const cFindResult: CFindResult = await cFind(
            {
              ip: unit.pacs_ip!,
              port: unit.pacs_port!,
              remoteAeTitle: unit.pacs_ae_title!,
              localAeTitle: unit.pacs_local_ae_title || 'LAUDS',
            },
            {
              // Bug fix A4: wildcard DICOM adicionado apenas em dicom.service.ts.
              // Adicionar aqui também resultava em '**JOSE**' enviado ao PACS, causando zero resultados.
              patientName: filters.patientName || undefined,
              patientID: filters.patientId,
              studyDate: filters.studyDate,
              // Não enviar modality se for vazio ou 'ALL' — C-FIND retorna todos quando omitido
              modality: (filters.modality && filters.modality !== 'ALL') ? filters.modality : undefined,
              accessionNumber: filters.accessionNumber,
            }
          );
          // Bug fix A3/A5: extrair flags de truncamento e timeout do resultado
          studies = cFindResult.studies;
          truncated = cFindResult.truncated;
          timedOut = cFindResult.timedOut;
          console.log(`[PACS Query] C-FIND retornou ${studies.length} estudos${truncated ? ' (TRUNCADO)' : ''}${timedOut ? ' (TIMEOUT)' : ''}`);
          // Normaliza campos para o frontend
          studies = studies.map((s: any) => ({
            studyInstanceUid: s.studyInstanceUID || s.studyInstanceUid || '',
            patientName: (s.patientName || '').replace(/\^+/g, ' ').trim(),
            patientID: s.patientID || s.patientId || '',
            patientBirthDate: s.patientBirthDate || '',
            patientSex: s.patientSex || '',
            studyDate: s.studyDate || '',
            studyTime: s.studyTime || '',
            modality: s.modality || '',
            studyDescription: s.studyDescription || '',
            accessionNumber: s.accessionNumber || '',
            numberOfSeries: s.numberOfSeries || 0,
            numberOfInstances: s.numberOfInstances || 0,
            retrieveAeTitle: s.retrieveAeTitle || unit.pacs_ae_title || '',
            unitId: unit.id,
            unitName: unit.name,
            source: 'dicom_direct',
          }));
          
          // Log audit
          await createAuditLog({
            user_id: ctx.user.id,
            unit_id: ctx.user.unit_id,
            action: 'PACS_QUERY',
            target_type: 'PACS',
            target_id: unit.pacs_ae_title || 'unknown',
            ip_address: ctx.req.ip,
            user_agent: ctx.req.headers['user-agent'],
            metadata: {
              ...input,
              results_count: studies.length,
            },
          });
          
          return {
            success: true,
            studies,
            count: studies.length,
            // Bug fix A3/A5: propagar flags de truncamento e timeout ao frontend
            truncated,
            timedOut,
          };
          
        } catch (error: any) {
          console.error('[PACS Query] Erro:', error);
          
          await createAuditLog({
            user_id: ctx.user.id,
            unit_id: ctx.user.unit_id,
            action: 'PACS_QUERY',
            target_type: 'PACS',
            target_id: unit.pacs_ae_title || 'unknown',
            ip_address: ctx.req.ip,
            user_agent: ctx.req.headers['user-agent'],
            metadata: { ...input, error: error.message },
          });
          
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Falha na consulta DICOM: ${error.message}`,
          });
        }
      }),
    
    startViewer: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
        unit_id: z.number().optional(), // admin_master pode especificar a unidade
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database não disponível',
          });
        }

        // Determinar a unidade alvo: admin_master pode passar unit_id explícito
        const targetUnitId = (ctx.user.role === 'admin_master' && input.unit_id)
          ? input.unit_id
          : ctx.user.unit_id;

        if (!targetUnitId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Usuário não está associado a nenhuma unidade.',
          });
        }

        // Get user's unit to access PACS configuration
        const [unit] = await db.select().from(units).where(eq(units.id, targetUnitId)).limit(1);
        
        if (!unit) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Unidade não encontrada',
          });
        }
        
        // Check if PACS connection is configured
        if (!unit.pacs_ip || !unit.pacs_port || !unit.pacs_ae_title) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'PACS não configurado para esta unidade.',
          });
        }
        
        const localAeTitle = unit.pacs_local_ae_title || 'LAUDS';
        
        // Verificar cache existente — evita re-download se imagens já estão no disco
        const { existsSync, readdirSync } = await import('fs');
        const studyCacheDir = `/tmp/dicom-cache/${input.studyInstanceUid}`;
        if (existsSync(studyCacheDir)) {
          const cachedFiles = readdirSync(studyCacheDir).filter((f: string) => f.endsWith('.dcm'));
          if (cachedFiles.length > 0) {
            console.log(`[C-GET] Cache HIT: ${cachedFiles.length} arquivos para ${input.studyInstanceUid}`);
            await createAuditLog({
              user_id: ctx.user.id,
              unit_id: targetUnitId,
              action: 'OPEN_VIEWER',
              target_type: 'STUDY',
              target_id: input.studyInstanceUid,
              ip_address: ctx.req.ip,
              user_agent: ctx.req.headers['user-agent'],
              metadata: { cache_hit: true, file_count: cachedFiles.length },
            });
            return {
              success: true,
              studyInstanceUid: input.studyInstanceUid,
              fileCount: cachedFiles.length,
              cacheDir: studyCacheDir,
              durationSec: 0,
              fromCache: true,
            };
          }
        }
        
        const moveInput = {
          pacs_ip: unit.pacs_ip,
          pacs_port: unit.pacs_port,
          pacs_ae_title: unit.pacs_ae_title,
          local_ae_title: localAeTitle,
          study_instance_uid: input.studyInstanceUid,
          cache_dir: '/tmp/dicom-cache',
        };

        console.log(`[C-GET] Iniciando: StudyUID=${input.studyInstanceUid} PACS=${unit.pacs_ip}:${unit.pacs_port} AE=${unit.pacs_ae_title} LocalAE=${localAeTitle} User=${ctx.user.username}`);

        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);

        try {
          // Executa dicom_move.py diretamente (sem wrapper .sh)
          // Em dev: import.meta.url aponta para server/routers.ts → mesmo nível
          // Em prod: dist/routers.js → dicom_move.py está em dist/ (copiado pelo build)
          const { existsSync: _existsSync } = await import('fs');
          const _scriptPathSameLevel = new URL('./dicom_move.py', import.meta.url).pathname;
          const _scriptPathParent = new URL('../dicom_move.py', import.meta.url).pathname;
          const scriptPath = _existsSync(_scriptPathSameLevel) ? _scriptPathSameLevel : _scriptPathParent;
          // Usar caminho absoluto do Python 3.11 e limpar PYTHONHOME/PYTHONPATH
          // para evitar conflito com o ambiente uv Python 3.13 do servidor
          const pythonBin = '/usr/bin/python3.11';
          const cleanEnv = { ...process.env };
          delete cleanEnv.PYTHONHOME;
          delete cleanEnv.PYTHONPATH;
          const { stdout, stderr } = await execFileAsync(
            pythonBin,
            [scriptPath, JSON.stringify(moveInput)],
            { timeout: 600000, env: cleanEnv } // 10 minutos para estudos grandes (CT com 200+ imagens)
          );

          if (stderr) {
            // stderr contém os logs detalhados do script — registrar no console do servidor
            console.log(`[C-GET] Logs do script:\n${stderr}`);
          }

          let result: any;
          try {
            result = JSON.parse(stdout);
          } catch {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Resposta inválida do script C-GET. Verifique os logs do servidor.',
            });
          }

          console.log(`[C-GET] Resultado: success=${result.success} files=${result.file_count} duration=${result.duration_sec}s`);
          if (result.logs) {
            result.logs.forEach((l: string) => console.log(`[C-GET] ${l}`));
          }

          // Registrar auditoria independente do resultado
          await createAuditLog({
            user_id: ctx.user.id,
            unit_id: targetUnitId,
            action: 'OPEN_VIEWER',
            target_type: 'STUDY',
            target_id: input.studyInstanceUid,
            ip_address: ctx.req.ip,
            user_agent: ctx.req.headers['user-agent'],
            metadata: {
              pacs_ip: unit.pacs_ip,
              pacs_ae_title: unit.pacs_ae_title,
              local_ae_title: localAeTitle,
              file_count: result.file_count || 0,
              duration_sec: result.duration_sec || 0,
              success: result.success,
            },
          });

          if (!result.success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: result.error || 'Erro desconhecido no C-GET.',
            });
          }

          if (!result.file_count || result.file_count === 0) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Nenhuma imagem recebida do PACS via C-GET. Verifique se o PACS suporta C-GET para este estudo.',
            });
          }

          return {
            success: true,
            studyInstanceUid: input.studyInstanceUid,
            fileCount: result.file_count,
            cacheDir: result.cache_dir,
            durationSec: result.duration_sec,
            pacsAeTitle: unit.pacs_ae_title || 'DPACS',
          };

        } catch (error: any) {
          if (error instanceof TRPCError) throw error;
          console.error('[C-GET] Erro inesperado:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Falha ao executar C-GET: ${error.message}`,
          });
        }
      }),
    
    getViewerUrl: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
      }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database não disponível' });
        
        if (!ctx.user.unit_id && ctx.user.role !== 'admin_master') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Usuário não está associado a nenhuma unidade. Entre em contato com o administrador.',
          });
        }

        // Determinar a unidade alvo
        const targetUnitIdForViewer = ctx.user.unit_id;
        if (!targetUnitIdForViewer) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Usuário não está associado a nenhuma unidade.',
          });
        }
        
        const [unitData] = await db.select().from(units).where(eq(units.id, targetUnitIdForViewer)).limit(1);
        if (!unitData) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unidade não encontrada' });
        
        const orthancInternalUrl = unitData.orthanc_base_url;
        // URL pública via Mikrotik NAT (para o frontend abrir o viewer diretamente)
        const orthancPublicUrl = unitData.orthanc_public_url || orthancInternalUrl;
        
        if (!orthancInternalUrl) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'URL do Orthanc não configurada para esta unidade.',
          });
        }
        
        // URL interna para proxy DICOMweb do backend
        const viewerUrl = getDicomWebUrl(orthancInternalUrl, input.studyInstanceUid);
        // URL pública para o Orthanc Web Viewer (abre no browser do usuário)
        const orthancWebViewerUrl = orthancPublicUrl
          ? `${orthancPublicUrl.replace(/\/$/, '')}/app/explorer.html#study?uuid=`
          : null;
        
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id,
          action: 'OPEN_VIEWER',
          target_type: 'STUDY',
          target_id: input.studyInstanceUid,
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
          metadata: { orthanc_url: orthancInternalUrl, viewer_url: viewerUrl },
        });
        
        return {
          success: true,
          viewerUrl,
          studyInstanceUid: input.studyInstanceUid,
          orthancUrl: orthancInternalUrl,
          orthancPublicUrl,
          orthancWebViewerUrl,
        };
      }),

    download: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        // TODO: Implement C-MOVE to download study from remote PACS to local Orthanc
        
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id,
          action: 'PACS_DOWNLOAD',
          target_type: 'STUDY',
          target_id: input.studyInstanceUid,
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        
        return {
          success: true,
          message: 'Download não implementado ainda',
        };
      }),
  }),

  anamnesis: router({
    create: protectedProcedure
      .input(
        z.object({
          study_instance_uid: z.string(),
          exam_area: z.string().optional(),
          main_symptom: z.string().optional(),
          symptom_duration_days: z.number().optional(),
          symptom_intensity: z.string().optional(),
          has_fever: z.boolean().optional(),
          fever_temperature: z.number().optional(),
          has_dyspnea: z.boolean().optional(),
          has_chest_pain: z.boolean().optional(),
          associated_symptoms: z.string().optional(),
          has_hypertension: z.boolean().optional(),
          has_diabetes: z.boolean().optional(),
          has_anxiety: z.boolean().optional(),
          has_previous_lung_disease: z.boolean().optional(),
          uses_continuous_medication: z.boolean().optional(),
          medications_list: z.string().optional(),
          exam_purpose: z.string().optional(),
          suggested_cid: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { anamnesis } = await import("../drizzle/schema");
        
        const [result] = await db.insert(anamnesis).values({
          study_instance_uid: input.study_instance_uid,
          unit_id: ctx.user.unit_id || null,
          created_by_user_id: ctx.user.id,
          exam_area: input.exam_area || null,
          main_symptom: input.main_symptom || null,
          symptom_duration_days: input.symptom_duration_days ?? null,
          symptom_intensity: input.symptom_intensity || null,
          has_fever: input.has_fever || false,
          fever_temperature: input.fever_temperature ? String(input.fever_temperature) : null,
          has_dyspnea: input.has_dyspnea || false,
          has_chest_pain: input.has_chest_pain || false,
          associated_symptoms: input.associated_symptoms || null,
          has_hypertension: input.has_hypertension || false,
          has_diabetes: input.has_diabetes || false,
          has_anxiety: input.has_anxiety || false,
          has_previous_lung_disease: input.has_previous_lung_disease || false,
          uses_continuous_medication: input.uses_continuous_medication || false,
          medications_list: input.medications_list || null,
          exam_purpose: input.exam_purpose || null,
          suggested_cid: input.suggested_cid || null,
        });

        await createAuditLog({
          user_id: ctx.user.id,
          action: "CREATE_ANAMNESIS",
          target_type: "anamnesis",
          target_id: result.insertId.toString(),
        });

        return { id: result.insertId };
      }),

    getByStudyId: protectedProcedure
      .input(z.object({ study_instance_uid: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { anamnesis } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        
        const results = await db
          .select()
          .from(anamnesis)
          .where(eq(anamnesis.study_instance_uid, input.study_instance_uid))
          .limit(1);
        
        return results[0] || null;
      }),
  }),

  admin: router({
    listUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const { users, user_unit_permissions, units: unitsTable } = await import("../drizzle/schema");
      const { desc, eq: eqOp, and } = await import("drizzle-orm");
      
      const conditions = [];
      if (ctx.user.role === 'unit_admin' && ctx.user.unit_id) {
        conditions.push(eqOp(users.unit_id, ctx.user.unit_id));
      }
      
      const result = await db
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
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(users.createdAt));

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
      }));
    }),

    listAuditLog: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(100) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { audit_log, users } = await import("../drizzle/schema");
        const { desc, eq: eqOp } = await import("drizzle-orm");
        const result = await db
          .select({
            id: audit_log.id,
            action: audit_log.action,
            target_type: audit_log.target_type,
            target_id: audit_log.target_id,
            ip_address: audit_log.ip_address,
            timestamp: audit_log.timestamp,
            user_id: audit_log.user_id,
            userName: users.name,
            userUsername: users.username,
          })
          .from(audit_log)
          .leftJoin(users, eqOp(audit_log.user_id, users.id))
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
        const { users } = await import("../drizzle/schema");
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
        const { users } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
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
        const { users } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        await db.update(users).set({ isActive: input.isActive }).where(eqOp(users.id, input.id));
        return { success: true };
      }),

    getUserPermissions: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const { getUserUnitPermissions } = await import('./db');
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
        const { setUserUnitPermissions } = await import('./db');
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
        const { users: usersTable, units: unitsTable, user_unit_permissions } = await import('../drizzle/schema');
        const allUsers = await db.select().from(usersTable);
        const allUnits = await db.select().from(unitsTable);
        const allPerms = await db.select().from(user_unit_permissions);
        return allUsers.map(u => ({
          ...u,
          unitName: allUnits.find(un => un.id === u.unit_id)?.name ?? null,
          permissions: allPerms.filter(p => p.user_id === u.id),
        }));
      }),
  }),
  annotations: router({
    /** Busca todas as anotações de um estudo para o usuário logado */
    getByStudy: protectedProcedure
      .input(z.object({ studyInstanceUid: z.string() }))
      .query(async ({ input, ctx }) => {
        return getAnnotationsByStudy(input.studyInstanceUid, ctx.user.id);
      }),

    /** Salva (cria ou atualiza) uma anotação */
    save: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
        seriesInstanceUid: z.string().optional(),
        annotationUid: z.string(),
        toolName: z.string().default("Length"),
        annotationData: z.record(z.string(), z.unknown()),
        label: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await upsertAnnotation({
          study_instance_uid: input.studyInstanceUid,
          series_instance_uid: input.seriesInstanceUid ?? null,
          user_id: ctx.user.id,
          tool_name: input.toolName,
          annotation_uid: input.annotationUid,
          annotation_data: input.annotationData,
          label: input.label ?? null,
        });
        return { success: true };
      }),

    /** Remove uma anotação pelo UID */
    delete: protectedProcedure
      .input(z.object({ annotationUid: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await deleteAnnotation(input.annotationUid, ctx.user.id);
        return { success: true };
      }),
  }),

  // ─── Anamnese Simplificada ────────────────────────────────────────────────
  anamnesisSimple: router({
    /** Busca a anamnese de um estudo */
    getByStudy: protectedProcedure
      .input(z.object({ studyInstanceUid: z.string() }))
      .query(async ({ input }) => {
        return await getAnamnesisSimple(input.studyInstanceUid);
      }),

    /** Cria ou atualiza a anamnese de um estudo */
    save: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
        patientName: z.string().optional(),
        presets: z.array(z.string()),
        manualText: z.string().min(1, "O campo de indicação clínica é obrigatório"),
      }))
      .mutation(async ({ input, ctx }) => {
        await saveAnamnesisSimple({
          study_instance_uid: input.studyInstanceUid,
          unit_id: ctx.user.unit_id ?? null,
          created_by_user_id: ctx.user.id,
          patient_name: input.patientName ?? null,
          presets: input.presets,
          manual_text: input.manualText,
        });
        await createAuditLog({
          user_id: ctx.user.id,
          action: "CREATE_ANAMNESIS",
          target_type: "anamnesis_simple",
          target_id: input.studyInstanceUid,
        });
        return { success: true };
      }),
  }),

  studyMetadata: router({
    /** Busca os metadados editados de um estudo para a unidade do usuário logado */
    get: protectedProcedure
      .input(z.object({ studyInstanceUid: z.string() }))
      .query(async ({ input, ctx }) => {
        const unitId = ctx.user.unit_id;
        if (!unitId) return null;
        return await getStudyMetadata(input.studyInstanceUid, unitId);
      }),

    /** Busca metadados de múltiplos estudos (batch) para a unidade do usuário */
    getBatch: protectedProcedure
      .input(z.object({ studyInstanceUids: z.array(z.string()) }))
      .query(async ({ input, ctx }) => {
        const unitId = ctx.user.unit_id;
        if (!unitId || !input.studyInstanceUids.length) return [];
        return await getStudyMetadataBatch(input.studyInstanceUids, unitId);
      }),

    /** Salva (cria ou atualiza) os metadados editados de um estudo */
    save: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
        patientNameOverride: z.string().nullable().optional(),
        descriptionOverride: z.string().nullable().optional(),
        examCount: z.number().int().min(1).nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const unitId = ctx.user.unit_id;
        if (!unitId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuário sem unidade' });
        await upsertStudyMetadata({
          study_instance_uid: input.studyInstanceUid,
          unit_id: unitId,
          patient_name_override: input.patientNameOverride ?? null,
          description_override: input.descriptionOverride ?? null,
          exam_count: input.examCount ?? 1,
          notes: input.notes ?? null,
          edited_by_user_id: ctx.user.id,
          edited_by_name: ctx.user.name ?? ctx.user.username ?? null,
        });
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: unitId,
          action: 'EDIT_STUDY_METADATA',
          target_type: 'study_metadata',
          target_id: input.studyInstanceUid,
        });
        return { success: true };
      }),
  }),
  phrases: router({
    listGroups: protectedProcedure.query(async ({ ctx }) => {
      const { listPhraseGroups } = await import('./db');
      return listPhraseGroups(ctx.user.id);
    }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const { listPhrases } = await import('./db');
      return listPhrases(ctx.user.id);
    }),

    createGroup: protectedProcedure
      .input(z.object({ name: z.string().min(1), color: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { createPhraseGroup } = await import('./db');
        return createPhraseGroup({ name: input.name, color: input.color, userId: ctx.user.id });
      }),

    create: protectedProcedure
      .input(z.object({ groupId: z.number(), content: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const { createPhrase } = await import('./db');
        return createPhrase({ groupId: input.groupId, userId: ctx.user.id, content: input.content });
      }),

    delete: protectedProcedure
      .input(z.object({ phraseId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deletePhrase } = await import('./db');
        await deletePhrase(input.phraseId, ctx.user.id);
        return { success: true };
      }),

    toggleFavorite: protectedProcedure
      .input(z.object({ phraseId: z.number(), isFavorite: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const { togglePhrasesFavorite } = await import('./db');
        await togglePhrasesFavorite(input.phraseId, ctx.user.id, input.isFavorite);
        return { success: true };
      }),
  }),

  medicalData: router({
    updateUserMedical: protectedProcedure
      .input(z.object({
        userId: z.number(),
        crm: z.string().max(50).optional(),
        signatureFile: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { updateUserMedicalData, getUserById: getUserByIdForSig } = await import('./db');
        let signature_url: string | null | undefined = undefined;
        if (input.signatureFile) {
          const { storagePut, storageDelete } = await import('./storage');
          // Bug fix 5.1: regex corrigida para suportar image/svg+xml e outros MIME com '+'
          const base64Data = input.signatureFile.replace(/^data:[^;]+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          // Bug fix 5.2: limite de tamanho server-side (M4: usa MAX_UPLOAD_BYTES de shared/const)
          if (buffer.length > MAX_UPLOAD_BYTES) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo muito grande. Máximo 2 MB.' });
          }
          // Bug fix 5.2: validação de magic bytes
          if (!isValidImageBuffer(buffer)) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Formato de imagem inválido. Envie PNG, JPEG, GIF ou WebP.' });
          }
          // Bug fix N4: apagar assinatura antiga antes de salvar a nova
          const currentUser = await getUserByIdForSig(input.userId);
          if (currentUser?.signature_url) storageDelete(currentUser.signature_url);
          // Bug fix N1: inferir extensão real do arquivo em vez de hardcodar .png
          const sigExt = inferExtension(input.signatureFile);
          const key = `signatures/user_${input.userId}_${Date.now()}.${sigExt}`;
          const { url } = await storagePut(key, buffer, `image/${sigExt === 'jpg' ? 'jpeg' : sigExt}`);
          signature_url = url;
        }
        await updateUserMedicalData(input.userId, {
          crm: input.crm,
          ...(signature_url !== undefined ? { signature_url } : {}),
        });
        return { success: true };
      }),

    updateUnitLogo: protectedProcedure
      .input(z.object({
        unitId: z.number(),
        logoFile: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { updateUnitLogo, getUnitById: getUnitByIdForLogo } = await import('./db');
        const { storagePut, storageDelete } = await import('./storage');
        // Bug fix 5.1: regex corrigida para suportar image/svg+xml e outros MIME com '+'
        const base64Data = input.logoFile.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        // Bug fix 5.2: limite de tamanho server-side (M4: usa MAX_UPLOAD_BYTES de shared/const)
        if (buffer.length > MAX_UPLOAD_BYTES) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo muito grande. Máximo 2 MB.' });
        }
        // Bug fix 5.2: validação de magic bytes
        if (!isValidImageBuffer(buffer)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Formato de imagem inválido. Envie PNG, JPEG, GIF ou WebP.' });
        }
        // Bug fix N4: apagar logo antiga antes de salvar a nova
        const currentUnit = await getUnitByIdForLogo(input.unitId);
        if (currentUnit?.logo_url) storageDelete(currentUnit.logo_url);
        // Bug fix N1: inferir extensão real do arquivo em vez de hardcodar .png
        const logoExt = inferExtension(input.logoFile);
        const key = `logos/unit_${input.unitId}_${Date.now()}.${logoExt}`;
        const { url } = await storagePut(key, buffer, `image/${logoExt === 'jpg' ? 'jpeg' : logoExt}`);
        await updateUnitLogo(input.unitId, url);
        return { success: true };
      }),

    removeSignature: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem remover assinaturas' });
        }
        const { updateUserMedicalData } = await import('./db');
        await updateUserMedicalData(input.userId, { signature_url: null });
        return { success: true };
      }),

    removeLogo: protectedProcedure
      .input(z.object({ unitId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem remover logos' });
        }
        const { updateUnitLogo } = await import('./db');
        await updateUnitLogo(input.unitId, null as any);
        return { success: true };
      }),

    updateStamp: protectedProcedure
      .input(z.object({
        userId: z.number(),
        stampFile: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { updateUserMedicalData, getUserById: getUserByIdForStamp } = await import('./db');
        const { storagePut, storageDelete } = await import('./storage');
        // Bug fix 5.1: regex corrigida para suportar image/svg+xml e outros MIME com '+'
        const base64Data = input.stampFile.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        // Bug fix 5.2: limite de tamanho server-side (M4: usa MAX_UPLOAD_BYTES de shared/const)
        if (buffer.length > MAX_UPLOAD_BYTES) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo muito grande. Máximo 2 MB.' });
        }
        // Bug fix 5.2: validação de magic bytes
        if (!isValidImageBuffer(buffer)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Formato de imagem inválido. Envie PNG, JPEG, GIF ou WebP.' });
        }
        // Bug fix N4: apagar carimbo antigo antes de salvar o novo
        const currentUserForStamp = await getUserByIdForStamp(input.userId);
        if (currentUserForStamp?.stamp_url) storageDelete(currentUserForStamp.stamp_url);
        // Bug fix N1: inferir extensão real do arquivo em vez de hardcodar .png
        const stampExt = inferExtension(input.stampFile);
        const key = `stamps/user_${input.userId}_${Date.now()}.${stampExt}`;
        const { url } = await storagePut(key, buffer, `image/${stampExt === 'jpg' ? 'jpeg' : stampExt}`);
        await updateUserMedicalData(input.userId, { stamp_url: url });
        return { success: true };
      }),
    removeStamp: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o administrador root pode remover carimbos' });
        }
        const { updateUserMedicalData } = await import('./db');
        await updateUserMedicalData(input.userId, { stamp_url: null });
        return { success: true };
      }),
    getReportContext: protectedProcedure
      .input(z.object({ unitId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getUserById, getUnitById } = await import('./db');
        const user = await getUserById(ctx.user.id);
        const unit = await getUnitById(input.unitId);
        return {
          doctorName: user?.name ?? '',
          crm: user?.crm ?? '',
          signatureUrl: user?.signature_url ?? null,
          stampUrl: user?.stamp_url ?? null,
          unitName: unit?.name ?? '',
          unitLogoUrl: unit?.logo_url ?? null,
          userId: user?.id ?? 0,
        };
      }),
  }),

  // ─── Billing V2 ────────────────────────────────────────────────────────────
  // Modelagem correta: responsável financeiro como entidade pagadora central.
  billing: router({

    // ── Responsáveis Financeiros ──────────────────────────────────────────────
    listResponsibles: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { listFinancialResponsibles } = await import('./db');
        return await listFinancialResponsibles();
      }),

    getResponsible: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') {
          const { getResponsibleIdForUser } = await import('./db');
          const respId = await getResponsibleIdForUser(ctx.user.id);
          if (respId !== input.id) throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const { getFinancialResponsibleById } = await import('./db');
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
        const { createFinancialResponsible } = await import('./db');
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
        const { updateFinancialResponsible } = await import('./db');
        await updateFinancialResponsible(id, data);
        return { success: true };
      }),

    // ── Vínculos Usuário → Responsável ────────────────────────────────────────
    linkUser: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { linkUserToResponsible } = await import('./db');
        await linkUserToResponsible(input.financialResponsibleId, input.userId);
        return { success: true };
      }),

    unlinkUser: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { unlinkUserFromResponsible } = await import('./db');
        await unlinkUserFromResponsible(input.financialResponsibleId, input.userId);
        return { success: true };
      }),

    listUsersForResponsible: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { listUsersForResponsible } = await import('./db');
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
        const { linkUnitToResponsible } = await import('./db');
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
          const { getResponsibleIdForUser } = await import('./db');
          const respId = await getResponsibleIdForUser(ctx.user.id);
          if (respId !== input.financialResponsibleId) throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const { listUnitsForResponsible } = await import('./db');
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
        const { upsertSystemUnitPrice } = await import('./db');
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
        const { listSystemPricesForUnit } = await import('./db');
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
        const { upsertDoctorUnitPrice } = await import('./db');
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
        const { listDoctorPricesForUnit } = await import('./db');
        return await listDoctorPricesForUnit(input.financialResponsibleId, input.unitId);
      }),

    // ── Apuração de Competência ────────────────────────────────────────────────
    calculateCompetence: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { calculateCompetence } = await import('./db');
        return await calculateCompetence(input.year, input.month, ctx.user.id);
      }),

    closeCompetence: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { closeCompetence } = await import('./db');
        return await closeCompetence(input.financialResponsibleId, input.year, input.month, ctx.user.id);
      }),

    reopenCompetence: protectedProcedure
      .input(z.object({ financialResponsibleId: z.number(), year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { reopenCompetence } = await import('./db');
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
          const { getResponsibleIdForUser } = await import('./db');
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
        const { listBillingReportItems } = await import('./db');
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
        const { getAdminConsolidated } = await import('./db');
        return await getAdminConsolidated(input.year, input.month);
      }),

    getResponsibleSummary: protectedProcedure
      .query(async ({ ctx }) => {
        const ALLOWED = ['responsavel_financeiro', 'unit_admin', 'admin_master'];
        if (!ALLOWED.includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
        const { getResponsibleIdForUser, getResponsibleCycleSummary } = await import('./db');
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
        const { getDoctorMonthlySummary, listBillingReportItems } = await import('./db');
        const [byResponsible, items] = await Promise.all([
          getDoctorMonthlySummary(ctx.user.id, input.year, input.month),
          listBillingReportItems({ doctor_user_id: ctx.user.id, competence_year: input.year, competence_month: input.month }),
        ]);
        return { byResponsible, items };
      }),
    getMyResponsible: protectedProcedure
      .query(async ({ ctx }) => {
        const { getResponsibleIdForUser, getFinancialResponsibleById } = await import('./db');
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
        const { getCycleConfig } = await import('./db');
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
        const { upsertCycleConfig } = await import('./db');
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
        const { createBillingVisitEvent } = await import('./db');
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
        const { getDoctorFinancialSummary } = await import('./db');
        return await getDoctorFinancialSummary(ctx.user.id);
      }),

    getDoctorCycleEvents: protectedProcedure
      .input(z.object({ doctor_cycle_id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'medico' && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const { getDoctorCycleEvents } = await import('./db');
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
        const { markDoctorCycleReceived } = await import('./db');
        await markDoctorCycleReceived(input.doctor_cycle_id, input.unit_id, ctx.user.id, ctx.user.id);
        return { success: true };
      }),

    getResponsibleCycles: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'responsavel_financeiro' && ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const { getResponsibleIdForUser, getResponsibleCycleSummary } = await import('./db');
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
        const { getDoctorUnitFinancialInfo } = await import('./db');
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
        const { closeBillingCycle } = await import('./db');
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
        const { listUnitCycles } = await import('./db');
        return await listUnitCycles(input.unit_id, input.cycle_type);
      }),
  }),
});
export type AppRouter = typeof appRouter;
