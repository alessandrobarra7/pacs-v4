import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { listReportMasks, createReportMasks, deleteReportMask } from "../db";

const ADMIN_ROLES = ["admin_master", "unit_admin"] as const;

/**
 * Converte texto puro para HTML compatível com o editor contentEditable.
 * - Se o body já contiver tags HTML, retorna sem alteração.
 * - Caso contrário:
 *   1. Converte marcadores `=== TÍTULO ===` em <h3>TÍTULO</h3>
 *   2. Converte blocos separados por linha em branco em <p>…</p>
 *   3. Converte quebras de linha simples (\n) dentro de blocos em <br>
 */
function normalizeBodyToHtml(body: string): string {
  // Detecta se já é HTML: presença de qualquer tag de abertura
  if (/<[a-zA-Z][^>]*>/.test(body)) return body;

  // Divide em blocos separados por linha(s) em branco
  const blocks = body.split(/\n{2,}/);

  const htmlBlocks = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';

    // Marcador de seção: === TÍTULO ===
    const sectionMatch = trimmed.match(/^===\s*(.+?)\s*===$/);
    if (sectionMatch) {
      return `<h3>${sectionMatch[1]}</h3>`;
    }

    // Bloco normal: quebras simples viram <br>, envolve em <p>
    const inner = trimmed.replace(/\n/g, '<br>');
    return `<p>${inner}</p>`;
  });

  return htmlBlocks.filter(Boolean).join('');
}

function isAdmin(role: string) {
  return ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
}

export const masksRouter = router({
  /**
   * Lista máscaras visíveis para o usuário autenticado na unidade informada.
   * Retorna: pessoais do próprio usuário + scope='unit' da unidade.
   */
  list: protectedProcedure
    .input(z.object({ unitId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return listReportMasks(input.unitId, ctx.user.id);
    }),

  /**
   * Importa um array de máscaras a partir de JSON.
   * scope: 'personal' → visível só para o usuário que importou.
   * scope: 'unit'     → visível para todos da unidade (apenas admin pode publicar).
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
   * Admin pode remover qualquer máscara da unidade.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const admin = isAdmin(ctx.user.role);
      const deleted = await deleteReportMask(input.id, ctx.user.id, admin);
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Máscara não encontrada ou sem permissão para remover.",
        });
      }
      return { success: true };
    }),
});
