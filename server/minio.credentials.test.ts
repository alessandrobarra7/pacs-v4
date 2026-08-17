import { describe, expect, it } from "vitest";
import { minioClient } from "./minio";

const runMinioIntegration = process.env.RUN_MINIO_INTEGRATION_TESTS === "1" ? it : it.skip;

describe("MinIO VM3 credentials", () => {
  it("mantém a configuração mínima de produção sem expor a Secret Key", () => {
    expect(process.env.MINIO_ENDPOINT).toBe("http://172.16.3.102:9000");
    expect(process.env.MINIO_BUCKET).toBe("vm3-storage");
    expect(process.env.MINIO_ACCESS_KEY).toBe("pacs-app-20260817");
    expect(process.env.MINIO_SECRET_KEY).toBeTruthy();
  });

  runMinioIntegration(
    "autentica na API S3 e encontra o bucket configurado sem expor credenciais",
    async () => {
      const exists = await minioClient.bucketExists(process.env.MINIO_BUCKET!);
      expect(exists).toBe(true);
    },
    15_000,
  );
});
