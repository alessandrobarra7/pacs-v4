export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/** A aplicação usa somente autenticação local por usuário e senha. */
export const getLoginUrl = (): string => "/login";
