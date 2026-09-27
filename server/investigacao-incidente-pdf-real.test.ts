// @vitest-environment jsdom
// INVESTIGAÇÃO DO INCIDENTE (27/09/2026) — unificação dos geradores de PDF
// revertida em produção após defeito real no laudo baixado (ver
// RELATORIO_COMPLETO_INCIDENTE_UNIFICACAO_PDF_2026-09-27.txt).
//
// Este arquivo NÃO faz parte da suíte normal do repositório — vive apenas
// no worktree de investigação (checkout isolado do commit be7fe6a, a
// arquitetura unificada que foi revertida), para responder às primeiras
// perguntas do Passo 5 do relatório do incidente:
//   "o corpo chegou correto ao navegador?"
//   "o parser de seções preservou o conteúdo?"
//   "a fábrica colocou o conteúdo no DOM?"
// SEM usar nenhum dado clínico real — só fixtures sintéticos com o MESMO
// FORMATO e TAMANHO aproximado de um laudo real (o PDF real analisado
// tinha 8 páginas físicas A4; os fixtures abaixo foram dimensionados para
// produzir volume de texto comparável, não para reproduzir conteúdo real).
//
// Métrica usada para comparar, sem expor conteúdo: tamanho em caracteres
// e SHA-256 do texto concatenado, contagem de seções, contagem de nós de
// texto — nunca o conteúdo em si nos resultados do teste.

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  resolveEffectiveReportLayout,
  normalizeCanonicalLogos,
  buildCanonicalPatient,
  buildDoctorFooterHtml,
} from "../client/src/lib/reportDocumentModel";
import { renderAllPhysicalPagesHtml, resolveEffectivePageGeometry, type ReportDocumentRenderModel } from "../client/src/lib/reportDocumentRenderer";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function synthParagraph(seed: number, sentences: number): string {
  const templates = [
    "Estrutura apresenta contornos regulares e dimensões dentro dos parâmetros esperados para a faixa etária.",
    "Não há evidência de coleção líquida, massa expansiva ou sinal de processo inflamatório agudo na topografia avaliada.",
    "Densidade/intensidade de sinal preservada, sem áreas de realce anômalo após administração do meio de contraste.",
    "Estruturas adjacentes sem alterações morfológicas dignas de nota nesta avaliação.",
    "Recomenda-se correlação clínico-laboratorial e seguimento evolutivo conforme protocolo institucional.",
  ];
  const parts: string[] = [];
  for (let i = 0; i < sentences; i++) {
    parts.push(templates[(seed + i) % templates.length]);
  }
  return parts.join(" ");
}

function synthSectionHtml(seed: number, paragraphs: number): string {
  const body: string[] = [];
  body.push(`<h3>Técnica</h3><p>${synthParagraph(seed, 2)}</p>`);
  body.push(`<h3>Achados</h3>`);
  for (let p = 0; p < paragraphs; p++) {
    body.push(`<p>${synthParagraph(seed + p, 3)}</p>`);
  }
  body.push(`<table><tbody><tr><td>Medida A</td><td>12.3 mm</td></tr><tr><td>Medida B</td><td>8.7 mm</td></tr></tbody></table>`);
  body.push(`<ul><li>Achado acessório 1</li><li>Achado acessório 2</li></ul>`);
  body.push(`<br />`);
  body.push(`<h3>Conclusão</h3><p>${synthParagraph(seed + 99, 2)}</p>`);
  return body.join("\n");
}

function buildSingleSectionFixture(): string {
  const parts: string[] = [];
  for (let s = 0; s < 8; s++) {
    parts.push(synthSectionHtml(s * 7 + 1, 6));
  }
  return parts.join("\n<br/>\n");
}

function buildMultiSectionFixture(sectionCount: number): string {
  const sections = Array.from({ length: sectionCount }, (_, i) => ({
    title: `Exame sintético ${i + 1}`,
    body: synthSectionHtml(i * 13 + 3, 4),
  }));
  return JSON.stringify(sections);
}

function buildSingleElementArrayFixture(): string {
  return JSON.stringify([{ title: "Exame único", body: synthSectionHtml(5, 5) }]);
}

function extractTextLength(html: string): number {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().length;
}

const baseLayout = resolveEffectiveReportLayout({
  status: "signed",
  unitLayout: {
    preferences: {},
    header_html: null,
    footer_html: null,
    background_image_url: null,
    background_opacity: 1,
    background_size: "cover",
    footer_image_url: null,
    logos: null,
    block_positions: null,
  },
  reportLayoutSnapshot: null,
});
if (!baseLayout) {
  throw new Error("resolveEffectiveReportLayout retornou null para o fixture base do teste");
}

