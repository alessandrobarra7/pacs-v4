import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Regressão de wiring (auditoria claude/wizard-layout-laudos-acordeao,
// 2026-09-28): confirma, lendo a fonte real de LayoutEditorPage.tsx, que:
//  1. Os 3 bugs já identificados e documentados em
//     HANDOFF_MANUS_FIX_LAYOUT_EDITOR_PREVIA_REAL_2026-09-28.txt (nunca
//     mesclado em main) continuam corrigidos: largura da "Prévia real"
//     colapsando, legenda trocada, reset sem confirmação.
//  2. A nova reestruturação em acordeão (Formato e margens / Logos, fundo
//     e rodapé / Blocos do laudo) existe e não removeu nenhuma
//     funcionalidade — em especial, o posicionamento dos blocos continua
//     livre por arraste em %, sem grade nem campo "align" que não existe
//     no contrato real (BlockPosition = x,y,w,h,visible).
const source = readFileSync(
  join(__dirname, "..", "client", "src", "pages", "LayoutEditorPage.tsx"),
  "utf-8",
);

describe("LayoutEditorPage.tsx — reset com confirmação (auditoria 2026-09-28)", () => {
  it("handleReset pede window.confirm antes de setPositions(DEFAULT_POSITIONS)", () => {
    const idx = source.indexOf("const handleReset = useCallback(() => {");
    expect(idx).toBeGreaterThan(-1);
    const body = source.slice(idx, source.indexOf("}, []);", idx));
    expect(body).toMatch(/if\s*\(!window\.confirm\(/);
    const confirmIdx = body.indexOf("window.confirm(");
    const setPositionsIdx = body.indexOf("setPositions(DEFAULT_POSITIONS)");
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(setPositionsIdx).toBeGreaterThan(confirmIdx);
  });

  it("botão de reset tem rótulo explícito 'Resetar posições' (não mais só 'Resetar')", () => {
    expect(source).toContain("Resetar posições");
    expect(source).not.toMatch(/>\s*<RotateCcw className="h-4 w-4 mr-1" \/> Resetar\s*<\/Button>/);
  });
});

describe("LayoutEditorPage.tsx — legenda dos modos Editar/Prévia real (auditoria 2026-09-28)", () => {
  it("não usa mais o texto trocado/genérico antigo", () => {
    expect(source).not.toContain("Visualizacao limpa da pagina");
    expect(source).not.toContain('previewMode === "real" ? "Visualizacao limpa da pagina" : "Modo de posicionamento"');
  });

  it("cada modo tem uma legenda própria e descritiva", () => {
    expect(source).toContain("Prévia real: mostra a página como sairá impressa, sem alças de arrastar.");
    expect(source).toContain("Modo de posicionamento: arraste, redimensione e ajuste X/Y/Larg./Alt. dos blocos.");
  });
});

describe("LayoutEditorPage.tsx — largura da Prévia real (auditoria 2026-09-28)", () => {
  it("a folha do modo 'real' está envolvida em getCanvasOuterStyle, igual ao modo 'editor'", () => {
    const occurrences = source.match(/getCanvasOuterStyle\(effectiveLayoutPrefs\.pageSize\)/g) || [];
    // 1x no canvas do modo editor + 1x no wrapper novo do modo "real"
    expect(occurrences.length).toBe(2);
  });

  it("o SharedReportSheet do modo real não depende mais de maxWidth sem wrapper com base", () => {
    // Antes: style={{ width: "100%", maxWidth: `${paperWidthMmValue}mm`, minHeight: ... }}
    // direto no SharedReportSheet, sem nenhum ancestral com largura resolvida —
    // colapsava para ~0. Agora ambos os modos passam style 100%/100% e quem
    // resolve a largura física é o wrapper getCanvasOuterStyle.
    expect(source).not.toMatch(/maxWidth:\s*`\$\{paperWidthMmValue\}mm`,\s*minHeight/);
    const styleFull = source.match(/style=\{\{ width: "100%", height: "100%" \}\}/g) || [];
    expect(styleFull.length).toBe(2);
  });
});

describe("LayoutEditorPage.tsx — reestruturação em acordeão (auditoria 2026-09-28)", () => {
  it("existem as 3 seções do painel esquerdo controladas por openSection", () => {
    expect(source).toContain('type PanelSection = "papel" | "identidade" | "blocos"');
    expect(source).toContain("toggleSection(\"papel\")");
    expect(source).toContain("toggleSection(\"identidade\")");
    expect(source).toContain("toggleSection(\"blocos\")");
  });

  it("'Formato e margens' edita pageSize e as 4 margens via updatePreference, sem novo campo fora do schema real", () => {
    expect(source).toContain('updatePreference("pageSize", size)');
    for (const field of ["marginTop", "marginRight", "marginBottom", "marginLeft"]) {
      expect(source).toContain(`value={effectiveLayoutPrefs[field]}`);
      expect(source).toContain(`["${field}", `);
    }
    // Não introduz "paperType" (não existe em layoutInputSchema/layoutPreferencesSchema reais)
    expect(source).not.toContain("paperType");
  });

  it("updatePreference grava em layoutPrefs e marca isDirty, sem mexer em blockPositions", () => {
    const idx = source.indexOf("const updatePreference = useCallback(");
    expect(idx).toBeGreaterThan(-1);
    const body = source.slice(idx, source.indexOf("}, []);", idx));
    expect(body).toContain("setLayoutPrefs(prev =>");
    expect(body).toContain("setIsDirty(true)");
  });

  it("'Logos, fundo e rodapé' continua com as 3 sub-seções originais (Logos da Unidade, Fundo da Página, Imagem de Rodapé), agora agrupadas atrás de openSection === \"identidade\"", () => {
    const idx = source.indexOf('toggleSection("identidade")');
    expect(idx).toBeGreaterThan(-1);
    const closeIdx = source.indexOf('toggleSection("blocos")');
    const between = source.slice(idx, closeIdx);
    expect(between).toContain("Logos da Unidade");
    expect(between).toContain("Fundo da Página");
    expect(between).toContain("Imagem de Rodapé");
    expect(between).toContain('openSection === "identidade"');
  });

  it("'Blocos do laudo' continua com os 8 blocos, visibilidade e X/Y/Larg./Alt. livres (sem grade, sem campo align)", () => {
    const idx = source.indexOf('toggleSection("blocos")');
    expect(idx).toBeGreaterThan(-1);
    const tail = source.slice(idx);
    expect(tail).toContain('openSection === "blocos"');
    expect(tail).toContain("activeBlockIds.map(block =>");
    expect(tail).toContain("toggleVisible(block)");
    // As 4 métricas continuam livres (não viram um seletor de posição fixa)
    for (const field of ["x", "y", "w", "h"]) {
      expect(tail).toMatch(new RegExp(`field === "${field}" \\?|"${field}"`));
    }
  });

  it("BlockPosition real não tem (nem ganhou) o campo 'align' inventado pelo protótipo Lovable — continua x,y,w,h,visible", () => {
    const idx = source.indexOf("interface BlockPosition {");
    expect(idx).toBeGreaterThan(-1);
    const body = source.slice(idx, source.indexOf("}", idx));
    expect(body).toContain("x: number;");
    expect(body).toContain("y: number;");
    expect(body).toContain("w: number;");
    expect(body).toContain("h: number;");
    expect(body).toContain("visible: boolean;");
    expect(body).not.toContain("align");
  });

  it("o drag/resize livre por ponteiro continua intacto (handlePointerDown/Move calculam % sobre a área útil)", () => {
    expect(source).toContain("const handlePointerDown = useCallback");
    expect(source).toContain("const handlePointerMove = useCallback");
    expect(source).toContain("pointerDeltaToPercent(e.clientX - drag.startX, rect.width)");
  });
});
