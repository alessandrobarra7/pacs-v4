import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  resolveEffectiveReportLayout,
  type ReportLayoutSource,
  type ReportLogo,
} from "../../../shared/reportLayout";
import { buildPdfPageBatch, pageHeightPx, pageWidthPx } from "./pdfPageGeometry";
import { ContentTooLargeForPageError } from "./reportPagination";
import {
  materializePhysicalReportPages,
  normalizeReportSections,
} from "./reportPhysicalPageFactory";
import {
  createPhysicalReportSheetRenderer,
  REPORT_PHYSICAL_BODY_SELECTOR,
} from "./reportPhysicalSheetRenderer";

function absoluteUrl(value: string | null | undefined) {
  return value?.startsWith("/") ? `${window.location.origin}${value}` : value || "";
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

function withoutUnsupportedColors(html: string) {
  return html.replace(/(?:color|background(?:-color)?|border(?:-color)?):\s*oklch\([^;)}]+\)\s*;?/gi, "");
}

async function fetchToBase64(url: string) {
  if (!url) return "";
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return url;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

function formatStudyDate(value: unknown) {
  const raw = value ? String(value).slice(0, 10) : "";
  return raw.includes("-") ? raw.split("-").reverse().join("/") : raw || "—";
}

/**
 * Resolve a única fonte de layout do PDF financeiro. O download só é aceito
 * para laudos assinados/retificados, portanto o snapshot clínico vence quando
 * existe; documentos históricos sem snapshot continuam usando a unidade.
 */
export function resolveFinancialReportLayout(documentData: {
  layout?: unknown;
  report?: { status?: string | null; layout_snapshot?: unknown };
}) {
  return resolveEffectiveReportLayout({
    status: documentData.report?.status,
    unitLayout: documentData.layout as ReportLayoutSource | null | undefined,
    reportLayoutSnapshot: documentData.report?.layout_snapshot as ReportLayoutSource | null | undefined,
  });
}

export async function downloadFinancialReportPdf(documentData: any) {
  const report = documentData.report;
  const effectiveLayout = resolveFinancialReportLayout(documentData);
  const effPrefs = effectiveLayout.preferences;
  const pageSize = effPrefs.pageSize === "Letter" ? "Letter" : "A4";
  const logos = (effectiveLayout.logos ?? []).filter((logo) => logo?.url).slice(0, 3);
  const [background, footer, signature, stamp, ...logoUrls] = await Promise.all([
    fetchToBase64(absoluteUrl(effectiveLayout.background_image_url)),
    fetchToBase64(absoluteUrl(effectiveLayout.footer_image_url)),
    fetchToBase64(absoluteUrl(documentData.signer?.signature_url)),
    fetchToBase64(absoluteUrl(documentData.signer?.stamp_url)),
    ...logos.map((logo: ReportLogo) => fetchToBase64(absoluteUrl(logo.url))),
  ]);
  const patientName = String(report.patient_name ?? "Paciente não identificado").replace(/\^/g, " ").replace(/\s+/g, " ").trim();
  const studyDate = formatStudyDate(report.study_date);
  const signedAt = report.signed_at ? new Date(report.signed_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const sections = normalizeReportSections(
    report.body,
    report.document_label || report.study_description || "Laudo",
  );
  const printLogos: ReportLogo[] = logos.map((logo: ReportLogo, index: number) => ({
    ...logo,
    url: logoUrls[index] || absoluteUrl(logo.url) || logo.url,
  }));
  const doctorFooter = `
    <div class="doctor-footer">
      ${stamp ? `<img src="${stamp}" class="stamp" alt="Carimbo" />` : ""}
      ${signature ? `<img src="${signature}" class="signature" alt="Assinatura" />` : ""}
      <div class="signature-line"></div>
      <strong>${escapeHtml(documentData.signer?.name)}${report.status === "revised" ? " — RETIFICADO" : ""}</strong>
      ${documentData.signer?.crm ? `<span>CRM: ${escapeHtml(documentData.signer.crm)}</span>` : ""}
      ${signedAt ? `<span>Assinado em: ${escapeHtml(signedAt)}</span>` : ""}
    </div>`;

  const renderPhysicalPage = createPhysicalReportSheetRenderer({
    layout: effectiveLayout,
    patient: {
      name: patientName,
      birthDate: "—",
      sex: "—",
      studyDate,
      modality: report.modality || undefined,
    },
    assets: {
      logos: printLogos,
      backgroundUrl: background || absoluteUrl(effectiveLayout.background_image_url),
      footerImageUrl: footer || absoluteUrl(effectiveLayout.footer_image_url),
    },
  });

  const framePxWidth = pageWidthPx(pageSize);
  const framePxHeight = pageHeightPx(pageSize);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${framePxWidth}px;height:${framePxHeight}px;border:0;visibility:hidden;`;
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentWindow?.document;
    if (!doc) throw new Error("Não foi possível inicializar o renderizador de PDF.");
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: ${pageSize} portrait; margin: 0; }
      * { box-sizing:border-box; }
      html,body { margin:0;padding:0;background:#fff;color:#111;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important; }
      .print-page { page-break-after:always;break-after:page;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important; }
      .print-page:last-child { page-break-after:auto;break-after:avoid; }
      .print-page [data-layout-block="body"] { overflow:hidden!important; }
      .report-body { font-size:${effPrefs.fontSize}pt;line-height:${effPrefs.lineHeight}; }
      .report-body p,.report-body div { margin-bottom:3pt; }
      .doctor-footer { text-align:center;margin:0 auto;max-width:65mm;page-break-inside:avoid;font-size:9pt; }
      .doctor-footer span { display:block;margin-top:2pt;color:#444; }
      .signature,.stamp { display:block;object-fit:contain;margin:0 auto 2mm; }
      .signature { max-width:45mm;max-height:13mm; }
      .stamp { max-width:53mm;max-height:24mm; }
      .signature-line { border-top:1px solid #333;width:45mm;margin:0 auto 2mm; }
    </style></head><body></body></html>`);
    doc.close();
    await new Promise((resolve) => setTimeout(resolve, 200));

    materializePhysicalReportPages({
      doc,
      sections: sections.map((section) => ({ ...section, body: withoutUnsupportedColors(section.body) })),
      renderPage: renderPhysicalPage,
      finalFooterHtml: doctorFooter,
      replaceSelector: ".print-page, .print-shared-sheet",
      bodySelector: REPORT_PHYSICAL_BODY_SELECTOR,
    });

    await new Promise((resolve) => setTimeout(resolve, 600));
    await Promise.all(Array.from(doc.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); })));
    const sheetElements = Array.from(doc.querySelectorAll<HTMLElement>(".print-page"));
    if (!sheetElements.length) throw new Error("Não foi possível preparar as páginas do documento.");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: pageSize.toLowerCase() as "a4" | "letter" });
    const pdfPageWidth = pdf.internal.pageSize.getWidth();
    const pdfPageHeight = pdf.internal.pageSize.getHeight();
    const canvases = [];
    for (let index = 0; index < sheetElements.length; index += 1) {
      const canvas = await html2canvas(sheetElements[index], { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: framePxWidth });
      canvases.push(canvas);
    }
    const batch = buildPdfPageBatch(canvases, pdfPageWidth, pdfPageHeight);
    for (let index = 0; index < canvases.length; index += 1) {
      const entry = batch[index];
      if (entry.addPageBefore) pdf.addPage();
      pdf.addImage(canvases[index].toDataURL("image/png"), "PNG", entry.xOffset, 0, entry.width, entry.height);
    }
    pdf.save(`Laudo_${patientName.replace(/[^a-zA-Z0-9]+/g, "_") || "entregue"}.pdf`);
  } catch (err) {
    if (err instanceof ContentTooLargeForPageError) {
      throw new Error(`Não foi possível gerar o PDF: o conteúdo do laudo não coube na página. ${err.message}`);
    }
    throw new Error(`Não foi possível gerar o PDF: ${err instanceof Error ? err.message : "erro inesperado."}`);
  } finally {
    iframe.remove();
  }
}