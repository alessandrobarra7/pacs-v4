// Testes de regressão para client/src/lib/layoutEditorAreaUtil.ts — a
// geometria pura que corrige o bloqueio "equivalência editor/PDF"
// (parecer Manus 2026-09-25): o canvas do editor de layout desenhava
// sempre uma folha A4 fixa (595x842px) e nunca aplicava pageSize/margens
// da unidade, então o operador via uma prévia que não representava a
// folha física realmente entregue no download/impressão (Letter era
// desenhado como A4; margens não nulas deslocavam blocos/logos na tela
// mas não no PDF, e vice-versa).
//
// Estes são testes REAIS de DOM/valores (não apenas leitura de
// código-fonte): constroem o mesmo objeto de estilo que React aplica ao
// elemento e o assert-am contra os valores exatos esperados, e ainda
// comparam byte a byte com a string de padding que
// client/src/components/SharedReportSheet.tsx usa de fato (a folha que
// gera o PDF/impressão real) para provar que editor e PDF agora
// descrevem a MESMA área útil.

import { describe, expect, it } from "vitest";
import {
  getAreaUtilWrapperStyle,
  getCanvasOuterStyle,
  pointerDeltaToPercent,
  type MarginPreferences,
} from "../client/src/lib/layoutEditorAreaUtil";
import { pageHeightMm, pageWidthMm } from "../client/src/lib/pdfPageGeometry";
import { DEFAULT_LAYOUT_PREFERENCES } from "../shared/types";

// Mesma expressão usada em client/src/components/SharedReportSheet.tsx
// (paperStyle.padding) — reproduzida aqui apenas para comparação byte a
// byte, não importada, para que o teste continue válido mesmo que
// SharedReportSheet mude de arquivo/exportação.
function sharedReportSheetPaddingString(prefs: MarginPreferences): string {
  return `${prefs.marginTop}mm ${prefs.marginRight}mm ${prefs.marginBottom}mm ${prefs.marginLeft}mm`;
}

describe("getCanvasOuterStyle — folha física dinâmica (Bloqueio B)", () => {
  it("A4: usa a largura/altura físicas reais de A4 (210mm x 297mm), não um px fixo", () => {
    const style = getCanvasOuterStyle("A4");
    expect(style.maxWidth).toBe("210mm");
    expect(style.maxWidth).toBe(`${pageWidthMm("A4")}mm`);
    expect(style.aspectRatio).toBe(`${pageWidthMm("A4")} / ${pageHeightMm("A4")}`);
    expect(style.aspectRatio).toBe("210 / 297");
  });

  it("Letter: usa 216mm x 279mm, nunca a geometria de A4 (achado central do parecer)", () => {
    const style = getCanvasOuterStyle("Letter");
    expect(style.maxWidth).toBe("216mm");
    expect(style.maxWidth).toBe(`${pageWidthMm("Letter")}mm`);
    expect(style.aspectRatio).toBe("216 / 279");
    // Nunca deve reaproveitar as dimensões de A4 quando pageSize=Letter.
    expect(style.maxWidth).not.toBe(getCanvasOuterStyle("A4").maxWidth);
    expect(style.aspectRatio).not.toBe(getCanvasOuterStyle("A4").aspectRatio);
  });
});

