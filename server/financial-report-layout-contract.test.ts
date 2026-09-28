import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveFinancialReportLayout } from "../client/src/lib/financialReportPdfDownload";

const pageSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/finance/FinanceMeuFinanceiro.tsx"),
  "utf8",
);

describe("PDF do módulo Financeiro — contrato canônico de layout", () => {
  const unitLayout = {
    preferences: {
      pageSize: "Letter",
      marginTop: 26,
      marginRight: 21,
      marginBottom: 27,
      marginLeft: 22,
      fontFamily: "Arial",
      fontSize: 10,
      lineHeight: 1.5,
    },
    background_image_url: "/current-background.png",
    footer_image_url: "/current-footer.png",
    logos: [{ url: "/current-logo.png", width: 180, height: 60, label: "Atual" }],
  };

  it("prioriza o snapshot clínico em laudo assinado e preserva o fallback somente para campos ausentes", () => {
    const result = resolveFinancialReportLayout({
      layout: unitLayout,
      report: {
        status: "signed",
        layout_snapshot: {
          preferences: { pageSize: "A4", marginTop: 14, fontFamily: "Georgia" },
          logos: null,
          footer_image_url: null,
        },
      },
    });

    expect(result.source).toBe("snapshot");
    expect(result.preferences).toMatchObject({
      pageSize: "A4",
      marginTop: 14,
      marginRight: 21,
      marginBottom: 27,
      marginLeft: 22,
      fontFamily: "Georgia",
    });
    expect(result.logos).toBeNull();
    expect(result.footer_image_url).toBeNull();
    expect(result.background_image_url).toBe("/current-background.png");
  });

  it("mantém a unidade como fallback para documentos históricos sem snapshot", () => {
    const result = resolveFinancialReportLayout({
      layout: unitLayout,
      report: { status: "revised", layout_snapshot: null },
    });

    expect(result.source).toBe("unitLayout");
    expect(result.preferences).toMatchObject({ pageSize: "Letter", marginTop: 26, fontFamily: "Arial" });
    expect(result.logos).toEqual(unitLayout.logos);
    expect(result.footer_image_url).toBe("/current-footer.png");
  });

  it("remove o motor financeiro morto da página e delega o download ao único gerador efetivo", () => {
    expect(pageSource).toContain("downloadFinancialReportPdf(documentData)");
    expect(pageSource).not.toContain("async function downloadFinancialPdf");
    expect(pageSource).not.toContain('import jsPDF from "jspdf"');
    expect(pageSource).not.toContain('import html2canvas from "html2canvas"');
  });
});
