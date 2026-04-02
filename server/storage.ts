// Storage helpers for MinIO (S3-compatible) on VM2
// Replaces Manus S3 with self-hosted MinIO at 172.16.3.101:9000

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from './_core/env';

type StorageConfig = {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
};

function getStorageConfig(): StorageConfig {
  const endpoint = process.env.MINIO_ENDPOINT || "http://172.16.3.101:9000";
  const accessKey = process.env.MINIO_ACCESS_KEY || "lauds_admin";
  const secretKey = process.env.MINIO_SECRET_KEY || "Lauds@2026!Secure";
  const bucket = process.env.MINIO_BUCKET || "lauds";

  if (!endpoint || !accessKey || !secretKey || !bucket) {
    throw new Error(
      "MinIO credentials missing: set MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET"
    );
  }

  return { endpoint, accessKey, secretKey, bucket };
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const { endpoint, accessKey, secretKey } = getStorageConfig();
    s3Client = new S3Client({
      endpoint,
      region: "us-east-1", // MinIO ignora region, mas é obrigatório
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true, // Obrigatório para MinIO
    });
  }
  return s3Client;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

/**
 * Upload de arquivo para MinIO
 * @param relKey Caminho relativo no bucket (ex: "unidades/1/logo/logo.png")
 * @param data Buffer, Uint8Array ou string
 * @param contentType MIME type (ex: "image/png")
 * @returns { key, url } - URL público do arquivo
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const { bucket, endpoint } = getStorageConfig();
  const key = normalizeKey(relKey);
  const client = getS3Client();

  const body = typeof data === "string" ? Buffer.from(data, "utf-8") : data;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await client.send(command);

  // MinIO URL pública (assumindo bucket público ou presigned URL)
  const url = `${endpoint}/${bucket}/${key}`;
  return { key, url };
}

/**
 * Gerar URL assinada (presigned) para download de arquivo privado
 * @param relKey Caminho relativo no bucket
 * @param expiresIn Tempo de expiração em segundos (padrão: 1 hora)
 * @returns { key, url } - URL assinada válida por expiresIn segundos
 */
export async function storageGet(
  relKey: string,
  expiresIn = 3600
): Promise<{ key: string; url: string }> {
  const { bucket } = getStorageConfig();
  const key = normalizeKey(relKey);
  const client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  return { key, url };
}
