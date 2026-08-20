import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");

describe("modal visual de legenda canônica", () => {
  it("abre a seleção pelo próprio item do exame, sem seletor suspenso na listagem", () => {
    expect(pageSource).toContain('title={isLocked ? "Legenda bloqueada após a primeira assinatura" : "Clique para selecionar um exame cadastrado"}');
    expect(pageSource).toContain("Selecionar exame cadastrado");
    expect(pageSource).not.toContain('<option value="">Selecionar legenda cadastrada</option>');
  });

  it("mostra botões pesquisáveis alimentados pelas legendas ativas retornadas pelo servidor", () => {
    expect(pageSource).toContain("const filteredLegends = legends.filter");
    expect(pageSource).toContain("Buscar exame no catálogo...");
    expect(pageSource).toContain("filteredLegends.map((legend)");
    expect(pageSource).toContain("selectLegend.mutate({ studyInstanceUid: study.studyInstanceUid, examLegendId: legend.id })");
  });
});
