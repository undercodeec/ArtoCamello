const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sentMail = [];
require('nodemailer').createTransport = () => ({ sendMail: async mail => { sentMail.push(mail); return { accepted: [mail.to] }; } });
const { app, prisma } = require('../dist/index.js');

test('client deletion needs password, redacts requests and invalidates old sessions', async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const tenantId = `delete-test-${suffix}`;
  const hostname = `${tenantId}.example.test`;
  const clientId = `client-${suffix}`;
  const proId = `pro-${suffix}`;
  const email = `${clientId}@example.test`;
  const password = 'client-password-123';
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = id => jwt.sign({ userId: id, sessionVersion: 0 }, process.env.JWT_SECRET || 'super-secret-jwt-key-change-me');
  const call = (route, method, authToken, body) => new Promise((resolve, reject) => {
    const encodedBody = body ? JSON.stringify(body) : undefined;
    const request = http.request(`${base}${route}`, { method, headers: {
      Host: hostname, Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json',
      ...(encodedBody ? { 'Content-Length': Buffer.byteLength(encodedBody) } : {}),
    } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') }));
    });
    request.on('error', reject);
    if (encodedBody) request.write(encodedBody);
    request.end();
  });

  try {
    await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Deletion test' } });
    await prisma.tenantDomain.create({ data: { tenantId, hostname, isPrimary: true } });
    await prisma.user.createMany({ data: [
      { id: clientId, tenantId, email, fullName: 'Persona Privada', phone: '0991234567', password: await bcrypt.hash(password, 10), role: 'client', emailVerified: true },
      { id: proId, tenantId, email: `${proId}@example.test`, fullName: 'Profesional', role: 'pro', emailVerified: true },
    ] });
    await prisma.clientProfile.create({ data: { tenantId, userId: clientId, addresses: ['Direccion secreta'], preferredCategories: [] } });
    const pro = await prisma.professionalProfile.create({ data: { tenantId, userId: proId, bio: 'Prueba', categories: ['limpieza'], serviceZones: ['Quito'] } });
    const service = await prisma.serviceRequest.create({ data: {
      tenantId, clientId, visibility: 'marketplace', categorySlug: 'limpieza', title: 'Mi casa privada',
      description: 'Datos personales en la descripcion', location: 'Calle secreta', city: 'Quito',
      contactName: 'Persona Privada', contactPhone: '0991234567', contactEmail: email,
      status: 'quotes_received', purchaseCount: 1,
    } });
    await prisma.leadPurchase.create({ data: { tenantId, requestId: service.id, professionalId: pro.id, costUSD: 5, status: 'paid' } });
    const pending = await prisma.payment.create({ data: { tenantId, payerUserId: proId, amount: 5, method: 'transfer', status: 'under_review', reference: `pending-${suffix}`, metadata: { requestId: service.id } } });

    const professionalDeletion = await call('/api/client/account', 'DELETE', token(proId), { password, confirmation: 'ELIMINAR' });
    assert.equal(professionalDeletion.status, 403, JSON.stringify(professionalDeletion.body));
    assert.equal((await call('/api/client/account', 'DELETE', token(clientId), { password, confirmation: 'eliminar' })).status, 400);
    assert.equal((await call('/api/client/account', 'DELETE', token(clientId), { password: 'wrong', confirmation: 'ELIMINAR' })).status, 401);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: clientId } })).active, true);

    assert.equal((await call('/api/client/account', 'DELETE', token(clientId), { password, confirmation: 'ELIMINAR' })).status, 409);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: clientId } })).active, true);
    await prisma.payment.update({ where: { id: pending.id }, data: { status: 'rejected' } });
    const deleted = await call('/api/client/account', 'DELETE', token(clientId), { password, confirmation: 'ELIMINAR' });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    const closedUser = await prisma.user.findUniqueOrThrow({ where: { id: clientId } });
    assert.equal(closedUser.active, false);
    assert.equal(closedUser.password, null);
    assert.equal(closedUser.phone, null);
    assert.notEqual(closedUser.email, email);
    assert.equal(closedUser.sessionVersion, 1);
    assert.equal(await prisma.clientProfile.count({ where: { userId: clientId } }), 0);
    const closedService = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: service.id } });
    assert.equal(closedService.status, 'cancelled');
    assert.equal(closedService.contactEmail, '');
    assert.equal(closedService.contactPhone, '');
    assert.equal(closedService.description, '');
    assert.equal(closedService.location, '');
    assert.equal(await prisma.leadPurchase.count({ where: { requestId: service.id, status: 'paid' } }), 1);
    assert.equal((await call('/api/client/profile', 'GET', token(clientId))).status, 403);
    assert.equal(sentMail.length, 1);
    assert.equal(sentMail[0].to, email);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.leadPurchase.deleteMany({ where: { tenantId } });
    await prisma.serviceRequest.deleteMany({ where: { tenantId } });
    await prisma.professionalProfile.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenantDomain.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
});
