import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(__dirname, "..", "client", "src", "pages", "LayoutEditorPage.tsx"),
  "utf-8",
);

describe("LayoutEditorPage.tsx — painel oficial do motor único de laudo", () => {
  it("expõe o fluxo em etapas sem trocar o contrato técnico do layout", () => {
    expect(source).toContain("WIZARD_STEPS");
    expect(source).toContain("Formato e papel");
    expect(source).toContain("Identidade visual");
    expect(source).toContain("Posicionamento");
    expect(source).toContain("Validar e salvar");
    expect(source).toContain("Configuração oficial da página de laudo");
  });

  it("mantém o editor administrativo preso ao mesmo motor visual usado por PDF/impressão/PACS", () => {
    const sharedSheetCalls = source.split("<SharedReportSheet").length - 1;

    expect(source).toContain('from "@/components/SharedReportSheet"');
    expect(sharedSheetCalls).toBe(2);
    expect(source).toContain("getCanvasOuterStyle(effectiveLayoutPrefs.pageSize)");
    expect(source).toContain("getAreaUtilWrapperStyle(effectiveLayoutPrefs)");
    expect(source).toContain("Prévia final do mesmo motor usado para imprimir e gerar PDF");
  });

  it("salva somente campos aceitos pelo motor atual", () => {
    expect(source).toContain("preferences:        effectiveLayoutPrefs");
    expect(source).toContain("blockPositions:     positions");
    expect(source).toContain("backgroundImageUrl");
    expect(source).toContain("backgroundSize");
    expect(source).toContain("footerImageUrl");
    expect(source).toContain("logos:");
    expect(source).toContain("blockPositions x/y/w/h/visible");
  });

  it("não importa campos do protótipo que não existem no contrato canônico", () => {
    expect(source).not.toContain("paperType");
    expect(source).not.toMatch(/\balign\s*:/);
    expect(source).not.toContain("pos.align");
    expect(source).not.toContain('from "./SharedReportSheet"');
    expect(source).not.toContain("@tanstack/react-router");
  });

  it("permite revisar o payload canônico antes de salvar", () => {
    expect(source).toContain("canonicalPayload");
    expect(source).toContain("canonicalChecks");
    expect(source).toContain("JSON.stringify(canonicalPayload, null, 2)");
    expect(source).toContain("Payload canônico do layout");
  });
});