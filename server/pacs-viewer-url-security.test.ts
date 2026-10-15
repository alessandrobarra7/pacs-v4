/**
 * CORREÇÃO DE SEGURANÇA (branch claude/seguranca-proxy-dicomweb-sem-autorizacao-por-estudo,
 * item 3.5 do parecer original + BLOQUEIOS 2 e 3 do parecer corretivo da
 * Manus): pacs.getViewerUrl
 *
 * Achado original: a procedure resolvia a unidade alvo a partir de
 * input.unit_id/ctx.user.unit_id (nunca checando se o ESTUDO pedido
 * pertencia a essa unidade), e quando a unidade tinha orthanc_base_url
 * configurado devolvia ao navegador uma URL DIRETA e não autenticada do
 * Orthanc (getDicomWebUrl(...)) — expondo IP interno e porta 8042, e
 * pulando completamente o proxy autorizado /api/dicomweb.
 *
 * BLOQUEIO 2 (parecer corretivo): a primeira correção zerou só o campo de
 * URL direta, mas ainda calculava e devolvia dois outros campos derivados
 * de uma URL pública/NAT da unidade — exposição sem uso real, já que o
 * único consumidor real (ViewerPage.tsx, confirmado via grep) só lê
 * `data.viewerUrl`. Agora os 3 campos potencialmente diretos do retorno
 * são sempre `null`.
 *
 * BLOQUEIO 3 (parecer corretivo): a correção anterior ainda resolvia uma
 * unidade "alvo" a partir de input.unit_id/ctx.user.unit_id e BARRAVA com
 * FORBIDDEN se desse vazio — tudo antes de sequer chamar
 * assertDicomFileAccess, a fonte correta da unidade real do estudo (que já
 * sabe lidar com admin_master e permissões granulares multiunidade). Isso
 * podia bloquear indevidamente admin_master sem unidade legada e sem
 * unidade informada, ou usuário multiunidade sem unidade legada principal
 * mas com permissão na unidade real do estudo. Agora a autorização pelo
 * estudo é chamada como decisão efetiva e inicial; a unidade informada
 * pelo chamador, quando presente, é só um filtro opcional de UX.
 *
 * Como getViewerUrl depende de banco real (studies_cache/study_metadata,
 * units) e seu único consumidor (ViewerPage.tsx, rota órfã /viewer/:studyId,
 * confirmado via grep que nada mais no app a linka) não está coberto por
 * harness de teste de tRPC com DB, este teste verifica o código REAL fonte
 * (não apenas a existência de uma string solta) nos pontos exatos que
 * decidem o comportamento de segurança: ordem das chamadas, ausência de
 * guarda bloqueante antes da autorização pelo estudo, e ausência de
 * exposição de URL interna na resposta. Comentários de linha são removidos
 * antes das checagens de ausência, para que a prosa explicativa (que cita
 * nomes antigos ao descrever o que foi corrigido) não gere falso-negativo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "server/routers/pacs.ts"), "utf8");

function sliceGetViewerUrl(src: string): string {
  const start = src.indexOf("getViewerUrl: protectedProcedure");
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf("download: protectedProcedure", start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

/** Remove comentários de linha (//...) para checar código real, não prosa explicativa. */
function stripLineComments(code: string): string {
  return code
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

describe("pacs.getViewerUrl — autorização por estudo e não exposição de Orthanc", () => {
  const block = sliceGetViewerUrl(source);
  const code = stripLineComments(block);

  it("importa assertDicomFileAccess (camada central de autorização)", () => {
    expect(source).toContain('import { assertDicomFileAccess } from "../authorization";');
  });

  it("chama assertDicomFileAccess com o studyInstanceUid pedido, não apenas a unidade informada pelo usuário", () => {
    expect(code).toContain("assertDicomFileAccess(ctx.user, input.studyInstanceUid, 'view_studies')");
  });

  it("usa o unitId retornado por assertDicomFileAccess (studyUnitId) para buscar a unidade e montar a resposta", () => {
    expect(code).toContain("const studyUnitId = await assertDicomFileAccess(");
    expect(code).toContain("eq(units.id, studyUnitId)");
    const auditLogIdx = code.indexOf("action: 'OPEN_VIEWER'");
    expect(auditLogIdx).toBeGreaterThan(-1);
    const auditLogSnippet = code.slice(Math.max(0, auditLogIdx - 200), auditLogIdx + 50);
    expect(auditLogSnippet).toContain("unit_id: studyUnitId");
  });

  it("BLOQUEIO 3: não existe mais uma guarda que bloqueia a requisição antes de assertDicomFileAccess, com base só na unidade informada pelo usuário", () => {
    expect(code).not.toContain("targetUnitIdForViewer");
  });

  it("BLOQUEIO 3: quando input.unit_id é informado, ele é checado apenas como filtro opcional de UX — a autorização efetiva (assertDicomFileAccess) vem depois e decide por si só", () => {
    expect(code).toContain("if (input.unit_id !== undefined)");
    expect(code).toContain("assertUnitPermission(ctx.user, input.unit_id, 'view_studies')");
    const preCheckIdx = code.indexOf("if (input.unit_id !== undefined)");
    const realAuthIdx = code.indexOf("const studyUnitId = await assertDicomFileAccess(");
    expect(realAuthIdx).toBeGreaterThan(preCheckIdx);
  });

  it("NUNCA usa getDicomWebUrl para montar a viewerUrl devolvida ao navegador (sem URL direta/não autenticada do Orthanc)", () => {
    expect(code).not.toMatch(/viewerUrl\s*=\s*getDicomWebUrl/);
    expect(source).not.toContain('import { getDicomWebUrl } from "../orthanc";');
  });

  it("a viewerUrl devolvida é sempre o caminho interno controlado pelo Portal (/api/dicomweb/studies/<uid>)", () => {
    expect(code).toContain("const viewerUrl = `/api/dicomweb/studies/${encodeURIComponent(input.studyInstanceUid)}`;");
  });

  it("BLOQUEIO 2: a resposta nunca mais expõe URL direta, IP, porta ou viewer do Orthanc — os 3 campos potencialmente diretos são sempre null", () => {
    expect(code).toContain("orthancUrl: null,");
    expect(code).toContain("orthancPublicUrl: null,");
    expect(code).toContain("orthancWebViewerUrl: null,");
    // nenhum desses 3 campos é, no CÓDIGO (fora de comentários), construído a
    // partir de unitData.orthanc_public_url/orthanc_base_url
    expect(code).not.toMatch(/orthancPublicUrl\s*=\s*unitData/);
    expect(code).not.toContain("orthanc_public_url");
  });

  it("hasOrthanc continua sendo apenas uma flag booleana (não uma URL) derivada de unitData.orthanc_base_url", () => {
    expect(code).toContain("const hasOrthanc = !!unitData.orthanc_base_url;");
    expect(code).toContain("hasOrthanc,");
  });
});
