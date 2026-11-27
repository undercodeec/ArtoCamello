const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publicCity, toProfessionalPreview } = require('../dist/requestPolicy.js');

test('public city recognizes major Ecuadorian cities by exact name only', () => {
  for (const city of ['Quevedo', 'Azogues', 'Daule', 'Sangolquí', 'Tena', 'Tulcán']) {
    assert.equal(publicCity(`  ${city.toLocaleUpperCase('es-EC')}  `), city);
  }
  assert.equal(publicCity('Quito'), 'Quito');
  for (const privateLocation of [
    'Calle Quito 123', 'Quevedo, calle privada 123', 'Quevedo - Norte',
    'Quito\nAv. Amazonas', 'Quito, Ecuador', 'Quito - Norte', 'Cumbayá',
    'Av. Sangolquí 45', 'Desconocida', '', null,
  ]) {
    assert.equal(publicCity(privateLocation), null, String(privateLocation));
  }
});

test('professional previews cannot expose unrecognized city strings or private request fields', () => {
  const request = {
    id: 'request-1', visibility: 'marketplace', city: 'Quevedo, calle privada 123',
    title: 'Trabajo en domicilio privado', description: 'Detalles privados',
    location: 'Calle privada 123', contactPhone: '0999999999', contactEmail: 'private@example.test',
    categorySlug: 'fontaneria', urgency: 'high', estimatedBudget: 100,
    purchaseCount: 0, status: 'matching', createdAt: new Date('2026-01-01'),
  };
  const preview = toProfessionalPreview(request, 6, 4);
  assert.equal(preview.city, null);
  assert.equal(preview.title, 'Servicio de fontaneria');
  for (const field of ['description', 'location', 'contactPhone', 'contactEmail']) {
    assert.equal(Object.hasOwn(preview, field), false);
  }
  assert.equal(toProfessionalPreview({ ...request, city: 'Quevedo' }, 6, 4).city, 'Quevedo');
});
