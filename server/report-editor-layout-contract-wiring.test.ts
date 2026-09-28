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
    expect(source).toContain("const lMT = effectiveLayoutPrefs.marginTop;");
    expect(source).toContain("const effectivePageSize = effectiveLayoutPrefs.pageSize");
    expect(source).toContain("pageSize={effectiveLayoutPrefs.pageSize}");
    expect(source).toContain("fontSize={effectiveLayoutPrefs.fontSize}");
    expect(source).toContain("lineHeight={effectiveLayoutPrefs.lineHeight}");
    expect(source).toContain("positions={layoutBlockPos}");
    expect(source).toContain("logos={layoutLogos}");
  });
});
