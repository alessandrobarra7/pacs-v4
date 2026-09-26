// Fábrica canônica de páginas físicas — Fase 2 da unificação dos 3
// geradores de PDF/impressão de laudos (plano aprovado pela Manus em
// "Aprovação técnica — Fase 1 da unificação dos geradores de PDF",
// 26/09/2026, autorizando exclusivamente esta Fase 2 na mesma branch).
//
// ESCOPO DESTA FASE: combina o layout já resolvido por
// resolveEffectiveReportLayout() (reportDocumentModel.ts, Fase 1) com
// SharedReportSheet (a folha React já usada pelo editor do médico) e a
// paginação real por medição de DOM (reportPagination.ts) numa única
// fábrica reutilizável. Nenhum dos 3 consumidores atuais (ReportEditorPage,
// PacsQueryPage, financialReportPdfDownload) foi migrado para usar este
// módulo ainda — essa ligação é a Fase 3, autorizada apenas depois de nova
// revisão da fábrica construída aqui.
//
// Requisitos obrigatórios da Fase 2 (Manus, 26/09/2026), e como este
// arquivo os cumpre:
//
//   1. Entrada única de layout — buildReportSheetProps/render* recebem
//      sempre um `EffectiveReportLayout` já pronto (campo `layout` do
//      modelo abaixo); esta fábrica NUNCA reimplementa merge de
//      snapshot/unidade — isso é responsabilidade exclusiva de
//      resolveEffectiveReportLayout() (Fase 1).
//   2. Geometria física — renderReportPhysicalPageHtml() usa
//      SharedReportSheet (via renderSharedReportSheetHtml) para cada
//      página física; renderPaginatedReportPages() usa
//      paginateSectionIntoPages() (reportPagination.ts) para decidir onde
//      cada página física começa/termina.
//   3. Regra de repetição — buildReportSheetProps() NUNCA condiciona
//      logos/dados do paciente/rodapé do médico/imagem de rodapé/fundo a
//      "última página" — chama shouldRepeatOnPhysicalPage() (Fase 1) para
//      cada elemento, e a regra atual (todos sempre repetem) é aplicada de
//      forma idêntica em toda página física.
//   4. A4/Letter + margens — resolveEffectivePageGeometry() lê
//      pageSize/marginTop/marginRight/marginBottom/marginLeft direto de
//      `layout.preferences` (com DEFAULT_LAYOUT_PREFERENCES só como
//      fallback para campos AUSENTES, nunca sobrescrevendo um valor
//      configurado, inclusive margens não padrão).
//   5. Medição real — renderPaginatedReportPages() usa folhas de MEDIÇÃO
//      descartáveis (removidas do documento em bloco `finally`, mesmo em
//      caso de erro) só para decidir onde cada página física quebra;
//      renderAllPhysicalPagesHtml() sempre gera um shell COMPLETO NOVO
//      (título/logos/paciente/rodapé/imagem de rodapé reais) por página
//      física final, via renderReportPhysicalPageHtml() — nunca devolve o
//      HTML da folha de medição.
//   6. Sem impressão automática — este arquivo não gera nenhuma tag
//      <script>, nem chama window.print()/window.onload; produz apenas
//      HTML de folha física (via renderToStaticMarkup), preservando
//      runControlledPrint/a ordem de impressão única já existente nos
//      consumidores atuais.
//   7. Sem mudança de banco nesta fase — `patient: CanonicalPatient` já
//      vem pronto do chamador (buildCanonicalPatient, Fase 1); nenhuma
//      migration ou leitura de nascimento/sexo no momento da assinatura é
//      feita aqui.
//   8. Sem migração dos 3 consumidores — nenhum arquivo de
//      ReportEditorPage.tsx/PacsQueryPage.tsx/financialReportPdfDownload.ts
//      foi alterado nesta Fase 2.

import { createElement, type ReactNode } from "react";
import { DEFAULT_LAYOUT_PREFERENCES } from "../../../shared/types";
import {
  SharedReportBodyGuide,
  SharedReportSheet,
  type SharedReportLogo,
  type SharedReportSheetProps,
} from "../components/SharedReportSheet";
import { renderSharedReportSheetHtml } from "../components/SharedReportPrint";
import {
  escapeHtmlText,
  shouldRepeatOnPhysicalPage,
  type CanonicalLogo,
  type CanonicalPatient,
  type EffectiveReportLayout,
} from "./reportDocumentModel";
import { paginateSectionIntoPages } from "./reportPagination";

// Referenciar o componente evita que bundlers com "unused import" agressivo
// removam SharedReportSheet — usado apenas indiretamente via
// renderSharedReportSheetHtml (react-dom/server), mas mantém o tipo
// explícito no import para refletir a dependência real desta fábrica.
void SharedReportSheet;

