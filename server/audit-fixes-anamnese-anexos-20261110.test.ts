/**
 * CORREÇÃO (auditoria-seguranca-rbac-pacs-financeiro-storage-20261110):
 * cobre os 3 achados da auditoria de segurança sobre anamnesisSimple.ts,
 * annotations.ts e audioReports.ts.
 *
 * Achado 1 (MÉDIO) — anamnesisSimple.getStatusBatch tinha um fallback de
 * autorização mais fraco que assertDicomFileAccess (usado por getByStudy/save
 * no mesmo arquivo): para um estudo "órfão" (sem linha em study_metadata),
 * getStudyUnitId devolvia null e o código caía para `input.unitId`
 * (fornecido pelo CLIENTE) ou para a unidade do próprio usuário como base de
 * autorização, em vez de negar por padrão. Isso permitia descobrir, para
 * estudos de outra unidade, se existe anamnese registrada (vazamento
 * booleano cross-unidade). A correção substitui essa resolução por
 * resolveStudyUnitIdForStatusBatch, que consulta studies_cache e depois
 * study_metadata (mesma ordem de assertDicomFileAccess) e nunca cai para
 * input.unitId nem para a unidade do usuário.
 *
 * O teste abaixo é comportamental (não lê texto-fonte): mocka getDb() para
 * simular um estudo órfão (sem linha em studies_cache NEM em study_metadata)
 * e mocka canAccessUnit() para sempre devolver true — ou seja, se o código
 * ainda caísse para input.unitId (fornecido pelo cliente) como base de
 * autorização, a checagem de permissão passaria e a rota chegaria a consultar
 * a tabela anamnesis_simple. Com a correção aplicada, a ausência de unidade
 * resolvida por studies_cache/study_metadata precisa impedir que a rota
 * chegue a consultar anamnesis_simple, independentemente do input.unitId do
 * cliente e independentemente do que canAccessUnit() devolveria.
 *
 * Achados 2 e 3 (auditoria dos mesmos 3 arquivos) são cobertos como testes de
 * wiring (leitura do código-fonte), documentados em cada `it`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { TrpcContext } from "./_core/context";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createCtx(overrides: Partial<AuthenticatedUser> & { unit_id?: number | null }): TrpcContext {
  const user: AuthenticatedUser = {
    id: overrides.id ?? 501,
    openId: overrides.openId ?? "test-user-anamnese-anexos",
    email: overrides.email ?? "test-anamnese-anexos@pacs.com",
    name: overrides.name ?? "Test User",
    loginMethod: "local",
    role: overrides.role ?? "medico",
    unit_id: overrides.unit_id ?? null,
    isActive: overrides.isActive ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: {
      protocol: "https",
      headers: { "user-agent": "vitest" },
      ip: "127.0.0.1",
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

/**
 * Promise que também aceita `.limit(n)` como se fosse parte da chain do
 * drizzle (`.where(...).limit(1)`), resolvendo para o mesmo array em
 * qualquer um dos dois usos (`await ...where(...)` direto, ou
 * `await ...where(...).limit(1)`).
 */
function awaitableWithLimit<T>(rows: T[]): Promise<T[]> & { limit: (n: number) => Promise<T[]> } {
  const p = Promise.resolve(rows) as Promise<T[]> & { limit: (n: number) => Promise<T[]> };
  p.limit = (_n: number) => Promise.resolve(rows);
  return p;
}

/**
 * Fake de `db` suficiente para exercitar resolveStudyUnitIdForStatusBatch
 * (studies_cache -> study_metadata) e a consulta final em anamnesis_simple,
 * sem depender de nenhuma conexão real com banco. Identifica a tabela pela
 * referência de objeto real exportada por drizzle/schema (não mockamos esse
 * módulo), então funciona tanto com o código corrigido quanto com o código
 * revertido (ambos importam os mesmos objetos de tabela).
 */
function makeFakeDb(opts: {
  studiesCacheTable: unknown;
  studyMetadataTable: unknown;
  anamnesisSimpleTable: unknown;
  cacheRows: Array<{ unit_id: number | null }>;
  metaRows: Array<{ unit_id: number | null }>;
  anamnesisRows: Array<{ study_instance_uid: string }>;
  onAnamnesisQuery: () => void;
}) {
  return {
    select(_cols: unknown) {
      return {
        from(table: unknown) {
          return {
            where(_cond: unknown) {
              if (table === opts.studiesCacheTable) return awaitableWithLimit(opts.cacheRows);
              if (table === opts.studyMetadataTable) return awaitableWithLimit(opts.metaRows);
              if (table === opts.anamnesisSimpleTable) {
                opts.onAnamnesisQuery();
                return Promise.resolve(opts.anamnesisRows);
              }
              // Tabela inesperada: falha alto (não devolve [] silenciosamente),
              // para não mascarar um bug de correspondência de tabela no teste.
              throw new Error("FakeDb: tabela inesperada em select().from()");
            },
          };
        },
      };
    },
  };
}

