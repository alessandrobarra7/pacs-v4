import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getAllUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
  getStudiesByUnitId,
  getStudyById,
  getTemplatesByUnitId,
  getGlobalTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getReportByStudyId,
  createReport,
  updateReport,
  createAuditLog,
  getDb,
} from "./db";
import { units } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { queryStudiesLocal, queryStudiesRemote, getDicomWebUrl, checkOrthancHealth } from "./orthanc";

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
  }),

  units: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'admin_master') {
        return await getAllUnits();
      }
      if (ctx.user.unit_id) {
        const unit = await getUnitById(ctx.user.unit_id);
        return unit ? [unit] : [];
      }
      return [];
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
        name: z.string(),
        slug: z.string(),
        orthanc_base_url: z.string().optional(),
        orthanc_basic_user: z.string().optional(),
        orthanc_basic_pass: z.string().optional(),
        logoUrl: z.string().optional(),
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
        name: z.string().optional(),
        slug: z.string().optional(),
        orthanc_base_url: z.string().optional(),
        orthanc_basic_user: z.string().optional(),
        orthanc_basic_pass: z.string().optional(),
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
          total: studies.length,
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
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateTemplate(id, data);
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
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
        
        // Busca unidade do usuário, ou primeira unidade disponível como fallback
        let unitData;
        if (ctx.user.unit_id) {
          [unitData] = await db.select().from(units).where(eq(units.id, ctx.user.unit_id)).limit(1);
        }
        if (!unitData) {
          // Fallback: usa a primeira unidade com PACS configurado
          [unitData] = await db.select().from(units).limit(1);
        }
        const unit = unitData;
        
        if (!unit) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Nenhuma unidade configurada. Acesse Administração > Unidades para configurar.',
          });
        }
        
        // Verifica se Orthanc está configurado (preferência) ou PACS direto
        const orthancUrl = unit.orthanc_base_url;
        
        if (!orthancUrl && (!unit.pacs_ip || !unit.pacs_port || !unit.pacs_ae_title)) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Configure a URL do Orthanc ou os parâmetros PACS (IP, porta, AE Title) para esta unidade.',
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
          let result;
          
          if (orthancUrl) {
            // MODO ORTHANC: Usa REST API do Orthanc local
            console.log('[PACS Query] Usando Orthanc REST API:', orthancUrl);
            
            // Verifica se há modalidade remota configurada para C-FIND
            const pacsAeTitle = unit.pacs_ae_title;
            
            if (pacsAeTitle) {
              // C-FIND via Orthanc → PACS remoto
              console.log('[PACS Query] C-FIND via Orthanc para modalidade:', pacsAeTitle);
              result = await queryStudiesRemote(orthancUrl, pacsAeTitle, filters);
              
              // Fallback: se C-FIND falhar, busca estudos locais no Orthanc
              if (!result.success) {
                console.log('[PACS Query] C-FIND falhou, buscando estudos locais no Orthanc');
                result = await queryStudiesLocal(orthancUrl, filters);
              }
            } else {
              // Busca apenas estudos já armazenados no Orthanc local
              console.log('[PACS Query] Buscando estudos locais no Orthanc');
              result = await queryStudiesLocal(orthancUrl, filters);
            }
          } else {
            // MODO LEGADO: Usa pynetdicom direto (Python script)
            console.log('[PACS Query] Usando pynetdicom direto (legado)');
            const queryInput = {
              pacs_ip: unit.pacs_ip,
              pacs_port: unit.pacs_port,
              pacs_ae_title: unit.pacs_ae_title,
              local_ae_title: unit.pacs_local_ae_title || 'PACSMANUS',
              filters: {
                patient_name: input.patientName,
                patient_id: input.patientId,
                modality: input.modality,
                study_date: studyDate,
                accession_number: input.accessionNumber,
              },
            };
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            const scriptPath = new URL('./dicom_query.sh', import.meta.url).pathname;
            const { stdout } = await execAsync(
              `"${scriptPath}" '${JSON.stringify(queryInput)}'`,
              { timeout: 60000 }
            );
            result = JSON.parse(stdout);
          }
          
          // Log audit
          await createAuditLog({
            user_id: ctx.user.id,
            unit_id: ctx.user.unit_id,
            action: 'PACS_QUERY',
            target_type: 'PACS',
            target_id: unit.pacs_ae_title || orthancUrl || 'unknown',
            ip_address: ctx.req.ip,
            user_agent: ctx.req.headers['user-agent'],
            metadata: {
              ...input,
              orthanc_url: orthancUrl,
              results_count: result.count || 0,
            },
          });
          
          if (!result.success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Erro ao consultar PACS: ${result.error}`,
            });
          }
          
          return {
            success: true,
            studies: result.studies || [],
            count: result.count || 0,
          };
          
        } catch (error: any) {
          console.error('[PACS Query] Erro:', error);
          
          await createAuditLog({
            user_id: ctx.user.id,
            unit_id: ctx.user.unit_id,
            action: 'PACS_QUERY',
            target_type: 'PACS',
            target_id: unit.pacs_ae_title || orthancUrl || 'unknown',
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
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database não disponível',
          });
        }
        
        // Get user's unit to access PACS configuration
        const [unit] = await db.select().from(units).where(eq(units.id, ctx.user.unit_id!)).limit(1);
        
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
        
        // Prepare input for C-MOVE Python script
        const moveInput = {
          pacs_ip: unit.pacs_ip,
          pacs_port: unit.pacs_port,
          pacs_ae_title: unit.pacs_ae_title,
          local_ae_title: unit.pacs_local_ae_title || 'PACSMANUS',
          study_instance_uid: input.studyInstanceUid,
          cache_dir: '/tmp/dicom-cache',
        };
        
        // Execute Python C-MOVE script
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        try {
          const scriptPath = new URL('./dicom_move.sh', import.meta.url).pathname;
          const { stdout, stderr } = await execAsync(
            `"${scriptPath}" '${JSON.stringify(moveInput)}'`,
            { timeout: 120000 } // 2 minute timeout for C-MOVE
          );
          
          if (stderr) {
            console.error('C-MOVE script stderr:', stderr);
          }
          
          const result = JSON.parse(stdout);
          
          // Log audit
          await createAuditLog({
            user_id: ctx.user.id,
            unit_id: ctx.user.unit_id,
            action: 'OPEN_VIEWER',
            target_type: 'STUDY',
            target_id: input.studyInstanceUid,
            ip_address: ctx.req.ip,
            user_agent: ctx.req.headers['user-agent'],
            metadata: {
              pacs_ip: unit.pacs_ip,
              file_count: result.file_count || 0,
            },
          });
          
          if (!result.success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Erro ao baixar estudo: ${result.error}`,
            });
          }
          
          return {
            success: true,
            studyInstanceUid: input.studyInstanceUid,
            fileCount: result.file_count || 0,
            cacheDir: result.cache_dir,
          };
          
        } catch (error: any) {
          console.error('Error executing C-MOVE:', error);
          
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Falha ao baixar estudo: ${error.message}`,
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
        
        const [unit] = await db.select().from(units).where(eq(units.id, ctx.user.unit_id!)).limit(1);
        if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unidade não encontrada' });
        
        const orthancUrl = unit.orthanc_base_url;
        if (!orthancUrl) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'URL do Orthanc não configurada para esta unidade.',
          });
        }
        
        // Retorna URL DICOMweb para o viewer
        const viewerUrl = getDicomWebUrl(orthancUrl, input.studyInstanceUid);
        
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id,
          action: 'OPEN_VIEWER',
          target_type: 'STUDY',
          target_id: input.studyInstanceUid,
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
          metadata: { orthanc_url: orthancUrl, viewer_url: viewerUrl },
        });
        
        return {
          success: true,
          viewerUrl,
          studyInstanceUid: input.studyInstanceUid,
          orthancUrl,
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
});

export type AppRouter = typeof appRouter;
