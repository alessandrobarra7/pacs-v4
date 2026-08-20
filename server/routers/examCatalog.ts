import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  listExamCatalog,
  removeExamCatalogPacsMapping,
  replaceExamCatalogDocuments,
  saveExamCatalogEntry,
  saveExamCatalogPacsMapping,
} from "../db";

const documentSchema = z.object({
  document_key: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i),
  document_label: z.string().trim().min(1).max(255),
  sort_order: z.number().int().min(0).max(10_000),
});

const mappingSchema = z.object({
  pacs_description: z.string().trim().min(1).max(255),
  modality: z.string().trim().max(20).default(""),
});

const catalogSchema = z.object({
  id: z.number().int().positive().optional(),
  exam_name: z.string().trim().min(1).max(255),
  modality: z.string().trim().min(1).max(20),
  bilateral: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(10_000).default(0),
  is_active: z.boolean().default(true),
  financial_event_count: z.number().int().min(1).max(20).default(1),
  documents: z.array(documentSchema).min(1).max(20),
  pacsMappings: z.array(mappingSchema).max(100).default([]),
});

function mappingKey(mapping: { pacs_description: string; modality: string }) {
  return `${mapping.modality.trim().toUpperCase()}\u0000${mapping.pacs_description.trim()}`;
}

function canonicalNameKey(name: string) {
  return name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR");
}

export const examCatalogRouter = router({
  /** Catálogo clínico global: leitura e manutenção exclusivas do administrador raiz. */
  list: adminProcedure.query(() => listExamCatalog(true)),

  /** Disponibiliza somente os documentos de um exame já escolhido pelo fluxo PACS. */
  documentsForExam: protectedProcedure
    .input(z.object({ examLegendId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const entry = (await listExamCatalog(false)).find((item) => item.id === input.examLegendId);
      return entry?.documents.filter((document) => document.is_active) ?? [];
    }),

  save: adminProcedure.input(catalogSchema).mutation(async ({ input, ctx }) => {
    const documentKeys = new Set<string>();
    for (const document of input.documents) {
      const key = document.document_key.trim().toLowerCase();
      if (documentKeys.has(key)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cada documento do exame deve possuir uma chave única." });
      }
      documentKeys.add(key);
    }

    const mappingKeys = new Set<string>();
    for (const mapping of input.pacsMappings) {
      const key = mappingKey(mapping);
      if (mappingKeys.has(key)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A mesma descrição PACS não pode ser mapeada duas vezes no exame." });
      }
      mappingKeys.add(key);
    }

    const canonicalName = canonicalNameKey(input.exam_name);
    const existingWithSameName = (await listExamCatalog(false)).find((entry) => (
      entry.id !== input.id && canonicalNameKey(entry.exam_name) === canonicalName
    ));
    if (existingWithSameName) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `A legenda canônica "${input.exam_name.trim()}" já existe no catálogo (ID ${existingWithSameName.id}). Use a legenda existente ou escolha outro nome.`,
      });
    }

    const examLegendId = await saveExamCatalogEntry({
      id: input.id,
      exam_name: input.exam_name,
      modality: input.modality.trim().toUpperCase(),
      bilateral: input.bilateral,
      sort_order: input.sort_order,
      is_active: input.is_active,
      financial_event_count: input.financial_event_count,
      created_by: ctx.user.id,
    });
    await replaceExamCatalogDocuments(
      examLegendId,
      input.documents.map((document) => ({
        document_key: document.document_key.trim().toLowerCase(),
        document_label: document.document_label.trim(),
        sort_order: document.sort_order,
      })),
      ctx.user.id,
    );
    for (const mapping of input.pacsMappings) {
      await saveExamCatalogPacsMapping({
        pacs_description: mapping.pacs_description.trim(),
        modality: mapping.modality.trim().toUpperCase(),
        exam_legend_id: examLegendId,
        created_by: ctx.user.id,
      });
    }
    return { success: true, id: examLegendId };
  }),

  removePacsMapping: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await removeExamCatalogPacsMapping(input.id);
      return { success: true };
    }),
});
