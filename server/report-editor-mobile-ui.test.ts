import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const editorSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/ReportEditorPage.tsx"),
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

  it("usa documento fluido no mobile e preserva a largura A4 no desktop", () => {
    expect(editorSource).toContain('className="report-page w-full md:w-[794px]"');
    expect(editorSource).toContain('className="relative w-full md:w-[794px] overflow-hidden bg-white shadow-md print:shadow-none"');
    expect(editorSource).toContain("min-h-[350px]");
    expect(editorSource).toContain("bottom-20 right-4");
  });

  it("usa um canvas único com os mesmos blocos e coordenadas do layout administrativo", () => {
    expect(editorSource).toContain('data-layout-block={`logo${i + 1}`}');
    expect(editorSource).toContain('data-layout-block="patientName"');
    expect(editorSource).toContain('data-layout-block="patientInfo"');
    expect(editorSource).toContain('data-layout-block="title"');
    expect(editorSource).toContain('data-layout-block="body"');
    expect(editorSource).toContain('data-layout-block="footer"');
    expect(editorSource).toContain('left: `${(layoutBlockPos as any)?.footer?.x ?? 2}%`');
    expect(editorSource).toContain('top: `${(layoutBlockPos as any)?.footer?.y ?? 88}%`');
  });

  it("refaz a consulta quando o administrador salva um layout em outra aba", () => {
    expect(editorSource).toContain('refetch: refetchUnitLayout');
    expect(editorSource).toContain('pacs-layout-updated');
    expect(editorSource).toContain('pacs-layout-updates');
    expect(editorSource).toContain('void refetchUnitLayout()');
  });
});
