const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

process.env.SMTP_USER = 'test@example.test';
process.env.SMTP_PASS = 'test-only';
process.env.APP_BASE_URL = 'https://artocamello.example.test';
const sent = [];
let failMailDelivery = false;
let rejectMailDelivery = false;
const originalCreateTransport = nodemailer.createTransport;
nodemailer.createTransport = () => ({ sendMail: async message => { if (failMailDelivery) throw new Error('SMTP unavailable'); if (rejectMailDelivery) return { accepted: [], rejected: [message.to] }; sent.push(message); return { accepted: [message.to] }; } });
const { app, prisma } = require('../dist/index.js');
nodemailer.createTransport = originalCreateTransport;

function request(base, host, route, body, authorization) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${route}`, {
      method: body ? 'POST' : 'GET',
      headers: { Host: host, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('client recovery is tenant scoped, single use and invalidates previous sessions', async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const tenantA = `reset-a-${suffix}`;
  const tenantB = `reset-b-${suffix}`;
  const hostA = `reset-a-${suffix}.example.test`;
  const hostB = `reset-b-${suffix}.example.test`;
  const oldPassword = 'previous-password';
  const passwordHash = await bcrypt.hash(oldPassword, 10);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await prisma.tenant.createMany({ data: [{ id: tenantA, slug: tenantA, name: tenantA }, { id: tenantB, slug: tenantB, name: tenantB }] });
    await prisma.tenantDomain.createMany({ data: [{ hostname: hostA, tenantId: tenantA }, { hostname: hostB, tenantId: tenantB }] });
    const client = await prisma.user.create({ data: { tenantId: tenantA, email: `client-${suffix}@example.test`, fullName: 'Cliente', role: 'client', password: passwordHash, emailVerified: true } });
    const socialClient = await prisma.user.create({ data: { tenantId: tenantA, email: `social-${suffix}@example.test`, fullName: 'Cliente social', role: 'client', authProvider: 'google', password: null, emailVerified: true } });
    const pro = await prisma.user.create({ data: { tenantId: tenantA, email: `pro-${suffix}@example.test`, fullName: 'Profesional', role: 'pro', password: passwordHash, emailVerified: true } });
    const guest = await prisma.user.create({ data: { tenantId: tenantA, email: `guest-${suffix}@example.test`, fullName: 'Pendiente', role: 'guest', password: passwordHash, emailVerified: true } });
    const unverified = await prisma.user.create({ data: { tenantId: tenantA, email: `unverified-${suffix}@example.test`, fullName: 'Sin verificar', role: 'guest', password: passwordHash, emailVerified: false } });
    const oldSession = jwt.sign({ userId: client.id, role: 'client', sessionVersion: 0 }, process.env.JWT_SECRET || 'super-secret-jwt-key-change-me');

    const unknown = await request(base, hostA, '/api/auth/forgot-password', { email: `missing-${suffix}@example.test` });
    const professional = await request(base, hostA, '/api/auth/forgot-password', { email: pro.email });
    const unclassified = await request(base, hostA, '/api/auth/forgot-password', { email: guest.email });
    const clientRequest = await request(base, hostA, '/api/auth/forgot-password', { email: client.email.toUpperCase() });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.code, 'EMAIL_NOT_REGISTERED');
    assert.equal(professional.status, 200);
    assert.equal(unclassified.status, 200);
    assert.equal(clientRequest.status, 200);
    assert.equal(sent.length, 3);
    assert.deepEqual(sent.map(message => message.to), [pro.email, guest.email, client.email]);
    const proToken = new URLSearchParams(new URL(sent[0].text.match(/https:\/\/\S+/)[0]).hash.slice(1)).get('token');
    assert.equal((await request(base, hostA, '/api/auth/reset-password', { token: proToken, password: 'new-pro-password' })).status, 200);
    const pending = await request(base, hostA, '/api/auth/forgot-password', { email: unverified.email });
    assert.equal(pending.status, 409);
    assert.equal(pending.body.code, 'EMAIL_NOT_VERIFIED');
    const url = new URL(sent[2].text.match(/https:\/\/\S+/)[0]);
    assert.equal(url.pathname, '/recuperar-contrasena');
    const token = new URLSearchParams(url.hash.slice(1)).get('token');
    assert.match(token, /^[a-f0-9]{64}$/);
    const stored = await prisma.passwordResetToken.findUniqueOrThrow({ where: { userId: client.id } });
    assert.notEqual(stored.tokenHash, token);

    assert.equal((await request(base, hostB, '/api/auth/reset-password', { token, password: 'new-password-123' })).status, 400);
    assert.equal((await request(base, hostA, '/api/auth/reset-password', { token, password: 'short' })).status, 400);
    assert.equal((await request(base, hostA, '/api/auth/reset-password', { token, password: 'new-password-123' })).status, 200);
    assert.equal((await request(base, hostA, '/api/auth/reset-password', { token, password: 'another-password' })).status, 400);
    const changed = await prisma.user.findUniqueOrThrow({ where: { id: client.id } });
    assert.equal(await bcrypt.compare('new-password-123', changed.password), true);
    assert.equal(changed.sessionVersion, 1);
    assert.equal((await request(base, hostA, '/api/client/profile', undefined, oldSession)).status, 403);

    failMailDelivery = true;
    const failedSend = await request(base, hostA, '/api/auth/forgot-password', { email: socialClient.email });
    failMailDelivery = false;
    assert.equal(failedSend.status, 503);
    assert.equal(await prisma.passwordResetToken.count({ where: { userId: socialClient.id } }), 0);
    rejectMailDelivery = true;
    const rejectedSend = await request(base, hostA, '/api/auth/forgot-password', { email: socialClient.email });
    rejectMailDelivery = false;
    assert.equal(rejectedSend.status, 503);
    assert.equal(await prisma.passwordResetToken.count({ where: { userId: socialClient.id } }), 0);

    assert.equal((await request(base, hostA, '/api/auth/forgot-password', { email: socialClient.email })).status, 200);
    assert.equal(sent.length, 4);
    const socialUrl = new URL(sent[3].text.match(/https:\/\/\S+/)[0]);
    const socialToken = new URLSearchParams(socialUrl.hash.slice(1)).get('token');
    assert.equal((await request(base, hostA, '/api/auth/reset-password', { token: socialToken, password: 'social-password-123' })).status, 200);
    const recoveredSocial = await prisma.user.findUniqueOrThrow({ where: { id: socialClient.id } });
    assert.equal(recoveredSocial.authProvider, 'local');
    assert.equal(await bcrypt.compare('social-password-123', recoveredSocial.password), true);
    assert.equal(recoveredSocial.sessionVersion, 1);
  } finally {
    try {
      await prisma.user.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await prisma.tenantDomain.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    } finally {
      await new Promise(resolve => server.close(resolve));
      await prisma.$disconnect();
    }
  }
});
