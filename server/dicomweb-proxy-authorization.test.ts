/**
 * CORREÇÃO DE SEGURANÇA (branch claude/seguranca-proxy-dicomweb-sem-autorizacao-por-estudo)
 * Parecer: RECOMENDACOES_CORRECAO_SEGURANCA_PROXY_DICOMWEB_2026-10-14.txt (Manus).
 *
 * Achado original: /api/dicomweb resolvia o Orthanc de destino pela unidade
 * DO USUÁRIO LOGADO, nunca checando se ele tinha permissão sobre o ESTUDO
 * pedido, e caía num fallback de "qualquer unidade ativa"/IP padrão quando a
 * unidade do usuário não tinha pacs_ip. Também expunha (via
 * pacs.getViewerUrl) uma URL direta e não autenticada do Orthanc ao
 * navegador quando orthanc_base_url estava configurado.
 *
 * Estes testes chamam as funções reais de server/dicomWebProxyAuthorization.ts
 * (não fazem grep de texto no arquivo), com dependências injetadas via mock,
 * provando o comportamento FAIL CLOSED exigido.
 */
import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  DicomWebRequestError,
  extractDicomWebStudyUid,
  isAllowedDicomWebMethod,
  resolveAuthorizedDicomWebTarget,
  type DicomWebAuthDeps,
  type DicomWebAuthUser,
} from "../server/dicomWebProxyAuthorization";

const VALID_UID = "1.2.840.113619.2.55.3.604688119.868.1187175012.28";
const OTHER_UID = "1.2.3.4.5";

function makeUser(overrides: Partial<DicomWebAuthUser> = {}): DicomWebAuthUser {
  return { id: 1, role: "medico", unit_id: 20, ...overrides };
}

function makeDeps(overrides: Partial<DicomWebAuthDeps> = {}): DicomWebAuthDeps {
  return {
    assertDicomFileAccess: vi.fn(async () => 20),
    getUnitOrthancConfig: vi.fn(async () => ({ isActive: true, pacs_ip: "172.16.3.241" })),
    orthancHttpPort: "8042",
    ...overrides,
  };
}

describe("isAllowedDicomWebMethod — F1-7 restrição de métodos", () => {
  it("aceita apenas GET e HEAD (case-insensitive)", () => {
    expect(isAllowedDicomWebMethod("GET")).toBe(true);
    expect(isAllowedDicomWebMethod("get")).toBe(true);
    expect(isAllowedDicomWebMethod("HEAD")).toBe(true);
  });

  it("rejeita métodos de escrita e qualquer outro verbo", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE"]) {
      expect(isAllowedDicomWebMethod(method)).toBe(false);
    }
  });
});

describe("extractDicomWebStudyUid — somente os 2 formatos documentados", () => {
  it("extrai o UID do formato WADO-RS por caminho (/studies/<uid>)", () => {
    expect(extractDicomWebStudyUid(`/studies/${VALID_UID}`, {})).toBe(VALID_UID);
    expect(extractDicomWebStudyUid(`/studies/${VALID_UID}/series`, {})).toBe(VALID_UID);
  });

  it("extrai o UID do formato legado por querystring (?studyUid=)", () => {
    expect(extractDicomWebStudyUid("/", { studyUid: VALID_UID })).toBe(VALID_UID);
  });

  it("rejeita requisição sem nenhum UID (ex.: QIDO-RS amplo)", () => {
    expect(() => extractDicomWebStudyUid("/studies", {})).toThrow(DicomWebRequestError);
    try {
      extractDicomWebStudyUid("/studies", {});
    } catch (e) {
      expect(e).toBeInstanceOf(DicomWebRequestError);
      expect((e as DicomWebRequestError).status).toBe(400);
    }
  });

  it("rejeita UID malformado (traversal, espaços, caracteres inválidos)", () => {
    for (const bad of ["../../etc", "1 2 3", "ABC.123", "1..2", ""]) {
      expect(() => extractDicomWebStudyUid(`/studies/${encodeURIComponent(bad)}`, {})).toThrow(
        DicomWebRequestError,
      );
    }
  });

  it("rejeita quando caminho e querystring trazem UIDs diferentes (ambíguo)", () => {
    expect(() =>
      extractDicomWebStudyUid(`/studies/${VALID_UID}`, { studyUid: OTHER_UID }),
    ).toThrow(DicomWebRequestError);
  });

  it("aceita quando caminho e querystring trazem o MESMO UID", () => {
    expect(extractDicomWebStudyUid(`/studies/${VALID_UID}`, { studyUid: VALID_UID })).toBe(VALID_UID);
  });

  it("rejeita studyUid duplicado na querystring (array)", () => {
    expect(() => extractDicomWebStudyUid("/", { studyUid: [VALID_UID, OTHER_UID] })).toThrow(
      DicomWebRequestError,
    );
  });
});

