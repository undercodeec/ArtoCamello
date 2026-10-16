import express, { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import nodemailer from 'nodemailer';
import { clearAuthAttempt, consumeAuthAttempt } from './authThrottle';
import { issueAdminEmailSession } from './adminMfa';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

function codeHash(userId: string, tenantId: string, code: string, secret: string): string {
  return createHmac('sha256', secret).update(`${userId}:${tenantId}:${code}`).digest('hex');
}

async function adminIdentity(db: PrismaClient, hostname: string, email: string, secret?: string, authorization?: string): Promise<{ user: User; tenantId: string } | null> {
  let user: User | null = null;
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail) {
    user = await db.user.findUnique({ where: { email: normalizedEmail } });
  } else if (secret) {
    try {
      const token = /^Bearer (.+)$/.exec(authorization || '')?.[1];
      const claims = jwt.verify(token || '', secret) as jwt.JwtPayload;
      if (typeof claims.userId !== 'string') return null;
      user = await db.user.findUnique({ where: { id: claims.userId } });
      if (!user || Number(claims.sessionVersion ?? -1) !== user.sessionVersion) return null;
    } catch { return null; }
  }
  if (!user?.active) return null;
  const normalizedHost = hostname.toLowerCase();
  const domain = await db.tenantDomain.findUnique({ where: { hostname: normalizedHost } });
  const tenantId = ['localhost', '127.0.0.1'].includes(normalizedHost) ? user.tenantId : domain?.tenantId;
  if (!tenantId) return null;
  const membership = await db.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } });
  return membership?.status === 'active' ? { user, tenantId } : null;
}

function safeUser(user: User) {
  const { password: _, verificationToken: __, mfaSecret: ___, mfaPendingSecret: ____, mfaRecoveryHashes: _____, mfaLastCounter: ______, mfaFailureCount: _______, mfaLockedUntil: ________, ...safe } = user;
  return safe;
}

