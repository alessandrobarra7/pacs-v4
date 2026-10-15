/**
 * CORREÇÃO DE SEGURANÇA (branch claude/seguranca-proxy-dicomweb-sem-autorizacao-por-estudo)
 * Revisão 1: parecer da Manus (RECOMENDACOES_CORRECAO_SEGURANCA_PROXY_DICOMWEB_2026-10-14.txt)
 * Revisão 2 (ESTE ARQUIVO): parecer corretivo da Manus
 * ("Parecer corretivo — proxy DICOMweb por estudo.md", 14/10/2026, REPROVADO
 * para merge no commit 43d72a6), que encontrou uma vulnerabilidade crítica
 * residual na Revisão 1 — ver BLOQUEIO 1 abaixo — e mais 3 bloqueios/ajustes.
 *
 * Funções puras e injetáveis que decidem SE e PARA ONDE uma requisição
 * /api/dicomweb/* pode ser encaminhada. Nenhuma delas toca Express, fetch ou
 * o banco diretamente — tudo é injetado via `DicomWebAuthDeps`, o que permite
 * testar o comportamento real (não apenas grep de texto no arquivo).
 *
 * Problema original (server/_core/index.ts, rota '/api/dicomweb'):
 * - A unidade usada para montar a URL do Orthanc vinha de `dicomUser.unit_id`
 *   (o usuário logado), nunca do estudo pedido (`studyUid`) — ou seja, a
 *   permissão nunca era checada por estudo, só "o usuário está logado".
 * - Quando a unidade do usuário não tinha `pacs_ip`, o código caía num
 *   fallback que buscava "qualquer unidade ativa" (sem filtro de unidade) e,
 *   na ausência de qualquer unidade com `pacs_ip`, usava `ORTHANC_BASE_URL`/IP
 *   fixo — nunca falhando fechado.
 *
 * BLOQUEIO 1 (parecer corretivo, crítico): a Revisão 1 validava somente o
 * primeiro segmento do caminho (`/studies/<uid>`) e aceitava qualquer sufixo
 * sem allowlist, concatenando-o cru na URL de destino. Um caminho como
 * `/studies/<uid-autorizado>/../../system` (ou a forma percent-encoded
 * `%2e%2e`) tem o UID inicial autorizado, mas o sufixo podia escapar do
 * prefixo `/dicom-web/studies/<uid>` depois de normalizado pelo `fetch`,
 * alcançando outros recursos do Orthanc da unidade. A correção abaixo NUNCA
 * concatena o sufixo bruto: cada segmento do caminho é decodificado
 * individualmente e comparado contra uma allowlist fechada de formas WADO-RS
 * (estudo, metadados, série, instância, frames, rendered); qualquer forma
 * fora da allowlist, qualquer segmento "." ou ".." (decodificado ou não),
 * barra/barra-invertida sobrevivente ao decode, ou erro de decodificação
 * (URI malformada) é rejeitado com 400 ANTES de qualquer chamada de
 * autorização ou de rede. A URL de destino é SEMPRE reconstruída a partir da
 * estrutura validada (nunca do caminho bruto recebido), então não há como o
 * destino final sair do prefixo do estudo autorizado.
 *
 * Esta correção reaproveita `assertDicomFileAccess`/`assertCachedDicomFileAccess`
 * (server/authorization.ts), as mesmas funções já usadas por
 * /api/dicom-cache-status, /api/dicom-files e /api/dicom-stream: elas
 * resolvem a unidade REAL dona do estudo a partir de
 * studies_cache/study_metadata (nunca do usuário) e negam acesso (FORBIDDEN)
 * se o usuário não tiver permissão nessa unidade.
 */

export class DicomWebRequestError extends Error {
  constructor(
    public readonly status: 400 | 403 | 405 | 503,
    message: string,
  ) {
    super(message);
    this.name = "DicomWebRequestError";
  }
}

/** Métodos aceitos pelo proxy após autorização. Qualquer outro → 405. */
const ALLOWED_METHODS = new Set(["GET", "HEAD"]);

export function isAllowedDicomWebMethod(method: string): boolean {
  return ALLOWED_METHODS.has(method.toUpperCase());
}

/** Mesmo padrão de UID aceito em todo o resto do sistema (routerUtils.ts). Vale para StudyInstanceUID, SeriesInstanceUID e SOPInstanceUID (todos são UIDs DICOM no mesmo formato). */
const DICOM_UID_PATTERN = /^[0-9]+(?:\.[0-9]+)*$/;

