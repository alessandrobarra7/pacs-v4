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
import { units, studies_cache } from "../drizzle/schema";
import { eq, and, like } from "drizzle-orm";
// orthanc.ts mantido para visualização futura via DICOMweb, não mais usado na pesquisa
import { getDicomWebUrl } from "./orthanc";
import { cFind } from "./dicom.service";

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
        role: z.enum(['admin_master', 'unit_admin', 'medico', 'viewer', 'operador']),
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
    
    create: protectedProcedure
      .input(z.object({
        study_id: z.number(),
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
          
          // MODO ÚNICO: C-FIND DICOM DIRETO
          console.log(`[PACS Query] C-FIND → ${unit.pacs_ip}:${unit.pacs_port} AE=${unit.pacs_ae_title}`);
          studies = await cFind(
            {
              ip: unit.pacs_ip!,
              port: unit.pacs_port!,
              remoteAeTitle: unit.pacs_ae_title!,
              localAeTitle: unit.pacs_local_ae_title || 'LAUDS',
            },
            {
              patientName: filters.patientName ? `*${filters.patientName}*` : undefined,
              patientID: filters.patientId,
              studyDate: filters.studyDate,
              // Não enviar modality se for vazio ou 'ALL' — C-FIND retorna todos quando omitido
              modality: (filters.modality && filters.modality !== 'ALL') ? filters.modality : undefined,
              accessionNumber: filters.accessionNumber,
            }
          );
          console.log(`[PACS Query] C-FIND retornou ${studies.length} estudos`);
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
      const { users } = await import("../drizzle/schema");
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
        })
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(users.createdAt));
      return result;
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
        role: z.enum(['admin_master', 'unit_admin', 'medico', 'viewer', 'operador']).optional(),
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
        if (input.expiration_date !== undefined) updateData.expiration_date = input.expiration_date || null;
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
});
export type AppRouter = typeof appRouter;
