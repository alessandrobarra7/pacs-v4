import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "client/src/lib/financialReportPdfDownload.ts"),
  "utf8",
);

describe("financialReportPdfDownload.ts — motor canônico de layout", () => {
  it("usa o mesmo renderizador físico de Editor/PACS em vez de montar folha própria", () => {
    expect(source).toContain('from "./reportPhysicalSheetRenderer"');
    expect(source).toContain("createPhysicalReportSheetRenderer");
    expect(source).toContain("REPORT_PHYSICAL_BODY_SELECTOR");
    expect(source).toContain("const renderPhysicalPage = createPhysicalReportSheetRenderer({");
    expect(source).toContain("layout: effectiveLayout");
    expect(source).toContain("renderPage: renderPhysicalPage");
    expect(source).toContain("bodySelector: REPORT_PHYSICAL_BODY_SELECTOR");
  });

  it("continua responsável por captura/jsPDF, mas não por posição visual dos blocos", () => {
    expect(source).toContain("html2canvas(sheetElements[index]");
    expect(source).toContain("pdf.save(");
    expect(source).not.toContain("const renderPhysicalPage = ({ title, bodyHtml, footerHtml }");
    expect(source).not.toContain('<article class="print-page"');
    expect(source).not.toContain("<header>");
    expect(source).not.toContain("footer-reserve");
    expect(source).not.toContain("FOOTER_RESERVE_MM");
  });

  it("passa logos, fundo, rodapé e assinatura para a folha compartilhada", () => {
    expect(source).toContain("logos: printLogos");
    expect(source).toContain("backgroundUrl: background");
    expect(source).toContain("footerImageUrl: footer");
    expect(source).toContain("finalFooterHtml: doctorFooter");
  });
  it("protege assinatura e carimbo contra o fundo também no PDF financeiro", () => {
    expect(source).toContain(".doctor-footer { text-align:center;margin:0 auto;");
    expect(source).toContain("background:rgba(255,255,255,.84)");
    expect(source).toContain("padding:4px 12px");
  });
});
