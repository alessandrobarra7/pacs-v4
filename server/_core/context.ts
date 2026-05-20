import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookie } from "cookie";
import { jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, getUserByUsernameOrEmail } from "../db";
import { ENV } from "./env";
import { COOKIE_NAME } from "@shared/const";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // 1. Ler cookie da requisição
    const cookies = parseCookie(opts.req.headers.cookie ?? "");
    const token = cookies[COOKIE_NAME];

    if (token) {
      // 2. Verificar JWT com a mesma chave usada em signSession
      //    (jose library — mesma usada pelo SDK internamente)
      const secretKey = new TextEncoder().encode(ENV.cookieSecret);
      const { payload } = await jwtVerify(token, secretKey, {
        algorithms: ["HS256"],
      });
      const openId = payload.openId as string | undefined;

      if (openId) {
        // 3a. Usuários OAuth: openId real no banco
        const found = await getUserByOpenId(openId);
        if (found) {
          user = found;
        }
        // 3b. Usuários locais: openId = 'local:<username>' (fallback do auth.ts)
        else if (openId.startsWith("local:")) {
          const username = openId.slice(6); // remove prefixo 'local:'
          const localUser = await getUserByUsernameOrEmail(username);
          if (localUser) user = localUser;
        }
      }
    }
  } catch {
    // Token inválido, expirado ou ausente — user fica null (anônimo)
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
