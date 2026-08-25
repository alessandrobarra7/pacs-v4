import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const catalogSource = readFileSync(new URL("./routers/examCatalog.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../client/src/pages/ExamCatalogPage.tsx", import.meta.url), "utf8");

describe("catálogo — mapeamento para descrição PACS vazia", () => {
  it("aceita somente uma regra explícita quando a descrição textual estiver vazia", () => {
    expect(catalogSource).toContain("matches_empty_description: z.boolean().default(false)");
    expect(catalogSource).toContain("Informe a descrição PACS ou marque descrição vazia.");
    expect(catalogSource).toContain('"__EMPTY_DESCRIPTION__"');
  });

  it("oferece um controle claro e não envia o placeholder visual como texto PACS", () => {
    expect(pageSource).toContain("Aplicar quando a descrição PACS vier vazia");
    expect(pageSource).toContain('pacs_description: mapping.matches_empty_description ? "" : mapping.pacs_description.trim()');
    expect(pageSource).toContain("Descrição vazia no PACS");
  });
});
