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

  /**
   * Regressão (auditoria Manus 2026-09-29, "Parecer técnico — cadeia de
   * dados DICOM, rodapé e teste"): este consumidor tem os MAIORES limites
   * de imagem dos três (assinatura até 13mm, carimbo até 24mm — bem acima
   * dos 42px/70px do Editor e da Lista PACS), logo era o mais exposto ao
   * bloqueio de corte por overflow:hidden quando o conteúdo somado
   * excedia a altura do bloco [data-layout-block="footer"]. O rodapé
   * agora é um container flex em coluna que ocupa 100% da altura real do
   * bloco, com min-height:0 na assinatura/carimbo para que o motor de
   * flexbox os encolha (mantendo proporção via object-fit:contain) o
   * quanto for necessário, em vez de cortá-los.
   */
  it("dá ao rodapé do PDF financeiro um contrato de capacidade (flex-column + height:100% + min-height:0)", () => {
    expect(source).toContain("max-width:65mm;height:100%;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;page-break-inside:avoid;");
    expect(source).toContain(".signature,.stamp { flex:0 1 auto;min-height:0;display:block;object-fit:contain;margin:0 auto 2mm; }");
    expect(source).toContain(".signature-line { flex:0 0 auto;");
  });
});
