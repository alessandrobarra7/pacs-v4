import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "client/src/pages/ReportEditorPage.tsx"),
  "utf8",
);

describe("ReportEditorPage — contrato canônico de layout", () => {
  it("captura o snapshot com o helper canônico no momento da assinatura", () => {
    expect(source).toContain("from '../../../shared/reportLayout'");
    expect(source).toContain("const layoutSnapshot = buildLayoutSnapshot(");
    expect(source).toContain("new Date().toISOString(),");
    expect(source).toContain("layout_snapshot: layoutSnapshot");
  });

  it("resolve uma única fonte de layout para rascunho, assinado e retificado", () => {
    expect(source).toContain("const effectiveReportLayout = useMemo(() => resolveEffectiveReportLayout({");
    expect(source).toContain("status: existingReport?.status,");
    expect(source).toContain("reportLayoutSnapshot: existingReport?.layout_snapshot");
    expect(source).toContain("const effectiveLayoutPrefs = effectiveReportLayout.preferences;");
    expect(source).toContain("[existingReport?.status, existingReport?.layout_snapshot, unitLayout]");
    expect(source).not.toContain("const activeLayoutRecord =");
    expect(source).not.toContain("const layoutSource =");
  });

  it("entrega os mesmos valores resolvidos para impressão, PDF e folhas na tela", () => {
    expect(source).toContain('from "@/lib/reportPhysicalSheetRenderer"');
    expect(source).toContain("layout: effectiveReportLayout,");
    expect(source).toContain("footerImageUrl: footerBase64 || layoutFooterUrl,");
    expect(source).toContain("const effectivePageSize = effectiveLayoutPrefs.pageSize");
    expect(source).toContain("pageSize={effectiveLayoutPrefs.pageSize}");
    expect(source).toContain("fontSize={effectiveLayoutPrefs.fontSize}");
    expect(source).toContain("lineHeight={effectiveLayoutPrefs.lineHeight}");
    expect(source).toContain("positions={layoutBlockPos}");
    expect(source).toContain("logos={layoutLogos}");
  });

  it("materializa a impressão a partir da fábrica única antes de chamar print", () => {
    expect(source).toContain('from "@/lib/reportPhysicalPageFactory"');
    expect(source).toContain("materializePhysicalReportPages({");
    expect(source).toContain("normalizeReportSections(rawBody, examTitle || \"Laudo\")");
    expect(source).toContain("renderPage: renderEditorPhysicalPage,");
    expect(source).toContain("bodySelector: REPORT_PHYSICAL_BODY_SELECTOR,");
    expect(source).toContain("win.print();");
    expect(source.indexOf("materializePhysicalReportPages({")).toBeLessThan(source.indexOf("win.print();"));
    expect(source).not.toContain("window.onload = function()");
  });
  it("usa o mesmo rodapé protegido contra fundo na impressão do editor", () => {
    expect(source).toContain(".doctor-footer { text-align: center; margin: 0 auto;");
    expect(source).toContain("background: rgba(255,255,255,.84)");
    expect(source).toContain(".sig-img   { max-height: 42px;");
    expect(source).toContain(".stamp-img { max-height: 70px;");
    expect(source).not.toContain("margin: 14mm auto 0");
  });
});
