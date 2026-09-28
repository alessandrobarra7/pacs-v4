import {
  DEFAULT_LAYOUT_PREFERENCES,
  layoutPreferencesSchema,
  type LayoutPreferences,
  type LayoutSnapshot,
} from "./types";

export type ReportLayoutStatus = string | null | undefined;

export interface ReportLogo {
  url: string;
  width: number;
  height: number;
  label: string;
}

export interface ReportBlockPosition {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

/**
 * Forma permissiva de um layout persistido. Snapshots históricos podem não
 * conter todos os campos adicionados posteriormente; a resolução canônica
 * trata essa ausência de forma explícita.
 */
export interface ReportLayoutSource {
  preferences?: Partial<LayoutPreferences> | Record<string, unknown> | null;
  header_html?: string | null;
  footer_html?: string | null;
  background_image_url?: string | null;
  background_opacity?: string | number | null;
  background_size?: string | null;
  footer_image_url?: string | null;
  logos?: ReportLogo[] | null;
  block_positions?: Record<string, ReportBlockPosition> | null;
}

export interface EffectiveReportLayout {
  preferences: LayoutPreferences;
  header_html: string | null;
  footer_html: string | null;
  background_image_url: string | null;
  background_opacity: string | number | null;
  background_size: string | null;
  footer_image_url: string | null;
  logos: ReportLogo[] | null;
  block_positions: Record<string, ReportBlockPosition> | null;
  source: "snapshot" | "unitLayout";
}

type LayoutRecord = Record<string, unknown>;

function toRecord(value: unknown): LayoutRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as LayoutRecord
    : null;
}

/**
 * Retorna dados novos para que consumidores não possam mutar layout da unidade
 * ou o snapshot armazenado por referência.
 */
export function deepCloneValue<T>(value: T): T {
  if (value === null || value === undefined) return value;

  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizePreferences(...sources: unknown[]): LayoutPreferences {
  const candidate = { ...DEFAULT_LAYOUT_PREFERENCES } as Record<string, unknown>;

  for (const source of sources) {
    const record = toRecord(source);
    if (!record) continue;

    for (const [key, value] of Object.entries(record)) {
      if (value !== undefined) candidate[key] = value;
    }
  }

  const parsed = layoutPreferencesSchema.safeParse(candidate);
  return deepCloneValue(parsed.success ? parsed.data : DEFAULT_LAYOUT_PREFERENCES);
}

function asLogos(value: unknown): ReportLogo[] | null {
  return Array.isArray(value) ? deepCloneValue(value as ReportLogo[]) : null;
}

function asBlockPositions(value: unknown): Record<string, ReportBlockPosition> | null {
  const record = toRecord(value);
  return record ? deepCloneValue(record as Record<string, ReportBlockPosition>) : null;
}

/**
 * Seleciona um campo atômico com semântica histórica: uma chave presente no
 * snapshot vence inclusive quando o valor é null; somente uma chave ausente
 * recebe fallback do layout atual da unidade.
 */
export function pickAtomicField<T>(
  key: keyof ReportLayoutSource,
  unitLayout: ReportLayoutSource | null | undefined,
  snapshot: ReportLayoutSource | null | undefined,
): T | null {
  const snapshotRecord = toRecord(snapshot);
  if (snapshotRecord && Object.hasOwn(snapshotRecord, key)) {
    return deepCloneValue(snapshotRecord[key] as T | null);
  }

  const unitRecord = toRecord(unitLayout);
  return deepCloneValue((unitRecord?.[key] as T | null | undefined) ?? null);
}

/**
 * Cria, no instante da assinatura, um snapshot autocontido e imutável do
 * layout vigente. O horário é recebido do chamador para manter esta função
 * pura e deterministicamente testável.
 */
export function buildLayoutSnapshot(
  unitLayout: ReportLayoutSource | null | undefined,
  capturedAt: string,
): LayoutSnapshot | null {
  const unitRecord = toRecord(unitLayout);
  if (!unitRecord) return null;

  return {
    preferences: normalizePreferences(unitRecord.preferences),
    header_html: deepCloneValue((unitRecord.header_html as string | null | undefined) ?? null),
    footer_html: deepCloneValue((unitRecord.footer_html as string | null | undefined) ?? null),
    background_image_url: deepCloneValue((unitRecord.background_image_url as string | null | undefined) ?? null),
    background_opacity: deepCloneValue((unitRecord.background_opacity as string | number | null | undefined) ?? null),
    background_size: deepCloneValue((unitRecord.background_size as string | null | undefined) ?? null),
    footer_image_url: deepCloneValue((unitRecord.footer_image_url as string | null | undefined) ?? null),
    logos: asLogos(unitRecord.logos),
    block_positions: asBlockPositions(unitRecord.block_positions),
    capturedAt,
  };
}

function shouldUseSnapshot(status: ReportLayoutStatus, snapshot: ReportLayoutSource | null | undefined): boolean {
  return (status === "signed" || status === "revised") && toRecord(snapshot) !== null;
}

/**
 * Regra única de precedência para todos os consumidores de laudos:
 * - rascunho: layout atual da unidade;
 * - assinado/revisado com snapshot: snapshot, com fallback somente de campos
 *   ausentes em snapshots legados;
 * - assinado/revisado sem snapshot: layout atual como fallback legado.
 */
export function resolveEffectiveReportLayout({
  status,
  unitLayout,
  reportLayoutSnapshot,
}: {
  status: ReportLayoutStatus;
  unitLayout: ReportLayoutSource | null | undefined;
  reportLayoutSnapshot: ReportLayoutSource | null | undefined;
}): EffectiveReportLayout {
  const useSnapshot = shouldUseSnapshot(status, reportLayoutSnapshot);
  const snapshot = useSnapshot ? reportLayoutSnapshot : null;
  const unitRecord = toRecord(unitLayout);
  const snapshotRecord = toRecord(snapshot);

  return {
    preferences: normalizePreferences(unitRecord?.preferences, snapshotRecord?.preferences),
    header_html: pickAtomicField<string>("header_html", unitLayout, snapshot),
    footer_html: pickAtomicField<string>("footer_html", unitLayout, snapshot),
    background_image_url: pickAtomicField<string>("background_image_url", unitLayout, snapshot),
    background_opacity: pickAtomicField<string | number>("background_opacity", unitLayout, snapshot),
    background_size: pickAtomicField<string>("background_size", unitLayout, snapshot),
    footer_image_url: pickAtomicField<string>("footer_image_url", unitLayout, snapshot),
    logos: asLogos(pickAtomicField<ReportLogo[]>("logos", unitLayout, snapshot)),
    block_positions: asBlockPositions(pickAtomicField<Record<string, ReportBlockPosition>>("block_positions", unitLayout, snapshot)),
    source: useSnapshot ? "snapshot" : "unitLayout",
  };
}
