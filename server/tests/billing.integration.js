const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const sent = [];
require('nodemailer').createTransport = () => ({ sendMail: async mail => { sent.push(mail); return { accepted: [mail.to, mail.cc].filter(Boolean) }; } });
const { app, prisma } = require('../dist/index.js');
const { allocateLead } = require('../dist/payments.js');
const { sendTransferReceipt } = require('../dist/transferReceipt.js');

test('billing persists per professional and tenant; receipt PDF and mail preserve allocation snapshot', async () => {
  const key = crypto.randomUUID().replaceAll('-', '');
  const tenantId = `billing-${key}`;
  const host = `${tenantId}.example.test`;
  const payerId = `payer-${key}`;
  const clientId = `client-${key}`;
  const otherId = `other-${key}`;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = userId => jwt.sign({ userId, sessionVersion: 0 }, process.env.JWT_SECRET || 'super-secret-jwt-key-change-me');
  const call = (route, userId, method = 'GET', body) => new Promise((resolve, reject) => {
    const req = http.request(`${base}${route}`, { method, headers: { Host: host, Authorization: `Bearer ${token(userId)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => { const raw = Buffer.concat(chunks); resolve({ status: res.statusCode, body: res.headers['content-type']?.includes('application/pdf') ? raw : JSON.parse(raw.toString() || '{}'), headers: res.headers }); });
    });
    req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
  });
  try {
    await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: tenantId } });
    await prisma.tenantDomain.create({ data: { tenantId, hostname: host, isPrimary: true } });
    await prisma.user.createMany({ data: [
      { id: payerId, tenantId, role: 'pro', fullName: 'Profesional', email: `${payerId}@example.test`, emailVerified: true },
      { id: clientId, tenantId, role: 'client', fullName: 'Cliente', email: `${clientId}@example.test`, emailVerified: true },
      { id: otherId, tenantId, role: 'pro', fullName: 'Otro', email: `${otherId}@example.test`, emailVerified: true },
    ] });
    const profile = await prisma.professionalProfile.create({ data: { tenantId, userId: payerId, bio: '', categories: ['fontaneria'], serviceZones: ['Quito'], verified: true } });
    await prisma.professionalProfile.create({ data: { tenantId, userId: otherId, bio: '', categories: ['fontaneria'], serviceZones: ['Quito'], verified: true } });
    const details = { idType: 'ruc', idNumber: '1712345678001', legalName: 'Empresa original', address: 'Quito centro', email: 'billing@example.test', phone: '0991234567' };
    assert.equal((await call('/api/billing/profile', payerId)).body, null);
    assert.equal((await call('/api/billing/profile', clientId, 'PUT', details)).status, 403);
    assert.equal((await call('/api/billing/profile', payerId, 'PUT', { ...details, idNumber: 'x' })).status, 400);
    const saved = await call('/api/billing/profile', payerId, 'PUT', details);
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body, details);
    assert.deepEqual((await call('/api/billing/profile', payerId)).body, details);
    assert.equal((await call('/api/billing/profile', otherId)).body, null);
    const request = await prisma.serviceRequest.create({ data: { tenantId, clientId, visibility: 'marketplace', categorySlug: 'fontaneria', title: 'Título privado', description: 'Privado', city: 'Quito', location: 'Calle privada', urgency: 'medium', contactEmail: 'cliente@example.test', contactPhone: '0999999999', estimatedBudget: 50, status: 'contact_limit_open' } });
    const purchase = await prisma.leadPurchase.create({ data: { tenantId, requestId: request.id, professionalId: profile.id, costUSD: 3, status: 'pending' } });
    const payment = await prisma.payment.create({ data: { tenantId, payerUserId: payerId, amount: 3, currency: 'USD', method: 'transfer', status: 'under_review', reference: `AC-${key}`, metadata: { leadPurchaseId: purchase.id, requestId: request.id } } });
    assert.equal((await call(`/api/payments/${payment.id}/receipt`, payerId)).status, 404);
    await allocateLead(prisma, payment.id, tenantId, 'test-billing');
    const allocation = await prisma.paymentAllocation.findUniqueOrThrow({ where: { paymentId: payment.id } });
    assert.equal(allocation.billingSnapshot.legalName, 'Empresa original');
    assert.equal((await call('/api/billing/profile', payerId, 'PUT', { ...details, legalName: 'Empresa nueva', email: 'new@example.test' })).status, 200);
    const pdf = await call(`/api/payments/${payment.id}/receipt`, payerId);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
    assert.match(pdf.headers['content-disposition'], /attachment; filename="recibo-/);
    assert.equal((await call(`/api/payments/${payment.id}/receipt`, otherId)).status, 404);
    assert.equal((await call(`/api/payments/${payment.id}/receipt`, clientId)).status, 403);
    await sendTransferReceipt(prisma, tenantId, payment.id);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, `${payerId}@example.test`);
    assert.equal(sent[0].cc, 'billing@example.test');
    assert.match(sent[0].text, /Empresa original/);
    assert.ok(!sent[0].text.includes('Empresa nueva'));
    assert.ok(!sent[0].text.includes('Título privado'));
    assert.match(sent[0].text, new RegExp(`${host}/dashboard/wallet\\?receipt=`));
    assert.equal(sent[0].attachments[1].content.subarray(0, 4).toString(), '%PDF');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await prisma.notificationOutbox.deleteMany({ where: { tenantId } });
    await prisma.paymentEvent.deleteMany({ where: { tenantId } });
    await prisma.paymentAllocation.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.leadPurchase.deleteMany({ where: { tenantId } });
    await prisma.serviceRequest.deleteMany({ where: { tenantId } });
    await prisma.billingProfile.deleteMany({ where: { tenantId } });
    await prisma.professionalProfile.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenantDomain.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
});
