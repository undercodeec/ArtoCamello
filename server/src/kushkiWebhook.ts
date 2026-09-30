import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { KushkiCardProvider, kushkiConfigFor } from './kushkiProvider';
import { allocateLead, PaymentConflict } from './payments';

function reportWebhookFailure(tenantId: string, reason: string, paymentId?: string) {
  console.warn(JSON.stringify({ event: 'payment_webhook_failed', provider: 'kushki', tenantId, reason, ...(paymentId ? { paymentId } : {}), at: new Date().toISOString() }));
}

export function kushkiWebhookRouter(db: PrismaClient) {
  const router = express.Router();
  router.post('/:tenantId', express.raw({ type: 'application/json', limit: '256kb' }), async (req: Request, res: Response) => {
    const tenantId = req.params.tenantId;
    const config = kushkiConfigFor(tenantId);
    if (!config || !Buffer.isBuffer(req.body)) { res.status(404).end(); return; }
    let event;
    try {
      event = await new KushkiCardProvider(config).verifyWebhook({ body: req.body, headers: {
        'x-kushki-id': req.header('x-kushki-id'), 'x-kushki-key': req.header('x-kushki-key'), 'x-kushki-signature': req.header('x-kushki-signature'),
      } });
    } catch { reportWebhookFailure(tenantId, 'authentication'); res.status(401).json({ error: 'Notificación no autenticada' }); return; }
    try {
      const payment = await db.payment.findUnique({ where: { tenantId_reference: { tenantId, reference: event.reference } } });
      const metadata = payment?.metadata as { webcheckoutId?: string } | undefined;
      if (!payment || payment.method !== 'card' || payment.provider !== 'kushki' || payment.currency !== event.currency || payment.amount.mul(100).toNumber() !== event.amountCents || (metadata?.webcheckoutId && metadata.webcheckoutId !== event.providerIntentId)) {
        reportWebhookFailure(tenantId, 'payment_mismatch', payment?.id);
        res.status(422).json({ error: 'Pago o monto no coincide' }); return;
      }
      const key = `kushki:${tenantId}:${event.eventId}`;
      await db.paymentEvent.create({ data: { tenantId, paymentId: payment.id, type: event.status === 'approved' ? 'provider_approved' : 'provider_declined', source: 'kushki', idempotencyKey: key, payload: { status: event.status, amountCents: event.amountCents, providerIntentId: event.providerIntentId, providerPaymentId: event.providerPaymentId } } }).catch(error => { if ((error as { code?: string }).code !== 'P2002') throw error; });
      const recorded = await db.paymentEvent.findUniqueOrThrow({ where: { idempotencyKey: key } });
      const recordedPayload = recorded.payload as { amountCents?: number; providerIntentId?: string; providerPaymentId?: string };
      if (recorded.paymentId !== payment.id || recorded.type !== (event.status === 'approved' ? 'provider_approved' : 'provider_declined') || recordedPayload.amountCents !== event.amountCents || recordedPayload.providerIntentId !== event.providerIntentId || recordedPayload.providerPaymentId !== event.providerPaymentId) { reportWebhookFailure(tenantId, 'event_conflict', payment.id); res.status(409).json({ error: 'Evento de proveedor en conflicto' }); return; }
      if (event.status === 'failed') { res.json({ received: true }); return; }
      if (payment.status === 'allocated') { res.json({ received: true, alreadyProcessed: true }); return; }
      await db.payment.updateMany({ where: { id: payment.id, tenantId, status: { in: ['created', 'pending_provider', 'expired', 'failed'] } }, data: { status: 'approved', providerPaymentId: event.providerPaymentId } });
      try {
        await allocateLead(db, payment.id, tenantId, 'kushki');
      } catch (error) {
        if (!(error instanceof PaymentConflict)) throw error;
        await db.paymentEvent.create({ data: { tenantId, paymentId: payment.id, type: 'manual_resolution_required', source: 'kushki', idempotencyKey: `manual:${payment.id}`, payload: { reason: error.message } } }).catch(dbError => { if ((dbError as { code?: string }).code !== 'P2002') throw dbError; });
        reportWebhookFailure(tenantId, 'manual_resolution', payment.id);
        res.json({ received: true, manualResolutionRequired: true }); return;
      }
      res.json({ received: true });
    } catch (error) {
      reportWebhookFailure(tenantId, 'processing');
      console.error('Kushki webhook processing failed', error);
      res.status(500).json({ error: 'Error al procesar notificación' });
    }
  });
  return router;
}
