import { NotificationOutbox, Prisma, PrismaClient } from '@prisma/client';
import { notifyDirectRequest, notifyNewQuote, notifyRejectedTransfer } from './userNotifications';
import { sendTransferReceipt } from './transferReceipt';
import { notifyTransferReviewRecipient } from './transferNotifications';

type NotificationKind = 'direct_request' | 'new_quote' | 'transfer_rejected' | 'transfer_receipt' | 'transfer_review';

/** Enqueue inside the same transaction as the state change. No rendered mail or token is stored. */
export async function enqueueNotification(tx: Prisma.TransactionClient, item: {
  tenantId: string; kind: NotificationKind; subjectId: string; recipientUserId: string; hostname: string; eventKey: string;
}) {
  await tx.notificationOutbox.create({ data: item });
}

async function deliver(db: PrismaClient, item: NotificationOutbox) {
  if (item.kind === 'direct_request') {
    const request = await db.serviceRequest.findFirst({ where: { id: item.subjectId, tenantId: item.tenantId, visibility: 'direct', targetProfessionalUserId: item.recipientUserId, status: { in: ['matching', 'contact_limit_open', 'contact_limit_reached', 'quotes_received'] } }, select: { id: true } });
    return request ? notifyDirectRequest(db, item.tenantId, item.recipientUserId, item.hostname) : false;
  } else if (item.kind === 'new_quote') {
    const quote = await db.quote.findFirst({ where: { id: item.subjectId, tenantId: item.tenantId, request: { clientId: item.recipientUserId } }, select: { id: true } });
    return quote ? notifyNewQuote(db, item.tenantId, item.recipientUserId, item.hostname) : false;
  } else if (item.kind === 'transfer_rejected') {
    const payment = await db.payment.findFirst({ where: { id: item.subjectId, tenantId: item.tenantId, payerUserId: item.recipientUserId, method: 'transfer', status: 'rejected' }, select: { reference: true } });
    return payment ? notifyRejectedTransfer(db, item.tenantId, item.recipientUserId, payment.reference, item.hostname) : false;
  } else if (item.kind === 'transfer_receipt') {
    return sendTransferReceipt(db, item.tenantId, item.subjectId);
  } else if (item.kind === 'transfer_review') {
    const payment = await db.payment.findFirst({ where: { id: item.subjectId, tenantId: item.tenantId, method: 'transfer', status: 'under_review' }, select: { reference: true } });
    return payment ? notifyTransferReviewRecipient(db, item.tenantId, item.recipientUserId, payment.reference) : false;
  } else {
    throw new Error('Unknown notification kind');
  }
}

/** Lease-based, at-least-once delivery. Retried mails may be duplicated after an SMTP timeout. */
export async function processNotificationOutbox(db: PrismaClient, eventKey?: string): Promise<void> {
  const now = new Date();
  const candidates = await db.notificationOutbox.findMany({ where: {
    status: 'pending', nextAttemptAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    ...(eventKey ? { eventKey } : {}),
  }, orderBy: { nextAttemptAt: 'asc' }, take: eventKey ? 1 : 25 });
  for (const item of candidates) {
    const lease = new Date(Date.now() + 5 * 60_000);
    const claimed = await db.notificationOutbox.updateMany({ where: {
      id: item.id, status: 'pending', nextAttemptAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    }, data: { lockedUntil: lease, attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    try {
      const delivered = await deliver(db, item);
      await db.notificationOutbox.updateMany({ where: { id: item.id, status: 'pending', lockedUntil: lease }, data: { status: delivered ? 'sent' : 'skipped', sentAt: delivered ? new Date() : null, lockedUntil: null } });
    } catch (error) {
      const attempts = item.attempts + 1;
      const retryInMs = Math.min(6 * 3600_000, 60_000 * 2 ** (attempts - 1));
      await db.notificationOutbox.updateMany({ where: { id: item.id, status: 'pending', lockedUntil: lease }, data: {
        status: attempts >= 8 ? 'failed' : 'pending', nextAttemptAt: new Date(Date.now() + retryInMs), lockedUntil: null,
      } });
      console.error('Notification delivery failed', { eventKey: item.eventKey, attempts, code: (error as { code?: string }).code || 'SMTP_OR_LOOKUP' });
    }
  }
}
