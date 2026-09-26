// Funções puras de geometria do editor de layout (LayoutEditorPage.tsx),
// extraídas para permitir testes de regressão reais sem precisar de um
// motor de layout de verdade (jsdom não calcula CSS de fato).
//
// Contexto (parecer Manus 2026-09-25, "equivalência visual editor/PDF"):
// o canvas do editor desenhava sempre uma folha A4 fixa (595x842px) e
// nunca aplicava pageSize/margens da unidade, então o preview que orienta
// o operador não representava a folha física realmente entregue no
// download/impressão para unidades com margens não nulas ou Letter.
//
// Estas funções centralizam a MESMA regra de folha física (pageSize) e de
// caixa de padding (margens em mm) que client/src/components/SharedReportSheet.tsx
// usa internamente, para que o canvas do editor e a folha entregue no PDF
// fiquem estruturalmente equivalentes.

import type { LayoutPreferences } from "../../../shared/types";
import { pageHeightMm, pageWidthMm } from "./pdfPageGeometry";

export interface CanvasOuterStyle {
  width: string;
  maxWidth: string;
  aspectRatio: string;
}

/**
 * Estilo do canvas físico do editor: usa a mesma folha (A4/Letter) do PDF
 * real, em vez do tamanho A4 fixo hardcoded que existia antes (Bloqueio B).
 * `aspectRatio` garante que a altura renderizada acompanhe a largura
 * disponível na tela mantendo a proporção física correta da página.
 */
export function getCanvasOuterStyle(pageSize: LayoutPreferences["pageSize"]): CanvasOuterStyle {
  const widthMm = pageWidthMm(pageSize);
  const heightMm = pageHeightMm(pageSize);
  return {
    width: "100%",
    maxWidth: `${widthMm}mm`,
    aspectRatio: `${widthMm} / ${heightMm}`,
  };
}

export type MarginPreferences = Pick<LayoutPreferences, "marginTop" | "marginRight" | "marginBottom" | "marginLeft">;

export interface AreaUtilWrapperStyle {
  position: "absolute";
  inset: number;
  padding: string;
  boxSizing: "border-box";
  pointerEvents: "none";
}

/**
 * Camada de interação do editor (arrastar/redimensionar blocos) com a MESMA
 * caixa de padding em mm que SharedReportSheet.tsx aplica na folha real
 * (`padding: marginTop marginRight marginBottom marginLeft`, todos em mm).
 * Isso garante que os overlays fiquem posicionados sobre a ÁREA ÚTIL real
 * (folha menos margens) — a mesma referência usada pelo PDF/impressão — e
 * não sobre a folha inteira (Bloqueio C).
 */
export function getAreaUtilWrapperStyle(prefs: MarginPreferences): AreaUtilWrapperStyle {
  return {
    position: "absolute",
    inset: 0,
    padding: `${prefs.marginTop}mm ${prefs.marginRight}mm ${prefs.marginBottom}mm ${prefs.marginLeft}mm`,
    boxSizing: "border-box",
    pointerEvents: "none",
  };
}

/**
 * Converte um deslocamento de ponteiro (em px, medido na tela) em percentual
 * da área útil, dado o tamanho em px de uma caixa já medida via
 * `getBoundingClientRect()` (a área útil real, não a folha inteira).
 * Usada tanto para arrastar (posição) quanto para redimensionar (largura/altura)
 * blocos — antes, o redimensionar usava divisores fixos (450/600) que
 * ignoravam pageSize e margens (Bloqueio C).
 */
export function pointerDeltaToPercent(deltaPx: number, usableSizePx: number): number {
  if (!Number.isFinite(deltaPx) || !Number.isFinite(usableSizePx) || usableSizePx <= 0) return 0;
  return (deltaPx / usableSizePx) * 100;
}
