import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { decryptMfaSecret, encryptMfaSecret, issueAdminSession, matchingTotpCounter, newMfaSecret, recoveryHash } from './adminMfa';

type MfaRequest = Request & { identity?: { userId: string; tenantId: string; email: string; sessionVersion: number } };
const wrap = (fn: (req: MfaRequest, res: Response) => Promise<void>) => (req: MfaRequest, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export function adminMfaRouter(db: PrismaClient, secret: string) {
  const router = express.Router();
  router.use((req: MfaRequest, res: Response, next: NextFunction) => { (async () => {
    const token = /^Bearer (.+)$/.exec(req.header('authorization') || '')?.[1];
    let claims: jwt.JwtPayload;
    try { claims = jwt.verify(token || '', secret) as jwt.JwtPayload; } catch { res.status(401).end(); return; }
    const user = typeof claims.userId === 'string' ? await db.user.findUnique({ where: { id: claims.userId } }) : null;
    if (!user?.active || !user.emailVerified || Number(claims.sessionVersion ?? 0) !== user.sessionVersion) { res.status(403).end(); return; }
    const hostname = req.hostname.toLowerCase();
    const domain = await db.tenantDomain.findUnique({ where: { hostname } });
    const tenantId = ['localhost', '127.0.0.1'].includes(hostname) ? user.tenantId : domain?.tenantId;
    if (!tenantId) { res.status(404).end(); return; }
    const membership = await db.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } });
    if (membership?.status !== 'active') { res.status(403).end(); return; }
    req.identity = { userId: user.id, tenantId, email: user.email, sessionVersion: user.sessionVersion };
    next();
  })().catch(next); });

  router.get('/status', wrap(async (req, res) => {
    const user = await db.user.findUniqueOrThrow({ where: { id: req.identity!.userId } });
    res.json({ enrolled: Boolean(user.mfaSecret), lockedUntil: user.mfaLockedUntil });
  }));

  router.post('/setup', wrap(async (req, res) => {
    const identity = req.identity!;
    const user = await db.user.findUniqueOrThrow({ where: { id: identity.userId } });
    if (user.mfaSecret) { res.status(409).json({ error: 'MFA ya está configurado' }); return; }
    const value = newMfaSecret();
    await db.user.update({ where: { id: user.id }, data: { mfaPendingSecret: encryptMfaSecret(value, secret) } });
    const label = encodeURIComponent(`ArtoCamello:${identity.email}`);
    res.json({ secret: value, uri: `otpauth://totp/${label}?secret=${value}&issuer=ArtoCamello&algorithm=SHA1&digits=6&period=30` });
  }));

  router.post('/confirm', wrap(async (req, res) => {
    const identity = req.identity!;
    const user = await db.user.findUniqueOrThrow({ where: { id: identity.userId } });
    if (!user.mfaPendingSecret || user.mfaSecret) { res.status(409).json({ error: 'Inicia la configuración MFA' }); return; }
    if (!await reserveAttempt(db, user.id)) { res.status(429).json({ error: 'Espera antes de intentar de nuevo' }); return; }
    const code = String(req.body?.code || '');
    const counter = matchingTotpCounter(decryptMfaSecret(user.mfaPendingSecret, secret), code);
    if (counter === null) { await failedAttempt(db, user.id); res.status(400).json({ error: 'Código inválido' }); return; }
    const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(16).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-'));
    const changed = await db.user.updateMany({ where: { id: user.id, mfaSecret: null, mfaPendingSecret: user.mfaPendingSecret }, data: {
      mfaSecret: user.mfaPendingSecret, mfaPendingSecret: null, mfaLastCounter: BigInt(counter), mfaRecoveryHashes: recoveryCodes.map(code => recoveryHash(code, secret)), mfaFailureCount: 0, mfaLockedUntil: null,
    } });
    if (!changed.count) { res.status(409).json({ error: 'Configuración ya utilizada' }); return; }
    await db.auditLog.create({ data: { tenantId: identity.tenantId, actorId: user.id, action: 'admins.mfa.enroll', entityType: 'User', entityId: user.id, after: { enrolled: true }, ip: req.ip } });
    res.json({ recoveryCodes });
  }));

  router.post('/verify', wrap(async (req, res) => {
    const identity = req.identity!;
    const user = await db.user.findUniqueOrThrow({ where: { id: identity.userId } });
    if (!user.mfaSecret) { res.status(409).json({ error: 'Configura MFA primero' }); return; }
    if (!await reserveAttempt(db, user.id)) { res.status(429).json({ error: 'Espera antes de intentar de nuevo' }); return; }
    const code = String(req.body?.code || '').trim().toUpperCase();
    const counter = matchingTotpCounter(decryptMfaSecret(user.mfaSecret, secret), code);
    let valid = false;
    if (counter !== null) {
      const changed = await db.user.updateMany({ where: { id: user.id, mfaLastCounter: { lt: BigInt(counter) } }, data: { mfaLastCounter: BigInt(counter), mfaFailureCount: 0, mfaLockedUntil: null } });
      valid = changed.count === 1;
    } else if (/^[0-9A-F]{4}(-?[0-9A-F]{4}){7}$/.test(code)) {
      const hash = recoveryHash(code, secret);
      if (user.mfaRecoveryHashes.includes(hash)) {
        const changed = await db.user.updateMany({ where: { id: user.id, mfaRecoveryHashes: { equals: user.mfaRecoveryHashes } }, data: { mfaRecoveryHashes: user.mfaRecoveryHashes.filter(item => item !== hash), mfaFailureCount: 0, mfaLockedUntil: null } });
        valid = changed.count === 1;
        if (valid) await db.auditLog.create({ data: { tenantId: identity.tenantId, actorId: user.id, action: 'admins.mfa.recovery', entityType: 'User', entityId: user.id, after: { recoveryCodesRemaining: user.mfaRecoveryHashes.length - 1 }, ip: req.ip } });
      }
    }
    if (!valid) { await failedAttempt(db, user.id); res.status(401).json({ error: 'Código inválido o ya utilizado' }); return; }
    res.json({ adminSession: issueAdminSession(user.id, identity.tenantId, identity.sessionVersion, secret), expiresInSeconds: 1800 });
  }));
  return router;
}

async function failedAttempt(db: PrismaClient, userId: string): Promise<void> {
  await db.user.updateMany({ where: { id: userId, mfaFailureCount: { gte: 5 } }, data: { mfaLockedUntil: new Date(Date.now() + 15 * 60000) } });
}

async function reserveAttempt(db: PrismaClient, userId: string): Promise<boolean> {
  const now = new Date();
  await db.user.updateMany({ where: { id: userId, mfaLockedUntil: { lte: now } }, data: { mfaLockedUntil: null, mfaFailureCount: 0 } });
  const reserved = await db.user.updateMany({ where: { id: userId, mfaLockedUntil: null, mfaFailureCount: { lt: 5 } }, data: { mfaFailureCount: { increment: 1 } } });
  return reserved.count === 1;
}
