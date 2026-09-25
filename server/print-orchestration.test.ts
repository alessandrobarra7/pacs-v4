// Testes de regressão para o "RELATO TÉCNICO — BLOQUEIO DA IMPRESSÃO
// OFICIAL DE LAUDOS PDF" (Manus, 2026-09-25), que revisou o commit
// 058a5c1 e bloqueou merge/VM1: a impressão oficial tentava remover, por
// regex, o script de auto-print embutido em `fullHtml` antes de
// reconstruir as páginas — mas a regex não reconhecia o `</script>` real
// gerado pelo template literal, então o script sobrevivia e disparava
// `window.print()` sozinho ~400ms depois do carregamento do iframe,
// ANTES da reconstrução paginada controlada (que só começava depois de
// esperar 800ms), ou mesmo quando essa reconstrução falhava.
//
// Correção: `fullHtml` deixou de conter esse script — não há mais nada
// para remover por regex (ver client/src/pages/PacsQueryPage.tsx). A
// impressão oficial passou a disparar print() por um único caminho
// explícito, `runControlledPrint` (client/src/lib/printOrchestration.ts),
// extraída especificamente para ser testável com funções injetadas —
// exatamente o que a Manus pediu na seção "Testes que devem acompanhar a
// correção", itens 1, 3 e 4: teste comportamental do fluxo de impressão
// via função extraída/injetável; nenhuma chamada a print() quando a
// reconstrução falha; exatamente uma chamada a print(), depois da
// reconstrução, quando ela tem sucesso.
//
// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runControlledPrint } from "../client/src/lib/printOrchestration";

describe("runControlledPrint — orquestração comportamental da impressão oficial", () => {
  it("quando a reconstrução tem sucesso, print() é chamado exatamente uma vez, depois da reconstrução", async () => {
    const callOrder: string[] = [];
    const reconstruct = vi.fn(async () => {
      callOrder.push("reconstruct");
    });
    const print = vi.fn(() => {
      callOrder.push("print");
    });

    const result = await runControlledPrint({ reconstruct, print });

    expect(result).toEqual({ printed: true });
    expect(reconstruct).toHaveBeenCalledTimes(1);
    expect(print).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["reconstruct", "print"]);
  });

  it("quando a reconstrução falha (ContentTooLargeForPageError ou qualquer erro), print() NUNCA é chamado", async () => {
    const error = new Error("bloco maior que a página");
    const reconstruct = vi.fn(async () => {
      throw error;
    });
    const print = vi.fn();

    const result = await runControlledPrint({ reconstruct, print });

    expect(result).toEqual({ printed: false, error });
    expect(print).not.toHaveBeenCalled();
  });

  it("propaga o erro original da reconstrução sem envolver ou mascarar", async () => {
    class CustomError extends Error {}
    const original = new CustomError("erro específico de paginação");
    const reconstruct = vi.fn(async () => {
      throw original;
    });
    const print = vi.fn();

    const result = await runControlledPrint({ reconstruct, print });

    expect(result.printed).toBe(false);
    if (!result.printed) {
      expect(result.error).toBe(original);
    }
    expect(print).not.toHaveBeenCalled();
  });

  it("uma falha síncrona dentro de print() não é reinterpretada como falha de reconstrução (reconstruct já havia resolvido)", async () => {
    const reconstruct = vi.fn(async () => {});
    const printError = new Error("falha ao abrir diálogo de impressão");
    const print = vi.fn(() => {
      throw printError;
    });

    await expect(runControlledPrint({ reconstruct, print })).rejects.toBe(printError);
    expect(reconstruct).toHaveBeenCalledTimes(1);
  });
});

describe("wiring — fullHtml não contém mais nenhum script de auto-print, e a impressão oficial usa runControlledPrint", () => {
  const pacsQuerySource = readFileSync(
    resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"),
    "utf8",
  );

  it("fullHtml não contém window.onload nem window.print() em nenhum lugar do template", () => {
    // Localiza o template literal de fullHtml e confirma que, do início ao
    // fim dele, não existe window.onload nem window.print() — nenhuma
    // regex de remoção é necessária porque o script nunca é gerado.
    const startIdx = pacsQuerySource.indexOf("const fullHtml = `<!DOCTYPE html>");
    expect(startIdx).toBeGreaterThan(0);
    const endMarker = "</body></html>`;";
    const endIdx = pacsQuerySource.indexOf(endMarker, startIdx);
    expect(endIdx).toBeGreaterThan(startIdx);
    const fullHtmlTemplate = pacsQuerySource.slice(startIdx, endIdx + endMarker.length);

    expect(fullHtmlTemplate).not.toContain("window.onload");
    expect(fullHtmlTemplate).not.toContain("window.print()");
    expect(fullHtmlTemplate).not.toMatch(/<script>/);
  });

  it("nenhuma tentativa de remover script por regex sobrevive no arquivo (a causa raiz do bloqueio foi eliminada, não remendada)", () => {
    expect(pacsQuerySource).not.toContain("printHtmlWithoutAutoPrint");
    expect(pacsQuerySource).not.toMatch(/fullHtml\.replace\(/);
  });

  it("a ação 'Imprimir' escreve fullHtml diretamente (sem transformação) e delega o disparo de print() a runControlledPrint", () => {
    expect(pacsQuerySource).toContain('import { runControlledPrint } from "@/lib/printOrchestration";');
    expect(pacsQuerySource).toContain("pDoc.write(fullHtml);");
    expect(pacsQuerySource).toContain("const printResult = await runControlledPrint({");
    expect(pacsQuerySource).toContain("reconstruct: () => reconstructPaginatedPages(pDoc),");
    // print() só é acionado dentro do callback passado a runControlledPrint,
    // nunca mais como uma chamada solta logo após a reconstrução.
    const callbackIdx = pacsQuerySource.indexOf("print: () => {");
    expect(callbackIdx).toBeGreaterThan(0);
    const callbackSlice = pacsQuerySource.slice(callbackIdx, callbackIdx + 200);
    expect(callbackSlice).toContain("printIframe.contentWindow?.print();");
  });

  it("uma falha em runControlledPrint (printed:false) é relançada e tratada pelo catch, sem chamar print()", () => {
    expect(pacsQuerySource).toContain("if (!printResult.printed) {");
    expect(pacsQuerySource).toContain("throw printResult.error;");
  });
});
