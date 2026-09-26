// PDF do laudo entregue, baixado pelo médico na tela "Meu Financeiro"
// (client/src/pages/finance/FinanceMeuFinanceiro.tsx).
//
// FASE 3 DA UNIFICAÇÃO DOS GERADORES DE PDF (26/09/2026, plano aprovado
// pela Manus, Fase 2 já revisada): este arquivo deixou de construir seu
// próprio shell HTML (CSS de página fixo, header/patient/reserva de
// rodapé escritos à mão) e passou a usar exclusivamente a fábrica canônica
// (client/src/lib/reportDocumentRenderer.tsx), a mesma que o editor do
// médico e a lista de Estudos agora usam — layout, logos, dados do
// paciente, rodapé de assinatura e paginação real vêm todos de lá. Isso
// resolve a divergência original reportada por Alessandro (2026-09-26):
// o mesmo laudo saía com aparência diferente aqui, no editor e na lista.
//
// Mudanças de comportamento desta migração (intencionais, já decididas
// com Alessandro/Manus antes da Fase 2):
//   - Logos, dados do paciente e rodapé do médico (carimbo/assinatura/
//     nome/CRM/data) agora aparecem em TODA página física, não só na
//     última — antes, a faixa reservada para o rodapé ficava vazia em
//     toda página exceto a última.
//   - pageSize/margens/logos/fundo/imagem de rodapé vêm do MESMO layout
//     resolvido (resolveEffectiveReportLayout) usado pelo editor e pela
//     lista — não mais de um merge local duplicado.
//   - Nascimento/sexo do paciente continuam indisponíveis aqui (não há
//     mudança de banco nesta fase — ver reportDocumentModel.ts); o campo
//     é omitido no HTML gerado, exatamente como antes desta migração.

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { buildPdfPageBatch, pageHeightPx, pageWidthPx } from "./pdfPageGeometry";
import { ContentTooLargeForPageError } from "./reportPagination";
import {
  buildCanonicalPatient,
  buildDoctorFooterHtml,
  normalizeCanonicalLogos,
  resolveEffectiveReportLayout,
  type CanonicalLogo,
  type CanonicalReportStatus,
} from "./reportDocumentModel";
import { renderAllPhysicalPagesHtml, resolveEffectivePageGeometry, type ReportDocumentRenderModel } from "./reportDocumentRenderer";

