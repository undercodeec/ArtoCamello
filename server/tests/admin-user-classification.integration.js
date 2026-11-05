const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const suffix = crypto.randomUUID().replaceAll('-', '');
const tenantId = `classification-${suffix}`;
const hostname = `${tenantId}.example.test`;
process.env.ADMIN_HOSTNAMES = hostname;
const { app, prisma } = require('../dist/index.js');

test('admin lists clients, professionals and unclassified registrations separately', async () => {
  const ids = {
    admin: `admin-${suffix}`,
    client: `client-${suffix}`,
    pro: `pro-${suffix}`,
    guest: `guest-${suffix}`,
    guestPro: `guest-pro-${suffix}`,
    invited: `invited-${suffix}`,
  };
  const secret = process.env.JWT_SECRET || 'super-secret-jwt-key-change-me';
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, token, headers = {}, body) => new Promise((resolve, reject) => {
    const req = http.request(`${base}${route}`, { method: body ? 'POST' : 'GET', headers: {
      Host: hostname, Authorization: `Bearer ${token}`, ...headers,
    } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });

  try {
    await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: tenantId } });
    await prisma.tenantDomain.create({ data: { tenantId, hostname, isPrimary: true } });
    await prisma.user.createMany({ data: [
      { id: ids.admin, tenantId, email: `${ids.admin}@example.test`, fullName: 'Admin', role: 'pro', emailVerified: true },
      { id: ids.client, tenantId, email: `${ids.client}@example.test`, fullName: 'Client', role: 'client', emailVerified: true },
      { id: ids.pro, tenantId, email: `${ids.pro}@example.test`, fullName: 'Professional', role: 'pro', emailVerified: true },
      { id: ids.guest, tenantId, email: `${ids.guest}@example.test`, fullName: 'Unclassified', role: 'guest', emailVerified: true },
      { id: ids.guestPro, tenantId, email: `${ids.guestPro}@example.test`, fullName: 'Future professional', role: 'guest', emailVerified: true },
      { id: ids.invited, tenantId, email: `${ids.invited}@example.test`, fullName: 'Invited admin', role: 'guest', emailVerified: true },
    ] });
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code: 'users.read' } });
    const role = await prisma.adminRole.create({ data: {
      tenantId, code: 'test_reader', name: 'Test reader',
      permissions: { create: { permissionId: permission.id } },
    } });
    await prisma.tenantMembership.createMany({ data: [
      { tenantId, userId: ids.admin, roleId: role.id, status: 'active' },
      { tenantId, userId: ids.invited, roleId: role.id, status: 'invited' },
    ] });

    const adminToken = jwt.sign({ userId: ids.admin, sessionVersion: 0 }, secret, { audience: 'admin-session' });
    const emailSession = jwt.sign({ userId: ids.admin, tenantId, sessionVersion: 0 }, secret, { audience: 'admin-email' });
    const list = async roleFilter => {
      const response = await request(`/api/admin/users?role=${roleFilter}`, adminToken, { 'X-Admin-Email-Session': emailSession });
      assert.equal(response.status, 200, roleFilter);
      return JSON.parse(response.body).items.map(user => user.id);
    };

    assert.deepEqual(await list('client'), [ids.client]);
    assert.deepEqual(new Set(await list('guest')), new Set([ids.guest, ids.guestPro]));
    assert.deepEqual(new Set(await list('pro')), new Set([ids.admin, ids.pro]));

    const guestToken = jwt.sign({ userId: ids.guest, sessionVersion: 0 }, secret);
    const claim = await request('/api/auth/role', guestToken, { 'Content-Type': 'application/json' }, { role: 'client' });
    assert.equal(claim.status, 200);
    assert.deepEqual(await list('guest'), [ids.guestPro]);
    assert.deepEqual(new Set(await list('client')), new Set([ids.client, ids.guest]));

    const professionalToken = jwt.sign({ userId: ids.guestPro, sessionVersion: 0 }, secret);
    const professionalClaim = await request('/api/auth/role', professionalToken, { 'Content-Type': 'application/json' }, { role: 'pro' });
    assert.equal(professionalClaim.status, 200);
    assert.deepEqual(await list('guest'), []);
    assert.ok((await list('pro')).includes(ids.guestPro));
    const unfinishedProfile = await prisma.professionalProfile.findUniqueOrThrow({ where: { userId: ids.guestPro } });
    assert.equal(unfinishedProfile.verified, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.rolePermission.deleteMany({ where: { role: { tenantId } } });
    await prisma.adminRole.deleteMany({ where: { tenantId } });
    await prisma.clientProfile.deleteMany({ where: { user: { tenantId } } });
    await prisma.professionalProfile.deleteMany({ where: { user: { tenantId } } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenantDomain.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
});