export type ReportDocumentSection = {
  title: string;
  /** HTML já sanitizado do corpo da seção (mesmo formato hoje produzido
   * pelo editor do médico) — pronto para ser inserido no DOM real para
   * medição/paginação. */
  bodyHtml: string;
};

/**
 * Entrada única desta fábrica: tudo que ela precisa para montar qualquer
 * página física do laudo, já resolvido por outras etapas (Fase 1 para o
 * layout; o chamador, para paciente/assinatura/seções) — nunca dados
 * brutos de unidade/snapshot/estudo.
 */
export type ReportDocumentRenderModel = {
  /** Único ponto de entrada de layout permitido (Requisito 1) — sempre o
   * resultado de resolveEffectiveReportLayout(), nunca reconstruído aqui. */
  layout: EffectiveReportLayout;
  /** Logos já normalizados (normalizeCanonicalLogos, Fase 1) — 0 a 3. */
  logos: CanonicalLogo[];
  /** Dados clínicos já formatados (buildCanonicalPatient, Fase 1). */
  patient: CanonicalPatient;
  /** HTML já pronto do rodapé de assinatura (buildDoctorFooterHtml, Fase
   * 1) — string vazia quando o laudo não está assinado/retificado. */
  doctorFooterHtml: string;
  /** Uma ou mais seções (laudo multiexame) — cada uma pode gerar 1+
   * páginas físicas após a paginação real. */
  sections: ReportDocumentSection[];
};

/** Uma página física já decidida (seção de origem + HTML do corpo que
 * coube nela) — ainda sem o shell completo (título/logos/paciente/rodapé),
 * que só é montado no passo final (Requisito 5). */
export type PhysicalPageContent = {
  sectionTitle: string;
  bodyHtml: string;
};

/** Contexto de uma página física dentro do documento inteiro — usado só
 * para decidir repetição (shouldRepeatOnPhysicalPage) e montar o shell
 * final; `physicalPageIndex`/`totalPhysicalPages` NUNCA condicionam
 * logos/paciente/rodapé/imagem de rodapé a "aparecer só na última", já que
 * a regra atual (Fase 1) é repetir sempre. */
export type PhysicalPageRenderContext = PhysicalPageContent & {
  physicalPageIndex: number;
  totalPhysicalPages: number;
};

type EffectivePageGeometry = {
  pageSize: "A4" | "Letter";
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
};

/**
 * Resolve a geometria física efetiva (Requisito 4): lê pageSize e as 4
 * margens diretamente de `layout.preferences`, usando
 * DEFAULT_LAYOUT_PREFERENCES apenas para campos AUSENTES (nunca
 * sobrescrevendo um valor configurado, inclusive margens não padrão) —
 * mesma convenção já usada em ReportEditorPage.tsx/
 * financialReportPdfDownload.ts, agora num único ponto de verdade para a
 * fábrica canônica.
 */
export function resolveEffectivePageGeometry(layout: EffectiveReportLayout): EffectivePageGeometry {
  const prefs = { ...DEFAULT_LAYOUT_PREFERENCES, ...(layout.preferences ?? {}) };
  const pageSize = prefs.pageSize === "Letter" ? "Letter" : "A4";
  return {
    pageSize,
    marginTop: Number(prefs.marginTop),
    marginRight: Number(prefs.marginRight),
    marginBottom: Number(prefs.marginBottom),
    marginLeft: Number(prefs.marginLeft),
    fontFamily: prefs.fontFamily || "Arial",
    fontSize: Number(prefs.fontSize) || 11,
    lineHeight: Number(prefs.lineHeight) || 1.6,
  };
}

function toSharedReportLogos(logos: CanonicalLogo[]): SharedReportLogo[] {
  // width/height ausentes (0 default) preservam o comportamento de
  // fallback 100%/100% da caixa de posição já documentado em
  // SharedReportSheet.tsx (a checagem `logo.width ? ... : "100%"` trata 0
  // e undefined da mesma forma — ambos "falsy").
  return logos.map((logo) => ({ url: logo.url, width: logo.width ?? 0, height: logo.height ?? 0, label: logo.label }));
}