function absoluteUrl(value: string | null | undefined) {
  return value?.startsWith("/") ? `${window.location.origin}${value}` : value || "";
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

export async function downloadFinancialReportPdf(documentData: any) {
  const report = documentData.report;
  // O router (financeSimple.myReportDownload) já garante status "signed"
  // ou "revised" antes de devolver o documento (FORBIDDEN caso contrário).
  const status = (report.status as CanonicalReportStatus) ?? "signed";

  // Único ponto de entrada de layout (Fase 1/2): nunca reimplementar merge
  // de snapshot/unidade aqui — resolveEffectiveReportLayout já decide.
  // Uma unidade que nunca configurou o Editor de Layout ainda deve
  // continuar permitindo o download (com a aparência padrão) — mesmo
  // comportamento de antes desta migração, que já operava com um objeto
  // de layout vazio nesse caso. resolveEffectiveReportLayout() só retorna
  // null quando NÃO há absolutamente nenhuma fonte (nem unidade, nem
  // snapshot); usamos um layout vazio como fallback final para esse caso.
  const effectiveLayout = resolveEffectiveReportLayout({
    status,
    unitLayout: documentData.layout ?? null,
    reportLayoutSnapshot: report.layout_snapshot ?? null,
  }) ?? {
    source: "unit" as const,
    preferences: {},
    header_html: null,
    footer_html: null,
    background_image_url: null,
    background_opacity: 1,
    background_size: "cover",
    footer_image_url: null,
    logos: null,
    block_positions: null,
  };
  const geometry = resolveEffectivePageGeometry(effectiveLayout);

  // URLs do MinIO/S3 não carregam sem autenticação dentro do iframe de
  // captura — todo recurso externo (logos, fundo, rodapé, assinatura,
  // carimbo) precisa ser convertido para base64 antes da renderização.
  const rawLogos = normalizeCanonicalLogos(effectiveLayout.logos, null);
  const [backgroundBase64, footerBase64, signatureBase64, stampBase64, ...logoBase64List] = await Promise.all([
    fetchToBase64(absoluteUrl(effectiveLayout.background_image_url)),
    fetchToBase64(absoluteUrl(effectiveLayout.footer_image_url)),
    fetchToBase64(absoluteUrl(documentData.signer?.signature_url)),
    fetchToBase64(absoluteUrl(documentData.signer?.stamp_url)),
    ...rawLogos.map((logo) => fetchToBase64(absoluteUrl(logo.url))),
  ]);
  const logos: CanonicalLogo[] = rawLogos.map((logo, index) => ({ ...logo, url: logoBase64List[index] || logo.url }));
  const layoutForRender = {
    ...effectiveLayout,
    background_image_url: backgroundBase64 || null,
    footer_image_url: footerBase64 || null,
  };

  // study_date vem do banco como timestamp — mesma extração de data usada
  // antes desta migração (slice dos 10 primeiros caracteres, formato ISO
  // AAAA-MM-DD), agora formatada pelo formatador canônico único
  // (buildCanonicalPatient/formatClinicalDate) em vez de um
  // split/reverse/join local.
  const rawStudyDate = report.study_date ? String(report.study_date).slice(0, 10) : null;
  const patient = buildCanonicalPatient({
    name: report.patient_name,
    // Nascimento/sexo não disponíveis nesta fase (ver cabeçalho do
    // arquivo) — omitidos no HTML gerado, igual ao comportamento anterior.
    birthDate: null,
    sex: null,
    studyDate: rawStudyDate,
    modality: report.modality,
    accessionNumber: null,
  });

  const signedAtFormatted = report.signed_at
    ? new Date(report.signed_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const doctorFooterHtml = buildDoctorFooterHtml({
    name: documentData.signer?.name || null,
    crm: documentData.signer?.crm || null,
    stampDataUrl: stampBase64 || null,
    signatureDataUrl: signatureBase64 || null,
    signedAtFormatted,
    status,
  });

  let sections: Array<{ title: string; bodyHtml: string }> = [
    { title: report.document_label || report.study_description || "Laudo", bodyHtml: withoutUnsupportedColors(report.body || "") },
  ];
  try {
    const parsed = JSON.parse(report.body);
    if (Array.isArray(parsed) && parsed.length && parsed.every((section: any) => section && typeof section.body === "string")) {
      sections = parsed.map((section: any) => ({ title: section.title, bodyHtml: withoutUnsupportedColors(section.body || "") }));
    }
  } catch {
    /* documento HTML simples (não é um JSON de seções) */
  }

  const model: ReportDocumentRenderModel = { layout: layoutForRender, logos, patient, doctorFooterHtml, sections };

  // Dimensões do iframe de captura derivam do pageSize efetivo (A4/Letter)
  // — mesmo padrão já usado nas outras 3 vias via pdfPageGeometry.ts.
  const framePxWidth = pageWidthPx(geometry.pageSize);
  const framePxHeight = pageHeightPx(geometry.pageSize);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${framePxWidth}px;height:${framePxHeight}px;border:0;visibility:hidden;`;
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentWindow?.document;
    if (!doc) throw new Error("Não foi possível inicializar o renderizador de PDF.");
    doc.open();
    // A geometria física (tamanho de papel, margens, posição de cada
    // bloco) agora vem inteiramente do SharedReportSheet (estilos inline
    // por elemento) — este documento só precisa de reset básico e do
    // espaçamento entre parágrafos do corpo do laudo.
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: ${geometry.pageSize} portrait; margin: 0; }
      * { box-sizing:border-box; } html,body { margin:0;padding:0;background:#fff; }
      .report-body p, .report-body div { margin-bottom:3pt; }
      @media print { .doctor-footer { page-break-inside: avoid; } }
    </style></head><body></body></html>`);
    doc.close();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Decide as páginas físicas (paginação real, medição de DOM) e monta
    // o HTML final e completo de cada uma — client/src/lib/
    // reportDocumentRenderer.tsx, Fase 2 da unificação.
    const pagesHtml = renderAllPhysicalPagesHtml(doc, model);
    doc.body.innerHTML = pagesHtml.join("");

    await new Promise((resolve) => setTimeout(resolve, 600));
    await Promise.all(
      Array.from(doc.images).map((image) =>
        image.complete ? Promise.resolve() : new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); }),
      ),
    );
    const sheetElements = Array.from(doc.querySelectorAll<HTMLElement>("[data-shared-report-sheet]"));
    if (!sheetElements.length) throw new Error("Não foi possível preparar as páginas do documento.");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: geometry.pageSize.toLowerCase() as "a4" | "letter" });
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
    pdf.save(`Laudo_${patient.name.replace(/[^a-zA-Z0-9]+/g, "_") || "entregue"}.pdf`);
  } catch (err) {
    // Mesmo tratamento dedicado de ContentTooLargeForPageError já
    // existente antes desta migração (ver histórico em
    // reportPagination.ts) — preservado integralmente.
    if (err instanceof ContentTooLargeForPageError) {
      throw new Error(`Não foi possível gerar o PDF: o conteúdo do laudo não coube na página. ${err.message}`);
    }
    throw new Error(`Não foi possível gerar o PDF: ${err instanceof Error ? err.message : "erro inesperado."}`);
  } finally {
    iframe.remove();
  }
}
