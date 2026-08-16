import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { SharedReportSheet, type SharedReportSheetProps } from "./SharedReportSheet";

/**
 * Renderiza a mesma folha React usada no admin e no editor clínico como HTML
 * estático para a janela de impressão. Não mantém um segundo contrato visual.
 */
export function renderSharedReportSheetHtml(props: SharedReportSheetProps): string {
  return renderToStaticMarkup(createElement(SharedReportSheet, props));
}
