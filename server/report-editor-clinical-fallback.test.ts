// CORREÇÃO (claude/corrige-preview-layout-unidade-editor-mobile, commit 1):
// a tela do editor não pode inventar identidade ou data clínica.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clinicalDateDisplay, patientNameDisplay } from "../client/src/lib/clinicalIdentityDisplay";

const root = path.resolve(import.meta.dirname, "..");
const editorPath = path.join(root, "client/src/pages/ReportEditorPage.tsx");
const editor = readFileSync(editorPath, "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(name) ? [full] : [];
  });
}

/** Trecho de uma função useCallback do editor, do nome até o array de dependências. */
function callbackBody(name: string): string {
  const start = editor.indexOf(`const ${name} = useCallback(`);
  expect(start, `${name} existe`).toBeGreaterThan(-1);
  const end = editor.indexOf("}, [", start);
  return editor.slice(start, end);
}

describe("identidade clínica na tela — estados neutros", () => {
  it("dados do estudo ainda não lidos: 'Carregando…', marcado como placeholder", () => {
    expect(patientNameDisplay("", false, false)).toEqual({ text: "Carregando…", isPlaceholder: true });
  });

  it("studyInfo indefinido após a leitura: 'Dados do estudo indisponíveis'", () => {
    expect(patientNameDisplay(undefined, true, false)).toEqual({ text: "Dados do estudo indisponíveis", isPlaceholder: true });
  });

  it("estudo carregado com nome vazio ou só espaços: 'Nome não informado'", () => {
    expect(patientNameDisplay("", true, true)).toEqual({ text: "Nome não informado", isPlaceholder: true });
    expect(patientNameDisplay("   ", true, true)).toEqual({ text: "Nome não informado", isPlaceholder: true });
  });

  it("nome presente é exibido como está e não é placeholder", () => {
    expect(patientNameDisplay("Maria Teste", true, true)).toEqual({ text: "Maria Teste", isPlaceholder: false });
  });

  it("data ausente vira '—' (nunca a data atual)", () => {
    expect(clinicalDateDisplay("")).toBe("—");
    expect(clinicalDateDisplay(undefined)).toBe("—");
    expect(clinicalDateDisplay("  ")).toBe("—");
    expect(clinicalDateDisplay("15/05/1970")).toBe("15/05/1970");
    expect(clinicalDateDisplay("")).not.toBe(new Date().toLocaleDateString("pt-BR"));
  });
});

describe("ReportEditorPage — sem identidade fictícia nem data inventada", () => {
  it("os literais fictícios não existem em nenhum arquivo de produção do client", () => {
    const offenders = sourceFiles(path.join(root, "client/src")).filter((file) => {
      const text = readFileSync(file, "utf8");
      return text.includes("ANTONIA DE SOUZA BATISTA") || text.includes("15/05/1970");
    });
    expect(offenders).toEqual([]);
  });

  it("a data do estudo na folha não cai para a data de hoje", () => {
    expect(editor).not.toMatch(/studyDate=\{[^}]*new Date\(\)/);
    expect(editor).toContain('studyDate={clinicalDateDisplay(studyInfo?.studyDate ? formatDicomDate(studyInfo.studyDate) : "")}');
  });

  it("cartão mobile e cabeçalhos usam o estado neutro; nascimento é formatado", () => {
    expect(editor.match(/\{patientNameOnScreen\.text\}/g)?.length).toBe(3);
    expect(editor).toContain('{clinicalDateDisplay(studyInfo?.birthDate ? formatDicomDate(studyInfo.birthDate) : "")}');
    expect(editor).not.toContain('patientName || "Carregando..."');
  });

  it("o texto de exibição NÃO entra em salvar, assinar, imprimir nem no PDF financeiro", () => {
    for (const name of ["collectBody", "handleSave", "handleSign", "handlePrint", "handleFinancialPdfDownload"]) {
      const body = editor.includes(`const ${name} = useCallback(`) ? callbackBody(name) : "";
      expect(body, name).not.toContain("patientNameOnScreen");
      expect(body, name).not.toContain("Carregando…");
      expect(body, name).not.toContain("Nome não informado");
    }
    // Gravação continua usando o dado bruto do estudo.
    expect(editor).toContain("patient_name: studyInfo?.patientName || undefined,");
    expect(editor).toContain("study_date: studyInfo?.studyDate || undefined,");
  });
});
