const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();
process.env.PAYPHONE_TOKEN = '';
process.env.PAYPHONE_STORE_ID = '';
process.env.PAYPHONE_MOCK = 'true';
process.env.ADMIN_MFA_REQUIRED = 'false';
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { PrismaClient } = require('@prisma/client');
const { app, prisma: appDb } = require('../dist/index.js');
const { totp } = require('../dist/adminMfa.js');
const { expirePendingPayments } = require('../dist/payments.js');
const { PayPhoneProvider } = require('../dist/payphoneProvider.js');

test('TOTP follows the RFC 6238 SHA-1 test vector', () => {
  assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1, 8), '94287082');
});

test('PayPhone prepares and confirms against the documented button API', async () => {
  const provider = new PayPhoneProvider('test-token', 'test-store', 'https://pay.payphonetodoesposible.com', 'http://localhost:5173');
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).endsWith('/api/button/Prepare')) {
      const body = JSON.parse(init.body);
      assert.equal(body.clientTransactionId, 'A12345678901234');
      assert.equal(body.amount, 600);
      return Response.json({ payWithPayPhone: 'https://pay.payphonetodoesposible.com/PayPhone/Index?paymentId=test' });
    }
    assert.equal(String(url), 'https://pay.payphonetodoesposible.com/api/button/V2/Confirm');
    assert.deepEqual(JSON.parse(init.body), { id: 12345678, clientTxId: 'A12345678901234' });
    return Response.json({ clientTransactionId: 'A12345678901234', transactionId: 12345678, transactionStatus: 'Approved', amount: 600, currency: 'USD' });
  };
  try {
    const intent = await provider.createIntent({ reference: 'A12345678901234', amount: '6.00', currency: 'USD', requestId: 'test', responseUrl: 'https://example.test/paid' });
    assert.match(intent.checkoutUrl, /^https:\/\/pay\.payphonetodoesposible\.com\//);
    const payment = await provider.getPayment('A12345678901234', '12345678');
    assert.deepEqual({ status: payment.status, amountCents: payment.amountCents, currency: payment.currency, providerPaymentId: payment.providerPaymentId }, { status: 'approved', amountCents: 600, currency: 'USD', providerPaymentId: '12345678' });
  } finally { global.fetch = originalFetch; }
});

