import { publicProcedure, router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sdk } from "../_core/sdk";
import { AuthService } from "../auth.service";
import { getSessionCookieOptions } from "../_core/cookies";
import { COOKIE_NAME } from "@shared/const";
import { createAuditLog, createLocalUser, updateUserPassword } from "../db";
import { adminProcedure } from "../_core/trpc";

export const authRouter = router({
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
        // FIX: usuários locais têm openId populado após migration.
        // Fallback defensivo caso openId ainda seja null por algum motivo.
        const userOpenId = user.openId ?? `local:${user.username}`;
        const token = await sdk.signSession({
          openId: userOpenId,
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
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '';
        // PRG-04: mensagem diagnóstica específica para cada tipo de erro de autenticação
        const message = msg === 'USER_NOT_FOUND' || msg === 'INVALID_PASSWORD'
          ? 'Credenciais inválidas'
          : msg === 'USER_INACTIVE'
            ? 'Usuário inativo. Entre em contato com o administrador.'
            : msg === 'ACCOUNT_EXPIRED'
              ? 'Conta expirada. Entre em contato com o administrador.'
              : msg === 'PASSWORD_NOT_SET'
                ? 'Este usuário não possui senha definida. Solicite ao administrador que defina uma senha para sua conta.'
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
});
