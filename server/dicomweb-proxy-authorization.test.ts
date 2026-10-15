/**
 * CORREÇÃO DE SEGURANÇA (branch claude/seguranca-proxy-dicomweb-sem-autorizacao-por-estudo)
 * Revisão 1: parecer da Manus (RECOMENDACOES_CORRECAO_SEGURANCA_PROXY_DICOMWEB_2026-10-14.txt)
 * Revisão 2 (ESTE ARQUIVO): parecer corretivo da Manus, que REPROVOU o commit
 * 43d72a6 por uma vulnerabilidade crítica de travessia de caminho pós-UID
 * (BLOQUEIO 1), mais exposição residual de URL do Orthanc em getViewerUrl
 * (BLOQUEIO 2 — testado em server/pacs-viewer-url-security.test.ts), uma
 * guarda legada que podia bloquear admin_master/multiunidade sem unit_id
 * (BLOQUEIO 3 — idem), studyUid duplicado na query sendo ignorado e
 * URIError virando 502 em vez de 400 (BLOQUEIO 4), e recomendou usar o
 * cache de autorização já existente (assertCachedDicomFileAccess) no lugar
 * da chamada sem cache, por ser um endpoint de alto volume.
 *
 * Estes testes chamam as funções reais de server/dicomWebProxyAuthorization.ts
 * (não fazem grep de texto no arquivo), com dependências injetadas via mock,
 * provando o comportamento FAIL CLOSED exigido — inclusive os casos de
 * travessia de diretório que a Revisão 1 não cobria.
 */
import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  DicomWebRequestError,
  buildCanonicalWadoRsPath,
  isAllowedDicomWebMethod,
  parseDicomWebRequest,
  resolveAuthorizedDicomWebTarget,
  type DicomWebAuthDeps,
  type DicomWebAuthUser,
} from "../server/dicomWebProxyAuthorization";

const VALID_UID = "1.2.840.113619.2.55.3.604688119.868.1187175012.28";
const OTHER_UID = "1.2.3.4.5";
const SERIES_UID = "1.2.840.113619.2.55.3.111.222";
const INSTANCE_UID = "1.2.840.113619.2.55.3.111.333";

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

