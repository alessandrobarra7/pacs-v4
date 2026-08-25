export function getLoginErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : "";

  if (errorMessage === "USER_NOT_FOUND" || errorMessage === "INVALID_PASSWORD") {
    return "Credenciais inválidas";
  }
  if (errorMessage === "USER_INACTIVE") {
    return "Usuário inativo";
  }
  if (errorMessage === "ACCOUNT_EXPIRED") {
    return "Conta expirada. Entre em contato com o administrador.";
  }
  if (errorMessage === "PASSWORD_NOT_SET") {
    return "Este usuário não possui senha definida. Solicite ao administrador que defina uma senha para sua conta.";
  }

  return "Erro ao fazer login";
}
