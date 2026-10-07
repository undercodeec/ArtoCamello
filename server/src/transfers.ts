import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Prisma, PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { leadAmount, publicBaseUrl, settingsOf, TenantSettings } from './payments';
import { TransferProvider } from './paymentProvider';
import { KushkiCardProvider, kushkiConfigFor } from './kushkiProvider';

type PayerRequest = Request & { payer?: { userId: string; tenantId: string } };
const run = promisify(execFile);
const wrap = (fn: (req: PayerRequest, res: Response) => Promise<void>) => (req: PayerRequest, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export function transferRouter(db: PrismaClient, secret: string) {
  const router = express.Router();
  router.use((req: PayerRequest, res: Response, next: NextFunction) => { (async () => {
    const token = /^Bearer (.+)$/.exec(req.header('authorization') || '')?.[1];
    if (!token) { res.status(401).end(); return; }
    let claims: jwt.JwtPayload;
    try { claims = jwt.verify(token, secret) as jwt.JwtPayload; } catch { res.status(401).end(); return; }
    const user = typeof claims.userId === 'string' ? await db.user.findUnique({ where: { id: claims.userId } }) : null;
    if (!user?.active || user.role !== 'pro' || !user.emailVerified || Number(claims.sessionVersion ?? 0) !== user.sessionVersion) { res.status(403).json({ error: 'Perfil profesional o sesión no disponible' }); return; }
    const adminMembership = await db.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: user.tenantId, userId: user.id } }, select: { status: true } });
    if (adminMembership?.status === 'active') { res.status(403).json({ error: 'Las cuentas administrativas no realizan pagos' }); return; }
    const domain = await db.tenantDomain.findUnique({ where: { hostname: req.hostname.toLowerCase() } });
    const hostTenant = ['localhost', '127.0.0.1'].includes(req.hostname.toLowerCase()) ? user.tenantId : domain?.tenantId;
    if (!hostTenant || hostTenant !== user.tenantId) { res.status(403).end(); return; }
    req.payer = { userId: user.id, tenantId: user.tenantId };
    next();
  })().catch(next); });
  router.post('/transfer-intents', wrap(async (req, res) => {
    const { userId, tenantId } = req.payer!;
    const requestId = String(req.body?.requestId || '');
    const [user, request, tenant] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, include: { professionalProfile: true } }),
      db.serviceRequest.findFirst({ where: { id: requestId, tenantId } }),
      db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    ]);
    if (!user?.professionalProfile || !request || !['matching','contact_limit_open'].includes(request.status)) { res.status(404).json({ error: 'Solicitud no disponible' }); return; }
    const settings = settingsOf(tenant.settings);
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${tenantId}:${requestId}:${userId}`}))`;
      const currentRequest = await tx.serviceRequest.findFirst({ where: { id: requestId, tenantId } });
      if (!currentRequest || !['matching', 'contact_limit_open'].includes(currentRequest.status)) return { error: 'Solicitud no disponible', statusCode: 404 };
      if (currentRequest.purchaseCount >= settings.maxProfessionalsPerLead) return { error: 'Cupo agotado', statusCode: 409 };
      const existing = await tx.leadPurchase.findUnique({ where: { requestId_professionalId: { requestId, professionalId: user.professionalProfile!.id } } });
      if (existing?.status === 'paid') return { error: 'Contacto ya comprado', statusCode: 409 };
      const active = existing ? await tx.payment.findFirst({ where: { tenantId, metadata: { path: ['leadPurchaseId'], equals: existing.id }, method: 'transfer', OR: [{ status: 'under_review' }, { status: 'awaiting_transfer', expiresAt: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' } }) : null;
      if (active) return { payment: active, created: false };
      const activeProvider = existing ? await tx.payment.findFirst({ where: { tenantId, metadata: { path: ['leadPurchaseId'], equals: existing.id }, method: { in: ['payphone', 'card'] }, OR: [{ status: 'approved' }, { status: { in: ['created', 'pending_provider'] }, expiresAt: { gt: new Date() } }] } }) : null;
      if (activeProvider) return { error: 'Ya hay un pago en proceso para este contacto', statusCode: 409 };
      if (!settings.bankAccounts.length) return { error: 'Transferencias aún no configuradas', statusCode: 503 };
      const amount = leadAmount(currentRequest.estimatedBudget, settings);
      const purchase = existing ? await tx.leadPurchase.update({ where: { id: existing.id }, data: { status: 'pending', costUSD: amount.toNumber() } }) : await tx.leadPurchase.create({ data: { tenantId, requestId, professionalId: user.professionalProfile!.id, costUSD: amount.toNumber(), status: 'pending' } });
      const reference = `AC-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
      const p = await tx.payment.create({ data: { tenantId, payerUserId: userId, amount, currency: 'USD', method: 'transfer', status: 'awaiting_transfer', reference, metadata: { leadPurchaseId: purchase.id, requestId, bankAccounts: settings.bankAccounts }, expiresAt: new Date(Date.now() + settings.transferExpiryHours * 3600000) } });
      await tx.paymentEvent.create({ data: { tenantId, paymentId: p.id, type: 'created', source: 'transfer', idempotencyKey: `created:${p.id}`, payload: {} } });
      return { payment: p, created: true };
    });
    if ('error' in result) { res.status(result.statusCode!).json({ error: result.error }); return; }
    const payment = result.payment!;
    const providerIntent = await new TransferProvider({ ...settings, bankAccounts: (payment.metadata as { bankAccounts?: TenantSettings['bankAccounts'] }).bankAccounts || settings.bankAccounts }).createIntent({ reference: payment.reference, amount: payment.amount.toString(), currency: payment.currency });
    res.status(result.created ? 201 : 200).json({ payment, bankAccounts: providerIntent.instructions });
  }));
  router.post('/card-intents', wrap(async (req, res) => {
    const { userId, tenantId } = req.payer!;
    const requestId = String(req.body?.requestId || '');
    const idempotencyKey = String(req.header('idempotency-key') || '');
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) { res.status(400).json({ error: 'Idempotency-Key requerido (16 a 128 caracteres)' }); return; }
    const [user, request, tenant] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, include: { professionalProfile: true } }),
      db.serviceRequest.findFirst({ where: { id: requestId, tenantId } }),
      db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    ]);
    const settings = settingsOf(tenant.settings);
    const config = kushkiConfigFor(tenantId);
    if (!settings.cardEnabled || !config) { res.status(503).json({ error: 'Tarjeta no habilitada para este tenant' }); return; }
    if (!user?.professionalProfile || !request || !['matching', 'contact_limit_open'].includes(request.status)) { res.status(404).json({ error: 'Solicitud no disponible' }); return; }
    if (request.purchaseCount >= settings.maxProfessionalsPerLead) { res.status(409).json({ error: 'Cupo agotado' }); return; }
    const reference = `AC-K-${crypto.createHash('sha256').update(`${tenantId}|${userId}|${idempotencyKey}`).digest('hex').slice(0, 32).toUpperCase()}`;
    const prior = await db.payment.findUnique({ where: { tenantId_reference: { tenantId, reference } } });
    if (prior) {
      if (prior.payerUserId !== userId || (prior.metadata as { requestId?: string }).requestId !== requestId) { res.status(409).json({ error: 'Clave de idempotencia ya utilizada para otra solicitud' }); return; }
      if (prior.status === 'pending_provider' && prior.expiresAt && prior.expiresAt > new Date()) { res.json({ payment: prior, checkoutUrl: (prior.metadata as { checkoutUrl?: string }).checkoutUrl }); return; }
      res.status(prior.status === 'created' ? 202 : 409).json({ payment: prior, error: prior.status === 'created' ? 'Checkout en preparación' : 'Usa una nueva clave para reintentar' }); return;
    }
    const amount = leadAmount(request.estimatedBudget, settings);
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${tenantId}:${requestId}:${userId}`}))`;
      const same = await tx.payment.findUnique({ where: { tenantId_reference: { tenantId, reference } } });
      if (same) return { existing: same };
      const purchase = await tx.leadPurchase.findUnique({ where: { requestId_professionalId: { requestId, professionalId: user.professionalProfile!.id } } });
      if (purchase?.status === 'paid') return { error: 'Contacto ya comprado' };
      const active = purchase ? await tx.payment.findFirst({ where: { tenantId, metadata: { path: ['leadPurchaseId'], equals: purchase.id }, OR: [{ status: { in: ['under_review', 'approved'] } }, { status: { in: ['created', 'awaiting_transfer', 'pending_provider'] }, expiresAt: { gt: new Date() } }] } }) : null;
      if (active) return { error: 'Ya hay un pago en proceso para este contacto' };
      const purchaseForPayment = purchase ? await tx.leadPurchase.update({ where: { id: purchase.id }, data: { status: 'pending', costUSD: amount.toNumber() } }) : await tx.leadPurchase.create({ data: { tenantId, requestId, professionalId: user.professionalProfile!.id, costUSD: amount.toNumber(), status: 'pending' } });
      const payment = await tx.payment.create({ data: { tenantId, payerUserId: userId, amount, currency: 'USD', method: 'card', status: 'created', provider: 'kushki', reference, metadata: { leadPurchaseId: purchaseForPayment.id, requestId }, expiresAt: new Date(Date.now() + 15 * 60000) } });
      await tx.paymentEvent.create({ data: { tenantId, paymentId: payment.id, type: 'created', source: 'kushki', idempotencyKey: `created:${payment.id}`, payload: {} } });
      return { payment };
    });
    if ('error' in result) { res.status(409).json({ error: result.error }); return; }
    if ('existing' in result) { const prior = result.existing!; if (prior.status === 'pending_provider' && prior.expiresAt && prior.expiresAt > new Date()) { res.json({ payment: prior, checkoutUrl: (prior.metadata as { checkoutUrl?: string }).checkoutUrl }); return; } res.status(prior.status === 'created' ? 202 : 409).json({ payment: prior, error: prior.status === 'created' ? 'Checkout en preparación' : 'Usa una nueva clave para reintentar' }); return; }
    const payment = result.payment!;
    try {
      const returnBase = await publicBaseUrl(db, tenantId, req.hostname);
      const intent = await new KushkiCardProvider(config).createIntent({ reference, amount: payment.amount.toFixed(2), currency: 'USD', requestId, responseUrl: `${returnBase}/dashboard/wallet`, payerEmail: user.email, payerName: user.fullName });
      const changed = await db.payment.updateMany({ where: { id: payment.id, status: 'created' }, data: { status: 'pending_provider', providerPaymentId: intent.providerIntentId, metadata: { leadPurchaseId: (payment.metadata as { leadPurchaseId: string }).leadPurchaseId, requestId, webcheckoutId: intent.providerIntentId, checkoutUrl: intent.checkoutUrl } } });
      const updated = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (!changed.count) { res.status(409).json({ payment: updated, error: 'El pago cambió de estado durante la creación del checkout' }); return; }
      res.status(201).json({ payment: updated, checkoutUrl: intent.checkoutUrl });
    } catch (error) {
      await db.payment.updateMany({ where: { id: payment.id, status: 'created' }, data: { status: 'failed' } });
      await db.paymentEvent.create({ data: { tenantId, paymentId: payment.id, type: 'failed', source: 'kushki', idempotencyKey: `intent-failed:${payment.id}`, payload: {} } }).catch(() => {});
      throw error;
    }
  }));
  router.post('/:id/transfer-proof', wrap(async (req, res) => {
    const { userId, tenantId } = req.payer!;
    const payment = await db.payment.findFirst({ where: { id: req.params.id, tenantId, payerUserId: userId, method: 'transfer' } });
    if (!payment) { res.status(404).end(); return; }
    if (!['awaiting_transfer','rejected'].includes(payment.status) || (payment.expiresAt && payment.expiresAt < new Date() && payment.status !== 'rejected')) { res.status(409).json({ error: 'Pago no admite comprobante' }); return; }
    const bankName = String(req.body?.bankName || '').trim().slice(0, 100);
    const transferReference = String(req.body?.transferReference || '').trim().slice(0, 100);
    const declaredAmountInput = req.body?.declaredAmount;
    if (typeof declaredAmountInput !== 'string' || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(declaredAmountInput) || new Prisma.Decimal(declaredAmountInput).lte(0)) { res.status(400).json({ error: 'Monto declarado inválido' }); return; }
    const declaredAmount = new Prisma.Decimal(declaredAmountInput);
    const accountLast4 = req.body?.accountLast4 ? String(req.body.accountLast4).trim() : null;
    const transferredAt = new Date(req.body?.transferredAt);
    if (!bankName || !transferReference || Number.isNaN(transferredAt.getTime()) || transferredAt > new Date() || (accountLast4 && !/^\d{4}$/.test(accountLast4))) { res.status(400).json({ error: 'Datos de transferencia inválidos' }); return; }
    const recent = await db.transferSubmission.count({ where: { submittedBy: userId, createdAt: { gte: new Date(Date.now() - 3600000) } } });
    if (recent >= 5) { res.status(429).json({ error: 'Demasiados comprobantes enviados' }); return; }
    const raw = String(req.body?.fileBase64 || '');
    if (raw.length > 7_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) { res.status(400).json({ error: 'Archivo inválido o demasiado grande' }); return; }
    const bytes = Buffer.from(raw, 'base64');
    if (bytes.length === 0 || bytes.length > 5_000_000) { res.status(400).json({ error: 'Máximo 5 MB' }); return; }
    const mimeType = bytes.subarray(0, 4).equals(Buffer.from('%PDF')) ? 'application/pdf' : bytes.subarray(0, 3).equals(Buffer.from([0xff,0xd8,0xff])) ? 'image/jpeg' : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : null;
    if (!mimeType) { res.status(400).json({ error: 'Solo PDF, JPG o PNG' }); return; }
    const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
    if (process.env.NODE_ENV === 'production' && !process.env.CLAMSCAN_PATH) { res.status(503).json({ error: 'Escáner de archivos no configurado' }); return; }
    const storageKey = crypto.randomUUID();
    const dir = path.join(process.cwd(), 'private-proofs');
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, storageKey);
    await writeFile(filePath, bytes, { flag: 'wx' });
    // Production requires an installed AV scanner; a failed scan blocks review.
    if (process.env.NODE_ENV === 'production' || process.env.CLAMSCAN_PATH) {
      try { await run(process.env.CLAMSCAN_PATH!, ['--no-summary', filePath]); }
      catch { await unlink(filePath).catch(() => {}); res.status(400).json({ error: 'Comprobante no superó la revisión de seguridad' }); return; }
    }
    let result;
    try { result = await db.$transaction(async tx => {
      const changed = await tx.payment.updateMany({ where: { id: payment.id, status: { in: ['awaiting_transfer','rejected'] } }, data: { status: 'under_review' } });
      if (!changed.count) return null;
      const file = await tx.storedFile.create({ data: { tenantId, storageKey, mimeType, size: bytes.length, checksum, createdBy: userId } });
      const submission = await tx.transferSubmission.create({ data: { paymentId: payment.id, bankName, declaredAmount, accountLast4, transferReference, transferredAt, proofFileId: file.id, submittedBy: userId } });
      await tx.paymentEvent.create({ data: { tenantId, paymentId: payment.id, type: 'proof_submitted', source: 'payer', idempotencyKey: `proof:${submission.id}`, payload: { checksum } } });
      return submission;
    }); } catch (error) { await unlink(filePath).catch(() => {}); throw error; }
    if (!result) { await unlink(filePath).catch(() => {}); res.status(409).json({ error: 'Estado cambió durante el envío' }); return; }
    res.status(201).json({ submissionId: result.id, status: 'under_review' });
  }));
  router.get('/mine', wrap(async (req, res) => {
    const { userId, tenantId } = req.payer!;
    const items = await db.payment.findMany({ where: { payerUserId: userId, tenantId, method: 'transfer' }, orderBy: { createdAt: 'desc' }, take: 50, include: { transfers: { select: { reviewNote: true }, orderBy: { createdAt: 'desc' }, take: 1 } } });
    res.json(items);
  }));
  router.get('/cards/mine', wrap(async (req, res) => {
    const { userId, tenantId } = req.payer!;
    const items = await db.payment.findMany({ where: { payerUserId: userId, tenantId, method: 'card' }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, reference: true, amount: true, currency: true, status: true, createdAt: true, metadata: true } });
    res.json(items);
  }));
  router.get('/methods', wrap(async (req, res) => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: req.payer!.tenantId } });
    const settings = settingsOf(tenant.settings);
    res.json({ transfer: settings.bankAccounts.length > 0, payphone: (process.env.NODE_ENV !== 'production' && process.env.PAYPHONE_MOCK === 'true') || Boolean(process.env.PAYPHONE_TOKEN && process.env.PAYPHONE_TOKEN !== 'TU_PAYPHONE_TOKEN_AQUI' && process.env.PAYPHONE_STORE_ID), card: settings.cardEnabled && Boolean(kushkiConfigFor(req.payer!.tenantId)) });
  }));
  router.get('/:id', wrap(async (req, res) => {
    const { userId, tenantId } = req.payer!;
    const payment = await db.payment.findFirst({ where: { id: req.params.id, tenantId, payerUserId: userId }, include: { transfers: { select: { reviewNote: true, reviewedAt: true }, orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!payment) { res.status(404).end(); return; }
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    res.json({ ...payment, bankAccounts: (payment.metadata as { bankAccounts?: TenantSettings['bankAccounts'] }).bankAccounts || settingsOf(tenant.settings).bankAccounts });
  }));
  router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => { console.error('Transfer API error', err); res.status(500).json({ error: 'Error interno' }); });
  return router;
}
