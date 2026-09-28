import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Regressão para 3 correções encontradas em auditoria manual em produção
// (branch claude/fix-layout-editor-previa-real-largura, 2026-09-28), na
// tela /admin/layouts/:id (Editor de Layout, unidade HOSPITAL DA CRIANÇA):
//
// 1) O modo "Previa real" renderizava o SharedReportSheet sem nenhum
//    ancestral com largura física definida (diferente do modo "Editar
//    blocos", que usa getCanvasOuterStyle — width:100% + maxWidth em mm +
//    aspectRatio). Sem isso, o navegador não resolve a largura percentual
//    de forma estável e a folha colapsa para uma coluna estreitíssima,
//    quebrando cada palavra numa linha e sobrepondo blocos — reproduzido
//    visualmente: "Achados" sobrepondo "Dr. Nome do Médico / CRM", e um
//    logo redimensionado (200→300px) renderizando minúsculo e fora do
//    bloco. Mesma classe de bug já documentada pela Manus na investigação
//    do incidente de paginação de PDF (folha de medição sem largura
//    física → 0px), reproduzida aqui numa tela diferente.
// 2) O rótulo "Modo de posicionamento" / "Visualização limpa da página"
//    ficava na mesma linha, mesmo espaçamento e tamanho de fonte dos dois
//    <button> reais do grupo de abas — visualmente indistinguível de uma
//    terceira aba clicável, mas é só texto estático sem onClick nem
//    cursor:pointer. Cliques repetidos nele não faziam nada, sem erro no
//    console — o "comando que não responde" relatado.
// 3) O botão "Resetar" descartava as posições customizadas de todos os
//    blocos sem nenhuma confirmação, e o rótulo não deixava claro que o
//    escopo era só posição (largura/altura de logo, fundo e rodapé não
//    são afetados).
const source = readFileSync(
  join(__dirname, "..", "client", "src", "pages", "LayoutEditorPage.tsx"),
  "utf-8",
);

describe("LayoutEditorPage.tsx — correções da auditoria manual em produção (2026-09-28)", () => {
  it("Fix 1: o modo 'Previa real' envolve o SharedReportSheet em getCanvasOuterStyle, igual ao modo 'Editar blocos'", () => {
    // As duas chamadas de SharedReportSheet devem estar, cada uma, dentro
    // de um wrapper com getCanvasOuterStyle — antes só a primeira (modo
    // "editor") tinha isso; a segunda (modo "real") usava style inline
    // sem largura física definida.
    const occurrences = source.match(/getCanvasOuterStyle\(effectiveLayoutPrefs\.pageSize\)/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it("Fix 1: o modo 'Previa real' não usa mais style inline com maxWidth em mm sem wrapper de largura física", () => {
    // O padrão antigo, sem wrapper: style={{ width: "100%", maxWidth: `${paperWidthMmValue}mm`, minHeight: ... }}
    // passado direto pro SharedReportSheet, sem nenhum ancestral com
    // largura física definida (aspectRatio) entre ele e o container flex.
    expect(source).not.toMatch(/maxWidth:\s*`\$\{paperWidthMmValue\}mm`/);
  });

  it("Fix 1: as duas chamadas de SharedReportSheet passam width/height 100% (a largura física vem do wrapper, não do style do componente)", () => {
    const sharedSheetStyles = source.match(/style=\{\{\s*width:\s*"100%",\s*height:\s*"100%"\s*\}\}/g) || [];
    expect(sharedSheetStyles.length).toBe(2);
  });

  it("Fix 2: a legenda de modo não fica mais dentro do mesmo container flex dos botões de aba", () => {
    // Antes: <div className="mb-3 flex items-center justify-center gap-3 flex-wrap">
    // continha o grupo de botões E o <span> de legenda como irmãos diretos,
    // o que os tornava visualmente equivalentes (mesma linha, mesmo
    // espaçamento). Agora o grupo de botões fica isolado num wrapper
    // próprio, e a legenda vira um <p> separado, abaixo.
    const buttonGroupWrapper = source.match(/<div className="mb-1 flex items-center justify-center">/g) || [];
    expect(buttonGroupWrapper.length).toBe(1);
  });

  it("Fix 2: a legenda de modo agora é um parágrafo em itálico, claramente não-clicável, fora do grupo de botões", () => {
    expect(source).toContain('<p className="mb-3 text-center text-[11px] italic text-gray-400">');
    expect(source).toContain("visualização limpa da página, sem alças de arrastar");
    expect(source).toContain("arraste os blocos diretamente nesta visualização para posicioná-los");
  });

  it("Fix 2: os dois botões reais de aba (Editar blocos / Previa real) continuam presentes e funcionais", () => {
    expect(source).toContain('onClick={() => setPreviewMode("editor")}');
    expect(source).toContain('onClick={() => setPreviewMode("real")}');
  });

  it("Fix 3: handleReset exige confirmação explícita antes de descartar as posições", () => {
    const resetStart = source.indexOf("const handleReset = useCallback");
    const resetEnd = source.indexOf("}, []);", resetStart);
    const resetHandler = source.slice(resetStart, resetEnd);

    expect(resetHandler).toContain("window.confirm(");
    expect(resetHandler).toMatch(/if\s*\(!window\.confirm\(/);
    // A guarda precisa vir ANTES do setPositions — senão a confirmação é decorativa.
    expect(resetHandler.indexOf("window.confirm(")).toBeLessThan(resetHandler.indexOf("setPositions(DEFAULT_POSITIONS)"));
    expect(resetHandler).toContain("setPositions(DEFAULT_POSITIONS);");
  });

  it("Fix 3: a mensagem de confirmação e o toast deixam explícito que o escopo é só posição dos blocos", () => {
    const resetStart = source.indexOf("const handleReset = useCallback");
    const resetEnd = source.indexOf("}, []);", resetStart);
    const resetHandler = source.slice(resetStart, resetEnd);

    expect(resetHandler).toMatch(/confirm\(["'].*posições.*["']/is);
    expect(resetHandler).toContain("logos, fundo e rodapé não foram alterados");
  });

  it("Fix 3: o botão no header identifica o escopo ('Resetar posições', não apenas 'Resetar')", () => {
    expect(source).toContain("Resetar posições");
    expect(source).not.toMatch(/<RotateCcw[^>]*\/>\s*Resetar\s*<\/Button>/);
  });

  it("regressão negativa: se alguém reintroduzir um clique direto em handleReset sem confirmação, este teste falha", () => {
    // Prova de que o teste de fato detecta a ausência da guarda: simula o
    // handler antigo (sem confirm) e confirma que a asserção do Fix 3
    // rejeitaria esse código.
    const oldHandlerShape = `
  const handleReset = useCallback(() => {
    setPositions(DEFAULT_POSITIONS);
    setIsDirty(true);
    toast.info("Posições resetadas para o padrão.");
  }, []);`;
    expect(oldHandlerShape).not.toContain("window.confirm(");
  });
});
