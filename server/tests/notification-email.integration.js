const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.SMTP_USER = process.env.SMTP_USER || 'test@example.test';
process.env.SMTP_PASS = process.env.SMTP_PASS || 'test-password';
const sentMail = [];
const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({ sendMail: async message => { sentMail.push(message); return { accepted: [message.to] }; } });
const { app, prisma } = require('../dist/index.js');

test('notification email escapes user-controlled HTML', async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const tenantId = `notification-test-${suffix}`;
  const hostname = `${tenantId}.example.test`;
  const userId = `user-${suffix}`;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ userId, sessionVersion: 0 }, process.env.JWT_SECRET || 'super-secret-jwt-key-change-me');
  try {
    await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Test notification' } });
    await prisma.tenantDomain.create({ data: { tenantId, hostname, isPrimary: true } });
    await prisma.user.create({ data: { id: userId, tenantId, email: `${userId}@example.test`, fullName: '<b>Cliente</b>', role: 'client', emailVerified: true } });
    const post = payload => new Promise((resolve, reject) => {
      const request = http.request(`${base}/api/notifications/preferences`, {
        method: 'POST',
        headers: { Host: hostname, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
      });
      request.on('error', reject);
      request.write(JSON.stringify(payload));
      request.end();
    });
    const result = await post({ preference: 'emailQuotes', enabled: true, label: '<script>alert(1)</script>' });
    assert.equal(result.status, 200, result.body);
    assert.equal(sentMail.length, 1);
    assert.ok(!sentMail[0].html.includes('<script>'));
    assert.ok(!sentMail[0].html.includes('<b>Cliente</b>'));
    assert.match(sentMail[0].html, /&lt;script&gt;/);
    assert.match(sentMail[0].html, /&lt;b&gt;Cliente&lt;\/b&gt;/);
    const saved = await prisma.notificationPreference.findUniqueOrThrow({ where: { userId_key: { userId, key: 'emailQuotes' } } });
    assert.equal(saved.enabled, true);
    const read = await new Promise((resolve, reject) => {
      const request = http.request(`${base}/api/notifications/preferences`, { headers: { Host: hostname, Authorization: `Bearer ${token}` } }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
      });
      request.on('error', reject);
      request.end();
    });
    assert.equal(read.status, 200);
    assert.equal(read.body.emailQuotes, true);
    assert.equal(read.body.emailPromos, false);
    assert.equal((await post({ preference: 'notif-newsletter', enabled: true, label: 'Boletín' })).status, 400);
    const disabled = await post({ preference: 'emailQuotes', enabled: false, label: 'Presupuestos' });
    assert.equal(disabled.status, 200);
    assert.equal((await prisma.notificationPreference.findUniqueOrThrow({ where: { userId_key: { userId, key: 'emailQuotes' } } })).enabled, false);
    assert.equal(sentMail.length, 1, 'Disabling does not send a confirmation');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await prisma.notificationPreference.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenantDomain.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
});
