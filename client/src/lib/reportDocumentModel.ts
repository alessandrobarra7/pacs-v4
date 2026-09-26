// Modelo canônico do documento de laudo — Fase 1 da unificação dos 3
// geradores de PDF/impressão (editor do médico, lista de Estudos, download
// financeiro), pedida por Alessandro em 26/09/2026 e planejada pela Manus
// em "Avaliação técnica — unificação dos geradores de PDF e impressão de
// laudos" (26/09/2026, base a825cb5).
//
// ESCOPO DESTA FASE (Fase 1 do plano da Manus — "definir contrato canônico
// SEM MUDAR COMPORTAMENTO"): extrai, como funções puras e testáveis, a
// lógica que hoje está duplicada (com pequenas divergências) em
// client/src/pages/ReportEditorPage.tsx, client/src/pages/PacsQueryPage.tsx
// e client/src/lib/financialReportPdfDownload.ts:
//   1. resolução de layout_snapshot (laudo assinado) versus layout atual
//      da unidade;
//   2. normalização de logos (fallback para units.logo_url quando o
//      layout não tem nenhum logo configurado);
//   3. formatação de dados clínicos do paciente (nascimento, sexo, data
//      do exame) de forma idêntica nos 3 lugares;
//   4. composição do rodapé do médico assinante (carimbo, assinatura,
//      nome, CRM, data) — hoje existem 3 versões ligeiramente diferentes
//      desse HTML (classes CSS diferentes entre PacsQueryPage.tsx/
//      ReportEditorPage.tsx e financialReportPdfDownload.ts; e só a
//      versão financeira escapa nome/CRM do médico contra injeção de
//      HTML — as outras duas não escapam);
//   5. a regra explícita, única, de quais elementos se repetem em cada
//      página física do PDF (decisão de produto confirmada por
//      Alessandro em 26/09/2026, arquivo
//      DECISOES_UNIFICACAO_PDF_LAUDO_2026-09-26.txt).
//
// Este arquivo NÃO é consumido ainda por nenhum dos 3 geradores — essa
// troca é a Fase 3 do plano da Manus, feita depois que a "fábrica
// canônica de páginas físicas" (Fase 2, que combina estas funções com
// SharedReportSheet + reportPagination.ts) existir e for homologada
// visualmente (A4/Letter, margens não padrão, laudo longo, composição
// multisseção) nos 3 caminhos. Até lá, nenhum comportamento em produção
// muda — este módulo só existe e é testado isoladamente.

// ─────────────────────────────────────────────────────────────────────────
// 1. Layout efetivo: snapshot do laudo assinado vs. layout atual da unidade
// ─────────────────────────────────────────────────────────────────────────

export type CanonicalReportStatus = "draft" | "signed" | "revised" | "cancelled";

/**
 * Decide, com uma única regra, qual fonte de layout deve ser usada para
 * renderizar um laudo:
 *   - laudo assinado ou retificado, com snapshot salvo → usa o snapshot
 *     (congelado no momento da assinatura) — um laudo já emitido nunca
 *     deve mudar de aparência visual por causa de uma edição posterior do
 *     Editor de Layout da unidade;
 *   - qualquer outro caso (rascunho, cancelado, ou assinado sem snapshot
 *     — laudo antigo, de antes do snapshot existir) → usa o layout atual
 *     da unidade.
 *
 * Hoje (antes desta unificação) o editor do médico e o download financeiro
 * já seguem essa regra cada um à sua maneira; a lista de Estudos NÃO segue
 * — ela sempre usa o layout atual da unidade, mesmo para laudos já
 * assinados com snapshot próprio (achado da Manus, item 4 do parecer de
 * unificação). Esta função existe para que os 3 caminhos apliquem a MESMA
 * regra depois da Fase 3.
 */
export function resolveEffectiveLayoutSource<TLayout>(
  status: CanonicalReportStatus,
  reportLayoutSnapshot: TLayout | null | undefined,
  unitLayout: TLayout | null | undefined,
): { source: "snapshot" | "unit"; layout: TLayout | null } {
  const hasSignedSnapshot = (status === "signed" || status === "revised") && reportLayoutSnapshot != null;
  if (hasSignedSnapshot) {
    return { source: "snapshot", layout: reportLayoutSnapshot as TLayout };
  }
  return { source: "unit", layout: unitLayout ?? null };
}

/**
 * Snapshots antigos podem não ter todos os campos que o layout atual tem
 * (ex.: um laudo assinado antes de um campo novo ser introduzido no Editor
 * de Layout). Mescla o snapshot POR CIMA de um layout base de referência
 * (tipicamente o layout atual da unidade, ou um objeto de defaults), para
 * que campos ausentes no snapshot antigo não fiquem `undefined` — mesma
 * estratégia já usada em ReportEditorPage.tsx (activeLayoutRecord) e em
 * financialReportPdfDownload.ts (`{ ...(documentData.layout ?? {}),
 * ...(report.layout_snapshot ?? {}) }`), agora nomeada e testável em um só
 * lugar.
 */
