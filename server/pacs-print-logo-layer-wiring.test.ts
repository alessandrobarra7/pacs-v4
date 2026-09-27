import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Regressão de wiring (parecer de bloqueio da Manus, 2026-09-25, item
// "COBERTURA DE TESTE A COMPLETAR"): confirma, lendo a fonte real de
// PacsQueryPage.tsx, que a camada de logos posicionados está de fato
// ligada onde importa — dentro de buildPageShellQ (o HTML que
// reconstructPaginatedPages produz, o que é realmente entregue no
// download e na impressão) — e que nenhum resquício do cabeçalho antigo
// (logos concatenados + nome da unidade) sobrevive.
const source = readFileSync(
  join(__dirname, "..", "client", "src", "pages", "PacsQueryPage.tsx"),
  "utf-8",
);

describe("PacsQueryPage.tsx — wiring da camada de logos posicionados (Manus 2026-09-25)", () => {
  it("buildPageShellQ usa logoOverlayHtmlQ (camada posicionada), não um cabeçalho de texto fixo", () => {
    const buildPageShellIdx = source.indexOf("const buildPageShellQ = (examTitle");
    expect(buildPageShellIdx).toBeGreaterThan(-1);
    const buildPageShellBody = source.slice(buildPageShellIdx, buildPageShellIdx + 800);
    expect(buildPageShellBody).toContain("${logoOverlayHtmlQ}");
  });

  it("não resta nenhum cabeçalho com logos concatenados + nome da unidade (clinic-name/clinic-sub)", () => {
    expect(source).not.toContain("clinic-name");
    expect(source).not.toContain("clinic-sub");
    expect(source).not.toContain("Laudo de Interpretação Radiológica");
  });

  it("Bloqueio 1 (Manus): o overlay de logos usa as margens efetivas como offset, não inset:0", () => {
    expect(source).not.toContain("position:absolute;inset:0;pointer-events:none;z-index:2;");
    const overlayMatches = source.match(/position:absolute;top:\$\{lMT\}mm;right:\$\{lMR\}mm;bottom:\$\{lMB\}mm;left:\$\{lML\}mm;pointer-events:none;z-index:2;/g) || [];
    // Duas ocorrências: makePage (HTML inicial) e buildPageShellQ (o que é entregue de fato).
    expect(overlayMatches.length).toBe(2);
  });

  it("Bloqueio 2 (Manus): preserva o fallback de units.logo_url quando não há logos no layout", () => {
    expect(source).toContain("printLogosWithFallbackQ");
    const fallbackIdx = source.indexOf("const printLogosWithFallbackQ");
    expect(fallbackIdx).toBeGreaterThan(-1);
    const fallbackBody = source.slice(fallbackIdx, fallbackIdx + 400);
    expect(fallbackBody).toContain("logoUrl");
  });
});
