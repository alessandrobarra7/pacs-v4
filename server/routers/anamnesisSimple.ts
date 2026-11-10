import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAnamnesisSimple, saveAnamnesisSimple, createAuditLog, getDb } from "../db";
import { evaluateAndUpsertReadiness } from "./sla";
import { anamnesis_simple } from "../../drizzle/schema";
import { inArray } from "drizzle-orm";
import { canAccessUnit, assertDicomFileAccess } from "../authorization";
import { studyInstanceUidSchema } from "../routerUtils";

/**
 * CORREÇÃO (auditoria-seguranca-rbac-20261110): resolução de unidade específica para
 * getStatusBatch, que precisa de uma versão NÃO lançadora de erro (best-effort por item,
 * em lote) de assertDicomFileAccess. Replica a mesma ordem de resolução dela
 * (studies_cache -> study_metadata; ver server/authorization.ts) para que estudos
 * "órfãos" em study_metadata, mas já presentes em studies_cache, sejam corretamente
 * atribuídos à unidade real do estudo em vez de caírem em um fallback inseguro
 * (input do cliente ou unidade do próprio usuário).
 */
async function resolveStudyUnitIdForStatusBatch(studyInstanceUid: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const { studies_cache, study_metadata } = await import("../../drizzle/schema");
  const { eq: eqOp } = await import("drizzle-orm");

  const cached = await db
    .select({ unit_id: studies_cache.unit_id })
    .from(studies_cache)
    .where(eqOp(studies_cache.study_instance_uid, studyInstanceUid))
    .limit(1);
  if (cached[0]?.unit_id) return cached[0].unit_id;

  const meta = await db
    .select({ unit_id: study_metadata.unit_id })
    .from(study_metadata)
    .where(eqOp(study_metadata.study_instance_uid, studyInstanceUid))
    .limit(1);
  if (meta[0]?.unit_id) return meta[0].unit_id;

  return null;
}

export const anamnesisSimpleRouter = router({
    /** Busca a anamnese de um estudo */
    getByStudy: protectedProcedure
      .input(z.object({ studyInstanceUid: studyInstanceUidSchema }))
      .query(async ({ input, ctx }) => {
        // CORREÇÃO (auditoria claude/correcoes-setoriais-auditoria):
        // Antes, quando o estudo não tinha unit_id em study_metadata, a checagem de
        // permissão era pulada por completo e a anamnese era liberada para qualquer
        // usuário autenticado. Agora usamos assertDicomFileAccess, que também consulta
        // studies_cache (populada em pacs.query, antes do usuário poder abrir o estudo)
        // e nega por padrão ("deny-by-default") quando nenhuma unidade é encontrada.
        await assertDicomFileAccess(ctx.user, input.studyInstanceUid, 'view_anamnesis');
        return await getAnamnesisSimple(input.studyInstanceUid);
      }),

    /** Cria ou atualiza a anamnese de um estudo */
    save: protectedProcedure
      .input(z.object({
        studyInstanceUid: studyInstanceUidSchema,
        patientName: z.string().optional(),
        presets: z.array(z.string()),
        manualText: z.string().min(1, "O campo de indicação clínica é obrigatório"),
      }))
      .mutation(async ({ input, ctx }) => {
        // CORREÇÃO (auditoria claude/correcoes-setoriais-auditoria):
        // Antes, sem unit_id resolvido em study_metadata, a checagem de edit_anamnesis
        // era pulada e o unit_id gravado vinha só do fallback do próprio usuário —
        // ou seja, qualquer usuário autenticado podia gravar anamnese em estudo órfão,
        // sem nenhuma verificação de permissão. Agora assertDicomFileAccess resolve
        // (studies_cache -> study_metadata) e nega por padrão se não encontrar unidade.
        const effectiveUnitId = await assertDicomFileAccess(ctx.user, input.studyInstanceUid, 'edit_anamnesis');

        await saveAnamnesisSimple({
          study_instance_uid: input.studyInstanceUid,
          unit_id: effectiveUnitId,
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
        // Avaliar prontidão e iniciar SLA (apenas na primeira anamnese válida)
        let readiness = null;
        if (effectiveUnitId) {
          const result = await evaluateAndUpsertReadiness({
            studyInstanceUid: input.studyInstanceUid,
            unitId: effectiveUnitId,
            createdByUserId: ctx.user.id,
            manualText: input.manualText,
          });
          readiness = result.readiness;
        }
        return { success: true, readiness };
      }),

    /** Retorna quais UIDs têm anamnese registrada na unidade acessível ao usuário. */
    getStatusBatch: protectedProcedure
      .input(z.object({
        studyInstanceUids: z.array(studyInstanceUidSchema),
        unitId: z.number().int().positive().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (!input.studyInstanceUids.length) return {} as Record<string, boolean>;
        const result: Record<string, boolean> = {};
        for (const uid of input.studyInstanceUids) result[uid] = false;

        const access = await Promise.all(input.studyInstanceUids.map(async (studyInstanceUid) => {
          try {
            // CORREÇÃO (auditoria-seguranca-rbac-20261110): getStudyUnitId só consulta
            // study_metadata. Para estudos "órfãos" (sem linha em study_metadata, mas
            // presentes em studies_cache — populada em pacs.query antes do usuário poder
            // abrir o estudo), o código antigo caía para input.unitId (fornecido pelo
            // CLIENTE) ou para a unidade do próprio usuário, testando a permissão contra
            // essa unidade "de substituição" em vez da unidade real do estudo — permitindo
            // descobrir, para estudos de outra unidade, se existe anamnese registrada
            // (vazamento booleano cross-unidade). Agora replicamos aqui a mesma ordem de
            // resolução usada por assertDicomFileAccess (studies_cache -> study_metadata,
            // em server/authorization.ts), sem lançar erro (rota best-effort por item) e
            // sem cair para fontes fornecidas pelo cliente ou pelo próprio usuário: unidade
            // não resolvida por uma fonte confiável server-side = acesso negado (null).
            const accessUnitId = await resolveStudyUnitIdForStatusBatch(studyInstanceUid);
            if (!accessUnitId) return null;
            return await canAccessUnit(ctx.user, accessUnitId, "view_anamnesis") ? studyInstanceUid : null;
          } catch {
            return null;
          }
        }));
        const allowedStudyUids = access.filter((studyInstanceUid): studyInstanceUid is string => studyInstanceUid !== null);
        if (!allowedStudyUids.length) return result;

        const db = await getDb();
        if (!db) return result;
        const rows = await db
          .select({ study_instance_uid: anamnesis_simple.study_instance_uid })
          .from(anamnesis_simple)
          .where(inArray(anamnesis_simple.study_instance_uid, allowedStudyUids));
        for (const row of rows) result[row.study_instance_uid] = true;
        return result;
      }),

});
