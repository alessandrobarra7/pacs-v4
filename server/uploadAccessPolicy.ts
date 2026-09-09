const PUBLIC_UPLOAD_PREFIXES = new Set([
  "logos",
  "signatures",
  "stamps",
  "avatars",
  "profiles",
  "layout-backgrounds",
  "layout-logos",
]);

const LEGACY_CLINICAL_MEDIA_PREFIXES = new Set([
  "audio_reports",
  "attachments",
  "laudos",
]);

/** Permite somente os grupos de ativos que foram explicitamente aprovados como públicos. */
export function isPublicUploadPathAllowed(requestPath: string): boolean {
  const firstSegment = requestPath.replace(/^\/+/, "").split("/")[0];
  return PUBLIC_UPLOAD_PREFIXES.has(firstSegment);
}

/** Limita o fallback local autenticado às categorias clínicas legadas conhecidas. */
export function isLegacyClinicalMediaKey(key: string): boolean {
  return LEGACY_CLINICAL_MEDIA_PREFIXES.has(key.replace(/^\/+/, "").split("/")[0]);
}
