import { describe, expect, it, vi } from "vitest";
import { createDicomAccessCache, type AuthUser } from "./authorization";

const user: AuthUser = { id: 31, role: "medico", unit_id: 7 };

describe("cache de autorização DICOM", () => {
  it("reutiliza a autorização positiva do mesmo usuário, estudo e permissão enquanto o TTL for válido", async () => {
    let currentTime = 1_000;
    const resolver = vi.fn(async () => 7);
    const cache = createDicomAccessCache(resolver, { ttlMs: 60_000, now: () => currentTime });

    await expect(cache.assert(user, "1.2.3", "view_studies")).resolves.toBe(7);
    await expect(cache.assert(user, "1.2.3", "view_studies")).resolves.toBe(7);

    expect(resolver).toHaveBeenCalledTimes(1);
    currentTime += 60_000;
    await cache.assert(user, "1.2.3", "view_studies");
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it("não compartilha autorização entre estudos, permissões ou usuários", async () => {
    const resolver = vi.fn(async () => 7);
    const cache = createDicomAccessCache(resolver);

    await cache.assert(user, "1.2.3", "view_studies");
    await cache.assert(user, "1.2.4", "view_studies");
    await cache.assert(user, "1.2.3", "print_reports");
    await cache.assert({ ...user, id: 32 }, "1.2.3", "view_studies");

    expect(resolver).toHaveBeenCalledTimes(4);
  });

  it("não memoriza falhas de autorização", async () => {
    const resolver = vi.fn(async () => {
      throw new Error("Acesso negado");
    });
    const cache = createDicomAccessCache(resolver);

    await expect(cache.assert(user, "1.2.3", "view_studies")).rejects.toThrow("Acesso negado");
    await expect(cache.assert(user, "1.2.3", "view_studies")).rejects.toThrow("Acesso negado");

    expect(resolver).toHaveBeenCalledTimes(2);
  });
});
