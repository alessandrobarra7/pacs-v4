// Testes de regressão da Fase 2 da unificação dos geradores de PDF/
// impressão de laudos — fábrica canônica de páginas físicas
// (client/src/lib/reportDocumentRenderer.tsx), autorizada pela Manus em
// "Aprovação técnica — Fase 1 da unificação dos geradores de PDF"
// (26/09/2026), que listou os testes mínimos obrigatórios da Fase 2:
//
//   - uma seção longa e uma composição multisseção;
//   - A4 e Letter, cada um com margens não padrão;
//   - conteúdo que gere múltiplas páginas físicas sem página vazia;
//   - verificação de cabeçalho, logos, dados clínicos, assinatura/carimbo
//     e imagem de rodapé em CADA página física;
//   - confirmação de que medição e HTML final usam o mesmo shell;
//   - falha de medição classificada sem impressão residual;
//   - testes puros do gerador e, quando houver DOM/iframe, regressões de
//     wiring específicas.
//
// TESTABILIDADE: assim como reportPagination.ts (ver report-pagination.
// test.ts), a medição real por layout de navegador (scrollHeight/
// clientHeight) não é exercitável em jsdom (sempre reporta 0) — por isso
// `renderPaginatedReportPages`/`renderAllPhysicalPagesHtml` aceitam um
// `paginate` injetável, usado aqui para simular determinística e
// exaustivamente cenários de 1, 2 e 3+ páginas físicas por seção, sem
// depender de Chromium real. A validação visual real fica com a Manus,
// como em todas as rodadas anteriores deste projeto.
//
// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  buildReportSheetProps,
  renderAllPhysicalPagesHtml,
  renderPaginatedReportPages,
  renderReportPhysicalPageHtml,
  resolveEffectivePageGeometry,
  type ReportDocumentRenderModel,
} from "../client/src/lib/reportDocumentRenderer";
import { ContentTooLargeForPageError, type PageBuilder } from "../client/src/lib/reportPagination";
import type { EffectiveReportLayout } from "../client/src/lib/reportDocumentModel";

function makeLayout(overrides: Partial<EffectiveReportLayout> = {}): EffectiveReportLayout {
  return {
    source: "unit",
    preferences: { pageSize: "A4", marginTop: 20, marginRight: 25, marginBottom: 25, marginLeft: 25, fontFamily: "Arial", fontSize: 11, lineHeight: 1.6 },
    header_html: null,
    footer_html: null,
    background_image_url: null,
    background_opacity: 1,
    background_size: "cover",
    footer_image_url: "/unit-footer.png",
    logos: null,
    block_positions: null,
    ...overrides,
  };
}

function makeModel(overrides: Partial<ReportDocumentRenderModel> = {}): ReportDocumentRenderModel {
  return {
    layout: makeLayout(),
    logos: [{ url: "/unit-logo.png", width: 200, height: 50, label: "Logo" }],
    patient: {
      name: "MARIA DA SILVA",
      birthDate: "01/02/1980",
      sex: "Feminino",
      studyDate: "26/09/2026",
      modality: "CT",
      accessionNumber: "ACC-123",
    },
    doctorFooterHtml: '<div class="doctor-footer"><div class="sig-name">DR. JOÃO TESTE</div><div class="sig-crm">CRM: 12345</div></div>',
    sections: [{ title: "Tomografia de Tórax", bodyHtml: "<p>Achados normais.</p>" }],
    ...overrides,
  };
}

/** Fake de paginateSectionIntoPages: ignora medição real e devolve
 * exatamente os HTMLs de página informados, na ordem — permite testar a
 * montagem final (renderAllPhysicalPagesHtml) sem depender de layout real
 * de navegador, mesma convenção de report-pagination.test.ts. */
function fakePaginateReturning(pagesHtmlBySection: string[][]) {
  let callIndex = 0;
  return (_source: HTMLElement, makeEmptyBody: () => HTMLElement): string[] => {
    const pagesHtml = pagesHtmlBySection[callIndex] ?? [];
    callIndex += 1;
    // Ainda exercita makeEmptyBody (cria e descarta uma folha de medição
    // real) para provar que o wiring de criação/anexação/remoção da folha
    // de medição continua correto mesmo com o resultado da paginação
    // simulado.
    const body = makeEmptyBody();
    expect(body).toBeTruthy();
    return pagesHtml;
  };
}

function fakePaginateThrowing(error: Error) {
  return (_source: HTMLElement, makeEmptyBody: () => HTMLElement): string[] => {
    // Exercita a criação da folha de medição (que deve ser limpa pelo
    // `finally` do chamador) antes de lançar o erro de medição.
    makeEmptyBody();
    throw error;
  };
}

