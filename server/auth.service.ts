import { compare, hash } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { getDb, getUserByUsernameOrEmail, getUserById } from './db';
import { users } from '../drizzle/schema';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const SESSION_DURATION = 24 * 60 * 60 * 1000;

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
    return hash(password, 10);
  }
}
