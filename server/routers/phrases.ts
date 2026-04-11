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

});
