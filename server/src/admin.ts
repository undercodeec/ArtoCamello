import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient, Prisma } from '@prisma/client';
import { allocateLead, PaymentConflict, settingsOf } from './payments';
import { createHmac, timingSafeEqual } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';
import { verifyAdminEmailSession } from './adminMfa';
import { KushkiCardProvider, kushkiConfigFor } from './kushkiProvider';

type Context = { tenantId: string; actorId: string; permissions: Set<string>; role: string };
type AdminRequest = Request & { admin?: Context };
type Handler = (req: AdminRequest, res: Response) => Promise<void>;
const wrap = (fn: Handler) => (req: AdminRequest, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const page = (req: Request) => { const p = Number(req.query.page); const s = Number(req.query.pageSize); const current = Number.isInteger(p) ? Math.min(10000, Math.max(1, p)) : 1; const size = Number.isInteger(s) ? Math.min(100, Math.max(1, s)) : 20; return { skip: (current - 1) * size, take: size }; };
class BadFilter extends Error {}

function adminAppBaseUrl(): string {
  const configured = process.env.ADMIN_APP_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://admin.localhost:5173');
  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.origin;
  } catch {
    throw new Error('ADMIN_APP_BASE_URL debe ser una URL HTTP(S) válida');
  }
}

export function adminRouter(db: PrismaClient, secret: string) {
  const router = express.Router();
  /* Legacy invitation-claim routes are disabled. Administrators enter with an email code.
  router.post('/invitations/claim', wrap(async (req, res) => {
    const token = String(req.body?.token || ''); const password = String(req.body?.password || '');
    if (!/^[0-9a-f]{64}$/.test(token) || password.length < 12 || password.length > 200) { res.status(400).json({ error: 'Enlace o contraseña inválidos' }); return; }
    const user = await db.user.findUnique({ where: { verificationToken: createHash('sha256').update(token).digest('hex') } });
    if (!user || user.emailVerified || !user.active) { res.status(400).json({ error: 'Invitación inválida' }); return; }
    const membership = await db.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: user.tenantId, userId: user.id } } });
    if (!membership || membership.status !== 'invited' || Date.now() - membership.invitedAt.getTime() > 7 * 86400000) { res.status(400).json({ error: 'Invitación no disponible o vencida' }); return; }
    await db.$transaction(async tx => {
      await tx.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(password, 12), emailVerified: true, verificationToken: null } });
      await tx.tenantMembership.update({ where: { id: membership.id }, data: { status: 'active', acceptedAt: new Date() } });
      await tx.auditLog.create({ data: { tenantId: membership.tenantId, actorId: user.id, action: 'admins.claim', entityType: 'TenantMembership', entityId: membership.id, before: { status: 'invited' }, after: { status: 'active' }, ip: req.ip } });
    });
    res.json({ success: true });
  }));
  router.post('/invitations/accept', wrap(async (req, res) => {
    const token = /^Bearer (.+)$/.exec(req.header('authorization') || '')?.[1];
    let claims: jwt.JwtPayload;
    try { claims = jwt.verify(token || '', secret) as jwt.JwtPayload; } catch { res.status(401).end(); return; }
    const user = typeof claims.userId === 'string' ? await db.user.findUnique({ where: { id: claims.userId } }) : null;
    if (!user?.active || !user.emailVerified || Number(claims.sessionVersion ?? 0) !== user.sessionVersion) { res.status(403).end(); return; }
    const domain = await db.tenantDomain.findUnique({ where: { hostname: req.hostname.toLowerCase() } });
    const tenantId = ['localhost', '127.0.0.1'].includes(req.hostname.toLowerCase()) ? user.tenantId : domain?.tenantId;
    if (!tenantId) { res.status(404).end(); return; }
    const membership = await db.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } });
    if (!membership || membership.status !== 'invited') { res.status(404).json({ error: 'No hay invitación pendiente' }); return; }
    await db.$transaction(async tx => {
      await tx.tenantMembership.update({ where: { id: membership.id }, data: { status: 'active', acceptedAt: new Date() } });
      await tx.auditLog.create({ data: { tenantId, actorId: user.id, action: 'admins.accept', entityType: 'TenantMembership', entityId: membership.id, before: { status: 'invited' }, after: { status: 'active' }, ip: req.ip } });
    });
    res.json({ success: true });
  }));
  router.get('/invitations/pending', wrap(async (req, res) => {
    const token = /^Bearer (.+)$/.exec(req.header('authorization') || '')?.[1];
    let claims: jwt.JwtPayload;
    try { claims = jwt.verify(token || '', secret) as jwt.JwtPayload; } catch { res.status(401).end(); return; }
    const user = typeof claims.userId === 'string' ? await db.user.findUnique({ where: { id: claims.userId } }) : null;
    if (!user?.active || !user.emailVerified || Number(claims.sessionVersion ?? 0) !== user.sessionVersion) { res.status(403).end(); return; }
    const domain = await db.tenantDomain.findUnique({ where: { hostname: req.hostname.toLowerCase() } });
    const tenantId = ['localhost', '127.0.0.1'].includes(req.hostname.toLowerCase()) ? user.tenantId : domain?.tenantId;
    if (!tenantId) { res.status(404).end(); return; }
    const membership = await db.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } });
    res.json({ pending: membership?.status === 'invited' });
  }));
  */
  router.use((req: AdminRequest, res: Response, next: NextFunction) => { (async () => {
    const token = /^Bearer (.+)$/.exec(req.header('authorization') || '')?.[1];
    if (!token) { res.status(401).json({ error: 'Sesión requerida' }); return; }
    let claims: jwt.JwtPayload;
    try { claims = jwt.verify(token, secret) as jwt.JwtPayload; }
    catch { res.status(401).json({ error: 'Sesión inválida' }); return; }
    if (typeof claims.userId !== 'string') { res.status(401).json({ error: 'Sesión inválida' }); return; }
    const user = await db.user.findUnique({ where: { id: claims.userId } });
    if (!user?.active || Number(claims.sessionVersion ?? 0) !== user.sessionVersion) { res.status(403).json({ error: 'Cuenta o sesión administrativa no disponible' }); return; }
    const hostname = req.hostname.toLowerCase();
    const domain = await db.tenantDomain.findUnique({ where: { hostname } });
    const tenantId = ['localhost', '127.0.0.1'].includes(hostname) ? user.tenantId : domain?.tenantId;
    if (!tenantId) { res.status(404).end(); return; }
    const membership = await db.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
    if (!membership || membership.status !== 'active' || membership.role.tenantId !== tenantId) { res.status(403).json({ error: 'Sin membresía activa en este tenant' }); return; }
    if (!verifyAdminEmailSession(req.header('x-admin-email-session'), user.id, tenantId, user.sessionVersion, secret)) { res.status(403).json({ error: 'Confirma el código enviado a tu correo para acceder al panel', code: 'EMAIL_CODE_REQUIRED' }); return; }
    req.admin = { tenantId, actorId: user.id, role: membership.role.code, permissions: new Set(membership.role.permissions.map(p => p.permission.code)) };
    next();
  })().catch(next); });
  const allow = (permission: string) => (req: AdminRequest, res: Response, next: NextFunction) => {
    if (!req.admin?.permissions.has(permission)) { res.status(403).json({ error: 'Permiso insuficiente' }); return; }
    next();
  };
  const audit = (ctx: Context, req: Request, action: string, entityType: string, entityId: string, before?: object, after?: object) => db.auditLog.create({ data: {
    tenantId: ctx.tenantId, actorId: ctx.actorId, action, entityType, entityId, before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue, ip: req.ip,
  }});

  router.get('/me', wrap(async (req, res) => { const c = req.admin!; res.json({ tenantId: c.tenantId, role: c.role, permissions: [...c.permissions] }); }));
  router.get('/dashboard', allow('dashboard.read'), wrap(async (req, res) => {
    const tenantId = req.admin!.tenantId;
    const [pendingTransfers, approvedPayments, newUsers, unverifiedProfessionals, recentActivity, rejectedTransfers, approvedTransfers, expiredPayments, reviewedTransfers, unresolvedCardPayments, unresolvedProviderPayments] = await Promise.all([
      db.payment.count({ where: { tenantId, method: 'transfer', status: 'under_review' } }),
      db.payment.count({ where: { tenantId, status: 'allocated' } }),
      db.user.count({ where: { tenantId, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
      db.professionalProfile.count({ where: { user: { tenantId }, verified: false } }),
      db.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      db.paymentEvent.count({ where: { tenantId, type: 'rejected', source: 'admin' } }),
      db.paymentEvent.count({ where: { tenantId, type: 'allocated', source: 'admin' } }),
      db.payment.count({ where: { tenantId, status: 'expired' } }),
      db.transferSubmission.findMany({ where: { payment: { tenantId }, reviewedAt: { not: null } }, select: { createdAt: true, reviewedAt: true }, orderBy: { createdAt: 'desc' }, take: 1000 }),
      db.payment.count({ where: { tenantId, method: 'card', status: 'approved' } }),
      db.payment.count({ where: { tenantId, method: { in: ['card', 'payphone'] }, status: 'approved' } }),
    ]);
    const averageReviewHours = reviewedTransfers.length ? reviewedTransfers.reduce((sum, transfer) => sum + (transfer.reviewedAt!.getTime() - transfer.createdAt.getTime()) / 3600000, 0) / reviewedTransfers.length : null;
    res.json({ pendingTransfers, approvedPayments, newUsers, unverifiedProfessionals, recentActivity, rejectedTransfers, approvedTransfers, expiredPayments, unresolvedCardPayments, unresolvedProviderPayments, rejectionRate: rejectedTransfers + approvedTransfers ? rejectedTransfers / (rejectedTransfers + approvedTransfers) : null, averageReviewHours });
  }));
  const paymentWhere = (req: AdminRequest): Prisma.PaymentWhereInput => {
    const q = req.query;
    const status = typeof q.status === 'string' && q.status ? q.status : undefined;
    const method = typeof q.method === 'string' && q.method ? q.method : undefined;
    const min = q.minAmount === undefined || q.minAmount === '' ? undefined : Number(q.minAmount);
    const max = q.maxAmount === undefined || q.maxAmount === '' ? undefined : Number(q.maxAmount);
    const from = typeof q.dateFrom === 'string' && q.dateFrom ? new Date(q.dateFrom) : undefined;
    const to = typeof q.dateTo === 'string' && q.dateTo ? new Date(`${q.dateTo}T23:59:59.999Z`) : undefined;
    if ((status && !['created','awaiting_transfer','under_review','approved','rejected','pending_provider','failed','expired','allocated'].includes(status)) || (method && !['transfer','payphone','card'].includes(method)) || (min !== undefined && (!Number.isFinite(min) || min < 0)) || (max !== undefined && (!Number.isFinite(max) || max < 0)) || (from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (typeof q.reference === 'string' && q.reference.length > 100) || (typeof q.bank === 'string' && q.bank.length > 100)) throw new BadFilter('Filtros inválidos');
    return { tenantId: req.admin!.tenantId,
      ...(status ? { status: status as any } : {}), ...(method ? { method: method as any } : {}),
      ...(typeof q.reference === 'string' && q.reference ? { reference: { contains: q.reference, mode: 'insensitive' } } : {}),
      ...(min !== undefined || max !== undefined ? { amount: { ...(min !== undefined ? { gte: min } : {}), ...(max !== undefined ? { lte: max } : {}) } } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(typeof q.bank === 'string' && q.bank ? { transfers: { some: { bankName: { contains: q.bank, mode: 'insensitive' } } } } : {}),
    };
  };
  router.get('/payments/transfers', allow('payments.read'), wrap(async (req, res) => {
    const where = { ...paymentWhere(req), method: 'transfer' as const };
    const [items, total] = await Promise.all([db.payment.findMany({ where, ...page(req), orderBy: { createdAt: 'desc' }, include: { payer: { select: { id: true, fullName: true, email: true } }, transfers: { orderBy: { createdAt: 'desc' }, take: 1, include: { reviewer: { select: { fullName: true } } } } } }), db.payment.count({ where })]);
    const requestIds = items.map(p => (p.metadata as { requestId?: string }).requestId).filter((id): id is string => Boolean(id));
    const requests = await db.serviceRequest.findMany({ where: { id: { in: requestIds }, tenantId: req.admin!.tenantId }, select: { id: true, title: true } });
    const titles = new Map(requests.map(r => [r.id, r.title]));
    res.json({ items: items.map(p => ({ ...p, leadTitle: titles.get((p.metadata as { requestId?: string }).requestId || '') || 'Sin solicitud' })), total });
  }));
  router.get('/payments', allow('payments.read'), wrap(async (req, res) => {
    const where = paymentWhere(req);
    const [items, total] = await Promise.all([db.payment.findMany({ where, ...page(req), orderBy: { createdAt: 'desc' }, include: { payer: { select: { id: true, fullName: true, email: true } } } }), db.payment.count({ where })]);
    res.json({ items, total });
  }));
  router.get('/payments/export.csv', allow('payments.export'), wrap(async (req, res) => {
    const rows = await db.payment.findMany({ where: paymentWhere(req), orderBy: { createdAt: 'desc' }, take: 10000 });
    const csv = ['id,fecha,referencia,metodo,estado,monto,moneda', ...rows.map(p => [p.id, p.createdAt.toISOString(), p.reference, p.method, p.status, p.amount, p.currency].map(v => `"${String(v).replaceAll('"','""')}"`).join(','))].join('\n');
    res.type('text/csv').setHeader('Content-Disposition', 'attachment; filename="pagos.csv"').send(csv);
  }));
  router.post('/payments/cards/:id/reconcile', allow('payments.review'), wrap(async (req, res) => {
    const c = req.admin!;
    const payment = await db.payment.findFirst({ where: { id: req.params.id, tenantId: c.tenantId, method: 'card', provider: 'kushki' } });
    if (!payment) { res.status(404).end(); return; }
    if (payment.status === 'allocated') { res.json({ payment, alreadyApproved: true }); return; }
    const config = kushkiConfigFor(c.tenantId);
    if (!config) { res.status(503).json({ error: 'Proveedor no configurado' }); return; }
    let provider;
    try { provider = await new KushkiCardProvider(config).getPayment(payment.reference); }
    catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : 'No se pudo consultar Kushki' }); return; }
    if (provider.status !== 'approved') { res.json({ status: provider.status, payment }); return; }
    if (provider.currency !== payment.currency || provider.amountCents !== payment.amount.mul(100).toNumber() || !provider.providerPaymentId) { res.status(409).json({ error: 'Monto, moneda o referencia no coinciden; revisa en Kushki' }); return; }
    await db.paymentEvent.create({ data: { tenantId: c.tenantId, paymentId: payment.id, type: 'provider_approved', source: 'kushki-analytics', idempotencyKey: `analytics:${payment.id}:${provider.providerPaymentId}`, payload: { amountCents: provider.amountCents, currency: provider.currency, providerPaymentId: provider.providerPaymentId } } }).catch(error => { if ((error as { code?: string }).code !== 'P2002') throw error; });
    await db.payment.updateMany({ where: { id: payment.id, tenantId: c.tenantId, status: { in: ['created', 'pending_provider', 'expired', 'failed'] } }, data: { status: 'approved', providerPaymentId: provider.providerPaymentId } });
    try { res.json({ payment: await allocateLead(db, payment.id, c.tenantId, 'kushki-analytics', c.actorId, 'Conciliado contra Kushki Analytics') }); }
    catch (error) {
      if (!(error instanceof PaymentConflict)) throw error;
      await db.paymentEvent.create({ data: { tenantId: c.tenantId, paymentId: payment.id, type: 'manual_resolution_required', source: 'kushki-analytics', idempotencyKey: `manual:${payment.id}`, payload: { reason: error.message } } }).catch(dbError => { if ((dbError as { code?: string }).code !== 'P2002') throw dbError; });
      res.status(409).json({ error: `Pago confirmado en Kushki; requiere resolución manual: ${error.message}` });
    }
  }));
  router.get('/payments/:id', allow('payments.read'), wrap(async (req, res) => {
    const item = await db.payment.findFirst({ where: { id: req.params.id, tenantId: req.admin!.tenantId }, include: {
      payer: { select: { id: true, fullName: true, email: true } }, allocations: true, events: { orderBy: { createdAt: 'desc' } }, transfers: { include: { proofFile: { select: { id: true, checksum: true, mimeType: true } }, reviewer: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } },
    }});
    if (!item) { res.status(404).json({ error: 'Pago no encontrado' }); return; }
    const transfers = item.transfers.map(t => ({ ...t, proofMimeType: t.proofFile.mimeType, proofUrl: `/api/admin/files/${t.proofFileId}?token=${signProof(t.proofFileId, req.admin!.tenantId, secret)}` }));
    const duplicates = await db.transferSubmission.count({ where: { payment: { tenantId: req.admin!.tenantId, id: { not: item.id } }, OR: [...transfers.flatMap(t => [{ transferReference: t.transferReference }, { proofFile: { checksum: t.proofFile.checksum } }]), { payment: { payerUserId: item.payerUserId, amount: item.amount } }] } });
    const requestId = (item.metadata as { requestId?: string }).requestId;
    const lead = requestId ? await db.serviceRequest.findFirst({ where: { id: requestId, tenantId: req.admin!.tenantId }, select: { id: true, title: true, status: true } }) : null;
    res.json({ ...item, transfers, lead, possibleDuplicates: duplicates, bankAccounts: (item.metadata as { bankAccounts?: unknown }).bankAccounts || settingsOf((await db.tenant.findUniqueOrThrow({ where: { id: req.admin!.tenantId } })).settings).bankAccounts });
  }));
  router.post('/payments/transfers/:id/approve', allow('payments.review'), wrap(async (req, res) => {
    const c = req.admin!;
    const p = await db.payment.findFirst({ where: { id: req.params.id, tenantId: c.tenantId, method: 'transfer' } });
    if (!p) { res.status(404).json({ error: 'Pago no encontrado' }); return; }
    if (p.status === 'allocated') { res.json({ payment: p, alreadyApproved: true }); return; }
    if (p.status !== 'under_review') { res.status(409).json({ error: 'Transferencia no pendiente de revisión' }); return; }
    const submission = await db.transferSubmission.findFirst({ where: { paymentId: p.id, reviewedAt: null }, orderBy: { createdAt: 'desc' }, select: { declaredAmount: true } });
    if (submission?.declaredAmount && !submission.declaredAmount.equals(p.amount)) { res.status(409).json({ error: 'El monto declarado no coincide con el monto del pago' }); return; }
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    if (note.length < 5) { res.status(400).json({ error: 'Indica una nota de revisión de al menos 5 caracteres' }); return; }
    try {
      const updated = await allocateLead(db, p.id, c.tenantId, 'admin', c.actorId, note);
      res.json({ payment: updated });
    } catch (error) { if (error instanceof PaymentConflict || (error as { code?: string }).code === 'P2034') { const latest = await db.payment.findFirst({ where: { id: p.id, tenantId: c.tenantId } }); if (latest?.status === 'allocated') { res.json({ payment: latest, alreadyApproved: true }); return; } res.status(409).json({ error: error instanceof Error ? error.message : 'Conflicto concurrente' }); return; } throw error; }
  }));
  router.post('/payments/transfers/:id/reject', allow('payments.review'), wrap(async (req, res) => {
    const note = String(req.body?.note || '').trim();
    if (note.length < 5 || note.length > 1000) { res.status(400).json({ error: 'Indica un motivo de al menos 5 caracteres' }); return; }
    const c = req.admin!;
    const updated = await db.$transaction(async tx => {
      const changed = await tx.payment.updateMany({ where: { id: req.params.id, tenantId: c.tenantId, method: 'transfer', status: 'under_review' }, data: { status: 'rejected' } });
      if (!changed.count) return null;
      await tx.transferSubmission.updateMany({ where: { paymentId: req.params.id, reviewedAt: null }, data: { reviewedBy: c.actorId, reviewedAt: new Date(), reviewNote: note } });
      await tx.paymentEvent.create({ data: { tenantId: c.tenantId, paymentId: req.params.id, type: 'rejected', source: 'admin', idempotencyKey: `rejected:${req.params.id}:${Date.now()}`, payload: { note } } });
      await tx.auditLog.create({ data: { tenantId: c.tenantId, actorId: c.actorId, action: 'payments.reject', entityType: 'Payment', entityId: req.params.id, before: { status: 'under_review' }, after: { status: 'rejected', note }, ip: req.ip } });
      return tx.payment.findUniqueOrThrow({ where: { id: req.params.id } });
    });
    if (!updated) { res.status(409).json({ error: 'Transferencia no pendiente de revisión' }); return; }
    res.json({ payment: updated });
  }));
  router.get('/files/:id', allow('payments.read'), wrap(async (req, res) => {
    const c = req.admin!;
    if (!verifyProof(req.params.id, c.tenantId, String(req.query.token || ''), secret)) { res.status(403).end(); return; }
    const file = await db.storedFile.findFirst({ where: { id: req.params.id, tenantId: c.tenantId } });
    if (!file) { res.status(404).end(); return; }
    const content = await readFile(path.join(process.cwd(), 'private-proofs', file.storageKey));
    res.setHeader('Content-Type', file.mimeType).setHeader('Cache-Control', 'private, no-store').send(content);
  }));
  router.get('/users', allow('users.read'), wrap(async (req, res) => {
    const tenantId = req.admin!.tenantId;
    const filters: Prisma.UserWhereInput[] = [{ tenantId }];
    if (req.query.role === 'client') {
      // Las cuentas se crean como guest y pasan a client al terminar el onboarding.
      // Deben poder gestionarse desde Clientes aunque el usuario haya abandonado ese paso.
      // Se excluyen las cuentas guest que ya son administradores activos.
      filters.push({ OR: [
        { role: 'client' },
        { role: 'guest', memberships: { none: { tenantId, status: 'active' } } },
      ] });
    } else if (req.query.role === 'pro') {
      filters.push({ role: 'pro' });
    }
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search) filters.push({ OR: [{ fullName: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] });
    const where: Prisma.UserWhereInput = { AND: filters };
    const [items, total] = await Promise.all([db.user.findMany({ where, ...page(req), orderBy: { createdAt: 'desc' }, select: { id: true, email: true, fullName: true, role: true, active: true, emailVerified: true, createdAt: true, professionalProfile: { select: { verified: true } }, _count: { select: { serviceRequests: true } } } }), db.user.count({ where })]);
    res.json({ items, total });
  }));
  router.get('/users/:id', allow('users.read'), wrap(async (req, res) => {
    const c = req.admin!;
    const user = await db.user.findFirst({ where: { id: req.params.id, tenantId: c.tenantId }, select: {
      id: true, email: true, fullName: true, phone: true, role: true, active: true, emailVerified: true, createdAt: true,
      clientProfile: { select: { addresses: true, preferredCategories: true } },
      professionalProfile: { select: { id: true, businessName: true, bio: true, categories: true, serviceZones: true, city: true, verified: true, documentType: true, ...(c.permissions.has('professionals.verify') ? { documentId: true } : {}) } },
      serviceRequests: { where: { tenantId: c.tenantId }, select: { id: true, title: true, status: true, createdAt: true }, take: 20, orderBy: { createdAt: 'desc' } },
    } });
    if (!user) { res.status(404).end(); return; }
    const membership = await db.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: c.tenantId, userId: user.id } }, select: { status: true } });
    const isAdmin = membership?.status === 'active';
    const purchases = user.role === 'pro' && !isAdmin && user.professionalProfile ? await db.leadPurchase.findMany({ where: { tenantId: c.tenantId, professionalId: user.professionalProfile.id }, select: { id: true, status: true, costUSD: true, request: { select: { title: true } } }, take: 20, orderBy: { purchasedAt: 'desc' } }) : [];
    const payments = user.role === 'pro' && !isAdmin ? await db.payment.findMany({ where: { tenantId: c.tenantId, payerUserId: user.id }, select: { id: true, amount: true, status: true, method: true, createdAt: true }, take: 20, orderBy: { createdAt: 'desc' } }) : [];
    res.json({ ...user, isAdmin, purchases, payments });
  }));
  router.patch('/users/:id/status', allow('users.manage'), wrap(async (req, res) => {
    const c = req.admin!; const active = req.body?.active; const reason = String(req.body?.reason || '').trim();
    if (typeof active !== 'boolean' || reason.length < 5) { res.status(400).json({ error: 'Estado y motivo requeridos' }); return; }
    if (req.params.id === c.actorId) { res.status(403).json({ error: 'No puedes desactivarte' }); return; }
    const before = await db.user.findFirst({ where: { id: req.params.id, tenantId: c.tenantId } });
    if (!before) { res.status(404).end(); return; }
    const protectedMembership = await db.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: c.tenantId, userId: before.id } }, include: { role: true } });
    if (protectedMembership?.status === 'active' && ['tenant_owner','platform_owner'].includes(protectedMembership.role.code) && c.role !== 'platform_owner') { res.status(403).json({ error: 'No puedes suspender al dueño del tenant' }); return; }
    const user = await db.$transaction(async tx => { const u = await tx.user.update({ where: { id: before.id }, data: { active, sessionVersion: { increment: 1 } } }); await tx.auditLog.create({ data: { tenantId: c.tenantId, actorId: c.actorId, action: 'users.status', entityType: 'User', entityId: u.id, before: { active: before.active }, after: { active, reason }, ip: req.ip } }); return u; });
    res.json({ id: user.id, active: user.active });
  }));
  router.post('/professionals/:id/verify', allow('professionals.verify'), wrap(async (req, res) => {
    const c = req.admin!; const verified = req.body?.verified;
    if (typeof verified !== 'boolean') { res.status(400).json({ error: 'verified requerido' }); return; }
    const profile = await db.professionalProfile.findFirst({ where: { userId: req.params.id, user: { tenantId: c.tenantId } } });
    if (!profile) { res.status(404).end(); return; }
    await db.$transaction(async tx => { await tx.professionalProfile.update({ where: { id: profile.id }, data: { verified } }); await tx.auditLog.create({ data: { tenantId: c.tenantId, actorId: c.actorId, action: 'professionals.verify', entityType: 'ProfessionalProfile', entityId: profile.id, before: { verified: profile.verified }, after: { verified }, ip: req.ip } }); });
    res.json({ verified });
  }));
  router.get('/memberships', allow('admins.read'), wrap(async (req, res) => { res.json(await db.tenantMembership.findMany({ where: { tenantId: req.admin!.tenantId }, include: { user: { select: { id: true, email: true, fullName: true } }, role: { select: { id: true, code: true, name: true } } }, orderBy: { invitedAt: 'desc' } })); }));
  router.post('/invitations', allow('admins.invite'), wrap(async (req, res) => {
    const c = req.admin!; const email = String(req.body?.email || '').toLowerCase().trim(); const roleId = String(req.body?.roleId || '');
    const role = await db.adminRole.findFirst({ where: { id: roleId, tenantId: c.tenantId, code: { notIn: ['tenant_owner','platform_owner'] } }, include: { permissions: { include: { permission: true } } } });
    if (!role || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.status(400).json({ error: 'Correo o rol inválidos' }); return; }
    if (role.permissions.some(p => !c.permissions.has(p.permission.code))) { res.status(403).json({ error: 'No puedes invitar con permisos que no posees' }); return; }
    let user = await db.user.findUnique({ where: { email } });
    const previous = user ? await db.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: c.tenantId, userId: user.id } } }) : null;
    if (previous?.status === 'active') { res.status(409).json({ error: 'El usuario ya es administrador' }); return; }
    if (!user) user = await db.user.create({ data: { tenantId: c.tenantId, email, fullName: String(req.body?.fullName || email.split('@')[0]).slice(0, 100), role: 'guest', emailVerified: true } });
    const membership = await db.tenantMembership.upsert({ where: { tenantId_userId: { tenantId: c.tenantId, userId: user.id } }, update: { roleId, status: 'active', invitedAt: new Date(), acceptedAt: new Date() }, create: { tenantId: c.tenantId, userId: user.id, roleId, status: 'active', acceptedAt: new Date() } });
    await audit(c, req, 'admins.invite', 'TenantMembership', membership.id, undefined, { email, role: role.code });
    const invitationBase = adminAppBaseUrl();
    let delivered = false;
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const mail = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
        await mail.sendMail({ from: process.env.SMTP_USER, to: email, subject: 'Acceso al panel ArtoCamello', text: `Tu acceso administrativo está listo. Ingresa con un código enviado a tu correo: ${invitationBase}/login` });
        delivered = true;
      } catch (error) { console.error('Invitation email failed', error); }
    }
    res.status(201).json({ ...membership, delivered });
  }));
  router.patch('/memberships/:id', allow('admins.manage'), wrap(async (req, res) => {
    const c = req.admin!; const m = await db.tenantMembership.findFirst({ where: { id: req.params.id, tenantId: c.tenantId }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
    if (!m) { res.status(404).end(); return; }
    if (m.userId === c.actorId) { res.status(403).json({ error: 'No puedes cambiar tu propia membresía' }); return; }
    if ((['tenant_owner','platform_owner'].includes(m.role.code) && c.role !== 'platform_owner') || m.role.permissions.some(p => !c.permissions.has(p.permission.code))) { res.status(403).json({ error: 'No puedes modificar esta membresía' }); return; }
    const role = req.body?.roleId ? await db.adminRole.findFirst({ where: { id: String(req.body.roleId), tenantId: c.tenantId, code: { notIn: ['tenant_owner','platform_owner'] } }, include: { permissions: { include: { permission: true } } } }) : null;
    if (req.body?.roleId && !role) { res.status(400).json({ error: 'Rol inválido' }); return; }
    if (role?.permissions.some(p => !c.permissions.has(p.permission.code))) { res.status(403).json({ error: 'No puedes conceder permisos que no posees' }); return; }
    const status = req.body?.status;
    if (status !== undefined && !['active','revoked'].includes(status)) { res.status(400).json({ error: 'Estado inválido' }); return; }
    const updated = await db.$transaction(async tx => { const u = await tx.tenantMembership.update({ where: { id: m.id }, data: { ...(role ? { roleId: role.id } : {}), ...(status ? { status } : {}) } }); await tx.user.update({ where: { id: m.userId }, data: { sessionVersion: { increment: 1 } } }); await tx.auditLog.create({ data: { tenantId: c.tenantId, actorId: c.actorId, action: 'admins.manage', entityType: 'TenantMembership', entityId: m.id, before: { roleId: m.roleId, status: m.status }, after: { roleId: u.roleId, status: u.status }, ip: req.ip } }); return u; });
    res.json(updated);
  }));
  router.get('/roles', allow('roles.read'), wrap(async (req, res) => { res.json(await db.adminRole.findMany({ where: { tenantId: req.admin!.tenantId }, include: { permissions: { include: { permission: true } } } })); }));
  router.post('/roles', allow('roles.manage'), wrap(async (req, res) => {
    const c = req.admin!; const code = String(req.body?.code || '').trim(); const name = String(req.body?.name || '').trim();
    const codes = req.body?.permissions;
    if (!/^[a-z][a-z0-9_]{2,39}$/.test(code) || name.length < 3 || name.length > 80 || !Array.isArray(codes) || codes.some(v => typeof v !== 'string' || !c.permissions.has(v))) { res.status(400).json({ error: 'Rol o permisos inválidos' }); return; }
    const permissions = await db.permission.findMany({ where: { code: { in: codes } } });
    if (permissions.length !== new Set(codes).size) { res.status(400).json({ error: 'Permiso desconocido' }); return; }
    const role = await db.$transaction(async tx => {
      const created = await tx.adminRole.create({ data: { tenantId: c.tenantId, code, name, isSystem: false } });
      if (permissions.length) await tx.rolePermission.createMany({ data: permissions.map(p => ({ roleId: created.id, permissionId: p.id })) });
      await tx.auditLog.create({ data: { tenantId: c.tenantId, actorId: c.actorId, action: 'roles.create', entityType: 'AdminRole', entityId: created.id, after: { code, permissions: codes }, ip: req.ip } });
      return created;
    });
    res.status(201).json(role);
  }));
  router.put('/roles/:id/permissions', allow('roles.manage'), wrap(async (req, res) => {
    const c = req.admin!; const role = await db.adminRole.findFirst({ where: { id: req.params.id, tenantId: c.tenantId, isSystem: false }, include: { permissions: { include: { permission: true } } } });
    if (!role) { res.status(404).json({ error: 'Rol del sistema o inexistente' }); return; }
    if (role.permissions.some(p => !c.permissions.has(p.permission.code))) { res.status(403).json({ error: 'No puedes editar un rol más privilegiado' }); return; }
    const codes = req.body?.permissions;
    if (!Array.isArray(codes) || codes.some(v => typeof v !== 'string')) { res.status(400).json({ error: 'Permisos inválidos' }); return; }
    const permissions = await db.permission.findMany({ where: { code: { in: codes } } });
    if (permissions.length !== new Set(codes).size || codes.some((code: string) => !c.permissions.has(code))) { res.status(403).json({ error: 'No puedes conceder permisos que no posees' }); return; }
    await db.$transaction(async tx => { await tx.rolePermission.deleteMany({ where: { roleId: role.id } }); await tx.rolePermission.createMany({ data: permissions.map(p => ({ roleId: role.id, permissionId: p.id })) }); const members = await tx.tenantMembership.findMany({ where: { roleId: role.id }, select: { userId: true } }); await tx.user.updateMany({ where: { id: { in: members.map(member => member.userId) } }, data: { sessionVersion: { increment: 1 } } }); await tx.auditLog.create({ data: { tenantId: c.tenantId, actorId: c.actorId, action: 'roles.permissions', entityType: 'AdminRole', entityId: role.id, after: { permissions: codes }, ip: req.ip } }); });
    res.json({ permissions: codes });
  }));
  router.get('/settings', allow('settings.read'), wrap(async (req, res) => { const tenant = await db.tenant.findUniqueOrThrow({ where: { id: req.admin!.tenantId } }); res.json({ id: tenant.id, name: tenant.name, settings: settingsOf(tenant.settings), cardConfigured: Boolean(kushkiConfigFor(tenant.id)) }); }));
  router.put('/settings', allow('settings.manage'), wrap(async (req, res) => {
    const c = req.admin!; const before = await db.tenant.findUniqueOrThrow({ where: { id: c.tenantId } }); const incoming = req.body || {};
    const current = settingsOf(before.settings);
    const max = Number(incoming.maxProfessionalsPerLead ?? current.maxProfessionalsPerLead);
    const rate = Number(incoming.leadFeeRate ?? current.leadFeeRate);
    const minimum = Number(incoming.leadMinCostUSD ?? current.leadMinCostUSD);
    const hours = Number(incoming.transferExpiryHours ?? current.transferExpiryHours);
    const cardEnabled = incoming.cardEnabled === undefined ? current.cardEnabled : incoming.cardEnabled;
    const accounts = incoming.bankAccounts === undefined ? current.bankAccounts : incoming.bankAccounts;
    if (!Number.isInteger(max) || max < 1 || max > 20 || !Number.isFinite(rate) || rate <= 0 || rate > 1 || !Number.isFinite(minimum) || minimum < 0 || minimum > 1000 || !Number.isInteger(hours) || hours < 1 || hours > 720 || typeof cardEnabled !== 'boolean' || (cardEnabled && !kushkiConfigFor(c.tenantId)) || !Array.isArray(accounts) || accounts.length > 5 || accounts.some((a: any) => typeof a.bankName !== 'string' || a.bankName.length > 100 || typeof a.accountName !== 'string' || a.accountName.length > 100 || typeof a.accountNumber !== 'string' || !/^[0-9 -]{4,32}$/.test(a.accountNumber))) { res.status(400).json({ error: 'Configuración inválida o tarjeta sin proveedor configurado' }); return; }
    const settings = { ...current, maxProfessionalsPerLead: max, leadFeeRate: rate, leadMinCostUSD: minimum, transferExpiryHours: hours, cardEnabled, bankAccounts: accounts };
    await db.$transaction(async tx => { await tx.tenant.update({ where: { id: c.tenantId }, data: { settings } }); await tx.auditLog.create({ data: { tenantId: c.tenantId, actorId: c.actorId, action: 'settings.manage', entityType: 'Tenant', entityId: c.tenantId, before: { maxProfessionalsPerLead: current.maxProfessionalsPerLead, leadFeeRate: current.leadFeeRate, leadMinCostUSD: current.leadMinCostUSD, transferExpiryHours: current.transferExpiryHours, cardEnabled: current.cardEnabled, bankAccountCount: current.bankAccounts.length }, after: { maxProfessionalsPerLead: max, leadFeeRate: rate, leadMinCostUSD: minimum, transferExpiryHours: hours, cardEnabled, bankAccountCount: accounts.length }, ip: req.ip } }); });
    res.json({ settings });
  }));
  router.get('/audit-logs', allow('audit.read'), wrap(async (req, res) => {
    const q = req.query;
    const from = typeof q.dateFrom === 'string' && q.dateFrom ? new Date(q.dateFrom) : undefined;
    const to = typeof q.dateTo === 'string' && q.dateTo ? new Date(`${q.dateTo}T23:59:59.999Z`) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || ['action','actorId','entityType','entityId'].some(key => typeof q[key] === 'string' && (q[key] as string).length > 100)) throw new BadFilter('Filtros inválidos');
    const where: Prisma.AuditLogWhereInput = { tenantId: req.admin!.tenantId,
      ...(typeof q.action === 'string' && q.action ? { action: { contains: q.action, mode: 'insensitive' } } : {}),
      ...(typeof q.actorId === 'string' && q.actorId ? { actorId: q.actorId } : {}),
      ...(typeof q.entityType === 'string' && q.entityType ? { entityType: { contains: q.entityType, mode: 'insensitive' } } : {}),
      ...(typeof q.entityId === 'string' && q.entityId ? { entityId: q.entityId } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
    const [items,total] = await Promise.all([db.auditLog.findMany({ where, ...page(req), orderBy: { createdAt: 'desc' } }), db.auditLog.count({ where })]);
    res.json({ items,total });
  }));
  router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => { if (err instanceof BadFilter) { res.status(400).json({ error: err.message }); return; } console.error('Admin API error', err); res.status(500).json({ error: 'Error interno' }); });
  return router;
}

function signProof(id: string, tenant: string, secret: string) {
  const expires = Math.floor(Date.now() / 1000) + 300;
  return `${expires}.${createHmac('sha256', secret).update(`${id}:${tenant}:${expires}`).digest('hex')}`;
}
function verifyProof(id: string, tenant: string, token: string, secret: string) {
  const [expires, signature] = token.split('.');
  if (!expires || !signature || Number(expires) < Date.now() / 1000) return false;
  const expected = createHmac('sha256', secret).update(`${id}:${tenant}:${expires}`).digest('hex');
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
