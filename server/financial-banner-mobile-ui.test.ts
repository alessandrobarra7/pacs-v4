import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");

describe("faixa financeira móvel", () => {
  it("prioriza o valor financeiro principal e organiza os indicadores em grade no celular", () => {
    expect(page).toContain('className="md:hidden px-4 py-3.5"');
    expect(page).toContain('className="grid grid-cols-2 gap-2"');
    expect(page).toContain('label="A receber neste ciclo"');
    expect(page).toContain('label="Valor por laudo"');
    expect(page).toContain('label="Laudos assinados"');
    expect(page).toContain('label="Fechamento do ciclo"');
  });

  it("mantém a faixa compacta de desktop e separa o resumo do responsável financeiro", () => {
    expect(page).toContain('className="hidden md:flex items-center gap-4 px-5 py-1.5 text-xs text-emerald-800"');
    expect(page).toContain('label="Total a pagar médicos"');
    expect(page).toContain('tone="blue"');
  });
});
