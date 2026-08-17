/**
 * Camada única de armazenamento do Portal PACS.
 *
 * Novos objetos usam MinIO privado na VM3 quando as variáveis MINIO_* estão
 * configuradas. Arquivos legados em /uploads continuam legíveis durante a
 * migração, mas não recebem novos uploads quando o MinIO está ativo.
 */
import fs from "fs";
import path from "path";
import {
  isMinioConfigured,
  minioDelete,
  minioPresignedUrl,
  minioUpload,
} from "./minio";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const PRIVATE_MEDIA_PREFIX = "/api/media/";
function configuredMinioEndpoint(): string | undefined {
  return process.env.MINIO_ENDPOINT;
}

function configuredMinioBucket(): string | undefined {
  return process.env.MINIO_BUCKET;
}

function ensureDir(subDir: string): string {
  const dir = path.join(UPLOADS_DIR, subDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function normalizeKey(relKey: string): string {
  const key = relKey.replace(/^\/+/, "");
  if (
    !key ||
    key.includes("\\") ||
    key.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error("[Security] Caminho de armazenamento inválido (path traversal bloqueado).");
  }
  return key;
}

function encodeMediaKey(key: string): string {
  const encodedPath = key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `${PRIVATE_MEDIA_PREFIX}${encodedPath}`;
}

function decodeMediaKey(reference: string): string | null {
  const value = reference.trim();
  if (!value) return null;

  if (value.startsWith(PRIVATE_MEDIA_PREFIX)) {
    try {
      return normalizeKey(decodeURIComponent(value.slice(PRIVATE_MEDIA_PREFIX.length)));
    } catch {
      throw new Error("[Security] Referência de mídia inválida.");
    }
  }

  if (value.startsWith("/uploads/")) {
    return normalizeKey(value.slice("/uploads/".length));
  }

  if (value.startsWith("s3://")) {
    const withoutScheme = value.slice("s3://".length);
    const slash = withoutScheme.indexOf("/");
    if (slash < 1) throw new Error("[Security] Referência S3 inválida.");
    const bucket = withoutScheme.slice(0, slash);
    const configuredBucket = configuredMinioBucket();
    if (configuredBucket && bucket !== configuredBucket) {
      throw new Error("[Security] Bucket S3 não autorizado.");
    }
    return normalizeKey(withoutScheme.slice(slash + 1));
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const endpoint = configuredMinioEndpoint();
    const configuredBucket = configuredMinioBucket();
    if (!endpoint || !configuredBucket) throw new Error("[Security] Endpoint de mídia não configurado.");
    try {
      const parsed = new URL(value);
      const expectedOrigin = new URL(endpoint).origin;
      const prefix = `/${configuredBucket}/`;
      if (parsed.origin === expectedOrigin && parsed.pathname.startsWith(prefix)) {
        return normalizeKey(decodeURIComponent(parsed.pathname.slice(prefix.length)));
      }
    } catch {
      throw new Error("[Security] URL de mídia inválida.");
    }
    throw new Error("[Security] Endpoint de mídia não autorizado.");
  }

  return normalizeKey(value);
}

function localFilePath(key: string): string {
  const safeKey = normalizeKey(key);
  const filePath = path.resolve(UPLOADS_DIR, safeKey);
  const resolvedBase = path.resolve(UPLOADS_DIR);
  if (!filePath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error("[Security] Caminho de upload inválido (path traversal bloqueado).");
  }
  return filePath;
}

/**
 * Salva no MinIO VM3 ou, quando ele não estiver configurado, no storage local
 * de desenvolvimento. O URL de um objeto MinIO é uma referência estável da
 * aplicação; a rota /api/media gera a URL pré-assinada somente na leitura.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const buffer = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data);

  // Escopo confirmado pelo usuário: logos, assinaturas, carimbos, perfis e configs
  // permanecem estritamente locais na VM1. Apenas laudos fechados (exports),
  // anexos de exames e áudios vinculados aos exames vão para a VM3 (MinIO).
  const isLocalAsset = key.startsWith("logos/") || key.startsWith("signatures/") || key.startsWith("stamps/") || key.startsWith("avatars/") || key.startsWith("profiles/");

  if (isMinioConfigured() && !isLocalAsset) {
    await minioUpload(key, buffer, contentType);
    return { key, url: encodeMediaKey(key) };
  }

  const subDir = path.dirname(key);
  ensureDir(subDir);
  fs.writeFileSync(localFilePath(key), buffer);
  return { key, url: `/uploads/${key}` };
}

/** Remove um objeto MinIO ou um arquivo legado local, conforme a referência. */
export async function storageDelete(urlOrKey: string): Promise<void> {
  const key = decodeMediaKey(urlOrKey);
  if (!key) return;

  const isLocalAsset = key.startsWith("logos/") || key.startsWith("signatures/") || key.startsWith("stamps/") || key.startsWith("avatars/") || key.startsWith("profiles/");
  if (isMinioConfigured() && !urlOrKey.trim().startsWith("/uploads/") && !isLocalAsset) {
    await minioDelete(key);
    return;
  }

  try {
    const filePath = localFilePath(key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.warn("[Storage] Falha ao remover arquivo local legado:", error instanceof Error ? error.message : "erro desconhecido");
  }
}

/**
 * Converte referência estável em URL de leitura. Objetos MinIO recebem URL
 * pré-assinada curta; arquivos locais legados continuam em /uploads.
 */
export async function storageGetUrl(
  urlOrKey: string,
  expirySeconds = 900,
): Promise<string> {
  const value = urlOrKey.trim();
  if (!isMinioConfigured() || value.startsWith("/uploads/")) return value;
  const key = decodeMediaKey(value);
  if (!key) throw new Error("[Storage] Referência vazia.");
  const isLocalAsset = key.startsWith("logos/") || key.startsWith("signatures/") || key.startsWith("stamps/") || key.startsWith("avatars/") || key.startsWith("profiles/");
  if (isLocalAsset) {
    return value.startsWith("/api/media/") ? `/uploads/${key}` : value;
  }
  return minioPresignedUrl(key, expirySeconds);
}

export function storageKeyFromReference(urlOrKey: string): string {
  const key = decodeMediaKey(urlOrKey);
  if (!key) throw new Error("[Storage] Referência vazia.");
  return key;
}

export function storageUsesMinio(): boolean {
  return isMinioConfigured();
}
