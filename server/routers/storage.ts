/**
 * storage.ts — Upload de arquivos para S3
 * Usado pelo Editor de Layout para enviar imagens de fundo.
 */
import { router, adminProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { storagePut } from '../storage';
import { inferExtension, isValidImageBuffer } from '../routerUtils';

export const storageRouter = router({
  /**
   * uploadFile — Faz upload de um arquivo base64 para S3.
   * Apenas admin_master pode usar (imagens de layout de unidade).
   */
  uploadFile: adminProcedure
    .input(z.object({
      fileName: z.string().min(1).max(255),
      base64:   z.string().min(1),
      mimeType: z.string().min(1).max(100),
      folder:   z.string().max(100).optional().default('layouts'),
    }))
    .mutation(async ({ input }) => {
      const base64Data = input.base64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length > 5 * 1024 * 1024) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo muito grande. Máximo 5 MB.' });
      }
      if (!isValidImageBuffer(buffer)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Formato de imagem inválido. Envie PNG, JPEG, GIF ou WebP.' });
      }
      const ext = inferExtension(input.base64);
      const safeFolder = ['layouts', 'logos'].includes(input.folder) ? input.folder : 'layouts';
      const key = `${safeFolder}/layout_${Date.now()}_${crypto.randomUUID()}.${ext}`;
      const { url } = await storagePut(key, buffer, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
      return { url, key };
    }),
});
