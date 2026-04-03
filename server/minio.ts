/**
 * MinIO Storage Helper
 * Gerencia upload e acesso a logos de unidades e carimbos de médicos.
 * Credenciais lidas do .env da VM1.
 */
import * as Minio from "minio";

const endpoint = process.env.MINIO_ENDPOINT || "http://172.16.3.101:9000";
const bucket = process.env.MINIO_BUCKET || "lauds";

// Parse endpoint para extrair host, porta e protocolo
function parseEndpoint(url: string) {
  const u = new URL(url);
  return {
    endPoint: u.hostname,
    port: parseInt(u.port || (u.protocol === "https:" ? "443" : "80")),
    useSSL: u.protocol === "https:",
  };
}

const { endPoint, port, useSSL } = parseEndpoint(endpoint);

export const minioClient = new Minio.Client({
  endPoint,
  port,
  useSSL,
  accessKey: process.env.MINIO_ACCESS_KEY || "lauds_admin",
  secretKey: process.env.MINIO_SECRET_KEY || "Lauds@2026!Secure",
});

/**
 * Garante que o bucket existe, criando-o se necessário.
 */
async function ensureBucket() {
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket, "us-east-1");
  }
}

/**
 * Faz upload de um arquivo para o MinIO.
 * @param key  Caminho relativo dentro do bucket (ex: "unidades/1/logo.png")
 * @param data Buffer com o conteúdo do arquivo
 * @param contentType MIME type do arquivo
 * @returns URL pública do arquivo
 */
export async function minioUpload(
  key: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  await ensureBucket();
  await minioClient.putObject(bucket, key, data, data.length, {
    "Content-Type": contentType,
  });
  // Retorna URL de acesso direto (o bucket é acessível via HTTP na VM3)
  return `${endpoint}/${bucket}/${key}`;
}

/**
 * Remove um arquivo do MinIO.
 * @param key Caminho relativo dentro do bucket
 */
export async function minioDelete(key: string): Promise<void> {
  try {
    await minioClient.removeObject(bucket, key);
  } catch {
    // Ignora erros de arquivo não encontrado
  }
}

/**
 * Gera uma URL pré-assinada para acesso temporário (7 dias).
 * Útil se o bucket for privado.
 */
export async function minioPresignedUrl(key: string, expirySeconds = 604800): Promise<string> {
  return minioClient.presignedGetObject(bucket, key, expirySeconds);
}
