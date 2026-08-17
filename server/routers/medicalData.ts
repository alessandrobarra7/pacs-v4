import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { inferExtension, isValidImageBuffer } from "../routerUtils";
import { MAX_UPLOAD_BYTES } from "../../shared/const";
import {
  storageDelete,
  storageGetUrl,
  storagePut,
} from "../storage";

async function deleteAfterReplacement(reference: string | null | undefined): Promise<void> {
  if (!reference) return;
  try {
    await storageDelete(reference);
  } catch (error) {
    console.error("[MedicalData] Falha ao remover objeto antigo:", error instanceof Error ? error.message : "erro desconhecido");
  }
}

async function resolveMedia(reference: string | null | undefined): Promise<string | null> {
  if (!reference) return null;
  try {
    return await storageGetUrl(reference);
  } catch (error) {
    console.error("[MedicalData] Falha ao gerar URL temporária:", error instanceof Error ? error.message : "erro desconhecido");
    return reference.startsWith("/uploads/") ? reference : null;
  }
}

function decodeImage(dataUri: string): Buffer {
  const base64Data = dataUri.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo muito grande. Máximo 2 MB." });
  }
  if (!isValidImageBuffer(buffer)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de imagem inválido. Envie PNG, JPEG, GIF ou WebP." });
  }
  return buffer;
}

export const medicalDataRouter = router({
  updateUserMedical: protectedProcedure
    .input(z.object({
      userId: z.number(),
      crm: z.string().max(50).optional(),
      signatureFile: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const { updateUserMedicalData, getUserById } = await import("../db");
      const currentUser = await getUserById(input.userId);
      let signature_url: string | null | undefined;

      if (input.signatureFile) {
        const buffer = decodeImage(input.signatureFile);
        const sigExt = inferExtension(input.signatureFile);
        const key = `signatures/user_${input.userId}_${Date.now()}.${sigExt}`;
        const stored = await storagePut(key, buffer, `image/${sigExt === "jpg" ? "jpeg" : sigExt}`);
        signature_url = stored.url;

        await updateUserMedicalData(input.userId, { crm: input.crm, signature_url });
        await deleteAfterReplacement(currentUser?.signature_url);
        return { success: true };
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
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const { updateUnitLogo, getUnitById } = await import("../db");
      const currentUnit = await getUnitById(input.unitId);
      const buffer = decodeImage(input.logoFile);
      const logoExt = inferExtension(input.logoFile);
      const key = `logos/unit_${input.unitId}_${Date.now()}.${logoExt}`;
      const stored = await storagePut(key, buffer, `image/${logoExt === "jpg" ? "jpeg" : logoExt}`);

      await updateUnitLogo(input.unitId, stored.url);
      await deleteAfterReplacement(currentUnit?.logo_url);
      return { success: true };
    }),

  removeSignature: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "unit_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem remover assinaturas" });
      }
      const { updateUserMedicalData, getUserById } = await import("../db");
      const currentUser = await getUserById(input.userId);
      await updateUserMedicalData(input.userId, { signature_url: null });
      await deleteAfterReplacement(currentUser?.signature_url);
      return { success: true };
    }),

  removeLogo: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "unit_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem remover logos" });
      }
      const { updateUnitLogo, getUnitById } = await import("../db");
      const currentUnit = await getUnitById(input.unitId);
      await updateUnitLogo(input.unitId, null as any);
      await deleteAfterReplacement(currentUnit?.logo_url);
      return { success: true };
    }),

  updateStamp: protectedProcedure
    .input(z.object({
      userId: z.number(),
      stampFile: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const { updateUserMedicalData, getUserById } = await import("../db");
      const currentUser = await getUserById(input.userId);
      const buffer = decodeImage(input.stampFile);
      const stampExt = inferExtension(input.stampFile);
      const key = `stamps/user_${input.userId}_${Date.now()}.${stampExt}`;
      const stored = await storagePut(key, buffer, `image/${stampExt === "jpg" ? "jpeg" : stampExt}`);

      await updateUserMedicalData(input.userId, { stamp_url: stored.url });
      await deleteAfterReplacement(currentUser?.stamp_url);
      return { success: true };
    }),

  removeStamp: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o administrador root pode remover carimbos" });
      }
      const { updateUserMedicalData, getUserById } = await import("../db");
      const currentUser = await getUserById(input.userId);
      await updateUserMedicalData(input.userId, { stamp_url: null });
      await deleteAfterReplacement(currentUser?.stamp_url);
      return { success: true };
    }),

  getReportContext: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { getUserById, getUnitById } = await import("../db");
      const user = await getUserById(ctx.user.id);
      const unit = await getUnitById(input.unitId);
      const [signatureUrl, stampUrl, unitLogoUrl] = await Promise.all([
        resolveMedia(user?.signature_url),
        resolveMedia(user?.stamp_url),
        resolveMedia(unit?.logo_url),
      ]);
      return {
        doctorName: user?.name ?? "",
        crm: user?.crm ?? "",
        signatureUrl,
        stampUrl,
        unitName: unit?.name ?? "",
        unitLogoUrl,
        userId: user?.id ?? 0,
      };
    }),
});
