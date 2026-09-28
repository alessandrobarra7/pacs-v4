import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(__dirname, "..", "client", "src", "pages", "PacsQueryPage.tsx"),
  "utf-8",
);

describe("PacsQueryPage.tsx — folha física visual canônica", () => {
  it("delega a folha final ao renderer compartilhado, sem camada manual de logos", () => {
    expect(source).toContain('from "@/lib/reportPhysicalSheetRenderer"');
    expect(source).toContain("const renderPhysicalPageQ = createPhysicalReportSheetRenderer({");
    expect(source).toContain("layout: effectiveReportLayoutQ,");
    expect(source).toContain("logos: printLogosWithFallbackQ,");
    expect(source).toContain("backgroundUrl: bgBase64Q || lBgUrl,");
    expect(source).toContain("footerImageUrl: footerBase64Q || lFooterUrl,");
    expect(source).not.toContain("renderLogoLayerHtml");
    expect(source).not.toContain("logoOverlayHtmlQ");
  });

  it("preserva o fallback de units.logo_url somente fora de snapshot clínico explícito", () => {
    expect(source).toContain("const allowLegacyUnitLogoFallbackQ = effectiveReportLayoutQ.source === 'unitLayout';");
    expect(source).toContain("allowLegacyUnitLogoFallbackQ && logoUrl");
    expect(source).toContain("const printLogosWithFallbackQ");
  });

  it("não recria o cabeçalho textual legado fora da folha canônica", () => {
    expect(source).not.toContain("clinic-name");
    expect(source).not.toContain("clinic-sub");
    expect(source).not.toContain("Laudo de Interpretação Radiológica");
  });

  it("mede e materializa a área corporal interna da mesma folha canônica", () => {
    expect(source).toContain("renderPage: renderPhysicalPageQ,");
    expect(source).toContain("bodySelector: REPORT_PHYSICAL_BODY_SELECTOR,");
    expect(source).toContain("materializePhysicalReportPages({");
  });
});
