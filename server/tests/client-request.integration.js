const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { app, prisma } = require('../dist/index.js');
const { allocateLead } = require('../dist/payments.js');

test('a client request appears in client history and matching professional inbox', async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const tenantId = `client-request-${suffix}`;
  const hostname = `${tenantId}.example.test`;
  const clientId = `client-${suffix}`;
  const professionalId = `pro-${suffix}`;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: tenantId, settings: {
      bankAccounts: [{ bankName: 'Banco de prueba', accountName: 'Titular de prueba', accountNumber: '12345678', accountType: 'Ahorros', accountHolderId: '1104326853' }],
    } } });
    await prisma.tenantDomain.create({ data: { tenantId, hostname, isPrimary: true } });
    await prisma.user.createMany({ data: [
      { id: clientId, tenantId, email: `${clientId}@example.test`, fullName: 'Cliente de prueba', role: 'client', emailVerified: true },
      { id: professionalId, tenantId, email: `${professionalId}@example.test`, fullName: 'Profesional de prueba', role: 'pro', emailVerified: true },
    ] });
    await prisma.professionalProfile.create({ data: {
      tenantId, userId: professionalId, bio: 'Fontanería', categories: ['fontaneria'], serviceZones: ['Quito'], verified: true,
    } });
    const secret = process.env.JWT_SECRET || 'super-secret-jwt-key-change-me';
    const clientToken = jwt.sign({ userId: clientId, sessionVersion: 0 }, secret);
    const professionalToken = jwt.sign({ userId: professionalId, sessionVersion: 0 }, secret);
    const request = (route, method, token, body) => new Promise((resolve, reject) => {
      const req = http.request(`${base}${route}`, { method, headers: {
        Host: hostname, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      } }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
    const payload = {
      categorySlug: 'fontaneria', title: 'Solicitud de Fontanería',
      description: 'Reparar una gotera', location: 'Calle 1, Quito',
      urgency: 'medium', contactName: 'Contacto privado', contactPhone: '+593 999 999 999',
      contactEmail: `${clientId}@example.test`, estimatedBudget: 50,
    };

    const created = await request('/api/requests', 'POST', clientToken, payload);
    assert.equal(created.status, 201, created.body);
    const saved = JSON.parse(created.body);
    assert.equal(saved.categorySlug, payload.categorySlug);
    assert.equal(saved.location, payload.location);
    assert.equal(Number(saved.estimatedBudget), payload.estimatedBudget);
    assert.equal(saved.contactName, payload.contactName);

    const listed = await request('/api/requests/client', 'GET', clientToken);
    assert.equal(listed.status, 200);
    assert.ok(JSON.parse(listed.body).some(item => item.id === saved.id));

    const available = await request('/api/requests/available', 'GET', professionalToken);
    assert.equal(available.status, 200, available.body);
    const visibleRequest = JSON.parse(available.body).find(item => item.id === saved.id);
    assert.ok(visibleRequest);
    assert.equal(visibleRequest.contactName, undefined);
    assert.equal(visibleRequest.contactPhone, undefined);
    assert.equal(visibleRequest.contactEmail, undefined);

    const locked = await request('/api/leads/unlocked', 'GET', professionalToken);
    assert.equal(locked.status, 200, locked.body);
    assert.ok(!JSON.parse(locked.body).some(item => item.purchase.requestId === saved.id));

    const intent = await request('/api/payments/transfer-intents', 'POST', professionalToken, { requestId: saved.id });
    assert.equal(intent.status, 201, intent.body);
    const { payment, bankAccounts } = JSON.parse(intent.body);
    assert.equal(payment.status, 'awaiting_transfer');
    assert.equal(bankAccounts[0].accountNumber, '12345678');
    assert.equal(bankAccounts[0].accountHolderId, '1104326853');

    const stillLocked = await request('/api/leads/unlocked', 'GET', professionalToken);
    assert.equal(stillLocked.status, 200, stillLocked.body);
    assert.ok(!JSON.parse(stillLocked.body).some(item => item.purchase.requestId === saved.id));
    await assert.rejects(allocateLead(prisma, payment.id, tenantId, 'premature-validation'), /Estado de pago no aprobable/);

    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'under_review' } });
    await allocateLead(prisma, payment.id, tenantId, 'test-validation');
    const unlocked = await request('/api/leads/unlocked', 'GET', professionalToken);
    assert.equal(unlocked.status, 200, unlocked.body);
    const contact = JSON.parse(unlocked.body).find(item => item.purchase.requestId === saved.id);
    assert.ok(contact);
    assert.equal(contact.clientName, payload.contactName);
    assert.equal(contact.clientPhone, payload.contactPhone);

    const invalid = await request('/api/requests', 'POST', clientToken, { ...payload, estimatedBudget: 0 });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await prisma.paymentEvent.deleteMany({ where: { tenantId } });
    await prisma.paymentAllocation.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.leadPurchase.deleteMany({ where: { tenantId } });
    await prisma.serviceRequest.deleteMany({ where: { tenantId } });
    await prisma.clientProfile.deleteMany({ where: { user: { tenantId } } });
    await prisma.professionalProfile.deleteMany({ where: { user: { tenantId } } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenantDomain.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
});
