import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// FASE 3 DA UNIFICAÇÃO DOS GERADORES DE PDF (26/09/2026): o mecanismo de
// camada de logos posicionados que este arquivo testava (renderLogoLayerHtml,
// logoOverlayHtmlQ, buildPageShellQ, um cabeçalho reconstruído SÓ para
// download/impressão) foi inteiramente removido — logos, dados do
// paciente e rodapé do médico agora vêm da mesma fábrica canônica
// (client/src/lib/reportDocumentRenderer.tsx) usada pelo editor do médico
// e pelo download financeiro, via SharedReportSheet. Este arquivo passa a
// confirmar que o mecanismo antigo foi removido por completo (não apenas
// contornado) e que o fallback de logo legado (units.logo_url) continua
// preservado através de normalizeCanonicalLogos.
const source = readFileSync(
  join(__dirname, "..", "client", "src", "pages", "PacsQueryPage.tsx"),
  "utf-8",
);

describe("PacsQueryPage.tsx — wiring de logos na fábrica canônica (Fase 3, 26/09/2026)", () => {
  it("o mecanismo antigo (renderLogoLayerHtml/logoOverlayHtmlQ/buildPageShellQ) foi removido por completo, não apenas contornado", () => {
    expect(source).not.toContain("renderLogoLayerHtml");
    expect(source).not.toContain("logoOverlayHtmlQ");
    expect(source).not.toContain("logoLayerHtmlQ");
    expect(source).not.toContain("buildPageShellQ");
    expect(source).not.toContain("reportLogoLayer");
  });

  it("não resta nenhum cabeçalho com logos concatenados + nome da unidade (clinic-name/clinic-sub)", () => {
    expect(source).not.toContain("clinic-name");
    expect(source).not.toContain("clinic-sub");
    expect(source).not.toContain("Laudo de Interpretação Radiológica");
  });

  it("posicionamento de logos agora vem inteiramente da fábrica canônica (reportDocumentRenderer.tsx via SharedReportSheet), não de um overlay HTML manual", () => {
    expect(source).toContain('from "@/lib/reportDocumentRenderer"');
    expect(source).toContain("renderAllPhysicalPagesHtml(");
    // O layout resolvido (com os logos e block_positions vindos de
    // resolveEffectiveReportLayout) é repassado para dentro do modelo —
    // a fábrica (não esta tela) decide onde cada logo é desenhado.
    expect(source).toContain("layout: layoutForRenderQ");
  });

  it("Bloqueio 2 (Manus, preservado na migração): normalizeCanonicalLogos mantém o fallback de units.logo_url quando não há logos configurados no layout", () => {
    expect(source).toContain("normalizeCanonicalLogos(effectiveLayoutQ.logos, logoUrl || null)");
  });
});
