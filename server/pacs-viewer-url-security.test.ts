/**
 * CORREÇÃO DE SEGURANÇA (branch claude/seguranca-proxy-dicomweb-sem-autorizacao-por-estudo,
 * item 3.5 do parecer da Manus): pacs.getViewerUrl
 *
 * Achado: a procedure resolvia a unidade alvo a partir de input.unit_id /
 * ctx.user.unit_id (nunca checando se o ESTUDO pedido pertencia a essa
 * unidade), e quando a unidade tinha orthanc_base_url configurado devolvia
 * ao navegador uma URL DIRETA e não autenticada do Orthanc
 * (getDicomWebUrl(...)) — expondo IP interno e porta 8042, e pulando
 * completamente o proxy autorizado /api/dicomweb.
 *
 * Como getViewerUrl depende de banco real (studies_cache/study_metadata,
 * units) e seu único consumidor (ViewerPage.tsx, rota órfã /viewer/:studyId,
 * confirmado via grep que nada mais no app a linka) não está coberto por
 * harness de teste de tRPC com DB, este teste verifica o código REAL fonte
 * (não apenas a existência de uma string solta) nos pontos exatos que
 * decidem o comportamento de segurança: ordem das chamadas, uso do retorno
 * de assertDicomFileAccess, e ausência de getDicomWebUrl/exposição de URL
 * interna na resposta.
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

describe("pacs.getViewerUrl — autorização por estudo e não exposição de Orthanc", () => {
  const block = sliceGetViewerUrl(source);

  it("importa assertDicomFileAccess (camada central de autorização)", () => {
    expect(source).toContain('import { assertDicomFileAccess } from "../authorization";');
  });

  it("chama assertDicomFileAccess com o studyInstanceUid pedido, não apenas a unidade informada pelo usuário", () => {
    expect(block).toContain("assertDicomFileAccess(ctx.user, input.studyInstanceUid, 'view_studies')");
  });

  it("usa o unitId retornado por assertDicomFileAccess (studyUnitId) para buscar a unidade e montar a resposta — não mais targetUnitIdForViewer isolado", () => {
    expect(block).toContain("const studyUnitId = await assertDicomFileAccess(");
    expect(block).toContain("eq(units.id, studyUnitId)");
    // o audit log deve registrar a unidade real do estudo, não a unidade só "informada"
    const auditLogIdx = block.indexOf("action: 'OPEN_VIEWER'");
    expect(auditLogIdx).toBeGreaterThan(-1);
    const auditLogSnippet = block.slice(Math.max(0, auditLogIdx - 200), auditLogIdx + 50);
    expect(auditLogSnippet).toContain("unit_id: studyUnitId");
  });

  it("NUNCA usa getDicomWebUrl para montar a viewerUrl devolvida ao navegador (sem URL direta/não autenticada do Orthanc)", () => {
    expect(block).not.toMatch(/viewerUrl\s*=\s*getDicomWebUrl/);
    expect(source).not.toContain('import { getDicomWebUrl } from "../orthanc";');
  });

  it("a viewerUrl devolvida é sempre o caminho interno controlado pelo Portal (/api/dicomweb/studies/<uid>)", () => {
    expect(block).toContain("const viewerUrl = `/api/dicomweb/studies/${encodeURIComponent(input.studyInstanceUid)}`;");
  });

  it("a resposta nunca mais expõe a URL interna do Orthanc (orthancUrl sempre null)", () => {
    expect(block).toContain("orthancUrl: null,");
  });

  it("a checagem de permissão por unit_id informado (assertUnitPermission) permanece como pré-filtro de UX, mas não é mais a autorização final", () => {
    // ainda existe o pré-check de boa UX (mensagem clara quando o usuário pede
    // explicitamente uma unidade à qual não tem acesso)
    expect(block).toContain("assertUnitPermission(ctx.user, input.unit_id, 'view_studies')");
    // mas a autorização efetiva (que decide a unidade usada de fato) é a linha de assertDicomFileAccess,
    // que aparece DEPOIS do pré-check acima no código-fonte
    const preCheckIdx = block.indexOf("assertUnitPermission(ctx.user, input.unit_id, 'view_studies')");
    const realAuthIdx = block.indexOf("const studyUnitId = await assertDicomFileAccess(");
    expect(realAuthIdx).toBeGreaterThan(preCheckIdx);
  });
});
