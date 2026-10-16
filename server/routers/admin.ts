import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthService } from "../auth.service";
import {
  createAuditLog, getDb, resolveEffectiveUnitId,
  getGroupPermissions, upsertGroupPermission,
} from "../db";
import { storageGetUrl } from "../storage";

async function resolveAdminMedia(reference: string | null | undefined): Promise<string | null> {
  if (!reference) return null;
  try {
    return await storageGetUrl(reference);
  } catch (error) {
    console.error("[Admin] Falha ao gerar URL temporária de mídia:", error instanceof Error ? error.message : "erro desconhecido");
    return reference.startsWith("/uploads/") ? reference : null;
  }
}

// ─── Permissões por grupo ────────────────────────────────────────────────────────────────────────────
// Fonte única de verdade. Alterar APENAS AQUI ao mudar permissões de grupos.
// Usada em createUser e setUserPermissions.
const GROUP_PERMISSIONS = {
  medicos: {
    view_studies:     true,
    edit_reports:     true,
    view_anamnesis:   true,
    edit_anamnesis:   true,
    edit_exam_legend: true,
    print_reports:    true,
    manage_templates: true,
    view_financial:   false,
  },
  operadores: {
    view_studies:     true,
    edit_reports:     false,
    view_anamnesis:   true,
    edit_anamnesis:   true,
    edit_exam_legend: true,
    print_reports:    false,
    manage_templates: false,
    view_financial:   false,
  },
  atendentes: {
    view_studies:     true,
    edit_reports:     false,
    view_anamnesis:   false,
    edit_anamnesis:   false,
    edit_exam_legend: false,
    print_reports:    false,
    manage_templates: false,
    view_financial:   false,
  },
  visualizadores: {
    view_studies:     true,
    edit_reports:     false,
    view_anamnesis:   false,
    edit_anamnesis:   false,
    edit_exam_legend: false,
    print_reports:    true,
    manage_templates: false,
    view_financial:   false,
  },
  // Migration 0046_group_perm_view_financial.sql: view_financial=true para
  // responsaveisFinanceiros e adminsMaster — reproduzido aqui no fallback
  // hardcoded (usado só se a tabela group_permission_configs estiver vazia).
  responsaveisFinanceiros: {
    view_studies:     false,
    edit_reports:     false,
    view_anamnesis:   false,
    edit_anamnesis:   false,
    edit_exam_legend: false,
    print_reports:    false,
    manage_templates: false,
    view_financial:   true,
  },
  administradoresUnidade: {
    view_studies:     true,
    edit_reports:     false,
    view_anamnesis:   false,
    edit_anamnesis:   false,
    edit_exam_legend: false,
    print_reports:    true,
    manage_templates: false,
    view_financial:   false,
  },
  adminsMaster: {
    view_studies:     true,
    edit_reports:     true,
    view_anamnesis:   true,
    edit_anamnesis:   true,
    edit_exam_legend: true,
    print_reports:    true,
    manage_templates: true,
    view_financial:   true,
  },
} as const satisfies Record<string, {
  view_studies:     boolean;
  edit_reports:     boolean;
  view_anamnesis:   boolean;
  edit_anamnesis:   boolean;
  edit_exam_legend: boolean;
  print_reports:    boolean;
  manage_templates: boolean;
  view_financial:   boolean;
}>;

type GroupKey = keyof typeof GROUP_PERMISSIONS;

/**
 * Mapeamento fixo papel -> groupKey (parecer Manus, achado criação de
 * usuários). Hoisted para módulo (parecer de revisão 2026-10-15, Bloqueio de
 * arquitetura): antes só existia dentro do handler de `createUser`, e
 * `createUserScoped` não reaproveitava a mesma checagem de coerência.
 */
const ROLE_TO_GROUP_KEY: Record<string, GroupKey> = {
  medico: 'medicos',
  operador: 'operadores',
  atendente: 'atendentes',
  viewer: 'visualizadores',
  responsavel_financeiro: 'responsaveisFinanceiros',
  unit_admin: 'administradoresUnidade',
  admin_master: 'adminsMaster',
};

/** Resolve a matriz de permissões de um grupo: banco (group_permission_configs)
 *  como fonte de verdade, fallback na constante hardcoded só se o banco
 *  estiver vazio. */
async function resolveGroupPermissions(groupKey: GroupKey) {
  const dbGroupPerms = await getGroupPermissions();
  const dbPerm = dbGroupPerms.find((p) => p.group_key === groupKey);
  return dbPerm
    ? {
        view_studies:     dbPerm.view_studies,
        edit_reports:     dbPerm.edit_reports,
        view_anamnesis:   dbPerm.view_anamnesis,
        edit_anamnesis:   dbPerm.edit_anamnesis,
        edit_exam_legend: dbPerm.edit_exam_legend,
        print_reports:    dbPerm.print_reports,
        manage_templates: dbPerm.manage_templates,
        view_financial:   (dbPerm as any).view_financial ?? false,
      }
    : GROUP_PERMISSIONS[groupKey];
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida e normaliza uma data "somente calendário" (sem hora/fuso) no
 * formato AAAA-MM-DD (parecer de revisão 2026-10-15, seção 5).
 *
 * `new Date(string)` do JavaScript NORMALIZA datas impossíveis em vez de
 * rejeitá-las — prova direta: `new Date('2026-02-30').toISOString()` vira
 * `2026-03-02T00:00:00.000Z`, sem nenhum erro. Por isso nunca construímos um
 * objeto Date diretamente a partir da entrada do usuário para validar — os
 * componentes y/m/d são reconstruídos a partir do resultado e comparados
 * byte a byte com o que foi digitado; qualquer "correção" silenciosa do
 * JavaScript reprova aqui. A coluna `users.expiration_date` é DATE sem mode
 * (drizzle-orm mysql-core trata isso como mode: 'string'), então o contrato
 * de saída é a própria string AAAA-MM-DD — nunca um objeto Date — igual ao
 * que o fluxo de edição (`updateUser`) já fazia.
 */
function parseStrictCalendarDate(value: string): string {
  if (!DATE_ONLY_RE.test(value)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Data de expiração inválida: "${value}" (formato esperado AAAA-MM-DD)`,
    });
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Data de expiração inválida: "${value}" não existe no calendário`,
    });
  }
  return value;
}

