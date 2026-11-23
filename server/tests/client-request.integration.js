const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const jwt = require('jsonwebtoken');
process.env.RECAPTCHA_SECRET_KEY = 'test-secret';
const { app, prisma } = require('../dist/index.js');
const { allocateLead } = require('../dist/payments.js');

test('a client request appears in client history and matching professional inbox', async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const tenantId = `client-request-${suffix}`;
  const hostname = `${tenantId}.example.test`;
  const clientId = `client-${suffix}`;
  const professionalId = `pro-${suffix}`;
  const uncategorizedId = `uncategorized-${suffix}`;
  const otherProfessionalId = `other-pro-${suffix}`;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const originalFetch = global.fetch;
  let captchaAccepted = true;
  global.fetch = (url, options) => String(url) === 'https://www.google.com/recaptcha/api/siteverify'
    ? Promise.resolve({ ok: true, json: async () => ({ success: captchaAccepted, hostname, challenge_ts: new Date().toISOString() }) })
    : originalFetch(url, options);

  try {
    await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: tenantId, settings: {
      bankAccounts: [{ bankName: 'Banco de prueba', accountName: 'Titular de prueba', accountNumber: '12345678', accountType: 'Ahorros', accountHolderId: '1104326853' }],
    } } });
    await prisma.tenantDomain.create({ data: { tenantId, hostname, isPrimary: true } });
    await prisma.user.createMany({ data: [
      { id: clientId, tenantId, email: `${clientId}@example.test`, fullName: 'Cliente de prueba', role: 'client', emailVerified: true },
      { id: professionalId, tenantId, email: `${professionalId}@example.test`, fullName: 'Profesional de prueba', role: 'pro', emailVerified: true },
      { id: uncategorizedId, tenantId, email: `${uncategorizedId}@example.test`, fullName: 'Profesional sin servicios', role: 'pro', emailVerified: true },
      { id: otherProfessionalId, tenantId, email: `${otherProfessionalId}@example.test`, fullName: 'Otro profesional', role: 'pro', emailVerified: true },
    ] });
    await prisma.professionalProfile.create({ data: {
      tenantId, userId: professionalId, bio: 'Fontanería', categories: ['Fontaneros'], serviceZones: ['Quito'], verified: true,
    } });
    await prisma.professionalProfile.create({ data: {
      tenantId, userId: uncategorizedId, bio: 'Reparaciones', categories: [], serviceZones: ['Quito'], verified: true,
    } });
    await prisma.professionalProfile.create({ data: {
      tenantId, userId: otherProfessionalId, bio: 'Fontanería', categories: ['fontaneria'], serviceZones: ['Quito'], verified: true,
    } });
    const secret = process.env.JWT_SECRET || 'super-secret-jwt-key-change-me';
    const clientToken = jwt.sign({ userId: clientId, sessionVersion: 0 }, secret);
    const professionalToken = jwt.sign({ userId: professionalId, sessionVersion: 0 }, secret);
    const uncategorizedToken = jwt.sign({ userId: uncategorizedId, sessionVersion: 0 }, secret);
    const otherProfessionalToken = jwt.sign({ userId: otherProfessionalId, sessionVersion: 0 }, secret);
    const request = (route, method, token, body, headers = {}) => new Promise((resolve, reject) => {
      const req = http.request(`${base}${route}`, { method, headers: {
        Host: hostname, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers,
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
      visibility: 'marketplace', captchaToken: 'valid', city: 'Quito, Calle privada 9, 0999999999', categorySlug: 'fontaneria', title: 'Solicitud de Fontanería',
      description: 'Reparar una gotera', location: 'Calle 1, Quito',
      urgency: 'medium', contactName: 'Contacto privado', contactPhone: '+593 999 999 999',
      contactEmail: `${clientId}@example.test`, estimatedBudget: 50,
    };

    const created = await request('/api/requests', 'POST', clientToken, { ...payload, captchaToken: undefined });
    assert.equal(created.status, 201, created.body);
    const saved = JSON.parse(created.body);
    assert.equal(saved.categorySlug, payload.categorySlug);
    assert.equal(saved.location, payload.location);
    assert.equal(Number(saved.estimatedBudget), payload.estimatedBudget);
    assert.equal(saved.contactName, payload.contactName);
    assert.equal(saved.visibility, 'marketplace');
    assert.equal(saved.city, payload.city);

    const listed = await request('/api/requests/client', 'GET', clientToken);
    assert.equal(listed.status, 200);
    assert.ok(JSON.parse(listed.body).some(item => item.id === saved.id));

    const available = await request('/api/requests/available', 'GET', professionalToken);
    assert.equal(available.status, 200, available.body);
    const visibleRequest = JSON.parse(available.body).find(item => item.id === saved.id);
    assert.ok(visibleRequest);
    assert.equal(visibleRequest.estimatedBudget, 50);
    assert.equal(visibleRequest.contactName, undefined);
    assert.equal(visibleRequest.contactPhone, undefined);
    assert.equal(visibleRequest.contactEmail, undefined);
    assert.equal(visibleRequest.location, undefined);
    assert.equal(visibleRequest.description, undefined);
    assert.equal(visibleRequest.title, 'Servicio de fontaneria');
    assert.equal(visibleRequest.city, null);
    assert.ok(!JSON.stringify(visibleRequest).includes('Calle privada'));

    const noCategories = await request('/api/requests/available', 'GET', uncategorizedToken);
    assert.equal(noCategories.status, 200, noCategories.body);
    assert.deepEqual(JSON.parse(noCategories.body), []);
    const publicProfiles = await request('/api/professionals', 'GET', professionalToken);
    assert.equal(publicProfiles.status, 200, publicProfiles.body);
    assert.ok(JSON.parse(publicProfiles.body).some(item => item.id === professionalId));
    assert.ok(!JSON.parse(publicProfiles.body).some(item => item.id === uncategorizedId));
    assert.equal((await request('/api/payments/transfer-intents', 'POST', uncategorizedToken, { requestId: saved.id })).status, 403);
    assert.equal((await request('/api/leads/pay', 'POST', uncategorizedToken, { requestId: saved.id })).status, 403);
    assert.equal((await request('/api/profile', 'PUT', professionalToken, { categories: [] })).status, 400);
    const normalizedProfile = await request('/api/profile', 'PUT', professionalToken, { categories: ['Fontaneros', 'Fontanería'] });
    assert.equal(normalizedProfile.status, 200, normalizedProfile.body);
    assert.deepEqual(JSON.parse(normalizedProfile.body).profile.categories, ['fontaneria']);

    const locked = await request('/api/leads/unlocked', 'GET', professionalToken);
    assert.equal(locked.status, 200, locked.body);
    assert.ok(!JSON.parse(locked.body).some(item => item.purchase.requestId === saved.id));

    const intent = await request('/api/payments/transfer-intents', 'POST', professionalToken, { requestId: saved.id });
    assert.equal(intent.status, 201, intent.body);
    const { payment, bankAccounts } = JSON.parse(intent.body);
    assert.equal(payment.status, 'awaiting_transfer');
    assert.equal((await request(`/api/requests/${saved.id}`, 'PATCH', clientToken, { title: 'Cambio durante pago' })).status, 409);
    const ownedDuringPayment = JSON.parse((await request('/api/requests/client', 'GET', clientToken)).body).find(item => item.id === saved.id);
    assert.equal(ownedDuringPayment.canEdit, false);
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

    captchaAccepted = false;
    const direct = await request('/api/requests', 'POST', clientToken, { ...payload, captchaToken: undefined, title: 'Mi dirección Calle 99', description: 'Llámame al 0999999999', visibility: 'direct', targetProfessionalUserId: professionalId });
    assert.equal(direct.status, 201, direct.body);
    captchaAccepted = true;
    const directId = JSON.parse(direct.body).id;
    const ownAvailable = JSON.parse((await request('/api/requests/available', 'GET', professionalToken)).body);
    const otherAvailable = JSON.parse((await request('/api/requests/available', 'GET', otherProfessionalToken)).body);
    assert.ok(ownAvailable.some(item => item.id === directId));
    assert.equal(ownAvailable.find(item => item.id === directId).estimatedBudget, 50);
    assert.ok(!otherAvailable.some(item => item.id === directId));
    assert.ok(!JSON.stringify(ownAvailable).includes('Calle 99'));
    assert.ok(!JSON.stringify(ownAvailable).includes('0999999999'));
    assert.equal((await request('/api/payments/transfer-intents', 'POST', otherProfessionalToken, { requestId: directId })).status, 403);
    assert.equal((await request('/api/leads/pay', 'POST', otherProfessionalToken, { requestId: directId })).status, 403);
    assert.equal((await request('/api/payments/card-intents', 'POST', otherProfessionalToken, { requestId: directId }, { 'Idempotency-Key': crypto.randomUUID() })).status, 403);
    assert.equal((await request('/api/requests', 'POST', clientToken, { ...payload, categorySlug: 'categoria-falsa' })).status, 400);
    assert.equal((await request('/api/requests', 'POST', clientToken, { ...payload, targetProfessionalUserId: professionalId })).status, 400);
    assert.equal((await request('/api/requests', 'POST', clientToken, { ...payload, captchaToken: undefined, visibility: 'direct', targetProfessionalUserId: 'missing-professional' })).status, 404);
    const directIntent = await request('/api/payments/transfer-intents', 'POST', professionalToken, { requestId: directId });
    assert.equal(directIntent.status, 201, directIntent.body);
    const directPayment = JSON.parse(directIntent.body).payment;
    await prisma.payment.update({ where: { id: directPayment.id }, data: { status: 'under_review' } });
    const allocatedDirect = await allocateLead(prisma, directPayment.id, tenantId, 'test-direct');
    assert.equal(allocatedDirect.status, 'allocated');
    const repeatedDirect = await allocateLead(prisma, directPayment.id, tenantId, 'test-direct-repeat');
    assert.equal(repeatedDirect.status, 'allocated');
    assert.equal((await prisma.serviceRequest.findUniqueOrThrow({ where: { id: directId } })).purchaseCount, 1);
    assert.equal((await request('/api/payments/transfer-intents', 'POST', professionalToken, { requestId: directId })).status, 404);
    const quoteResponse = await request('/api/quotes', 'POST', professionalToken, { requestId: directId, message: 'Puedo hacerlo', estimatedPrice: 45 });
    assert.equal(quoteResponse.status, 200, quoteResponse.body);
    const quoteId = JSON.parse(quoteResponse.body).id;
    assert.equal((await request(`/api/quotes/${quoteId}/accept`, 'POST', clientToken)).status, 200);
    assert.equal((await request(`/api/quotes/${quoteId}/accept`, 'POST', clientToken)).status, 409);
    assert.equal((await request('/api/quotes', 'POST', professionalToken, { requestId: directId, message: 'Precio nuevo', estimatedPrice: 46 })).status, 409);
    assert.equal((await request(`/api/requests/${directId}/complete`, 'POST', clientToken)).status, 200);
    assert.equal((await request(`/api/requests/${directId}/cancel`, 'POST', clientToken)).status, 409);

    const quarantine = await prisma.serviceRequest.create({ data: {
      tenantId, clientId, categorySlug: 'fontaneria', title: 'Histórica', description: 'Anterior', city: 'Quito', location: 'Privada',
      urgency: 'medium', contactPhone: '0999999999', contactEmail: payload.contactEmail, estimatedBudget: 50,
      status: 'contact_limit_open',
    } });
    assert.equal(quarantine.visibility, 'legacy_unclassified');
    assert.ok(!JSON.parse((await request('/api/requests/available', 'GET', professionalToken)).body).some(item => item.id === quarantine.id));
    assert.equal((await request('/api/payments/transfer-intents', 'POST', professionalToken, { requestId: quarantine.id })).status, 403);
    const row = { tenantId, clientId, categorySlug: 'fontaneria', title: 'Restricción', description: 'Prueba',
      city: 'Quito', location: 'Privada', urgency: 'medium', contactPhone: '0999999999', contactEmail: payload.contactEmail,
      estimatedBudget: 50, status: 'contact_limit_open' };
    await assert.rejects(prisma.serviceRequest.create({ data: { ...row, visibility: 'direct' } }));
    await assert.rejects(prisma.serviceRequest.create({ data: { ...row, visibility: 'marketplace', targetProfessionalUserId: professionalId } }));

    const key = crypto.randomUUID();
    const first = await request('/api/requests', 'POST', clientToken, payload, { 'Idempotency-Key': key });
    captchaAccepted = false;
    const repeated = await request('/api/requests', 'POST', clientToken, payload, { 'Idempotency-Key': key });
    assert.equal(first.status, 201, first.body);
    assert.equal(repeated.status, 200, repeated.body);
    assert.equal(JSON.parse(first.body).id, JSON.parse(repeated.body).id);
    captchaAccepted = true;
    assert.equal((await request('/api/requests', 'POST', clientToken, { ...payload, title: 'Otro trabajo' }, { 'Idempotency-Key': key })).status, 409);

    const patch = await request(`/api/requests/${JSON.parse(first.body).id}`, 'PATCH', clientToken, { title: 'Nuevo título' });
    assert.equal(patch.status, 200, patch.body);
    assert.equal(JSON.parse(patch.body).title, 'Nuevo título');
    assert.equal((await request(`/api/requests/${saved.id}/cancel`, 'POST', clientToken)).status, 200);
    assert.equal((await request(`/api/requests/${saved.id}/cancel`, 'POST', clientToken)).status, 409);
    assert.equal((await request('/api/quotes', 'POST', professionalToken, { requestId: saved.id, message: 'Cotización', estimatedPrice: 20 })).status, 409);
    assert.equal((await request(`/api/requests/${saved.id}/complete`, 'POST', clientToken)).status, 409);
    let limited = false;
    for (let attempt = 0; attempt < 21 && !limited; attempt += 1) {
      const response = await request('/api/requests', 'POST', clientToken, { ...payload, captchaToken: undefined });
      limited = response.status === 429;
    }
    assert.equal(limited, true, 'publication must be rate limited per user');
  } finally {
    global.fetch = originalFetch;
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
