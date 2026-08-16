import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const editorSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/ReportEditorPage.tsx"),
  "utf8",
);
const sharedSheetSource = readFileSync(
  resolve(process.cwd(), "client/src/components/SharedReportSheet.tsx"),
  "utf8",
);
const pacsSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"),
  "utf8",
);
const sharedPrintSource = readFileSync(
  resolve(process.cwd(), "client/src/components/SharedReportPrint.tsx"),
  "utf8",
);
const adminLayoutSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/LayoutEditorPage.tsx"),
  "utf8",
);

describe("ReportEditorPage — experiência mobile", () => {
  it("mantém o editor desktop separado do fluxo mobile", () => {
    expect(editorSource).toContain('className="hidden md:flex flex-1 overflow-hidden print:block"');
    expect(editorSource).toContain('className="relative flex md:hidden min-h-0 flex-1 flex-col bg-slate-50 print:hidden"');
    expect(editorSource).toContain("const [showMobileTools, setShowMobileTools] = useState(false)");
  });

  it("preserva as ações essenciais e ferramentas do laudo no celular", () => {
    expect(editorSource).toContain('aria-label="Imprimir laudo"');
    expect(editorSource).toContain("onClick={handleSign}");
    expect(editorSource).toContain("Salvar rascunho");
    expect(editorSource).toContain("Ferramentas do laudo");
    expect(editorSource).toContain("Pré-visualizar laudo");
    expect(editorSource).toContain("ModelosTab");
    expect(editorSource).toContain("FrasesTab");
    expect(editorSource).toContain("CarimboTab");
  });

  it("usa documento fluido no mobile e preserva a folha compartilhada no desktop", () => {
    expect(editorSource).toContain('className="report-page"');
    expect(editorSource).toContain("<ClinicalReportSheet");
    expect(sharedSheetSource).toContain('height: "297mm"');
    expect(sharedSheetSource).toContain('minHeight: "1123px"');
    expect(sharedSheetSource).toContain('const legacyLogo = positions?.logo;');
    expect(sharedSheetSource).toContain('maxWidth: "210mm"');
    expect(sharedSheetSource).toContain('fontFamily = "Arial, Helvetica, sans-serif"');
    expect(editorSource).toContain("min-h-[350px]");
    expect(editorSource).toContain("bottom-20 right-4");
  });

  it("usa SharedReportSheet como canvas único com os mesmos blocos e coordenadas do layout administrativo", () => {
    expect(editorSource).toContain("<ClinicalReportSheet");
    expect(editorSource).toContain("SharedReportBodyGuide");
    expect(editorSource).toContain('data-placeholder={showBodyGuide ? "" : "Digite o laudo aqui..."}');
    expect(editorSource).toContain('const showSectionBodyGuide = !sectionHasContent && !isPreview;');
    expect(editorSource).toContain('data-placeholder={showSectionBodyGuide ? "" : `Digite o laudo de ${name}...`}');
    expect(sharedSheetSource).toContain('data-report-body-guide');
    expect(editorSource).toContain("positions={layoutBlockPos}");
    expect(editorSource).toContain("backgroundUrl={layoutBgUrl}");
    expect(editorSource).toContain("footerImageUrl={layoutFooterUrl}");
    expect(sharedSheetSource).toContain('data-layout-block={id}');
    expect(sharedSheetSource).toContain('data-layout-block="patientName"');
    expect(sharedSheetSource).toContain('data-layout-block="patientInfo"');
    expect(sharedSheetSource).toContain('data-layout-block="title"');
    expect(sharedSheetSource).toContain('data-layout-block="body"');
    expect(sharedSheetSource).toContain('data-layout-block="footer"');
    expect(sharedSheetSource).toContain('left: `${p.x}%`');
    expect(sharedSheetSource).toContain('top: `${p.y}%`');
  });

  it("usa o mesmo SharedReportSheet no editor clínico e na exportação", () => {
    expect(editorSource).toContain("renderSharedReportSheetHtml");
    expect(editorSource).toContain("positions: layoutBlockPos");
    expect(editorSource).toContain("footerImageUrl: footerBase64 || layoutFooterUrl");
    expect(pacsSource).toContain("renderSharedReportSheetHtml");
    expect(pacsSource).toContain("positions: blockPositionsQ");
    expect(pacsSource).toContain("footerImageUrl: footerBase64Q || lFooterUrl");
    expect(sharedPrintSource).toContain("renderToStaticMarkup");
    expect(sharedPrintSource).toContain("createElement(ClinicalReportSheet, props)");
    expect(adminLayoutSource).toContain("<SharedReportSheet");
    expect(adminLayoutSource).not.toContain("<ClinicalReportSheet");
  });

  it("refaz a consulta quando o administrador salva um layout em outra aba", () => {
    expect(editorSource).toContain('refetch: refetchUnitLayout');
    expect(editorSource).toContain('pacs-layout-updated');
    expect(editorSource).toContain('pacs-layout-updates');
    expect(editorSource).toContain('void refetchUnitLayout()');
  });
});
