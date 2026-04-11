/**
 * MinIO Storage Helper
 * Gerencia upload e acesso a logos de unidades e carimbos de médicos.
 * Credenciais lidas do .env da VM1.
 */
import * as Minio from "minio";

// F2-3: Credenciais lidas exclusivamente de variáveis de ambiente — sem fallback hardcoded
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT;
const MINIO_BUCKET = process.env.MINIO_BUCKET;
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION && (!MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY)) {
  throw new Error('[FATAL] Variáveis MINIO_ENDPOINT, MINIO_ACCESS_KEY e MINIO_SECRET_KEY devem estar definidas em produção.');
}

// Em desenvolvimento, usa defaults locais apenas se não definidos
const endpoint = MINIO_ENDPOINT || 'http://localhost:9000';
const bucket = MINIO_BUCKET || 'lauds';

// Parse endpoint para extrair host, porta e protocolo
function parseEndpoint(url: string) {
  const u = new URL(url);
  return {
    endPoint: u.hostname,
    port: parseInt(u.port || (u.protocol === 'https:' ? '443' : '80')),
    useSSL: u.protocol === 'https:',
  };
}

const { endPoint, port, useSSL } = parseEndpoint(endpoint);

export const minioClient = new Minio.Client({
  endPoint,
  port,
  useSSL,
  accessKey: MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: MINIO_SECRET_KEY || 'minioadmin',
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
