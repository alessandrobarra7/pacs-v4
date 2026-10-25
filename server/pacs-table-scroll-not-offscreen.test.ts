import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regressão (claude/corrige-scroll-horizontal-fora-da-tela, 2026-10-11).
 *
 * Contexto (correção 2): a correção anterior (claude/responsividade-tabela-estudos-telas-estreitas)
 * envolveu a tabela de estudos num <div className="hidden md:block overflow-x-auto">
 * SEM altura limitada, aninhado dentro do <div className="flex-1 overflow-auto"> — removido
 * o overflow-x-auto aninhado, deixando o container externo cuidar do scroll.
 *
 * Bloqueio apontado pela Manus e correção 3: a premissa de que o container externo
 * (`flex-1 overflow-auto`) já era limitado à altura visível da tela era falsa, porque o
 * container raiz da página usava `min-h-screen` (altura MÍNIMA, não fixa) sem `overflow-hidden`,
 * e o container da tabela não tinha `min-h-0` — então o item flex `flex-1` assumia como altura
 * mínima a altura do próprio conteúdo (todas as linhas), crescendo a página inteira em vez de
 * encolher ao espaço disponível. O mesmo bug reaparecia um nível acima: a barra de rolagem
 * horizontal ficava no rodapé de um container que crescia com a tabela inteira, fora da
 * viewport em janelas baixas (confirmado por geometria reproduzida: worklistBottom 1301 >
 * viewportHeight 1100, no cenário relatado pela Manus).
 *
 * Fix final: raiz com `h-[100dvh] min-h-0 flex flex-col overflow-hidden` (altura real da
 * tela, permite encolher, página em si não rola) + container da tabela com
 * `min-h-0 flex-1 overflow-auto` (permite que o flex-1 realmente encolha ao espaço
 * disponível). O único mecanismo de rolagem passa a ser o `flex-1 overflow-auto` da tabela,
 * que fica sempre dentro da área visível, com altura real (não apenas mínima) do viewport.
 *
 * NOTA: estes testes leem o texto-fonte (ambiente vitest é "node", sem layout CSS real).
 * A prova de geometria real (clientHeight/scrollHeight/getBoundingClientRect em 965x620)
 * foi feita manualmente no navegador (ver handoff), não pode ser expressa aqui.
 */

const pageSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"),
  "utf8",
);

describe("PacsQueryPage: tabela de estudos não cria scroll horizontal aninhado fora da tela", () => {
  it("o container raiz da página tem altura real de viewport, encolhe e não rola por conta própria", () => {
    expect(pageSource).toContain('className="h-[100dvh] min-h-0 flex flex-col overflow-hidden"');
    expect(pageSource).not.toContain('className="min-h-screen flex flex-col"');
  });

  it("o container da tabela tem min-h-0 para realmente encolher ao espaço disponível (flex-1)", () => {
    expect(pageSource).toContain('<div className="min-h-0 flex-1 overflow-auto">');
  });

  it("não existe mais um overflow-x-auto aninhado só em volta da tabela desktop", () => {
    // O bloco antigo e quebrado: 'className="hidden md:block overflow-x-auto"'.
    expect(pageSource).not.toContain('className="hidden md:block overflow-x-auto"');
    // O wrapper de exibição (hidden/md:block) continua existindo, só sem o overflow-x-auto
    // aninhado — é o container externo (flex-1 overflow-auto) que agora cuida do scroll.
    // A partir da CORREÇÃO 4, o wrapper também carrega a classe do modo compacto.
    // ATUALIZADO (auditoria claude/ajustes-mobile, 2026-10-25): breakpoint md -> lg.
    expect(pageSource).not.toContain('className="hidden lg:block overflow-x-auto"');
    expect(pageSource).toContain('className="hidden lg:block pacs-studies-compact"');
  });

  it("CORREÇÃO 4: modo compacto via container query está presente e escopado ao wrapper da tabela", () => {
    expect(pageSource).toContain("CORREÇÃO 4 (auditoria claude/corrige-scroll-horizontal-fora-da-tela");
    expect(pageSource).toContain(".pacs-studies-compact { container-type: inline-size; }");
    expect(pageSource).toContain("@container (max-width: 1150px)");
    // Escopado: os seletores do modo compacto não devem aparecer soltos, sempre
    // precedidos pela classe do wrapper, para não vazar o encolhimento para o resto da página.
    expect(pageSource).toContain(".pacs-studies-compact table { font-size: 11px; }");
    expect(pageSource).toContain(".pacs-studies-compact th, .pacs-studies-compact td { padding:");
  });

  it("a tabela continua com min-w-[1100px] (não volta a comprimir colunas)", () => {
    expect(pageSource).toContain('className="w-full min-w-[1100px] text-sm border-collapse"');
  });

  it("o comentário da CORREÇÃO 2 está presente, documentando a causa raiz do scroll fora da tela", () => {
    expect(pageSource).toContain("CORREÇÃO 2 (auditoria claude/corrige-scroll-horizontal-fora-da-tela");
    expect(pageSource).toContain("empurrando a própria barra de rolagem horizontal");
  });

  it("o comentário da CORREÇÃO 3 está presente, documentando o bloqueio da Manus e o fix final", () => {
    expect(pageSource).toContain("CORREÇÃO 3 (auditoria claude/corrige-scroll-horizontal-fora-da-tela");
    expect(pageSource).toContain("worklistBottom 1301 > viewportHeight 1100");
  });
});
