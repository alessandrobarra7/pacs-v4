import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";

export const phrasesRouter = router({
    listGroups: protectedProcedure.query(async ({ ctx }) => {
      const { listPhraseGroups } = await import('../db');
      return listPhraseGroups(ctx.user.id);
    }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const { listPhrases } = await import('../db');
      return listPhrases(ctx.user.id);
    }),

    createGroup: protectedProcedure
      .input(z.object({ name: z.string().min(1), color: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { createPhraseGroup } = await import('../db');
        return createPhraseGroup({ name: input.name, color: input.color, userId: ctx.user.id });
      }),

    create: protectedProcedure
      .input(z.object({ groupId: z.number(), content: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const { createPhrase } = await import('../db');
        return createPhrase({ groupId: input.groupId, userId: ctx.user.id, content: input.content });
      }),

    delete: protectedProcedure
      .input(z.object({ phraseId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deletePhrase } = await import('../db');
        await deletePhrase(input.phraseId, ctx.user.id);
        return { success: true };
      }),

    toggleFavorite: protectedProcedure
      .input(z.object({ phraseId: z.number(), isFavorite: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const { togglePhrasesFavorite } = await import('../db');
        await togglePhrasesFavorite(input.phraseId, ctx.user.id, input.isFavorite);
        return { success: true };
      }),

    /** Cria uma cópia pessoal de uma frase global para o usuário logado */
    saveAsMyPhrase: protectedProcedure
      .input(z.object({ phraseId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('../db');
        const { phrases } = await import('../../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        const [original] = await db.select().from(phrases).where(eq(phrases.id, input.phraseId)).limit(1);
        if (!original || !original.is_global) throw new Error('Frase não encontrada ou não é global');
        const [result] = await db.insert(phrases).values({
          group_id: original.group_id,
          user_id: ctx.user.id,
          content: original.content,
          is_global: false,
          is_favorite: false,
          isActive: true,
        });
        return { id: (result as any).insertId };
      }),

    /** Exclui um grupo pessoal do usuário (não pode excluir grupos globais) */
    deleteGroup: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('../db');
        const { phrase_groups } = await import('../../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        await db.update(phrase_groups)
          .set({ isActive: false })
          .where(and(
            eq(phrase_groups.id, input.groupId),
            eq(phrase_groups.created_by_user_id, ctx.user.id),
          ));
        return { success: true };
      }),

});
