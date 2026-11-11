import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequestForm, toRequestPayload } from '../src/app/constants/requestForm.ts';

const valid = {
  categorySlug: 'fontaneria', title: 'Reparar lavabo', description: 'Pierde agua', city: 'Quito',
  location: 'Calle 1', urgency: 'medium', preferredDate: '', estimatedBudget: '45',
  contactName: 'Ana', contactEmail: 'ana@example.com', contactPhone: '0991234567',
};

test('publishing requires a positive budget and complete contact and location', () => {
  assert.equal(validateRequestForm(valid), null);
  assert.match(validateRequestForm({ ...valid, estimatedBudget: '0' }), /presupuesto/i);
  assert.match(validateRequestForm({ ...valid, city: '' }), /ciudad/i);
  assert.match(validateRequestForm({ ...valid, contactEmail: 'invalid' }), /correo/i);
});

test('marketplace payload keeps city separate from the private address', () => {
  assert.deepEqual(toRequestPayload(valid), {
    visibility: 'marketplace', categorySlug: 'fontaneria', title: 'Reparar lavabo', description: 'Pierde agua',
    city: 'Quito', location: 'Calle 1', urgency: 'medium', estimatedBudget: 45,
    contactName: 'Ana', contactEmail: 'ana@example.com', contactPhone: '0991234567',
  });
});
