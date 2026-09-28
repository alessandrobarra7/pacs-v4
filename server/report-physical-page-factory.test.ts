import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeReportSections } from "../client/src/lib/reportPhysicalPageFactory";

const readSource = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");
const financialSource = readSource("client/src/lib/financialReportPdfDownload.ts");
const pacsSource = readSource("client/src/pages/PacsQueryPage.tsx");
const editorSource = readSource("client/src/pages/ReportEditorPage.tsx");
const factorySource = readSource("client/src/lib/reportPhysicalPageFactory.ts");

describe("fábrica canônica de páginas físicas de laudo", () => {
  it("normaliza HTML legado e JSON multisseção sem perder os títulos persistidos", () => {
    expect(normalizeReportSections("<p>HTML legado</p>", "Título padrão")).toEqual([
      { title: "Título padrão", body: "<p>HTML legado</p>" },
    ]);
    expect(normalizeReportSections(JSON.stringify([
      { title: "Primeira seção", body: "<p>A</p>" },
      { title: "Segunda seção", body: "<p>B</p>" },
    ]), "Ignorado")).toEqual([
      { title: "Primeira seção", body: "<p>A</p>" },
      { title: "Segunda seção", body: "<p>B</p>" },
    ]);
  });

  it("usa a mesma casca para medir, fragmentar e materializar a folha final", () => {
    expect(factorySource).toContain("renderPage({");
    expect(factorySource).toContain("paginateSectionIntoPages(sourceContainer");
    expect(factorySource).toContain("finalFooterHtml");
    expect(factorySource).toContain("index === physicalPages.length - 1 ? finalFooterHtml : \"\"");
    expect(factorySource).toContain("finally {");
    expect(factorySource).toContain("measuringShells.forEach((shell) => shell.remove())");
  });

  it("faz Editor, Lista de Estudos e Financeiro delegarem a mesma fábrica", () => {
    for (const source of [financialSource, pacsSource, editorSource]) {
      expect(source).toContain("materializePhysicalReportPages({");
      expect(source).toContain("normalizeReportSections(");
      expect(source).not.toMatch(/import\s+\{[^}]*paginateSectionIntoPages/);
    }
  });

  it("mantém os consumidores responsáveis pela captura/impressão, não pela regra de páginas", () => {
    expect(financialSource).toContain("html2canvas(sheetElements[index]");
    expect(pacsSource).toContain("runControlledPrint({");
    expect(editorSource).toContain("win.print();");
  });
});
