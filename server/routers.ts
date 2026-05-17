/**
 * routers.ts — Arquivo de composição do appRouter.
 * Cada domínio está em server/routers/<nome>.ts
 * Este arquivo apenas monta o router raiz e exporta o tipo AppRouter.
 */
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "@shared/const";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sdk } from "./_core/sdk";
import { AuthService } from "./auth.service";
import {
  createAuditLog,
  createLocalUser,
  updateUserPassword,
} from "./db";

// Módulos de domínio
import { unitsRouter } from "./routers/units";
import { studiesRouter } from "./routers/studies";
import { templatesRouter } from "./routers/templates";
import { reportsRouter } from "./routers/reports";
import { pacsRouter } from "./routers/pacs";
import { anamnesisRouter } from "./routers/anamnesis";
import { anamnesisSimpleRouter } from "./routers/anamnesisSimple";
import { annotationsRouter } from "./routers/annotations";
import { studyMetadataRouter } from "./routers/studyMetadata";
import { phrasesRouter } from "./routers/phrases";
import { medicalDataRouter } from "./routers/medicalData";
import { billingRouter } from "./routers/billing";
import { adminRouter } from "./routers/admin";
import { slaRouter } from "./routers/sla";
import { layoutsRouter } from "./routers/layouts";
import { storageRouter } from "./routers/storage";
import { financeSimpleRouter } from "./routers/financeSimple";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { path: cookieOptions.path, httpOnly: cookieOptions.httpOnly, sameSite: cookieOptions.sameSite, secure: cookieOptions.secure });
      return {
        success: true,
      } as const;
    }),

    login: publicProcedure
      .input(z.object({
        login: z.string().min(1),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const user = await AuthService.validateCredentials(input.login, input.password);
          const token = await sdk.signSession({
            openId: user.openId,
            appId: process.env.VITE_APP_ID ?? 'pacs-local',
            name: user.name ?? user.username ?? 'Usuário',
          });
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
          const sanitizedUser = AuthService.sanitizeUser(user);
          await createAuditLog({
            user_id: user.id,
            unit_id: user.unit_id ?? undefined,
            action: 'LOGIN',
            target_type: 'USER',
            target_id: String(user.id),
            ip_address: ctx.req.ip,
            user_agent: ctx.req.headers['user-agent'],
          });
          return { success: true, user: sanitizedUser };
        } catch (error: any) {
          const message = error.message === 'USER_NOT_FOUND' || error.message === 'INVALID_PASSWORD'
            ? 'Credenciais inválidas'
            : error.message === 'USER_INACTIVE'
              ? 'Usuário inativo'
              : error.message === 'ACCOUNT_EXPIRED'
                ? 'Conta expirada. Entre em contato com o administrador.'
                : 'Erro ao fazer login';
          throw new TRPCError({ code: 'UNAUTHORIZED', message });
        }
      }),

    createLocalUser: adminProcedure
      .input(z.object({
        username: z.string().min(3).max(64),
        email: z.string().email().optional(),
        name: z.string().min(1),
        password: z.string().min(6),
        role: z.enum(['admin_master', 'unit_admin', 'medico', 'viewer', 'operador', 'responsavel_financeiro']),
        unit_id: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const password_hash = await bcrypt.hash(input.password, 12);
        const id = await createLocalUser({
          username: input.username,
          email: input.email,
          name: input.name,
          password_hash,
          role: input.role,
          unit_id: input.unit_id,
        });
        return { success: true, id };
      }),

    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.password_hash) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Usuário não usa autenticação local' });
        }
        const valid = await bcrypt.compare(input.currentPassword, ctx.user.password_hash);
        if (!valid) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Senha atual incorreta' });
        }
        const newHash = await bcrypt.hash(input.newPassword, 12);
        await updateUserPassword(ctx.user.id, newHash);
        return { success: true };
      }),
  }),

  units: unitsRouter,
  studies: studiesRouter,
  templates: templatesRouter,
  reports: reportsRouter,
  pacs: pacsRouter,
  anamnesis: anamnesisRouter,
  anamnesisSimple: anamnesisSimpleRouter,
  annotations: annotationsRouter,
  studyMetadata: studyMetadataRouter,
  phrases: phrasesRouter,
  medicalData: medicalDataRouter,
  billing: billingRouter,
  admin: adminRouter,
  sla: slaRouter,
  layouts: layoutsRouter,
  storage: storageRouter,
  financeSimple: financeSimpleRouter,
});

export type AppRouter = typeof appRouter;
