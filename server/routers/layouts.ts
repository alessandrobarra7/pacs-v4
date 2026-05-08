/**
 * layouts.ts — Editor de Layout de Laudos por Unidade
 *
 * Procedures:
 *  - getByUnit   (protectedProcedure)  — busca o layout da unidade
 *  - upsert      (unitAdminProcedure)  — cria ou atualiza layout
 *  - delete      (adminProcedure)      — remove layout (apenas admin_master)
 */

import { router, adminProcedure, unitAdminProcedure, protectedProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { model_layouts } from '../../drizzle/schema';
import { layoutPreferencesSchema } from '../../shared/types';
import { getDb, createAuditLog } from '../db';
import { canAccessUnit } from '../authorization';
import sanitizeHtml from 'sanitize-html';
import { REPORT_SANITIZE_OPTIONS } from '../reportSanitize';

const logoItemSchema = z.object({
  url:    z.string(),
  width:  z.number().int().min(20).max(600),
  height: z.number().int().min(20).max(300),
  label:  z.string().max(100),
});

const layoutInputSchema = z.object({
  unitId:             z.number().int().positive(),
  headerHtml:         z.string().max(5000).optional().nullable(),
  footerHtml:         z.string().max(5000).optional().nullable(),
  preferences:        layoutPreferencesSchema.optional(),
  backgroundImageUrl: z.string().optional().nullable(),
  backgroundOpacity:  z.number().min(0.05).max(1.0).optional().nullable(),
  backgroundSize:     z.enum(['cover','contain','100% 100%','210mm 297mm']).optional().nullable(),
  footerImageUrl:     z.string().optional().nullable(),
  logos:              z.array(logoItemSchema).max(3).optional().nullable(),
  blockPositions:     z.record(z.string(), z.unknown()).optional().nullable(),
});

export const layoutsRouter = router({

  /**
   * getByUnit — Qualquer usuário autenticado pode buscar o layout da sua unidade.
   * Retorna null se não houver layout configurado (frontend usa DEFAULT_LAYOUT_PREFERENCES).
   */
  getByUnit: protectedProcedure
    .input(z.object({ unitId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      const [layout] = await db.select()
        .from(model_layouts)
        .where(eq(model_layouts.unit_id, input.unitId))
        .limit(1);
      return layout ?? null;
    }),

  /**
   * upsert — Cria ou atualiza o layout da unidade.
   * Acessível por admin_master e unit_admin com manage_templates na unidade.
   */
  upsert: unitAdminProcedure
    .input(layoutInputSchema)
    .mutation(async ({ input, ctx }) => {
      // unit_admin: verificar manage_templates na unidade alvo
      if (ctx.user.role === 'unit_admin') {
        const canManage = await canAccessUnit(ctx.user, input.unitId, 'manage_templates');
        if (!canManage) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para editar o layout desta unidade.',
          });
        }
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });

      // Sanitizar HTML antes de salvar — previne XSS armazenado
      const safeHeaderHtml = input.headerHtml
        ? sanitizeHtml(input.headerHtml, REPORT_SANITIZE_OPTIONS)
        : null;
      const safeFooterHtml = input.footerHtml
        ? sanitizeHtml(input.footerHtml, REPORT_SANITIZE_OPTIONS)
        : null;

      const [existing] = await db.select({ id: model_layouts.id })
        .from(model_layouts)
        .where(eq(model_layouts.unit_id, input.unitId))
        .limit(1);

      const isCreate = !existing;

      if (isCreate) {
        await db.insert(model_layouts).values({
          unit_id:              input.unitId,
          header_html:          safeHeaderHtml,
          footer_html:          safeFooterHtml,
          preferences:          input.preferences ?? null,
          background_image_url: input.backgroundImageUrl ?? null,
          background_opacity:   input.backgroundOpacity != null ? String(input.backgroundOpacity) : '1.00',
          background_size:      input.backgroundSize ?? 'cover',
          footer_image_url:     input.footerImageUrl ?? null,
          logos:                input.logos ?? null,
          block_positions:      input.blockPositions ?? null,
          created_by:           ctx.user.id,
        });
      } else {
        await db.update(model_layouts)
          .set({
            header_html:          safeHeaderHtml,
            footer_html:          safeFooterHtml,
            preferences:          input.preferences ?? null,
            background_image_url: input.backgroundImageUrl ?? null,
            background_opacity:   input.backgroundOpacity != null ? String(input.backgroundOpacity) : '1.00',
            background_size:      input.backgroundSize ?? 'cover',
            footer_image_url:     input.footerImageUrl ?? null,
            logos:                input.logos ?? null,
            block_positions:      input.blockPositions ?? null,
            updatedAt:            new Date(),
          })
          .where(eq(model_layouts.unit_id, input.unitId));
      }

      await createAuditLog({
        user_id:     ctx.user.id,
        unit_id:     input.unitId,
        action:      isCreate ? 'CREATE_LAYOUT' : 'UPDATE_LAYOUT',
        target_type: 'UNIT',
        target_id:   String(input.unitId),
        ip_address:  ctx.req.ip,
        user_agent:  ctx.req.headers['user-agent'] as string | undefined,
      });

      return { success: true, created: isCreate };
    }),

  /**
   * delete — Remove o layout da unidade. Apenas admin_master.
   */
  delete: adminProcedure
    .input(z.object({ unitId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });

      await db.delete(model_layouts)
        .where(eq(model_layouts.unit_id, input.unitId));

      await createAuditLog({
        user_id:     ctx.user.id,
        unit_id:     input.unitId,
        action:      'DELETE_LAYOUT',
        target_type: 'UNIT',
        target_id:   String(input.unitId),
        ip_address:  ctx.req.ip,
        user_agent:  ctx.req.headers['user-agent'] as string | undefined,
      });

      return { success: true };
    }),
});
