import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Regressão (reprodução ao vivo pedida pelo Alessandro, 2026-09-25/26):
// "Baixar em PDF"/"Imprimir Laudo" a partir da lista de Estudos
// (executePrintAction, em PacsQueryPage.tsx) buscava o laudo com
// reports.getByStudyUidWithDoctor.fetch({ studyInstanceUid }) SEM
// documentKey. O servidor assume documentKey='primary' por padrão
// (server/routers/reports.ts), o que retorna null para qualquer estudo
// que use o sistema de legenda/catálogo (document_key tipo
// 'legend_228_document_27') — reproduzido ao vivo com o laudo assinado
// do paciente RAIMUNDO NESTOR SERPA MORAES (23/09/2026, unidade Hospital
// da Criança), tanto pelo admin quanto pela médica (usuário claudia),
// sempre retornando "(Laudo não encontrado ou ainda não elaborado)" e o
// cabeçalho legado, mesmo com o laudo assinado e corretamente exibido em
// ReportEditorPage.tsx ("Laudar") e no download financeiro
// (financeSimple.myReportDownload) — as duas vias que já resolviam
// documentKey/unit_id corretamente.
//
// Estes testes leem a fonte real de PacsQueryPage.tsx para confirmar que
// a correção está de fato ligada: documentKey é resolvido (sessionStorage
// via legendSelectionsByStudyUid, com o mesmo algoritmo de handleReport)
// e passado, junto com unit_id, ao fetch — e que o caso ambíguo (mais de
// um documento clínico na composição) reabre o modal de escolha em vez
// de adivinhar.
const source = readFileSync(
  join(__dirname, "..", "client", "src", "pages", "PacsQueryPage.tsx"),
  "utf-8",
);

describe("PacsQueryPage.tsx — executePrintAction resolve documentKey (reprodução RAIMUNDO NESTOR, 2026-09-26)", () => {
  it("a fetch de getByStudyUidWithDoctor dentro de executePrintAction NÃO chama mais com studyInstanceUid isolado", () => {
    expect(source).not.toMatch(
      /getByStudyUidWithDoctor\.fetch\(\{\s*studyInstanceUid:\s*study\.studyInstanceUid\s*\}\)/,
    );
  });

  it("executePrintAction declara resolvedDocumentKey e o repassa (com unit_id) ao fetch", () => {
    const fnIdx = source.indexOf("const executePrintAction = async (");
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = source.slice(fnIdx, fnIdx + 4200);

    expect(fnBody).toContain("let resolvedDocumentKey = 'primary'");
    expect(fnBody).toContain("legendSelectionsByStudyUid.get(study.studyInstanceUid)");

    const fetchIdx = fnBody.indexOf("await trpcUtils.reports.getByStudyUidWithDoctor.fetch({");
    expect(fetchIdx).toBeGreaterThan(-1);
    const fetchCall = fnBody.slice(fetchIdx, fetchIdx + 260);
    expect(fetchCall).toContain("studyInstanceUid: study.studyInstanceUid");
    expect(fetchCall).toContain("documentKey: resolvedDocumentKey");
    expect(fetchCall).toContain("unit_id: effectiveUnitId ? Number(effectiveUnitId) : undefined");
  });

  it("caso ambíguo (mais de um documento clínico) abre o modal de escolha em vez de adivinhar o documentKey", () => {
    const fnIdx = source.indexOf("const executePrintAction = async (");
    const fnBody = source.slice(fnIdx, fnIdx + 4200);
    expect(fnBody).toContain("if (documents.length > 1) {");
    expect(fnBody).toContain("setPendingPrintAction(actionType);");
    expect(fnBody).toContain("setIsReportDocumentsModalOpen(true);");
  });

  it("aceita um documento explícito (explicitDocument) para retomar a ação após o usuário escolher no modal", () => {
    const sigIdx = source.indexOf("const executePrintAction = async (");
    expect(sigIdx).toBeGreaterThan(-1);
    const sig = source.slice(sigIdx, sigIdx + 260);
    expect(sig).toContain("explicitDocument?: { document_key: string; document_label: string }");
  });

  it("declara pendingPrintAction e o modal de escolha de documento chama executePrintAction (não só openReportDocument) quando há uma ação pendente", () => {
    expect(source).toContain(
      "const [pendingPrintAction, setPendingPrintAction] = useState<'print' | 'download' | null>(null);",
    );

    const modalIdx = source.indexOf("{isReportDocumentsModalOpen && reportStudy && (");
    expect(modalIdx).toBeGreaterThan(-1);
    const modalBody = source.slice(modalIdx, modalIdx + 2500);
    expect(modalBody).toContain("const pending = pendingPrintAction;");
    expect(modalBody).toContain("if (pending) {");
    expect(modalBody).toContain("executePrintAction(study, pending, document);");
    expect(modalBody).toContain("} else {");
    expect(modalBody).toContain("openReportDocument(study, document);");
  });

  it("fecha/cancela o modal de escolha limpa pendingPrintAction (não deixa estado pendente preso)", () => {
    const modalIdx = source.indexOf("{isReportDocumentsModalOpen && reportStudy && (");
    const modalBody = source.slice(modalIdx, modalIdx + 4000);
    const clearCount = (modalBody.match(/setPendingPrintAction\(null\)/g) || []).length;
    expect(clearCount).toBeGreaterThanOrEqual(3);
  });
});