describe("resolveEffectivePageGeometry — A4/Letter e margens não padrão (Requisito 4 da Fase 2)", () => {
  it("usa A4 e as margens configuradas quando presentes", () => {
    const geometry = resolveEffectivePageGeometry(
      makeLayout({ preferences: { pageSize: "A4", marginTop: 17, marginRight: 33, marginBottom: 41, marginLeft: 9, fontFamily: "Georgia", fontSize: 13, lineHeight: 1.9 } }),
    );
    expect(geometry).toEqual({
      pageSize: "A4",
      marginTop: 17,
      marginRight: 33,
      marginBottom: 41,
      marginLeft: 9,
      fontFamily: "Georgia",
      fontSize: 13,
      lineHeight: 1.9,
    });
  });

  it("usa Letter com margens não padrão (nenhuma ficando 'presa' ao default A4)", () => {
    const geometry = resolveEffectivePageGeometry(makeLayout({ preferences: { pageSize: "Letter", marginTop: 1, marginRight: 2, marginBottom: 3, marginLeft: 4 } }));
    expect(geometry.pageSize).toBe("Letter");
    expect(geometry).toMatchObject({ marginTop: 1, marginRight: 2, marginBottom: 3, marginLeft: 4 });
  });

  it("preenche apenas os campos ausentes das preferências com os defaults, sem sobrescrever os presentes", () => {
    const geometry = resolveEffectivePageGeometry(makeLayout({ preferences: { pageSize: "Letter", marginLeft: 44 } }));
    expect(geometry.pageSize).toBe("Letter");
    expect(geometry.marginLeft).toBe(44);
    // marginTop/Right/Bottom ausentes no snapshot de teste caem no default.
    expect(geometry.marginTop).toBe(20);
  });
});

describe("buildReportSheetProps — regra de repetição em toda página física (Requisito 3 da Fase 2)", () => {
  it("inclui logos, dados do paciente, rodapé do médico e imagem de rodapé na PRIMEIRA página de um documento de 3 páginas", () => {
    const model = makeModel();
    const props = buildReportSheetProps(model, { sectionTitle: "Seção", bodyHtml: "<p>a</p>", physicalPageIndex: 0, totalPhysicalPages: 3 });
    expect(props.logos).toEqual([{ url: "/unit-logo.png", width: 200, height: 50, label: "Logo" }]);
    expect(props.patientName).toBe("MARIA DA SILVA");
    expect(props.footerImageUrl).toBe("/unit-footer.png");
  });

  it("inclui os MESMOS elementos na página do MEIO de um documento de 3 páginas (não é só primeira/última)", () => {
    const model = makeModel();
    const props = buildReportSheetProps(model, { sectionTitle: "Seção", bodyHtml: "<p>b</p>", physicalPageIndex: 1, totalPhysicalPages: 3 });
    expect(props.logos).toHaveLength(1);
    expect(props.patientName).toBe("MARIA DA SILVA");
    expect(props.footerImageUrl).toBe("/unit-footer.png");
  });

  it("inclui os MESMOS elementos na ÚLTIMA página — prova de que a regra não é mais 'só última página' (bug corrigido nesta unificação)", () => {
    const model = makeModel();
    const propsFirst = buildReportSheetProps(model, { sectionTitle: "Seção", bodyHtml: "<p>a</p>", physicalPageIndex: 0, totalPhysicalPages: 3 });
    const propsLast = buildReportSheetProps(model, { sectionTitle: "Seção", bodyHtml: "<p>c</p>", physicalPageIndex: 2, totalPhysicalPages: 3 });
    expect(propsLast.logos).toEqual(propsFirst.logos);
    expect(propsLast.footerImageUrl).toBe(propsFirst.footerImageUrl);
    expect(propsLast.patientName).toBe(propsFirst.patientName);
  });

  it("nunca reimplementa merge de layout — usa diretamente block_positions/preferences do EffectiveReportLayout recebido (Requisito 1)", () => {
    const customPositions = { logo1: { x: 5, y: 5, w: 10, h: 10, visible: true } };
    const model = makeModel({ layout: makeLayout({ block_positions: customPositions }) });
    const props = buildReportSheetProps(model, { sectionTitle: "Seção", bodyHtml: "", physicalPageIndex: 0, totalPhysicalPages: 1 });
    expect(props.positions).toBe(customPositions);
  });
});

