import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Testes de regressão para as correções da auditoria de usabilidade Floto
// (claude/usabilidade-floto-pagina-principal, 2026-10-10).
// Fonte: "Floto Audit Report - Usability.pdf" enviado pelo usuário.

const headerSource = readFileSync(
  resolve(process.cwd(), "client/src/components/AppHeader.tsx"),
  "utf8",
);
const pageSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"),
  "utf8",
);

describe("Achado 5 (Floto): logo e nome da unidade agrupados no header", () => {
  it("agrupa o botão do logo e o unitSlot dentro de um único contêiner flex", () => {
    const groupStart = headerSource.indexOf('<div className="flex items-center gap-3">');
    expect(groupStart).toBeGreaterThan(-1);

    const logoButtonIdx = headerSource.indexOf('title="Ir para listagem de exames"', groupStart);
    const unitSlotIdx = headerSource.indexOf("{unitSlot && (", groupStart);

    expect(logoButtonIdx).toBeGreaterThan(groupStart);
    expect(unitSlotIdx).toBeGreaterThan(logoButtonIdx);

    // O unitSlot deve estar fechado antes do fim do contêiner agrupador (sem voltar
    // a ser irmão direto do justify-between externo).
    const afterUnitSlot = headerSource.slice(unitSlotIdx, unitSlotIdx + 400);
    expect(afterUnitSlot).toContain("</div>");
  });
});

describe("Achado 2 (Floto): ícone no botão 'Estudos' da navegação", () => {
  it("usa o ícone Clipboard junto ao texto 'Estudos', como Administração e Financeiro", () => {
    const estudosIdx = pageSource.lastIndexOf(">\n              Estudos");
    expect(estudosIdx).toBeGreaterThan(-1);
    const nearby = pageSource.slice(Math.max(0, estudosIdx - 300), estudosIdx);
    expect(nearby).toContain("<Clipboard");
    expect(nearby).toContain("bg-amber-700 text-white");
  });
});

describe("Achado 3 (Floto): botão 'Ver exames de hoje' com destaque visual", () => {
  it("usa estilo sólido (bg-amber-700) igual ao filtro 'Hoje' ativo, não mais o estilo ghost", () => {
    const idx = pageSource.indexOf("Ver exames de hoje");
    expect(idx).toBeGreaterThan(-1);
    const before = pageSource.slice(Math.max(0, idx - 400), idx);
    expect(before).toContain("bg-amber-700 text-white");
    expect(before).not.toContain('border border-gray-300 text-gray-600 hover:bg-gray-50"');
  });
});

describe("Achado 6 (Floto): campo de busca de paciente com largura adequada", () => {
  it("usa w-[300px] em vez do antigo w-44 (176px)", () => {
    const idx = pageSource.indexOf('placeholder="Buscar paciente..."');
    expect(idx).toBeGreaterThan(-1);
    const after = pageSource.slice(idx, idx + 600);
    expect(after).toContain("w-[300px]");
    expect(after).not.toContain(' w-44"');
  });
});
