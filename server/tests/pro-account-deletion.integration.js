const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sentMail = [];
require('nodemailer').createTransport = () => ({ sendMail: async mail => { sentMail.push(mail); return { accepted: [mail.to] }; } });
const { app, prisma } = require('../dist/index.js');

test('professional closure requires password, blocks pending payments and preserves paid lead history', async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const tenantId = `pro-delete-${suffix}`;
  const hostname = `${tenantId}.example.test`;
  const proId = `pro-${suffix}`;
  const clientId = `client-${suffix}`;
  const password = 'strong-password-123';
  const token = jwt.sign({ userId: proId, sessionVersion: 0 }, process.env.JWT_SECRET || 'super-secret-jwt-key-change-me');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, method, body) => new Promise((resolve, reject) => {
    const encoded = body ? JSON.stringify(body) : '';
    const request = http.request(`${base}${path}`, { method, headers: { Host: hostname, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(encoded) } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    request.on('error', reject);
    request.end(encoded);
  });

  try {
    await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Pro closure test' } });
    await prisma.tenantDomain.create({ data: { tenantId, hostname, isPrimary: true } });
    await prisma.user.createMany({ data: [
      { id: proId, tenantId, email: `${proId}@example.test`, fullName: 'Profesional privado', phone: '0991111111', password: await bcrypt.hash(password, 10), role: 'pro', emailVerified: true },
      { id: clientId, tenantId, email: `${clientId}@example.test`, fullName: 'Cliente', role: 'client', emailVerified: true },
    ] });
    const pro = await prisma.professionalProfile.create({ data: { tenantId, userId: proId, businessName: 'Negocio privado', bio: 'Información privada', address: 'Dirección privada', documentId: 'documento privado', categories: ['fontaneria'], serviceZones: ['Quito'], portfolioImages: ['imagen privada'], verified: true } });
    const service = await prisma.serviceRequest.create({ data: { tenantId, clientId, categorySlug: 'fontaneria', visibility: 'direct', targetProfessionalUserId: proId, title: 'Servicio', description: 'Descripción', location: 'Calle', contactPhone: '0992222222', contactEmail: 'cliente@example.test', status: 'contact_limit_open' } });
    const unpaidService = await prisma.serviceRequest.create({ data: { tenantId, clientId, categorySlug: 'fontaneria', visibility: 'direct', targetProfessionalUserId: proId, title: 'Servicio nuevo', description: 'Descripción', location: 'Calle', contactPhone: '0992222222', contactEmail: 'cliente@example.test', status: 'contact_limit_open' } });
    const purchase = await prisma.leadPurchase.create({ data: { tenantId, professionalId: pro.id, requestId: service.id, costUSD: 5, status: 'paid' } });
    const payment = await prisma.payment.create({ data: { tenantId, payerUserId: proId, amount: '5', method: 'transfer', status: 'under_review', reference: `test-${suffix}` } });
    assert.equal((await call('/api/pro/account', 'DELETE', { password: 'incorrecta', confirmation: 'ELIMINAR' })).status, 401);
    assert.equal((await call('/api/pro/account', 'DELETE', { password, confirmation: 'ELIMINAR' })).status, 409);
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'allocated' } });
    const closed = await call('/api/pro/account', 'DELETE', { password, confirmation: 'ELIMINAR' });
    assert.equal(closed.status, 200, closed.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: proId } });
    const profile = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } });
    assert.equal(user.active, false);
    assert.equal(user.sessionVersion, 1);
    assert.equal(user.password, null);
    assert.equal(user.phone, null);
    assert.notEqual(user.email, `${proId}@example.test`);
    assert.equal(profile.verified, false);
    assert.equal(profile.documentId, null);
    assert.equal(profile.businessName, null);
    assert.deepEqual(profile.portfolioImages, []);
    assert.equal((await prisma.serviceRequest.findUniqueOrThrow({ where: { id: service.id } })).status, 'contact_limit_open');
    assert.equal((await prisma.serviceRequest.findUniqueOrThrow({ where: { id: unpaidService.id } })).status, 'cancelled');
    assert.equal((await prisma.leadPurchase.findUniqueOrThrow({ where: { id: purchase.id } })).status, 'paid');
    const publicProfiles = await call('/api/professionals', 'GET');
    assert.equal(publicProfiles.status, 200);
    assert.equal(JSON.parse(publicProfiles.body).some(item => item.id === proId), false);
    assert.equal((await call('/api/profile', 'GET')).status, 403);
    assert.equal(sentMail.length, 1);
    assert.equal(sentMail[0].to, `${proId}@example.test`);
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
