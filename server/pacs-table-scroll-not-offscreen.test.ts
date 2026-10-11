import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regressão (claude/corrige-scroll-horizontal-fora-da-tela, 2026-10-11).
 *
 * Contexto: a correção anterior (claude/responsividade-tabela-estudos-telas-estreitas)
 * envolveu a tabela de estudos num <div className="hidden md:block overflow-x-auto">
 * SEM altura limitada, aninhado dentro do <div className="flex-1 overflow-auto"> que já
 * existia (e já é limitado à altura visível da tela via flex, já trata rolagem horizontal
 * sozinho). Esse aninhamento fazia a caixa interna crescer livremente com a altura de
 * TODAS as linhas da tabela, empurrando a própria barra de rolagem horizontal (que fica
 * na borda inferior da caixa) para fora da área visível em janelas não muito altas —
 * reportado pelo Alessandro ("pra mim aparece como espremido") e confirmado reproduzindo
 * o mesmo tamanho de janela real (965x620): a barra da tabela ficava em y=850, abaixo da
 * viewport de 620px de altura, só acessível rolando a página inteira para baixo primeiro.
 *
 * Fix: remover o `overflow-x-auto` aninhado. A tabela passa a ficar direto dentro do
 * <div className="flex-1 overflow-auto"> existente, que já cuida de ambos os eixos e já
 * é do tamanho exato da área visível — a barra de rolagem (quando necessária) fica
 * sempre ancorada na borda da área visível, nunca exigindo rolagem vertical extra.
 */

const pageSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"),
  "utf8",
);

describe("PacsQueryPage: tabela de estudos não cria scroll horizontal aninhado fora da tela", () => {
  it("o container externo que já é limitado à altura visível continua existindo", () => {
    expect(pageSource).toContain('<div className="flex-1 overflow-auto">');
  });

  it("não existe mais um overflow-x-auto aninhado só em volta da tabela desktop", () => {
    // O bloco antigo e quebrado: 'className="hidden md:block overflow-x-auto"'.
    expect(pageSource).not.toContain('className="hidden md:block overflow-x-auto"');
    // O wrapper de exibição (hidden/md:block) continua existindo, só sem o overflow-x-auto
    // aninhado — é o container externo (flex-1 overflow-auto) que agora cuida do scroll.
    expect(pageSource).toContain('className="hidden md:block"');
  });

  it("a tabela continua com min-w-[1100px] (não volta a comprimir colunas)", () => {
    expect(pageSource).toContain('className="w-full min-w-[1100px] text-sm border-collapse"');
  });

  it("o comentário da CORREÇÃO 2 está presente, documentando a causa raiz do scroll fora da tela", () => {
    expect(pageSource).toContain("CORREÇÃO 2 (auditoria claude/corrige-scroll-horizontal-fora-da-tela");
    expect(pageSource).toContain("empurrando a própria barra de rolagem horizontal");
  });
});
