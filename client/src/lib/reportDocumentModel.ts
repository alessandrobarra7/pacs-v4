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
// e client/src/lib/financialReportPdfDownload.ts.
//
// Este arquivo NÃO é consumido ainda por nenhum dos 3 geradores — essa
// troca é a Fase 3 do plano da Manus, feita depois que a "fábrica
// canônica de páginas físicas" (Fase 2) existir e for homologada
// visualmente nos 3 caminhos. Até lá, nenhum comportamento em produção
// muda — este módulo só existe e é testado isoladamente.
//
// REVISÃO (Parecer de revisão — Fase 1 da unificação dos geradores de
// PDF, Manus, 26/09/2026): a primeira versão deste arquivo (commit
// b148182) tinha 2 bloqueios confirmados com reprodução independente,
// corrigidos nesta versão:
//
//   Bloqueio 1 — `mergeLayoutWithSnapshotFallback` fazia apenas spread de
//        primeiro nível: um snapshot antigo com `preferences: { fontSize:
//        10 }` APAGAVA todo o resto de `preferences` do layout atual
//        (pageSize, margens, lineHeight etc.) em vez de preservar os
//        campos ausentes no snapshot — exatamente o cenário que o
//        contrato prometia suportar (laudo assinado antes de um campo
//        novo existir). Além disso, o contrato ficava dividido em 2
//        funções independentes (resolver a fonte, depois lembrar de
//        mesclar por fora), o que um consumidor futuro podia esquecer de
//        fazer. Substituído por resolveEffectiveReportLayout(), uma única
//        função de alto nível que já devolve o layout efetivo pronto:
//        `preferences` é mesclado campo a campo (unidade como base,
//        snapshot sobrescrevendo o que ele de fato tiver); os demais
//        campos (logos, block_positions, background_*, footer_image_url,
//        header_html, footer_html) são tratados como unidades atômicas —
//        usa o valor do snapshot quando a CHAVE existe no snapshot
//        (mesmo que seja null, ex.: laudo assinado sem nenhum logo),
//        senão cai no valor da unidade.
//
//   Bloqueio 2 — `formatClinicalDate` validava só o FORMATO (regex), não
//        o CALENDÁRIO: "20261340" virava "40/13/2026" e "2026-02-30"
//        virava "30/02/2026" — datas de calendário impossíveis, apesar do
//        comentário original prometer nunca devolver "uma string
//        tecnicamente inválida". Corrigido construindo uma data UTC a
//        partir dos componentes extraídos e conferindo que ano/mês/dia
//        não mudaram após a normalização automática do JavaScript (que
//        "rola" datas inválidas para o mês/dia seguinte em vez de
//        rejeitá-las) — mesma técnica de isValidCalendarDate() abaixo.
//        29/02 continua válido em ano bissexto e inválido fora dele.

// ─────────────────────────────────────────────────────────────────────────
// 1. Layout efetivo: snapshot do laudo assinado vs. layout atual da unidade
// ─────────────────────────────────────────────────────────────────────────

export type CanonicalReportStatus = "draft" | "signed" | "revised" | "cancelled";

export type CanonicalLogo = { url: string; width?: number; height?: number; label?: string };
export type CanonicalBlockPositions = Record<string, { x: number; y: number; w: number; h: number; visible: boolean }>;

/** Subconjunto de LayoutPreferences (shared/types.ts) que este módulo
 * mescla explicitamente. Usa `[key: string]: unknown` para aceitar
 * qualquer campo adicional de preferências (cores, fontes etc.) sem
 * precisar redeclarar o schema inteiro aqui — o merge campo a campo (via
 * spread) preserva qualquer chave presente, conhecida ou não. */
export type LayoutPreferencesLike = {
  pageSize?: "A4" | "Letter";
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  [key: string]: unknown;
};

/** Forma comum entre o layout atual da unidade (tabela model_layouts) e o
 * snapshot congelado num laudo assinado (LayoutSnapshot, shared/types.ts)
 * — os campos que este módulo precisa resolver. Um snapshot antigo pode
 * ter qualquer um destes campos ausente (nunca existiu na época em que
 * foi capturado); é exatamente esse caso que resolveEffectiveReportLayout
 * trata. */
export type LayoutLike = {
  header_html?: string | null;
  footer_html?: string | null;
  background_image_url?: string | null;
  background_opacity?: string | number | null;
  background_size?: string | null;
  footer_image_url?: string | null;
  logos?: CanonicalLogo[] | null;
  block_positions?: CanonicalBlockPositions | null;
  preferences?: LayoutPreferencesLike | null;
};

export type EffectiveReportLayout = {
  source: "snapshot" | "unit";
  preferences: LayoutPreferencesLike;
  header_html: string | null;
  footer_html: string | null;
  background_image_url: string | null;
  background_opacity: string | number | null;
  background_size: string | null;
  footer_image_url: string | null;
  logos: CanonicalLogo[] | null;
  block_positions: CanonicalBlockPositions | null;
};

const ATOMIC_LAYOUT_KEYS = [
  "header_html",
  "footer_html",
  "background_image_url",
  "background_opacity",
  "background_size",
  "footer_image_url",
  "logos",
  "block_positions",
] as const;
type AtomicLayoutKey = (typeof ATOMIC_LAYOUT_KEYS)[number];

