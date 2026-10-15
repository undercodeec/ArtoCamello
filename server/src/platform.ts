import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { settingsOf } from './payments';
import { verifyAdminEmailSession } from './adminMfa';

export function platformRouter(db: PrismaClient, secret: string) {
  const router = express.Router();
  router.use((req: Request, res: Response, next: NextFunction) => { (async () => {
    const token = /^Bearer (.+)$/.exec(req.header('authorization') || '')?.[1];
    let claims: jwt.JwtPayload;
    try { claims = jwt.verify(token || '', secret) as jwt.JwtPayload; } catch { res.status(401).end(); return; }
    const user = typeof claims.userId === 'string' ? await db.user.findUnique({ where: { id: claims.userId } }) : null;
    if (!user?.active || Number(claims.sessionVersion ?? 0) !== user.sessionVersion) { res.status(403).end(); return; }
    const membership = await db.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: 'artocamello', userId: user.id } }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
    if (!membership || membership.status !== 'active' || membership.role.code !== 'platform_owner' || !membership.role.permissions.some(p => p.permission.code === 'tenants.manage')) { res.status(403).end(); return; }
    if (!verifyAdminEmailSession(req.header('x-admin-email-session'), user.id, 'artocamello', user.sessionVersion, secret)) { res.status(403).json({ error: 'Código de acceso administrativo requerido' }); return; }
    res.locals.platformActorId = user.id;
    next();
  })().catch(next); });
  router.get('/tenants', async (_req, res, next) => { try { res.json(await db.tenant.findMany({ select: { id: true, slug: true, name: true, status: true, createdAt: true, domains: true }, orderBy: { createdAt: 'desc' } })); } catch (e) { next(e); } });
  router.post('/tenants', async (req, res, next) => { try {
    const slug = String(req.body?.slug || '').toLowerCase().trim(); const name = String(req.body?.name || '').trim(); const hostname = String(req.body?.hostname || '').toLowerCase().trim();
    if (!/^[a-z][a-z0-9-]{2,40}$/.test(slug) || name.length < 3 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(hostname)) { res.status(400).json({ error: 'Datos de tenant inválidos' }); return; }
    const roleTemplates = await db.adminRole.findMany({ where: { tenantId: 'artocamello', isSystem: true, code: { not: 'platform_owner' } }, include: { permissions: true } });
    const tenant = await db.$transaction(async tx => {
      const t = await tx.tenant.create({ data: { id: slug, slug, name, settings: settingsOf({}) } });
      await tx.tenantDomain.create({ data: { tenantId: t.id, hostname, isPrimary: true } });
      let ownerRoleId = '';
      for (const template of roleTemplates) {
        const role = await tx.adminRole.create({ data: { tenantId: t.id, code: template.code, name: template.name, isSystem: true, permissions: { create: template.permissions.map(p => ({ permissionId: p.permissionId })) } } });
        if (template.code === 'tenant_owner') ownerRoleId = role.id;
      }
      if (!ownerRoleId) throw new Error('Roles base no sembrados');
      await tx.tenantMembership.create({ data: { tenantId: t.id, userId: res.locals.platformActorId, roleId: ownerRoleId, status: 'active', acceptedAt: new Date() } });
      await tx.auditLog.create({ data: { tenantId: t.id, actorId: res.locals.platformActorId, action: 'tenants.create', entityType: 'Tenant', entityId: t.id, after: { slug, name, hostname }, ip: req.ip } });
      return t;
    });
    res.status(201).json(tenant);
  } catch (e) { next(e); } });
  router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => { console.error('Platform API error', err); res.status(500).json({ error: 'Error interno' }); });
  return router;
}