describe("Achado 1 — anamnesisSimple.getStatusBatch não usa input.unitId (cliente) como base de autorização para estudo órfão", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("./db");
    vi.doUnmock("./authorization");
    vi.resetModules();
  });

  it("estudo órfão (sem studies_cache nem study_metadata): nega acesso mesmo com input.unitId do cliente e canAccessUnit sempre true", async () => {
    // Importar o schema DEPOIS do vi.resetModules() (feito no beforeEach) garante
    // que as referências de tabela usadas aqui são as MESMAS instâncias que o
    // código da rota vai obter ao fazer `await import("../../drizzle/schema")" —
    // caso contrário, a comparação por identidade de objeto no FakeDb falharia
    // silenciosamente (cairia sempre no branch "tabela inesperada").
    const { studies_cache, study_metadata, anamnesis_simple } = await import("../drizzle/schema");
    let anamnesisQueried = false;
    const fakeDb = makeFakeDb({
      studiesCacheTable: studies_cache,
      studyMetadataTable: study_metadata,
      anamnesisSimpleTable: anamnesis_simple,
      cacheRows: [],
      metaRows: [],
      anamnesisRows: [{ study_instance_uid: "1.2.840.99991.1" }],
      onAnamnesisQuery: () => {
        anamnesisQueried = true;
      },
    });

    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        getDb: vi.fn(async () => fakeDb as any),
      };
    });
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return {
        ...original,
        // Simula um usuário que TEM permissão view_anamnesis em QUALQUER
        // unidade perguntada — inclusive na unidade enviada pelo cliente.
        // Se a rota ainda caísse para input.unitId, este mock faria a
        // checagem de permissão passar.
        canAccessUnit: vi.fn(async () => true),
      };
    });

    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 501, role: "medico", unit_id: 10 });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.anamnesisSimple.getStatusBatch({
      studyInstanceUids: ["1.2.840.99991.1"],
      // unidade fornecida pelo CLIENTE — unidade "atacante", diferente da
      // unidade real (desconhecida/órfã) do estudo.
      unitId: 999,
    });

    expect(result["1.2.840.99991.1"]).toBe(false);
    // Prova central do Achado 1: com a unidade do estudo não resolvida por
    // nenhuma fonte confiável (studies_cache/study_metadata), a rota NUNCA
    // deve chegar a consultar anamnesis_simple — isso só acontece se ela
    // caiu para o input.unitId do cliente (ou unidade do usuário) como base
    // de autorização, que é exatamente o bug do Achado 1.
    expect(anamnesisQueried).toBe(false);
  });

  it("estudo com unidade resolvida via studies_cache: concede/nega conforme canAccessUnit, usando a unidade REAL (não a do cliente)", async () => {
    const { studies_cache, study_metadata, anamnesis_simple } = await import("../drizzle/schema");
    let queriedAnamnesisUnitIdCheckedFor: number | null = null;
    const fakeDb = makeFakeDb({
      studiesCacheTable: studies_cache,
      studyMetadataTable: study_metadata,
      anamnesisSimpleTable: anamnesis_simple,
      cacheRows: [{ unit_id: 42 }],
      metaRows: [],
      anamnesisRows: [{ study_instance_uid: "1.2.840.99992.1" }],
      onAnamnesisQuery: () => {},
    });

    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return { ...original, getDb: vi.fn(async () => fakeDb as any) };
    });
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return {
        ...original,
        canAccessUnit: vi.fn(async (_user: unknown, unitId: number) => {
          queriedAnamnesisUnitIdCheckedFor = unitId;
          // só autoriza a unidade REAL do estudo (42), nunca a do cliente (999)
          return unitId === 42;
        }),
      };
    });

    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 502, role: "medico", unit_id: 10 });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.anamnesisSimple.getStatusBatch({
      studyInstanceUids: ["1.2.840.99992.1"],
      unitId: 999, // unidade do cliente, deve ser ignorada
    });

    expect(queriedAnamnesisUnitIdCheckedFor).toBe(42);
    expect(result["1.2.840.99992.1"]).toBe(true);
  });
});

