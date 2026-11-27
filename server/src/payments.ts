import { Prisma, PrismaClient } from '@prisma/client';
import { canProfessionalAccessRequest, isPurchasableRequest, purchaseLimitForRequest } from './requestPolicy';

export type TenantSettings = {
  maxProfessionalsPerLead: number;
  leadFeeRate: number;
  leadMinCostUSD: number;
  currency: string;
  transferExpiryHours: number;
  cardEnabled: boolean;
  bankAccounts: Array<{ bankName: string; accountName: string; accountNumber: string; accountType?: string; accountHolderId?: string }>;
};

export function settingsOf(value: unknown): TenantSettings {
  const s = (value || {}) as Partial<TenantSettings>;
  return {
    maxProfessionalsPerLead: Number(s.maxProfessionalsPerLead ?? 4),
    leadFeeRate: Number(s.leadFeeRate ?? 0.06),
    leadMinCostUSD: Number(s.leadMinCostUSD ?? 3),
    currency: 'USD',
    transferExpiryHours: Number(s.transferExpiryHours ?? 72),
    cardEnabled: s.cardEnabled === true,
    bankAccounts: Array.isArray(s.bankAccounts) ? s.bankAccounts : [],
  };
}

export function leadAmount(budget: number, settings: TenantSettings): Prisma.Decimal {
  const amount = Math.max(budget * settings.leadFeeRate, settings.leadMinCostUSD);
  return new Prisma.Decimal(amount.toFixed(2));
}

export async function publicBaseUrl(db: PrismaClient, tenantId: string, hostname: string): Promise<string> {
  if (['localhost', '127.0.0.1'].includes(hostname.toLowerCase())) return process.env.APP_BASE_URL || 'http://localhost:5173';
  const primary = await db.tenantDomain.findFirst({ where: { tenantId, isPrimary: true }, select: { hostname: true } });
  return `https://${primary?.hostname || hostname}`;
}

export class PaymentConflict extends Error {}

/** Must run while holding the request advisory lock used by payment creation. */
export async function hasUnresolvedRequestPayment(tx: Prisma.TransactionClient, tenantId: string, requestId: string): Promise<boolean> {
  const purchases = await tx.leadPurchase.findMany({ where: { tenantId, requestId }, select: { id: true } });
  const active = await tx.payment.findFirst({ where: {
    tenantId,
    OR: [
      { metadata: { path: ['requestId'], equals: requestId } },
      ...purchases.map(purchase => ({ metadata: { path: ['leadPurchaseId'], equals: purchase.id } })),
    ],
    AND: [{ OR: [
      { status: { in: ['under_review', 'approved'] } },
      { status: { in: ['created', 'awaiting_transfer', 'pending_provider'] }, expiresAt: { gt: new Date() } },
    ] }],
  }, select: { id: true } });
  return Boolean(active);
}

export async function expirePendingPayments(db: PrismaClient) {
  const candidates = await db.payment.findMany({ where: { status: { in: ['created', 'awaiting_transfer', 'pending_provider'] }, expiresAt: { lt: new Date() } }, select: { id: true, tenantId: true }, take: 200 });
  for (const payment of candidates) await db.$transaction(async tx => {
    const changed = await tx.payment.updateMany({ where: { id: payment.id, status: { in: ['created', 'awaiting_transfer', 'pending_provider'] }, expiresAt: { lt: new Date() } }, data: { status: 'expired' } });
    if (changed.count) await tx.paymentEvent.create({ data: { tenantId: payment.tenantId, paymentId: payment.id, type: 'expired', source: 'system', idempotencyKey: `expired:${payment.id}`, payload: {} } });
  });
  return candidates.length;
}

/** The purchase status and request slot change in one serializable transaction. */
export async function allocateLead(db: PrismaClient, paymentId: string, tenantId: string, source: string, actorId?: string, reviewNote?: string) {
  return db.$transaction(async tx => {
    const payment = await tx.payment.findFirst({ where: { id: paymentId, tenantId }, include: { allocations: true } });
    if (!payment) throw new PaymentConflict('Pago no encontrado');
    if (payment.status === 'allocated' && payment.allocations.length) return payment;
    if (payment.method === 'transfer' ? payment.status !== 'under_review' : payment.status !== 'approved') throw new PaymentConflict('Estado de pago no aprobable');
    const purchaseId = (payment.metadata as { leadPurchaseId?: string }).leadPurchaseId;
    const purchase = purchaseId ? await tx.leadPurchase.findFirst({ where: { id: purchaseId, tenantId } }) : null;
    if (!purchase || purchase.status === 'paid') throw new PaymentConflict('Compra no disponible');
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const request = await tx.serviceRequest.findFirst({ where: { id: purchase.requestId, tenantId } });
    const professional = await tx.professionalProfile.findUnique({ where: { id: purchase.professionalId }, include: { user: true } });
    if (!request || !professional || !professional.user.active || !professional.user.emailVerified || !professional.verified
      || !canProfessionalAccessRequest(request, professional.userId, professional.categories, tenantId)
      || !isPurchasableRequest(request.status)) throw new PaymentConflict('Solicitud no disponible');
    const limit = purchaseLimitForRequest(request, settingsOf(tenant.settings));
    const slot = await tx.serviceRequest.updateMany({
      where: { id: request.id, tenantId, purchaseCount: { lt: limit }, status: { in: ['matching', 'contact_limit_open'] } },
      data: { purchaseCount: { increment: 1 } },
    });
    if (slot.count !== 1) throw new PaymentConflict('Cupo de profesionales agotado');
    await tx.leadPurchase.update({ where: { id: purchase.id }, data: { status: 'paid', paidAt: new Date(), ...(payment.method === 'payphone' ? { payphoneClientTxId: payment.reference, payphoneTransactionId: payment.providerPaymentId } : {}) } });
    await tx.paymentAllocation.create({ data: {
      tenantId, paymentId, leadPurchaseId: purchase.id, subjectId: purchase.id,
      amount: payment.amount,
    }});
    await tx.payment.update({ where: { id: paymentId }, data: { status: 'allocated', confirmedAt: new Date() } });
    const updatedRequest = await tx.serviceRequest.findUniqueOrThrow({ where: { id: request.id } });
    if (updatedRequest.purchaseCount >= limit) await tx.serviceRequest.update({ where: { id: request.id }, data: { status: 'contact_limit_reached' } });
    await tx.paymentEvent.create({ data: { tenantId, paymentId, type: 'allocated', source, idempotencyKey: `allocated:${paymentId}`, payload: reviewNote ? { note: reviewNote } : {} } });
    if (payment.method === 'transfer') await tx.notificationOutbox.create({ data: {
      tenantId, eventKey: `transfer-receipt:${paymentId}`, kind: 'transfer_receipt', subjectId: paymentId,
      recipientUserId: payment.payerUserId, hostname: 'localhost',
    } });
    if (actorId && payment.method === 'transfer') await tx.transferSubmission.updateMany({ where: { paymentId, reviewedAt: null }, data: { reviewedBy: actorId, reviewedAt: new Date(), reviewNote } });
    if (actorId) await tx.auditLog.create({ data: {
      tenantId, actorId, action: 'payments.approve', entityType: 'Payment', entityId: paymentId,
      before: { status: payment.status }, after: { status: 'allocated', leadPurchaseId: purchase.id, reviewNote },
    }});
    return tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { allocations: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
