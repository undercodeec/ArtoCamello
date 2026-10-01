import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const adminMfaRequired = () => process.env.NODE_ENV === 'production' || process.env.ADMIN_MFA_REQUIRED !== 'false';
export const adminEmailCodeRequired = () => process.env.NODE_ENV === 'production' || process.env.ADMIN_EMAIL_CODE_REQUIRED !== 'false';

function encryptionKey(jwtSecret: string): Buffer {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (configured) {
    if (!/^[0-9a-fA-F]{64}$/.test(configured)) throw new Error('MFA_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales');
    return Buffer.from(configured, 'hex');
  }
  if (process.env.NODE_ENV === 'production') throw new Error('MFA_ENCRYPTION_KEY requerida en producción');
  return createHash('sha256').update(jwtSecret).digest();
}

export function validateMfaConfig(jwtSecret: string): void { encryptionKey(jwtSecret); }

export function newMfaSecret(): string {
  const bytes = randomBytes(20);
  let value = 0, bits = 0, output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits -= 5)) & 31]; }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(secret: string): Buffer {
  let value = 0, bits = 0;
  const bytes: number[] = [];
  for (const character of secret.toUpperCase().replace(/=+$/, '')) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('Secreto MFA inválido');
    value = (value << 5) | digit; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits -= 8)) & 255); }
  }
  return Buffer.from(bytes);
}

export function encryptMfaSecret(secret: string, jwtSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(jwtSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptMfaSecret(encrypted: string, jwtSecret: string): string {
  const packed = Buffer.from(encrypted, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(jwtSecret), packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8');
}

export function totp(secret: string, counter: number, digits = 6): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString().padStart(digits, '0');
}

export function matchingTotpCounter(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const counter of [current - 1, current, current + 1]) {
    const expected = Buffer.from(totp(secret, counter));
    if (timingSafeEqual(Buffer.from(code), expected)) return counter;
  }
  return null;
}

export function recoveryHash(code: string, jwtSecret: string): string {
  return createHmac('sha256', encryptionKey(jwtSecret)).update(code.trim().toUpperCase().replaceAll('-', '')).digest('hex');
}

export function issueAdminSession(userId: string, tenantId: string, version: number, jwtSecret: string): string {
  return jwt.sign({ userId, tenantId, sessionVersion: version }, jwtSecret, { audience: 'admin-mfa', expiresIn: '30m' });
}

export function verifyAdminSession(token: string | undefined, userId: string, tenantId: string, version: number, jwtSecret: string): boolean {
  try {
    const claims = jwt.verify(token || '', jwtSecret, { audience: 'admin-mfa' }) as jwt.JwtPayload;
    return claims.userId === userId && claims.tenantId === tenantId && claims.sessionVersion === version;
  } catch { return false; }
}

export function issueAdminEmailSession(userId: string, tenantId: string, version: number, jwtSecret: string): string {
  return jwt.sign({ userId, tenantId, sessionVersion: version }, jwtSecret, { audience: 'admin-email', expiresIn: '30m' });
}

export function verifyAdminEmailSession(token: string | undefined, userId: string, tenantId: string, version: number, jwtSecret: string): boolean {
  try {
    const claims = jwt.verify(token || '', jwtSecret, { audience: 'admin-email' }) as jwt.JwtPayload;
    return claims.userId === userId && claims.tenantId === tenantId && claims.sessionVersion === version;
  } catch { return false; }
}