test('tenant isolation, RBAC and idempotent lead allocation', async () => {
  const db = new PrismaClient();
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const tenantA = `test-a-${suffix}`;
  const tenantB = `test-b-${suffix}`;
  const hostA = `a-${suffix}.example.test`;
  const aliasA = `alias-${suffix}.example.test`;
  const hostB = `b-${suffix}.example.test`;
  const ids = { a: `test-user-a-${suffix}`, b: `test-user-b-${suffix}`, client: `test-client-${suffix}`, pro2: `test-pro2-${suffix}`, pro3: `test-pro3-${suffix}`, guest: `test-guest-${suffix}`, invitee: `test-invitee-${suffix}` };
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const token = userId => jwt.sign({ userId }, process.env.JWT_SECRET || 'super-secret-jwt-key-change-me');
  const call = async (route, userId, method = 'GET', body, host, extraHeaders = {}) => new Promise((resolve, reject) => {
    const request = http.request(`${base}${route}`, { method, headers: { Host: host || (userId === ids.b ? hostB : hostA), Authorization: `Bearer ${token(userId)}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => { const raw = Buffer.concat(chunks).toString(); resolve({ status: response.statusCode, json: async () => JSON.parse(raw || '{}') }); });
    });
    request.on('error', reject); if (body) request.write(JSON.stringify(body)); request.end();
  });
  try {
    for (const id of [tenantA, tenantB]) await db.tenant.create({ data: { id, slug: id, name: id, settings: { maxProfessionalsPerLead: 1, bankAccounts: [] } } });
    await db.tenantDomain.createMany({ data: [{ tenantId: tenantA, hostname: hostA, isPrimary: true }, { tenantId: tenantA, hostname: aliasA }, { tenantId: tenantB, hostname: hostB, isPrimary: true }] });
    await db.user.createMany({ data: [
      { id: ids.a, tenantId: tenantA, email: `${ids.a}@example.test`, fullName: 'A', role: 'pro', emailVerified: true },
      { id: ids.b, tenantId: tenantB, email: `${ids.b}@example.test`, fullName: 'B', role: 'pro', emailVerified: true },
      { id: ids.client, tenantId: tenantA, email: `${ids.client}@example.test`, fullName: 'Client', role: 'client', emailVerified: true },
      { id: ids.pro2, tenantId: tenantA, email: `${ids.pro2}@example.test`, fullName: 'Pro 2', role: 'pro', emailVerified: true },
      { id: ids.pro3, tenantId: tenantA, email: `${ids.pro3}@example.test`, fullName: 'Pro 3', role: 'pro', emailVerified: true },
      { id: ids.guest, tenantId: tenantA, email: `${ids.guest}@example.test`, fullName: 'Guest', role: 'guest', emailVerified: true },
    ] });
    const [proA, pro2, pro3] = await Promise.all([
      db.professionalProfile.create({ data: { userId: ids.a, tenantId: tenantA, bio: '', categories: [], serviceZones: [], verified: true, documentType: 'cedula', documentId: '1712345678', address: 'Private street' } }),
      db.professionalProfile.create({ data: { userId: ids.pro2, tenantId: tenantA, bio: '', categories: [], serviceZones: [] } }),
      db.professionalProfile.create({ data: { userId: ids.pro3, tenantId: tenantA, bio: '', categories: [], serviceZones: [] } }),
    ]);
    const [read, review, usersManage, adminsManage, usersRead, dashboardRead, auditRead] = await Promise.all(['payments.read','payments.review','users.manage','admins.manage','users.read','dashboard.read','audit.read'].map(code => db.permission.findUniqueOrThrow({ where: { code } })));
    const roleA = await db.adminRole.create({ data: { tenantId: tenantA, code: 'reviewer', name: 'Reviewer', permissions: { create: [read, review, usersManage, adminsManage, usersRead, dashboardRead, auditRead].map(permission => ({ permissionId: permission.id })) } } });
    const roleB = await db.adminRole.create({ data: { tenantId: tenantB, code: 'reader', name: 'Reader', permissions: { create: [{ permissionId: read.id }] } } });
    await db.tenantMembership.createMany({ data: [{ tenantId: tenantA, userId: ids.a, roleId: roleA.id }, { tenantId: tenantB, userId: ids.b, roleId: roleB.id }] });
    const clientRequestInput = { categorySlug: 'test', title: 'Unauthorized request', description: 'Test', location: 'Test', contactPhone: 'private', contactEmail: 'private@example.test', estimatedBudget: 100 };
    assert.equal((await call('/api/requests', ids.a, 'POST', clientRequestInput)).status, 403);
    assert.equal((await call('/api/requests', ids.guest, 'POST', clientRequestInput)).status, 403);
    const originalGoogleFetch = global.fetch;
    global.fetch = async (url, init) => {
      assert.equal(String(url), 'https://www.googleapis.com/oauth2/v3/userinfo');
      assert.equal(init.headers.Authorization, 'Bearer ya29.test-token');
      return Response.json({ email: `${ids.a}@example.test`, email_verified: true, name: 'A' });
    };
    try {
      const googleLogin = await call('/api/auth/google', ids.a, 'POST', { credential: 'ya29.test-token' });
      assert.equal(googleLogin.status, 200);
      assert.equal('verificationToken' in (await googleLogin.json()).user, false);
    } finally { global.fetch = originalGoogleFetch; }
    const preflight = await fetch(`${base}/api/payments/card-intents`, { method: 'OPTIONS', headers: { Origin: `https://${hostA}`, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization,idempotency-key' } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-headers') || '', /Idempotency-Key/i);
    const ownProfile = await call('/api/profile', ids.a);
    assert.equal(ownProfile.status, 200);
    assert.equal('mfaSecret' in (await ownProfile.json()).user, false);
    const publicProfiles = await call('/api/professionals', ids.a);
    assert.equal(publicProfiles.status, 200);
    const publicList = await publicProfiles.json();
    assert.ok(publicList.some(pro => pro.id === ids.a));
    assert.ok(!('professionalProfile' in publicList.find(pro => pro.id === ids.a)));
    assert.ok(!JSON.stringify(publicList).includes('1712345678'));
    assert.ok(!JSON.stringify(publicList).includes('Private street'));
    assert.equal((await call('/api/auth/role', ids.a, 'POST', { role: 'client' })).status, 409);
    assert.equal((await call('/api/auth/role', ids.client, 'POST', { role: 'pro' })).status, 409);
    assert.equal((await db.professionalProfile.count({ where: { userId: ids.a } })), 1);
    assert.equal((await call('/api/auth/role', ids.guest, 'POST', { role: 'client' })).status, 200);
    assert.equal((await call('/api/auth/role', ids.guest, 'POST', { role: 'pro' })).status, 409);
    assert.equal((await db.clientProfile.count({ where: { userId: ids.guest } })), 1);
    await db.review.create({ data: { tenantId: tenantB, professionalId: ids.a, clientId: ids.b, rating: 1, comment: 'Foreign tenant review' } });
    const publicDetail = await call(`/api/professionals/${ids.a}`, ids.client);
    assert.equal(publicDetail.status, 200);
    const publicDetailBody = await publicDetail.json();
    assert.deepEqual(publicDetailBody.reviews, []);
    assert.ok(!('professionalProfile' in publicDetailBody));
    assert.ok(!JSON.stringify(publicDetailBody).includes('1712345678'));
    assert.ok(!JSON.stringify(publicDetailBody).includes('Private street'));
    assert.equal((await call(`/api/professionals/${ids.a}/reviews`, ids.a, 'POST', { rating: 5, comment: 'Self review' })).status, 403);
    assert.equal((await call(`/api/professionals/${ids.a}/reviews`, ids.client, 'POST', { rating: 6, comment: 'Invalid' })).status, 400);
    assert.equal((await call(`/api/professionals/${ids.a}/reviews`, ids.client, 'POST', { rating: 5, comment: 'Own tenant review' })).status, 201);
    const reviewedDetail = await (await call(`/api/professionals/${ids.a}`, ids.client)).json();
    assert.deepEqual(reviewedDetail.reviews.map(review => review.comment), ['Own tenant review']);
    assert.equal(reviewedDetail.profile.reviewCount, 1);
    assert.equal(reviewedDetail.profile.rating, 5);
    const request = await db.serviceRequest.create({ data: { tenantId: tenantA, clientId: ids.client, categorySlug: 'test', title: 'Test', description: 'Test', location: 'Test', contactPhone: '000', contactEmail: 'private@example.test', status: 'contact_limit_open', estimatedBudget: 100 } });
    const purchase = await db.leadPurchase.create({ data: { tenantId: tenantA, requestId: request.id, professionalId: proA.id, costUSD: 6 } });
    const purchase2 = await db.leadPurchase.create({ data: { tenantId: tenantA, requestId: request.id, professionalId: pro2.id, costUSD: 6 } });
    const payment = await db.payment.create({ data: { tenantId: tenantA, payerUserId: ids.a, amount: 6, method: 'transfer', status: 'under_review', reference: `test-a-${suffix}`, metadata: { leadPurchaseId: purchase.id } } });
    const payment2 = await db.payment.create({ data: { tenantId: tenantA, payerUserId: ids.pro2, amount: 6, method: 'transfer', status: 'under_review', reference: `test-a2-${suffix}`, metadata: { leadPurchaseId: purchase2.id } } });
    const foreign = await db.payment.create({ data: { tenantId: tenantB, payerUserId: ids.b, amount: 1, method: 'payphone', status: 'allocated', reference: `test-b-${suffix}` } });

    const availableResponse = await call('/api/requests/available', ids.pro3);
    const available = await availableResponse.json();
    assert.equal(availableResponse.status, 200, JSON.stringify(available));
    assert.ok(available.some(r => r.id === request.id));
    assert.ok(available.every(r => !('contactPhone' in r) && !('contactEmail' in r)));

    assert.equal((await call(`/api/admin/payments/${foreign.id}`, ids.a)).status, 404);
    assert.equal((await call(`/api/admin/users/${ids.b}`, ids.a)).status, 404);
    assert.equal((await call(`/api/admin/users/${ids.a}`, ids.b)).status, 403);
    assert.equal((await call('/api/admin/payments', ids.a, 'GET', undefined, hostB)).status, 403);
    assert.equal((await call('/api/requests/available', ids.pro3, 'GET', undefined, hostB)).status, 403);
    assert.equal((await call(`/api/admin/payments/${payment.id}`, ids.b)).status, 404);
    assert.equal((await call(`/api/payments/${payment.id}`, ids.b)).status, 404);
    assert.equal((await call(`/api/admin/payments/transfers/${payment.id}/approve`, ids.b, 'POST', {})).status, 403);
    const ownMembership = await db.tenantMembership.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: tenantA, userId: ids.a } } });
    assert.equal((await call(`/api/admin/memberships/${ownMembership.id}`, ids.a, 'PATCH', { status: 'revoked' })).status, 403);
    assert.equal((await call(`/api/admin/users/${ids.a}/status`, ids.a, 'PATCH', { active: false, reason: 'test reason' })).status, 403);
    const list = await (await call('/api/admin/payments', ids.a)).json();
    assert.ok(list.items.every(p => p.tenantId === tenantA));
    const listingBurst = await Promise.all(Array.from({ length: 60 }, async (_, index) => {
      const started = Date.now();
      const route = index % 3 === 0 ? '/api/admin/users?pageSize=20' : '/api/admin/payments?pageSize=20';
      const userId = index % 3 === 2 ? ids.b : ids.a;
      const response = await call(route, userId);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.ok(body.items.every(item => route.includes('/users') ? item.id !== ids.b : item.tenantId === (userId === ids.b ? tenantB : tenantA)));
      return Date.now() - started;
    }));
    const sortedLatency = listingBurst.sort((a, b) => a - b);
    console.log(`Listados concurrentes: 60 solicitudes, p95=${sortedLatency[Math.ceil(sortedLatency.length * 0.95) - 1]} ms`);

    const concurrent = await Promise.all([call(`/api/admin/payments/transfers/${payment.id}/approve`, ids.a, 'POST', { note: 'Conciliado' }), call(`/api/admin/payments/transfers/${payment.id}/approve`, ids.a, 'POST', { note: 'Duplicado' })]);
    assert.ok(concurrent.some(response => response.status === 200));
    assert.ok(concurrent.every(response => [200,409].includes(response.status)));
    assert.equal((await call(`/api/admin/payments/transfers/${payment.id}/approve`, ids.a, 'POST', { note: 'Repetido' })).status, 200);
    assert.equal((await call(`/api/admin/payments/transfers/${payment2.id}/approve`, ids.a, 'POST', { note: 'Sin cupo' })).status, 409);
    assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } })).purchaseCount, 1);
    assert.equal((await db.paymentAllocation.count({ where: { paymentId: payment.id } })), 1);
    assert.equal((await db.auditLog.count({ where: { tenantId: tenantA, action: 'payments.approve', entityId: payment.id } })), 1);

    const request2 = await db.serviceRequest.create({ data: { tenantId: tenantA, clientId: ids.client, categorySlug: 'test', title: 'Transfer test', description: 'Test', location: 'Test', contactPhone: 'private', contactEmail: 'private2@example.test', status: 'contact_limit_open', estimatedBudget: 100 } });
    const purchase3 = await db.leadPurchase.create({ data: { tenantId: tenantA, requestId: request2.id, professionalId: pro3.id, costUSD: 6 } });
    const transfer = await db.payment.create({ data: { tenantId: tenantA, payerUserId: ids.pro3, amount: 6, method: 'transfer', status: 'awaiting_transfer', reference: `test-transfer-${suffix}`, metadata: { leadPurchaseId: purchase3.id, requestId: request2.id } } });
    const proof = { bankName: 'Test bank', transferReference: 'REF-123', transferredAt: new Date(Date.now() - 60000).toISOString(), declaredAmount: '5.00', fileBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pKcAAAAASUVORK5CYII=' };
    assert.equal((await call(`/api/payments/${transfer.id}/transfer-proof`, ids.pro3, 'POST', { ...proof, declaredAmount: undefined })).status, 400);
    assert.equal((await call(`/api/payments/${transfer.id}/transfer-proof`, ids.pro3, 'POST', { ...proof, declaredAmount: 'invalid' })).status, 400);
    assert.equal((await call(`/api/payments/${transfer.id}/transfer-proof`, ids.pro3, 'POST', { ...proof, fileBase64: 'bad' })).status, 400);
    assert.equal((await call(`/api/payments/${transfer.id}/transfer-proof`, ids.pro3, 'POST', proof)).status, 201);
    const transferDetail = await (await call(`/api/admin/payments/${transfer.id}`, ids.a)).json();
    assert.equal(transferDetail.transfers[0].declaredAmount, '5');
    assert.equal((await call(`/api/admin/payments/transfers/${transfer.id}/approve`, ids.a, 'POST', { note: 'Monto conciliado' })).status, 409);
    const proofUrl = transferDetail.transfers[0].proofUrl;
    assert.equal((await call(proofUrl, ids.a)).status, 200);
    assert.equal((await call(proofUrl, ids.b)).status, 403);
    assert.equal((await call(proofUrl, ids.pro3)).status, 403);
    assert.equal((await call(proofUrl.split('?')[0], ids.a)).status, 403);
    assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: request2.id } })).purchaseCount, 0);
    assert.equal((await call(`/api/admin/payments/transfers/${transfer.id}/reject`, ids.a, 'POST', { note: 'No coincide el banco' })).status, 200);
    const rejectionAudit = await db.auditLog.findFirstOrThrow({ where: { tenantId: tenantA, action: 'payments.reject', entityId: transfer.id } });
    assert.equal(rejectionAudit.actorId, ids.a);
    assert.ok(rejectionAudit.createdAt instanceof Date);
    assert.equal((await call(`/api/payments/${transfer.id}/transfer-proof`, ids.pro3, 'POST', { ...proof, declaredAmount: '6.00', transferReference: 'REF-456' })).status, 201);
    assert.equal((await db.transferSubmission.count({ where: { paymentId: transfer.id } })), 2);
    assert.equal((await call(`/api/admin/payments/transfers/${transfer.id}/approve`, ids.a, 'POST', { note: 'Conciliado' })).status, 200);
    assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: request2.id } })).purchaseCount, 1);

    await db.tenant.update({ where: { id: tenantA }, data: { settings: { maxProfessionalsPerLead: 1, bankAccounts: [{ bankName: 'Banco prueba', accountName: 'ArtoCamello', accountNumber: '12345678' }] } } });
    const concurrentRequest = await db.serviceRequest.create({ data: { tenantId: tenantA, clientId: ids.client, categorySlug: 'test', title: 'Concurrent transfer', description: 'Test', location: 'Test', contactPhone: 'private-concurrent', contactEmail: 'concurrent@example.test', status: 'contact_limit_open', estimatedBudget: 100 } });
    const transferIntents = await Promise.all([call('/api/payments/transfer-intents', ids.pro3, 'POST', { requestId: concurrentRequest.id }), call('/api/payments/transfer-intents', ids.pro3, 'POST', { requestId: concurrentRequest.id })]);
    assert.deepEqual(transferIntents.map(response => response.status).sort(), [200, 201]);
    const transferIntentBodies = await Promise.all(transferIntents.map(response => response.json()));
    assert.equal(transferIntentBodies[0].payment.id, transferIntentBodies[1].payment.id);
    assert.equal((await db.payment.count({ where: { tenantId: tenantA, method: 'transfer', metadata: { path: ['requestId'], equals: concurrentRequest.id } } })), 1);

    const request3 = await db.serviceRequest.create({ data: { tenantId: tenantA, clientId: ids.client, categorySlug: 'test', title: 'PayPhone test', description: 'Test', location: 'Test', contactPhone: 'private3', contactEmail: 'private3@example.test', status: 'contact_limit_open', estimatedBudget: 100 } });
    const hiredRequest = await db.serviceRequest.create({ data: { tenantId: tenantA, clientId: ids.client, categorySlug: 'test', title: 'Already hired', description: 'Test', location: 'Test', contactPhone: 'private-hired', contactEmail: 'hired@example.test', status: 'hired', estimatedBudget: 100 } });
    assert.equal((await call('/api/leads/pay', ids.pro3, 'POST', { requestId: hiredRequest.id })).status, 409);
    assert.equal((await db.payment.count({ where: { tenantId: tenantA, metadata: { path: ['requestId'], equals: hiredRequest.id } } })), 0);
    const intentResponse = await call('/api/leads/pay', ids.pro3, 'POST', { requestId: request3.id }, aliasA);
    assert.equal(intentResponse.status, 200);
    const intent = await intentResponse.json();
    assert.match(intent.redirectUrl, new RegExp(`^https://${hostA.replaceAll('.', '\\.')}/`));
    assert.equal((await call('/api/leads/pay/confirm', ids.b, 'POST', { clientTxId: intent.clientTxId, payphoneTransactionId: 'MOCK_TX_ID' })).status, 404);
    assert.equal((await call('/api/leads/pay/confirm', ids.pro3, 'POST', { clientTxId: intent.clientTxId, payphoneTransactionId: 'MOCK_TX_ID' })).status, 200);
    const repeated = await (await call('/api/leads/pay/confirm', ids.pro3, 'POST', { clientTxId: intent.clientTxId, payphoneTransactionId: 'MOCK_TX_ID' })).json();
    assert.equal(repeated.alreadyPaid, true);
    assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: request3.id } })).purchaseCount, 1);
    assert.equal((await db.paymentEvent.count({ where: { tenantId: tenantA, source: 'payphone', type: 'provider_approved' } })), 1);

    const concurrentPayphoneRequest = await db.serviceRequest.create({ data: { tenantId: tenantA, clientId: ids.client, categorySlug: 'test', title: 'Concurrent PayPhone test', description: 'Test', location: 'Test', contactPhone: 'private-payphone-race', contactEmail: 'payphone-race@example.test', status: 'contact_limit_open', estimatedBudget: 100 } });
    const originalCreateIntent = PayPhoneProvider.prototype.createIntent;
    let payphoneIntentCalls = 0;
    PayPhoneProvider.prototype.createIntent = async function(input) {
      payphoneIntentCalls++;
      await new Promise(resolve => setTimeout(resolve, 40));
      return originalCreateIntent.call(this, input);
    };
    try {
      const attempts = await Promise.all([call('/api/leads/pay', ids.pro3, 'POST', { requestId: concurrentPayphoneRequest.id }), call('/api/leads/pay', ids.pro3, 'POST', { requestId: concurrentPayphoneRequest.id })]);
      assert.deepEqual(attempts.map(response => response.status).sort(), [200, 409]);
      assert.equal(payphoneIntentCalls, 1);
      assert.equal((await db.payment.count({ where: { tenantId: tenantA, method: 'payphone', metadata: { path: ['requestId'], equals: concurrentPayphoneRequest.id } } })), 1);
    } finally { PayPhoneProvider.prototype.createIntent = originalCreateIntent; }

    const latePayphoneRequest = await db.serviceRequest.create({ data: { tenantId: tenantA, clientId: ids.client, categorySlug: 'test', title: 'Late PayPhone return', description: 'Test', location: 'Test', contactPhone: 'private-payphone-late', contactEmail: 'payphone-late@example.test', status: 'contact_limit_open', estimatedBudget: 100 } });
    const firstPayphoneIntent = await (await call('/api/leads/pay', ids.pro3, 'POST', { requestId: latePayphoneRequest.id })).json();
    await db.payment.update({ where: { tenantId_reference: { tenantId: tenantA, reference: firstPayphoneIntent.clientTxId } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expirePendingPayments(db);
    const secondPayphoneIntent = await (await call('/api/leads/pay', ids.pro3, 'POST', { requestId: latePayphoneRequest.id })).json();
    assert.notEqual(firstPayphoneIntent.clientTxId, secondPayphoneIntent.clientTxId);
    assert.equal((await call('/api/leads/pay/confirm', ids.pro3, 'POST', { clientTxId: firstPayphoneIntent.clientTxId, payphoneTransactionId: 'MOCK_TX_ID' })).status, 200);
    assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: latePayphoneRequest.id } })).purchaseCount, 1);
    const latePurchase = await db.leadPurchase.findUniqueOrThrow({ where: { requestId_professionalId: { requestId: latePayphoneRequest.id, professionalId: pro3.id } } });
    assert.equal(latePurchase.payphoneClientTxId, firstPayphoneIntent.clientTxId);
    assert.equal((await call('/api/leads/pay/confirm', ids.pro3, 'POST', { clientTxId: secondPayphoneIntent.clientTxId, payphoneTransactionId: 'MOCK_TX_ID' })).status, 409);
    const secondPayphonePayment = await db.payment.findUniqueOrThrow({ where: { tenantId_reference: { tenantId: tenantA, reference: secondPayphoneIntent.clientTxId } } });
    assert.equal(secondPayphonePayment.status, 'approved');
    assert.equal((await db.paymentEvent.count({ where: { paymentId: secondPayphonePayment.id, type: 'manual_resolution_required' } })), 1);
    assert.equal((await (await call('/api/admin/dashboard', ids.a)).json()).unresolvedProviderPayments, 1);

    const mismatchRequest = await db.serviceRequest.create({ data: { tenantId: tenantA, clientId: ids.client, categorySlug: 'test', title: 'PayPhone mismatch', description: 'Test', location: 'Test', contactPhone: 'private-mismatch', contactEmail: 'mismatch@example.test', status: 'contact_limit_open', estimatedBudget: 100 } });
    const mismatchIntent = await (await call('/api/leads/pay', ids.pro3, 'POST', { requestId: mismatchRequest.id })).json();
    const originalGetPayment = PayPhoneProvider.prototype.getPayment;
    try {
      PayPhoneProvider.prototype.getPayment = async reference => ({ reference, status: 'approved', providerPaymentId: '12345678', amountCents: 500, currency: 'USD' });
      assert.equal((await call('/api/leads/pay/confirm', ids.pro3, 'POST', { clientTxId: mismatchIntent.clientTxId, payphoneTransactionId: '12345678' })).status, 409);
      PayPhoneProvider.prototype.getPayment = async reference => ({ reference, status: 'approved', providerPaymentId: '12345678', amountCents: 600, currency: 'EUR' });
      assert.equal((await call('/api/leads/pay/confirm', ids.pro3, 'POST', { clientTxId: mismatchIntent.clientTxId, payphoneTransactionId: '12345678' })).status, 409);
      assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: mismatchRequest.id } })).purchaseCount, 0);
      PayPhoneProvider.prototype.getPayment = async reference => ({ reference, status: 'approved', providerPaymentId: '12345678', amountCents: 600, currency: 'USD' });
      assert.equal((await call('/api/leads/pay/confirm', ids.pro3, 'POST', { clientTxId: mismatchIntent.clientTxId, payphoneTransactionId: '12345678' })).status, 200);
    } finally { PayPhoneProvider.prototype.getPayment = originalGetPayment; }
    assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: mismatchRequest.id } })).purchaseCount, 1);

    const merchantId = `merchant-${suffix}`;
    const webhookSecret = `webhook-${suffix}`;
    process.env.KUSHKI_CARD_ENABLED = 'true';
    process.env.KUSHKI_CONFIG_JSON = JSON.stringify({ [tenantA]: { merchantId, privateMerchantId: 'private-test-only', webhookSecret, environment: 'uat', webhookAmountUnit: 'cents' } });
    await db.tenant.update({ where: { id: tenantA }, data: { settings: { maxProfessionalsPerLead: 1, bankAccounts: [], cardEnabled: true } } });
    const cardRequest = await db.serviceRequest.create({ data: { tenantId: tenantA, clientId: ids.client, categorySlug: 'test', title: 'Card test', description: 'Test', location: 'Test', contactPhone: 'private4', contactEmail: 'private4@example.test', status: 'contact_limit_open', estimatedBudget: 100 } });
    const previousFetch = global.fetch;
    global.fetch = async (url, init) => {
      assert.match(String(url), /api-uat\.kushkipagos\.com\/smartlink\/v1\/webcheckout/);
      const payload = JSON.parse(init.body);
      assert.equal(payload.paymentConfig.amount.subtotalIva0, 6);
      assert.equal(payload.paymentConfig.paymentMethod[0], 'credit-card');
      assert.equal(payload.redirectURL, `https://${hostA}/dashboard/wallet`);
      return Response.json({ webcheckoutId: 'webcheckout-test-id', webcheckoutUrl: 'https://uat-webcheckout.kushkipagos.com/webcheckout/webcheckout-test-id' });
    };
    let cardIntent;
    try {
      const cardResponse = await call('/api/payments/card-intents', ids.pro3, 'POST', { requestId: cardRequest.id }, aliasA, { 'Idempotency-Key': `test-key-${suffix}` });
      assert.equal(cardResponse.status, 201, JSON.stringify(await cardResponse.json()));
      cardIntent = await cardResponse.json();
      assert.equal((await call('/api/payments/card-intents', ids.pro3, 'POST', { requestId: cardRequest.id }, hostA, { 'Idempotency-Key': `test-key-${suffix}` })).status, 200);
    } finally { global.fetch = previousFetch; }
    assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: cardRequest.id } })).purchaseCount, 0);
    const cardPayload = { id: `event-${suffix}`, merchantId, paymentMethod: 'creditCard', status: 'approvedTransaction', metadata: { artocamelloPayment: cardIntent.payment.reference }, smartLink: 'webcheckout-test-id', approvedTransactionAmount: 600, amount: { currency: 'USD' }, transactionReference: `charge-${suffix}` };
    const webhookCall = (payload, signatureValid = true, tenantId = tenantA) => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = crypto.createHmac('sha256', signatureValid ? webhookSecret : 'wrong-secret').update(`${JSON.stringify(payload)}.${timestamp}`).digest('hex');
      return call(`/api/webhooks/kushki/${tenantId}`, ids.a, 'POST', payload, hostA, { 'X-Kushki-Id': timestamp, 'X-Kushki-Key': merchantId, 'X-Kushki-Signature': signature });
    };
    assert.equal((await webhookCall(cardPayload, false)).status, 401);
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 601);
    const staleSignature = crypto.createHmac('sha256', webhookSecret).update(`${JSON.stringify(cardPayload)}.${staleTimestamp}`).digest('hex');
    assert.equal((await call(`/api/webhooks/kushki/${tenantA}`, ids.a, 'POST', cardPayload, hostA, { 'X-Kushki-Id': staleTimestamp, 'X-Kushki-Key': merchantId, 'X-Kushki-Signature': staleSignature })).status, 401);
    assert.equal((await webhookCall({ ...cardPayload, approvedTransactionAmount: 500 })).status, 422);
    assert.equal((await webhookCall(cardPayload, true, tenantB)).status, 404);
    assert.equal((await webhookCall(cardPayload)).status, 200);
    assert.equal((await webhookCall(cardPayload)).status, 200);
    assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: cardRequest.id } })).purchaseCount, 1);
    assert.equal((await db.paymentAllocation.count({ where: { paymentId: cardIntent.payment.id } })), 1);
    assert.equal((await db.paymentEvent.count({ where: { paymentId: cardIntent.payment.id, type: 'provider_approved' } })), 1);
    const raceRequest = await db.serviceRequest.create({ data: { tenantId: tenantA, clientId: ids.client, categorySlug: 'test', title: 'Checkout race test', description: 'Test', location: 'Test', contactPhone: 'private-race', contactEmail: 'private-race@example.test', status: 'contact_limit_open', estimatedBudget: 100 } });
    global.fetch = async (_url, init) => {
      const reference = JSON.parse(init.body).additionalInformation.artocamelloPayment;
      await db.payment.update({ where: { tenantId_reference: { tenantId: tenantA, reference } }, data: { status: 'approved' } });
      return Response.json({ webcheckoutId: 'webcheckout-race-id', webcheckoutUrl: 'https://uat-webcheckout.kushkipagos.com/webcheckout/webcheckout-race-id' });
    };
    try {
      const raceResponse = await call('/api/payments/card-intents', ids.pro3, 'POST', { requestId: raceRequest.id }, hostA, { 'Idempotency-Key': `race-key-${suffix}` });
      assert.equal(raceResponse.status, 409);
      assert.equal((await raceResponse.json()).payment.status, 'approved');
    } finally { global.fetch = previousFetch; }
    const declinedRequest = await db.serviceRequest.create({ data: { tenantId: tenantA, clientId: ids.client, categorySlug: 'test', title: 'Declined card test', description: 'Test', location: 'Test', contactPhone: 'private5', contactEmail: 'private5@example.test', status: 'contact_limit_open', estimatedBudget: 100 } });
    global.fetch = async () => Response.json({ webcheckoutId: 'webcheckout-declined-id', webcheckoutUrl: 'https://uat-webcheckout.kushkipagos.com/webcheckout/webcheckout-declined-id' });
    let declinedIntent;
    try { declinedIntent = await (await call('/api/payments/card-intents', ids.pro3, 'POST', { requestId: declinedRequest.id }, hostA, { 'Idempotency-Key': `declined-key-${suffix}` })).json(); }
    finally { global.fetch = previousFetch; }
    const declinedPayload = { ...cardPayload, id: `declined-event-${suffix}`, metadata: { artocamelloPayment: declinedIntent.payment.reference }, smartLink: 'webcheckout-declined-id', status: 'declinedTransaction', requestAmount: 600 };
    assert.equal((await webhookCall(declinedPayload)).status, 200);
    assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: declinedRequest.id } })).purchaseCount, 0);
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: declinedIntent.payment.id } })).status, 'pending_provider');
    assert.equal((await webhookCall({ ...declinedPayload, id: `approved-after-decline-${suffix}`, status: 'approvedTransaction' })).status, 200);
    assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: declinedRequest.id } })).purchaseCount, 1);
    const expiredRequest = await db.serviceRequest.create({ data: { tenantId: tenantA, clientId: ids.client, categorySlug: 'test', title: 'Late webhook test', description: 'Test', location: 'Test', contactPhone: 'private-expired', contactEmail: 'private-expired@example.test', status: 'contact_limit_open', estimatedBudget: 100 } });
    global.fetch = async () => Response.json({ webcheckoutId: 'webcheckout-expired-id', webcheckoutUrl: 'https://uat-webcheckout.kushkipagos.com/webcheckout/webcheckout-expired-id' });
    let expiredIntent;
    try { expiredIntent = await (await call('/api/payments/card-intents', ids.pro3, 'POST', { requestId: expiredRequest.id }, hostA, { 'Idempotency-Key': `expired-key-${suffix}` })).json(); }
    finally { global.fetch = previousFetch; }
    await db.payment.update({ where: { id: expiredIntent.payment.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expirePendingPayments(db);
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: expiredIntent.payment.id } })).status, 'expired');
    assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: expiredRequest.id } })).purchaseCount, 0);
    const retryableJobs = await (await call('/api/requests/available', ids.pro3)).json();
    assert.ok(retryableJobs.some(job => job.id === expiredRequest.id), 'A request with an expired payment remains available for retry');
    const latePayload = { ...cardPayload, id: `late-event-${suffix}`, metadata: { artocamelloPayment: expiredIntent.payment.reference }, smartLink: 'webcheckout-expired-id' };
    assert.equal((await webhookCall(latePayload)).status, 200);
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: expiredIntent.payment.id } })).status, 'allocated');
    assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: expiredRequest.id } })).purchaseCount, 1);
    const analyticsRequest = await db.serviceRequest.create({ data: { tenantId: tenantA, clientId: ids.client, categorySlug: 'test', title: 'Analytics test', description: 'Test', location: 'Test', contactPhone: 'private6', contactEmail: 'private6@example.test', status: 'contact_limit_open', estimatedBudget: 100 } });
    global.fetch = async () => Response.json({ webcheckoutId: 'webcheckout-analytics-id', webcheckoutUrl: 'https://uat-webcheckout.kushkipagos.com/webcheckout/webcheckout-analytics-id' });
    let analyticsIntent;
    try { analyticsIntent = await (await call('/api/payments/card-intents', ids.pro3, 'POST', { requestId: analyticsRequest.id }, hostA, { 'Idempotency-Key': `analytics-key-${suffix}` })).json(); }
    finally { global.fetch = previousFetch; }
    global.fetch = async (url) => {
      assert.match(String(url), /analytics\/v2\/transactions-list/);
      return Response.json({ total: 1, data: [{ metadata: { artocamelloPayment: analyticsIntent.payment.reference }, transaction_status: 'APPROVAL', approved_transaction_amount: 6, currency_code: 'USD', transaction_reference: `analytics-charge-${suffix}` }] });
    };
    try {
      assert.equal((await call(`/api/admin/payments/cards/${analyticsIntent.payment.id}/reconcile`, ids.a, 'POST')).status, 200);
      assert.equal((await call(`/api/admin/payments/cards/${analyticsIntent.payment.id}/reconcile`, ids.a, 'POST')).status, 200);
    } finally { global.fetch = previousFetch; }
    assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: analyticsRequest.id } })).purchaseCount, 1);
    assert.equal((await db.paymentAllocation.count({ where: { paymentId: analyticsIntent.payment.id } })), 1);

    const claimToken = crypto.randomBytes(32).toString('hex');
    await db.user.create({ data: { id: ids.invitee, tenantId: tenantA, email: `${ids.invitee}@example.test`, fullName: 'Invitee', role: 'guest', verificationToken: crypto.createHash('sha256').update(claimToken).digest('hex') } });
    await db.tenantMembership.create({ data: { tenantId: tenantA, userId: ids.invitee, roleId: roleA.id, status: 'invited' } });
    assert.equal((await call('/api/admin/invitations/claim', ids.invitee, 'POST', { token: claimToken, password: 'a-strong-test-password' })).status, 200);
    assert.equal((await call('/api/admin/me', ids.invitee)).status, 200);
    const login = await call('/api/auth/login', ids.invitee, 'POST', { email: `${ids.invitee}@example.test`, password: 'a-strong-test-password' });
    assert.equal(login.status, 200);
    const loginUser = (await login.json()).user;
    assert.equal('mfaSecret' in loginUser, false);
    assert.equal('mfaLastCounter' in loginUser, false);
    assert.equal('verificationToken' in loginUser, false);
    assert.equal('mfaFailureCount' in loginUser, false);
    for (let attempt = 0; attempt < 8; attempt++) assert.equal((await call('/api/auth/login', ids.a, 'POST', { email: `${ids.a}@example.test`, password: 'incorrect-password' })).status, 401);
    assert.equal((await call('/api/auth/login', ids.a, 'POST', { email: `${ids.a}@example.test`, password: 'incorrect-password' })).status, 429);
    assert.equal((await call('/api/auth/register', ids.a, 'POST', { email: 'bad', password: 'short', fullName: 'A' })).status, 400);
    for (let attempt = 0; attempt < 20; attempt++) assert.equal((await call('/api/auth/register', ids.a, 'POST', { email: `${ids.a}@example.test`, password: 'strong-test-password', fullName: 'Already Exists' })).status, 400);
    assert.equal((await call('/api/auth/register', ids.a, 'POST', { email: `${ids.a}@example.test`, password: 'strong-test-password', fullName: 'Already Exists' })).status, 429);

    process.env.ADMIN_MFA_REQUIRED = 'true';
    const mfaRequired = await call('/api/admin/me', ids.a);
    assert.equal(mfaRequired.status, 403);
    assert.equal((await mfaRequired.json()).code, 'MFA_SETUP_REQUIRED');
    const setup = await (await call('/api/admin/mfa/setup', ids.a, 'POST')).json();
    const counter = Math.floor(Date.now() / 30000);
    const enrolled = await call('/api/admin/mfa/confirm', ids.a, 'POST', { code: totp(setup.secret, counter) });
    assert.equal(enrolled.status, 200);
    const { recoveryCodes } = await enrolled.json();
    assert.equal(recoveryCodes.length, 8);
    assert.equal((await call('/api/admin/mfa/verify', ids.a, 'POST', { code: totp(setup.secret, counter) })).status, 401);
    const verified = await call('/api/admin/mfa/verify', ids.a, 'POST', { code: recoveryCodes[0] });
    assert.equal(verified.status, 200);
    const { adminSession } = await verified.json();
    assert.equal((await call('/api/admin/me', ids.a, 'GET', undefined, hostA, { 'X-Admin-Session': adminSession })).status, 200);
    assert.equal((await call('/api/admin/mfa/verify', ids.a, 'POST', { code: recoveryCodes[0] })).status, 401);
    for (let attempt = 0; attempt < 4; attempt++) assert.equal((await call('/api/admin/mfa/verify', ids.a, 'POST', { code: 'INVALID' })).status, 401);
    assert.equal((await call('/api/admin/mfa/verify', ids.a, 'POST', { code: 'INVALID' })).status, 429);
    await db.user.update({ where: { id: ids.a }, data: { sessionVersion: { increment: 1 } } });
    assert.equal((await call('/api/admin/me', ids.a, 'GET', undefined, hostA, { 'X-Admin-Session': adminSession })).status, 403);
    assert.equal((await call('/api/requests/available', ids.a)).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const tenantId of [tenantA, tenantB]) {
      await db.paymentEvent.deleteMany({ where: { tenantId } });
      await db.auditLog.deleteMany({ where: { tenantId } });
      await db.paymentAllocation.deleteMany({ where: { tenantId } });
      const files = await db.storedFile.findMany({ where: { tenantId } });
      await db.transferSubmission.deleteMany({ where: { payment: { tenantId } } });
      await db.storedFile.deleteMany({ where: { tenantId } });
      for (const file of files) await fs.unlink(path.join(__dirname, '..', 'private-proofs', file.storageKey)).catch(() => {});
      await db.payment.deleteMany({ where: { tenantId } });
      await db.leadPurchase.deleteMany({ where: { tenantId } });
      await db.serviceRequest.deleteMany({ where: { tenantId } });
      await db.review.deleteMany({ where: { tenantId } });
      await db.tenantMembership.deleteMany({ where: { tenantId } });
      await db.rolePermission.deleteMany({ where: { role: { tenantId } } });
      await db.adminRole.deleteMany({ where: { tenantId } });
      await db.professionalProfile.deleteMany({ where: { user: { tenantId } } });
      await db.user.deleteMany({ where: { tenantId } });
      await db.tenantDomain.deleteMany({ where: { tenantId } });
      await db.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    }
    await db.$disconnect();
    await appDb.$disconnect();
  }
});
