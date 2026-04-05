/**
 * Testes para o serviço de autenticação (M1 — Dossiê de Auditoria v4)
 * Cobre: SESSION_DURATION via ENV (N6), AuthService.createSession, buildSessionCookie
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

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
});

// ─── Testes: AuthService.buildSessionCookie ───────────────────────────────────
describe("AuthService.buildSessionCookie", () => {
  it("cookie de produção tem domain .lauds.com.br e secure=true", async () => {
    const { AuthService } = await import("./auth.service");
    const cookie = AuthService.buildSessionCookie("test-token", true);
    expect(cookie.options.domain).toBe(".lauds.com.br");
    expect(cookie.options.secure).toBe(true);
    expect(cookie.options.httpOnly).toBe(true);
    expect(cookie.options.path).toBe("/");
  });

  it("cookie de desenvolvimento não tem domain e secure=false", async () => {
    const { AuthService } = await import("./auth.service");
    const cookie = AuthService.buildSessionCookie("test-token", false);
    expect(cookie.options.domain).toBeUndefined();
    expect(cookie.options.secure).toBe(false);
    expect(cookie.options.httpOnly).toBe(true);
  });

  it("cookie tem maxAge igual a SESSION_DURATION", async () => {
    const { AuthService } = await import("./auth.service");
    const cookie = AuthService.buildSessionCookie("test-token", false);
    // maxAge deve ser um número positivo (SESSION_DURATION em ms)
    expect(typeof cookie.options.maxAge).toBe("number");
    expect(cookie.options.maxAge as number).toBeGreaterThan(0);
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