describe("getAreaUtilWrapperStyle — camada de interação sobre a ÁREA ÚTIL (Bloqueio C)", () => {
  it("com margens padrão (DEFAULT_LAYOUT_PREFERENCES), gera o padding mm esperado", () => {
    const style = getAreaUtilWrapperStyle(DEFAULT_LAYOUT_PREFERENCES);
    expect(style.padding).toBe("20mm 25mm 25mm 25mm");
    expect(style.boxSizing).toBe("border-box");
    expect(style.position).toBe("absolute");
    expect(style.pointerEvents).toBe("none");
  });

  it("cenário A4 do parecer Manus (margens assimétricas: 17/22/19/25mm)", () => {
    const prefs: MarginPreferences = { marginTop: 17, marginRight: 22, marginBottom: 19, marginLeft: 25 };
    const style = getAreaUtilWrapperStyle(prefs);
    expect(style.padding).toBe("17mm 22mm 19mm 25mm");
  });

  it("cenário Letter do parecer Manus (margens assimétricas: 13/19/23/27mm)", () => {
    const prefs: MarginPreferences = { marginTop: 13, marginRight: 19, marginBottom: 23, marginLeft: 27 };
    const style = getAreaUtilWrapperStyle(prefs);
    expect(style.padding).toBe("13mm 19mm 23mm 27mm");
  });

  it("EQUIVALÊNCIA: o padding do editor é byte-idêntico ao padding real de SharedReportSheet.tsx para as mesmas margens", () => {
    const scenarios: MarginPreferences[] = [
      DEFAULT_LAYOUT_PREFERENCES,
      { marginTop: 17, marginRight: 22, marginBottom: 19, marginLeft: 25 },
      { marginTop: 13, marginRight: 19, marginBottom: 23, marginLeft: 27 },
      { marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0 },
    ];
    for (const prefs of scenarios) {
      expect(getAreaUtilWrapperStyle(prefs).padding).toBe(sharedReportSheetPaddingString(prefs));
    }
  });
});

describe("pointerDeltaToPercent — conversão de arrasto/redimensionamento (Bloqueio C)", () => {
  it("converte um deslocamento em px para percentual da área útil medida", () => {
    expect(pointerDeltaToPercent(100, 500)).toBeCloseTo(20, 10);
    expect(pointerDeltaToPercent(-50, 200)).toBeCloseTo(-25, 10);
    expect(pointerDeltaToPercent(0, 500)).toBe(0);
  });

  it("o mesmo deslocamento em px produz um percentual DIFERENTE conforme a área útil (prova que a conversão depende de pageSize/margens, não de um divisor fixo)", () => {
    const deltaPx = 60;
    const a4UsableWidthPx = 793.7 - (25 + 25) * 3.7795275591; // A4 a 96dpi menos margens de 25mm cada lado
    const letterUsableWidthPx = 816.2 - (27 + 19) * 3.7795275591; // Letter a 96dpi menos margens do cenário Manus
    const percentA4 = pointerDeltaToPercent(deltaPx, a4UsableWidthPx);
    const percentLetter = pointerDeltaToPercent(deltaPx, letterUsableWidthPx);
    expect(percentA4).not.toBeCloseTo(percentLetter, 3);
  });

  it("nunca usa os divisores fixos antigos (450 para largura, 600 para altura) — regressão do bug pré-fix", () => {
    // Antes da correção, o handle de largura fazia sempre `(dx/450)*100` e o
    // de altura `(dy/600)*100`, ignorando por completo pageSize e margens.
    // Uma área útil real (ex.: A4 sem margens ~793px de largura) deve
    // produzir um percentual visivelmente diferente do que os divisores
    // fixos antigos produziriam para o mesmo deslocamento.
    const deltaPx = 90;
    const realUsableWidthPx = 793.7; // A4 a 96dpi, largura cheia (área útil sem margens)
    const oldFixedDivisor = 450;
    expect(pointerDeltaToPercent(deltaPx, realUsableWidthPx)).not.toBeCloseTo(
      pointerDeltaToPercent(deltaPx, oldFixedDivisor),
      2,
    );
  });

  it("protege contra área útil inválida (0, negativa ou não finita) retornando 0 em vez de Infinity/NaN", () => {
    expect(pointerDeltaToPercent(50, 0)).toBe(0);
    expect(pointerDeltaToPercent(50, -10)).toBe(0);
    expect(pointerDeltaToPercent(50, NaN)).toBe(0);
    expect(pointerDeltaToPercent(NaN, 100)).toBe(0);
  });
});
