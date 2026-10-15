/**
 * CORREÇÃO DE SEGURANÇA (branch claude/seguranca-proxy-dicomweb-sem-autorizacao-por-estudo)
 * Revisão: parecer da Manus (RECOMENDACOES_CORRECAO_SEGURANCA_PROXY_DICOMWEB_2026-10-14.txt)
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
 * Esta correção reaproveita `assertDicomFileAccess` (server/authorization.ts),
 * a mesma função já usada por /api/dicom-cache-status, /api/dicom-files e
 * /api/dicom-stream: ela resolve a unidade REAL dona do estudo a partir de
 * studies_cache/study_metadata (nunca do usuário) e nega acesso (FORBIDDEN)
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

/** Mesmo padrão de UID aceito em todo o resto do sistema (routerUtils.ts). */
const STUDY_UID_PATTERN = /^[0-9]+(?:\.[0-9]+)*$/;

function isValidUidFormat(value: string): boolean {
  return value.length > 0 && value.length <= 64 && STUDY_UID_PATTERN.test(value);
}

function firstQueryValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") {
    return value[0];
  }
  return null;
}

/**
 * Extrai o StudyInstanceUID de uma requisição /api/dicomweb/*, aceitando
 * SOMENTE os dois formatos documentados (ACHADO_PROXY_DICOMWEB_*.md, 3.4):
 *
 *   A) WADO-RS por caminho:    /api/dicomweb/studies/<uid>[/...]
 *   B) legado por querystring: /api/dicomweb?studyUid=<uid>[&unitId=...]
 *
 * Qualquer outra coisa (QIDO-RS amplo sem studies/<uid>, UID ausente,
 * malformado, duplicado, ou presente nos dois formatos com valores
 * divergentes) é rejeitada ANTES de qualquer acesso ao Orthanc.
 */
export function extractDicomWebStudyUid(
  reqPath: string,
  reqQuery: Record<string, unknown>,
): string {
  const pathMatch = reqPath.match(/^\/studies\/([^/]+)(?:\/.*)?$/);
  const pathUid = pathMatch ? decodeURIComponent(pathMatch[1]) : null;

  const queryUidRaw = firstQueryValue(reqQuery["studyUid"]);
  const queryUid = queryUidRaw !== null ? queryUidRaw : null;

  if (pathUid && queryUid) {
    if (pathUid !== queryUid) {
      throw new DicomWebRequestError(
        400,
        "Identificador de estudo ambíguo (caminho e querystring divergem).",
      );
    }
  }

  const candidate = pathUid ?? queryUid;
  if (!candidate) {
    throw new DicomWebRequestError(
      400,
      "Requisição DICOMweb não suportada: identificador de estudo obrigatório.",
    );
  }

  if (!isValidUidFormat(candidate)) {
    throw new DicomWebRequestError(400, "Identificador de estudo inválido.");
  }

  return candidate;
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
  /** server/authorization.ts::assertDicomFileAccess — injetado para permitir mock em teste. */
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
}

/**
 * Único ponto de decisão de autorização do proxy DICOMweb.
 * FAIL CLOSED: qualquer passo que não resolva com sucesso lança
 * DicomWebRequestError — nunca retorna uma URL de fallback.
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

  const studyUid = extractDicomWebStudyUid(reqPath, reqQuery);

  let unitId: number;
  try {
    unitId = await deps.assertDicomFileAccess(user, studyUid, "view_studies");
  } catch (err: any) {
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
  return { unitId, orthancBaseUrl, studyUid };
}
