/**
 * FONTE DA LEGENDA DO EXAME (pedido do Alessandro, 2026-10-13):
 *
 * O Alessandro notou que o nome do exame/legenda na listagem PACS usava uma
 * fonte "pobre" — causa raiz: o sistema inteiro, fora do módulo Financeiro,
 * nunca teve nenhuma fonte customizada definida em CSS, então o navegador
 * caía no padrão do sistema operacional de quem estava vendo a tela (Segoe
 * UI no Windows, por exemplo).
 *
 * Ele comparou 5 opções (mockups autocontidos, com as fontes reais
 * embutidas em base64, reproduzindo a página real) e escolheu Work Sans.
 *
 * Escopo confirmado por ele antes da implementação (pergunta direta):
 * SOMENTE o texto do nome do exame (componente ExamName, coluna "Exame" da
 * tabela desktop em PacsQueryPage.tsx) — não o sistema inteiro, não a linha
 * da tabela, não outros componentes.
 *
 * Este teste prova, via leitura do código-fonte, que:
 * 1. Work Sans é carregada via Google Fonts em client/index.html, junto com
 *    as fontes já existentes do Financeiro (Manrope/Sora) — sem duplicar a
 *    tag <link>, sem preconnect extra desnecessário.
 * 2. A classe .exam-legend-font (que aplica Work Sans) é definida em
 *    client/src/index.css dentro de @layer base, e NUNCA é aplicada ao
 *    body/seletor global — só existe como classe utilitária isolada.
 * 3. ExamName (e só ExamName) aplica essa classe ao texto do nome do exame.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(
  new URL("../client/index.html", import.meta.url),
  "utf-8",
);
const indexCss = readFileSync(
  new URL("../client/src/index.css", import.meta.url),
  "utf-8",
);
const pacsQueryPageTsx = readFileSync(
  new URL("../client/src/pages/PacsQueryPage.tsx", import.meta.url),
  "utf-8",
);

describe("Fonte Work Sans na legenda/nome do exame (PACS)", () => {
  it("Work Sans é carregada via Google Fonts em client/index.html, junto com Manrope/Sora do Financeiro", () => {
    expect(indexHtml).toContain(
      "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@500;600;700&family=Work+Sans:wght@400;500;600&display=swap",
    );
    // não duplica preconnects
    expect(
      (indexHtml.match(/fonts\.googleapis\.com"/g) ?? []).length,
    ).toBe(1);
    expect(
      (indexHtml.match(/fonts\.gstatic\.com"/g) ?? []).length,
    ).toBe(1);
  });

  it("a classe .exam-legend-font existe em index.css, aplica Work Sans e nunca é usada no seletor global/body", () => {
    expect(indexCss).toContain(".exam-legend-font {");
    expect(indexCss).toContain(
      "font-family: 'Work Sans', ui-sans-serif, system-ui, sans-serif;",
    );
    // a definição da classe não está dentro da regra `body { ... }`
    const bodyRuleMatch = indexCss.match(/body\s*\{[^}]*\}/);
    expect(bodyRuleMatch).not.toBeNull();
    expect(bodyRuleMatch![0]).not.toContain("exam-legend-font");
    expect(bodyRuleMatch![0]).not.toContain("Work Sans");
  });

  it("ExamName aplica exam-legend-font no texto do nome do exame (e nenhum outro className no arquivo usa essa classe)", () => {
    expect(pacsQueryPageTsx).toContain(
      "<span className={`exam-legend-font text-sm leading-tight ${unselected ? 'text-gray-400' : 'text-gray-800'}`}>{label}</span>",
    );
    // só pode aparecer em className (uso real) — qualquer outra ocorrência
    // teria que ser o comentário explicativo logo acima da função ExamName.
    const classNameUsages = (
      pacsQueryPageTsx.match(/className=\{[^}]*exam-legend-font[^}]*\}/g) ?? []
    ).length;
    expect(classNameUsages).toBe(1);
  });
});
