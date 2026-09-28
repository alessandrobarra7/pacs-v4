import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Regressão para a "ORDEM 1" de uma orientação técnica externa verificada
// contra o repositório real (2026-09-28): a folha FÍSICA (medição e folha
// final) de ReportEditorPage.tsx não deve mais poder receber
// SharedReportBodyGuide — um guia visual com texto de exemplo ("Técnica:
// Digite a técnica do exame...", "Achados: Descreva os achados
// radiológicos...", "Conclusão: Registre a impressão diagnóstica...") que
// existe só para orientar o médico na tela vazia. Antes, quando um
// fragmento de seção produzia bodyHtml vazio durante a fragmentação
// (materializePhysicalReportPages chama renderPage várias vezes), esse
// guia entrava na medição real de altura e podia, no pior caso, aparecer
// na folha física final entregue para impressão/PDF — um documento clínico
// não deveria conter texto de exemplo. O guia continua existindo, mas só
// nas duas superfícies de EDIÇÃO EM TELA (showSectionBodyGuide e
// showBodyGuide), que este teste também confirma que permanecem intocadas.
const source = readFileSync(
  resolve(process.cwd(), "client/src/pages/ReportEditorPage.tsx"),
  "utf8",
);

function extractFunction(src: string, startMarker: string): string {
  const start = src.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  // A função renderEditorPhysicalPage termina no "};" que fecha o corpo
  // (fechamento do bloco arrow function), antes da próxima declaração de
  // nível de indentação equivalente. Usamos o próximo "return renderSharedReportSheetHtml"
  // como âncora e cortamos um pouco depois dele para pegar só o trecho
  // relevante (a linha do `body`).
  const end = src.indexOf("return renderSharedReportSheetHtml({", start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("ReportEditorPage.tsx — folha física nunca recebe SharedReportBodyGuide (ORDEM 1)", () => {
  it("renderEditorPhysicalPage não referencia mais SharedReportBodyGuide como JSX no cálculo do body", () => {
    const fn = extractFunction(source, "const renderEditorPhysicalPage = ({");
    // O comentário explicativo acima do código pode mencionar o nome do
    // componente em prosa — o que não deve mais existir é o USO real em
    // JSX (<SharedReportBodyGuide />) dentro desta função.
    expect(fn).not.toMatch(/<SharedReportBodyGuide\s*\/>/);
  });

  it("renderEditorPhysicalPage sempre renderiza um container real de corpo, mesmo vazio", () => {
    const fn = extractFunction(source, "const renderEditorPhysicalPage = ({");
    expect(fn).toContain('<div className="report-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />');
    // Não deve mais existir a ramificação condicional antiga (ternário
    // decidindo entre corpo real e o guia).
    expect(fn).not.toMatch(/bodyHtml\.trim\(\)\s*\n?\s*\?/);
  });

  it("as duas superfícies de EDIÇÃO EM TELA continuam usando SharedReportBodyGuide normalmente", () => {
    // Confirma que a correção foi cirúrgica: o guia não sumiu do produto,
    // só saiu da folha física. Ele continua ativo nas duas visualizações
    // interativas (desktop e mobile/seção), atrás de suas próprias flags.
    const guideOccurrences = source.match(/<SharedReportBodyGuide\s*\/>/g) || [];
    expect(guideOccurrences.length).toBe(4); // 2 no ternário de tela + 2 nos overlays condicionais
    expect(source).toContain("showSectionBodyGuide &&");
    expect(source).toContain("showBodyGuide &&");
  });

  it("regressão negativa: o teste realmente detecta a reintrodução do bug", () => {
    // Simula o trecho antigo (com o placeholder condicional) e confirma
    // que as asserções acima o rejeitariam.
    const oldShape = `
    const renderEditorPhysicalPage = ({
      title,
      bodyHtml,
      footerHtml,
      isLast,
    }: { title: string; bodyHtml: string; footerHtml: string; isLast: boolean }) => {
      const body = bodyHtml.trim()
        ? <div className="report-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        : <SharedReportBodyGuide />;
      return renderSharedReportSheetHtml({`;
    expect(oldShape).toContain("SharedReportBodyGuide");
    expect(oldShape).toMatch(/bodyHtml\.trim\(\)\s*\n?\s*\?/);
  });
});
