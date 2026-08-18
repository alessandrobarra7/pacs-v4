import { describe, expect, it } from "vitest";
import { legacyFallbackAllows } from "./authorization";
import { detectAudioMimeType, detectImageMimeType, extensionForMediaMimeType } from "./routerUtils";
import { readFile } from "node:fs/promises";

describe("P0 — fallback legado de permissões", () => {
  it("concede apenas leitura segura à conta sem permissão granular", () => {
    expect(legacyFallbackAllows(7, 7, "view_studies")).toBe(true);
    expect(legacyFallbackAllows(7, 7, "print_reports")).toBe(true);
    expect(legacyFallbackAllows(7, 7, "edit_reports")).toBe(false);
    expect(legacyFallbackAllows(7, 7, "manage_templates")).toBe(false);
  });
});

describe("P0 — validação de conteúdo real", () => {
  it("aceita apenas assinaturas reais de imagem e áudio", () => {
    expect(detectImageMimeType(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]))).toBe("image/jpeg");
    expect(detectAudioMimeType(Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x93, 0x42]))).toBe("audio/webm");
    expect(detectImageMimeType(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(detectAudioMimeType(Buffer.from("<html>malicioso</html>"))).toBeNull();
    expect(extensionForMediaMimeType("audio/webm")).toBe("webm");
  });
});

describe("P0 — isolamento por unidade na mídia e routers", () => {
  it("protege laudos por unidade e valida estudo nos fluxos de anexo e áudio", async () => {
    const [indexSource, audioSource, attachmentSource] = await Promise.all([
      readFile(new URL("./_core/index.ts", import.meta.url), "utf-8"),
      readFile(new URL("./routers/audioReports.ts", import.meta.url), "utf-8"),
      readFile(new URL("./routers/annotations.ts", import.meta.url), "utf-8"),
    ]);

    expect(indexSource).toContain("const reportMatch = key.match(/^laudos\\/(\\d+)\\//);");
    expect(indexSource).toContain("canAccessUnit(user, Number(reportMatch[1]), 'print_reports')");
    expect(audioSource).toContain("await assertDicomFileAccess(ctx.user, input.study_instance_uid, \"view_studies\")");
    expect(audioSource).toContain("await assertDicomFileAccess(ctx.user, record.study_instance_uid, \"view_studies\")");
    expect(attachmentSource).toContain("await assertDicomFileAccess(ctx.user, input.study_instance_uid, \"view_studies\")");
    expect(attachmentSource).toContain("await assertDicomFileAccess(ctx.user, row.study_instance_uid, \"view_studies\")");
  });
});
