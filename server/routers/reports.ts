import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getReportByStudyId, getReportById, createReport, updateReport,
  createAuditLog, getDb, resolveEffectiveUnitId, getReportStatusByStudyUids,
  resolveUnitFilter,
} from "../db";
import { and, inArray } from "drizzle-orm";
import { closeReadinessOnReport, ensureReadinessExists } from "./sla";
import { reports } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import sanitizeHtml from "sanitize-html";
import { REPORT_SANITIZE_OPTIONS } from "../reportSanitize";

export const reportsRouter = router({
    getByStudyId: protectedProcedure
      .input(z.object({ studyId: z.number() }))
      .query(async ({ input, ctx }) => {
        // E4: médico multiunidade (unit_id null) usa inArray com suas unidades
        const { unitId, unitIds } = await resolveUnitFilter(ctx.user.role, ctx.user.id, ctx.user.unit_id);
        return await getReportByStudyId(input.studyId, unitId, unitIds);
      }),

    getByStudyUid: protectedProcedure
      .input(z.object({ studyInstanceUid: z.string() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });
        // E4: médico multiunidade (unit_id null) usa inArray com suas unidades
        const { unitId, unitIds } = await resolveUnitFilter(ctx.user.role, ctx.user.id, ctx.user.unit_id);
        if (unitIds !== undefined && unitIds.length === 0) return null; // sem acesso
        const conditions: any[] = [eq(reports.study_instance_uid, input.studyInstanceUid)];
        if (unitId !== undefined) conditions.push(eq(reports.unit_id, unitId));
        else if (unitIds !== undefined && unitIds.length > 0) conditions.push(inArray(reports.unit_id, unitIds));
        const rows = await db.select().from(reports).where(and(...conditions));
        return rows[0] ?? null;
      }),

    // Retorna laudo + dados do médico assinante (para impressão com carimbo)
    getByStudyUidWithDoctor: protectedProcedure
      .input(z.object({ studyInstanceUid: z.string() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });
        // E4: médico multiunidade (unit_id null) usa inArray com suas unidades
        const { unitId, unitIds } = await resolveUnitFilter(ctx.user.role, ctx.user.id, ctx.user.unit_id);
        if (unitIds !== undefined && unitIds.length === 0) return null; // sem acesso
        const conditions: any[] = [eq(reports.study_instance_uid, input.studyInstanceUid)];
        if (unitId !== undefined) conditions.push(eq(reports.unit_id, unitId));
        else if (unitIds !== undefined && unitIds.length > 0) conditions.push(inArray(reports.unit_id, unitIds));
        const rows = await db.select().from(reports).where(and(...conditions));
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
        
        // PRG-06: usar report.unit_id como fonte de verdade
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: report.unit_id ?? ctx.user.unit_id,
          action: 'UPDATE_REPORT',
          target_type: 'REPORT',
          target_id: String(id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        
        return { success: true };
      }),
    
    sign: protectedProcedure
      .input(z.object({
        id: z.number(),
        // Campos opcionais para registro financeiro atômico
        unit_id: z.number().optional(),
        study_instance_uid: z.string().optional(),
        patient_name: z.string().optional(),
        study_date: z.string().optional(),
      }))
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
        const signedAt = new Date();
        await updateReport(input.id, {
          status: 'signed',
          signedAt,
          signedBy: ctx.user.id,
        });
        
        // P2: Usar sempre report.unit_id como fonte de verdade para audit log e evento financeiro
        // input.unit_id é apenas hint de contexto de UI — não deve influenciar dados financeiros
        const effectiveUnitId = report.unit_id ?? ctx.user.unit_id;
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: effectiveUnitId,
          action: 'SIGN_REPORT',
          target_type: 'REPORT',
          target_id: String(input.id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });

        // Registro financeiro atômico: se unit_id fornecido e usuário é médico ou admin_master
        let doctor_amount_due: string | null = null;
        if (effectiveUnitId && (ctx.user.role === 'medico' || ctx.user.role === 'admin_master')) {
          try {
            const { createBillingVisitEvent } = await import('../db');
            const billingResult = await createBillingVisitEvent({
              report_id: input.id,
              study_instance_uid: input.study_instance_uid ?? report.study_instance_uid ?? undefined,
              unit_id: effectiveUnitId,
              doctor_user_id: ctx.user.id,
              patient_name: input.patient_name ?? undefined,
              study_date: input.study_date ?? undefined,
              signed_at: signedAt,
            });
            doctor_amount_due = billingResult.doctor_amount_due;
          } catch (billingErr) {
            // Billing não bloqueia a assinatura — apenas loga o erro
            console.error('[sign] Billing event failed (non-blocking):', billingErr);
          }
        }
        
        // C12: Garantir que existe readiness antes de fechar (laudos sem anamnese)
        const studyUidForSla = input.study_instance_uid ?? report.study_instance_uid;
        if (studyUidForSla && effectiveUnitId) {
          try {
            await ensureReadinessExists({
              studyInstanceUid: studyUidForSla,
              unitId: effectiveUnitId,
              createdByUserId: ctx.user.id,
              source: 'direct_sign',
            });
            await closeReadinessOnReport({
              studyInstanceUid: studyUidForSla,
              unitId: effectiveUnitId,
              reportedByUserId: ctx.user.id,
              reportedAt: signedAt,
            });
          } catch (slaErr) {
            // SLA não bloqueia a assinatura
            console.error('[sign] SLA close failed (non-blocking):', slaErr);
          }
        }

        return { success: true, doctor_amount_due };
      }),

    statusByStudyUids: protectedProcedure
      .input(z.object({ studyUids: z.array(z.string()) }))
      .query(async ({ input, ctx }) => {
        // E4: médico multiunidade (unit_id null) usa inArray com suas unidades
        const { unitId, unitIds } = await resolveUnitFilter(ctx.user.role, ctx.user.id, ctx.user.unit_id);
        return await getReportStatusByStudyUids(input.studyUids, unitId, unitIds);
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
        const revisedAt = new Date();
        await updateReport(input.id, {
          body: safeReviseBody,
          status: 'revised',
          version: (report.version ?? 1) + 1,
          signedAt: revisedAt,
          signedBy: ctx.user.id,
        });
        // E7: atualizar report_status_snapshot no billing_report_items para 'revised'
        try {
          const { billing_report_items } = await import('../../drizzle/schema');
          await db.update(billing_report_items)
            .set({ report_status_snapshot: 'revised' })
            .where(eq(billing_report_items.report_id, input.id));
        } catch (e) {
          // Não bloqueia a retificação se billing_report_items não existir para este laudo
          console.warn('[revise] Não foi possível atualizar report_status_snapshot em billing_report_items:', e);
        }
        // C12: billing_visit_events ainda não possui o campo report_status_snapshot.
        // Requer migration de schema: ALTER TABLE billing_visit_events ADD COLUMN report_status_snapshot ENUM('signed','revised') DEFAULT 'signed';
        // TODO: implementar após executar a migration em produção.
        // PRG-06: usar report.unit_id como fonte de verdade (não ctx.user.unit_id legado)
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: report.unit_id ?? ctx.user.unit_id,
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
      .input(z.object({
        id: z.number(),
        // LOG-01: motivo obrigatório para admin_master apagar laudos assinados/retificados
        reason: z.string().optional(),
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
          // LOG-01: não-admin_master não pode apagar laudos assinados ou retificados
          if (report.status === 'signed' || report.status === 'revised') {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Laudos assinados ou retificados só podem ser excluídos pelo administrador master.',
            });
          }
        } else {
          // LOG-01: admin_master deletando laudo assinado/retificado deve informar motivo
          if ((report.status === 'signed' || report.status === 'revised') && !input.reason?.trim()) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Informe o motivo para excluir um laudo assinado ou retificado.',
            });
          }
        }
        // Remover evento financeiro e decrementar consolidados de ciclo (se laudo estava assinado)
        const { removeVisitEventForReport } = await import('../db');
        await removeVisitEventForReport(input.id);
        // Apagar versões históricas primeiro (FK)
        const { report_versions } = await import('../../drizzle/schema');
        await db.delete(report_versions).where(eq(report_versions.report_id, input.id));
        // Apagar o laudo
        await db.delete(reports).where(eq(reports.id, input.id));
        // PRG-06: usar report.unit_id como fonte de verdade (não ctx.user.unit_id legado)
        const effectiveUnitId = report.unit_id ?? ctx.user.unit_id;
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: effectiveUnitId,
          action: 'DELETE_REPORT',
          target_type: 'REPORT',
          target_id: String(input.id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
          // LOG-01: registrar motivo no audit log quando admin_master apaga laudo assinado
          metadata: input.reason ? { reason: input.reason, deletedStatus: report.status } : undefined,
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
