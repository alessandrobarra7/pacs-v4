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

function extractPrintSetup(src: string): string {
  const start = src.indexOf("const renderEditorPhysicalPage = createPhysicalReportSheetRenderer({");
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf("const html = `<!DOCTYPE html>", start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("ReportEditorPage.tsx — folha física nunca recebe SharedReportBodyGuide (ORDEM 1)", () => {
  it("delegam a folha física ao renderer canônico, que nunca injeta o guia", () => {
    const setup = extractPrintSetup(source);
    expect(source).toContain('from "@/lib/reportPhysicalSheetRenderer"');
    expect(setup).toContain("layout: effectiveReportLayout,");
    expect(setup).toContain("footerImageUrl: footerBase64 || layoutFooterUrl,");
    expect(setup).not.toMatch(/<SharedReportBodyGuide\s*\/>/);
    expect(source).not.toContain("renderSharedReportSheetHtml");
  });

  it("mede a área interna da mesma casca canônica usada na folha final", () => {
    expect(source).toContain("bodySelector: REPORT_PHYSICAL_BODY_SELECTOR,");
    expect(source).toContain("renderPage: renderEditorPhysicalPage,");
    expect(source).toContain("materializePhysicalReportPages({");
    expect(source).toContain("win.print();");
    expect(source.indexOf("materializePhysicalReportPages({")).toBeLessThan(source.indexOf("win.print();"));
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

  it("repete a arte de rodapé na prévia multisseção para acompanhar a regra física", () => {
    expect(source).toContain("footerImageUrl={layoutFooterUrl}");
    expect(source).not.toContain("footerImageUrl={isLastPage ? layoutFooterUrl : null}");
    expect(source).not.toContain("screenFooterReservedMm");
  });
});
