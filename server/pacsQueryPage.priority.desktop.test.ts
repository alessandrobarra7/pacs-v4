import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("../client/src/pages/PacsQueryPage.tsx", import.meta.url), "utf8");

describe("PacsQueryPage — prioridade clínica no desktop", () => {
  it("reutiliza os controles de prioridade na tabela desktop", () => {
    expect(pageSource).toContain('>Prioridade clínica</th>');
    expect(pageSource).toContain('variant="desktop"');
    expect(pageSource.match(/<StudyPriorityControls/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("mantém o colspan das linhas auxiliares compatível com a nova coluna", () => {
    expect(pageSource).toContain("colSpan={12}");
  });
});