describe("renderReportPhysicalPageHtml — shell completo por página (Requisito 5 e 6 da Fase 2)", () => {
  it("produz HTML contendo logo, dados clínicos e rodapé do médico, sem nenhum script de impressão automática", () => {
    const model = makeModel();
    const html = renderReportPhysicalPageHtml(model, { sectionTitle: "Tomografia de Tórax", bodyHtml: "<p>Achados.</p>", physicalPageIndex: 0, totalPhysicalPages: 1 });
    expect(html).toContain("/unit-logo.png");
    expect(html).toContain("MARIA DA SILVA");
    expect(html).toContain("01/02/1980");
    expect(html).toContain("DR. JOÃO TESTE");
    expect(html).toContain("/unit-footer.png");
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html).not.toContain("window.print");
    expect(html).not.toContain("window.onload");
  });
});

describe("renderPaginatedReportPages / renderAllPhysicalPagesHtml — composição multisseção e múltiplas páginas físicas", () => {
  it("uma seção longa que gera 3 páginas físicas: nenhuma vazia, e todas com logos/dados clínicos/assinatura/imagem de rodapé (teste mínimo obrigatório da Fase 2)", () => {
    const model = makeModel({ sections: [{ title: "Laudo Longo", bodyHtml: "<p>parte 1</p><p>parte 2</p><p>parte 3</p>" }] });
    const paginate = fakePaginateReturning([["<p>parte 1</p>", "<p>parte 2</p>", "<p>parte 3</p>"]]);
    const pagesHtml = renderAllPhysicalPagesHtml(document, model, paginate as any);

    expect(pagesHtml).toHaveLength(3);
    pagesHtml.forEach((html, index) => {
      expect(html.trim().length).toBeGreaterThan(0);
      expect(html).toContain(`parte ${index + 1}`);
      expect(html).toContain("/unit-logo.png");
      expect(html).toContain("MARIA DA SILVA");
      expect(html).toContain("DR. JOÃO TESTE");
      expect(html).toContain("/unit-footer.png");
    });
  });

  it("composição multisseção: 2 seções (2 páginas + 1 página) preservam ordem, título de seção correto por página, e repetição em todas", () => {
    const model = makeModel({
      sections: [
        { title: "Seção A", bodyHtml: "<p>A1</p><p>A2</p>" },
        { title: "Seção B", bodyHtml: "<p>B1</p>" },
      ],
    });
    const paginate = fakePaginateReturning([
      ["<p>A1</p>", "<p>A2</p>"],
      ["<p>B1</p>"],
    ]);
    const pagesHtml = renderAllPhysicalPagesHtml(document, model, paginate as any);

    expect(pagesHtml).toHaveLength(3);
    expect(pagesHtml[0]).toContain("Seção A");
    expect(pagesHtml[0]).toContain("A1");
    expect(pagesHtml[1]).toContain("Seção A");
    expect(pagesHtml[1]).toContain("A2");
    expect(pagesHtml[2]).toContain("Seção B");
    expect(pagesHtml[2]).toContain("B1");
    // Repetição em TODAS, inclusive a última (Seção B, física #3):
    pagesHtml.forEach((html) => {
      expect(html).toContain("/unit-logo.png");
      expect(html).toContain("DR. JOÃO TESTE");
      expect(html).toContain("/unit-footer.png");
    });
  });

  it("confirmação de que medição e HTML final usam o mesmo shell: com o paginador REAL (não-fake), o wiring ponta a ponta produz 1 página por seção em jsdom e não deixa nenhum nó residual no documento", () => {
    const initialBodyChildren = document.body.children.length;
    const model = makeModel();
    const pagesHtml = renderAllPhysicalPagesHtml(document, model);

    expect(pagesHtml).toHaveLength(1);
    expect(pagesHtml[0]).toContain("/unit-logo.png");
    expect(pagesHtml[0]).toContain("MARIA DA SILVA");
    expect(pagesHtml[0]).toContain("DR. JOÃO TESTE");
    expect(pagesHtml[0]).toContain("/unit-footer.png");
    expect(pagesHtml[0]).toContain("Achados normais.");
    // Nenhuma folha de medição (nem o container de origem) sobrou anexada
    // ao documento depois da chamada.
    expect(document.body.children.length).toBe(initialBodyChildren);
  });

  it("falha de medição é classificada (ContentTooLargeForPageError) e propaga sem deixar impressão residual: nenhum nó de medição sobra no documento mesmo com erro", () => {
    const initialBodyChildren = document.body.children.length;
    const model = makeModel();
    const paginate = fakePaginateThrowing(new ContentTooLargeForPageError("bloco maior que a página"));

    expect(() => renderPaginatedReportPages(document, model, paginate as any)).toThrow(ContentTooLargeForPageError);
    // Requisito 5 / teste obrigatório: mesmo com erro de medição, nenhuma
    // folha de medição nem o container de origem podem sobrar no
    // documento (nada de "impressão residual" de um estado parcial).
    expect(document.body.children.length).toBe(initialBodyChildren);
  });

  it("um modelo sem nenhuma seção com conteúdo ainda produz ao menos 1 página física (nunca 'documento sem nenhuma folha')", () => {
    const model = makeModel({ sections: [{ title: "Laudo", bodyHtml: "" }] });
    const pagesHtml = renderAllPhysicalPagesHtml(document, model);
    expect(pagesHtml.length).toBeGreaterThanOrEqual(1);
  });
});