export function mergeLayoutWithSnapshotFallback<TLayout extends Record<string, unknown>>(
  baseLayout: TLayout | null | undefined,
  snapshot: Partial<TLayout> | null | undefined,
): TLayout {
  return { ...(baseLayout ?? {}), ...(snapshot ?? {}) } as TLayout;
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Normalização de logos (fallback para logo legado da unidade)
// ─────────────────────────────────────────────────────────────────────────

export type CanonicalLogo = { url: string; width?: number; height?: number; label?: string };

/**
 * Se o layout não tiver nenhum logo configurado em `logos` (unidade que
 * nunca usou o Editor de Layout novo), cai no logo legado `units.logo_url`
 * como um logo único, sem width/height fixos (mantém 100%/100% da caixa de
 * posição — mesmo comportamento legado já documentado em
 * PacsQueryPage.tsx, `printLogosWithFallbackQ`). Nunca inventa um logo
 * quando nenhuma das duas fontes existe.
 */
export function normalizeCanonicalLogos(
  layoutLogos: CanonicalLogo[] | null | undefined,
  legacyUnitLogoUrl: string | null | undefined,
): CanonicalLogo[] {
  const configured = (layoutLogos ?? []).filter((logo) => Boolean(logo?.url)).slice(0, 3);
  if (configured.length > 0) return configured;
  if (legacyUnitLogoUrl) {
    return [{ url: legacyUnitLogoUrl, label: "Logo" }];
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Formatação de dados clínicos do paciente
// ─────────────────────────────────────────────────────────────────────────

export type CanonicalPatient = {
  name: string;
  birthDate: string | null;
  sex: string | null;
  studyDate: string | null;
  modality: string | null;
  accessionNumber: string | null;
};

const DICOM_DATE_RE = /^(\d{4})(\d{2})(\d{2})$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Formata uma data para dd/mm/aaaa a partir de qualquer um dos dois
 * formatos usados nas 3 fontes de dados do sistema: DICOM (AAAAMMDD, usado
 * pela lista de Estudos e pelo editor do médico) ou ISO/SQL (AAAA-MM-DD,
 * usado pelo financeiro). Retorna null para entrada vazia/irreconhecível —
 * nunca lança, e nunca retorna uma string tecnicamente inválida como
 * "undefined/undefined/undefined".
 */
export function formatClinicalDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const dicomMatch = DICOM_DATE_RE.exec(raw);
  if (dicomMatch) {
    const [, year, month, day] = dicomMatch;
    return `${day}/${month}/${year}`;
  }
  const isoMatch = ISO_DATE_RE.exec(raw);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }
  return null;
}

/** Normaliza o campo DICOM de sexo ("M"/"F"/outro) para o rótulo em
 * português usado nos 3 caminhos — retorna o valor original (maiúsculas)
 * quando não for nem M nem F, e null para entrada vazia. */
export function formatClinicalSex(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (upper === "M") return "Masculino";
  if (upper === "F") return "Feminino";
  return upper || null;
}

/** Normaliza o nome do paciente: remove separadores DICOM (`^`), colapsa
 * espaços múltiplos e apara as bordas — mesma limpeza hoje duplicada nos
 * 3 caminhos com pequenas variações (nem todos colapsam múltiplos
 * espaços). */
export function formatClinicalPatientName(raw: string | null | undefined): string {
  const cleaned = String(raw ?? "").replace(/\^/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Não informado";
}

export type RawClinicalPatientInput = {
  name?: string | null;
  birthDate?: string | null;
  sex?: string | null;
  studyDate?: string | null;
  modality?: string | null;
  accessionNumber?: string | null;
};

/** Ponto único de formatação de dados clínicos — usado pelos 3 caminhos a
 * partir da Fase 3, para que "Nome do paciente / Data de nascimento /
 * Sexo / Data de realização do exame" saiam sempre formatados da mesma
 * forma, com os mesmos campos, nos 3 lugares. */
export function buildCanonicalPatient(input: RawClinicalPatientInput): CanonicalPatient {
  return {
    name: formatClinicalPatientName(input.name),
    birthDate: formatClinicalDate(input.birthDate),
    sex: formatClinicalSex(input.sex),
    studyDate: formatClinicalDate(input.studyDate),
    modality: input.modality?.trim() || null,
    accessionNumber: input.accessionNumber?.trim() || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Rodapé do médico assinante (carimbo + assinatura + nome + CRM + data)
// ─────────────────────────────────────────────────────────────────────────

export type CanonicalSigner = {
  name: string | null;
  crm: string | null;
  /** URL já convertida para base64 (ou null se não configurada/falhou a
   * conversão) — este módulo não faz fetch, só monta o HTML final. */
  stampDataUrl: string | null;
  signatureDataUrl: string | null;
  /** Já formatada (ex.: "26/09/2026, 14:18"), ou null se o laudo ainda
   * não foi assinado. */
  signedAtFormatted: string | null;
  status: CanonicalReportStatus;
};

function escapeHtmlText(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] ?? char));
}

/**
 * HTML canônico do rodapé de assinatura do médico — substitui as 3 versões
 * hoje divergentes (classes CSS diferentes entre PacsQueryPage.tsx/
 * ReportEditorPage.tsx — "sig-*"/"stamp-img" — e financialReportPdfDownload.ts
 * — "signature"/"stamp"/"signature-line") por uma única marcação, com as
 * classes do editor do médico (mais antigas, já com CSS mais completo) e
 * COM ESCAPE de nome/CRM em todos os casos (as duas primeiras versões não
 * escapavam; a versão financeira já escapava — esta função generaliza o
 * comportamento mais seguro para os 3 caminhos, corrigindo a inconsistência).
 *
 * Retorna string vazia se o laudo não estiver assinado/retificado ou não
 * houver nome do médico — mesma condição de guarda já usada nos 3 lugares.
 */
export function buildDoctorFooterHtml(signer: CanonicalSigner): string {
  const isSignedOrRevised = signer.status === "signed" || signer.status === "revised";
  if (!isSignedOrRevised || !signer.name) return "";

  const revisedBadge = signer.status === "revised" ? '<span class="revised-badge">RETIFICADO</span>' : "";
  const stampImg = signer.stampDataUrl ? `<img src="${escapeHtmlText(signer.stampDataUrl)}" alt="Carimbo" class="stamp-img" />` : "";
  const sigImg = signer.signatureDataUrl ? `<img src="${escapeHtmlText(signer.signatureDataUrl)}" alt="Assinatura" class="sig-img" />` : "";
  const crmLine = signer.crm ? `<div class="sig-crm">CRM: ${escapeHtmlText(signer.crm)}</div>` : "";
  const dateLine = signer.signedAtFormatted ? `<div class="sig-date">Assinado em: ${escapeHtmlText(signer.signedAtFormatted)}</div>` : "";

  return [
    '<div class="doctor-footer">',
    stampImg,
    sigImg,
    '<div class="sig-line"></div>',
    `<div class="sig-name">${escapeHtmlText(signer.name)}${revisedBadge}</div>`,
    crmLine,
    dateLine,
    "</div>",
  ].join("");
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Regra única de repetição por página física
// ─────────────────────────────────────────────────────────────────────────

/**
 * Decisão de produto confirmada por Alessandro em 26/09/2026 (arquivo
 * DECISOES_UNIFICACAO_PDF_LAUDO_2026-09-26.txt, revisão final): TODOS os
 * elementos do cabeçalho/rodapé se repetem em TODA página física do
 * documento — inclusive carimbo, assinatura do médico e a imagem de
 * rodapé configurada pelo admin, que hoje (antes desta unificação) só
 * aparecem na última página/seção no editor do médico
 * (ReportEditorPage.tsx). A partir da Fase 3, os 3 caminhos devem
 * consultar esta constante em vez de decidir individualmente.
 *
 * Nenhum destes campos depende de `pageIndex`/`isLastPhysicalPage` — a
 * regra é deliberadamente "sempre true" para os 5 elementos, mas mantém a
 * assinatura de função (em vez de uma constante booleana simples) para
 * que uma mudança futura de regra (ex.: voltar a restringir algo à
 * última página) tenha um único ponto de alteração, testável, em vez de
 * precisar ser replicada manualmente nos 3 consumidores de novo.
 */
export type PhysicalPageElement = "background" | "logos" | "patientInfo" | "doctorFooter" | "footerImage";

export function shouldRepeatOnPhysicalPage(
  _element: PhysicalPageElement,
  _pageIndex: number,
  _totalPhysicalPages: number,
): boolean {
  // Regra atual (26/09/2026): todos os 5 elementos repetem em toda página.
  return true;
}

/** Documentação viva da regra atual, para exibição em comentários/handoffs
 * e para os testes de paridade entre os 3 caminhos (Fase 4 do plano da
 * Manus) iterarem sem precisar hardcodar a lista de elementos de novo. */
export const PHYSICAL_PAGE_ELEMENTS: readonly PhysicalPageElement[] = [
  "background",
  "logos",
  "patientInfo",
  "doctorFooter",
  "footerImage",
];
