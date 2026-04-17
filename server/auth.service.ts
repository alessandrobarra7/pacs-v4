import { compare, hash } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { getDb, getUserByUsernameOrEmail, getUserById } from './db';
import { users } from '../drizzle/schema';
import { ENV } from './_core/env';

// Falha imediatamente se JWT_SECRET não estiver definido em produção
function getJwtSecret(): string {
  const secret = ENV.cookieSecret;
  if (!secret || secret.trim() === '') {
    if (ENV.isProduction) {
      throw new Error('[FATAL] JWT_SECRET não está definido. Defina JWT_SECRET no arquivo .env antes de iniciar o servidor em produção.');
    }
    console.warn('[WARN] JWT_SECRET não definido. Usando chave temporária APENAS para desenvolvimento. NUNCA use em produção.');
    return 'dev-only-insecure-key-not-for-production';
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();
// Bug fix N6: SESSION_DURATION agora lido de ENV.sessionDurationHours (padrão: 24h)
// Para alterar: defina SESSION_DURATION_HOURS=8 no .env da VM1
const SESSION_DURATION = ENV.sessionDurationHours * 60 * 60 * 1000;

export interface SessionPayload {
  userId: number;
  username: string;
  role: string;
  unitId: number | null;
  iat: number;
  exp: number;
}

export interface AuthResponse {
  id: number;
  username: string;
  name: string;
  role: string;
  unitId: number | null;
  email: string;
}

export class AuthService {
  static async validateCredentials(username: string, password: string) {
    const user = await getUserByUsernameOrEmail(username);

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    if (!user.isActive) {
      throw new Error('USER_INACTIVE');
    }

    // F2-2: Verificar se a conta expirou
    // O campo expiration_date é string 'YYYY-MM-DD' (tipo DATE do MySQL via Drizzle)
    if (user.expiration_date) {
      // Compara apenas a data (sem hora) para evitar problemas de timezone
      const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
      const rawExp = user.expiration_date as unknown;
      const expDate = typeof rawExp === 'string'
        ? (rawExp as string).slice(0, 10)
        : new Date(rawExp as Date).toISOString().slice(0, 10);
      if (expDate < today) {
        throw new Error('ACCOUNT_EXPIRED');
      }
    }

    if (!user.password_hash) {
      throw new Error('PASSWORD_NOT_SET');
    }

    const passwordValid = await compare(password, user.password_hash);
    if (!passwordValid) {
      throw new Error('INVALID_PASSWORD');
    }

    return user;
  }

  // PRG-01: createSession removido — código morto (não chamado em nenhum lugar)
  // PRG-01: buildSessionCookie removido — código morto (não chamado em nenhum lugar)
  // A criação de sessão e cookie é feita diretamente em server/routers.ts (procedure auth.login)

  static async verifySession(token: string): Promise<SessionPayload> {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as SessionPayload;
      return payload;
    } catch (error) {
      throw new Error('INVALID_SESSION');
    }
  }

  static sanitizeUser(user: any): AuthResponse {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      unitId: user.unit_id,
      email: user.email,
    };
  }

  static async hashPassword(password: string): Promise<string> {
    return hash(password, 12); // Custo 12 padronizado (auditoria de segurança)
  }
}
