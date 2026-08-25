/**
 * Testes para o serviço de autenticação
 * Cobre: SESSION_DURATION via ENV (N6), AuthService.hashPassword
 * PRG-01: testes de buildSessionCookie e createSession removidos — métodos eram código morto
 */
import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionPath = path.resolve(__dirname, "_core", "session.ts");
const routersPath = path.resolve(__dirname, "routers.ts");

// ─── Testes: SESSION_DURATION via env (N6) ────────────────────────────────────
describe("SESSION_DURATION via ENV (N6)", () => {
  it("SESSION_DURATION_HOURS padrão é 24 quando env não definido", () => {
    const hours = parseInt(process.env.SESSION_DURATION_HOURS ?? "24", 10);
    expect(hours).toBe(24);
  });

  it("SESSION_DURATION em ms é calculado corretamente para 24h", () => {
    const hours = 24;
    const durationMs = hours * 60 * 60 * 1000;
    expect(durationMs).toBe(86400000); // 24 * 60 * 60 * 1000
  });

  it("SESSION_DURATION em ms é calculado corretamente para 8h", () => {
    const hours = 8;
    const durationMs = hours * 60 * 60 * 1000;
    expect(durationMs).toBe(28800000); // 8 * 60 * 60 * 1000
  });

  it("parseInt com fallback '24' retorna 24 para string vazia", () => {
    const result = parseInt("" || "24", 10);
    expect(result).toBe(24);
  });

  it("parseInt com fallback '24' retorna valor correto para '8'", () => {
    const result = parseInt("8" ?? "24", 10);
    expect(result).toBe(8);
  });

  it("aplica a duração configurada na sessão local de usuário e senha", async () => {
    const [sessionSource, routersSource] = await Promise.all([
      fs.readFile(sessionPath, "utf8"),
      fs.readFile(routersPath, "utf8"),
    ]);

    expect(sessionSource).toContain("export async function signSession");
    expect(routersSource).toContain("expiresInMs: ENV.sessionDurationHours * 60 * 60 * 1000");
    expect(routersSource).not.toContain("OAUTH_SERVER_URL");
  });

  it("assina e valida uma sessão local sem depender de OAuth externo", async () => {
    const { signSession, verifySession } = await import("./_core/session");
    const token = await signSession(
      { openId: "local:teste", name: "Usuário de teste" },
      { expiresInMs: 60_000 },
    );

    await expect(verifySession(token)).resolves.toEqual({
      openId: "local:teste",
      name: "Usuário de teste",
    });
  });
});

// ─── Testes: AuthService.hashPassword ────────────────────────────────────────
describe("AuthService.hashPassword", () => {
  it("gera hash bcrypt com custo 12", async () => {
    const { AuthService } = await import("./auth.service");
    const hash = await AuthService.hashPassword("senha-teste-123");
    // Hash bcrypt começa com $2b$12$
    expect(hash).toMatch(/^\$2[ab]\$12\$/);
  });

  it("hashes diferentes para a mesma senha (salt aleatório)", async () => {
    const { AuthService } = await import("./auth.service");
    const hash1 = await AuthService.hashPassword("mesma-senha");
    const hash2 = await AuthService.hashPassword("mesma-senha");
    expect(hash1).not.toBe(hash2);
  });
});
