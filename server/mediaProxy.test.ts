import { afterEach, describe, expect, it } from "vitest";
import { toProxyUrl } from "./mediaProxy";

const originalEndpoint = process.env.MINIO_ENDPOINT;
const originalBucket = process.env.MINIO_BUCKET;

afterEach(() => {
  process.env.MINIO_ENDPOINT = originalEndpoint;
  process.env.MINIO_BUCKET = originalBucket;
});

describe("toProxyUrl", () => {
  it("normaliza uma URL legada do MinIO para a rota autenticada do Portal", () => {
    process.env.MINIO_ENDPOINT = "http://172.16.3.102:9000";
    process.env.MINIO_BUCKET = "vm3-storage";

    expect(toProxyUrl("http://172.16.3.102:9000/vm3-storage/attachments/1.2.3/foto%20clinica.jpg?X-Amz-Signature=test"))
      .toBe("/api/media/attachments/1.2.3/foto%20clinica.jpg");
  });

  it("mantém referências estáveis e arquivos locais legados", () => {
    expect(toProxyUrl("/api/media/attachments/1.2.3/foto.jpg")).toBe("/api/media/attachments/1.2.3/foto.jpg");
    expect(toProxyUrl("/uploads/attachments/1.2.3/foto.jpg")).toBe("/uploads/attachments/1.2.3/foto.jpg");
  });
});

