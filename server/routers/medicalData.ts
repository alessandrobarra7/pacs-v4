import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { inferExtension, isValidImageBuffer } from "../routerUtils";
import { MAX_UPLOAD_BYTES } from "../../shared/const";

export const medicalDataRouter = router({
    updateUserMedical: protectedProcedure
      .input(z.object({
        userId: z.number(),
        crm: z.string().max(50).optional(),
        signatureFile: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { updateUserMedicalData, getUserById: getUserByIdForSig } = await import('../db');
        let signature_url: string | null | undefined = undefined;
        if (input.signatureFile) {
          const { storagePut, storageDelete } = await import('../storage');
          // Bug fix 5.1: regex corrigida para suportar image/svg+xml e outros MIME com '+'
          const base64Data = input.signatureFile.replace(/^data:[^;]+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          // Bug fix 5.2: limite de tamanho server-side (M4: usa MAX_UPLOAD_BYTES de shared/const)
          if (buffer.length > MAX_UPLOAD_BYTES) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo muito grande. Máximo 2 MB.' });
          }
          // Bug fix 5.2: validação de magic bytes
          if (!isValidImageBuffer(buffer)) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Formato de imagem inválido. Envie PNG, JPEG, GIF ou WebP.' });
          }
          // Bug fix N4: apagar assinatura antiga antes de salvar a nova
          const currentUser = await getUserByIdForSig(input.userId);
          if (currentUser?.signature_url) storageDelete(currentUser.signature_url);
          // Bug fix N1: inferir extensão real do arquivo em vez de hardcodar .png
          const sigExt = inferExtension(input.signatureFile);
          const key = `signatures/user_${input.userId}_${Date.now()}.${sigExt}`;
          const { url } = await storagePut(key, buffer, `image/${sigExt === 'jpg' ? 'jpeg' : sigExt}`);
          signature_url = url;
        }
        await updateUserMedicalData(input.userId, {
          crm: input.crm,
          ...(signature_url !== undefined ? { signature_url } : {}),
        });
        return { success: true };
      }),

    updateUnitLogo: protectedProcedure
      .input(z.object({
        unitId: z.number(),
        logoFile: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { updateUnitLogo, getUnitById: getUnitByIdForLogo } = await import('../db');
        const { storagePut, storageDelete } = await import('../storage');
        // Bug fix 5.1: regex corrigida para suportar image/svg+xml e outros MIME com '+'
        const base64Data = input.logoFile.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        // Bug fix 5.2: limite de tamanho server-side (M4: usa MAX_UPLOAD_BYTES de shared/const)
        if (buffer.length > MAX_UPLOAD_BYTES) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo muito grande. Máximo 2 MB.' });
        }
        // Bug fix 5.2: validação de magic bytes
        if (!isValidImageBuffer(buffer)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Formato de imagem inválido. Envie PNG, JPEG, GIF ou WebP.' });
        }
        // Bug fix N4: apagar logo antiga antes de salvar a nova
        const currentUnit = await getUnitByIdForLogo(input.unitId);
        if (currentUnit?.logo_url) storageDelete(currentUnit.logo_url);
        // Bug fix N1: inferir extensão real do arquivo em vez de hardcodar .png
        const logoExt = inferExtension(input.logoFile);
        const key = `logos/unit_${input.unitId}_${Date.now()}.${logoExt}`;
        const { url } = await storagePut(key, buffer, `image/${logoExt === 'jpg' ? 'jpeg' : logoExt}`);
        await updateUnitLogo(input.unitId, url);
        return { success: true };
      }),

    removeSignature: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem remover assinaturas' });
        }
        const { updateUserMedicalData } = await import('../db');
        await updateUserMedicalData(input.userId, { signature_url: null });
        return { success: true };
      }),

    removeLogo: protectedProcedure
      .input(z.object({ unitId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem remover logos' });
        }
        const { updateUnitLogo } = await import('../db');
        await updateUnitLogo(input.unitId, null as any);
        return { success: true };
      }),

    updateStamp: protectedProcedure
      .input(z.object({
        userId: z.number(),
        stampFile: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
        const { updateUserMedicalData, getUserById: getUserByIdForStamp } = await import('../db');
        const { storagePut, storageDelete } = await import('../storage');
        // Bug fix 5.1: regex corrigida para suportar image/svg+xml e outros MIME com '+'
        const base64Data = input.stampFile.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        // Bug fix 5.2: limite de tamanho server-side (M4: usa MAX_UPLOAD_BYTES de shared/const)
        if (buffer.length > MAX_UPLOAD_BYTES) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo muito grande. Máximo 2 MB.' });
        }
        // Bug fix 5.2: validação de magic bytes
        if (!isValidImageBuffer(buffer)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Formato de imagem inválido. Envie PNG, JPEG, GIF ou WebP.' });
        }
        // Bug fix N4: apagar carimbo antigo antes de salvar o novo
        const currentUserForStamp = await getUserByIdForStamp(input.userId);
        if (currentUserForStamp?.stamp_url) storageDelete(currentUserForStamp.stamp_url);
        // Bug fix N1: inferir extensão real do arquivo em vez de hardcodar .png
        const stampExt = inferExtension(input.stampFile);
        const key = `stamps/user_${input.userId}_${Date.now()}.${stampExt}`;
        const { url } = await storagePut(key, buffer, `image/${stampExt === 'jpg' ? 'jpeg' : stampExt}`);
        await updateUserMedicalData(input.userId, { stamp_url: url });
        return { success: true };
      }),
    removeStamp: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o administrador root pode remover carimbos' });
        }
        const { updateUserMedicalData } = await import('../db');
        await updateUserMedicalData(input.userId, { stamp_url: null });
        return { success: true };
      }),
    getReportContext: protectedProcedure
      .input(z.object({ unitId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getUserById, getUnitById } = await import('../db');
        const user = await getUserById(ctx.user.id);
        const unit = await getUnitById(input.unitId);
        return {
          doctorName: user?.name ?? '',
          crm: user?.crm ?? '',
          signatureUrl: user?.signature_url ?? null,
          stampUrl: user?.stamp_url ?? null,
          unitName: unit?.name ?? '',
          unitLogoUrl: unit?.logo_url ?? null,
          userId: user?.id ?? 0,
        };
      }),
});