describe("Achado 2 — auditoria em escrita de anotações/anexos/áudio (teste de wiring)", () => {
  it("annotations.ts: save, delete, upload e deleteAttachment chamam createAuditLog; list/getByStudy/getAttachmentsStatusBatch não precisam", async () => {
    const source = await fs.readFile(path.resolve(__dirname, "routers", "annotations.ts"), "utf8");
    expect(source).toContain('import { getDb, getAnnotationsByStudy, upsertAnnotation, deleteAnnotation, createAuditLog } from "../db";');

    const saveStart = source.indexOf("save: protectedProcedure");
    const deleteStart = source.indexOf("delete: protectedProcedure");
    const listStart = source.indexOf("list: protectedProcedure");
    const uploadStart = source.indexOf("upload: protectedProcedure");
    const deleteAttachmentStart = source.indexOf("deleteAttachment: protectedProcedure");

    const saveSection = source.slice(saveStart, deleteStart);
    const deleteSection = source.slice(deleteStart, listStart);
    const uploadSection = source.slice(uploadStart, deleteAttachmentStart);
    const deleteAttachmentSection = source.slice(deleteAttachmentStart);

    expect(saveSection).toContain("await createAuditLog(");
    expect(deleteSection).toContain("await createAuditLog(");
    expect(uploadSection).toContain("await createAuditLog(");
    expect(deleteAttachmentSection).toContain("await createAuditLog(");

    // unit_id da auditoria deve vir do estudo (assertDicomFileAccess), não do ator
    expect(saveSection).toMatch(/const unitId = await assertDicomFileAccess[\s\S]*unit_id:\s*unitId/);
    expect(uploadSection).toMatch(/const unitId = await assertDicomFileAccess[\s\S]*unit_id:\s*unitId/);
    expect(deleteAttachmentSection).toMatch(/const unitId = await assertDicomFileAccess[\s\S]*unit_id:\s*unitId/);
  });

  it("audioReports.ts: upload e delete chamam createAuditLog com unit_id do estudo; list/getStatusBatch não precisam", async () => {
    const source = await fs.readFile(path.resolve(__dirname, "routers", "audioReports.ts"), "utf8");
    expect(source).toContain('import { getDb, createAuditLog } from "../db";');

    const uploadStart = source.indexOf("upload: protectedProcedure");
    const deleteStart = source.indexOf("delete: protectedProcedure");
    const uploadSection = source.slice(uploadStart, deleteStart);
    const deleteSection = source.slice(deleteStart);

    expect(uploadSection).toContain("await createAuditLog(");
    expect(deleteSection).toContain("await createAuditLog(");
    expect(uploadSection).toMatch(/const unitId = await assertDicomFileAccess[\s\S]*unit_id:\s*unitId/);
    expect(deleteSection).toMatch(/const unitId = await assertDicomFileAccess[\s\S]*unit_id:\s*unitId/);
  });
});

describe("Achado 3 — annotations.delete revalida acesso ao estudo antes de excluir (teste de wiring + comportamental)", () => {
  it("fonte: delete busca o studyInstanceUid real da anotação (restrito a user_id) e chama assertDicomFileAccess antes de deleteAnnotation", async () => {
    const source = await fs.readFile(path.resolve(__dirname, "routers", "annotations.ts"), "utf8");
    const deleteStart = source.indexOf("delete: protectedProcedure");
    const listStart = source.indexOf("list: protectedProcedure");
    const deleteSection = source.slice(deleteStart, listStart);

    expect(deleteSection).toContain("dicom_annotations.user_id, ctx.user.id");
    const assertIdx = deleteSection.indexOf("assertDicomFileAccess(ctx.user, existing.study_instance_uid");
    const deleteAnnotationIdx = deleteSection.indexOf("await deleteAnnotation(input.annotationUid, ctx.user.id);");
    expect(assertIdx).toBeGreaterThan(-1);
    expect(deleteAnnotationIdx).toBeGreaterThan(-1);
    expect(assertIdx).toBeLessThan(deleteAnnotationIdx);
  });

  it("comportamental: delete nega a exclusão (e não chama deleteAnnotation) quando o usuário perdeu acesso ao estudo", async () => {
    vi.resetModules();
    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      const fakeDb = {
        select(_cols: unknown) {
          return {
            from(_table: unknown) {
              return {
                where(_cond: unknown) {
                  const p = Promise.resolve([{ study_instance_uid: "1.2.840.ANNOT.1" }]);
                  (p as any).limit = () => Promise.resolve([{ study_instance_uid: "1.2.840.ANNOT.1" }]);
                  return p;
                },
              };
            },
          };
        },
      };
      return {
        ...original,
        getDb: vi.fn(async () => fakeDb as any),
        deleteAnnotation: vi.fn(async () => {
          throw new Error("deleteAnnotation não deveria ter sido chamado sem acesso ao estudo");
        }),
      };
    });
    vi.doMock("./authorization", async (importOriginal) => {
      const original = await importOriginal<typeof import("./authorization")>();
      return {
        ...original,
        assertDicomFileAccess: vi.fn(async () => {
          const { TRPCError } = await import("@trpc/server");
          throw new TRPCError({ code: "FORBIDDEN", message: "sem acesso à unidade do estudo" });
        }),
      };
    });

    const { appRouter } = await import("./routers");
    const ctx = createCtx({ id: 503, role: "medico", unit_id: 10 });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.annotations.delete({ annotationUid: "annot-uid-1" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    vi.doUnmock("./db");
    vi.doUnmock("./authorization");
    vi.resetModules();
  });
});
