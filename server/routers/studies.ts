import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getStudyById, getStudyByInstanceUid, getDb, getReportStatusByStudyUids, createAuditLog, getUnitById, getStudiesByUnitId, resolveUnitFilter } from "../db";
import { like, and } from "drizzle-orm";
import { studies_cache } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { canAccessUnit, getAllowedUnitIds } from "../authorization";

export const studiesRouter = router({
    list: protectedProcedure
      .input(z.object({
        patient_name: z.string().optional(),
        modality: z.string().optional(),
        study_date: z.string().optional(),
        accession_number: z.string().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
        unit_id: z.number().optional(), // multi-unidade: médico pode filtrar por unidade específica
      }))
      .query(async ({ input, ctx }) => {
        let unitId: number;

        if (ctx.user.role === 'admin_master') {
          // admin_master pode ver qualquer unidade
          unitId = input.unit_id || 0;
        } else {
          // Resolver unidade via camada central de autorização
          if (input.unit_id) {
            // Unidade específica solicitada: validar acesso
            const canView = await canAccessUnit(ctx.user, input.unit_id, 'view_studies');
            if (!canView) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar estudos nesta unidade' });
            }
            unitId = input.unit_id;
          } else {
            // Sem unidade específica: usar primeira unidade com permissão
            const allowedIds = await getAllowedUnitIds(ctx.user, 'view_studies');
            if (!allowedIds || allowedIds.length === 0) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuário sem acesso a nenhuma unidade' });
            }
            unitId = allowedIds[0];
          }
        }

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
        // E4: médico multiunidade (unit_id null) usa inArray com suas unidades
        const { unitId, unitIds } = await resolveUnitFilter(ctx.user.role, ctx.user.id, ctx.user.unit_id);
        const study = await getStudyById(input.id, unitId, unitIds);
        
        if (!study) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Study not found' });
        }
        
        // Validar permissão view_studies via camada central (trata admin_master e fallback legado)
        if (study.unit_id) {
          const canView = await canAccessUnit(ctx.user, study.unit_id, 'view_studies');
          if (!canView) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar este estudo' });
          }
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
        // E4: médico multiunidade (unit_id null) usa inArray com suas unidades
        const { unitId, unitIds } = await resolveUnitFilter(ctx.user.role, ctx.user.id, ctx.user.unit_id);
        const study = await getStudyById(input.studyId, unitId, unitIds);
        
        if (!study) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Study not found' });
        }
        
        // Validar permissão view_studies via camada central (trata admin_master e fallback legado)
        if (study.unit_id) {
          const canView = await canAccessUnit(ctx.user, study.unit_id, 'view_studies');
          if (!canView) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para abrir este estudo' });
          }
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

});