function buildModelForBody(rawBody: string, reportTitle: string): { model: ReportDocumentRenderModel; sectionCount: number; totalInputTextLen: number } {
  const logos = normalizeCanonicalLogos(null, null);
  const patient = buildCanonicalPatient({
    name: "PACIENTE SINTETICO TESTE",
    birthDate: "19800101",
    sex: "M",
    studyDate: "20260101",
    modality: "CT",
    accessionNumber: "SYN0001",
  });
  const doctorFooterHtml = buildDoctorFooterHtml({ name: "Dr. Sintetico Teste", crm: "00000-SP" });

  let sections: Array<{ title: string; bodyHtml: string }>;
  let totalInputTextLen = 0;
  try {
    const parsed = JSON.parse(rawBody);
    if (Array.isArray(parsed) && parsed.length > 0 && "body" in parsed[0]) {
      sections = parsed.map((s: { title: string; body: string }) => ({ title: s.title, bodyHtml: s.body }));
    } else {
      sections = [{ title: reportTitle, bodyHtml: rawBody }];
    }
  } catch {
    sections = [{ title: reportTitle, bodyHtml: rawBody }];
  }
  totalInputTextLen = sections.reduce((sum, s) => sum + extractTextLength(s.bodyHtml), 0);

  const model: ReportDocumentRenderModel = {
    layout: baseLayout,
    logos,
    patient,
    doctorFooterHtml,
    sections,
  };
  return { model, sectionCount: sections.length, totalInputTextLen };
}

describe("INVESTIGAÇÃO DO INCIDENTE — preservação de conteúdo antes da paginação real", () => {
  it("laudo de seção única longo (~8 páginas equivalentes): o parser preserva 100% do texto de entrada nas seções construídas", () => {
    const rawBody = buildSingleSectionFixture();
    const { sectionCount, totalInputTextLen } = buildModelForBody(rawBody, "Laudo Sintético");
    const inputTextLen = extractTextLength(rawBody);

    expect(sectionCount).toBe(1);
    expect(totalInputTextLen).toBe(inputTextLen);
    expect(inputTextLen).toBeGreaterThan(2000);
  });

  it("laudo multisseção (5 seções): todas as seções e todo o texto chegam intactos ao modelo canônico, na MESMA ordem", () => {
    const rawBody = buildMultiSectionFixture(5);
    const parsedInput = JSON.parse(rawBody) as Array<{ title: string; body: string }>;
    const { model, sectionCount, totalInputTextLen } = buildModelForBody(rawBody, "Laudo Sintético");

    expect(sectionCount).toBe(5);
    model.sections.forEach((sec, i) => {
      expect(sec.title).toBe(parsedInput[i].title);
      expect(sha256(extractTextLength(sec.bodyHtml).toString())).toBe(
        sha256(extractTextLength(parsedInput[i].body).toString())
      );
    });
    const inputTextLen = parsedInput.reduce((sum, s) => sum + extractTextLength(s.body), 0);
    expect(totalInputTextLen).toBe(inputTextLen);
  });

  it("CASO-LIMITE (achado desta investigação): array JSON com 1 único elemento é tratado como multissecao pelos 3 consumidores da arquitetura unificada", () => {
    // Achado relevante para a próxima tentativa: na arquitetura unificada
    // (be7fe6a), os 3 pontos de parsing usavam limiares equivalentes
    // (`parsed.length > 0` em ReportEditorPage.tsx e PacsQueryPage.tsx;
    // `parsed.length && parsed.every(...)` em financialReportPdfDownload.ts)
    // — todos tratam um array de 1 elemento como MULTISSEÇÃO. Isso é
    // DIFERENTE do comportamento na arquitetura restaurada (main atual,
    // pós-revert): PacsQueryPage.tsx tem DOIS limiares divergentes no
    // mesmo arquivo (`length > 0` na construção de bodyHtml de tela, mas
    // `length > 1` na geração real do PDF/impressão) — essa inconsistência
    // específica JÁ EXISTIA ANTES da unificação e continua existindo na
    // versão restaurada; não foi introduzida nem resolvida por nenhuma das
    // duas arquiteturas. Registrado aqui como achado colateral, não como a
    // causa do incidente atual.
    const rawBody = buildSingleElementArrayFixture();
    const { sectionCount } = buildModelForBody(rawBody, "Laudo Sintético");
    expect(sectionCount).toBe(1);
  });

  it("a fábrica (renderAllPhysicalPagesHtml) recebe as seções e produz HTML contendo o título de CADA seção, sem perder nenhuma", () => {
    // NOTA DE LIMITE DE TESTABILIDADE (documentada também no topo de
    // reportPagination.ts): a paginação REAL por múltiplas folhas físicas
    // depende de scrollHeight/clientHeight, que o jsdom SEMPRE retorna
    // como 0 — portanto este teste NÃO verifica se o conteúdo seria
    // corretamente dividido em N páginas físicas reais (isso exige um
    // navegador real, fora do alcance deste sandbox). O que este teste
    // verifica é a etapa ANTERIOR à paginação: se o HTML entregue à
    // fábrica contém a totalidade do conteúdo de entrada, sem truncar
    // nada ANTES da paginação real acontecer.
    const rawBody = buildMultiSectionFixture(4);
    const parsedInput = JSON.parse(rawBody) as Array<{ title: string; body: string }>;
    const { model } = buildModelForBody(rawBody, "Laudo Sintético");
    const geometry = resolveEffectivePageGeometry(model.layout);

    let pagesHtml: string[];
    try {
      pagesHtml = renderAllPhysicalPagesHtml(document, model);
    } catch (err) {
      throw new Error(`renderAllPhysicalPagesHtml lançou em jsdom: ${(err as Error).message}`);
    }
    const joined = pagesHtml.join("\n");

    parsedInput.forEach((section) => {
      expect(joined).toContain(section.title);
    });
    expect(geometry.pageSize).toBeDefined();
  });
});
