import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("../client/src/pages/PacsQueryPage.tsx", import.meta.url), "utf8");

describe("PacsQueryPage — interação de legenda no mobile", () => {
  it("não permite que controles internos do cartão acionem o visualizador", () => {
    expect(pageSource).toContain("function isInteractiveMobileCardTarget");
    expect(pageSource).toContain("if (isInteractiveMobileCardTarget(event.target)) return;");
    expect(pageSource).toContain("data-card-interactive=\"true\"");
  });

  it("não permite que teclas de controles internos sejam tratadas pelo cartão", () => {
    expect(pageSource).toContain("if (event.target !== event.currentTarget) return;");
  });
});
