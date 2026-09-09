import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { storageKeyFromReference, storageUsesMinio } from "./storage";
import { toProxyUrl } from "./mediaProxy";

const minioEnvironmentKeys = [
  "MINIO_ENDPOINT",
  "MINIO_BUCKET",
  "MINIO_ACCESS_KEY",
  "MINIO_SECRET_KEY",
] as const;
const originalMinioEnvironment = Object.fromEntries(
  minioEnvironmentKeys.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
  process.env.MINIO_ENDPOINT = "http://minio.test:9000";
  process.env.MINIO_BUCKET = "pacs-test";
  process.env.MINIO_ACCESS_KEY = "test-access-key";
  process.env.MINIO_SECRET_KEY = "test-secret-key";
});

afterEach(() => {
  for (const key of minioEnvironmentKeys) {
    const original = originalMinioEnvironment[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe("VM3 private storage references", () => {
  it("reconhece uma referência estável /api/media e extrai a chave", () => {
    expect(storageKeyFromReference("/api/media/logos/unit_7_logo%20final.png")).toBe(
      "logos/unit_7_logo final.png",
    );
  });

  it("bloqueia path traversal em referências de mídia", () => {
    expect(() => storageKeyFromReference("/api/media/../secrets.txt")).toThrow();
    expect(() => storageKeyFromReference("/api/media/logos/../../secrets.txt")).toThrow();
  });

  it("indica MinIO configurado com ambiente de teste sem depender de segredo real", () => {
    expect(storageUsesMinio()).toBe(true);
  });

  it("não reintroduz fallback para o endpoint legado da VM2", () => {
    const legacyUrl = "http://172.16.3.101:9000/lauds/logos/unit_1.png";
    expect(toProxyUrl(legacyUrl)).toBe(legacyUrl);
    expect(() => storageKeyFromReference(legacyUrl)).toThrow();
  });

  it("recusa uma URL absoluta no endpoint correto quando o bucket não corresponde", () => {
    expect(() => storageKeyFromReference("http://172.16.3.102:9000/lauds/logos/unit_1.png")).toThrow();
  });
});
