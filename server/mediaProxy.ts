/**
 * Converte URLs internas do MinIO para URLs proxy acessíveis pelo browser.
 * O MinIO está na rede interna (172.16.x.x) e não é acessível diretamente pelo browser.
 * O endpoint /api/media/* faz proxy das imagens para o cliente.
 */

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "http://172.16.3.101:9000";
const MINIO_BUCKET = process.env.MINIO_BUCKET || "lauds";

/**
 * Converte uma URL do MinIO para uma URL proxy relativa.
 * Ex: "http://172.16.3.101:9000/lauds/logos/unit_1_123.png"
 *  → "/api/media/logos/unit_1_123.png"
 */
export function toProxyUrl(minioUrl: string | null | undefined): string | null {
  if (!minioUrl) return null;

  // Prefixo esperado: http://172.16.3.101:9000/lauds/
  const prefix = `${MINIO_ENDPOINT}/${MINIO_BUCKET}/`;

  if (minioUrl.startsWith(prefix)) {
    const key = minioUrl.slice(prefix.length);
    return `/api/media/${key}`;
  }

  // Se já for uma URL proxy ou URL externa, retorna como está
  return minioUrl;
}
