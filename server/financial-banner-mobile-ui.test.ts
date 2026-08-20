import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");

describe("faixa financeira móvel", () => {
  it("mantém os três indicadores em uma linha ultracompacta na ordem solicitada", () => {
    expect(page).toContain('className="grid h-10 grid-cols-3 divide-x divide-current/15 px-1 sm:px-4"');
    expect(page).toContain('firstLabel="Ciclo"');
    expect(page).toContain('secondLabel="Assinados"');
    expect(page).toContain('thirdLabel="Receber"');
    expect(page).toContain('flex min-w-0 items-center justify-center gap-1');
    expect(page).not.toContain('firstLabel="A receber neste ciclo"');
    expect(page).not.toContain('Resumo do ciclo');
  });

  it("reutiliza a mesma composição enxuta para o responsável financeiro", () => {
    expect(page).toContain('thirdLabel="A pagar"');
    expect(page).toContain('tone="blue"');
  });
});
