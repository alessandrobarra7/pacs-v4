import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const loginPage = readFileSync(resolve(process.cwd(), "client/src/pages/Login.tsx"), "utf8");

describe("layout móvel da página de login", () => {
  it("permite rolagem vertical e não fixa o conteúdo em uma altura que sobreponha o rodapé", () => {
    expect(loginPage).toContain("min-h-[100dvh]");
    expect(loginPage).toContain("overflow-x-hidden");
    expect(loginPage).not.toContain("h-[100dvh] w-full flex-col overflow-hidden");
  });

  it("mantém marca, formulário e suporte em blocos verticais independentes", () => {
    expect(loginPage).toContain('className="relative z-10 mt-6"');
    expect(loginPage).toContain('className="relative z-10 mt-6 shrink-0 space-y-3 text-xs leading-tight text-slate-400"');
    expect(loginPage).toContain("Vendas: 98 98484-0224 WhatsApp");
    expect(loginPage).toContain("Desenvolvimento");
    expect(loginPage).not.toContain("h-[100dvh] w-full flex-col overflow-hidden");
  });

  it("não duplica o aviso de ambiente seguro dentro do rodapé móvel", () => {
    const mobileSection = loginPage.slice(loginPage.indexOf('className="relative flex min-h-[100dvh]'), loginPage.indexOf('className="login-desktop-shell'));
    expect((mobileSection.match(/Ambiente seguro e criptografado/g) ?? []).length).toBe(1);
  });
});
