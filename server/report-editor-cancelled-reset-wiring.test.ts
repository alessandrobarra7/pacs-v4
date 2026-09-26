import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Regressão (reprodução ao vivo pedida pelo Alessandro, 2026-09-26): ele
// cancelou o laudo assinado do paciente RAIMUNDO NESTOR SERPA MORAES
// (23/09/2026, unidade Hospital da Criança) e a mensagem "Laudo cancelado
// / Assinatura cancelada — nova laudagem necessária" apareceu
// corretamente na lista de Estudos — mas ao entrar em "Laudar", o
// ambiente NÃO voltou a ficar pendente como se nunca tivesse sido
// laudado: o editor abria com o corpo INTEIRO do laudo cancelado já
// visível/carregado, sem nenhum aviso, e o botão "Nova laudagem"
// (handleNewOccurrence) criava a nova ocorrência copiando esse mesmo
// texto antigo como conteúdo inicial (body: existingReport.body) em vez
// de começar em branco.
//
// Reproduzido ao vivo (browser, usuária Dr(a) Claudia Cipriano): a
// resposta de reports.getByStudyUid trazia o relatório com
// status:"cancelled" e o body completo do laudo assinado/cancelado, e o
// efeito que popula o contentEditable em ReportEditorPage.tsx carregava
// esse body incondicionalmente, sem checar isCancelled nem avisar o
// usuário.
//
// Estes testes leem a fonte real de ReportEditorPage.tsx para confirmar
// que a correção está de fato ligada.
const source = readFileSync(
  join(__dirname, "..", "client", "src", "pages", "ReportEditorPage.tsx"),
  "utf-8",
);

describe("ReportEditorPage.tsx — laudo cancelado volta a ficar pendente (reprodução RAIMUNDO NESTOR, 2026-09-26)", () => {
  it("handleNewOccurrence NÃO copia mais o body do laudo cancelado — começa em branco", () => {
    const fnIdx = source.indexOf("const handleNewOccurrence = useCallback(async () => {");
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = source.slice(fnIdx, fnIdx + 900);
    expect(fnBody).not.toContain("body: existingReport.body || \"\"");
    expect(fnBody).toContain('body: "",');
  });

  it("o efeito que popula o editor limpa explicitamente o DOM quando o laudo (novo/atual) não tem body", () => {
    const effectIdx = source.indexOf("useEffect(() => {\n    if (!existingReport) return;");
    expect(effectIdx).toBeGreaterThan(-1);
    const effectBody = source.slice(effectIdx, effectIdx + 1500);
    expect(effectBody).toContain("if (!existingReport.body) {");
    expect(effectBody).toContain('docRef.current.innerHTML = ""');
    expect(effectBody).toContain('mobileDocRef.current.innerHTML = ""');
    expect(effectBody).toContain('sectionRefs.current[i]!.innerHTML = ""');
    expect(effectBody).toContain('mobileSectionRefs.current[i]!.innerHTML = ""');
  });

  it("a dependência examNames foi adicionada ao efeito de carregar o corpo existente", () => {
    expect(source).toContain("}, [existingReport, isMultiSection, examNames]);");
  });

  it("existem 3 avisos visuais de 'Laudo cancelado' (multi-seção desktop, seção única desktop, mobile), guiando para Nova laudagem/Novo", () => {
    const matches = source.match(/Laudo <strong>cancelado<\/strong>/g) || [];
    expect(matches.length).toBe(3);
    expect(source).toContain("Clique em <strong>Nova laudagem</strong> para começar um laudo em branco.");
    expect(source).toContain("Toque em <strong>Novo</strong> para começar em branco.");
  });

  it("os avisos de cancelado usam isCancelled (não isSigned) como condição", () => {
    const idxs: number[] = [];
    let from = 0;
    for (;;) {
      const idx = source.indexOf("Laudo <strong>cancelado</strong>", from);
      if (idx === -1) break;
      idxs.push(idx);
      from = idx + 1;
    }
    expect(idxs.length).toBe(3);
    for (const idx of idxs) {
      const before = source.slice(Math.max(0, idx - 400), idx);
      expect(before).toMatch(/isCancelled/);
    }
  });
});
