import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"),
  "utf8",
);

describe("PacsQueryPage — contrato canônico de layout", () => {
  it("obtém o snapshot clínico retornado junto com o laudo", () => {
    expect(source).toContain("let reportLayoutSnapshot: ReportLayoutSource | null = null;");
    expect(source).toContain("reportLayoutSnapshot = result?.layout_snapshot as ReportLayoutSource | null | undefined ?? null;");
  });

  it("resolve a mesma precedência de rascunho, assinado e retificado do Editor", () => {
    expect(source).toContain("const effectiveReportLayoutQ = resolveEffectiveReportLayout({");
    expect(source).toContain("status: reportStatus,");
    expect(source).toContain("reportLayoutSnapshot,");
    expect(source).toContain("const effectivePrefsQ = effectiveReportLayoutQ.preferences;");
    expect(source).not.toContain("DEFAULT_LAYOUT_PREFERENCES");
  });

  it("alimenta folhas, captura e paginação com os campos resolvidos", () => {
    expect(source).toContain("effectiveReportLayoutQ.footer_image_url");
    expect(source).toContain("effectiveReportLayoutQ.background_image_url");
    expect(source).toContain("effectiveReportLayoutQ.logos ?? []");
    expect(source).toContain("const blockPositionsQ = effectiveReportLayoutQ.block_positions ?? {};");
    expect(source).toContain("logos: printLogosWithFallbackQ,");
  });

  it("preserva logo legado somente fora de um snapshot clínico explícito", () => {
    expect(source).toContain("const allowLegacyUnitLogoFallbackQ = effectiveReportLayoutQ.source === 'unitLayout';");
    expect(source).toContain("allowLegacyUnitLogoFallbackQ && logoUrl");
  });
});