/** Lista de números de frame separados por vírgula, como o WADO-RS exige em .../frames/1,2,3 */
const FRAME_LIST_PATTERN = /^[1-9][0-9]*(?:,[1-9][0-9]*)*$/;

function isValidDicomUid(value: string): boolean {
  return value.length > 0 && value.length <= 64 && DICOM_UID_PATTERN.test(value);
}

function firstQueryValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") {
    return value[0];
  }
  return null;
}

/**
 * BLOQUEIO 1 (parecer corretivo): decodifica UM segmento de caminho de forma
 * estrita. Lança 400 (nunca deixa um URIError genérico escapar como 502) se:
 * - a decodificação falhar (percent-encoding malformado, ex.: "%2");
 * - o resultado for vazio, "." ou ".." (cobre tanto o literal quanto a forma
 *   percent-encoded "%2e"/"%2e%2e", já que o decode normaliza isso antes da
 *   comparação);
 * - o resultado ainda contiver "/" ou "\" (ex.: "%2f", "%5c") — um separador
 *   que sobrevive ao decode de UM segmento é sempre uma tentativa de injetar
 *   um segmento extra que a allowlist abaixo não viu.
 */
function decodeSegmentStrict(rawSegment: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawSegment);
  } catch {
    throw new DicomWebRequestError(400, "Caminho da requisição DICOMweb inválido.");
  }
  if (decoded.length === 0 || decoded === "." || decoded === "..") {
    throw new DicomWebRequestError(400, "Caminho da requisição DICOMweb inválido.");
  }
  if (decoded.includes("/") || decoded.includes("\\")) {
    throw new DicomWebRequestError(400, "Caminho da requisição DICOMweb inválido.");
  }
  return decoded;
}

/** As únicas formas WADO-RS que este proxy encaminha, depois do UID do estudo. */
export type WadoRsResourceKind =
  | "study"
  | "study-metadata"
  | "series"
  | "series-metadata"
  | "instance"
  | "instance-metadata"
  | "instance-frames"
  | "instance-rendered";

export interface ParsedWadoRsRequest {
  studyUid: string;
  kind: WadoRsResourceKind;
  seriesUid?: string;
  instanceUid?: string;
  frameList?: string;
}

/**
 * BLOQUEIO 1 (parecer corretivo): valida o caminho completo (depois do UID do
 * estudo) contra uma allowlist FECHADA de formas WADO-RS, segmento por
 * segmento, já decodificado — nunca por regex sobre a string inteira ainda
 * codificada. Qualquer forma fora desta lista (incluindo qualquer tentativa
 * de travessia de diretório) é rejeitada com 400.
 */
function matchWadoRsShape(studyUid: string, restSegments: string[]): ParsedWadoRsRequest {
  if (restSegments.length === 0) {
    return { studyUid, kind: "study" };
  }

  if (restSegments.length === 1 && restSegments[0] === "metadata") {
    return { studyUid, kind: "study-metadata" };
  }

  if (restSegments[0] === "series" && isValidDicomUid(restSegments[1] ?? "")) {
    const seriesUid = restSegments[1];

    if (restSegments.length === 2) {
      return { studyUid, kind: "series", seriesUid };
    }

    if (restSegments.length === 3 && restSegments[2] === "metadata") {
      return { studyUid, kind: "series-metadata", seriesUid };
    }

    if (restSegments[2] === "instances" && isValidDicomUid(restSegments[3] ?? "")) {
      const instanceUid = restSegments[3];

      if (restSegments.length === 4) {
        return { studyUid, kind: "instance", seriesUid, instanceUid };
      }

      if (restSegments.length === 5 && restSegments[4] === "metadata") {
        return { studyUid, kind: "instance-metadata", seriesUid, instanceUid };
      }

      if (restSegments.length === 5 && restSegments[4] === "rendered") {
        return { studyUid, kind: "instance-rendered", seriesUid, instanceUid };
      }

      if (
        restSegments.length === 6 &&
        restSegments[4] === "frames" &&
        FRAME_LIST_PATTERN.test(restSegments[5] ?? "")
      ) {
        return { studyUid, kind: "instance-frames", seriesUid, instanceUid, frameList: restSegments[5] };
      }
    }
  }

  throw new DicomWebRequestError(
    400,
    "Recurso DICOMweb não suportado por este proxy.",
  );
}

