const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.SMTP_USER = process.env.SMTP_USER || 'test@example.test';
process.env.SMTP_PASS = process.env.SMTP_PASS || 'test-password';
process.env.RECAPTCHA_SECRET_KEY = 'test-secret';
const sentMail = [];
let failMailDelivery = false;
const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({ sendMail: async message => {
  if (failMailDelivery) throw new Error('SMTP temporalmente no disponible');
  sentMail.push(message);
  return { accepted: [message.to] };
} });
const { app, prisma } = require('../dist/index.js');

test('registration requires email confirmation before issuing a session', async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const tenantId = `email-test-${suffix}`;
  const hostname = `${tenantId}.example.test`;
  const email = `client-${suffix}@example.test`;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (String(url) === 'https://www.google.com/recaptcha/api/siteverify') {
      return Response.json({ success: true, hostname, challenge_ts: new Date().toISOString() });
    }
    throw new Error(`Unexpected external request: ${url}`);
  };
  const call = (route, method, body, token) => new Promise((resolve, reject) => {
    const request = http.request(`${base}${route}`, {
      method,
      headers: { Host: hostname, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') }));
    });
    request.on('error', reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
  try {
    await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Test email verification' } });
    await prisma.tenantDomain.create({ data: { tenantId, hostname, isPrimary: true } });
    const registration = { email, password: 'strong-password-123', fullName: 'Cliente Prueba', captchaToken: 'valid', adultDeclaration: true, termsAccepted: true, termsVersion: '2026-11-25-borrador-2' };
    for (const invalid of [{ adultDeclaration: false }, { adultDeclaration: 'true' }, { termsAccepted: false }, { termsVersion: 'antigua' }]) {
      assert.equal((await call('/api/auth/register', 'POST', { ...registration, ...invalid })).status, 400);
      assert.equal(await prisma.user.count({ where: { email } }), 0);
    }
    const registered = await call('/api/auth/register', 'POST', registration);
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    assert.equal(registered.body.requiresVerification, true);
    assert.equal(registered.body.token, undefined);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(user.emailVerified, false);
    assert.equal(user.termsVersion, registration.termsVersion);
    assert.ok(user.termsAcceptedAt instanceof Date);
    assert.equal(sentMail.length, 1);
    assert.match(sentMail[0].text, /verificar-correo/);
    const verificationUrl = sentMail[0].text.match(/https?:\/\/\S+\/verificar-correo#token=[A-Za-z0-9_-]+/)?.[0];
    assert.ok(verificationUrl);
    const verificationToken = new URL(verificationUrl).hash.slice('#token='.length);
    failMailDelivery = true;
    const resend = await call('/api/auth/resend-verification', 'POST', { email });
    assert.equal(resend.status, 200, JSON.stringify(resend.body));
    assert.equal(await prisma.emailVerificationToken.count({ where: { userId: user.id } }), 1);
    failMailDelivery = false;
    const successfulResend = await call('/api/auth/resend-verification', 'POST', { email });
    assert.equal(successfulResend.status, 200, JSON.stringify(successfulResend.body));
    assert.equal(sentMail.length, 2);
    const resendVerificationUrl = sentMail[1].text.match(/https?:\/\/\S+\/verificar-correo#token=[A-Za-z0-9_-]+/)?.[0];
    assert.ok(resendVerificationUrl);
    const resendVerificationToken = new URL(resendVerificationUrl).hash.slice('#token='.length);
    const prematureLogin = await call('/api/auth/login', 'POST', { email, password: 'strong-password-123' });
    assert.equal(prematureLogin.status, 403);
    const unverifiedToken = jwt.sign({ userId: user.id, sessionVersion: user.sessionVersion }, process.env.JWT_SECRET || 'super-secret-jwt-key-change-me');
    const prematureProfile = await call('/api/auth/role', 'POST', { role: 'client', fullName: 'Cliente Prueba', phone: '0991234567' }, unverifiedToken);
    assert.equal(prematureProfile.status, 403);
    const confirmations = await Promise.all([
      call('/api/auth/verify-email', 'POST', { token: verificationToken }),
      call('/api/auth/verify-email', 'POST', { token: resendVerificationToken }),
    ]);
    assert.deepEqual(confirmations.map(result => result.status).sort(), [200, 400]);
    const confirmed = confirmations.find(result => result.status === 200);
    assert.ok(confirmed);
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.user.emailVerified, true);
    assert.ok(confirmed.body.token);
    assert.equal(await prisma.emailVerificationToken.count({ where: { userId: user.id } }), 0);
    const incompleteProfile = await call('/api/auth/role', 'POST', { role: 'client' }, confirmed.body.token);
    assert.equal(incompleteProfile.status, 400);
    const invalidPhone = await call('/api/auth/role', 'POST', { role: 'client', fullName: 'Ana Cliente', phone: 'abc' }, confirmed.body.token);
    assert.equal(invalidPhone.status, 400);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role, 'guest');
    assert.equal(await prisma.clientProfile.count({ where: { userId: user.id } }), 0);
    const completedProfile = await call('/api/auth/role', 'POST', { role: 'client', fullName: 'Ana Cliente', phone: '+593 99 123 4567' }, confirmed.body.token);
    assert.equal(completedProfile.status, 200, JSON.stringify(completedProfile.body));
    assert.equal(completedProfile.body.user.fullName, 'Ana Cliente');
    assert.equal(completedProfile.body.user.phone, '+593 99 123 4567');
    assert.ok(await prisma.clientProfile.findUnique({ where: { userId: user.id } }));
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role, 'client');
    const eraseIdentity = await call('/api/client/profile', 'PUT', { fullName: '', phone: '' }, completedProfile.body.token);
    assert.equal(eraseIdentity.status, 400);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).fullName, 'Ana Cliente');
    const replay = await call('/api/auth/verify-email', 'POST', { token: verificationToken });
    assert.equal(replay.status, 400);
    const login = await call('/api/auth/login', 'POST', { email, password: 'strong-password-123' });
    assert.equal(login.status, 200, JSON.stringify(login.body));
  } finally {
    failMailDelivery = false;
    global.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenantDomain.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
});