function expectDicomWebError(fn: () => unknown, status: 400 | 403 | 405 | 503) {
  try {
    fn();
    throw new Error("era esperado lançar DicomWebRequestError, mas não lançou");
  } catch (e) {
    expect(e).toBeInstanceOf(DicomWebRequestError);
    expect((e as DicomWebRequestError).status).toBe(status);
  }
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

describe("parseDicomWebRequest — formas WADO-RS aceitas (allowlist fechada)", () => {
  it("aceita /studies/<uid> (recurso do estudo)", () => {
    expect(parseDicomWebRequest(`/studies/${VALID_UID}`, {})).toEqual({
      studyUid: VALID_UID,
      kind: "study",
    });
  });

  it("aceita /studies/<uid>/metadata", () => {
    expect(parseDicomWebRequest(`/studies/${VALID_UID}/metadata`, {})).toEqual({
      studyUid: VALID_UID,
      kind: "study-metadata",
    });
  });

  it("aceita /studies/<uid>/series/<seriesUid>", () => {
    expect(parseDicomWebRequest(`/studies/${VALID_UID}/series/${SERIES_UID}`, {})).toEqual({
      studyUid: VALID_UID,
      kind: "series",
      seriesUid: SERIES_UID,
    });
  });

  it("aceita /studies/<uid>/series/<seriesUid>/metadata", () => {
    expect(parseDicomWebRequest(`/studies/${VALID_UID}/series/${SERIES_UID}/metadata`, {})).toEqual({
      studyUid: VALID_UID,
      kind: "series-metadata",
      seriesUid: SERIES_UID,
    });
  });

  it("aceita /studies/<uid>/series/<seriesUid>/instances/<instanceUid>", () => {
    expect(
      parseDicomWebRequest(`/studies/${VALID_UID}/series/${SERIES_UID}/instances/${INSTANCE_UID}`, {}),
    ).toEqual({
      studyUid: VALID_UID,
      kind: "instance",
      seriesUid: SERIES_UID,
      instanceUid: INSTANCE_UID,
    });
  });

  it("aceita .../instances/<instanceUid>/metadata e /rendered", () => {
    expect(
      parseDicomWebRequest(
        `/studies/${VALID_UID}/series/${SERIES_UID}/instances/${INSTANCE_UID}/metadata`,
        {},
      ),
    ).toMatchObject({ kind: "instance-metadata" });
    expect(
      parseDicomWebRequest(
        `/studies/${VALID_UID}/series/${SERIES_UID}/instances/${INSTANCE_UID}/rendered`,
        {},
      ),
    ).toMatchObject({ kind: "instance-rendered" });
  });

  it("aceita .../instances/<instanceUid>/frames/<lista>", () => {
    expect(
      parseDicomWebRequest(
        `/studies/${VALID_UID}/series/${SERIES_UID}/instances/${INSTANCE_UID}/frames/1,2,3`,
        {},
      ),
    ).toEqual({
      studyUid: VALID_UID,
      kind: "instance-frames",
      seriesUid: SERIES_UID,
      instanceUid: INSTANCE_UID,
      frameList: "1,2,3",
    });
  });

  it("aceita o formato legado por querystring (?studyUid=), sem segmento de caminho", () => {
    expect(parseDicomWebRequest("/", { studyUid: VALID_UID })).toEqual({
      studyUid: VALID_UID,
      kind: "study",
    });
  });

  it("aceita quando caminho e querystring trazem o MESMO UID", () => {
    expect(parseDicomWebRequest(`/studies/${VALID_UID}`, { studyUid: VALID_UID })).toMatchObject({
      studyUid: VALID_UID,
    });
  });
});

describe("parseDicomWebRequest — BLOQUEIO 1 (parecer corretivo): travessia de caminho pós-UID", () => {
  it("rejeita .../studies/<uid>/../../system (travessia literal)", () => {
    expectDicomWebError(() => parseDicomWebRequest(`/studies/${VALID_UID}/../../system`, {}), 400);
  });

  it("rejeita .../studies/<uid>/%2e%2e/%2e%2e/system (travessia percent-encoded)", () => {
    expectDicomWebError(
      () => parseDicomWebRequest(`/studies/${VALID_UID}/%2e%2e/%2e%2e/system`, {}),
      400,
    );
  });

  it("rejeita .../series/<seriesUid>/../../../../tools (travessia depois de um prefixo válido)", () => {
    expectDicomWebError(
      () => parseDicomWebRequest(`/studies/${VALID_UID}/series/${SERIES_UID}/../../../../tools`, {}),
      400,
    );
  });

  it("rejeita separador codificado sobrevivendo ao decode de um segmento (%2f, %5c)", () => {
    expectDicomWebError(() => parseDicomWebRequest(`/studies/${VALID_UID}/%2fsystem`, {}), 400);
    expectDicomWebError(() => parseDicomWebRequest(`/studies/${VALID_UID}/%5csystem`, {}), 400);
  });

  it("rejeita URI percent-encoded malformada sem deixar escapar um erro genérico (nunca 502)", () => {
    expectDicomWebError(() => parseDicomWebRequest(`/studies/${VALID_UID}/%`, {}), 400);
    expectDicomWebError(() => parseDicomWebRequest(`/studies/%E0%A4%A`, {}), 400);
  });

  it("rejeita qualquer sufixo que não esteja na allowlist (ex.: recurso inventado)", () => {
    expectDicomWebError(() => parseDicomWebRequest(`/studies/${VALID_UID}/system`, {}), 400);
    expectDicomWebError(() => parseDicomWebRequest(`/studies/${VALID_UID}/../system`, {}), 400);
  });

  it("a URL normalizada de destino para um caminho válido permanece sob o prefixo do estudo autorizado", () => {
    const parsed = parseDicomWebRequest(`/studies/${VALID_UID}/series/${SERIES_UID}/metadata`, {});
    const canonical = buildCanonicalWadoRsPath(parsed);
    expect(canonical.startsWith(`/studies/${encodeURIComponent(VALID_UID)}`)).toBe(true);
    expect(canonical).not.toContain("..");
  });

  it("reconstrói o caminho canônico sempre a partir da estrutura validada — nunca ecoa o caminho bruto recebido", () => {
    // Mesmo que o caminho de entrada tivesse barras duplicadas ou espaços
    // (que a allowlist já rejeita antes de chegar aqui), a reconstrução só
    // conhece os campos de ParsedWadoRsRequest, nunca a string de entrada.
    const parsed = parseDicomWebRequest(`/studies/${VALID_UID}`, {});
    expect(buildCanonicalWadoRsPath(parsed)).toBe(`/studies/${encodeURIComponent(VALID_UID)}`);
  });
});

describe("parseDicomWebRequest — rejeições gerais (UID ausente/malformado/ambíguo)", () => {
  it("rejeita requisição sem nenhum UID (ex.: QIDO-RS amplo)", () => {
    expectDicomWebError(() => parseDicomWebRequest("/studies", {}), 400);
  });

  it("rejeita UID malformado no path", () => {
    for (const bad of ["1 2 3", "ABC.123", "1..2"]) {
      expectDicomWebError(() => parseDicomWebRequest(`/studies/${encodeURIComponent(bad)}`, {}), 400);
    }
  });

  it("rejeita quando caminho e querystring trazem UIDs diferentes (ambíguo)", () => {
    expectDicomWebError(
      () => parseDicomWebRequest(`/studies/${VALID_UID}`, { studyUid: OTHER_UID }),
      400,
    );
  });
});

describe("parseDicomWebRequest — BLOQUEIO 4 (parecer corretivo): studyUid duplicado/malformado na query", () => {
  it("rejeita studyUid duplicado na querystring (array) mesmo com UID válido no path", () => {
    expectDicomWebError(
      () => parseDicomWebRequest(`/studies/${VALID_UID}`, { studyUid: [VALID_UID, OTHER_UID] }),
      400,
    );
  });

  it("rejeita studyUid duplicado (array, mesmo valor repetido) mesmo sem caminho", () => {
    expectDicomWebError(() => parseDicomWebRequest("/", { studyUid: [VALID_UID, VALID_UID] }), 400);
  });

  it("rejeita studyUid vazio ou de tipo inválido na querystring", () => {
    expectDicomWebError(() => parseDicomWebRequest(`/studies/${VALID_UID}`, { studyUid: "" }), 400);
    expectDicomWebError(() => parseDicomWebRequest(`/studies/${VALID_UID}`, { studyUid: { a: 1 } }), 400);
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
    expect(result.canonicalPath).toBe(`/studies/${encodeURIComponent(VALID_UID)}`);
    expect(deps.assertDicomFileAccess).toHaveBeenCalledWith(user, VALID_UID, "view_studies");
  });

  it("BLOQUEIO 1: nunca chama assertDicomFileAccess nem o destino quando o caminho tem travessia", async () => {
    const user = makeUser();
    const assertDicomFileAccess = vi.fn(async () => 20);
    const getUnitOrthancConfig = vi.fn(async () => ({ isActive: true, pacs_ip: "172.16.3.241" }));
    const deps = makeDeps({ assertDicomFileAccess, getUnitOrthancConfig });

    await expect(
      resolveAuthorizedDicomWebTarget(user, "GET", `/studies/${VALID_UID}/../../system`, {}, deps),
    ).rejects.toMatchObject({ status: 400 });

    expect(assertDicomFileAccess).not.toHaveBeenCalled();
    expect(getUnitOrthancConfig).not.toHaveBeenCalled();
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

describe("reaproveitamento real no handler do proxy (server/_core/index.ts)", () => {
  it("usa resolveAuthorizedDicomWebTarget, o cache de autorização (assertCachedDicomFileAccess) e target.canonicalPath — nunca req.path/req.url brutos nem fallback de 'qualquer unidade ativa'", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");

    expect(source).toContain('from "../dicomWebProxyAuthorization"');
    expect(source).toContain("resolveAuthorizedDicomWebTarget(");

    // RECOMENDAÇÃO DE DESEMPENHO (parecer corretivo): o proxy injeta a
    // versão COM cache (mesma semântica de autorização, TTL de 60s),
    // nunca a chamada direta sem cache — endpoint de alto volume.
    expect(source).toContain("assertDicomFileAccess: (user, studyUid, permission) => assertCachedDicomFileAccess(user, studyUid, permission)");

    const proxyBlockStart = source.indexOf("app.use('/api/dicomweb'");
    const proxyBlockEnd = source.indexOf("STREAMING PROGRESSIVO");
    const proxyBlock = source.slice(proxyBlockStart, proxyBlockEnd);

    // BLOQUEIO 1: a URL de destino usa target.canonicalPath, nunca
    // req.path/req.url brutos (que poderiam conter travessia).
    expect(proxyBlock).toContain("target.canonicalPath");
    expect(proxyBlock).not.toMatch(/dicom-web\$\{(targetPath|req\.path)\}/);

    // O antigo fallback "qualquer unidade ativa" (sem filtro de unitId) não existe mais nesta rota
    expect(proxyBlock).not.toContain("eq(units.isActive, true)");
    expect(proxyBlock).not.toContain("ORTHANC_BASE_URL");
  });
});
