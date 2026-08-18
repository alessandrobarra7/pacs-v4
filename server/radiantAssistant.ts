import crypto from "crypto";

export const RADIANT_ASSISTANT_SCHEME = "pacs-radiant";

export type RadiantAssistantToken = {
  studyUid: string;
  userId: number;
  expiresAt: number;
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function createRadiantAssistantTokenStore(options: {
  ttlMs?: number;
  now?: () => number;
  makeToken?: () => string;
} = {}) {
  const ttlMs = options.ttlMs ?? 10 * 60 * 1000;
  const now = options.now ?? Date.now;
  const makeToken = options.makeToken ?? (() => crypto.randomBytes(32).toString("base64url"));
  const entries = new Map<string, RadiantAssistantToken>();

  const prune = () => {
    const timestamp = now();
    entries.forEach((entry, token) => {
      if (entry.expiresAt <= timestamp) entries.delete(token);
    });
  };

  return {
    issue(input: { studyUid: string; userId: number }) {
      prune();
      let token = makeToken();
      while (entries.has(token)) token = makeToken();
      const entry: RadiantAssistantToken = {
        studyUid: input.studyUid,
        userId: input.userId,
        expiresAt: now() + ttlMs,
      };
      entries.set(token, entry);
      return { token, expiresAt: entry.expiresAt };
    },
    consume(token: string): RadiantAssistantToken | null {
      if (!TOKEN_PATTERN.test(token)) return null;
      const entry = entries.get(token);
      if (!entry || entry.expiresAt <= now()) {
        entries.delete(token);
        return null;
      }
      entries.delete(token);
      return entry;
    },
    prune,
    size() {
      return entries.size;
    },
  };
}
