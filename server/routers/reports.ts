import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getReportByStudyId, getReportById, createReport, updateReport,
  createAuditLog, getDb, resolveEffectiveUnitId, getReportStatusByStudyUids,
} from "../db";
import { and } from "drizzle-orm";
import { reports } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import sanitizeHtml from "sanitize-html";
import { REPORT_SANITIZE_OPTIONS } from "../reportSanitize";

export const reportsRouter = router({
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
        const { getUserById } = await import('../db');
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
        unit_id: z.number().optional(), // multi-unidade: médico passa a unidade selecionada
      }))
      .mutation(async ({ input, ctx }) => {
        // Resolver unit_id efetivo: campo legado > input.unit_id via permissões > primeira unidade
        const effectiveUnitId = ctx.user.role === 'admin_master'
          ? (input.unit_id ?? ctx.user.unit_id)
          : await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id, input.unit_id);
        if (!effectiveUnitId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuário não está vinculado a nenhuma unidade' });
        }
        
        const { unit_id: _unitInput, ...restInput } = input;
        // F1-3: Sanitizar HTML do body antes de persistir (previne XSS armazenado)
        const safeBody = sanitizeHtml(restInput.body, REPORT_SANITIZE_OPTIONS);
        const id = await createReport({
          ...restInput,
          body: safeBody,
          unit_id: effectiveUnitId,
          author_user_id: ctx.user.id,
          status: 'draft',
        });
        
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: effectiveUnitId,
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
        // Buscar laudo sem filtro de unit_id para suportar médicos multi-unidade
        const report = await getReportById(id, undefined);
        if (!report) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Laudo não encontrado' });
        }
        // Verificar acesso: admin_master tem acesso total; outros verificam via unit_id legado ou permissões
        if (ctx.user.role !== 'admin_master') {
          const effectiveUnitId = await resolveEffectiveUnitId(ctx.user.id, ctx.user.unit_id);
          const hasAccess = effectiveUnitId === report.unit_id ||
            !!(await import('../db').then(db => db.getUserUnitPermission(ctx.user.id, report.unit_id ?? 0)));
          if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        // Bug fix B1: bloquear atualização direta de laudos assinados ou retificados.
        // Laudos nesse estado só podem ser alterados via reports.revise (com histórico e motivo).
        if (report.status === 'signed' || report.status === 'revised') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Laudos assinados só podem ser editados via retificação.',
          });
        }
        // F1-3: Sanitizar HTML do body antes de persistir (previne XSS armazenado)
        const safeUpdateData = data.body !== undefined
          ? { ...data, body: sanitizeHtml(data.body, REPORT_SANITIZE_OPTIONS) }
          : data;
        await updateReport(id, safeUpdateData);
        
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
        // Buscar laudo sem filtro de unit_id para suportar médicos multi-unidade
        const report = await getReportById(input.id, undefined);
        if (!report) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Laudo não encontrado' });
        }
        // Verificar acesso: admin_master tem acesso total; outros verificam via unit_id legado ou permissões
        if (ctx.user.role !== 'admin_master') {
          const { getUserUnitPermission: getUnitPerm } = await import('../db');
          const hasAccess = ctx.user.unit_id === report.unit_id ||
            !!(await getUnitPerm(ctx.user.id, report.unit_id ?? 0));
          if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        await updateReport(input.id, {
          status: 'signed',
          signedAt: new Date(),
          signedBy: ctx.user.id,
        });
        
        const effectiveUnitId = ctx.user.unit_id ?? report.unit_id;
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: effectiveUnitId,
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
        const report = await getReportById(input.id, undefined);
        if (!report) throw new TRPCError({ code: 'NOT_FOUND', message: 'Laudo não encontrado' });
        if (ctx.user.role !== 'admin_master') {
          const { getUserUnitPermission: getUnitPerm } = await import('../db');
          const hasAccess = ctx.user.unit_id === report.unit_id ||
            !!(await getUnitPerm(ctx.user.id, report.unit_id ?? 0));
          if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        if (report.status !== 'signed' && report.status !== 'revised') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Apenas laudos assinados podem ser retificados' });
        }
        // 1. Salvar versão anterior no histórico
        const { report_versions } = await import('../../drizzle/schema');
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
        // F1-3: Sanitizar HTML do body antes de persistir (previne XSS armazenado)
        const safeReviseBody = sanitizeHtml(input.body, REPORT_SANITIZE_OPTIONS);
        await updateReport(input.id, {
          body: safeReviseBody,
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
        const report = await getReportById(input.id, undefined);
        if (!report) throw new TRPCError({ code: 'NOT_FOUND', message: 'Laudo não encontrado' });
        if (ctx.user.role !== 'admin_master') {
          const { getUserUnitPermission: getUnitPerm } = await import('../db');
          const hasAccess = ctx.user.unit_id === report.unit_id ||
            !!(await getUnitPerm(ctx.user.id, report.unit_id ?? 0));
          if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        // Apagar versões históricas primeiro (FK)
        const { report_versions } = await import('../../drizzle/schema');
        await db.delete(report_versions).where(eq(report_versions.report_id, input.id));
        // Apagar o laudo
        await db.delete(reports).where(eq(reports.id, input.id));
        const effectiveUnitId = ctx.user.unit_id ?? report.unit_id;
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: effectiveUnitId,
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
        const { report_versions } = await import('../../drizzle/schema');
        const { desc } = await import('drizzle-orm');
        return await db.select().from(report_versions)
          .where(eq(report_versions.report_id, input.reportId))
          .orderBy(desc(report_versions.saved_at));
      }),

});