describe("renderPaginatedReportPages — largura física da folha de medição (investigação do incidente pós-reversão, 27/09/2026)", () => {
  /**
   * Regressão: a investigação do incidente que causou a reversão da
   * unificação em produção (RELATORIO_COMPLETO_INCIDENTE_UNIFICACAO_PDF_
   * 2026-09-27.txt + "Parecer técnico — investigação pós-reversão do
   * incidente de PDF", Manus) confirmou em Chromium real que a folha de
   * medição usada por renderPaginatedReportPages() não tinha `width`
   * própria — como fica fora da viewport (position:absolute;
   * left:-99999px) e a folha interna (SharedReportSheet) usa largura
   * percentual, o Chromium media essa folha com 0px de largura, o corpo
   * de medição ficava com ~24px, e um laudo de 6 parágrafos sintéticos
   * era fragmentado em 24 páginas físicas (deveriam ser 2) — a causa
   * mais provável do defeito real relatado em produção.
   *
   * jsdom não calcula layout real (mesma limitação documentada em toda
   * esta suíte), então este teste não mede scrollHeight/clientHeight —
   * ele prova ESTRUTURALMENTE que a folha de medição recebe a MESMA
   * largura física (em mm) que a folha final vai usar, capturando o
   * elemento de fato criado por makeEmptyBody() através de um paginador
   * fake injetado (mesmo padrão de fakePaginateReturning acima).
   */
  function capturingFakePaginate(capturedShells: HTMLElement[]) {
    return (_source: HTMLElement, makeEmptyBody: () => HTMLElement): string[] => {
      const body = makeEmptyBody();
      // O wrapper de medição criado por renderPaginatedReportPages() é o
      // elemento anexado diretamente a document.body (position:absolute;
      // left:-99999px) — sobe a árvore a partir do corpo do laudo
      // (data-layout-block="body") até encontrar esse elemento, em vez de
      // assumir um número fixo de níveis (a folha física tem estrutura
      // interna própria: .shared-report-sheet > .shared-report-sheet-
      // content > ... > body).
      let el: HTMLElement | null = body;
      while (el && el.parentElement !== document.body) {
        el = el.parentElement;
      }
      if (el) capturedShells.push(el);
      return ["<div>pagina-fake</div>"];
    };
  }

  it("A4: a folha de medição recebe width:210mm (mesma largura física da folha final)", () => {
    const model = makeModel({ layout: makeLayout({ preferences: { pageSize: "A4", marginTop: 20, marginRight: 25, marginBottom: 25, marginLeft: 25, fontFamily: "Arial", fontSize: 11, lineHeight: 1.6 } }) });
    const capturedShells: HTMLElement[] = [];
    renderPaginatedReportPages(document, model, capturingFakePaginate(capturedShells) as any);

    expect(capturedShells.length).toBeGreaterThan(0);
    capturedShells.forEach((shell) => {
      expect(shell.style.width).toBe("210mm");
    });
  });

  it("Letter: a folha de medição recebe width:216mm (não fica fixa em A4)", () => {
    const model = makeModel({ layout: makeLayout({ preferences: { pageSize: "Letter", marginTop: 20, marginRight: 25, marginBottom: 25, marginLeft: 25, fontFamily: "Arial", fontSize: 11, lineHeight: 1.6 } }) });
    const capturedShells: HTMLElement[] = [];
    renderPaginatedReportPages(document, model, capturingFakePaginate(capturedShells) as any);

    expect(capturedShells.length).toBeGreaterThan(0);
    capturedShells.forEach((shell) => {
      expect(shell.style.width).toBe("216mm");
    });
  });

  it("a folha de medição NUNCA fica sem width (regressão direta do bug: width ausente => 0px medido pelo navegador)", () => {
    const model = makeModel({ sections: [
      { title: "Seção 1", bodyHtml: "<p>a</p>" },
      { title: "Seção 2", bodyHtml: "<p>b</p>" },
    ] });
    const capturedShells: HTMLElement[] = [];
    renderPaginatedReportPages(document, model, capturingFakePaginate(capturedShells) as any);

    expect(capturedShells.length).toBe(2); // 1 folha de medição por seção
    capturedShells.forEach((shell) => {
      expect(shell.style.width).not.toBe("");
      expect(shell.style.width).not.toBe("auto");
    });
  });
});