describe("resolveAuthorizedDicomWebTarget — FAIL CLOSED por estudo", () => {
  it("resolve a unidade pelo ESTUDO (assertDicomFileAccess), não pelo usuário logado", async () => {
    const user = makeUser({ unit_id: 999 }); // unidade do usuário é outra
    const deps = makeDeps({ assertDicomFileAccess: vi.fn(async () => 20) }); // mas o estudo pertence à 20

    const result = await resolveAuthorizedDicomWebTarget(
      user,
      "GET",
      `/studies/${VALID_UID}`,
      {},
      deps,
    );

    expect(result.unitId).toBe(20);
    expect(result.orthancBaseUrl).toBe("http://172.16.3.241:8042");
    expect(deps.assertDicomFileAccess).toHaveBeenCalledWith(user, VALID_UID, "view_studies");
  });

  it("rejeita (403) quando assertDicomFileAccess nega acesso ao estudo", async () => {
    const user = makeUser();
    const deps = makeDeps({
      assertDicomFileAccess: vi.fn(async () => {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para acessar exames desta unidade." });
      }),
    });

    await expect(
      resolveAuthorizedDicomWebTarget(user, "GET", `/studies/${VALID_UID}`, {}, deps),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejeita (403) quando o estudo é órfão (sem unidade conhecida)", async () => {
    const user = makeUser();
    const deps = makeDeps({
      assertDicomFileAccess: vi.fn(async () => {
        throw new TRPCError({ code: "FORBIDDEN", message: "Exame não vinculado a nenhuma unidade conhecida." });
      }),
    });

    await expect(
      resolveAuthorizedDicomWebTarget(user, "GET", `/studies/${VALID_UID}`, {}, deps),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("FAIL CLOSED (503): nunca cai para 'qualquer unidade ativa' quando a unidade do estudo não tem pacs_ip", async () => {
    const user = makeUser();
    const getUnitOrthancConfig = vi.fn(async () => ({ isActive: true, pacs_ip: null }));
    const deps = makeDeps({ getUnitOrthancConfig });

    await expect(
      resolveAuthorizedDicomWebTarget(user, "GET", `/studies/${VALID_UID}`, {}, deps),
    ).rejects.toMatchObject({ status: 503 });

    // Nunca deve ter sido chamado com um unitId diferente do resolvido pelo estudo (sem fallback "any unit")
    expect(getUnitOrthancConfig).toHaveBeenCalledTimes(1);
    expect(getUnitOrthancConfig).toHaveBeenCalledWith(20);
  });

  it("FAIL CLOSED (503): unidade inativa também não resolve Orthanc", async () => {
    const user = makeUser();
    const deps = makeDeps({
      getUnitOrthancConfig: vi.fn(async () => ({ isActive: false, pacs_ip: "172.16.3.241" })),
    });

    await expect(
      resolveAuthorizedDicomWebTarget(user, "GET", `/studies/${VALID_UID}`, {}, deps),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("FAIL CLOSED (503): unidade inexistente (null) não resolve Orthanc", async () => {
    const user = makeUser();
    const deps = makeDeps({ getUnitOrthancConfig: vi.fn(async () => null) });

    await expect(
      resolveAuthorizedDicomWebTarget(user, "GET", `/studies/${VALID_UID}`, {}, deps),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("rejeita (405) método de escrita antes de qualquer chamada de autorização", async () => {
    const user = makeUser();
    const assertDicomFileAccess = vi.fn(async () => 20);
    const deps = makeDeps({ assertDicomFileAccess });

    await expect(
      resolveAuthorizedDicomWebTarget(user, "POST", `/studies/${VALID_UID}`, {}, deps),
    ).rejects.toMatchObject({ status: 405 });

    // F1-8 / fail-fast: nem chega a consultar autorização para um método não permitido
    expect(assertDicomFileAccess).not.toHaveBeenCalled();
  });

  it("rejeita (400) antes de chamar o banco quando o UID é inválido/ausente", async () => {
    const user = makeUser();
    const assertDicomFileAccess = vi.fn(async () => 20);
    const getUnitOrthancConfig = vi.fn(async () => ({ isActive: true, pacs_ip: "172.16.3.241" }));
    const deps = makeDeps({ assertDicomFileAccess, getUnitOrthancConfig });

    await expect(
      resolveAuthorizedDicomWebTarget(user, "GET", "/studies", {}, deps),
    ).rejects.toMatchObject({ status: 400 });

    expect(assertDicomFileAccess).not.toHaveBeenCalled();
    expect(getUnitOrthancConfig).not.toHaveBeenCalled();
  });
});

describe("reaproveitamento real de assertDicomFileAccess no proxy (server/_core/index.ts)", () => {
  it("o handler de /api/dicomweb usa resolveAuthorizedDicomWebTarget e assertDicomFileAccess, sem fallback de 'qualquer unidade ativa'", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");

    expect(source).toContain('from "../dicomWebProxyAuthorization"');
    expect(source).toContain("resolveAuthorizedDicomWebTarget(");
    expect(source).toContain("assertDicomFileAccess: (user, studyUid, permission) => assertDicomFileAccess(user, studyUid, permission)");

    // O antigo fallback "qualquer unidade ativa" (sem filtro de unitId) não existe mais nesta rota
    const proxyBlockStart = source.indexOf("app.use('/api/dicomweb'");
    const proxyBlockEnd = source.indexOf("STREAMING PROGRESSIVO");
    const proxyBlock = source.slice(proxyBlockStart, proxyBlockEnd);
    expect(proxyBlock).not.toContain("eq(units.isActive, true)");
    expect(proxyBlock).not.toContain("ORTHANC_BASE_URL");
  });
});
