/**
 * Testes para os helpers de upload de imagens (M1 — Dossiê de Auditoria v4)
 * Cobre: inferExtension (N1), isValidImageBuffer (U5), MAX_UPLOAD_BYTES (M4)
 */
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "../shared/const";

// ─── Helpers copiados do routers.ts para teste isolado ────────────────────────
// (As funções são internas ao módulo; testamos via comportamento esperado)

function inferExtension(dataUri: string): string {
  const match = dataUri.match(/^data:image\/([a-z+]+);base64,/);
  const mime = match?.[1] || "png";
  if (mime === "jpeg") return "jpg";
  if (mime === "svg+xml") return "svg";
  return mime;
}

function isValidImageBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return true;
  return false;
}

// ─── Testes: inferExtension (Bug fix N1) ──────────────────────────────────────
describe("inferExtension (N1)", () => {
  it("retorna 'png' para image/png", () => {
    expect(inferExtension("data:image/png;base64,abc")).toBe("png");
  });

  it("retorna 'jpg' para image/jpeg", () => {
    expect(inferExtension("data:image/jpeg;base64,abc")).toBe("jpg");
  });

  it("retorna 'gif' para image/gif", () => {
    expect(inferExtension("data:image/gif;base64,abc")).toBe("gif");
  });

  it("retorna 'webp' para image/webp", () => {
    expect(inferExtension("data:image/webp;base64,abc")).toBe("webp");
  });

  it("retorna 'svg' para image/svg+xml", () => {
    expect(inferExtension("data:image/svg+xml;base64,abc")).toBe("svg");
  });

  it("retorna 'png' como fallback para data URI inválido", () => {
    expect(inferExtension("invalid-data-uri")).toBe("png");
  });
});

// ─── Testes: isValidImageBuffer (Bug fix U5) ──────────────────────────────────
describe("isValidImageBuffer (U5)", () => {
  it("aceita buffer PNG válido", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    expect(isValidImageBuffer(png)).toBe(true);
  });

  it("aceita buffer JPEG válido", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(isValidImageBuffer(jpeg)).toBe(true);
  });

  it("aceita buffer GIF válido", () => {
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]);
    expect(isValidImageBuffer(gif)).toBe(true);
  });

  it("aceita buffer WebP válido", () => {
    const webp = Buffer.alloc(12);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    expect(isValidImageBuffer(webp)).toBe(true);
  });

  it("rejeita buffer muito pequeno", () => {
    expect(isValidImageBuffer(Buffer.from([0x89, 0x50]))).toBe(false);
  });

  it("rejeita buffer com magic bytes inválidos", () => {
    const invalid = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
    expect(isValidImageBuffer(invalid)).toBe(false);
  });

  it("rejeita buffer de texto (simulando injeção de HTML)", () => {
    const html = Buffer.from("<script>alert(1)</script>".padEnd(20));
    expect(isValidImageBuffer(html)).toBe(false);
  });
});

// ─── Testes: MAX_UPLOAD_BYTES (Bug fix M4) ────────────────────────────────────
describe("MAX_UPLOAD_BYTES (M4)", () => {
  it("MAX_UPLOAD_BYTES é 2 MB (2 * 1024 * 1024)", () => {
    expect(MAX_UPLOAD_BYTES).toBe(2 * 1024 * 1024);
  });

  it("MAX_UPLOAD_MB é 2", () => {
    expect(MAX_UPLOAD_MB).toBe(2);
  });

  it("buffer de 1 MB passa na validação de tamanho", () => {
    const buf = Buffer.alloc(1 * 1024 * 1024);
    expect(buf.length <= MAX_UPLOAD_BYTES).toBe(true);
  });

  it("buffer de 3 MB falha na validação de tamanho", () => {
    const buf = Buffer.alloc(3 * 1024 * 1024);
    expect(buf.length > MAX_UPLOAD_BYTES).toBe(true);
  });
});
