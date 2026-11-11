import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

export function createEmailVerificationToken(now = new Date()): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS),
  };
}

export function verifyEmailVerificationToken(token: string, tokenHash: string, expiresAt: Date, now = new Date()): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[a-f0-9]{64}$/.test(tokenHash)) return false;
  if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime()) || now.getTime() >= expiresAt.getTime()) return false;
  const actualHash = createHash('sha256').update(token).digest();
  return timingSafeEqual(actualHash, Buffer.from(tokenHash, 'hex'));
}
