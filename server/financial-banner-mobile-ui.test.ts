import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");

describe("faixa financeira móvel", () => {
  it("mantém os três indicadores em uma única linha compacta no celular", () => {
    expect(page).toContain('className="grid grid-cols-3 divide-x divide-current/15 px-2 py-2.5 sm:px-4 sm:py-2"');
    expect(page).toContain('firstLabel="A receber neste ciclo"');
    expect(page).toContain('secondLabel="Laudos assinados"');
    expect(page).toContain('thirdLabel="Fechamento do ciclo"');
    expect(page).not.toContain('firstLabel="Valor por laudo"');
    expect(page).not.toContain('Resumo do ciclo');
  });

  it("reutiliza a mesma composição enxuta para o responsável financeiro", () => {
    expect(page).toContain('firstLabel="Total a pagar médicos"');
    expect(page).toContain('tone="blue"');
  });
});
