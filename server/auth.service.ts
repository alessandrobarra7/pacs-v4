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

    if (!user.password_hash) {
      throw new Error('PASSWORD_NOT_SET');
    }

    const passwordValid = await compare(password, user.password_hash);
    if (!passwordValid) {
      throw new Error('INVALID_PASSWORD');
    }

    return user;
  }

  static createSession(user: any): { token: string; payload: SessionPayload } {
    const payload: SessionPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      unitId: user.unit_id,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (SESSION_DURATION / 1000),
    };

    const token = jwt.sign(payload, JWT_SECRET);
    return { token, payload };
  }

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

  static buildSessionCookie(token: string, isProduction: boolean = false) {
    const domain = isProduction ? '.lauds.com.br' : undefined;
    const secure = isProduction;
    const sameSite = isProduction ? 'Lax' : 'Lax';

    return {
      name: 'session',
      value: token,
      options: {
        httpOnly: true,
        secure,
        sameSite,
        path: '/',
        domain,
        maxAge: SESSION_DURATION,
      },
    };
  }

  static async hashPassword(password: string): Promise<string> {
    return hash(password, 12); // Custo 12 padronizado (auditoria de segurança)
  }
}
