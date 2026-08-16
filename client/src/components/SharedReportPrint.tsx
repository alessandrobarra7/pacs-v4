import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { type SharedReportSheetProps } from "./SharedReportSheet";
import { ClinicalReportSheet } from "./ClinicalReportSheet";

/**
 * Renderiza a mesma folha React usada no admin e no editor clínico como HTML
 * estático para a janela de impressão. Não mantém um segundo contrato visual.
 */
export function renderSharedReportSheetHtml(props: SharedReportSheetProps): string {
  return renderToStaticMarkup(createElement(ClinicalReportSheet, props));
}
