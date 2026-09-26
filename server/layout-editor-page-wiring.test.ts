import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Regressão de wiring (parecer de bloqueio da Manus, 2026-09-25,
// "RELATO_BLOQUEIO_EQUIVALENCIA_EDITOR_PDF_LOGOS"): confirma, lendo a
// fonte real de LayoutEditorPage.tsx, que o canvas do editor deixou de
// forçar uma folha A4 fixa (595x842px) e passou a derivar pageSize e as
// 4 margens de layoutData.preferences (a mesma fonte usada pelo PDF real),
// repassando-os às duas chamadas de SharedReportSheet, e que a camada de
// interação (arrastar/redimensionar) deixou de calcular percentuais sobre
// a folha inteira para calcular sobre a ÁREA ÚTIL real.
const source = readFileSync(
  join(__dirname, "..", "client", "src", "pages", "LayoutEditorPage.tsx"),
  "utf-8",
);

describe("LayoutEditorPage.tsx — wiring de pageSize/margens (Manus 2026-09-25)", () => {
  it("Fix A: deriva preferências efetivas de layoutData.preferences mesclado com DEFAULT_LAYOUT_PREFERENCES", () => {
    expect(source).toContain("DEFAULT_LAYOUT_PREFERENCES");
    expect(source).toContain("effectiveLayoutPrefs");
    expect(source).toMatch(/\.preferences/);
  });

  it("Fix B: não força mais 595/842 como style — usa getCanvasOuterStyle (dinâmico por pageSize)", () => {
    // Antes: `style={{ width: 595, height: 842, ... }}` (2x) e
    // `style={{ width: 595, height: 842, minHeight: 842 }}` (2x) —
    // nenhum desses literais de px fixo deve sobreviver.
    expect(source).not.toMatch(/width:\s*595/);
    expect(source).not.toMatch(/height:\s*842/);
    expect(source).toContain("getCanvasOuterStyle(effectiveLayoutPrefs.pageSize)");
  });

  it("Fix B: as duas chamadas de SharedReportSheet recebem pageSize e as 4 margens", () => {
    const sharedSheetCalls = source.split("<SharedReportSheet").length - 1;
    expect(sharedSheetCalls).toBe(2);
    const pageSizeOccurrences = source.match(/pageSize=\{effectiveLayoutPrefs\.pageSize\}/g) || [];
    expect(pageSizeOccurrences.length).toBe(2);
    for (const marginProp of ["marginTop", "marginRight", "marginBottom", "marginLeft"]) {
      const occurrences = source.match(new RegExp(`${marginProp}=\\{effectiveLayoutPrefs\\.${marginProp}\\}`, "g")) || [];
      expect(occurrences.length).toBe(2);
    }
  });

  it("Fix B: o rótulo do canvas informa o formato/dimensões reais, não mais 'Canvas A4 (595 x 842 px)' fixo", () => {
    expect(source).not.toContain("Canvas A4 (595 x 842 px)");
    expect(source).toContain("Canvas {effectiveLayoutPrefs.pageSize}");
  });

  it("Fix C: a camada de interação usa getAreaUtilWrapperStyle (mesma caixa de padding mm de SharedReportSheet), não a folha inteira", () => {
    expect(source).toContain("getAreaUtilWrapperStyle(effectiveLayoutPrefs)");
    expect(source).toContain("usableAreaRef");
  });

  it("Fix C: arrastar/redimensionar usa pointerDeltaToPercent (área útil medida), não os divisores fixos antigos", () => {
    expect(source).toContain("pointerDeltaToPercent(");
    // Divisores fixos antigos que ignoravam pageSize/margens.
    expect(source).not.toMatch(/\/\s*450\s*\)\s*\*\s*100/);
    expect(source).not.toMatch(/\/\s*600\s*\)\s*\*\s*100/);
  });

  it("Fix D: preserva os contratos existentes — compatibilidade positions.logo e handlers de logo px continuam presentes", () => {
    expect(source).toContain("legacyLogo");
    expect(source).toContain("handleLogoResize");
    expect(source).toContain("LOGO_BLOCK_IDS");
  });
});
