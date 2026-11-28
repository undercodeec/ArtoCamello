const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateBillingDetails } = require('../dist/billing.js');

test('billing details must be complete and bounded; SRI validity is not asserted', () => {
  const valid = { idType: 'ruc', idNumber: '1712345678001', legalName: ' Servicios ', address: ' Quito ', email: 'FACTURAS@EXAMPLE.TEST ', phone: '+593 99 123 4567' };
  assert.deepEqual(validateBillingDetails(valid), { ...valid, legalName: 'Servicios', address: 'Quito', email: 'facturas@example.test' });
  assert.equal(validateBillingDetails({ ...valid, idNumber: '123' }), null);
  assert.equal(validateBillingDetails({ ...valid, idType: 'cedula', idNumber: '1234567890' }).idType, 'cedula');
  assert.equal(validateBillingDetails({ ...valid, idType: 'pasaporte', idNumber: 'ABC123' }).idType, 'pasaporte');
  assert.equal(validateBillingDetails({ ...valid, email: 'invalid' }), null);
  assert.equal(validateBillingDetails({ ...valid, phone: '1' }), null);
  assert.equal(validateBillingDetails({ ...valid, legalName: '<'.repeat(200) }), null);
  assert.equal(validateBillingDetails({ ...valid, secret: 'extra' }), null);
});
