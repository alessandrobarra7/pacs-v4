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
    expect(source).toContain(".sig-img { flex: 0 1 auto; min-height: 0; max-height: 42px;");
    expect(source).toContain(".stamp-img { flex: 0 1 auto; min-height: 0; max-height: 70px;");
    expect(source).not.toContain("margin: 14mm auto 0");
  });

  /**
   * Regressão (auditoria Manus 2026-09-29, "Parecer técnico — cadeia de
   * dados DICOM, rodapé e teste"): carimbo (até 70px) + assinatura (até
   * 42px) + linha + nome + CRM + data podiam somar mais que a altura do
   * bloco [data-layout-block="footer"] configurado no editor de layout,
   * que tem overflow:hidden — a Manus mediu em Chromium ~171px de
   * conteúdo contra ~115px de bloco, com a data de assinatura cortada.
   * O rodapé agora é um container flex em coluna que ocupa 100% da altura
   * real do bloco (herdada do wrapper esticado em SharedReportSheet.tsx),
   * com min-height:0 nas imagens para que o motor de flexbox do navegador
   * as encolha (mantendo proporção via object-fit:contain) o quanto for
   * necessário, em vez de cortar conteúdo por overflow:hidden.
   */
  it("dá ao rodapé um contrato de capacidade (flex-column + height:100% + min-height:0 nas imagens)", () => {
    expect(source).toContain("display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-inside: avoid;");
    expect(source).toContain("max-width: 240px; height: 100%; box-sizing: border-box;");
    expect(source).toContain(".sig-line { flex: 0 0 auto;");
    expect(source).toContain(".sig-name { flex: 0 0 auto;");
    expect(source).toContain(".sig-crm { flex: 0 0 auto;");
    expect(source).toContain(".sig-date { flex: 0 0 auto;");
  });
});
