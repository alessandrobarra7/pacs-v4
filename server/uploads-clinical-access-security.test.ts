import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isLegacyClinicalMediaKey, isPublicUploadPathAllowed } from "./uploadAccessPolicy";
import { toProxyUrl } from "./mediaProxy";
import { storageGetUrl } from "./storage";

const serverSource = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");
const storageSource = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");

describe("proteção de uploads clínicos legados", () => {
  it("permite publicamente apenas grupos de ativos aprovados", () => {
    expect(isPublicUploadPathAllowed("/layout-logos/brand.png")).toBe(true);
    expect(isPublicUploadPathAllowed("/signatures/user_7.png")).toBe(true);
    expect(isPublicUploadPathAllowed("/audio_reports/1.2.3/audio.webm")).toBe(false);
    expect(isPublicUploadPathAllowed("/attachments/1.2.3/document.pdf")).toBe(false);
    expect(isPublicUploadPathAllowed("/laudos/3/9_v1.html")).toBe(false);
    expect(isPublicUploadPathAllowed("/unknown/file.txt")).toBe(false);
  });

  it("limita o fallback autenticado às categorias clínicas legadas", () => {
    expect(isLegacyClinicalMediaKey("audio_reports/1.2.3/audio.webm")).toBe(true);
    expect(isLegacyClinicalMediaKey("attachments/1.2.3/document.pdf")).toBe(true);
    expect(isLegacyClinicalMediaKey("laudos/3/9_v1.html")).toBe(true);
    expect(isLegacyClinicalMediaKey("signatures/user_7.png")).toBe(false);
    expect(isLegacyClinicalMediaKey("layout-logos/brand.png")).toBe(false);
  });

  it("redireciona referências clínicas legadas para a rota autenticada", () => {
    expect(toProxyUrl("/uploads/audio_reports/1.2.3/audio.webm")).toBe("/api/media/audio_reports/1.2.3/audio.webm");
    expect(toProxyUrl("/uploads/attachments/1.2.3/document.pdf")).toBe("/api/media/attachments/1.2.3/document.pdf");
    expect(toProxyUrl("/uploads/laudos/7/8_v1.html")).toBe("/api/media/laudos/7/8_v1.html");
    expect(toProxyUrl("/uploads/layout-logos/brand.png")).toBe("/uploads/layout-logos/brand.png");
  });

  it("converte referências clínicas legadas na camada central de armazenamento", async () => {
    await expect(storageGetUrl("/uploads/audio_reports/1.2.3/audio.webm")).resolves.toBe("/api/media/audio_reports/1.2.3/audio.webm");
    await expect(storageGetUrl("/uploads/attachments/1.2.3/document.pdf")).resolves.toBe("/api/media/attachments/1.2.3/document.pdf");
    await expect(storageGetUrl("/uploads/laudos/7/8_v1.html")).resolves.toBe("/api/media/laudos/7/8_v1.html");
    await expect(storageGetUrl("/uploads/layout-logos/brand.png")).resolves.toBe("/uploads/layout-logos/brand.png");
  });

  it("mantém o bloqueio antes da rota estática e entrega legado somente pela rota autenticada", () => {
    expect(serverSource).toContain("app.get('/api/media/*', requireAuth");
    expect(serverSource).toContain("storageLegacyClinicalFilePath(key)");
    expect(serverSource).toContain("isPublicUploadPathAllowed(req.path)");
    expect(serverSource).toContain("return res.status(403).send('Acesso negado.')");
    expect(storageSource).toContain("return legacyKey && isLegacyClinicalMediaKey(legacyKey) ? encodeMediaKey(legacyKey) : value;");
  });
});
