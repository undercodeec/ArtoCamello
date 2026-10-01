import express, { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import nodemailer from 'nodemailer';
import { clearAuthAttempt, consumeAuthAttempt } from './authThrottle';
import { issueAdminEmailSession } from './adminMfa';

type EmailCodeRequest = Request & { identity?: { userId: string; tenantId: string; email: string; sessionVersion: number } };
const wrap = (fn: (req: EmailCodeRequest, res: Response) => Promise<void>) => (req: EmailCodeRequest, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

function codeHash(userId: string, tenantId: string, code: string, secret: string): string {
  return createHmac('sha256', secret).update(`${userId}:${tenantId}:${code}`).digest('hex');
}

export function adminEmailCodeRouter(db: PrismaClient, secret: string) {
  const router = express.Router();
  router.use((req: EmailCodeRequest, res: Response, next: NextFunction) => { (async () => {
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

  router.post('/request', wrap(async (req, res) => {
    const identity = req.identity!;
    const ip = req.ip || '';
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) { res.status(503).json({ error: 'Configura SMTP para enviar el código de acceso' }); return; }
    const throttle = await consumeAuthAttempt(db, secret, ['admin-email-code', identity.tenantId, identity.userId, ip], 5, 15 * 60 * 1000);
    if (!throttle.allowed) { res.setHeader('Retry-After', String(throttle.retryAfterSeconds)); res.status(429).json({ error: 'Espera antes de solicitar otro código' }); return; }
    const code = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await db.adminAccessCode.upsert({
      where: { tenantId_userId: { tenantId: identity.tenantId, userId: identity.userId } },
      create: { tenantId: identity.tenantId, userId: identity.userId, codeHash: codeHash(identity.userId, identity.tenantId, code, secret), expiresAt },
      update: { codeHash: codeHash(identity.userId, identity.tenantId, code, secret), expiresAt, attempts: 0, createdAt: new Date() },
    });
    try {
      const mail = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
      await mail.sendMail({ from: process.env.SMTP_USER, to: identity.email, subject: 'Código de acceso al panel ArtoCamello', text: `Tu código de acceso al panel administrativo es: ${code}\n\nVence en 10 minutos. No lo compartas con nadie.` });
    } catch (error) {
      await db.adminAccessCode.deleteMany({ where: { tenantId: identity.tenantId, userId: identity.userId } });
      console.error('Admin email code delivery failed', error);
      res.status(502).json({ error: 'No se pudo enviar el código de acceso' }); return;
    }
    await db.auditLog.create({ data: { tenantId: identity.tenantId, actorId: identity.userId, action: 'admins.email_code.request', entityType: 'User', entityId: identity.userId, after: { expiresAt: expiresAt.toISOString() }, ip: req.ip } });
    res.json({ expiresInSeconds: CODE_TTL_MS / 1000 });
  }));

  router.post('/verify', wrap(async (req, res) => {
    const identity = req.identity!;
    const ip = req.ip || '';
    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) { res.status(400).json({ error: 'Ingresa el código de seis dígitos' }); return; }
    const record = await db.adminAccessCode.findUnique({ where: { tenantId_userId: { tenantId: identity.tenantId, userId: identity.userId } } });
    const valid = Boolean(record && record.expiresAt > new Date() && record.attempts < MAX_CODE_ATTEMPTS && timingSafeEqual(Buffer.from(record.codeHash), Buffer.from(codeHash(identity.userId, identity.tenantId, code, secret))));
    if (!valid) {
      if (record) await db.adminAccessCode.updateMany({ where: { id: record.id, attempts: { lt: MAX_CODE_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
      res.status(401).json({ error: 'Código inválido o vencido' }); return;
    }
    await db.$transaction([
      db.adminAccessCode.delete({ where: { id: record!.id } }),
      db.auditLog.create({ data: { tenantId: identity.tenantId, actorId: identity.userId, action: 'admins.email_code.verify', entityType: 'User', entityId: identity.userId, ip: req.ip } }),
    ]);
    await clearAuthAttempt(db, secret, ['admin-email-code', identity.tenantId, identity.userId, ip]);
    res.json({ adminEmailSession: issueAdminEmailSession(identity.userId, identity.tenantId, identity.sessionVersion, secret), expiresInSeconds: 1800 });
  }));
  return router;
}
