import { describe, expect, it, vi } from "vitest";
import { createMinioBucketExistenceCache } from "./minio";

describe("cache de disponibilidade do bucket MinIO", () => {
  it("evita consultar novamente o bucket enquanto a resposta estiver dentro do TTL", async () => {
    let currentTime = 5_000;
    const cache = createMinioBucketExistenceCache({ ttlMs: 300_000, now: () => currentTime });
    const loader = vi.fn(async () => true);

    await expect(cache.getOrLoad("vm3-storage", loader)).resolves.toBe(true);
    await expect(cache.getOrLoad("vm3-storage", loader)).resolves.toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);

    currentTime += 300_000;
    await cache.getOrLoad("vm3-storage", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("mantém entradas separadas por destino configurado", async () => {
    const cache = createMinioBucketExistenceCache();
    const first = vi.fn(async () => true);
    const second = vi.fn(async () => false);

    await cache.getOrLoad("vm3-a", first);
    await cache.getOrLoad("vm3-b", second);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
