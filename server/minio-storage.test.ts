import { describe, expect, it } from "vitest";
import { storageKeyFromReference, storageUsesMinio } from "./storage";
import { toProxyUrl } from "./mediaProxy";

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

  it("indica MinIO configurado sem expor qualquer segredo", () => {
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