function normalizeBackgroundOpacity(raw: string | number | null): number | undefined {
  if (raw === null) return undefined;
  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

function buildPatientInfoHtml(patient: CanonicalPatient): string {
  const rows = [
    patient.birthDate ? `<div>Data de nascimento: ${escapeHtmlText(patient.birthDate)}</div>` : "",
    patient.sex ? `<div>Sexo: ${escapeHtmlText(patient.sex)}</div>` : "",
    patient.studyDate ? `<div>Data de realização do exame: ${escapeHtmlText(patient.studyDate)}</div>` : "",
    patient.modality ? `<div>Modalidade: ${escapeHtmlText(patient.modality)}</div>` : "",
    patient.accessionNumber ? `<div>Número de requisição: ${escapeHtmlText(patient.accessionNumber)}</div>` : "",
  ]
    .filter(Boolean)
    .join("");
  return `<div style="font-size:9.5pt;line-height:1.7;">${rows}</div>`;
}

function buildSectionTitleNode(title: string): ReactNode {
  return createElement(
    "div",
    {
      style: {
        width: "100%",
        textAlign: "center",
        fontWeight: 700,
        fontSize: "13pt",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        paddingBottom: 6,
        borderBottom: "1px solid #e0e0e0",
      },
    },
    title || "—",
  );
}

function buildBodyNode(bodyHtml: string, totalPhysicalPages: number): ReactNode {
  // A orientação de corpo vazio (SharedReportBodyGuide) só faz sentido
  // quando o documento inteiro não tem nenhum conteúdo ainda (rascunho sem
  // texto) — nunca no meio de um documento paginado real, onde uma página
  // física com bodyHtml vazio não deveria ocorrer (garantia já dada por
  // paginateSectionIntoPages, que só produz página vazia quando a seção
  // inteira não tem nenhum nó relevante).
  if (bodyHtml.trim()) {
    return createElement("div", { className: "report-body", dangerouslySetInnerHTML: { __html: bodyHtml } });
  }
  if (totalPhysicalPages <= 1) {
    return createElement(SharedReportBodyGuide);
  }
  return null;
}

/**
 * Monta as props de SharedReportSheet para UMA página física — sempre
 * repetindo fundo/logos/dados do paciente/rodapé do médico/imagem de
 * rodapé (Requisito 3), nunca restringindo a "só a última página".
 */
export function buildReportSheetProps(
  model: ReportDocumentRenderModel,
  context: PhysicalPageRenderContext,
): SharedReportSheetProps {
  const geometry = resolveEffectivePageGeometry(model.layout);
  const { physicalPageIndex, totalPhysicalPages } = context;

  const showBackground = shouldRepeatOnPhysicalPage("background", physicalPageIndex, totalPhysicalPages);
  const showLogos = shouldRepeatOnPhysicalPage("logos", physicalPageIndex, totalPhysicalPages);
  const showPatientInfo = shouldRepeatOnPhysicalPage("patientInfo", physicalPageIndex, totalPhysicalPages);
  const showDoctorFooter = shouldRepeatOnPhysicalPage("doctorFooter", physicalPageIndex, totalPhysicalPages);
  const showFooterImage = shouldRepeatOnPhysicalPage("footerImage", physicalPageIndex, totalPhysicalPages);

  return {
    className: "report-physical-page",
    pageSize: geometry.pageSize,
    marginTop: geometry.marginTop,
    marginRight: geometry.marginRight,
    marginBottom: geometry.marginBottom,
    marginLeft: geometry.marginLeft,
    fontFamily: geometry.fontFamily,
    fontSize: geometry.fontSize,
    lineHeight: geometry.lineHeight,
    positions: model.layout.block_positions ?? undefined,
    logos: showLogos ? toSharedReportLogos(model.logos) : [],
    backgroundUrl: showBackground ? (model.layout.background_image_url ?? undefined) : undefined,
    backgroundOpacity: normalizeBackgroundOpacity(model.layout.background_opacity),
    backgroundSize: model.layout.background_size ?? undefined,
    footerImageUrl: showFooterImage ? (model.layout.footer_image_url ?? undefined) : undefined,
    patientName: model.patient.name,
    patientInfo: createElement("div", {
      dangerouslySetInnerHTML: { __html: showPatientInfo ? buildPatientInfoHtml(model.patient) : "" },
    }),
    title: buildSectionTitleNode(context.sectionTitle),
    body: buildBodyNode(context.bodyHtml, totalPhysicalPages),
    footer: createElement("div", {
      style: { width: "100%" },
      dangerouslySetInnerHTML: { __html: showDoctorFooter ? model.doctorFooterHtml || "" : "" },
    }),
  };
}

/** Renderiza o HTML estático completo de UMA página física — sempre um
 * shell novo e completo (Requisito 5), nunca a folha de medição. */
export function renderReportPhysicalPageHtml(
  model: ReportDocumentRenderModel,
  context: PhysicalPageRenderContext,
): string {
  return renderSharedReportSheetHtml(buildReportSheetProps(model, context));
}

/**
 * Decide, para cada seção do modelo, em quantas páginas físicas seu
 * conteúdo se divide — usando medição real de DOM (paginateSectionIntoPages,
 * Requisito 2) contra folhas de MEDIÇÃO descartáveis, sempre removidas do
 * documento (bloco `finally`, inclusive em caso de erro — Requisito 5 e o
 * teste obrigatório "falha de medição classificada sem impressão
 * residual"). Retorna apenas o par (seção, HTML do corpo que coube) — o
 * shell final e completo de cada página só é montado depois, por
 * renderAllPhysicalPagesHtml().
 *
 * `paginate` é injetável (default: a implementação real) para permitir
 * testar esta função sem depender de layout real de navegador — mesma
 * convenção de testabilidade já usada em reportPagination.ts (PageBuilder).
 */
export function renderPaginatedReportPages(
  doc: Document,
  model: ReportDocumentRenderModel,
  paginate: typeof paginateSectionIntoPages = paginateSectionIntoPages,
): PhysicalPageContent[] {
  const collected: PhysicalPageContent[] = [];

  for (const section of model.sections) {
    const sourceContainer = doc.createElement("div");
    sourceContainer.style.cssText = "position:absolute;visibility:hidden;left:-99999px;top:0;";
    sourceContainer.innerHTML = section.bodyHtml || "";
    doc.body.appendChild(sourceContainer);

    const measuringShells: HTMLElement[] = [];
    try {
      const pagesHtmlForSection = paginate(sourceContainer, () => {
        // Folha de medição: mesmo shell/CSS/geometria da folha final (é o
        // que torna scrollHeight/clientHeight do corpo significativos),
        // com o corpo vazio e sem conteúdo real — descartada logo abaixo.
        const measuringContext: PhysicalPageRenderContext = {
          sectionTitle: section.title,
          bodyHtml: "",
          physicalPageIndex: 0,
          totalPhysicalPages: 1,
        };
        const shellHtml = renderReportPhysicalPageHtml(model, measuringContext);
        const shell = doc.createElement("div");
        shell.style.cssText = "position:absolute;visibility:hidden;left:-99999px;top:0;";
        shell.innerHTML = shellHtml;
        doc.body.appendChild(shell);
        measuringShells.push(shell);
        const bodyEl = shell.querySelector<HTMLElement>('[data-layout-block="body"]');
        if (!bodyEl) {
          throw new Error(
            'Não foi possível localizar o bloco de corpo do laudo (data-layout-block="body") para medir a paginação — verifique se o bloco "body" está visível no layout configurado.',
          );
        }
        return bodyEl;
      });
      pagesHtmlForSection.forEach((bodyHtml) => collected.push({ sectionTitle: section.title, bodyHtml }));
    } finally {
      // Requisito 5 + teste obrigatório "falha de medição classificada sem
      // impressão residual": mesmo se `paginate` lançar (ex.:
      // ContentTooLargeForPageError), nenhuma folha de medição nem o
      // container de origem pode sobrar no documento.
      measuringShells.forEach((shell) => shell.parentNode?.removeChild(shell));
      sourceContainer.parentNode?.removeChild(sourceContainer);
    }
  }

  // Mesma garantia já dada por paginateSectionIntoPages por seção — um
  // modelo sem nenhuma seção (ou só seções vazias que produziram 0
  // páginas, o que hoje não acontece) ainda produz ao menos 1 página
  // física, para os consumidores nunca lidarem com "documento sem
  // nenhuma folha".
  if (collected.length === 0) {
    collected.push({ sectionTitle: model.sections[0]?.title ?? "Laudo", bodyHtml: "" });
  }

  return collected;
}

/**
 * Combina renderPaginatedReportPages() + renderReportPhysicalPageHtml():
 * decide as páginas físicas e devolve o HTML final e completo de cada uma
 * (shell inteiro, com logos/paciente/rodapé/imagem de rodapé repetidos em
 * todas — Requisito 3), na ordem correta do documento. Esta é a função que
 * a Fase 3 vai chamar a partir dos 3 consumidores.
 */
export function renderAllPhysicalPagesHtml(
  doc: Document,
  model: ReportDocumentRenderModel,
  paginate: typeof paginateSectionIntoPages = paginateSectionIntoPages,
): string[] {
  const pages = renderPaginatedReportPages(doc, model, paginate);
  const totalPhysicalPages = pages.length;
  return pages.map((page, physicalPageIndex) =>
    renderReportPhysicalPageHtml(model, {
      sectionTitle: page.sectionTitle,
      bodyHtml: page.bodyHtml,
      physicalPageIndex,
      totalPhysicalPages,
    }),
  );
}
