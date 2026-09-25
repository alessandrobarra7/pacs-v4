import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { DEFAULT_LAYOUT_PREFERENCES } from "../../../shared/types";
import { buildPdfPageBatch, pageHeightPx, pageWidthPx } from "./pdfPageGeometry";
import { paginateSectionIntoPages } from "./reportPagination";

// CORREÇÃO (revisão Manus 2026-09-25, bloqueio "laudo único longo é
// cortado no PDF financeiro"): reserva fixa de altura para o bloco de
// assinatura/carimbo do médico, sempre presente na folha (vazia nas
// páginas que não são a última do documento, preenchida na última) — ver
// mecanismo completo no comentário grande logo abaixo de downloadFinancialReportPdf.
const FOOTER_RESERVE_MM = 50;

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

export async function downloadFinancialReportPdf(documentData: any) {
  const report = documentData.report;
  const layout = { ...(documentData.layout ?? {}), ...(report.layout_snapshot ?? {}) } as Record<string, any>;
  const preferences = (layout.preferences ?? {}) as Record<string, any>;
  // CORREÇÃO (auditoria claude/correcao-paginas-laudo-pdf): este arquivo lia
  // pageSize/fontFamily/fontSize/lineHeight das preferências, mas as margens
  // do laudo (marginTop/marginBottom/marginLeft/marginRight) nunca eram
  // lidas — o CSS abaixo usava "padding:16mm 18mm 30mm" fixo, sempre, para
  // qualquer unidade, mesmo quando o administrador configurava margens
  // diferentes no editor de layout. Agora todas as preferências (incluindo
  // margens) vêm do mesmo merge com DEFAULT_LAYOUT_PREFERENCES usado em
  // ReportDocument.tsx, ReportEditorPage.tsx e PacsQueryPage.tsx.
  const effPrefs = { ...DEFAULT_LAYOUT_PREFERENCES, ...preferences };
  const pageSize = effPrefs.pageSize === "Letter" ? "Letter" : "A4";
  const paperWidth = pageSize === "Letter" ? "216mm" : "210mm";
  const paperHeight = pageSize === "Letter" ? "279mm" : "297mm";
  const fontFamily = effPrefs.fontFamily || "Arial";
  const fontSize = Number(effPrefs.fontSize ?? 11);
  const lineHeight = Number(effPrefs.lineHeight ?? 1.6);
  const footerReservedMm = layout.footer_image_url ? 30 : 0;
  const marginTop = Number(effPrefs.marginTop);
  const marginRight = Number(effPrefs.marginRight);
  const marginBottom = Number(effPrefs.marginBottom) + footerReservedMm;
  const marginLeft = Number(effPrefs.marginLeft);
  const logos = Array.isArray(layout.logos) ? layout.logos.filter((logo: any) => logo?.url).slice(0, 3) : [];
  const [background, footer, signature, stamp, ...logoUrls] = await Promise.all([
    fetchToBase64(absoluteUrl(layout.background_image_url)),
    fetchToBase64(absoluteUrl(layout.footer_image_url)),
    fetchToBase64(absoluteUrl(documentData.signer?.signature_url)),
    fetchToBase64(absoluteUrl(documentData.signer?.stamp_url)),
    ...logos.map((logo: any) => fetchToBase64(absoluteUrl(logo.url))),
  ]);
  const patientName = String(report.patient_name ?? "Paciente não identificado").replace(/\^/g, " ").replace(/\s+/g, " ").trim();
  const rawDate = report.study_date ? String(report.study_date).slice(0, 10) : "";
  const studyDate = rawDate.includes("-") ? rawDate.split("-").reverse().join("/") : "—";
  const signedAt = report.signed_at ? new Date(report.signed_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  let sections: Array<{ title: string; body: string }> = [{ title: report.document_label || report.study_description || "Laudo", body: report.body || "" }];
  try {
    const parsed = JSON.parse(report.body);
    if (Array.isArray(parsed) && parsed.length && parsed.every((section) => section && typeof section.body === "string")) sections = parsed;
  } catch { /* documento HTML simples */ }
  const logoHtml = logoUrls.filter(Boolean).map((url, index) => `<img src="${url}" alt="Logo ${index + 1}" />`).join("");
  const doctorFooter = `
    <div class="doctor-footer">
      ${stamp ? `<img src="${stamp}" class="stamp" alt="Carimbo" />` : ""}
      ${signature ? `<img src="${signature}" class="signature" alt="Assinatura" />` : ""}
      <div class="signature-line"></div>
      <strong>${escapeHtml(documentData.signer?.name)}${report.status === "revised" ? " — RETIFICADO" : ""}</strong>
      ${documentData.signer?.crm ? `<span>CRM: ${escapeHtml(documentData.signer.crm)}</span>` : ""}
      ${signedAt ? `<span>Assinado em: ${escapeHtml(signedAt)}</span>` : ""}
    </div>`;
  // CORREÇÃO (revisão Manus 2026-09-25, bloqueio "laudo único longo é
  // cortado no PDF financeiro"): antes, cada seção virava exatamente UMA
  // `.print-page` de altura fixa com `overflow:hidden` — uma seção cujo
  // conteúdo excedesse a altura disponível simplesmente tinha o restante
  // cortado, e a assinatura podia ficar sobreposta ao texto cortado na
  // última página. A Manus reproduziu isso visualmente com um laudo
  // sintético de seção única com 115 parágrafos: o PDF saiu com uma única
  // página, cortada na seção 13, sem os parágrafos restantes.
  //
  // Agora o conteúdo de cada seção é PAGINADO ANTES da captura: medimos a
  // altura real de cada bloco (parágrafo, título, tabela etc.) dentro do
  // próprio iframe de renderização (mesma largura/fonte da captura final)
  // e decidimos em qual folha física cada bloco entra, sem nunca cortar um
  // bloco no meio (client/src/lib/reportPagination.ts). Cada seção pode
  // virar uma ou mais folhas físicas — uma seção não é mais sinônimo de
  // uma página. Cabeçalho e dados do paciente se repetem em toda folha
  // gerada; a assinatura/carimbo do médico (`doctorFooter`) só aparece na
  // ÚLTIMA folha física do documento inteiro, nunca sobreposta ao corpo,
  // porque toda folha reserva o mesmo espaço fixo para ela
  // (`.footer-reserve`, FOOTER_RESERVE_MM) esteja ou não preenchida — isso
  // garante que a altura disponível para o corpo (medida uma única vez, a
  // partir de uma folha-modelo vazia) seja idêntica em todas as folhas,
  // vazias ou não.
  const buildPageShell = (title: string, bodyHtml: string, footerReserveHtml: string) => `
    <article class="print-page" ${background ? `style="background-image:url('${background}')"` : ""}>
      <header>${logoHtml}<div class="header-spacer"></div></header>
      <section class="patient"><div>Nome do paciente: ${escapeHtml(patientName)}</div><div>Data de realização do exame: ${escapeHtml(studyDate)}</div><div>Modalidade: ${escapeHtml(report.modality || "—")}</div></section>
      <h1>${escapeHtml(title || "Laudo")}</h1>
      <main class="report-body">${bodyHtml}</main>
      <div class="footer-reserve">${footerReserveHtml}</div>
      ${footer ? `<img src="${footer}" class="unit-footer" alt="Rodapé" />` : ""}
    </article>`;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  // CORREÇÃO (auditoria independente 2026-09-25, Achado 2, confirmado pela
  // Manus): o iframe de captura ficava fixo em 794x1123px (proporção A4),
  // e o html2canvas era chamado com windowWidth:794 fixo — independente do
  // pageSize efetivo da unidade. Diferente das outras vias já corrigidas
  // (Bloqueio 1, ReportEditorPage.tsx/PacsQueryPage.tsx), este arquivo não
  // usava o módulo compartilhado pdfPageGeometry.ts. Agora as dimensões do
  // iframe e o windowWidth do html2canvas derivam de pageSize (A4/Letter),
  // e cada folha capturada passa por clampImageToPage antes do addImage,
  // igual ao padrão das demais 3 vias.
  const framePxWidth = pageWidthPx(pageSize);
  const framePxHeight = pageHeightPx(pageSize);
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${framePxWidth}px;height:${framePxHeight}px;border:0;visibility:hidden;`;
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentWindow?.document;
    if (!doc) throw new Error("Não foi possível inicializar o renderizador de PDF.");
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: ${pageSize} portrait; margin: 0; }
      * { box-sizing:border-box; } html,body { margin:0;padding:0;background:#fff;color:#111;font-family:${fontFamily},Arial,sans-serif; }
      .print-page { width:${paperWidth};height:${paperHeight};position:relative;overflow:hidden;padding:${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;background:#fff center/cover no-repeat;page-break-after:always;font-size:${fontSize}pt;line-height:${lineHeight};display:flex;flex-direction:column; }
      .print-page:last-child { page-break-after:auto; } header { display:flex;align-items:center;gap:8px;min-height:18mm;border-bottom:1px solid #d0d0d0;padding-bottom:4mm; } header img { max-height:15mm;max-width:45mm;object-fit:contain; } .header-spacer { flex:1; }
      .patient { font-size:9.5pt;line-height:1.7;margin:5mm 0; } h1 { font-size:12pt;text-align:center;text-transform:uppercase;letter-spacing:.04em;margin:4mm 0 7mm; } .report-body { flex:1;min-height:0;overflow-wrap:anywhere;overflow:hidden; } .report-body p,.report-body div { margin-bottom:3pt; }
      .footer-reserve { min-height:${FOOTER_RESERVE_MM}mm;display:flex;align-items:flex-end;justify-content:center; }
      .doctor-footer { text-align:center;margin:0 auto 3mm;max-width:65mm;page-break-inside:avoid;font-size:9pt; } .doctor-footer span { display:block;margin-top:2pt;color:#444; } .signature,.stamp { display:block;object-fit:contain;margin:0 auto 2mm; } .signature { max-width:45mm;max-height:13mm; } .stamp { max-width:53mm;max-height:24mm; } .signature-line { border-top:1px solid #333;width:45mm;margin:0 auto 2mm; }
      .unit-footer { position:absolute;bottom:0;left:0;width:100%;max-height:28mm;object-fit:contain; }
    </style></head><body></body></html>`);
    doc.close();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // ── Checagem preventiva: a área útil do corpo é medível? ────────────
    // Não usamos mais este número para DECIDIR a paginação (ver bloco
    // abaixo) — a decisão agora vem da inserção incremental real em cada
    // folha. Mas uma folha-modelo com área útil <= 0 (layout mal
    // configurado, CSS não carregado etc.) faria a paginação real falhar
    // de forma confusa (todo conteúdo pareceria "maior que a página");
    // verificar aqui dá um erro claro e cedo.
    const sanityWrapper = doc.createElement("div");
    sanityWrapper.style.cssText = "position:absolute;visibility:hidden;left:-99999px;top:0;";
    sanityWrapper.innerHTML = buildPageShell(sections[0]?.title || "Laudo", "", doctorFooter);
    doc.body.appendChild(sanityWrapper);
    const sanityBodyEl = sanityWrapper.querySelector<HTMLElement>(".report-body");
    const sanityAvailableHeightPx = sanityBodyEl?.getBoundingClientRect().height ?? 0;
    doc.body.removeChild(sanityWrapper);
    if (sanityAvailableHeightPx <= 0) throw new Error("Não foi possível medir a área útil da página para paginação.");

    // ── Paginar cada seção antes da captura ─────────────────────────────
    // CORREÇÃO (Parecer de revisão da Manus, 2026-09-25, bloqueios B1/B2/
    // B3): a versão anterior somava alturas pré-medidas de cada
    // filho-elemento, sem contar margens, e ignorava nós de texto soltos
    // (fora de tag) — a Manus mediu 23px de conteúdo excedente aceito
    // indevidamente com esse método. Agora, em vez de somar alturas,
    // inserimos incrementalmente clones reais de CADA nó do corpo
    // (elementos e texto solto) numa folha física real e verificamos
    // `scrollHeight <= clientHeight` após cada inserção — isso conta
    // corretamente margens, colapso de margem e qualquer regra de CSS
    // real, e nunca perde texto solto. Um bloco que não caiba nem sozinho
    // numa página vazia é fragmentado por palavra (parágrafo/texto
    // simples) ou interrompe a geração com um erro explícito — nunca
    // produz um PDF com conteúdo cortado silenciosamente. Ver
    // client/src/lib/reportPagination.ts (paginateSectionIntoPages) para
    // o mecanismo completo.
    const physicalPages: Array<{ title: string; bodyHtml: string }> = [];
    for (const section of sections) {
      const sourceContainer = doc.createElement("div");
      sourceContainer.style.cssText = "position:absolute;visibility:hidden;left:-99999px;top:0;";
      sourceContainer.innerHTML = withoutUnsupportedColors(section.body || "");
      doc.body.appendChild(sourceContainer);

      const measuringShells: HTMLElement[] = [];
      const pagesHtmlForSection = paginateSectionIntoPages(sourceContainer, () => {
        const shell = doc.createElement("div");
        shell.style.cssText = "position:absolute;visibility:hidden;left:-99999px;top:0;";
        // Mesma estrutura/CSS da folha final (altura fixa, footer-reserve
        // presente) — é o que torna scrollHeight/clientHeight do corpo
        // significativos. footerReserveHtml fica vazio aqui: a reserva já
        // tem altura mínima fixa (FOOTER_RESERVE_MM) independente de estar
        // preenchida, então não afeta a área útil medida.
        shell.innerHTML = buildPageShell(section.title, "", "");
        doc.body.appendChild(shell);
        measuringShells.push(shell);
        return shell.querySelector<HTMLElement>(".report-body")!;
      });
      measuringShells.forEach((shell) => doc.body.removeChild(shell));
      doc.body.removeChild(sourceContainer);

      for (const bodyHtml of pagesHtmlForSection) {
        physicalPages.push({ title: section.title, bodyHtml });
      }
    }
    if (physicalPages.length === 0) physicalPages.push({ title: sections[0]?.title || "Laudo", bodyHtml: "" });

    const pagesHtml = physicalPages
      .map((page, index) => buildPageShell(page.title, page.bodyHtml, index === physicalPages.length - 1 ? doctorFooter : ""))
      .join("");
    doc.body.innerHTML = pagesHtml;

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
  } finally {
    iframe.remove();
  }
}