/**
 * Reconstrói o caminho de destino EXCLUSIVAMENTE a partir da estrutura já
 * validada por `matchWadoRsShape` — nunca a partir do caminho bruto recebido.
 * Isto é o que garante, por construção, que o destino jamais sai do prefixo
 * `/studies/<uid>` do estudo autorizado: não existe nenhum jeito de um
 * segmento não previsto nesta função chegar à URL final.
 */
export function buildCanonicalWadoRsPath(parsed: ParsedWadoRsRequest): string {
  const uid = encodeURIComponent(parsed.studyUid);
  switch (parsed.kind) {
    case "study":
      return `/studies/${uid}`;
    case "study-metadata":
      return `/studies/${uid}/metadata`;
    case "series":
      return `/studies/${uid}/series/${encodeURIComponent(parsed.seriesUid!)}`;
    case "series-metadata":
      return `/studies/${uid}/series/${encodeURIComponent(parsed.seriesUid!)}/metadata`;
    case "instance":
      return `/studies/${uid}/series/${encodeURIComponent(parsed.seriesUid!)}/instances/${encodeURIComponent(parsed.instanceUid!)}`;
    case "instance-metadata":
      return `/studies/${uid}/series/${encodeURIComponent(parsed.seriesUid!)}/instances/${encodeURIComponent(parsed.instanceUid!)}/metadata`;
    case "instance-rendered":
      return `/studies/${uid}/series/${encodeURIComponent(parsed.seriesUid!)}/instances/${encodeURIComponent(parsed.instanceUid!)}/rendered`;
    case "instance-frames":
      return `/studies/${uid}/series/${encodeURIComponent(parsed.seriesUid!)}/instances/${encodeURIComponent(parsed.instanceUid!)}/frames/${parsed.frameList}`;
  }
}

/**
 * Extrai e valida a requisição WADO-RS de uma rota /api/dicomweb/*, aceitando
 * SOMENTE os dois formatos documentados:
 *
 *   A) WADO-RS por caminho:    /api/dicomweb/studies/<uid>[/<resto permitido>]
 *   B) legado por querystring: /api/dicomweb?studyUid=<uid>  (sem mais nada no caminho)
 *
 * BLOQUEIO 4 (parecer corretivo): se a chave `studyUid` estiver presente na
 * querystring, ela precisa resolver a exatamente UM valor string não vazio —
 * um array (UID duplicado), objeto, ou string vazia é rejeitado com 400
 * mesmo que o caminho já tenha um UID válido (a Revisão 1 ignorava
 * silenciosamente esse caso via `firstQueryValue` retornando `null`).
 *
 * Qualquer outra coisa (QIDO-RS amplo sem studies/<uid>, UID ausente,
 * malformado, ou presente nos dois formatos com valores divergentes) é
 * rejeitada ANTES de qualquer acesso ao Orthanc.
 */
export function parseDicomWebRequest(
  reqPath: string,
  reqQuery: Record<string, unknown>,
): ParsedWadoRsRequest {
  // BLOQUEIO 4: valida a forma do studyUid da query ANTES de decidir se ele
  // será usado (path tem prioridade quando os dois existem e concordam).
  let queryUid: string | null = null;
  if (Object.prototype.hasOwnProperty.call(reqQuery, "studyUid")) {
    queryUid = firstQueryValue(reqQuery["studyUid"]);
    if (queryUid === null || queryUid.length === 0) {
      throw new DicomWebRequestError(
        400,
        "Identificador de estudo inválido ou duplicado na querystring.",
      );
    }
  }

  const rawSegments = reqPath.split("/").filter((segment) => segment.length > 0);

  if (rawSegments.length === 0) {
    // Formato legado: /api/dicomweb?studyUid=<uid>, sem nenhum segmento de caminho.
    if (!queryUid) {
      throw new DicomWebRequestError(
        400,
        "Requisição DICOMweb não suportada: identificador de estudo obrigatório.",
      );
    }
    if (!isValidDicomUid(queryUid)) {
      throw new DicomWebRequestError(400, "Identificador de estudo inválido.");
    }
    return { studyUid: queryUid, kind: "study" };
  }

  if (rawSegments[0] !== "studies" || rawSegments.length < 2) {
    throw new DicomWebRequestError(
      400,
      "Requisição DICOMweb não suportada: identificador de estudo obrigatório.",
    );
  }

  // Decodifica estritamente cada segmento — inclusive o UID — antes de
  // qualquer comparação. Isto fecha tanto a travessia literal (`..`) quanto
  // a percent-encoded (`%2e%2e`) no PRÓPRIO UID do estudo, além do restante
  // do caminho.
  const decodedSegments = rawSegments.map(decodeSegmentStrict);
  const studyUid = decodedSegments[1];

  if (!isValidDicomUid(studyUid)) {
    throw new DicomWebRequestError(400, "Identificador de estudo inválido.");
  }

  if (queryUid && queryUid !== studyUid) {
    throw new DicomWebRequestError(
      400,
      "Identificador de estudo ambíguo (caminho e querystring divergem).",
    );
  }

  const restSegments = decodedSegments.slice(2);
  return matchWadoRsShape(studyUid, restSegments);
}