/** Escolhe um campo "atômico" (nunca mesclado internamente — logos e
 * block_positions são substituídos como um todo, nunca combinados item a
 * item entre unidade e snapshot): usa o valor do snapshot quando a chave
 * EXISTE no objeto do snapshot (`hasOwnProperty`, não apenas "!= null" —
 * um snapshot que capturou explicitamente "sem logos" não deve herdar os
 * logos atuais da unidade), senão cai no valor da unidade. */
function pickAtomicField<K extends AtomicLayoutKey>(
  unit: LayoutLike | null,
  snapshot: Partial<LayoutLike> | null,
  key: K,
): EffectiveReportLayout[K] {
  if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, key)) {
    return (snapshot[key] ?? null) as EffectiveReportLayout[K];
  }
  return (unit?.[key] ?? null) as EffectiveReportLayout[K];
}

/**
 * Função única de alto nível que resolve o layout efetivo de um laudo:
 *   - `signed`/`revised` COM snapshot salvo → mescla o snapshot sobre o
 *     layout atual da unidade (preferences campo a campo; demais campos
 *     de forma atômica — ver pickAtomicField) — garante compatibilidade
 *     para snapshots antigos sem apagar campos novos que eles nunca
 *     chegaram a capturar;
 *   - qualquer outro caso (rascunho, cancelado, ou assinado sem snapshot
 *     — laudo anterior à existência do snapshot) → usa só o layout atual
 *     da unidade, sem nenhuma mescla.
 *
 * Retorna `null` apenas quando não há absolutamente nenhuma fonte de
 * layout disponível (nem unidade, nem snapshot) — os 3 consumidores
 * (Fase 3) devem tratar esse caso como "sem layout configurado ainda",
 * igual ao comportamento atual de cada um.
 *
 * Substitui as antigas resolveEffectiveLayoutSource() +
 * mergeLayoutWithSnapshotFallback() (ver Bloqueio 1 no cabeçalho deste
 * arquivo) — um único ponto de verdade que já devolve o layout pronto
 * para consumo, sem exigir que o chamador lembre de mesclar por fora.
 */
export function resolveEffectiveReportLayout(input: {
  status: CanonicalReportStatus;
  unitLayout: LayoutLike | null | undefined;
  reportLayoutSnapshot: Partial<LayoutLike> | null | undefined;
}): EffectiveReportLayout | null {
  const unit = input.unitLayout ?? null;
  const useSnapshot = (input.status === "signed" || input.status === "revised") && input.reportLayoutSnapshot != null;

  if (!useSnapshot) {
    if (!unit) return null;
    return {
      source: "unit",
      preferences: { ...(unit.preferences ?? {}) },
      header_html: unit.header_html ?? null,
      footer_html: unit.footer_html ?? null,
      background_image_url: unit.background_image_url ?? null,
      background_opacity: unit.background_opacity ?? null,
      background_size: unit.background_size ?? null,
      footer_image_url: unit.footer_image_url ?? null,
      logos: unit.logos ?? null,
      block_positions: unit.block_positions ?? null,
    };
  }

  const snapshot = input.reportLayoutSnapshot as Partial<LayoutLike>;
  if (!unit && !snapshot) return null;

  return {
    source: "snapshot",
    // Merge campo a campo: unidade como base, snapshot sobrescrevendo
    // apenas as chaves que de fato tiver — um campo novo, inexistente no
    // snapshot antigo, permanece com o valor (atual) da unidade em vez de
    // desaparecer.
    preferences: { ...(unit?.preferences ?? {}), ...(snapshot.preferences ?? {}) },
    header_html: pickAtomicField(unit, snapshot, "header_html"),
    footer_html: pickAtomicField(unit, snapshot, "footer_html"),
    background_image_url: pickAtomicField(unit, snapshot, "background_image_url"),
    background_opacity: pickAtomicField(unit, snapshot, "background_opacity"),
    background_size: pickAtomicField(unit, snapshot, "background_size"),
    footer_image_url: pickAtomicField(unit, snapshot, "footer_image_url"),
    logos: pickAtomicField(unit, snapshot, "logos"),
    block_positions: pickAtomicField(unit, snapshot, "block_positions"),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Normalização de logos (fallback para logo legado da unidade)
// ─────────────────────────────────────────────────────────────────────────

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

/** Confere se ano/mês/dia formam uma data de calendário real, construindo
 * uma data UTC e verificando que os componentes não foram "rolados" pela
 * normalização automática do JavaScript (ex.: 30/02 vira 02/03) — a única
 * forma confiável de rejeitar datas impossíveis sem depender de uma
 * biblioteca externa. Independente de fuso horário (sempre UTC). */
function isValidCalendarDate(year: number, month1to12: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month1to12) || !Number.isInteger(day)) return false;
  if (month1to12 < 1 || month1to12 > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month1to12 - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month1to12 - 1 && date.getUTCDate() === day;
}

/**
 * Formata uma data para dd/mm/aaaa a partir de qualquer um dos dois
 * formatos usados nas 3 fontes de dados do sistema: DICOM (AAAAMMDD, usado
 * pela lista de Estudos e pelo editor do médico) ou ISO/SQL (AAAA-MM-DD,
 * usado pelo financeiro). Retorna null para entrada vazia, formato
 * irreconhecível, OU data de calendário impossível (ex.: "20261340",
 * "2026-02-30", ou 29/02 fora de ano bissexto) — nunca lança, e nunca
 * retorna uma string tecnicamente inválida.
 */
export function formatClinicalDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = DICOM_DATE_RE.exec(raw) ?? ISO_DATE_RE.exec(raw);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!isValidCalendarDate(year, month, day)) return null;
  return `${dayStr}/${monthStr}/${yearStr}`;
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
