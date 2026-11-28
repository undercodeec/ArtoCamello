const { test } = require('node:test');
const assert = require('node:assert/strict');
const { coversRequestCity, canProfessionalAccessRequest } = require('../dist/requestPolicy.js');

test('marketplace city coverage is conservative when geography is ambiguous', () => {
  assert.equal(coversRequestCity('Quito', ['Quito']), true);
  assert.equal(coversRequestCity('Quito', ['Quito - Norte']), true);
  assert.equal(coversRequestCity('Quito', ['Guayaquil']), false);
  assert.equal(coversRequestCity('Quito', ['Guayaquil', 'Cuenca']), false);
  assert.equal(coversRequestCity('Quito', ['Guayaquil', 'Quito']), true);
  assert.equal(coversRequestCity('Quito', []), true);
  assert.equal(coversRequestCity('Ciudad sin catálogo', ['Guayaquil']), true);
  assert.equal(coversRequestCity('Quito, dirección privada', ['Guayaquil']), true);
  assert.equal(coversRequestCity('Quito', ['sector personalizado']), true);
});

test('direct request remains exclusive even if the target declared another city', () => {
  const request = { tenantId: 'tenant', categorySlug: 'fontaneria', city: 'Quito', visibility: 'direct', targetProfessionalUserId: 'target' };
  assert.equal(canProfessionalAccessRequest(request, 'target', ['fontaneria'], 'tenant', ['Guayaquil']), true);
  assert.equal(canProfessionalAccessRequest(request, 'another', ['fontaneria'], 'tenant', ['Quito']), false);
  assert.equal(canProfessionalAccessRequest({ ...request, visibility: 'marketplace' }, 'target', ['fontaneria'], 'tenant', ['Guayaquil']), false);
});