export interface DicomWebAuthUser {
  id: number;
  role: string;
  unit_id: number | null;
}

export interface OrthancUnitConfig {
  isActive: boolean;
  pacs_ip: string | null;
}

export interface DicomWebAuthDeps {
  /**
   * server/authorization.ts::assertDicomFileAccess (ou, em produção,
   * assertCachedDicomFileAccess — ver BLOQUEIO de desempenho no parecer
   * corretivo: este endpoint pode receber várias requisições por estudo
   * em uma única visualização, então o proxy real injeta a versão com
   * cache de 60s por usuário+papel+unidade+permissão+UID, nunca a versão
   * sem cache, para não multiplicar consultas ao banco por usuário
   * simultâneo). A assinatura é a mesma para as duas, então o teste injeta
   * um mock e a produção injeta a função com cache.
   */
  assertDicomFileAccess: (
    user: DicomWebAuthUser,
    studyUid: string,
    permission: "view_studies",
  ) => Promise<number>;
  /** Busca a config de Orthanc de UMA unidade específica (nunca "qualquer unidade"). */
  getUnitOrthancConfig: (unitId: number) => Promise<OrthancUnitConfig | null>;
  /** process.env.ORTHANC_HTTP_PORT || '8042', injetado para testabilidade. */
  orthancHttpPort: string;
}

export interface AuthorizedDicomWebTarget {
  unitId: number;
  orthancBaseUrl: string;
  studyUid: string;
  /**
   * Caminho WADO-RS reconstruído de forma canônica (ex.: "/studies/<uid>/metadata"),
   * SEMPRE derivado da estrutura validada — nunca do caminho bruto recebido.
   * O chamador deve usar este valor (e não req.path/req.url) para montar a
   * URL final enviada ao Orthanc.
   */
  canonicalPath: string;
}

/**
 * Único ponto de decisão de autorização do proxy DICOMweb.
 * FAIL CLOSED: qualquer passo que não resolva com sucesso lança
 * DicomWebRequestError — nunca retorna uma URL de fallback, e o caminho de
 * destino nunca é construído a partir de entrada não validada (BLOQUEIO 1).
 */
export async function resolveAuthorizedDicomWebTarget(
  user: DicomWebAuthUser,
  method: string,
  reqPath: string,
  reqQuery: Record<string, unknown>,
  deps: DicomWebAuthDeps,
): Promise<AuthorizedDicomWebTarget> {
  if (!isAllowedDicomWebMethod(method)) {
    throw new DicomWebRequestError(405, "Método não permitido.");
  }

  // BLOQUEIO 1: todo o parsing/validação de forma acontece ANTES de qualquer
  // chamada de autorização ou de rede — inclusive a rejeição de travessia.
  const parsed = parseDicomWebRequest(reqPath, reqQuery);

  let unitId: number;
  try {
    unitId = await deps.assertDicomFileAccess(user, parsed.studyUid, "view_studies");
  } catch {
    // assertDicomFileAccess lança TRPCError({ code: 'FORBIDDEN', ... }) tanto
    // para "estudo órfão" quanto para "sem permissão na unidade" — em ambos
    // os casos o proxy deve responder 403 genérico, sem detalhar o motivo.
    throw new DicomWebRequestError(403, "Acesso negado a este estudo.");
  }

  const unitConfig = await deps.getUnitOrthancConfig(unitId);
  if (!unitConfig || !unitConfig.isActive || !unitConfig.pacs_ip) {
    // FAIL CLOSED: nunca cair para "qualquer unidade ativa" nem para IP padrão.
    throw new DicomWebRequestError(
      503,
      "Serviço de imagens temporariamente indisponível para esta unidade.",
    );
  }

  const orthancBaseUrl = `http://${unitConfig.pacs_ip}:${deps.orthancHttpPort}`;
  return {
    unitId,
    orthancBaseUrl,
    studyUid: parsed.studyUid,
    canonicalPath: buildCanonicalWadoRsPath(parsed),
  };
}
