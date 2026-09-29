import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"),
  "utf8",
);

describe("PacsQueryPage — contrato canônico de layout", () => {
  it("obtém o snapshot clínico retornado junto com o laudo", () => {
    expect(source).toContain("let reportLayoutSnapshot: ReportLayoutSource | null = null;");
    expect(source).toContain("reportLayoutSnapshot = result?.layout_snapshot as ReportLayoutSource | null | undefined ?? null;");
  });

  it("resolve a mesma precedência de rascunho, assinado e retificado do Editor", () => {
    expect(source).toContain("const effectiveReportLayoutQ = resolveEffectiveReportLayout({");
    expect(source).toContain("status: reportStatus,");
    expect(source).toContain("reportLayoutSnapshot,");
    expect(source).toContain("const effectivePrefsQ = effectiveReportLayoutQ.preferences;");
    expect(source).not.toContain("DEFAULT_LAYOUT_PREFERENCES");
  });

  it("alimenta a única folha visual, captura e paginação com os campos resolvidos", () => {
    expect(source).toContain('from "@/lib/reportPhysicalSheetRenderer"');
    expect(source).toContain("const renderPhysicalPageQ = createPhysicalReportSheetRenderer({");
    expect(source).toContain("layout: effectiveReportLayoutQ,");
    expect(source).toContain("logos: printLogosWithFallbackQ,");
    expect(source).toContain("backgroundUrl: bgBase64Q || lBgUrl,");
    expect(source).toContain("footerImageUrl: footerBase64Q || lFooterUrl,");
    expect(source).toContain("renderPage: renderPhysicalPageQ,");
    expect(source).toContain("materializePhysicalReportPages({");
    expect(source).toContain("bodySelector: REPORT_PHYSICAL_BODY_SELECTOR,");
    expect(source).not.toContain("renderLogoLayerHtml");
  });

  it("preserva logo legado somente fora de um snapshot clínico explícito", () => {
    expect(source).toContain("const allowLegacyUnitLogoFallbackQ = effectiveReportLayoutQ.source === 'unitLayout';");
    expect(source).toContain("allowLegacyUnitLogoFallbackQ && logoUrl");
  });
  it("busca nascimento e sexo no cache DICOM quando o PACS não devolve os campos do paciente", () => {
    expect(source).toContain("async function fetchCachedDicomPatientMetadata(studyUid: string)");
    expect(source).toContain("fetch(`/api/dicom-files/${encodeURIComponent(studyUid)}`");
    expect(source).toContain("cachedPatientMetadata?.patientBirthDate");
    expect(source).toContain("cachedPatientMetadata?.patientSex");
    expect(source).toContain("patientBirthDate: birthDateRaw");
    expect(source).toContain("patientSex: patientSexRaw");
  });

  it("mantém assinatura/carimbo no rodapé sem a margem que recortava a assinatura", () => {
    expect(source).toContain(".doctor-footer { text-align: center; margin: 0 auto;");
    expect(source).toContain("background: rgba(255,255,255,.84)");
    expect(source).toContain(".sig-img { max-height: 42px;");
    expect(source).toContain(".stamp-img { max-height: 70px;");
    expect(source).not.toContain("margin: 14mm auto 0");
  });
});