export function adminEmailCodeRouter(db: PrismaClient, secret: string) {
  const router = express.Router();

  router.post('/auth/login', wrap(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 1 || password.length > 1024) {
      res.status(400).json({ error: 'Ingresa un correo y una contraseña válidos' }); return;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const [ipLimit, accountLimit] = await Promise.all([
      consumeAuthAttempt(db, secret, ['admin-login-ip', ip], 80, 15 * 60 * 1000),
      consumeAuthAttempt(db, secret, ['admin-login-account-ip', ip, email], 8, 15 * 60 * 1000),
    ]);
    if (!ipLimit.allowed || !accountLimit.allowed) {
      res.setHeader('Retry-After', String(Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds)));
      res.status(429).json({ error: 'Demasiados intentos. Espera antes de volver a iniciar sesión' }); return;
    }

    const identity = await adminIdentity(db, req.hostname, email);
    const passwordMatches = Boolean(identity?.user.password) && await bcrypt.compare(password, identity!.user.password!);
    if (!identity || !passwordMatches) { res.status(401).json({ error: 'Credenciales inválidas' }); return; }

    await clearAuthAttempt(db, secret, ['admin-login-account-ip', ip, email]);
    await db.auditLog.create({ data: { tenantId: identity.tenantId, actorId: identity.user.id, action: 'admins.password_login', entityType: 'User', entityId: identity.user.id, ip: req.ip } });
    const token = jwt.sign({ userId: identity.user.id, role: identity.user.role, email: identity.user.email, sessionVersion: identity.user.sessionVersion }, secret, { expiresIn: '30m' });
    res.json({ user: safeUser(identity.user), token, expiresInSeconds: 1800 });
  }));

  router.post('/access-code/request', wrap(async (req, res) => {
    const identity = await adminIdentity(db, req.hostname, typeof req.body?.email === 'string' ? req.body.email : '', secret, req.header('authorization'));
    // This neutral response prevents administrator-email discovery.
    if (!identity) { res.json({ expiresInSeconds: CODE_TTL_MS }); return; }
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) { res.status(503).json({ error: 'Configura SMTP para enviar el código de acceso' }); return; }
    const ip = req.ip || '';
    const throttle = await consumeAuthAttempt(db, secret, ['admin-email-code', identity.tenantId, identity.user.id, ip], 5, 15 * 60 * 1000);
    if (!throttle.allowed) { res.setHeader('Retry-After', String(throttle.retryAfterSeconds)); res.status(429).json({ error: 'Espera antes de solicitar otro código' }); return; }
    const code = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await db.adminAccessCode.upsert({
      where: { tenantId_userId: { tenantId: identity.tenantId, userId: identity.user.id } },
      create: { tenantId: identity.tenantId, userId: identity.user.id, codeHash: codeHash(identity.user.id, identity.tenantId, code, secret), expiresAt },
      update: { codeHash: codeHash(identity.user.id, identity.tenantId, code, secret), expiresAt, attempts: 0, createdAt: new Date() },
    });
    try {
      const mail = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
      await mail.sendMail({ from: process.env.SMTP_USER, to: identity.user.email, subject: 'Código de acceso al panel ArtoCamello', text: `Tu código de acceso al panel administrativo es: ${code}\n\nVence en 10 minutos. No lo compartas con nadie.` });
    } catch (error) {
      await db.adminAccessCode.deleteMany({ where: { tenantId: identity.tenantId, userId: identity.user.id } });
      console.error('Admin email code delivery failed', error);
      res.status(502).json({ error: 'No se pudo enviar el código de acceso' }); return;
    }
    await db.auditLog.create({ data: { tenantId: identity.tenantId, actorId: identity.user.id, action: 'admins.email_code.request', entityType: 'User', entityId: identity.user.id, after: { expiresAt: expiresAt.toISOString() }, ip: req.ip } });
    res.json({ expiresInSeconds: CODE_TTL_MS });
  }));

  router.post('/access-code/verify', wrap(async (req, res) => {
    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) { res.status(400).json({ error: 'Ingresa el código de seis dígitos' }); return; }
    const identity = await adminIdentity(db, req.hostname, typeof req.body?.email === 'string' ? req.body.email : '', secret, req.header('authorization'));
    if (!identity) { res.status(401).json({ error: 'Código inválido o vencido' }); return; }
    const record = await db.adminAccessCode.findUnique({ where: { tenantId_userId: { tenantId: identity.tenantId, userId: identity.user.id } } });
    const expected = record ? Buffer.from(codeHash(identity.user.id, identity.tenantId, code, secret)) : null;
    const valid = Boolean(record && expected && record.expiresAt > new Date() && record.attempts < MAX_CODE_ATTEMPTS && expected.length === Buffer.byteLength(record.codeHash) && timingSafeEqual(Buffer.from(record.codeHash), expected));
    if (!valid) {
      if (record) await db.adminAccessCode.updateMany({ where: { id: record.id, attempts: { lt: MAX_CODE_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
      res.status(401).json({ error: 'Código inválido o vencido' }); return;
    }
    await db.$transaction([
      db.adminAccessCode.delete({ where: { id: record!.id } }),
      db.auditLog.create({ data: { tenantId: identity.tenantId, actorId: identity.user.id, action: 'admins.email_code.verify', entityType: 'User', entityId: identity.user.id, ip: req.ip } }),
    ]);
    await clearAuthAttempt(db, secret, ['admin-email-code', identity.tenantId, identity.user.id, req.ip || '']);
    const token = jwt.sign({ userId: identity.user.id, role: identity.user.role, email: identity.user.email, sessionVersion: identity.user.sessionVersion }, secret, { expiresIn: '30m' });
    res.json({ user: safeUser(identity.user), token, adminEmailSession: issueAdminEmailSession(identity.user.id, identity.tenantId, identity.user.sessionVersion, secret), expiresInSeconds: 1800 });
  }));

  return router;
}
