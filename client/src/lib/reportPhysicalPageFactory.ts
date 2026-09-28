import { paginateSectionIntoPages } from "./reportPagination";

export type PhysicalReportSection = {
  title: string;
  body: string;
};

export type PhysicalReportPage = {
  title: string;
  bodyHtml: string;
  footerHtml: string;
  isLast: boolean;
};

export type PhysicalPageRenderer = (page: PhysicalReportPage) => string;

export type MaterializePhysicalReportPagesOptions = {
  doc: Document;
  sections: PhysicalReportSection[];
  renderPage: PhysicalPageRenderer;
  finalFooterHtml?: string;
  /** Folhas transitórias que devem ser substituídas pela lista física final. */
  replaceSelector?: string;
  /** Marcador que identifica a área cuja altura efetiva será usada na paginação. */
  bodySelector?: string;
};

/**
 * Normaliza a representação persistida de um laudo numa lista de seções.
 * Corpo HTML legado preserva o título de fallback. Um array JSON válido preserva
 * os títulos gravados, inclusive quando tem somente uma seção.
 */
export function normalizeReportSections(
  rawBody: string | null | undefined,
  fallbackTitle: string,
): PhysicalReportSection[] {
  const raw = String(rawBody ?? "");
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => (
      item && typeof item === "object" && typeof (item as { body?: unknown }).body === "string"
    ))) {
      return parsed.map((item) => ({
        title: String((item as { title?: unknown }).title ?? fallbackTitle),
        body: String((item as { body: string }).body ?? ""),
      }));
    }
  } catch {
    // Formato legado HTML: usa a seção única abaixo.
  }
  return [{ title: fallbackTitle, body: raw }];
}

function appendHiddenShell(doc: Document, html: string): HTMLElement {
  const shell = doc.createElement("div");
  shell.style.cssText = "position:absolute;visibility:hidden;left:-99999px;top:0;";
  shell.innerHTML = html;
  doc.body.appendChild(shell);
  return shell;
}

/**
 * Constrói a lista final de folhas de um laudo no documento de destino.
 *
 * O mesmo `renderPage` é usado para a folha-modelo, as folhas de medição e
 * as folhas finais. Assim, largura, fonte, altura útil, reserva de assinatura
 * e CSS do corpo não podem divergir entre a decisão de paginação e a captura
 * ou impressão que o médico recebe.
 */
export function materializePhysicalReportPages({
  doc,
  sections,
  renderPage,
  finalFooterHtml = "",
  replaceSelector = ".print-page, .print-shared-sheet",
  bodySelector = ".report-body",
}: MaterializePhysicalReportPagesOptions): HTMLElement[] {
  const normalizedSections = sections.length > 0
    ? sections
    : [{ title: "Laudo", body: "" }];

  const firstShell = appendHiddenShell(doc, renderPage({
    title: normalizedSections[0].title,
    bodyHtml: "",
    footerHtml: finalFooterHtml,
    isLast: true,
  }));
  try {
    const body = firstShell.querySelector<HTMLElement>(bodySelector);
    if (!body || body.getBoundingClientRect().height <= 0) {
      throw new Error("Não foi possível medir a área útil da página para paginação.");
    }
  } finally {
    firstShell.remove();
  }

  const physicalPages: Array<{ title: string; bodyHtml: string }> = [];
  for (const section of normalizedSections) {
    const sourceContainer = appendHiddenShell(doc, section.body);
    const measuringShells: HTMLElement[] = [];
    try {
      const pagesHtml = paginateSectionIntoPages(sourceContainer, () => {
        const measuringShell = appendHiddenShell(doc, renderPage({
          title: section.title,
          bodyHtml: "",
          footerHtml: "",
          isLast: false,
        }));
        measuringShells.push(measuringShell);
        const body = measuringShell.querySelector<HTMLElement>(bodySelector);
        if (!body) throw new Error("A folha física não contém uma área de corpo paginável.");
        return body;
      });
      for (const bodyHtml of pagesHtml) physicalPages.push({ title: section.title, bodyHtml });
    } finally {
      measuringShells.forEach((shell) => shell.remove());
      sourceContainer.remove();
    }
  }

  if (physicalPages.length === 0) {
    physicalPages.push({ title: normalizedSections[0].title, bodyHtml: "" });
  }

  const pagesHtml = physicalPages.map((page, index) => renderPage({
    title: page.title,
    bodyHtml: page.bodyHtml,
    footerHtml: index === physicalPages.length - 1 ? finalFooterHtml : "",
    isLast: index === physicalPages.length - 1,
  })).join("");

  doc.querySelectorAll(replaceSelector).forEach((page) => page.remove());
  doc.body.insertAdjacentHTML("beforeend", pagesHtml);
  return Array.from(doc.querySelectorAll<HTMLElement>(".print-page"));
}
