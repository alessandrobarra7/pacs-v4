import { describe, expect, it } from "vitest";
import { getLoginErrorMessage } from "./loginErrorMessage";

describe("getLoginErrorMessage", () => {
  it("orienta o usuário quando a conta ainda não possui senha", () => {
    expect(getLoginErrorMessage(new Error("PASSWORD_NOT_SET"))).toBe(
      "Este usuário não possui senha definida. Solicite ao administrador que defina uma senha para sua conta.",
    );
  });

  it("não expõe detalhes internos para erros não mapeados", () => {
    expect(getLoginErrorMessage(new Error("INTERNAL_DATABASE_DETAIL"))).toBe("Erro ao fazer login");
  });
});