export const adminRouter = router({
    listUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const { users, user_unit_permissions, units: unitsTable } = await import("../../drizzle/schema");
      const { desc, eq: eqOp, and } = await import("drizzle-orm");
      
        // 4a: unit_admin com unit_id legado null deve usar user_unit_permissions
      const { inArray: inArrayOp2 } = await import('drizzle-orm');
      let result;
      if (ctx.user.role === 'unit_admin') {
        // Resolve as unidades do unit_admin via legado + user_unit_permissions
        const myPerms = await db.select({ unit_id: user_unit_permissions.unit_id })
          .from(user_unit_permissions)
          .where(eqOp(user_unit_permissions.user_id, ctx.user.id));
        const myUnitIds = myPerms.map(p => p.unit_id);
        if (ctx.user.unit_id && !myUnitIds.includes(ctx.user.unit_id)) {
          myUnitIds.push(ctx.user.unit_id);
        }
        if (myUnitIds.length === 0) return [];
        // Busca usuários que têm unit_id legado nas minhas unidades
        const usersLegacy = await db.select({ user_id: users.id })
          .from(users)
          .where(inArrayOp2(users.unit_id, myUnitIds));
        // Busca usuários que têm permissões nas minhas unidades
        const usersViaPerms = await db.selectDistinct({ user_id: user_unit_permissions.user_id })
          .from(user_unit_permissions)
          .where(inArrayOp2(user_unit_permissions.unit_id, myUnitIds));
        const allUserIds = Array.from(new Set([
          ...usersLegacy.map(u => u.user_id),
          ...usersViaPerms.map(u => u.user_id),
        ]));
        if (allUserIds.length === 0) return [];
        result = await db
          .select({
            id: users.id,
            name: users.name,
            username: users.username,
            email: users.email,
            role: users.role,
            unit_id: users.unit_id,
            isActive: users.isActive,
            createdAt: users.createdAt,
            lastSignedIn: users.lastSignedIn,
            expiration_date: users.expiration_date,
          })
          .from(users)
          .where(inArrayOp2(users.id, allUserIds))
          .orderBy(desc(users.createdAt));
      } else {
        result = await db
          .select({
            id: users.id,
            name: users.name,
            username: users.username,
            email: users.email,
            role: users.role,
            unit_id: users.unit_id,
            isActive: users.isActive,
            createdAt: users.createdAt,
            lastSignedIn: users.lastSignedIn,
            expiration_date: users.expiration_date,
          })
          .from(users)
          .orderBy(desc(users.createdAt));
      }
      // Buscar unidades vinculadas via permissões para cada usuário
      const allPerms = await db
        .select({
          user_id: user_unit_permissions.user_id,
          unit_id: user_unit_permissions.unit_id,
          unit_name: unitsTable.name,
        })
        .from(user_unit_permissions)
        .innerJoin(unitsTable, eqOp(unitsTable.id, user_unit_permissions.unit_id));
      
      // V14-P2 FIX: Para unit_admin, determinar unidades administradas para filtrar linked_units
      let adminUnitIds: number[] | null = null;
      if (ctx.user.role === 'unit_admin') {
        const { getUserUnitPermissions: getAdminPerms } = await import('../db');
        const adminPerms = await getAdminPerms(ctx.user.id);
        adminUnitIds = adminPerms.map(p => p.unit_id);
        if (ctx.user.unit_id && !adminUnitIds.includes(ctx.user.unit_id)) {
          adminUnitIds.push(ctx.user.unit_id);
        }
      }
      
      const permsByUser: Record<number, { unit_id: number; unit_name: string }[]> = {};
      for (const p of allPerms) {
        // V14-P2 FIX: unit_admin só vê linked_units dentro do seu escopo
        if (adminUnitIds && !adminUnitIds.includes(p.unit_id)) continue;
        if (!permsByUser[p.user_id]) permsByUser[p.user_id] = [];
        permsByUser[p.user_id].push({ unit_id: p.unit_id, unit_name: p.unit_name });
      }
      return result.map(u => ({
        ...u,
        linked_units: permsByUser[u.id] ?? [],
      }));;
    }),

    listAuditLog: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(100) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { audit_log, users } = await import("../../drizzle/schema");
        const { desc, eq: eqOp } = await import("drizzle-orm");
        // F2-5: unit_admin só vê eventos da(s) sua(s) unidade(s)
        const { and: andOp, inArray } = await import('drizzle-orm');
        let unitFilter: any = undefined;
        if (ctx.user.role === 'unit_admin') {
          const { getUserUnitPermission } = await import('../db');
          const { user_unit_permissions: uup } = await import('../../drizzle/schema');
          const myPerms = await db.select({ unit_id: uup.unit_id }).from(uup)
            .where(eqOp(uup.user_id, ctx.user.id));
          const myUnitIds = myPerms.map(p => p.unit_id);
          if (ctx.user.unit_id && !myUnitIds.includes(ctx.user.unit_id)) {
            myUnitIds.push(ctx.user.unit_id);
          }
          if (myUnitIds.length > 0) {
            unitFilter = inArray(audit_log.unit_id, myUnitIds);
          } else {
            return []; // unit_admin sem unidades não vê nada
          }
        }
        const result = await db
          .select({
            id: audit_log.id,
            action: audit_log.action,
            target_type: audit_log.target_type,
            target_id: audit_log.target_id,
            ip_address: audit_log.ip_address,
            timestamp: audit_log.timestamp,
            user_id: audit_log.user_id,
            unit_id: audit_log.unit_id,
            userName: users.name,
            userUsername: users.username,
          })
          .from(audit_log)
          .leftJoin(users, eqOp(audit_log.user_id, users.id))
          .where(unitFilter)
          .orderBy(desc(audit_log.timestamp))
          .limit(input.limit);
        return result;
      }),

    deleteUser: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin_master pode excluir usuários' });
        }
        if (ctx.user.id === input.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível excluir o próprio usuário' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users } = await import("../../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        await db.delete(users).where(eqOp(users.id, input.id));

        // FIX: registrar exclusão no audit_log — operação irreversível
        await createAuditLog({
          user_id:     ctx.user.id,
          unit_id:     ctx.user.unit_id ?? undefined,
          action:      'DELETE_USER',
          target_type: 'USER',
          target_id:   String(input.id),
          ip_address:  ctx.req.ip,
          user_agent:  ctx.req.headers['user-agent'] as string | undefined,
        });

        return { success: true };
      }),

    updateUser: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        email: z.string().optional().nullable(),
        role: z.enum(['admin_master', 'unit_admin', 'medico', 'viewer', 'operador', 'atendente', 'responsavel_financeiro']).optional(),
        unit_id: z.number().optional().nullable(),
        isActive: z.boolean().optional(),
        expiration_date: z.string().optional().nullable(),
        password: z.string().min(6).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        if (ctx.user.role === 'unit_admin' && input.role === 'admin_master') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin não pode promover para admin_master' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users } = await import("../../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        // F1-5 & Segurança Hierárquica: unit_admin só pode editar usuários da sua própria unidade e nunca contas admin_master ou unit_admin
        const targetUserCheck = await db.select().from(users).where(eqOp(users.id, input.id)).limit(1);
        const targetUser = targetUserCheck[0];
        if (!targetUser) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' });
        }
        if (ctx.user.role === 'unit_admin') {
          if (targetUser.role === 'admin_master' || targetUser.role === 'unit_admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin não pode gerenciar contas de administradores (master ou unit_admin)' });
          }
          const targetUnitId = targetUser.unit_id;
          const adminUnitId = ctx.user.unit_id;
          if (!adminUnitId || targetUnitId !== adminUnitId) {
            // Verificar também via user_unit_permissions
            const { getUserUnitPermission: getUnitPerm } = await import('../db');
            const hasScope = targetUnitId ? !!(await getUnitPerm(ctx.user.id, targetUnitId)) : false;
            if (!hasScope) throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin só pode editar usuários da sua unidade' });
          }
        }
        // V14-P2 FIX: unit_admin não pode mover usuário para unidade fora do seu escopo
        if (ctx.user.role === 'unit_admin' && input.unit_id !== undefined && input.unit_id !== null) {
          const { getUserUnitPermissions: getAdminPerms } = await import('../db');
          const adminPerms = await getAdminPerms(ctx.user.id);
          const adminUnitIds = adminPerms.map(p => p.unit_id);
          if (ctx.user.unit_id && !adminUnitIds.includes(ctx.user.unit_id)) adminUnitIds.push(ctx.user.unit_id);
          if (!adminUnitIds.includes(input.unit_id)) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin não pode mover usuário para unidade fora do seu escopo' });
          }
        }
        const updateData: Record<string, unknown> = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.email !== undefined) updateData.email = input.email || null;
        if (input.role !== undefined) updateData.role = input.role;
        if (input.unit_id !== undefined) updateData.unit_id = input.unit_id;
        if (input.isActive !== undefined) updateData.isActive = input.isActive;
        if (input.expiration_date !== undefined) {
          // CORREÇÃO (auditoria claude/correcoes-setoriais-auditoria):
          // drizzle/schema.ts declara expiration_date como date(...) sem "mode",
          // que no drizzle-orm/mysql-core equivale a mode: 'string' — a coluna é
          // lida e deve ser escrita como 'YYYY-MM-DD'.
          //
          // Parecer de revisão 2026-10-15 (seção 5): a validação anterior
          // construía um Date a partir da string digitada e, se o resultado
          // fosse NaN, gravava NULL silenciosamente — mas new Date(string)
          // NORMALIZA datas impossíveis (ex.: '2026-02-30' vira 2 de março)
          // em vez de produzir NaN, então esse caminho nunca disparava para
          // o caso que importa. Agora usamos parseStrictCalendarDate, que
          // reconstrói y/m/d e compara com o que foi digitado — qualquer
          // data impossível é rejeitada com BAD_REQUEST, nunca normalizada
          // ou silenciosamente descartada.
          updateData.expiration_date = input.expiration_date
            ? parseStrictCalendarDate(input.expiration_date)
            : null;
        }
        if (input.password) {
          const bcryptLib = await import('bcryptjs');
          updateData.password_hash = await bcryptLib.hash(input.password, 12);
        }
        await db.update(users).set(updateData as any).where(eqOp(users.id, input.id));
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id ?? undefined,
          action: 'UPDATE_USER',
          target_type: 'USER',
          target_id: String(input.id),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { success: true };
      }),

    toggleUserActive: protectedProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        if (ctx.user.id === input.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível desativar o próprio usuário' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users } = await import("../../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        // F1-5 & Segurança Hierárquica: unit_admin só pode gerenciar usuários comuns de sua própria unidade
        const targetUserCheckToggle = await db.select().from(users).where(eqOp(users.id, input.id)).limit(1);
        const targetUserToggle = targetUserCheckToggle[0];
        if (!targetUserToggle) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' });
        }
        if (ctx.user.role === 'unit_admin') {
          if (targetUserToggle.role === 'admin_master' || targetUserToggle.role === 'unit_admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin não pode alterar status de administradores (master ou unit_admin)' });
          }
          const targetUnitId = targetUserToggle.unit_id;
          const adminUnitId = ctx.user.unit_id;
          if (!adminUnitId || targetUnitId !== adminUnitId) {
            const { getUserUnitPermission: getUnitPerm } = await import('../db');
            const hasScope = targetUnitId ? !!(await getUnitPerm(ctx.user.id, targetUnitId)) : false;
            if (!hasScope) throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin só pode gerenciar usuários da sua unidade' });
          }
        }
        await db.update(users).set({ isActive: input.isActive }).where(eqOp(users.id, input.id));

        // FIX: registrar ativação/desativação no audit_log
        await createAuditLog({
          user_id:     ctx.user.id,
          unit_id:     ctx.user.unit_id ?? undefined,
          action:      input.isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
          target_type: 'USER',
          target_id:   String(input.id),
          ip_address:  ctx.req.ip,
          user_agent:  ctx.req.headers['user-agent'] as string | undefined,
          metadata:    { isActive: input.isActive },
        });

        return { success: true };
      }),

    getUserPermissions: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const { getUserUnitPermissions, getUserById } = await import('../db');
        const perms = await getUserUnitPermissions(input.userId);
        // V13-P5 FIX: unit_admin só pode ver permissões de usuários dentro do seu escopo
        if (ctx.user.role === 'unit_admin') {
          const { getAdminManagedUnitIds } = await import('../authorization');
          const managedIds = await getAdminManagedUnitIds(ctx.user);
          if (managedIds) {
            // Verificar se o usuário alvo pertence a pelo menos uma unidade gerenciada
            const targetUser = await getUserById(input.userId);
            const targetInScope = perms.some(p => managedIds.includes(p.unit_id))
              || (targetUser?.unit_id != null && managedIds.includes(targetUser.unit_id));
            if (!targetInScope) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuário fora do seu escopo de administração' });
            }
            return perms.filter(p => managedIds.includes(p.unit_id));
          }
        }
        return perms;
      }),

    setUserPermissions: protectedProcedure
      .input(z.object({
        userId: z.number(),
        permissions: z.array(z.object({
          unit_id: z.number(),
          view_studies: z.boolean(),
          edit_reports: z.boolean(),
          view_anamnesis: z.boolean(),
          edit_anamnesis: z.boolean(),
          edit_exam_legend: z.boolean(),
          print_reports: z.boolean(),
          manage_templates: z.boolean(),
          view_financial: z.boolean().optional().default(false),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        // unit_admin só pode definir permissões para unidades que ele gerencia
        if (ctx.user.role === 'unit_admin') {
          const { getAdminManagedUnitIds } = await import('../authorization');
          const managedIds = await getAdminManagedUnitIds(ctx.user);
          if (managedIds) {
            for (const perm of input.permissions) {
              if (!managedIds.includes(perm.unit_id)) {
                throw new TRPCError({ code: 'FORBIDDEN', message: `Unit admin não tem acesso à unidade ${perm.unit_id}` });
              }
            }
          }
        }
        const { setUserUnitPermissions } = await import('../db');
        const permissionsWithoutTemplateAdministration = input.permissions.map((permission) => ({
          ...permission,
          manage_templates: false,
        }));
        await setUserUnitPermissions(input.userId, permissionsWithoutTemplateAdministration);
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id ?? undefined,
          action: 'UPDATE_USER',
          target_type: 'USER',
          target_id: String(input.userId),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { success: true };
      }),

    getUnitAccessTree: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users: usersTable, units: unitsTable, user_unit_permissions: uup } = await import('../../drizzle/schema');
        const { eq: eqOp, inArray: inArrayOp } = await import('drizzle-orm');

        // Determinar quais unidades o caller pode ver
        let allowedUnitIds: number[] | null = null;
        if (ctx.user.role === 'unit_admin') {
          const myPerms = await db.select({ unit_id: uup.unit_id }).from(uup)
            .where(eqOp(uup.user_id, ctx.user.id));
          const ids = myPerms.map(p => p.unit_id);
          if (ctx.user.unit_id && !ids.includes(ctx.user.unit_id)) ids.push(ctx.user.unit_id);
          if (ids.length === 0) return [];
          allowedUnitIds = ids;
        }

        // Buscar todas as unidades (filtradas se unit_admin)
        const allUnits = allowedUnitIds
          ? await db.select().from(unitsTable).where(inArrayOp(unitsTable.id, allowedUnitIds))
          : await db.select().from(unitsTable);

        // Buscar todos os vínculos user_unit_permissions das unidades visíveis
        const unitIds = allUnits.map(u => u.id);
        if (unitIds.length === 0) return [];

        const allPerms = await db
          .select({
            user_id: uup.user_id,
            unit_id: uup.unit_id,
            view_studies: uup.view_studies,
            edit_reports: uup.edit_reports,
            view_anamnesis: uup.view_anamnesis,
            print_reports: uup.print_reports,
            manage_templates: uup.manage_templates,
            group_key: uup.group_key,
          })
          .from(uup)
          .where(inArrayOp(uup.unit_id, unitIds));

        // Buscar todos os usuários vinculados
        const linkedUserIds = Array.from(new Set(allPerms.map(p => p.user_id)));

        // Incluir também usuários com unit_id legado nas unidades visíveis
        const legacyUsers = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(inArrayOp(usersTable.unit_id, unitIds));
        const legacyIds = legacyUsers.map(u => u.id).filter(id => !linkedUserIds.includes(id));
        const allUserIds = [...linkedUserIds, ...legacyIds];

        let allUsers: typeof usersTable.$inferSelect[] = [];
        if (allUserIds.length > 0) {
          allUsers = await db
            .select({
              id: usersTable.id,
              name: usersTable.name,
              username: usersTable.username,
              email: usersTable.email,
              role: usersTable.role,
              unit_id: usersTable.unit_id,
              isActive: usersTable.isActive,
              createdAt: usersTable.createdAt,
              lastSignedIn: usersTable.lastSignedIn,
              expiration_date: usersTable.expiration_date,
            } as any)
            .from(usersTable)
            .where(inArrayOp(usersTable.id, allUserIds)) as any;
        }

        // Montar índice de permissões por unidade e usuário
        const permsByUnit: Record<number, typeof allPerms> = {};
        // Índice: user_id -> unit_id -> group_key (para classificação por unidade)
        const groupKeyByUserUnit: Record<string, string> = {};
        for (const p of allPerms) {
          if (!permsByUnit[p.unit_id]) permsByUnit[p.unit_id] = [];
          permsByUnit[p.unit_id].push(p);
          if (p.group_key) groupKeyByUserUnit[`${p.user_id}:${p.unit_id}`] = p.group_key;
        }
        const usersById: Record<number, (typeof allUsers)[0]> = {};
        for (const u of allUsers) usersById[u.id] = u;

        // Função de agrupamento por papel (fallback para role global)
        const ROLE_GROUPS = [
          { key: 'responsaveisFinanceiros', roles: ['responsavel_financeiro'] },
          { key: 'medicos', roles: ['medico'] },
          { key: 'operadores', roles: ['operador'] },
          { key: 'atendentes', roles: ['atendente'] },
          { key: 'visualizadores', roles: ['viewer'] },
          { key: 'administradoresUnidade', roles: ['unit_admin'] },
          { key: 'adminsMaster', roles: ['admin_master'] },
        ] as const;

        return Promise.all(allUnits.map(async (unit) => {
          const permsForUnit = permsByUnit[unit.id] ?? [];

          // Usuários via permissões
          const usersInUnit = permsForUnit
            .map(p => usersById[p.user_id])
            .filter(Boolean);

          // Adicionar usuários legados (unit_id) que não têm permissão explícita
          for (const u of allUsers) {
            if (u.unit_id === unit.id && !usersInUnit.find(x => x.id === u.id)) {
              usersInUnit.push(u);
            }
          }

          // Deduplicar
          const seen = new Set<number>();
          const uniqueUsers = usersInUnit.filter(u => {
            if (seen.has(u.id)) return false;
            seen.add(u.id);
            return true;
          });

          // Agrupar por group_key da permissão (específico por unidade)
          // Fallback para role global se group_key não estiver definido
          const groups: Record<string, typeof uniqueUsers> = {
            responsaveisFinanceiros: [],
            medicos: [],
            operadores: [],
            atendentes: [],
            visualizadores: [],
            administradoresUnidade: [],
            adminsMaster: [],
            outros: [],
          };
          for (const u of uniqueUsers) {
            const unitGroupKey = groupKeyByUserUnit[`${u.id}:${unit.id}`];
            if (unitGroupKey && unitGroupKey !== 'outros' && groups[unitGroupKey] !== undefined) {
              groups[unitGroupKey].push(u);
            } else {
              // Fallback: usar role global
              const group = ROLE_GROUPS.find(g => (g.roles as readonly string[]).includes(u.role));
              if (group) {
                groups[group.key].push(u);
              } else {
                groups['outros'].push(u);
              }
            }
          }

          const totalUsers = uniqueUsers.length;
          return {
            unit: {
              id: unit.id,
              name: unit.name,
              slug: unit.slug,
              isActive: unit.isActive,
              address: unit.address,
              logo_url: await resolveAdminMedia(unit.logo_url),
            },
            totals: {
              totalUsers,
              responsibleCount: groups.responsaveisFinanceiros.length,
              doctorCount: groups.medicos.length,
              operatorCount: groups.operadores.length,
              attendantCount: groups.atendentes.length,
              viewerCount: groups.visualizadores.length,
              unitAdminCount: groups.administradoresUnidade.length,
            },
            groups,
          };
        }));
      }),

    removeUserUnitLink: protectedProcedure
      .input(z.object({ userId: z.number(), unitId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        if (ctx.user.role === 'unit_admin') {
          const { getUserUnitPermission: getUnitPerm } = await import('../db');
          const hasAccess = ctx.user.unit_id === input.unitId ||
            !!(await getUnitPerm(ctx.user.id, input.unitId));
          if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta unidade' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { user_unit_permissions: uup } = await import('../../drizzle/schema');
        const { eq: eqOp, and: andOp } = await import('drizzle-orm');
        await db.delete(uup).where(
          andOp(eqOp(uup.user_id, input.userId), eqOp(uup.unit_id, input.unitId))
        );
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: input.unitId,
          action: 'UPDATE_USER',
          target_type: 'USER',
          target_id: String(input.userId),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { success: true };
      }),

    searchAssignableUsers: protectedProcedure
      .input(z.object({
        query: z.string().optional(),
        excludeUnitId: z.number().optional(),
        onlyActive: z.boolean().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users: usersTable, units: unitsTable, user_unit_permissions: uup } = await import('../../drizzle/schema');
        const { or, like, eq: eqOp, inArray: inArrayOp, and: andOp } = await import('drizzle-orm');
        let allowedUnitIds: number[] | null = null;
        if (ctx.user.role === 'unit_admin') {
          const myPerms = await db.select({ unit_id: uup.unit_id }).from(uup).where(eqOp(uup.user_id, ctx.user.id));
          const ids = myPerms.map(p => p.unit_id);
          if (ctx.user.unit_id && !ids.includes(ctx.user.unit_id)) ids.push(ctx.user.unit_id);
          allowedUnitIds = ids;
        }
        const whereClauses: any[] = [];
        if (input.query && input.query.trim().length > 0) {
          const q = `%${input.query.trim()}%`;
          whereClauses.push(or(like(usersTable.name, q), like(usersTable.username, q), like(usersTable.email, q)));
        }
        if (input.onlyActive) {
          whereClauses.push(eqOp(usersTable.isActive, true));
        }
        const allUsers = whereClauses.length > 0
          ? await db.select().from(usersTable).where(whereClauses.length === 1 ? whereClauses[0] : andOp(...whereClauses))
          : await db.select().from(usersTable);
        const allUnits = await db.select({ id: unitsTable.id, name: unitsTable.name }).from(unitsTable);
        const allPerms = await db.select({ user_id: uup.user_id, unit_id: uup.unit_id }).from(uup);
        const unitsById: Record<number, string> = {};
        for (const u of allUnits) unitsById[u.id] = u.name;
        return allUsers
          .filter(u => {
            if (allowedUnitIds) {
              const userUnitIds = allPerms.filter(p => p.user_id === u.id).map(p => p.unit_id);
              if (u.unit_id) userUnitIds.push(u.unit_id);
              return userUnitIds.some(id => allowedUnitIds!.includes(id));
            }
            return true;
          })
          .filter(u => {
            if (input.excludeUnitId) {
              const alreadyLinked = allPerms.some(p => p.user_id === u.id && p.unit_id === input.excludeUnitId);
              const isLegacy = u.unit_id === input.excludeUnitId;
              return !alreadyLinked && !isLegacy;
            }
            return true;
          })
          .map(u => ({
            id: u.id,
            name: u.name,
            username: u.username,
            email: u.email,
            role: u.role,
            isActive: u.isActive,
            lastSignedIn: u.lastSignedIn,
            linkedUnits: allPerms
              .filter(p => p.user_id === u.id)
              .map(p => ({ id: p.unit_id, name: unitsById[p.unit_id] ?? '' }))
              .filter(x => x.name),
          }));
      }),

    // ─────────────────────────────────────────────────────────────────────
    // admin.createUser — procedure canônica de criação de usuário
    // (parecer Manus, ACHADO_CRIACAO_USUARIOS_FUNCAO_E_APARENCIA_2026-10-15).
    //
    // Substitui, para a tela de administração, tanto `auth.createLocalUser`
    // (exclusiva de admin_master, por isso 403 para unit_admin) quanto a
    // `admin.createUserScoped` abaixo (nunca chamada pelo frontend: contrato
    // incompatível com a tela atual — unidade única, papéis incompletos,
    // sem isActive/expiração, cadeia financeira não transacional).
    //
    // Regras de autorização:
    // - admin_master: pode criar qualquer papel, em qualquer quantidade de
    //   unidades (inclusive nenhuma, para o próprio admin_master).
    // - unit_admin: só pode criar medico/operador/atendente/viewer/
    //   responsavel_financeiro, e somente em UMA unidade dentro do seu
    //   próprio escopo (unit_id legado OU user_unit_permissions).
    // - papel e groupKey precisam ser coerentes entre si (mapeamento fixo).
    //
    // Toda a escrita (usuário + vínculos de unidade + audit log + cadeia
    // financeira, quando aplicável) acontece em uma única transação em
    // server/db.ts (createUserTransactional) — ver ADENDO desta branch.
    // Mídia (carimbo/assinatura/CRM) continua fora desta procedure, como
    // etapa explícita posterior no frontend.
    // ─────────────────────────────────────────────────────────────────────
    createUser: protectedProcedure
      .input(z.object({
        username: z.string().min(3).max(64),
        email: z.string().email().optional(),
        name: z.string().min(1),
        password: z.string().min(6),
        role: z.enum(['admin_master', 'unit_admin', 'medico', 'viewer', 'operador', 'atendente', 'responsavel_financeiro']),
        groupKey: z.enum(['medicos', 'operadores', 'atendentes', 'visualizadores', 'responsaveisFinanceiros', 'administradoresUnidade', 'adminsMaster']),
        // Reforço 5.1 (parecer corretivo 2026-10-15): antes aceitava
        // z.array(z.number()) puro — decimais, negativos e IDs repetidos
        // passavam direto, e user_unit_permissions não tem índice único em
        // (user_id, unit_id), então um input malicioso/bugado como [20, 20]
        // gravaria duas permissões idênticas.
        unitIds: z.array(z.number().int().positive())
          .default([])
          .refine((arr) => new Set(arr).size === arr.length, {
            message: 'IDs de unidade duplicados na lista',
          }),
        isActive: z.boolean().default(true),
        expiration_date: z.string().optional().nullable(),
        // Bloqueio 2 (parecer de revisão 2026-10-15): a tela sempre mostrou
        // checkboxes editáveis de permissão por unidade (UserFormDialog),
        // mas até aqui a criação canônica os descartava e sempre aplicava a
        // matriz do grupo — um administrador podia desmarcar "Ver Estudos" e
        // a conta criada recebia o valor padrão do grupo mesmo assim. Esta
        // lista é OPCIONAL (back-compat com qualquer chamador direto que não
        // a envie): quando presente, precisa cobrir exatamente as mesmas
        // unidades de unitIds (nem menos, nem mais) e sobrepõe, unidade por
        // unidade, os toggles que a tela realmente exibe. manage_templates e
        // view_financial não têm controle na tela — vêm sempre da matriz do
        // grupo, com ou sem esta lista.
        permissions: z.array(z.object({
          unit_id: z.number().int().positive(),
          view_studies: z.boolean(),
          edit_reports: z.boolean(),
          view_anamnesis: z.boolean(),
          edit_anamnesis: z.boolean(),
          edit_exam_legend: z.boolean(),
          print_reports: z.boolean(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }

        if (ROLE_TO_GROUP_KEY[input.role] !== input.groupKey) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Combinação de papel e grupo incoerente' });
        }

        if (input.role !== 'admin_master' && input.unitIds.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Selecione ao menos uma unidade' });
        }

        if (ctx.user.role === 'unit_admin') {
          if (input.role === 'admin_master' || input.role === 'unit_admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin não pode criar administradores' });
          }
          // Bloqueio 1 (parecer de revisão 2026-10-15): um unit_admin de A
          // criando (ou "concedendo acesso a") um responsavel_financeiro
          // parecia seguro porque unitIds continha só A, dentro do escopo
          // dele — mas createUserTransactional reaproveita o responsável
          // ATIVO já existente da unidade, e esse responsável pode (e
          // frequentemente vai) também controlar outras unidades fora do
          // escopo desse unit_admin. O vínculo final é com o responsável,
          // não com "A apenas", e as guardas financeiras
          // (assertCanAccessFinancialUnit etc.) autorizam por responsável,
          // não por user_unit_permissions — então a nova conta herdaria
          // acesso a todas as unidades daquele responsável, não só a A. Até
          // existir um modelo de autorização conta-de-responsável × unidade,
          // só admin_master pode criar ou conceder acesso a
          // responsavel_financeiro.
          if (input.role === 'responsavel_financeiro') {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Unit admin não pode criar ou conceder acesso a responsável financeiro — essa conta pode herdar acesso a outras unidades do mesmo responsável. Apenas admin_master pode fazer isso.',
            });
          }
          if (input.unitIds.length !== 1) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unit admin deve criar o usuário em exatamente uma unidade' });
          }
          const targetUnitId = input.unitIds[0];
          const { getUserUnitPermission: getUnitPerm } = await import('../db');
          const hasAccess = ctx.user.unit_id === targetUnitId || !!(await getUnitPerm(ctx.user.id, targetUnitId));
          if (!hasAccess) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin não tem acesso a esta unidade' });
          }
        }

        // Reforço 5.1 (parecer corretivo 2026-10-15): confirmar que toda
        // unidade informada realmente existe, ANTES de qualquer escrita.
        // Roda DEPOIS do bloco de escopo acima de propósito: um unit_admin
        // sem acesso a uma unidade já recebe FORBIDDEN ali, sem que esta
        // checagem chegue a revelar se aquele ID sequer existe.
        if (input.unitIds.length > 0) {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
          const { units: unitsTable } = await import('../../drizzle/schema');
          const { inArray: inArrayOp } = await import('drizzle-orm');
          const existingUnits = await db
            .select({ id: unitsTable.id })
            .from(unitsTable)
            .where(inArrayOp(unitsTable.id, input.unitIds));
          const existingIds = new Set(existingUnits.map((u) => u.id));
          const missing = input.unitIds.filter((id) => !existingIds.has(id));
          if (missing.length > 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: `Unidade(s) inexistente(s): ${missing.join(', ')}` });
          }
        }

        // Bloqueio 2 (parecer de revisão 2026-10-15): se a tela enviou a
        // lista de permissões por unidade, ela precisa cobrir EXATAMENTE o
        // mesmo conjunto de unitIds — nem uma unidade sem entrada de
        // permissão correspondente, nem uma entrada "extra" apontando para
        // uma unidade fora de unitIds (isso contornaria a checagem de escopo
        // e de existência feitas acima a partir de unitIds).
        if (input.permissions && input.permissions.length > 0) {
          const sentUnitIds = new Set(input.permissions.map((p) => p.unit_id));
          const expectedUnitIds = new Set(input.unitIds);
          const sameSet =
            sentUnitIds.size === expectedUnitIds.size &&
            Array.from(sentUnitIds).every((id) => expectedUnitIds.has(id));
          if (!sameSet) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'As unidades em "permissions" precisam ser exatamente as mesmas de "unitIds"',
            });
          }
        }

        // Permissões: fonte de verdade é o banco (group_permission_configs);
        // fallback na constante hardcoded apenas se o banco estiver vazio.
        // Bloqueio 2 (parecer de revisão 2026-10-15): a matriz do grupo
        // preenche os valores iniciais e os dois campos sem controle na tela
        // (manage_templates, view_financial); quando a tela enviou toggles
        // individuais para uma unidade, eles sobrepõem os 6 campos que o
        // UserFormDialog realmente exibe para essa unidade.
        const groupPerms = await resolveGroupPermissions(input.groupKey as GroupKey);
        const permissionsByUnit: Record<number, {
          view_studies: boolean; edit_reports: boolean; view_anamnesis: boolean;
          edit_anamnesis: boolean; edit_exam_legend: boolean; print_reports: boolean;
          manage_templates: boolean; view_financial: boolean;
        }> = {};
        for (const unitId of input.unitIds) {
          const sent = input.permissions?.find((p) => p.unit_id === unitId);
          permissionsByUnit[unitId] = {
            view_studies:     sent ? sent.view_studies     : groupPerms.view_studies,
            edit_reports:     sent ? sent.edit_reports     : groupPerms.edit_reports,
            view_anamnesis:   sent ? sent.view_anamnesis   : groupPerms.view_anamnesis,
            edit_anamnesis:   sent ? sent.edit_anamnesis   : groupPerms.edit_anamnesis,
            edit_exam_legend: sent ? sent.edit_exam_legend : groupPerms.edit_exam_legend,
            print_reports:    sent ? sent.print_reports    : groupPerms.print_reports,
            manage_templates: groupPerms.manage_templates,
            view_financial:   groupPerms.view_financial,
          };
        }

        // Correção (parecer de revisão 2026-10-15, seção 5): validar
        // calendário real antes de persistir — ver parseStrictCalendarDate.
        const expirationDate = input.expiration_date
          ? parseStrictCalendarDate(input.expiration_date)
          : null;

        const password_hash = await bcrypt.hash(input.password, 12);
        const { createUserTransactional, UsernameTakenError, MixedFinancialResponsiblesError } = await import('../db');

        try {
          const { id } = await createUserTransactional({
            username: input.username,
            email: input.email,
            name: input.name,
            password_hash,
            role: input.role,
            groupKey: input.groupKey,
            unitIds: input.unitIds,
            isActive: input.isActive,
            expiration_date: expirationDate,
            permissionsByUnit,
            actor: {
              user_id: ctx.user.id,
              ip_address: ctx.req.ip,
              user_agent: ctx.req.headers['user-agent'] as string | undefined,
            },
          });
          return { success: true, id };
        } catch (err: any) {
          if (err instanceof UsernameTakenError || err?.message === 'USERNAME_TAKEN') {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Nome de usuário "${input.username}" já está em uso. Escolha outro.`,
            });
          }
          // Bloqueio 3 (parecer corretivo 2026-10-15): política explícita de
          // responsável financeiro multiunidade violada — nunca deixar isso
          // virar um erro de banco genérico para quem está preenchendo a tela.
          if (err instanceof MixedFinancialResponsiblesError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
          }
          throw err;
        }
      }),

    createUserScoped: protectedProcedure
      .input(z.object({
        username: z.string().min(3).max(64),
        email: z.string().email().optional(),
        name: z.string().min(1),
        password: z.string().min(6),
        role: z.enum(['medico', 'operador', 'atendente', 'viewer', 'responsavel_financeiro']),
        unitId: z.number().int().positive(),
        groupKey: z.enum(['medicos', 'operadores', 'atendentes', 'visualizadores', 'responsaveisFinanceiros', 'administradoresUnidade']),
      }))
      .mutation(async ({ input, ctx }) => {
        // Bloqueio de arquitetura (parecer de revisão 2026-10-15): este
        // endpoint legado NÃO é mais um segundo caminho de escrita paralelo.
        // Antes, ele chamava createLocalUser + um insert de permissões
        // separado + (se responsavel_financeiro) uma 3ª etapa que CAPTURAVA
        // e ENGOLIA qualquer falha da cadeia financeira
        // (`catch { console.error(...) }`), podendo devolver "sucesso" com
        // uma conta de responsável financeiro incompleta. Agora delega
        // integralmente para a MESMA rotina transacional
        // (createUserTransactional) e a MESMA política de autorização de
        // admin.createUser — inclusive a restrição do Bloqueio 1 (unit_admin
        // não pode criar/conceder responsavel_financeiro) e a política
        // explícita de multiunidade (aqui sempre 1 unidade, então nunca
        // aciona o caso misto). Mantido só por compatibilidade com um
        // eventual chamador direto via tRPC — a tela não o usa.
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }

        if (ROLE_TO_GROUP_KEY[input.role] !== input.groupKey) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Combinação de papel e grupo incoerente' });
        }

        if (ctx.user.role === 'unit_admin') {
          if (input.role === 'responsavel_financeiro') {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Unit admin não pode criar ou conceder acesso a responsável financeiro — essa conta pode herdar acesso a outras unidades do mesmo responsável. Apenas admin_master pode fazer isso.',
            });
          }
          const { getUserUnitPermission: getUnitPerm } = await import('../db');
          const hasAccess = ctx.user.unit_id === input.unitId || !!(await getUnitPerm(ctx.user.id, input.unitId));
          if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta unidade' });
        }

        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { units: unitsTable } = await import('../../drizzle/schema');
        const { eq: eqUnit } = await import('drizzle-orm');
        const existingUnit = await db.select({ id: unitsTable.id }).from(unitsTable).where(eqUnit(unitsTable.id, input.unitId));
        if (!existingUnit.some((u) => u.id === input.unitId)) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Unidade inexistente: ${input.unitId}` });
        }

        const groupPerms = await resolveGroupPermissions(input.groupKey as GroupKey);
        const password_hash = await bcrypt.hash(input.password, 12);
        const { createUserTransactional, UsernameTakenError, MixedFinancialResponsiblesError } = await import('../db');
        try {
          const { id } = await createUserTransactional({
            username: input.username,
            email: input.email,
            name: input.name,
            password_hash,
            role: input.role,
            groupKey: input.groupKey,
            unitIds: [input.unitId],
            isActive: true,
            permissionsByUnit: { [input.unitId]: groupPerms },
            actor: {
              user_id: ctx.user.id,
              ip_address: ctx.req.ip,
              user_agent: ctx.req.headers['user-agent'] as string | undefined,
            },
          });
          return { success: true, id };
        } catch (err: any) {
          if (err instanceof UsernameTakenError || err?.message === 'USERNAME_TAKEN') {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Nome de usuário "${input.username}" já está em uso. Escolha outro.`,
            });
          }
          if (err instanceof MixedFinancialResponsiblesError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
          }
          throw err;
        }
      }),

    linkExistingUserToUnitGroup: protectedProcedure
      .input(z.object({
        userId: z.number(),
        unitId: z.number(),
        groupKey: z.enum(['responsaveisFinanceiros', 'medicos', 'operadores', 'atendentes', 'visualizadores', 'administradoresUnidade', 'adminsMaster']),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        if (ctx.user.role === 'unit_admin') {
          const { getUserUnitPermission: getUnitPerm } = await import('../db');
          const hasAccess = ctx.user.unit_id === input.unitId || !!(await getUnitPerm(ctx.user.id, input.unitId));
          if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta unidade' });
          if (input.groupKey === 'adminsMaster') throw new TRPCError({ code: 'FORBIDDEN', message: 'Operação não permitida' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users: usersTable, user_unit_permissions: uup } = await import('../../drizzle/schema');
        const { eq: eqOp, and: andOp } = await import('drizzle-orm');
        const [targetUser] = await db.select().from(usersTable).where(eqOp(usersTable.id, input.userId));
        if (!targetUser) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' });
        const [existing] = await db.select().from(uup)
          .where(andOp(eqOp(uup.user_id, input.userId), eqOp(uup.unit_id, input.unitId)));
        // FIX Bug1: buscar permissões do banco em vez da constante hardcoded
        const dbGroupPerms2 = await getGroupPermissions();
        const dbPerm2 = dbGroupPerms2.find(p => p.group_key === input.groupKey);
        const perms = dbPerm2
          ? {
              view_studies:     dbPerm2.view_studies,
              edit_reports:     dbPerm2.edit_reports,
              view_anamnesis:   dbPerm2.view_anamnesis,
              edit_anamnesis:   dbPerm2.edit_anamnesis,
              edit_exam_legend: dbPerm2.edit_exam_legend,
              print_reports:    dbPerm2.print_reports,
              manage_templates: dbPerm2.manage_templates,
              view_financial:   (dbPerm2 as any).view_financial ?? false,
            }
          : GROUP_PERMISSIONS[input.groupKey as GroupKey];
        if (existing) {
          await db.update(uup).set({ ...perms, group_key: input.groupKey }).where(andOp(eqOp(uup.user_id, input.userId), eqOp(uup.unit_id, input.unitId)));
        } else {
          await db.insert(uup).values({ user_id: input.userId, unit_id: input.unitId, group_key: input.groupKey, ...perms });
        }
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: input.unitId,
          action: 'UPDATE_USER',
          target_type: 'USER',
          target_id: String(input.userId),
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        return { success: true, wasExisting: !!existing };
      }),

    listUsersWithPermissions: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { users: usersTable, units: unitsTable, user_unit_permissions } = await import('../../drizzle/schema');
        // F2-5: unit_admin só vê usuários das suas unidades
        const { eq: eqOp2, inArray: inArrayOp } = await import('drizzle-orm');
        let allUsers;
        if (ctx.user.role === 'unit_admin') {
          // Busca as unidades do unit_admin
          const myPerms = await db.select({ unit_id: user_unit_permissions.unit_id })
            .from(user_unit_permissions)
            .where(eqOp2(user_unit_permissions.user_id, ctx.user.id));
          const myUnitIds = myPerms.map(p => p.unit_id);
          if (ctx.user.unit_id && !myUnitIds.includes(ctx.user.unit_id)) {
            myUnitIds.push(ctx.user.unit_id);
          }
          if (myUnitIds.length === 0) return [];
          // Busca usuários que têm permissões nessas unidades
          const usersInMyUnits = await db
            .selectDistinct({ user_id: user_unit_permissions.user_id })
            .from(user_unit_permissions)
            .where(inArrayOp(user_unit_permissions.unit_id, myUnitIds));
          const userIds = usersInMyUnits.map(u => u.user_id);
          if (userIds.length === 0) return [];
          allUsers = await db.select().from(usersTable).where(inArrayOp(usersTable.id, userIds));
        } else {
          allUsers = await db.select().from(usersTable);
        }
        const allUnits = await db.select().from(unitsTable);
        const allPerms = await db.select().from(user_unit_permissions);
         return allUsers.map(u => ({
          ...u,
          unitName: allUnits.find(un => un.id === u.unit_id)?.name ?? null,
          permissions: allPerms.filter(p => p.user_id === u.id),
        }));
      }),

  // ─── Permissões de grupo (matriz) ────────────────────────────────────────────

  getGroupPermissions: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin_master') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return getGroupPermissions();
    }),

    setGroupPermissions: protectedProcedure
      .input(z.object({
      permissions: z.record(
        z.enum(['medicos', 'operadores', 'atendentes', 'visualizadores',
                'responsaveisFinanceiros', 'administradoresUnidade']),
        z.object({
          view_studies:     z.boolean(),
          edit_reports:     z.boolean(),
          view_anamnesis:   z.boolean(),
          edit_anamnesis:   z.boolean(),
          edit_exam_legend: z.boolean(),
          print_reports:    z.boolean(),
          manage_templates: z.boolean(),
          view_financial:   z.boolean(),
        })
      ),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin_master') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const entries = Object.entries(input.permissions) as [
        string,
        { view_studies: boolean; edit_reports: boolean; view_anamnesis: boolean;
          edit_anamnesis: boolean; edit_exam_legend: boolean; print_reports: boolean;
          manage_templates: boolean; view_financial: boolean; }
      ][];
      for (const [groupKey, perms] of entries) {
        await upsertGroupPermission(groupKey, { ...perms, manage_templates: false }, ctx.user.id);
      }
      await createAuditLog({
        user_id:     ctx.user.id,
        action:      'UPDATE_USER',
        target_type: 'GROUP_PERMISSIONS',
        target_id:   'all',
        ip_address:  ctx.req.ip,
        user_agent:  ctx.req.headers['user-agent'] as string | undefined,
        metadata:    { groups: Object.keys(input.permissions) },
      });
      return { success: true };
    }),
});
