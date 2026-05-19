import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { listReportMasks, createReportMasks, deleteReportMask } from "../db";
import { canAccessUnit } from "../authorization";

const ADMIN_ROLES = ["admin_master", "unit_admin"] as const;

/**
 * Converte texto puro para HTML compatível com o editor contentEditable.
 * - Se o body já contiver tags HTML, retorna sem alteração.
 * - Caso contrário, processa linha a linha:
 *   1. Linhas `=== TÍTULO ===` → <h3>TÍTULO</h3> (em qualquer posição)
 *   2. Linhas em branco → fecham o parágrafo atual e abrem um novo
 *   3. Demais linhas → acumuladas dentro de <p>…</p> com <br> entre elas
 */
function normalizeBodyToHtml(body: string): string {
  // Detecta se já é HTML: presença de qualquer tag de abertura
  if (/<[a-zA-Z][^>]*>/.test(body)) return body;

  const lines = body.split('\n');
  const output: string[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      output.push(`<p>${paragraphLines.join('<br>')}</p>`);
      paragraphLines = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Linha de seção: === TÍTULO ===
    const sectionMatch = trimmed.match(/^===\s*(.+?)\s*===$/);
    if (sectionMatch) {
      flushParagraph();
      output.push(`<h3>${sectionMatch[1]}</h3>`);
      continue;
    }

    // Linha em branco: fecha parágrafo atual
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    // Linha normal: acumula no parágrafo
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  return output.join('');
}

function isAdmin(role: string) {
  return ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
}

export const masksRouter = router({
  /**
   * Lista máscaras visíveis para o usuário autenticado na unidade informada.
   * Retorna: pessoais do próprio usuário + scope='unit' da unidade.
   * FIX: verifica que o usuário pertence à unidade antes de listar.
   */
  list: protectedProcedure
    .input(z.object({ unitId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      // FIX: verificar que o usuário pertence à unidade antes de listar
      const canAccess = await canAccessUnit(ctx.user, input.unitId, "view_studies");
      if (!canAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Você não tem acesso às máscaras desta unidade.",
        });
      }
      return listReportMasks(input.unitId, ctx.user.id);
    }),

  /**
   * Importa um array de máscaras a partir de JSON.
   * scope: 'personal' → visível só para o usuário que importou.
   * scope: 'unit'     → visível para todos da unidade (apenas admin pode publicar).
   * FIX: verifica que o usuário pertence à unidade antes de importar.
   */
  import: protectedProcedure
    .input(z.object({
      unitId: z.number().int().positive(),
      scope: z.enum(["personal", "unit"]).default("personal"),
      masks: z.array(z.object({
        name: z.string().min(1).max(255),
        modality: z.string().max(10).optional().nullable(),
        exam_title: z.string().max(255).optional().nullable(),
        body: z.string().min(1),
      })).min(1).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      // FIX: verificar que o usuário pertence à unidade antes de importar
      const canAccess = await canAccessUnit(ctx.user, input.unitId, "view_studies");
      if (!canAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Você não tem acesso a esta unidade.",
        });
      }

      // Apenas admin pode publicar para a unidade
      if (input.scope === "unit" && !isAdmin(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores podem publicar máscaras para a unidade.",
        });
      }
      const rows = input.masks.map(m => ({
        unit_id: input.unitId,
        owner_user_id: ctx.user.id,
        scope: input.scope,
        name: m.name,
        modality: m.modality ?? null,
        exam_title: m.exam_title ?? null,
        body: normalizeBodyToHtml(m.body),
        created_by: ctx.user.id,
      }));
      await createReportMasks(rows);
      return { imported: rows.length };
    }),

  /**
   * Remove uma máscara pelo id.
   * Usuário comum só pode remover as próprias máscaras.
   * Admin pode remover qualquer máscara da PRÓPRIA unidade.
   * FIX: exige unitId para restringir admin à unidade correta.
   */
  delete: protectedProcedure
    .input(z.object({
      id:     z.number().int().positive(),
      unitId: z.number().int().positive(), // FIX: necessário para restringir admin
    }))
    .mutation(async ({ ctx, input }) => {
      // FIX: verificar que o usuário pertence à unidade antes de deletar
      const canAccess = await canAccessUnit(ctx.user, input.unitId, "view_studies");
      if (!canAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Você não tem acesso a esta unidade.",
        });
      }

      const admin = isAdmin(ctx.user.role);
      // FIX: passa unitId para restringir admin à unidade correta
      const deleted = await deleteReportMask(input.id, ctx.user.id, admin, input.unitId);
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Máscara não encontrada ou sem permissão para remover.",
        });
      }
      return { success: true };
    }),
});
