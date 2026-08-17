/**
 * Normaliza referências de objetos privados para a rota estável da aplicação.
 *
 * A rota /api/media/* autentica o usuário e gera uma URL pré-assinada do
 * MinIO somente no momento da leitura. Não há fallback para IP ou bucket
 * antigos da VM2.
 */
const PRIVATE_MEDIA_PREFIX = "/api/media/";

export function toProxyUrl(reference: string | null | undefined): string | null {
  if (!reference) return null;
  if (reference.startsWith(PRIVATE_MEDIA_PREFIX) || reference.startsWith("/uploads/")) {
    return reference;
  }
  const minioEndpoint = process.env.MINIO_ENDPOINT;
  const minioBucket = process.env.MINIO_BUCKET;
  if (!minioEndpoint || !minioBucket) return reference;

  try {
    const parsed = new URL(reference);
    const expectedOrigin = new URL(minioEndpoint).origin;
    const bucketPrefix = `/${minioBucket}/`;
    if (parsed.origin !== expectedOrigin || !parsed.pathname.startsWith(bucketPrefix)) {
      return reference;
    }
    const key = decodeURIComponent(parsed.pathname.slice(bucketPrefix.length));
    const encodedPath = key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
    return `${PRIVATE_MEDIA_PREFIX}${encodedPath}`;
  } catch {
    return reference;
  }
}
