import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");

describe("faixa financeira responsiva", () => {
  it("mantém os três indicadores em uma linha ultracompacta na ordem solicitada", () => {
    expect(page).toContain('className="grid h-5 grid-cols-3 divide-x divide-current/15 px-1 sm:px-4 md:h-7 md:w-[395px] md:px-0"');
    expect(page).toContain('firstLabel="Ciclo"');
    expect(page).toContain('secondLabel="Assinados"');
    expect(page).toContain('thirdLabel="Receber"');
    expect(page).toContain('flex min-w-0 items-center justify-center gap-1');
    expect(page).toContain('text-[8px] font-semibold uppercase');
    expect(page).toContain('text-[11px] font-bold');
    expect(page).not.toContain('firstLabel="A receber neste ciclo"');
    expect(page).not.toContain('Resumo do ciclo');
  });

  it("reutiliza a mesma composição enxuta para o responsável financeiro", () => {
    expect(page).toContain('thirdLabel="A pagar"');
    expect(page).toContain('tone="blue"');
  });

  it("limita a apresentação desktop ao trecho esquerdo e reduz sua altura", () => {
    expect(page).toContain("md:h-7 md:w-[395px] md:px-0");
    expect(page).toContain("md:text-[8px]");
    expect(page).toContain("md:text-[10px]");
  });
});
