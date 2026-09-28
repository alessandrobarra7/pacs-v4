import { createElement } from "react";
import { ClinicalPatientDetails, ClinicalPatientName } from "@/components/ClinicalPatientDetails";
import { renderSharedReportSheetHtml } from "@/components/SharedReportPrint";
import type { EffectiveReportLayout, ReportLogo } from "../../../shared/reportLayout";
import type { PhysicalPageRenderer } from "./reportPhysicalPageFactory";

/**
 * A área externa `data-layout-block="body"` controla a posição no canvas.
 * A paginação precisa medir a área interna, pois esta é o container que
 * recebe os nós clínicos. Medir o bloco externo manteria um wrapper vazio
 * como filho flex e faria a fragmentação aceitar apenas um bloco por página.
 */
export const REPORT_PHYSICAL_BODY_SELECTOR = "[data-report-body-content]";

const FONT_STACKS: Record<string, string> = {
  Arial: "Arial, Helvetica, sans-serif",
  "Times New Roman": '"Times New Roman", Times, serif',
  Georgia: 'Georgia, "Times New Roman", serif',
  Helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  Verdana: "Verdana, Geneva, sans-serif",
};

export type CanonicalReportPatient = {
  name: string;
  birthDate?: string | null;
  sex?: string | null;
  studyDate?: string | null;
  modality?: string | null;
  unitName?: string | null;
};

export type CanonicalReportAssets = {
  /** URLs já preparadas pelo consumidor (por exemplo, convertidas para base64 no iframe). */
  logos?: ReportLogo[] | null;
  backgroundUrl?: string | null;
  footerImageUrl?: string | null;
};

export type FooterImagePageScope = "all" | "last";

export type PhysicalReportSheetRendererOptions = {
  layout: EffectiveReportLayout;
  patient: CanonicalReportPatient;
  assets?: CanonicalReportAssets;
  /**
   * A regra canônica final usa a arte de rodapé em todas as páginas. O modo
   * `last` existe somente para migração controlada de fluxos legados.
   */
  footerImagePageScope?: FooterImagePageScope;
};

function assetOrLayout<T>(
  assets: CanonicalReportAssets | undefined,
  key: keyof CanonicalReportAssets,
  layoutValue: T,
): T {
  if (assets && Object.hasOwn(assets, key)) return assets[key] as T;
  return layoutValue;
}

function normalizeOpacity(value: string | number | null): number {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 1;
}

function resolveFontStack(fontFamily: string | null | undefined): string {
  const value = fontFamily?.trim() || "Arial";
  return FONT_STACKS[value] ?? `${value}, Arial, sans-serif`;
}

export function physicalReportPaperWidth(pageSize: "A4" | "Letter"): string {
  return pageSize === "Letter" ? "216mm" : "210mm";
}

/**
 * Cria a única casca visual de folha física para Editor, Lista PACS e PDF
 * Financeiro. O conteúdo clínico e o rodapé final continuam chegando pelo
 * contrato da fábrica; a posição e a aparência dos blocos vêm exclusivamente
 * do EffectiveReportLayout e do SharedReportSheet.
 */
export function createPhysicalReportSheetRenderer({
  layout,
  patient,
  assets,
  footerImagePageScope = "all",
}: PhysicalReportSheetRendererOptions): PhysicalPageRenderer {
  const preferences = layout.preferences;
  const pageSize = preferences.pageSize === "Letter" ? "Letter" : "A4";
  const paperWidth = physicalReportPaperWidth(pageSize);
  const logos = assetOrLayout<ReportLogo[] | null>(assets, "logos", layout.logos) ?? [];
  const backgroundUrl = assetOrLayout<string | null>(assets, "backgroundUrl", layout.background_image_url);
  const footerImageUrl = assetOrLayout<string | null>(assets, "footerImageUrl", layout.footer_image_url);

  return ({ title, bodyHtml, footerHtml, isLast }) => renderSharedReportSheetHtml({
    className: "print-page",
    pageSize,
    marginTop: preferences.marginTop,
    marginRight: preferences.marginRight,
    marginBottom: preferences.marginBottom,
    marginLeft: preferences.marginLeft,
    positions: layout.block_positions,
    logos,
    backgroundUrl,
    backgroundOpacity: normalizeOpacity(layout.background_opacity),
    backgroundSize: layout.background_size === "contain" ? "contain" : "cover",
    footerImageUrl: footerImagePageScope === "all" || isLast ? footerImageUrl : null,
    fontFamily: resolveFontStack(preferences.fontFamily),
    fontSize: preferences.fontSize,
    lineHeight: preferences.lineHeight,
    // A medição ocorre num shell oculto e fora do fluxo. Sem largura física
    // explícita, `width: 100%` herdaria uma largura reduzida desse shell e
    // alteraria a quebra de linhas em relação à folha final.
    style: { width: paperWidth },
    patientName: patient.name,
    patientNameContent: createElement(ClinicalPatientName, { patientName: patient.name }),
    patientInfo: createElement(ClinicalPatientDetails, {
      birthDate: patient.birthDate || "—",
      sex: patient.sex || "—",
      studyDate: patient.studyDate || "—",
      modality: patient.modality || undefined,
      unitName: patient.unitName || undefined,
    }),
    title: createElement("div", {
      style: {
        width: "100%",
        textAlign: "center",
        fontWeight: 700,
        fontSize: "13pt",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        paddingBottom: 6,
        borderBottom: "1px solid #e0e0e0",
      },
    }, title || "—"),
    // A folha física nunca usa SharedReportBodyGuide: corpo vazio permanece vazio.
    body: createElement("div", {
      className: "report-body",
      "data-report-body-content": "true",
      style: { flex: 1, minHeight: 0, overflow: "hidden" },
      dangerouslySetInnerHTML: { __html: bodyHtml },
    }),
    footer: footerHtml
      ? createElement("div", { style: { width: "100%" }, dangerouslySetInnerHTML: { __html: footerHtml } })
      : createElement("div"),
  });
}
