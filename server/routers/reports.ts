import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getReportByStudyId, getReportById, createReport, updateReport,
  createAuditLog, getDb, resolveEffectiveUnitId, getReportStatusByStudyUids,
  resolveUnitFilter, getUserUnitPermission, getUserById,
  createBillingVisitEvent, removeVisitEventForReport,
} from "../db";
import { and, inArray, desc } from "drizzle-orm";
import { canAccessUnit } from "../authorization";
import { closeReadinessOnReport, ensureReadinessExists } from "./sla";
import {
  reports, report_versions, billing_report_items, billing_visit_events as billing_visit_events_table,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import sanitizeHtml from "sanitize-html";
import { REPORT_SANITIZE_OPTIONS } from "../reportSanitize";

export const reportsRouter = router({
    getByStudyId: protectedProcedure
      .input(z.object({ studyId: z.number() }))
      .query(async ({ input, ctx }) => {
        // E4: médico multiunidade (unit_id null) usa inArray com suas unidades
        const { unitId, unitIds } = await resolveUnitFilter(ctx.user.role, ctx.user.id, ctx.user.unit_id);
        const report = await getReportByStudyId(input.studyId, unitId, unitIds);
        if (report && report.unit_id) {
          const canView = await canAccessUnit(ctx.user, report.unit_id, 'view_studies');
          if (!canView) throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        return report;
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
        const report = rows[0] ?? null;
        if (report && report.unit_id) {
          const canView = await canAccessUnit(ctx.user, report.unit_id, 'view_studies');
          if (!canView) return null;
        }
        return report;
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
        // Validar permissão view_studies via camada central
        if (report.unit_id) {
          const canView = await canAccessUnit(ctx.user, report.unit_id, 'view_studies');
          if (!canView) return null;
        }
        // Buscar dados do médico que assinou
        // PRG-05: getUserById importado estaticamente no topo
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
        
        // V14-P1 FIX: Unificar em canAccessUnit (fonte única de autorização)
        if (ctx.user.role !== 'admin_master') {
          const { canAccessUnit } = await import('../authorization');
          const allowed = await canAccessUnit(ctx.user, effectiveUnitId, 'edit_reports');
          if (!allowed) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para criar laudos nesta unidade' });
          }
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
        // Validar edit_reports via camada central (trata admin_master e fallback legado)
        if (report.unit_id) {
          const canEdit = await canAccessUnit(ctx.user, report.unit_id, 'edit_reports');
          if (!canEdit) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para editar laudos nesta unidade' });
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
        layout_snapshot: z.any().optional().nullable(),  // FIX GAP-1: snapshot do layout no momento da assinatura
      }))
      .mutation(async ({ input, ctx }) => {
        // Buscar laudo sem filtro de unit_id para suportar médicos multi-unidade
        const report = await getReportById(input.id, undefined);
        if (!report) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Laudo não encontrado' });
        }
        // ERRO 5: Validar que apenas médicos e admin_master podem assinar laudos
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'medico') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas médicos podem assinar laudos' });
        }
        
        // Validar edit_reports via camada central (trata admin_master e fallback legado)
        if (report.unit_id) {
          const canEdit = await canAccessUnit(ctx.user, report.unit_id, 'edit_reports');
          if (!canEdit) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para assinar laudos nesta unidade' });
        }
        const signedAt = new Date();
        await updateReport(input.id, {
          status: 'signed',
          signedAt,
          signedBy: ctx.user.id,
          layout_snapshot: input.layout_snapshot ?? null,  // FIX GAP-1: persistir snapshot do layout
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
            // M3A: Buscar modalidade do estudo para precificação por modalidade
            let studyModality: string | null = null;
            const studyUid = input.study_instance_uid ?? report.study_instance_uid;
            if (studyUid) {
              try {
                const db = await getDb();
                if (db) {
                  const { studies_cache: sc } = await import('../../drizzle/schema');
                  const studyRow = await db
                    .select({ modality: sc.modality })
                    .from(sc)
                    .where(eq(sc.study_instance_uid, studyUid))
                    .limit(1);
                  studyModality = studyRow[0]?.modality ?? null;
                }
              } catch (_modErr) {
                // Não bloqueia — fallback para preço padrão do médico
              }
            }
            // PRG-05: createBillingVisitEvent importado estaticamente no topo
            const billingResult = await createBillingVisitEvent({
              report_id: input.id,
              study_instance_uid: studyUid ?? undefined,
              unit_id: effectiveUnitId,
              // FIX-C2: usar o médico AUTOR do laudo, não quem está assinando
              // admin_master pode assinar laudos de médicos — o crédito é do médico
              doctor_user_id: report.author_user_id ?? ctx.user.id,
              patient_name: input.patient_name ?? undefined,
              study_date: input.study_date ?? undefined,
              signed_at: signedAt,
              modality_snapshot: studyModality,
            });
            doctor_amount_due = billingResult.doctor_amount_due;
          } catch (billingErr) {
            // FIX-C1: Billing não bloqueia a assinatura — mas registra no audit_log para visibilidade
            const errMsg = billingErr instanceof Error ? billingErr.message : String(billingErr);
            console.error('[sign] Billing event failed (non-blocking):', errMsg);
            try {
              await createAuditLog({
                user_id: ctx.user.id,
                unit_id: effectiveUnitId,
                action: 'BILLING_EVENT_FAILED',
                target_type: 'REPORT',
                target_id: String(input.id),
                ip_address: ctx.req.ip,
                user_agent: ctx.req.headers['user-agent'],
              });
            } catch (_) { /* audit também não pode bloquear a assinatura */ }
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
        // Validar edit_reports via camada central (trata admin_master e fallback legado)
        if (report.unit_id) {
          const canEdit = await canAccessUnit(ctx.user, report.unit_id, 'edit_reports');
          if (!canEdit) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para retificar laudos nesta unidade' });
        }
        if (report.status !== 'signed' && report.status !== 'revised') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Apenas laudos assinados podem ser retificados' });
        }
        // 1. Salvar versão anterior no histórico
        // PRG-05: report_versions importado estaticamente no topo
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
        // P7: billing_report_items é tabela morta (sem leitura ativa) — escrita removida
        // SCH-01: atualizar report_status_snapshot em billing_visit_events para 'revised'
        try {
          // PRG-05: billing_visit_events_table importado estaticamente no topo
          await db.update(billing_visit_events_table)
            .set({ report_status_snapshot: 'revised' })
            .where(eq(billing_visit_events_table.report_id, input.id));
        } catch (e) {
          console.warn('[revise] Não foi possível atualizar report_status_snapshot em billing_visit_events:', e);
        }
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
        // Validar edit_reports via camada central (trata admin_master e fallback legado)
        if (report.unit_id) {
          const canEdit = await canAccessUnit(ctx.user, report.unit_id, 'edit_reports');
          if (!canEdit) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para excluir laudos nesta unidade' });
        }
        if (ctx.user.role !== 'admin_master') {
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
        // PRG-05: removeVisitEventForReport e report_versions importados estaticamente no topo
        await removeVisitEventForReport(input.id);
        // Apagar versões históricas primeiro (FK)
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
        // Validar acesso ao laudo antes de retornar versões
        const report = await getReportById(input.reportId, undefined);
        if (!report) throw new TRPCError({ code: 'NOT_FOUND', message: 'Laudo não encontrado' });
        if (report.unit_id) {
          const canView = await canAccessUnit(ctx.user, report.unit_id, 'view_studies');
          if (!canView) throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        // PRG-05: report_versions e desc importados estaticamente no topo
        return await db.select().from(report_versions)
          .where(eq(report_versions.report_id, input.reportId))
          .orderBy(desc(report_versions.saved_at));
      }),

});
