/**
 * Cliente MinIO/S3 da VM3.
 *
 * A configuração é lida no momento da operação, e não no import do módulo.
 * Isso é necessário porque a VM1 carrega o .env durante o bootstrap do
 * servidor e o PM2 pode injetar as variáveis depois da avaliação dos imports.
 */
import * as Minio from "minio";

type MinioRuntimeConfig = {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  useSSL: boolean;
};

let cachedClient: Minio.Client | null = null;
let cachedFingerprint = "";

function readConfig(): MinioRuntimeConfig | null {
  const endpoint = process.env.MINIO_ENDPOINT;
  const bucket = process.env.MINIO_BUCKET;
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;

  if (!endpoint || !bucket || !accessKey || !secretKey) return null;

  const parsed = new URL(endpoint);
  const envUseSsl = process.env.MINIO_USE_SSL;
  return {
    endpoint,
    bucket,
    accessKey,
    secretKey,
    useSSL: envUseSsl === undefined ? parsed.protocol === "https:" : envUseSsl === "true",
  };
}

function requireConfig(): MinioRuntimeConfig {
  const config = readConfig();
  if (!config) {
    throw new Error(
      "[MinIO] MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY e MINIO_SECRET_KEY devem estar definidos.",
    );
  }
  return config;
}

function getClient(config: MinioRuntimeConfig): Minio.Client {
  const parsed = new URL(config.endpoint);
  const port = Number.parseInt(parsed.port || (parsed.protocol === "https:" ? "443" : "80"), 10);
  const fingerprint = `${config.endpoint}|${config.bucket}|${config.accessKey}|${config.useSSL}`;

  if (!cachedClient || cachedFingerprint !== fingerprint) {
    cachedClient = new Minio.Client({
      endPoint: parsed.hostname,
      port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
    cachedFingerprint = fingerprint;
  }
  return cachedClient;
}

export function isMinioConfigured(): boolean {
  return readConfig() !== null;
}

function assertSafeObjectKey(key: string): string {
  const normalized = key.replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.includes("\\") ||
    normalized.split("/").some((part) => part === ".." || part === ".")
  ) {
    throw new Error("[Security] Chave de objeto MinIO inválida.");
  }
  return normalized;
}

async function assertBucket(client: Minio.Client, bucket: string): Promise<void> {
  const exists = await client.bucketExists(bucket);
  if (!exists) throw new Error(`[MinIO] Bucket configurado não existe: ${bucket}`);
}

export async function minioBucketExists(): Promise<boolean> {
  const config = requireConfig();
  return getClient(config).bucketExists(config.bucket);
}

export async function minioUpload(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  const config = requireConfig();
  const client = getClient(config);
  const safeKey = assertSafeObjectKey(key);
  await assertBucket(client, config.bucket);
  await client.putObject(config.bucket, safeKey, data, data.length, {
    "Content-Type": contentType,
  });
}

export async function minioDelete(key: string): Promise<void> {
  const config = requireConfig();
  const safeKey = assertSafeObjectKey(key);
  await getClient(config).removeObject(config.bucket, safeKey);
}

/** Gera uma URL temporária; o padrão curto evita links permanentes de objetos privados. */
export async function minioPresignedUrl(
  key: string,
  expirySeconds = 900,
): Promise<string> {
  const config = requireConfig();
  const safeKey = assertSafeObjectKey(key);
  return getClient(config).presignedGetObject(config.bucket, safeKey, expirySeconds);
}

export function minioBucketName(): string | null {
  return readConfig()?.bucket ?? null;
}
