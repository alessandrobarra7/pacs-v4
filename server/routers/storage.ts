/**
 * storage.ts — Upload de arquivos para S3
 * Usado pelo Editor de Layout para enviar imagens de fundo.
 */
import { router, adminProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { storagePut } from '../storage';

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
      folder:   z.string().max(100).optional().default('uploads'),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64, 'base64');
      if (buffer.length > 5 * 1024 * 1024) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo muito grande. Máximo 5 MB.' });
      }
      const key = `${input.folder}/${input.fileName}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      return { url, key };
    }),
});
