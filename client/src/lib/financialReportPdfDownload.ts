import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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
  const pageSize = preferences.pageSize === "Letter" ? "Letter" : "A4";
  const paperWidth = pageSize === "Letter" ? "216mm" : "210mm";
  const paperHeight = pageSize === "Letter" ? "279mm" : "297mm";
  const fontFamily = preferences.fontFamily || "Arial";
  const fontSize = Number(preferences.fontSize ?? 11);
  const lineHeight = Number(preferences.lineHeight ?? 1.6);
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
  const pages = sections.map((section, index) => `
    <article class="print-page" ${background ? `style="background-image:url('${background}')"` : ""}>
      <header>${logoHtml}<div class="header-spacer"></div></header>
      <section class="patient"><div>Nome do paciente: ${escapeHtml(patientName)}</div><div>Data de realização do exame: ${escapeHtml(studyDate)}</div><div>Modalidade: ${escapeHtml(report.modality || "—")}</div></section>
      <h1>${escapeHtml(section.title || "Laudo")}</h1>
      <main class="report-body">${withoutUnsupportedColors(section.body || "")}</main>
      ${index === sections.length - 1 ? doctorFooter : ""}
      ${footer ? `<img src="${footer}" class="unit-footer" alt="Rodapé" />` : ""}
    </article>`).join("");
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden;";
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentWindow?.document;
    if (!doc) throw new Error("Não foi possível inicializar o renderizador de PDF.");
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: ${pageSize} portrait; margin: 0; }
      * { box-sizing:border-box; } html,body { margin:0;padding:0;background:#fff;color:#111;font-family:${fontFamily},Arial,sans-serif; }
      .print-page { width:${paperWidth};height:${paperHeight};position:relative;overflow:hidden;padding:18mm 18mm 28mm;background:#fff center/cover no-repeat;page-break-after:always;font-size:${fontSize}pt;line-height:${lineHeight}; }
      .print-page:last-child { page-break-after:auto; } header { display:flex;align-items:center;gap:8px;min-height:18mm;border-bottom:1px solid #d0d0d0;padding-bottom:4mm; } header img { max-height:15mm;max-width:45mm;object-fit:contain; } .header-spacer { flex:1; }
      .patient { font-size:9.5pt;line-height:1.7;margin:6mm 0; } h1 { font-size:12pt;text-align:center;text-transform:uppercase;letter-spacing:.04em;margin:6mm 0 8mm; } .report-body { overflow-wrap:anywhere; } .report-body p,.report-body div { margin-bottom:3pt; }
      .doctor-footer { text-align:center;margin:12mm auto 0;max-width:65mm;page-break-inside:avoid;font-size:9pt; } .doctor-footer span { display:block;margin-top:2pt;color:#444; } .signature,.stamp { display:block;object-fit:contain;margin:0 auto 2mm; } .signature { max-width:45mm;max-height:13mm; } .stamp { max-width:53mm;max-height:24mm; } .signature-line { border-top:1px solid #333;width:45mm;margin:0 auto 2mm; }
      .unit-footer { position:absolute;bottom:0;left:0;width:100%;max-height:28mm;object-fit:contain; }
    </style></head><body>${pages}</body></html>`);
    doc.close();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await Promise.all(Array.from(doc.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); })));
    const sheetElements = Array.from(doc.querySelectorAll<HTMLElement>(".print-page"));
    if (!sheetElements.length) throw new Error("Não foi possível preparar as páginas do documento.");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: pageSize.toLowerCase() as "a4" | "letter" });
    for (let index = 0; index < sheetElements.length; index += 1) {
      const canvas = await html2canvas(sheetElements[index], { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 });
      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
    }
    pdf.save(`Laudo_${patientName.replace(/[^a-zA-Z0-9]+/g, "_") || "entregue"}.pdf`);
  } finally {
    iframe.remove();
  }
}
