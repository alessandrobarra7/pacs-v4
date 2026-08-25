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
      // 2. Verificar JWT com a mesma chave usada em signSession local.
      const secretKey = new TextEncoder().encode(ENV.cookieSecret);
      const { payload } = await jwtVerify(token, secretKey, {
        algorithms: ["HS256"],
      });
      const openId = payload.openId as string | undefined;

      if (openId) {
        // 3a. Usuários já vinculados por openId no banco.
        const found = await getUserByOpenId(openId);
        if (found) {
          user = found;
        }
        // 3b. Usuários locais: openId = 'local:<username>'.
        else if (openId.startsWith("local:")) {
          const username = openId.slice(6); // remove prefixo 'local:'
          const localUser = await getUserByUsernameOrEmail(username);
          if (localUser) user = localUser;
        }
      }

      // Revalidação em tempo real: se o usuário foi desativado ou expirou, invalidar sessão imediatamente
      if (user) {
        if (user.isActive === false) {
          user = null;
        } else if (user.expiration_date) {
          const expDate = new Date(user.expiration_date);
          if (!isNaN(expDate.getTime()) && expDate.getTime() <= Date.now()) {
            user = null;
          }
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
