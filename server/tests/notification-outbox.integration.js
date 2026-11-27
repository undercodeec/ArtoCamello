const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const messages = [];
let failNext = false;
require('nodemailer').createTransport = () => ({ sendMail: async message => {
  if (failNext) { failNext = false; throw Object.assign(new Error('Temporary SMTP error'), { code: 'ESOCKET' }); }
  messages.push(message);
  return { accepted: [message.to] };
} });
const { enqueueNotification, processNotificationOutbox } = require('../dist/notificationOutbox.js');

test('transactional outbox retries SMTP errors, deduplicates concurrent workers and checks preferences', async () => {
  const db = new PrismaClient();
  const suffix = crypto.randomUUID();
  const tenantId = `mail-${suffix}`;
  const clientId = `client-${suffix}`;
  const proId = `pro-${suffix}`;
  const host = `${tenantId}.example.test`;
  try {
    await db.tenant.create({ data: { id: tenantId, name: 'Mail test', slug: tenantId } });
    await db.tenantDomain.create({ data: { tenantId, hostname: host, isPrimary: true } });
    await db.user.createMany({ data: [
      { id: clientId, tenantId, role: 'client', email: `${clientId}@example.test`, fullName: 'Client', emailVerified: true },
      { id: proId, tenantId, role: 'pro', email: `${proId}@example.test`, fullName: 'Pro', emailVerified: true },
    ] });
    const profile = await db.professionalProfile.create({ data: { tenantId, userId: proId, verified: true, bio: '', categories: ['fontaneria'] } });
    const request = await db.serviceRequest.create({ data: { tenantId, clientId, visibility: 'direct', targetProfessionalUserId: proId, categorySlug: 'fontaneria', title: 'Private title', description: 'Private description', city: 'Quito', location: 'Private address', contactPhone: '0999999999', contactEmail: 'private@example.test', status: 'matching', estimatedBudget: 100 } });
    const item = { tenantId, kind: 'direct_request', subjectId: request.id, recipientUserId: proId, hostname: host, eventKey: `test-direct:${suffix}` };
    await assert.rejects(db.$transaction(async tx => { await enqueueNotification(tx, item); throw new Error('rollback'); }));
    assert.equal(await db.notificationOutbox.count({ where: { tenantId } }), 0);
    await db.$transaction(tx => enqueueNotification(tx, item));
    const queued = await db.notificationOutbox.findUniqueOrThrow({ where: { eventKey: item.eventKey } });
    assert.equal(JSON.stringify(queued).includes('Private address'), false);
    failNext = true;
    await processNotificationOutbox(db, item.eventKey);
    const failedAttempt = await db.notificationOutbox.findUniqueOrThrow({ where: { eventKey: item.eventKey } });
    assert.equal(failedAttempt.status, 'pending');
    assert.equal(failedAttempt.attempts, 1);
    assert.ok(failedAttempt.nextAttemptAt > new Date());
    await db.notificationOutbox.update({ where: { id: queued.id }, data: { nextAttemptAt: new Date(0) } });
    await Promise.all([processNotificationOutbox(db, item.eventKey), processNotificationOutbox(db, item.eventKey)]);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, `${proId}@example.test`);
    const sent = await db.notificationOutbox.findUniqueOrThrow({ where: { id: queued.id } });
    assert.equal(sent.status, 'sent');
    assert.equal(sent.attempts, 2);
    await db.notificationPreference.create({ data: { tenantId, userId: proId, key: 'notif-new-jobs', enabled: false } });
    const second = await db.serviceRequest.create({ data: { tenantId, clientId, visibility: 'direct', targetProfessionalUserId: proId, categorySlug: 'fontaneria', title: 'Second private title', description: 'Private description', city: 'Quito', location: 'Private address', contactPhone: '0999999999', contactEmail: 'private@example.test', status: 'matching', estimatedBudget: 100 } });
    await db.$transaction(tx => enqueueNotification(tx, { ...item, subjectId: second.id, eventKey: `test-second:${suffix}` }));
    await processNotificationOutbox(db, `test-second:${suffix}`);
    assert.equal(messages.length, 1);
    assert.equal((await db.notificationOutbox.findUniqueOrThrow({ where: { eventKey: `test-second:${suffix}` } })).status, 'skipped');
    const purchase = await db.leadPurchase.create({ data: { tenantId, requestId: request.id, professionalId: profile.id, status: 'paid', costUSD: 6 } });
    const payment = await db.payment.create({ data: { tenantId, payerUserId: proId, amount: 6, method: 'transfer', status: 'allocated', reference: `receipt-${suffix}`, confirmedAt: new Date() } });
    await db.paymentAllocation.create({ data: { tenantId, paymentId: payment.id, leadPurchaseId: purchase.id, subjectId: purchase.id, amount: 6 } });
    const receiptKey = `test-receipt:${suffix}`;
    await db.$transaction(tx => enqueueNotification(tx, { tenantId, kind: 'transfer_receipt', subjectId: payment.id, recipientUserId: proId, hostname: host, eventKey: receiptKey }));
    await processNotificationOutbox(db, receiptKey);
    assert.equal(messages.length, 2);
    assert.equal(messages[1].to, `${proId}@example.test`);
    assert.ok(messages[1].html.includes('Recibo de pago'));
    assert.equal((await db.notificationOutbox.findUniqueOrThrow({ where: { eventKey: receiptKey } })).status, 'sent');
    await processNotificationOutbox(db, receiptKey);
    assert.equal(messages.length, 2, 'An accepted outbox receipt is not sent twice on subsequent polls');
  } finally {
    await db.paymentAllocation.deleteMany({ where: { tenantId } });
    await db.payment.deleteMany({ where: { tenantId } });
    await db.leadPurchase.deleteMany({ where: { tenantId } });
    await db.notificationPreference.deleteMany({ where: { tenantId } });
    await db.serviceRequest.deleteMany({ where: { tenantId } });
    await db.professionalProfile.deleteMany({ where: { tenantId } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenantDomain.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { id: tenantId } });
    await db.$disconnect();
  }
});
