import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure" | "maxAge"> {
  const isProduction = process.env.NODE_ENV === "production";

  // Em produção com Nginx proxy reverso, forçar secure:true
  // SameSite=None exige Secure=true (regra do browser) — usar Lax que é compatível
  // com HTTPS e não requer Secure explícito para funcionar
  const secure = isProduction ? true : isSecureRequest(req);
  const sameSite: "lax" | "strict" | "none" = "lax";

  return {
    httpOnly: true,
    path: "/",
    sameSite,
    secure,
    maxAge: 24 * 60 * 60 * 1000, // 24 horas em ms
  };
}
