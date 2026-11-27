const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { app, prisma } = require('../dist/index.js');

test('public request discovery exposes only anonymized open marketplace requests', async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const tenantId = `public-requests-${suffix}`;
  const hostname = `${tenantId}.example.test`;
  const clientId = `client-${suffix}`;
  const professionalId = `professional-${suffix}`;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = () => new Promise((resolve, reject) => {
    const req = http.request(`${base}/api/requests/public`, { headers: { Host: hostname } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') }));
    });
    req.on('error', reject);
    req.end();
  });

  try {
    await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Public request test' } });
    await prisma.tenantDomain.create({ data: { tenantId, hostname, isPrimary: true } });
    await prisma.user.createMany({ data: [
      { id: clientId, tenantId, email: `${clientId}@example.test`, fullName: 'Cliente privado', role: 'client', emailVerified: true },
      { id: professionalId, tenantId, email: `${professionalId}@example.test`, fullName: 'Profesional privado', role: 'pro', emailVerified: true },
    ] });
    await prisma.professionalProfile.create({ data: { tenantId, userId: professionalId, bio: 'Perfil de prueba', categories: ['fontaneria'], serviceZones: ['Quito'] } });
    const publicRequest = await prisma.serviceRequest.create({ data: {
      tenantId, clientId, visibility: 'marketplace', categorySlug: 'fontaneria', title: 'Reparar fuga en mi casa',
      description: 'Mi domicilio y el detalle privado', city: 'Quito', location: 'Calle privada 123', urgency: 'high',
      contactName: 'Cliente privado', contactPhone: '+593999999999', contactEmail: `${clientId}@example.test`, estimatedBudget: 80, status: 'contact_limit_open',
    } });
    await prisma.serviceRequest.createMany({ data: [
      { tenantId, clientId, visibility: 'direct', targetProfessionalUserId: professionalId, categorySlug: 'fontaneria', title: 'Solo para un profesional', description: 'Privado', city: 'Quito', location: 'Calle privada', contactPhone: '0999999999', contactEmail: `${clientId}@example.test`, estimatedBudget: 50, status: 'contact_limit_open' },
      { tenantId, clientId, visibility: 'marketplace', categorySlug: 'fontaneria', title: 'Solicitud cancelada', description: 'No debe aparecer', city: 'Quito', location: 'Calle privada', contactPhone: '0999999999', contactEmail: `${clientId}@example.test`, estimatedBudget: 50, status: 'cancelled' },
    ] });
    const cityRequest = await prisma.serviceRequest.create({ data: {
      tenantId, clientId, visibility: 'marketplace', categorySlug: 'fontaneria', title: 'Título privado', description: 'Descripción privada',
      city: 'quevedo', location: 'Dirección privada 456', contactPhone: '0999999999', contactEmail: `${clientId}@example.test`, estimatedBudget: 75, status: 'matching',
    } });
    const addressRequest = await prisma.serviceRequest.create({ data: {
      tenantId, clientId, visibility: 'marketplace', categorySlug: 'fontaneria', title: 'Título privado', description: 'Descripción privada',
      city: 'Quevedo, calle privada 123', location: 'Dirección privada 789', contactPhone: '0999999999', contactEmail: `${clientId}@example.test`, estimatedBudget: 75, status: 'matching',
    } });

    const listed = await request();
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.equal(listed.body.length, 3);
    assert.deepEqual(listed.body.find(item => item.id === publicRequest.id), {
      id: publicRequest.id,
      categorySlug: 'fontaneria',
      title: 'Servicio de fontaneria',
      city: 'Quito',
      urgency: 'high',
      estimatedBudget: 80,
      createdAt: publicRequest.createdAt.toJSON(),
    });
    assert.equal(listed.body.find(item => item.id === cityRequest.id).city, 'Quevedo');
    assert.equal(listed.body.find(item => item.id === addressRequest.id).city, null);
    for (const item of listed.body) {
      for (const value of ['Descripción privada', 'Dirección privada', 'calle privada', '0999999999', `${clientId}@example.test`]) {
        assert.equal(JSON.stringify(item).includes(value), false, value);
      }
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    await prisma.serviceRequest.deleteMany({ where: { tenantId } });
    await prisma.professionalProfile.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenantDomain.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
});
